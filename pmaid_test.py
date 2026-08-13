"""Dependency-free PMAID acceptance checks. Run: python pmaid_test.py"""

from html.parser import HTMLParser
from http.client import HTTPConnection
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import Request
from urllib.request import urlopen
import contextlib
import html
import io
import json
import re
import sqlite3
import subprocess
import sys

import config_validator


BASE = "http://localhost:8000/"
ROOT = Path(__file__).resolve().parent
_CACHE = {}
RESULTS = []


class Failed(Exception):
    def __init__(self, assertion, expected, actual):
        self.assertion = assertion
        self.expected = expected
        self.actual = actual


class Page(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.ids = set()
        self.tags = []
        self.scripts = []
        self.inline_scripts = []
        self.text = []
        self._script = None
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.append((tag, attrs))
        if attrs.get("id"):
            self.ids.add(attrs["id"])
        if tag == "script":
            if attrs.get("src"):
                self.scripts.append(attrs["src"])
                self._script = None
            else:
                self._script = []

    def handle_endtag(self, tag):
        if tag == "script" and self._script is not None:
            self.inline_scripts.append("".join(self._script))
            self._script = None

    def handle_data(self, data):
        self.text.append(data)
        if self._script is not None:
            self._script.append(data)


def fetch(path):
    url = urljoin(BASE, path.lstrip("/"))
    if url not in _CACHE:
        with urlopen(url, timeout=15) as response:
            body = response.read().decode("utf-8")
            _CACHE[url] = (response.status, body)
    return _CACHE[url]


def fetch_json(path):
    return json.loads(fetch(path)[1])


def api_request(method, path, value=None):
    data = None
    headers = {}
    if value is not None:
        data = json.dumps(value).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = Request(
        urljoin(BASE, path.lstrip("/")),
        data=data,
        headers=headers,
        method=method,
    )
    with urlopen(request, timeout=15) as response:
        status = response.status
        raw = response.read()
    if raw:
        return status, json.loads(raw.decode("utf-8"))
    return status, None


def raw_http_get(path):
    connection = HTTPConnection("127.0.0.1", 8000, timeout=15)
    try:
        connection.request("GET", path)
        response = connection.getresponse()
        status = response.status
        location = response.getheader("Location")
        response.read()
    finally:
        connection.close()
    return status, location


def page(path):
    status, source = fetch(path)
    check("HTTP status for " + path, 200, status)
    return Page(source), source


def check(assertion, expected, actual):
    if actual != expected:
        raise Failed(assertion, expected, actual)


def require(assertion, condition, actual=None):
    if not condition:
        raise Failed(assertion, True, condition if actual is None else actual)


def scripts_load(parsed):
    failures = []
    for src in parsed.scripts:
        try:
            status, body = fetch(src)
            if status != 200 or not body.strip():
                failures.append({"src": src, "status": status, "bytes": len(body)})
        except Exception as exc:
            failures.append({"src": src, "error": type(exc).__name__ + ": " + str(exc)})
    check("all referenced JavaScript resources load", [], failures)


def config():
    names = (
        "problem_types", "ai_patterns", "methodologies", "phases", "tasks",
        "roles", "risks", "gates", "rules", "guidance", "eu_ai_act", "ui",
    )
    return {name: fetch_json("/config/cache/" + name + ".json") for name in names}


def match_condition(actual, condition):
    if condition is None:
        return True
    if "in" in condition:
        if actual is None:
            return False
        values = actual if isinstance(actual, list) else [actual]
        return any(value in condition["in"] for value in values)
    if "not_in" in condition:
        if actual is None:
            return True
        values = actual if isinstance(actual, list) else [actual]
        return all(value not in condition["not_in"] for value in values)
    if "gte" in condition:
        return actual is not None and actual >= condition["gte"]
    return True


def evaluate(inputs, cfg):
    best_rule = None
    best_confidence = -1
    for rule in sorted(cfg["rules"]["rules"], key=lambda item: -item["priority"]):
        matched = True
        for key, condition in (rule.get("conditions") or {}).items():
            actual = inputs.get("problem_types", inputs.get("problem_type")) if key == "problem_type" else inputs.get(key)
            if not match_condition(actual, condition):
                matched = False
                break
        if matched:
            confidence = rule["output"]["confidence"]
            if confidence > best_confidence:
                best_rule = rule
                best_confidence = confidence
    if best_rule is None:
        return {
            "ai_type": "NO_MATCH",
            "confidence": 0,
            "message": "Your problem does not match any known pattern clearly enough to recommend an approach.",
            "questions": cfg["rules"]["no_match"]["questions"],
        }
    if best_confidence < 40:
        return {
            "ai_type": "NO_MATCH",
            "confidence": 0,
            "message": "Your problem does not match any known pattern clearly enough to recommend an approach.",
            "questions": cfg["rules"]["no_match"]["questions"],
        }
    output = dict(best_rule["output"])
    output["rule_id"] = best_rule["rule_id"]
    return output


def tier(inputs, cfg):
    tiers = cfg["eu_ai_act"]["tiers"]
    for tier_id in ("prohibited", "high_risk", "limited_risk"):
        for condition in tiers[tier_id].get("trigger_conditions", []):
            if all((inputs.get("eu_domain") if key == "domain" else inputs.get(key)) == value for key, value in condition.items()):
                result = dict(tiers[tier_id])
                result["tier_id"] = tier_id
                result["hard_stop"] = tier_id == "prohibited"
                return result
    result = dict(tiers["minimal_risk"])
    result["tier_id"] = "minimal_risk"
    result["hard_stop"] = False
    return result


def option_support(inputs, cfg):
    supported = {
        "problem_type": {item["id"] for item in cfg["problem_types"]["problem_types"]},
        "data_state": {item["id"] for item in cfg["ui"]["wizard"]["data_states"]},
        "domain": {item["id"] for item in cfg["eu_ai_act"]["domains"]},
    }
    return [key + "=" + inputs[key] for key in supported if key in inputs and inputs[key] not in supported[key]]


def wizard_actual(given, cfg):
    defaults = {
        "problem_type": "predict_outcome", "data_state": "clean_labelled",
        "pretrained_available": "no", "rule_complexity": "medium",
        "affects_people": "no", "domain": "none", "autonomy": "human_in_loop",
    }
    values = dict(defaults)
    values.update(given)
    unsupported = option_support(given, cfg)
    classification = tier({
        "affects_people": values["affects_people"],
        "eu_domain": values["domain"],
        "autonomy": values["autonomy"],
    }, cfg)
    recommendation = evaluate({
        "problem_types": [values["problem_type"]],
        "problem_type": values["problem_type"],
        "data_state": values["data_state"],
        "pretrained_available": values["pretrained_available"],
        "rule_complexity": values["rule_complexity"],
        "eu_tier": classification["tier_id"],
        "affects_people": values["affects_people"],
    }, cfg)
    verdict = "AI is recommended"
    if recommendation["ai_type"] == "NOT_AI":
        verdict = "AI is NOT recommended"
    if recommendation["ai_type"] == "NO_MATCH":
        verdict = "NO_MATCH"
    plain_prediction_copy = False
    if recommendation.get("rule_id") == "rule_supervised_prediction":
        expected_reasons = [
            "You need the system to predict a result or rank cases.",
            "You have past examples showing what happened, so a model can learn from them.",
        ]
        expected_warnings = [
            "Check that past examples cover the real cases you expect, are available when the prediction is made, and do not accidentally include the answer.",
        ]
        if recommendation.get("reasons") == expected_reasons:
            if recommendation.get("warnings") == expected_warnings:
                plain_prediction_copy = True
    return {
        "completion": not unsupported,
        "unsupported_inputs": unsupported,
        "verdict": verdict,
        "ai_type": recommendation["ai_type"],
        "confidence": recommendation.get("confidence"),
        "message": recommendation.get("message"),
        "question_count": len(recommendation.get("questions", [])),
        "eu_tier": classification["label"],
        "hard_stop": classification["hard_stop"],
        "plan_generated": not classification["hard_stop"] and bool(recommendation.get("suggested_phases")),
        "rule_id": recommendation.get("rule_id"),
        "churn_copy": "churn" in " ".join(
            recommendation.get("warnings", []) + recommendation.get("sub_recommendations", [])
        ).lower(),
        "plain_prediction_copy": plain_prediction_copy,
    }


def run(name, function):
    try:
        function()
        RESULTS.append({"name": name, "passed": True})
    except Failed as exc:
        RESULTS.append({
            "name": name, "passed": False, "assertion": exc.assertion,
            "expected": exc.expected, "actual": exc.actual,
        })
    except Exception as exc:
        RESULTS.append({
            "name": name, "passed": False, "assertion": "test completes without exception",
            "expected": "no exception", "actual": type(exc).__name__ + ": " + str(exc),
        })


CFG = config()


def test_splash():
    parsed, source = page("/pages/splash.html")
    warning = "DO NOT ENTER CONFIDENTIAL OR PERSONAL DATA"
    require("splash confidentiality warning is present", warning in source, "warning absent")
    branded_pages = [
        "/pages/config.html",
        "/pages/discovery.html",
        "/pages/export.html",
        "/pages/help.html",
        "/pages/index.html",
        "/pages/planner.html",
        "/pages/rules.html",
        "/pages/verdict.html",
        "/pages/visualizer.html",
    ]
    missing_brand_headers = []
    brand_markup = '<span class="brand-name">PM AI Aid™</span>'
    for path in branded_pages:
        page_source = fetch(path)[1]
        if brand_markup not in page_source:
            missing_brand_headers.append(path)
    branding_actual = {
        "missing_brand_headers": missing_brand_headers,
        "full_name": CFG["ui"]["app"]["full_name"],
        "splash_subtitle": CFG["ui"]["splash"]["subtitle"],
    }
    branding_expected = {
        "missing_brand_headers": [],
        "full_name": "PM AI Aid™",
        "splash_subtitle": "PM AI Aid™",
    }
    check("all PMAID headers include the full product name", branding_expected, branding_actual)


def test_root_redirect():
    root_status, root_location = raw_http_get("/")
    directory_status, directory_location = raw_http_get("/config/")
    actual = {
        "root_status": root_status,
        "root_location": root_location,
        "directory_status": directory_status,
        "directory_location": directory_location,
    }
    expected = {
        "root_status": 302,
        "root_location": "/pages/index.html",
        "directory_status": 404,
        "directory_location": None,
    }
    check("server root redirects to PMAID and directory indexes are disabled", expected, actual)


def test_splash_gate():
    splash, splash_source = page("/pages/splash.html")
    _, index_source = page("/pages/index.html")
    key = CFG["ui"]["samples"].get("splash_key")
    actual = {
        "key": key,
        "enter_initially_hidden": 'id="enter-btn" style="display:none;"' in splash_source,
        "checks_acknowledgement": "PrismStorage.has(key)" in splash_source,
        "saves_only_on_entry": "PrismStorage.save(key, true)" in splash_source,
        "index_redirects_without_ack": "if (!PrismStorage.has(splashKey))" in index_source,
    }
    check("entry is blocked until prism_splash_acknowledged is set", {
        "key": "prism_splash_acknowledged", "enter_initially_hidden": True,
        "checks_acknowledgement": True, "saves_only_on_entry": True,
        "index_redirects_without_ack": True,
    }, actual)
    scripts_load(splash)


def test_discovery():
    parsed, source = page("/pages/discovery.html")
    steps = sorted(int(attrs["data-step"]) for tag, attrs in parsed.tags if tag == "div" and "wizard-panel" in attrs.get("class", "").split())
    actual = {
        "steps": steps,
        "panel_builders": [number for number in range(1, 7) if 'getElementById("panel-' + str(number) + '")' in source],
        "edit_mode_requested": 'params.get("mode") === "edit"' in source,
        "loads_active_draft": "Wizard.loadDraft();" in source,
        "restores_saved_answers": "function restoreSavedAnswers()" in source,
        "stores_problem_prompt": 'Wizard.setField("problem_statement", ev.target.value);' in source,
        "restores_problem_prompt": "problemText.value = answers.problem_statement;" in source,
        "explains_missing_old_prompt": "This older project has no saved original prompt." in source,
        "preserves_project_id": 'Wizard.start("New Project");' in source,
        "modify_link_uses_edit_mode": "/pages/discovery.html?mode=edit" in fetch("/pages/verdict.html")[1],
        "edit_label": "Your saved answers are loaded below." in source,
    }
    expected = {
        "steps": [1, 2, 3, 4, 5, 6],
        "panel_builders": [1, 2, 3, 4, 5, 6],
        "edit_mode_requested": True,
        "loads_active_draft": True,
        "restores_saved_answers": True,
        "stores_problem_prompt": True,
        "restores_problem_prompt": True,
        "explains_missing_old_prompt": True,
        "preserves_project_id": True,
        "modify_link_uses_edit_mode": True,
        "edit_label": True,
    }
    check("all six discovery panels load and Modify restores the active project", expected, actual)
    scripts_load(parsed)


def test_wizard_ai_high_risk():
    # Config ids: clean_labelled (not clean_labeled), employment (recruitment use-case)
    actual = wizard_actual({
        "problem_type": "predict_outcome", "data_state": "clean_labelled",
        "affects_people": "yes", "domain": "employment",
    }, CFG)
    expected = {
        "completion": True,
        "verdict": "AI is recommended",
        "eu_tier": "High Risk",
        "rule_id": "rule_supervised_prediction",
        "churn_copy": False,
        "plain_prediction_copy": True,
    }
    projected = {key: actual[key] for key in expected}
    if projected != expected:
        raise Failed("wizard completes with requested values and returns AI recommended / High Risk", expected, actual)


def test_wizard_not_ai():
    # Config id: automate_process (not automate_manual_process)
    actual = wizard_actual({
        "problem_type": "automate_process", "data_state": "none",
        "rule_complexity": "low", "affects_people": "no", "domain": "none",
    }, CFG)
    expected = {"completion": True, "verdict": "AI is NOT recommended", "ai_type": "NOT_AI"}
    projected = {key: actual[key] for key in expected}
    if projected != expected:
        raise Failed("wizard completes with requested values and returns NOT_AI", expected, actual)


def test_wizard_prohibited():
    # law_enforcement is High Risk under master eu_ai_act.yaml; Prohibited uses social_scoring etc.
    actual = wizard_actual({"affects_people": "yes", "domain": "social_scoring"}, CFG)
    expected = {"eu_tier": "Prohibited", "hard_stop": True, "plan_generated": False}
    projected = {key: actual[key] for key in expected}
    if projected != expected:
        raise Failed("social_scoring is Prohibited, hard-stops, and generates no plan", expected, actual)


def test_wizard_no_match():
    actual = wizard_actual({
        "problem_type": "unknown", "data_state": "clean_labelled",
        "pretrained_available": "yes", "affects_people": "no", "domain": "none",
    }, CFG)
    verdict, verdict_source = page("/pages/verdict.html")
    wizard_source = fetch("/static/js/modules/wizard.js")[1]
    planner_source = fetch("/pages/planner.html")[1]
    actual["verdict_renderer"] = "function renderNoMatch(project)" in verdict_source
    actual["wizard_no_plan_guard"] = 'rec.ai_type === "NO_MATCH"' in wizard_source
    actual["planner_no_plan_guard"] = 'project.recommendations.ai_type !== "NO_MATCH"' in planner_source
    actual["handoff_hidden"] = "id='no-match-ai' hidden" in verdict_source
    actual["handoff_health_checks"] = verdict_source.count("LocalAI.check(config)")
    actual["handoff_completion_calls"] = verdict_source.count("LocalAI.complete(")
    actual["handoff_label"] = "AI-assisted — not a recommendation." in verdict_source
    expected = {
        "completion": True,
        "unsupported_inputs": [],
        "verdict": "NO_MATCH",
        "ai_type": "NO_MATCH",
        "confidence": 0,
        "message": "Your problem does not match any known pattern clearly enough to recommend an approach.",
        "question_count": 8,
        "eu_tier": "Minimal Risk",
        "hard_stop": False,
        "plan_generated": False,
        "rule_id": None,
        "churn_copy": False,
        "plain_prediction_copy": False,
        "verdict_renderer": True,
        "wizard_no_plan_guard": True,
        "planner_no_plan_guard": True,
        "handoff_hidden": True,
        "handoff_health_checks": 1,
        "handoff_completion_calls": 1,
        "handoff_label": True,
    }
    check("NO_MATCH has eight questions, no plan, and one conditional local-AI handoff", expected, actual)
    scripts_load(verdict)


def phase_refs():
    return {
        "default_tasks": {item["task_id"] for item in CFG["tasks"]["tasks"]},
        "default_gates": {item["gate_id"] for item in CFG["gates"]["gates"]},
        "default_roles": {item["role_id"] for item in CFG["roles"]["roles"]},
        "default_risks": {item["risk_id"] for item in CFG["risks"]["risks"]},
    }


def test_planner_phases():
    parsed, source = page("/pages/planner.html")
    canvas_source = fetch("/static/css/canvas.css")[1]
    sticky_summary = True
    if 'class="planner-summary"' not in source:
        sticky_summary = False
    if "position: sticky;" not in canvas_source:
        sticky_summary = False
    full_width_layout = True
    if 'class="container-wide planner-page"' not in source:
        full_width_layout = False
    if "max-width: none;" not in canvas_source:
        full_width_layout = False
    phases = CFG["phases"]["phases"]
    churn = evaluate({
        "problem_types": ["predict_outcome"], "data_state": "clean_labelled",
        "pretrained_available": "no", "rule_complexity": "medium", "eu_tier": "high_risk",
    }, CFG)
    actual = {
        "configured_phases": len(phases),
        "recommended_visible_phases": len([item for item in phases if item["phase_id"] in churn.get("suggested_phases", [])]),
        "planner_renders_flow": "FlowDiagram.render" in source,
        "sticky_summary": sticky_summary,
        "full_width_layout": full_width_layout,
    }
    check("planner exposes all eight phases for the full AI plan", {
        "configured_phases": 8,
        "recommended_visible_phases": 8,
        "planner_renders_flow": True,
        "sticky_summary": True,
        "full_width_layout": True,
    }, actual)
    scripts_load(parsed)


def test_phase_sections():
    refs = phase_refs()
    actual = {}
    for phase in CFG["phases"]["phases"]:
        section_state = {}
        for field, valid_ids in refs.items():
            values = phase.get(field, [])
            section_state[field.removeprefix("default_").title()] = bool(values) and all(value in valid_ids for value in values)
        actual[phase["phase_id"]] = section_state
    expected = {phase["phase_id"]: {"Tasks": True, "Gates": True, "Roles": True, "Risks": True} for phase in CFG["phases"]["phases"]}
    check("every phase has resolvable non-empty Tasks, Gates, Roles, and Risks", expected, actual)


def test_question_back():
    _, source = page("/pages/planner.html")
    actual = {
        "phase_count": len(CFG["phases"]["phases"]),
        "panel_adds_question_list": 'qb.className = "question-list"' in source,
        "filters_by_phase": "qs[i].phase_id === ph.phase_id" in source,
        "empty_state_is_rendered": "No open questions for this phase." in source,
    }
    check("every phase detail panel renders a question-back list", {
        "phase_count": 8, "panel_adds_question_list": True,
        "filters_by_phase": True, "empty_state_is_rendered": True,
    }, actual)


def test_visualizer():
    parsed, source = page("/pages/visualizer.html")
    timeline_source = fetch("/static/js/viz/timeline.js")[1]
    flow_source = fetch("/static/js/viz/flow-diagram.js")[1]
    heatmap_source = fetch("/static/js/viz/heatmap.js")[1]
    raci_source = fetch("/static/js/viz/raci-grid.js")[1]
    process_source = fetch("/static/js/modules/process-builder.js")[1]
    export_module_source = fetch("/static/js/modules/export.js")[1]
    calls = {
        "Flow": "FlowDiagram.render(panel, project" in source,
        "Timeline": "Timeline.render(panel, project" in source,
        "Heatmap": "Heatmap.render(panel, project" in source,
        "RACI": "RaciGrid.render(panel, project" in source,
    }
    labels = CFG["ui"]["labels"]
    larger_timeline_font = True
    if 'name.setAttribute("font-size", "14")' not in timeline_source:
        larger_timeline_font = False
    duration_source_shared = True
    if "ProcessBuilder.phaseDuration" not in timeline_source:
        duration_source_shared = False
    if "ProcessBuilder.phaseDuration" not in flow_source:
        duration_source_shared = False
    if "ProcessBuilder.phaseDuration" not in process_source:
        duration_source_shared = False
    risk_table_visible = True
    if 'layout.className = "heatmap-layout"' not in heatmap_source:
        risk_table_visible = False
    if 'table.className = "risk-summary-table"' not in heatmap_source:
        risk_table_visible = False
    raci_owners_configurable = True
    if 'ownerGrid.className = "raci-owner-grid"' not in raci_source:
        raci_owners_configurable = False
    if "project.raci.owners" not in raci_source:
        raci_owners_configurable = False
    if "project.raci.owners" not in export_module_source:
        raci_owners_configurable = False
    actual = {
        "tabs": [labels.get("view_flow"), labels.get("view_timeline"), labels.get("view_heatmap"), labels.get("view_raci")],
        "render_contracts": calls,
        "larger_timeline_font": larger_timeline_font,
        "timeline_drag_help": 'help.className = "timeline-help"' in timeline_source,
        "duration_source_shared": duration_source_shared,
        "risk_table_visible": risk_table_visible,
        "raci_owners_configurable": raci_owners_configurable,
    }
    check("all four visualizer tabs have labels and render contracts", {
        "tabs": ["Process Flow", "Timeline", "Risk Heat Map", "RACI Matrix"],
        "render_contracts": {"Flow": True, "Timeline": True, "Heatmap": True, "RACI": True},
        "larger_timeline_font": True,
        "timeline_drag_help": True,
        "duration_source_shared": True,
        "risk_table_visible": True,
        "raci_owners_configurable": True,
    }, actual)
    scripts_load(parsed)


def export_source():
    parsed, _ = page("/pages/export.html")
    scripts_load(parsed)
    return fetch("/static/js/modules/export.js")[1]


def test_charter_export():
    source = export_source()
    template = fetch("/templates/charter.html")[1]
    broken = re.findall(r"\{\{[^}]+\}\}|\$\{[^}]+\}|<%[^%]+%>", source + template)
    actual = {
        "charter_function": "charter: function (project, config)" in source,
        "printable_output": "ExportModule.openPrintable" in source,
        "broken_template_variables": broken,
    }
    check("charter export builder exists and contains no unresolved template variables", {
        "charter_function": True, "printable_output": True, "broken_template_variables": [],
    }, actual)


def test_other_exports():
    source = export_source()
    parsed, page_source = page("/pages/export.html")
    actual = {
        "risk_register": "riskRegister: function (project)" in source,
        "raci": "raci: function (project)" in source,
        "question_back": "questionBack: function (project)" in source,
        "four_export_actions": all(('id: "' + item + '"') in page_source for item in ("charter", "risk", "raci", "qb")),
        "required_helpers_loaded": all(src in parsed.scripts for src in (
            "/static/js/modules/risk-analyzer.js", "/static/js/viz/raci-grid.js", "/static/js/modules/export.js",
        )),
    }
    check("risk register, RACI, and question-back exports have callable builders and dependencies", {
        "risk_register": True, "raci": True, "question_back": True,
        "four_export_actions": True, "required_helpers_loaded": True,
    }, actual)


def test_config_page():
    parsed, source = page("/pages/config.html")
    editable = []
    for tag, attrs in parsed.tags:
        if tag in ("input", "textarea", "select"):
            editable.append((tag, attrs.get("id")))
        else:
            if "contenteditable" in attrs:
                editable.append((tag, attrs.get("id")))
    actual = {
        "has_editable_controls": len(editable) >= 1,
        "guided_rule_editor_link": 'href="/pages/rules.html"' in source,
        "no_raw_rule_json": 'id="rule-json"' not in source,
        "guided_editor_explained": "No JSON editing is required." in source,
        "browser_override_explained": "browser-local admin overrides" in source,
        "backup_scope_explained": "It does not include projects or change master YAML." in source,
        "loaded_groups_read_only": "These are names, not editable keys." in source,
        "collapsible_config_groups": source.count('class="config-section"') == 5,
        "native_config_details": source.count("<details") >= 5,
    }
    expected = {
        "has_editable_controls": True,
        "guided_rule_editor_link": True,
        "no_raw_rule_json": True,
        "guided_editor_explained": True,
        "browser_override_explained": True,
        "backup_scope_explained": True,
        "loaded_groups_read_only": True,
        "collapsible_config_groups": True,
        "native_config_details": True,
    }
    check("Config links to a guided rule editor and explains browser-only settings", expected, actual)
    scripts_load(parsed)


def test_exit_control():
    config_source = fetch("/static/js/core/config-manager.js")[1]
    server_source = (ROOT / "server.py").read_text(encoding="utf-8")
    actual = {
        "server_exit_route": 'path == "/api/exit"' in server_source,
        "stops_llama_listener": "stop_listener_processes(8080)" in server_source,
        "server_mode_control": "ConfigManager.showExitControl();" in config_source,
        "warning_confirmation": "Unsaved form changes will be lost." in config_source,
        "exit_icon": "exit-app-icon" in config_source,
    }
    expected = {
        "server_exit_route": True,
        "stops_llama_listener": True,
        "server_mode_control": True,
        "warning_confirmation": True,
        "exit_icon": True,
    }
    check("PMAID has a confirmed server exit control that stops local services", expected, actual)


def test_rule_editor():
    parsed, source = page("/pages/rules.html")
    script_source = fetch("/static/js/modules/rules-editor.js?v=20260810-1")[1]
    required_controls = [
        "rule-select",
        "rule-priority",
        "rule-ai-type",
        "rule-confidence",
        "rule-complexity",
        "rule-suggested-non-ai",
        "conditions-editor",
        "phases-options",
        "roles-options",
        "reasons-list",
        "warnings-list",
        "next-steps-list",
        "questions-list",
        "no-match-list",
        "save-rule",
        "restore-rules",
    ]
    missing_controls = []
    for control_id in required_controls:
        if control_id not in parsed.ids:
            missing_controls.append(control_id)
    condition_keys = [
        "problem_type",
        "data_state",
        "pretrained_available",
        "rule_complexity",
        "eu_tier",
    ]
    missing_conditions = []
    for condition_key in condition_keys:
        marker = 'key: "' + condition_key + '"'
        if marker not in script_source:
            missing_conditions.append(condition_key)
    actual = {
        "missing_controls": missing_controls,
        "missing_conditions": missing_conditions,
        "native_rule_inputs": "buildConditionEditors();" in script_source,
        "validated_save": "function validateNumber" in script_source,
        "browser_override_save": "ConfigManager.saveOrg(org);" in script_source,
        "master_restore": "delete org.rules;" in script_source,
        "unsaved_change_warning": 'window.addEventListener("beforeunload"' in script_source,
        "no_raw_json_control": 'id="rule-json"' not in source,
        "no_user_json_parse": 'JSON.parse(document.getElementById' not in script_source,
        "plain_logic_help": "All active rows must match." in source,
    }
    expected = {
        "missing_controls": [],
        "missing_conditions": [],
        "native_rule_inputs": True,
        "validated_save": True,
        "browser_override_save": True,
        "master_restore": True,
        "unsaved_change_warning": True,
        "no_raw_json_control": True,
        "no_user_json_parse": True,
        "plain_logic_help": True,
    }
    check("guided rule editor uses validated controls instead of editable JSON", expected, actual)
    scripts_load(parsed)


def test_help_page():
    parsed, source = page("/pages/help.html")
    faq_count = 0
    for tag, attrs in parsed.tags:
        if tag == "details":
            classes = attrs.get("class", "").split()
            if "faq-item" in classes:
                faq_count = faq_count + 1
    navigation_pages = [
        "/pages/config.html",
        "/pages/config-library.html",
        "/pages/discovery.html",
        "/pages/export.html",
        "/pages/index.html",
        "/pages/planner.html",
        "/pages/rules.html",
        "/pages/verdict.html",
        "/pages/visualizer.html",
    ]
    missing_help_links = []
    for path in navigation_pages:
        page_source = fetch(path)[1]
        if 'href="/pages/help.html"' not in page_source:
            missing_help_links.append(path)
    actual = {
        "title": "Help & FAQ" in " ".join(parsed.text),
        "quick_start": "Quick start" in source,
        "faq_count": faq_count,
        "missing_help_links": missing_help_links,
        "uses_native_details": "<details" in source,
        "sqlite_storage_help": "data/pmaid.db" in source,
        "browser_storage_help": "browser-only mode" in source and "localStorage" in source,
        "confidence_bands_help": all(value in source for value in (
            "below 40",
            "40–59",
            "60 or above",
            "Matched rule: [rule_id]",
        )),
        "mode_test_help": "python -m http.server 8001" in source,
        "project_icon_help": "trash icon" in source and "list scrolls" in source,
        "local_ai_help": all(value in source for value in (
            "health check is independent of server mode and browser-only mode",
            "hidden background process",
            "Saving them does not start or restart llama.cpp",
            "reload the page",
        )),
    }
    expected = {
        "title": True,
        "quick_start": True,
        "faq_count": 12,
        "missing_help_links": [],
        "uses_native_details": True,
        "sqlite_storage_help": True,
        "browser_storage_help": True,
        "confidence_bands_help": True,
        "mode_test_help": True,
        "project_icon_help": True,
        "local_ai_help": True,
    }
    check("Help and FAQ page is complete and linked from every app header", expected, actual)
    scripts_load(parsed)


def test_footer():
    page_paths = [
        "/pages/config.html",
        "/pages/config-library.html",
        "/pages/discovery.html",
        "/pages/export.html",
        "/pages/help.html",
        "/pages/index.html",
        "/pages/planner.html",
        "/pages/rules.html",
        "/pages/splash.html",
        "/pages/verdict.html",
        "/pages/visualizer.html",
    ]
    missing_footer_scripts = []
    for path in page_paths:
        page_source = fetch(path)[1]
        if '<script src="/static/js/core/footer.js?v=20260809-2"></script>' not in page_source:
            missing_footer_scripts.append(path)
    footer_source = fetch("/static/js/core/footer.js")[1]
    component_source = fetch("/static/css/components.css")[1]
    actual = {
        "missing_footer_scripts": missing_footer_scripts,
        "copyright": "&copy; Shuvro Basu, 2026. All Rights Reserved." in footer_source,
        "linkedin": "https://www.linkedin.com/in/shuvrobasu" in footer_source,
        "github": "https://github.com/shuvrobasu?tab=repositories" in footer_source,
        "website": "https://www.shuvrobasu.info" in footer_source,
        "three_icons": footer_source.count("<svg") == 3,
        "intrinsic_icon_sizes": footer_source.count("width='18' height='18'") == 3,
        "safe_external_links": footer_source.count("rel='noopener noreferrer'") == 3,
        "responsive_style": "@media (max-width: 700px)" in component_source,
    }
    expected = {
        "missing_footer_scripts": [],
        "copyright": True,
        "linkedin": True,
        "github": True,
        "website": True,
        "three_icons": True,
        "intrinsic_icon_sizes": True,
        "safe_external_links": True,
        "responsive_style": True,
    }
    check("every page has the shared copyright and social-link footer", expected, actual)


def test_samples():
    _, index_source = page("/pages/index.html")
    sample_source = fetch("/static/js/modules/samples.js")[1]
    component_source = fetch("/static/css/components.css")[1]
    delete_saved_projects = "StateManager.deleteById(id);" in index_source
    delete_confirmation = "This cannot be undone." in index_source
    samples_not_deletable = "if (samplesOnly === false)" in index_source
    aligned_home_cards = True
    if 'class="grid-2 home-grid"' not in index_source:
        aligned_home_cards = False
    if ".grid-2 > .card" not in component_source:
        aligned_home_cards = False
    if "margin-top: 0;" not in component_source:
        aligned_home_cards = False
    professional_home_hero = True
    if 'class="home-hero"' not in index_source:
        professional_home_hero = False
    if ".home-hero" not in component_source:
        professional_home_hero = False
    saved_projects_scroll = True
    if 'id="project-list" tabindex="0"' not in index_source:
        saved_projects_scroll = False
    if "#project-list" not in component_source:
        saved_projects_scroll = False
    if "max-height: 15.5rem;" not in component_source:
        saved_projects_scroll = False
    if "overflow-y: auto;" not in component_source:
        saved_projects_scroll = False
    compact_project_actions = True
    if "function setProjectIcon(button, label, iconName)" not in index_source:
        compact_project_actions = False
    if 'actions.className = "list-actions project-actions";' not in index_source:
        compact_project_actions = False
    if ".project-icon-btn" not in component_source:
        compact_project_actions = False
    if ".project-actions" not in component_source:
        compact_project_actions = False
    samples = [
        ("Customer churn prediction", {"problem_types": ["predict_outcome"], "data_state": "clean_labelled", "pretrained_available": "no", "rule_complexity": "medium"}, {"eu_domain": "essential_services", "affects_people": "yes", "autonomy": "assisted"}),
        ("Document extraction", {"problem_types": ["classify_content"], "data_state": "partial", "pretrained_available": "yes", "rule_complexity": "medium"}, {"eu_domain": "chatbot_interaction", "affects_people": "yes", "autonomy": "assisted"}),
        ("Process automation", {"problem_types": ["automate_process"], "data_state": "none", "pretrained_available": "no", "rule_complexity": "low"}, {"eu_domain": "internal_ops", "affects_people": "no", "autonomy": "human_in_loop"}),
    ]
    actual_samples = []
    for name, rule_inputs, eu_inputs in samples:
        classification = tier(eu_inputs, CFG)
        rule_inputs["eu_tier"] = classification["tier_id"]
        recommendation = evaluate(rule_inputs, CFG)
        actual_samples.append({"name": name, "eu_tier": classification["tier_id"], "ai_type": recommendation["ai_type"]})
    actual = {
        "checks_database_projects": "StateManager.listProjects()" in sample_source,
        "saved_to_sqlite": "StateManager.persistToList(projects[i])" in sample_source,
        "no_project_local_storage": 'PrismStorage.save("prism_projects"' not in sample_source,
        "seed_called_on_home": "Samples.seedIfNeeded(config)" in index_source,
        "delete_saved_projects": delete_saved_projects,
        "delete_confirmation": delete_confirmation,
        "samples_not_deletable": samples_not_deletable,
        "aligned_home_cards": aligned_home_cards,
        "professional_home_hero": professional_home_hero,
        "saved_projects_scroll": saved_projects_scroll,
        "compact_project_actions": compact_project_actions,
        "samples": actual_samples,
    }
    expected = {
        "checks_database_projects": True,
        "saved_to_sqlite": True,
        "no_project_local_storage": True,
        "seed_called_on_home": True,
        "delete_saved_projects": True,
        "delete_confirmation": True,
        "samples_not_deletable": True,
        "aligned_home_cards": True,
        "professional_home_hero": True,
        "saved_projects_scroll": True,
        "compact_project_actions": True,
        "samples": [
            {"name": "Customer churn prediction", "eu_tier": "high_risk", "ai_type": "supervised_classification"},
            {"name": "Document extraction", "eu_tier": "limited_risk", "ai_type": "document_extraction"},
            {"name": "Process automation", "eu_tier": "minimal_risk", "ai_type": "NOT_AI"},
        ],
    }
    check("first-run SQLite seeding creates the three expected sample projects", expected, actual)


def test_sqlite_project_store():
    project_id = "test_sqlite_contract"
    project = {
        "project_id": project_id,
        "project_name": "SQLite contract test",
        "phases": [],
        "raci": {},
        "risks": [],
        "created_at": "2026-08-09T00:00:00+00:00",
        "updated_at": "2026-08-09T00:00:00+00:00",
    }
    api_request("DELETE", "/api/projects/" + project_id)
    delete_status = None
    try:
        post_status, saved = api_request("POST", "/api/projects", project)
        get_status, projects = api_request("GET", "/api/projects")
        listed_name = None
        for item in projects:
            if item.get("project_id") == project_id:
                listed_name = item.get("project_name")
                break
        database_path = ROOT / "data" / "pmaid.db"
        with sqlite3.connect(database_path) as connection:
            row = connection.execute(
                "SELECT payload FROM projects WHERE project_id = ?",
                (project_id,),
            ).fetchone()
        database_name = None
        if row is not None:
            database_project = json.loads(row[0])
            database_name = database_project.get("project_name")
    finally:
        delete_status, _ = api_request("DELETE", "/api/projects/" + project_id)

    state_source = (ROOT / "static" / "js" / "core" / "state-manager.js").read_text(encoding="utf-8")
    sample_source = (ROOT / "static" / "js" / "modules" / "samples.js").read_text(encoding="utf-8")
    project_local_storage_writes = []
    source_pairs = [
        ("state-manager.js", state_source),
        ("samples.js", sample_source),
    ]
    for name, source in source_pairs:
        if 'PrismStorage.save("prism_projects"' in source:
            project_local_storage_writes.append(name)
        if 'PrismStorage.save("prism_active_project"' in source:
            project_local_storage_writes.append(name)

    actual = {
        "post_status": post_status,
        "post_name": saved.get("project_name"),
        "get_status": get_status,
        "listed_name": listed_name,
        "database_name": database_name,
        "delete_status": delete_status,
        "uses_project_api": 'StateManager.request("GET", "/api/projects")' in state_source,
        "active_id_uses_session_storage": 'sessionStorage.setItem("pmaid_active_project_id"' in state_source,
        "project_local_storage_writes": project_local_storage_writes,
    }
    expected = {
        "post_status": 200,
        "post_name": "SQLite contract test",
        "get_status": 200,
        "listed_name": "SQLite contract test",
        "database_name": "SQLite contract test",
        "delete_status": 204,
        "uses_project_api": True,
        "active_id_uses_session_storage": True,
        "project_local_storage_writes": [],
    }
    check("project CRUD round-trips through the local SQLite store", expected, actual)


def test_local_ai_layer():
    index_source = fetch("/pages/index.html")[1]
    discovery_source = fetch("/pages/discovery.html")[1]
    export_page_source = fetch("/pages/export.html")[1]
    planner_source = fetch("/pages/planner.html")[1]
    verdict_source = fetch("/pages/verdict.html")[1]
    config_page_source = fetch("/pages/config.html")[1]
    client_source = fetch("/static/js/modules/local-ai.js")[1]
    feature_sources = [
        discovery_source,
        export_page_source,
        planner_source,
    ]
    health_calls = 0
    for source in feature_sources:
        health_calls = health_calls + source.count("LocalAI.check(config)")
    feature_completion_sources = {
        "problem_intake": "LocalAI.complete(" in discovery_source,
        "sponsor_summary": "LocalAI.complete(" in export_page_source,
        "devils_advocate": "LocalAI.complete(" in planner_source,
    }
    admin_controls = [
        'id="local-ai-server-path"',
        'id="local-ai-model-path"',
        'id="save-local-ai"',
    ]
    admin_path_controls = True
    for control in admin_controls:
        if control not in config_page_source:
            admin_path_controls = False
    core_suggestion_calls = [
        'applyMultipleSuggestion("problem_types", suggestion.problem_types);',
        'applyMultipleSuggestion("success_definitions", suggestion.success_definitions);',
        'applySingleSuggestion("data_state", suggestion.data_state);',
        'applySingleSuggestion("affects_people", suggestion.affects_people);',
        'applySingleSuggestion("eu_domain", suggestion.eu_domain);',
        'applySingleSuggestion("autonomy", suggestion.autonomy);',
    ]
    core_suggestions_only = True
    for call in core_suggestion_calls:
        if call not in discovery_source:
            core_suggestions_only = False
    unsupported_suggestion_calls = [
        'applySingleSuggestion("pretrained_available"',
        'applySingleSuggestion("rule_complexity"',
        'applySingleSuggestion("ai_maturity"',
        'applySingleSuggestion("team_exists"',
        'applySingleSuggestion("infra"',
        'applySingleSuggestion("budget_shape"',
        'applySingleSuggestion("timeline_horizon"',
        'applySingleSuggestion("methodology"',
    ]
    for call in unsupported_suggestion_calls:
        if call in discovery_source:
            core_suggestions_only = False
    normalization_contract = [
        "suggestion.problem_type",
        "suggestion.success_definition",
        "Array.isArray(singleValue)",
    ]
    normalizes_model_shapes = True
    for contract in normalization_contract:
        if contract not in discovery_source:
            normalizes_model_shapes = False
    sponsor_summary_quality_gate = True
    if "function sponsorSummaryNeedsRewrite(content)" not in export_page_source:
        sponsor_summary_quality_gate = False
    if "function sponsorRewritePrompt(project, draft)" not in export_page_source:
        sponsor_summary_quality_gate = False
    if "Do not list phases, tasks, work packages" not in export_page_source:
        sponsor_summary_quality_gate = False
    if "requestSponsorSummary(project)" not in export_page_source:
        sponsor_summary_quality_gate = False
    sponsor_failure_retains_panel = True
    sponsor_start = export_page_source.find("function generateSponsorSummary(project)")
    sponsor_end = export_page_source.find("function copySponsorSummary()")
    sponsor_generation_source = export_page_source[sponsor_start:sponsor_end]
    if "feature.hidden" in sponsor_generation_source:
        sponsor_failure_retains_panel = False
    if "error.hidden = false;" not in sponsor_generation_source:
        sponsor_failure_retains_panel = False
    verdict_plain_language = True
    if CFG["ui"]["labels"]["because"] != "Why PMAID recommends this":
        verdict_plain_language = False
    verdict_phrases = [
        "This percentage shows how closely your answers match this recommendation.",
        "What to check before proceeding",
        "Recommended next steps",
    ]
    for phrase in verdict_phrases:
        if phrase not in verdict_source:
            verdict_plain_language = False
    actual = {
        "config": CFG["ui"]["local_ai"],
        "feature_completion_sources": feature_completion_sources,
        "health_calls": health_calls,
        "response_content": "response.content" in client_source,
        "mistral_prompt": 'return "[INST] " + prompt + " [/INST]";' in client_source,
        "intake_button": 'assistButton.id = "problem-assist-submit";' in discovery_source,
        "llama_request": all(value in client_source for value in (
            "n_predict: 256",
            "temperature: 0.3",
            'stop: ["\\n\\n"]',
        )),
        "three_hidden_features": all(value in "".join(feature_sources) for value in (
            'assist.id = "problem-assist"',
            "assist.hidden = true",
            'id="sponsor-summary-feature" hidden',
            'id="devils-advocate-actions" hidden',
        )),
        "labels": all(value in "".join(feature_sources) for value in (
            "AI suggested — confirm or edit",
            "AI-generated — review before sending.",
            "AI analysis — not a gate.",
        )),
        "no_ollama": "ollama" not in client_source.lower(),
        "admin_path_controls": admin_path_controls,
        "field_edit_clears_badge": "clearSuggestedLabelsForField(fieldKey);" in discovery_source,
        "core_suggestions_only": core_suggestions_only,
        "normalizes_model_shapes": normalizes_model_shapes,
        "intake_problem_focus": "Focus on what the system needs to compute or decide, not on the human process being replaced." in discovery_source,
        "automation_is_context": "Automation of a manual step is not a problem type — it is a delivery context." in discovery_source,
        "bank_scoring_rule": "prioritising bank customers for collections is predict_outcome" in discovery_source,
        "automation_context_guard": "suggestion = correctProblemSuggestion(problemText, suggestion);" in discovery_source,
        "collections_people_domain": all(value in discovery_source for value in (
            'suggestion.affects_people = "yes";',
            'suggestion.eu_domain = "other_people_decisions";',
            "function isCollectionsContactPrioritisation(problemText)",
        )),
        "autonomy_requires_evidence": "function correctAutonomyEvidence(problemText, suggestion)" in discovery_source,
        "label_values_normalized": "function normalizeSuggestionIds(suggestion)" in discovery_source,
        "success_requires_evidence": "function correctSuccessEvidence(problemText, suggestion)" in discovery_source,
        "clean_data_requires_evidence": "function correctCleanDataEvidence(problemText, suggestion)" in discovery_source,
        "suggestion_reminder": "AI suggestions are a starting point. Read all options before proceeding." in discovery_source,
        "people_impact_explained": "Human review is captured under Autonomy." in discovery_source,
        "home_sponsor_action": 'setProjectIcon(sponsorBtn, "Sponsor Summary for "' in index_source,
        "home_sponsor_selects_project": "StateManager.loadById(id);" in index_source,
        "home_sponsor_health_gate": all(value in index_source for value in (
            "var sponsorSummaryAvailable = false;",
            "LocalAI.check(config).then(function (available)",
            "if (sponsorSummaryAvailable)",
        )),
        "verdict_export_link": '<a href="/pages/export.html">Export</a>' in verdict_source,
        "legacy_prediction_copy_fixed": all(value in verdict_source for value in (
            "function displayRecommendation(recommendation)",
            'recommendation.rule_id === "rule_churn_supervised"',
            'recommendation.rule_id === "rule_supervised_prediction"',
            "Check that past examples cover the real cases you expect",
        )),
        "verdict_plain_language": verdict_plain_language,
        "internal_rule_path_hidden": "inspect config/master/rules.yaml" not in verdict_source,
        "sponsor_summary_quality_gate": sponsor_summary_quality_gate,
        "sponsor_failure_retains_panel": sponsor_failure_retains_panel,
        "disabled_summary_notice": all(value in export_page_source for value in (
            "Local AI is required for Sponsor Summary.",
            "If Local AI is disabled or llama.cpp is unavailable",
            "cannot generate a sponsor summary",
        )),
    }
    expected = {
        "config": {
            "enabled": True,
            "endpoint": "http://localhost:8080/completion",
            "model": "local",
            "timeout_seconds": 30,
            "server_path": "F:\\llama-cpp-new\\llama-server.exe",
            "model_path": "F:\\Mistral-7B-Instruct-v0.3-Q4_K_M.gguf",
        },
        "feature_completion_sources": {
            "problem_intake": True,
            "sponsor_summary": True,
            "devils_advocate": True,
        },
        "health_calls": 3,
        "response_content": True,
        "mistral_prompt": True,
        "intake_button": True,
        "llama_request": True,
        "three_hidden_features": True,
        "labels": True,
        "no_ollama": True,
        "admin_path_controls": True,
        "field_edit_clears_badge": True,
        "core_suggestions_only": True,
        "normalizes_model_shapes": True,
        "intake_problem_focus": True,
        "automation_is_context": True,
        "bank_scoring_rule": True,
        "automation_context_guard": True,
        "collections_people_domain": True,
        "autonomy_requires_evidence": True,
        "label_values_normalized": True,
        "success_requires_evidence": True,
        "clean_data_requires_evidence": True,
        "suggestion_reminder": True,
        "people_impact_explained": True,
        "home_sponsor_action": True,
        "home_sponsor_selects_project": True,
        "home_sponsor_health_gate": True,
        "verdict_export_link": True,
        "legacy_prediction_copy_fixed": True,
        "verdict_plain_language": True,
        "internal_rule_path_hidden": True,
        "sponsor_summary_quality_gate": True,
        "sponsor_failure_retains_panel": True,
        "disabled_summary_notice": True,
    }
    check("PMAID exposes exactly three graceful llama.cpp-assisted features", expected, actual)


def test_config_library_and_org_bundle():
    parsed, page_source = page("/pages/config-library.html")
    config_source = fetch("/pages/config.html")[1]
    editor_source = fetch("/static/js/modules/config-library-editor.js")[1]
    server_source = (ROOT / "server.py").read_text(encoding="utf-8")
    required_controls = [
        "library-type",
        "entry-select",
        "new-entry",
        "entry-form",
        "entry-fields",
        "save-entry",
        "delete-entry",
        "cancel-entry",
        "restore-library",
    ]
    missing_controls = []
    for control_id in required_controls:
        if control_id not in parsed.ids:
            missing_controls.append(control_id)
    bundle = fetch_json("/api/config/org")
    actual = {
        "missing_controls": missing_controls,
        "three_libraries": all(value in page_source for value in (
            '<option value="tasks">Tasks</option>',
            '<option value="roles">Roles</option>',
            '<option value="risks">Risks</option>',
        )),
        "task_fields": all(value in editor_source for value in (
            '"entry-phase"',
            '"entry-complexity"',
        )),
        "role_fields": all(value in editor_source for value in (
            '"entry-raci"',
            '"entry-phases"',
        )),
        "risk_fields": all(value in editor_source for value in (
            '"entry-category"',
            '"entry-likelihood"',
            '"entry-impact"',
        )),
        "crud_actions": all(value in editor_source for value in (
            "submit: function",
            "deleteEntry: function",
            "restoreMaster: function",
        )),
        "phase_references_synced": all(value in editor_source for value in (
            'field = "default_tasks"',
            'field = "default_roles"',
            'field = "default_risks"',
        )),
        "server_save": "ConfigManager.saveOrgBundle(orgConfig)" in editor_source,
        "config_links": all(value in config_source for value in (
            "/pages/config-library.html?type=tasks",
            "/pages/config-library.html?type=roles",
            "/pages/config-library.html?type=risks",
        )),
        "org_bundle_controls": all(value in config_source for value in (
            'id="export-org-bundle"',
            'id="import-org-bundle"',
            'id="import-org-bundle-btn"',
        )),
        "separate_browser_backup": all(value in config_source for value in (
            "Organisation configuration bundle",
            "Browser-only settings backup",
            "pmaid-organisation-config.json",
            "pmaid-browser-settings.json",
        )),
        "api_route": server_source.count('path == "/api/config/org"') == 2,
        "bundle_format": bundle.get("format"),
        "bundle_version": bundle.get("version"),
        "bundle_config_object": isinstance(bundle.get("config"), dict),
    }
    expected = {
        "missing_controls": [],
        "three_libraries": True,
        "task_fields": True,
        "role_fields": True,
        "risk_fields": True,
        "crud_actions": True,
        "phase_references_synced": True,
        "server_save": True,
        "config_links": True,
        "org_bundle_controls": True,
        "separate_browser_backup": True,
        "api_route": True,
        "bundle_format": "pmaid-org-config",
        "bundle_version": 1,
        "bundle_config_object": True,
    }
    check("guided libraries and the shared organisation bundle are complete", expected, actual)
    scripts_load(parsed)


def test_planning_registers():
    planner_source = fetch("/pages/planner.html")[1]
    builder_source = fetch("/static/js/modules/process-builder.js")[1]
    state_source = fetch("/static/js/core/state-manager.js")[1]
    export_source = fetch("/static/js/modules/export.js")[1]
    canvas_source = fetch("/static/css/canvas.css")[1]
    actual = {
        "state_fields": all(value in state_source for value in (
            "assumptions: []",
            "stakeholder_map: []",
        )),
        "default_assumptions": all(value in builder_source for value in (
            "buildAssumptions: function",
            'assumption_id: "assumption_problem_scope"',
            'assumption_id: "assumption_data_state"',
            'assumption_id: "assumption_regulatory_screen"',
        )),
        "assumption_crud": all(value in planner_source for value in (
            "Assumption register",
            "Add assumption",
            "Confirmation owner",
            "Confirmed",
            "Invalidated",
            "deleteAssumption",
        )),
        "stakeholder_map": all(value in planner_source for value in (
            "Stakeholder map — who needs to know what",
            "Named owner",
            "Information or decision needed",
            "project.stakeholder_map",
        )),
        "feeds_questions": all(value in builder_source for value in (
            'source: "stakeholder_map"',
            "refreshStakeholderQuestions: function",
            "project.question_back_list = ProcessBuilder.addStakeholderQuestions",
        )),
        "phase_toggle_refreshes_map": "ProcessBuilder.hydratePlanningRegisters(project, config);" in planner_source,
        "charter_exports_both": all(value in export_source for value in (
            "<h2>Assumption register</h2>",
            "<h2>Stakeholder map</h2>",
            "Named owner",
        )),
        "register_styles": all(value in canvas_source for value in (
            ".assumption-register",
            ".assumption-row",
            ".stakeholder-map-row",
        )),
    }
    expected = {
        "state_fields": True,
        "default_assumptions": True,
        "assumption_crud": True,
        "stakeholder_map": True,
        "feeds_questions": True,
        "phase_toggle_refreshes_map": True,
        "charter_exports_both": True,
        "register_styles": True,
    }
    check("assumptions and phase stakeholders are tracked separately and exported", expected, actual)


def test_not_ai_alternative_plan():
    plans = CFG["guidance"]["guidance"]["non_ai_plans"]
    expected_templates = [
        "rule_lookup_not_ai",
        "rule_automate_low_not_ai",
        "rule_no_data_not_ai",
        "default",
    ]
    invalid_templates = {}
    for template_id in expected_templates:
        template = plans.get(template_id)
        if isinstance(template, dict) is False:
            invalid_templates[template_id] = "missing"
            continue
        issues = []
        if isinstance(template.get("title"), str) is False:
            issues.append("title")
        if isinstance(template.get("outcome"), str) is False:
            issues.append("outcome")
        steps = template.get("steps")
        if isinstance(steps, list) is False:
            issues.append("steps")
        else:
            if len(steps) != 5:
                issues.append("five_steps")
        if len(issues) > 0:
            invalid_templates[template_id] = issues
    builder_source = fetch("/static/js/modules/process-builder.js")[1]
    wizard_source = fetch("/static/js/modules/wizard.js")[1]
    verdict_source = fetch("/pages/verdict.html")[1]
    planner_source = fetch("/pages/planner.html")[1]
    export_source = fetch("/static/js/modules/export.js")[1]
    actual = {
        "invalid_templates": invalid_templates,
        "wizard_builds_plan": "ProcessBuilder.buildNonAIPlan(Wizard.draft, config);" in wizard_source,
        "separate_plan_state": "project.non_ai_plan = {" in builder_source,
        "no_ai_phases": "project.phases = [];" in builder_source,
        "verdict_shows_plan": all(value in verdict_source for value in (
            "Suggested alternative",
            "Mini-plan",
            "Open alternative plan",
        )),
        "planner_tracks_steps": all(value in planner_source for value in (
            "renderNonAIPlan",
            "Alternative plan",
            "project.non_ai_plan.steps[s].status",
        )),
        "charter_exports_plan": all(value in export_source for value in (
            "Suggested alternative plan",
            "Mini-plan",
            "var nonAiSteps = project.non_ai_plan.steps",
        )),
    }
    expected = {
        "invalid_templates": {},
        "wizard_builds_plan": True,
        "separate_plan_state": True,
        "no_ai_phases": True,
        "verdict_shows_plan": True,
        "planner_tracks_steps": True,
        "charter_exports_plan": True,
    }
    check("NOT_AI produces a relevant, trackable alternative mini-plan", expected, actual)


def test_project_history_and_contributor_docs():
    state_source = fetch("/static/js/core/state-manager.js")[1]
    wizard_source = fetch("/static/js/modules/wizard.js")[1]
    verdict_source = fetch("/pages/verdict.html")[1]
    index_source = fetch("/pages/index.html")[1]
    contributing = (ROOT / "CONTRIBUTING.md").read_text(encoding="utf-8")
    changelog = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    changelog_lower = changelog.lower()
    actual = {
        "history_state": "version_history: []" in state_source,
        "baseline_and_rerun": all(value in wizard_source for value in (
            "Saved project baseline",
            "Initial discovery completed",
            "Discovery answers updated and verdict recalculated",
            "Verdict recalculated with no answer changes",
        )),
        "snapshot_fields": all(value in wizard_source for value in (
            "historySnapshot: function",
            "discovery_inputs:",
            "recommendation:",
            "eu_tier:",
        )),
        "history_rendered": all(value in verdict_source for value in (
            "function versionHistoryHtml(project)",
            "Version history",
            "changes[c].before",
            "changes[c].after",
        )),
        "history_visible_home": all(value in index_source for value in (
            "version_history",
            "· version ",
        )),
        "contributing_structure": all(value in contributing for value in (
            "# Contributing to PMAID",
            "## Configuration layers",
            "Tasks in `tasks.yaml`:",
            "Roles in `roles.yaml`:",
            "Risks in `risks.yaml`:",
            "python config_validator.py config",
            "python pmaid_test.py",
            "Confidence below 40",
            "browser-only mode",
        )),
        "changelog_structure": all(value in changelog_lower for value in (
            "# changelog",
            "## unreleased",
            "## 1.0.0 - 2026-08-10",
            "assumption register",
            "stakeholder map",
            "version history",
            "matched rule",
            "pmaid_test.py",
            "scrolling panel",
        )),
    }
    expected = {
        "history_state": True,
        "baseline_and_rerun": True,
        "snapshot_fields": True,
        "history_rendered": True,
        "history_visible_home": True,
        "contributing_structure": True,
        "changelog_structure": True,
    }
    check("wizard history and contributor documentation are complete", expected, actual)


def capture_rule_validation(data):
    output = io.StringIO()
    with contextlib.redirect_stdout(output):
        valid = config_validator.validate_rules(data)
    return valid, output.getvalue()


def validation_rule(rule_id, conditions, confidence, warnings, evidence):
    output = {
        "confidence": confidence,
    }
    if warnings is not None:
        output["warnings"] = warnings
    rule = {
        "rule_id": rule_id,
        "priority": 1,
        "conditions": conditions,
        "output": output,
    }
    if evidence is not None:
        rule["evidence"] = evidence
    return rule


def test_rule_hardening():
    master_path = ROOT / "config" / "master" / "rules.yaml"
    master_rules = config_validator.load_yaml_file(master_path)
    master_valid, master_output = capture_rule_validation(master_rules)

    one_condition = validation_rule(
        "rule_one_condition",
        {"problem_type": {"in": ["predict_outcome"]}},
        50,
        ["Review the result."],
        "Derived from a test case.",
    )
    one_valid, one_output = capture_rule_validation({"rules": [one_condition]})

    no_warning = validation_rule(
        "rule_no_warning",
        {
            "problem_type": {"in": ["predict_outcome"]},
            "data_state": {"in": ["clean_labelled"]},
        },
        80,
        [],
        "Derived from a test case.",
    )
    warning_valid, warning_output = capture_rule_validation({"rules": [no_warning]})

    shared_conditions = {
        "problem_type": {"in": ["predict_outcome"]},
        "data_state": {"in": ["clean_labelled"]},
    }
    duplicate_a = validation_rule(
        "rule_duplicate_a",
        shared_conditions,
        50,
        ["Review the result."],
        "Derived from a test case.",
    )
    duplicate_b = validation_rule(
        "rule_duplicate_b",
        shared_conditions,
        50,
        ["Review the result."],
        "Derived from another test case.",
    )
    duplicate_valid, duplicate_output = capture_rule_validation({
        "rules": [duplicate_a, duplicate_b]
    })

    no_evidence = validation_rule(
        "rule_no_evidence",
        {
            "problem_type": {"in": ["predict_outcome"]},
            "data_state": {"in": ["partial"]},
        },
        65,
        ["Review the result."],
        None,
    )
    evidence_valid, evidence_output = capture_rule_validation({"rules": [no_evidence]})

    invalid_master_rules = []
    missing_master_evidence = []
    for rule in master_rules["rules"]:
        conditions = rule.get("conditions")
        if isinstance(conditions, dict) is False:
            invalid_master_rules.append(rule.get("rule_id"))
        else:
            if len(conditions) < 2:
                invalid_master_rules.append(rule.get("rule_id"))
        evidence = rule.get("evidence")
        if isinstance(evidence, str) is False:
            missing_master_evidence.append(rule.get("rule_id"))
        else:
            if evidence.strip() == "":
                missing_master_evidence.append(rule.get("rule_id"))

    actual = {
        "master_valid": master_valid,
        "master_warnings": master_output.strip(),
        "invalid_master_rules": invalid_master_rules,
        "missing_master_evidence": missing_master_evidence,
        "one_condition_rejected": one_valid is False,
        "one_condition_warning": "rule_one_condition has fewer than 2 conditions" in one_output,
        "missing_warnings_rejected": warning_valid is False,
        "missing_warnings_warning": "rule_no_warning has confidence above 70 but no warnings" in warning_output,
        "duplicate_continues": duplicate_valid,
        "duplicate_ids_logged": "rule_duplicate_a and rule_duplicate_b" in duplicate_output,
        "missing_evidence_continues": evidence_valid,
        "missing_evidence_warning": "rule_no_evidence has confidence above 60 but no evidence" in evidence_output,
    }
    expected = {
        "master_valid": True,
        "master_warnings": "",
        "invalid_master_rules": [],
        "missing_master_evidence": [],
        "one_condition_rejected": True,
        "one_condition_warning": True,
        "missing_warnings_rejected": True,
        "missing_warnings_warning": True,
        "duplicate_continues": True,
        "duplicate_ids_logged": True,
        "missing_evidence_continues": True,
        "missing_evidence_warning": True,
    }
    check("rule validation rejects unsafe rules and warns on review metadata", expected, actual)


def test_confidence_and_browser_modes():
    rule_source = fetch("/static/js/modules/rule-engine.js")[1]
    verdict_source = fetch("/pages/verdict.html")[1]
    config_source = fetch("/static/js/core/config-manager.js")[1]
    state_source = fetch("/static/js/core/state-manager.js")[1]
    component_source = fetch("/static/css/components.css")[1]
    server_source = (ROOT / "server.py").read_text(encoding="utf-8")
    banner_text = "Running in browser-only mode. Projects are saved in this browser only and will be lost if browser data is cleared. Start server.py for persistent storage."
    page_names = [
        "config-library.html",
        "config.html",
        "discovery.html",
        "export.html",
        "help.html",
        "index.html",
        "planner.html",
        "rules.html",
        "splash.html",
        "verdict.html",
        "visualizer.html",
    ]
    pages_without_mode_detection = []
    for page_name in page_names:
        page_source = (ROOT / "pages" / page_name).read_text(encoding="utf-8")
        if "/static/js/core/config-manager.js" not in page_source:
            pages_without_mode_detection.append(page_name)

    missing_cache_files = []
    for name in config_validator.REQUIRED_FILES:
        cache_name = name.replace(".yaml", ".json")
        cache_path = ROOT / "config" / "cache" / cache_name
        if cache_path.is_file() is False:
            missing_cache_files.append(cache_name)

    build_position = server_source.find("ok = build_config_cache()")
    serve_position = server_source.find('if "--serve" in sys.argv[1:]')
    build_before_serve = False
    if build_position >= 0:
        if serve_position >= 0:
            if build_position < serve_position:
                build_before_serve = True

    actual = {
        "hard_threshold_40": "if (bestConfidence < 40)" in rule_source,
        "soft_band_recorded": "confidence_band = \"limited_signal\"" in rule_source,
        "limited_signal_banner": "This recommendation is based on limited signal. Treat it as a starting point, not a conclusion." in verdict_source,
        "matched_rule_visible": "Matched rule: <code>" in verdict_source,
        "mode_timeout": "}, 2000);" in config_source,
        "mode_values": 'window.PMAID_MODE = "server"' in config_source,
        "browser_value": 'window.PMAID_MODE = "browser"' in config_source,
        "banner_text": banner_text in config_source,
        "banner_style": ".browser-mode-banner" in component_source,
        "browser_project_key": "pmaid_browser_projects" in state_source,
        "browser_project_save": "StateManager.saveBrowserProjects();" in state_source,
        "mode_wait_before_projects": "ConfigManager.whenModeReady()" in state_source,
        "all_pages_detect_mode": pages_without_mode_detection,
        "missing_cache_files": missing_cache_files,
        "cache_current": config_validator.cache_is_current(ROOT / "config"),
        "build_before_serve": build_before_serve,
    }
    expected = {
        "hard_threshold_40": True,
        "soft_band_recorded": True,
        "limited_signal_banner": True,
        "matched_rule_visible": True,
        "mode_timeout": True,
        "mode_values": True,
        "browser_value": True,
        "banner_text": True,
        "banner_style": True,
        "browser_project_key": True,
        "browser_project_save": True,
        "mode_wait_before_projects": True,
        "all_pages_detect_mode": [],
        "missing_cache_files": [],
        "cache_current": True,
        "build_before_serve": True,
    }
    check("confidence bands and browser-only persistence are wired across PMAID", expected, actual)


def test_python_rules():
    completed = subprocess.run(
        [sys.executable, "test_rules.py"], cwd=ROOT, capture_output=True,
        text=True, encoding="utf-8", timeout=30,
    )
    lines = completed.stdout.splitlines()
    scenario_count = sum(line.startswith("OK rule_") for line in lines)
    actual = {"exit_code": completed.returncode, "scenario_passes": scenario_count}
    if completed.returncode != 0 or scenario_count != 10:
        actual["stdout"] = completed.stdout.strip()
        actual["stderr"] = completed.stderr.strip()
    check("python test_rules.py exits successfully with 10 passing rule scenarios", {"exit_code": 0, "scenario_passes": 10}, actual)


TESTS = [
    ("splash.html loads and contains the confidentiality warning text", test_splash),
    ("server root redirects to PMAID without exposing directory listings", test_root_redirect),
    ("prism_splash_acknowledged blocks entry before acknowledgement", test_splash_gate),
    ("discovery.html loads all 6 wizard steps without JS resource errors", test_discovery),
    ("wizard: predict_outcome / clean_labelled / employment => AI recommended, High Risk", test_wizard_ai_high_risk),
    ("wizard: automate_process / low complexity => NOT_AI", test_wizard_not_ai),
    ("wizard: social_scoring => Prohibited hard stop and no plan", test_wizard_prohibited),
    ("wizard: low-confidence inputs => NO_MATCH, questions, no plan, conditional AI handoff", test_wizard_no_match),
    ("planner.html loads with 8 phases visible", test_planner_phases),
    ("all 8 phases have populated Tasks, Gates, Roles, and Risks", test_phase_sections),
    ("question-back list exists on every phase panel", test_question_back),
    ("visualizer.html loads Flow, Timeline, Heatmap, and RACI render contracts", test_visualizer),
    ("export.html generates charter HTML without broken template variables", test_charter_export),
    ("export.html generates risk register, RACI, and question-back list", test_other_exports),
    ("config.html links to a guided decision rule editor", test_config_page),
    ("PMAID provides a confirmed exit control for server mode", test_exit_control),
    ("rules.html edits decision rules without raw JSON", test_rule_editor),
    ("tasks, roles, and risks have guided CRUD backed by an organisation bundle", test_config_library_and_org_bundle),
    ("planner tracks assumptions and phase stakeholders separately", test_planning_registers),
    ("NOT_AI verdicts produce an alternative mini-plan", test_not_ai_alternative_plan),
    ("projects keep wizard version history and contributor docs exist", test_project_history_and_contributor_docs),
    ("rule validator enforces hard failures and review warnings", test_rule_hardening),
    ("confidence bands and browser-only mode are wired across every page", test_confidence_and_browser_modes),
    ("help.html provides quick-start guidance and 12 native FAQ disclosures", test_help_page),
    ("every page displays the copyright and social-link footer", test_footer),
    ("three sample projects seed on first run with expected classifications", test_samples),
    ("project CRUD uses the local SQLite database", test_sqlite_project_store),
    ("PMAID has exactly three graceful llama.cpp-assisted features", test_local_ai_layer),
    ("python test_rules.py passes all 10 scenarios", test_python_rules),
]


for test_name, test_function in TESTS:
    run(test_name, test_function)

for result in RESULTS:
    print(("PASS" if result["passed"] else "FAIL") + " | " + result["name"])
    if not result["passed"]:
        print("  Assertion: " + result["assertion"])
        print("  Expected: " + json.dumps(result["expected"], ensure_ascii=False, sort_keys=True))
        print("  Actual:   " + json.dumps(result["actual"], ensure_ascii=False, sort_keys=True))

passed = sum(result["passed"] for result in RESULTS)
failed = len(RESULTS) - passed
print("SUMMARY | " + str(passed) + " passed, " + str(failed) + " failed, " + str(len(RESULTS)) + " total")
raise SystemExit(1 if failed else 0)
