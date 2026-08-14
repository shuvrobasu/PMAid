"""Validate PMAID master YAML configs at startup. Minimal YAML subset parser."""

import os
import sys
import json


REQUIRED_FILES = [
    "problem_types.yaml",
    "ai_patterns.yaml",
    "methodologies.yaml",
    "phases.yaml",
    "tasks.yaml",
    "roles.yaml",
    "risks.yaml",
    "gates.yaml",
    "rules.yaml",
    "guidance.yaml",
    "eu_ai_act.yaml",
    "ui.yaml",
]


def parse_scalar(text):
    value = text.strip()
    if len(value) >= 2:
        first = value[0]
        last = value[-1]
        if first == '"' and last == '"':
            return value[1:-1]
        if first == "'" and last == "'":
            return value[1:-1]
    if value == "[]":
        return []
    if value == "{}":
        return {}
    if value == "true":
        return True
    if value == "false":
        return False
    if value == "null" or value == "~":
        return None
    if value == "":
        return None
    negative = False
    digits = value
    if value[0] == "-" and len(value) > 1:
        negative = True
        digits = value[1:]
    if digits.isdigit():
        number = int(digits)
        if negative:
            return 0 - number
        return number
    if "." in digits:
        only = True
        for ch in digits:
            if ch == ".":
                continue
            if ch.isdigit():
                continue
            only = False
            break
        if only:
            try:
                return float(value)
            except ValueError:
                pass
    return value


def indent_of(line):
    count = 0
    for ch in line:
        if ch == " ":
            count = count + 1
        else:
            break
    return count


def parse_yaml(text):
    raw_lines = text.splitlines()
    lines = []
    for raw in raw_lines:
        stripped = raw.strip()
        if stripped == "":
            continue
        if stripped.startswith("#"):
            continue
        lines.append(raw.rstrip())
    if len(lines) == 0:
        return {}

    def parse_block(start, base_indent):
        # returns (value, next_index)
        i = start
        if i >= len(lines):
            return ({}, i)
        first = lines[i]
        first_ind = indent_of(first)
        if first_ind < base_indent:
            return ({}, i)
        content = first.strip()
        if content.startswith("- "):
            result = []
            while i < len(lines):
                line = lines[i]
                ind = indent_of(line)
                if ind < first_ind:
                    break
                if ind > first_ind:
                    print("Unexpected indent in list at line")
                    return (None, i)
                body = line.strip()
                if not body.startswith("- "):
                    break
                item_text = body[2:]
                if ":" in item_text:
                    key = item_text.split(":", 1)[0].strip()
                    val = item_text.split(":", 1)[1].strip()
                    obj = {}
                    if val == "" or val is None:
                        child_val, ni = parse_block(i + 1, ind + 1)
                        if child_val is None:
                            return (None, ni)
                        obj[key] = child_val
                        i = ni
                    else:
                        obj[key] = parse_scalar(val)
                        i = i + 1
                    while i < len(lines):
                        nline = lines[i]
                        nind = indent_of(nline)
                        if nind <= ind:
                            break
                        nbody = nline.strip()
                        if nbody.startswith("- "):
                            break
                        if ":" not in nbody:
                            break
                        nk = nbody.split(":", 1)[0].strip()
                        nv = nbody.split(":", 1)[1].strip()
                        if nv == "":
                            child_val, ni = parse_block(i + 1, nind + 1)
                            if child_val is None:
                                return (None, ni)
                            obj[nk] = child_val
                            i = ni
                        else:
                            obj[nk] = parse_scalar(nv)
                            i = i + 1
                    result.append(obj)
                else:
                    result.append(parse_scalar(item_text))
                    i = i + 1
            return (result, i)
        result = {}
        while i < len(lines):
            line = lines[i]
            ind = indent_of(line)
            if ind < first_ind:
                break
            if ind > first_ind:
                print("Unexpected indent in map")
                return (None, i)
            body = line.strip()
            if body.startswith("- "):
                break
            if ":" not in body:
                print("Expected key: value")
                return (None, i)
            key = body.split(":", 1)[0].strip()
            val = body.split(":", 1)[1].strip()
            if val == "":
                child_val, ni = parse_block(i + 1, ind + 1)
                if child_val is None:
                    return (None, ni)
                result[key] = child_val
                i = ni
            else:
                result[key] = parse_scalar(val)
                i = i + 1
        return (result, i)

    value, next_i = parse_block(0, 0)
    return value


def load_yaml_file(path):
    with open(path, "r", encoding="utf-8") as handle:
        text = handle.read()
    return parse_yaml(text)


def condition_sort_key(value):
    return json.dumps(value, sort_keys=True)


def normalize_condition_value(value):
    if isinstance(value, dict):
        normalized = {}
        keys = sorted(value.keys())
        for key in keys:
            normalized[key] = normalize_condition_value(value[key])
        return normalized
    if isinstance(value, list):
        normalized_items = []
        for item in value:
            normalized_items.append(normalize_condition_value(item))
        normalized_items.sort(key=condition_sort_key)
        return normalized_items
    return value


def condition_signature(conditions):
    normalized = normalize_condition_value(conditions)
    return json.dumps(normalized, sort_keys=True, separators=(",", ":"))


def validate_rules(data):
    rules = data.get("rules")
    if isinstance(rules, list) is False:
        print("WARNING rules.yaml: rules must be a list")
        return False

    all_ok = True
    seen_conditions = {}
    for rule in rules:
        if isinstance(rule, dict) is False:
            print("WARNING rules.yaml: each rule must be a map")
            all_ok = False
            continue
        rule_id = rule.get("rule_id")
        if isinstance(rule_id, str) is False:
            rule_id = "<missing rule_id>"

        conditions = rule.get("conditions")
        condition_count = 0
        if isinstance(conditions, dict):
            condition_count = len(conditions)
        if condition_count < 2:
            print(
                "WARNING rules.yaml: %s has fewer than 2 conditions"
                % rule_id
            )
            all_ok = False

        output = rule.get("output")
        if isinstance(output, dict) is False:
            output = {}
        confidence = output.get("confidence")
        if isinstance(confidence, bool):
            confidence = 0
        if isinstance(confidence, int) is False:
            if isinstance(confidence, float) is False:
                confidence = 0

        if confidence > 70:
            warnings = output.get("warnings")
            warnings_missing = False
            if isinstance(warnings, list) is False:
                warnings_missing = True
            else:
                if len(warnings) == 0:
                    warnings_missing = True
            if warnings_missing:
                print(
                    "WARNING rules.yaml: %s has confidence above 70 but no warnings"
                    % rule_id
                )
                all_ok = False

        if confidence > 60:
            evidence = rule.get("evidence")
            evidence_missing = False
            if isinstance(evidence, str) is False:
                evidence_missing = True
            else:
                if evidence.strip() == "":
                    evidence_missing = True
            if evidence_missing:
                print(
                    "WARNING rules.yaml: %s has confidence above 60 but no evidence"
                    % rule_id
                )

        if isinstance(conditions, dict):
            signature = condition_signature(conditions)
            previous_rule_id = seen_conditions.get(signature)
            if previous_rule_id is not None:
                print(
                    "WARNING rules.yaml: identical conditions conflict between %s and %s"
                    % (previous_rule_id, rule_id)
                )
            else:
                seen_conditions[signature] = rule_id

    return all_ok


def cache_is_current(config_root):
    master_dir = os.path.join(config_root, "master")
    cache_dir = os.path.join(config_root, "cache")
    if os.path.isdir(master_dir) is False:
        return False
    if os.path.isdir(cache_dir) is False:
        return False
    for name in REQUIRED_FILES:
        master_path = os.path.join(master_dir, name)
        cache_name = name.replace(".yaml", ".json")
        cache_path = os.path.join(cache_dir, cache_name)
        if os.path.isfile(master_path) is False:
            return False
        if os.path.isfile(cache_path) is False:
            return False
        master_modified = os.path.getmtime(master_path)
        cache_modified = os.path.getmtime(cache_path)
        if cache_modified < master_modified:
            return False
    return True


def validate_all(config_root):
    master_dir = os.path.join(config_root, "master")
    cache_dir = os.path.join(config_root, "cache")
    if not os.path.isdir(master_dir):
        print("Missing config/master directory")
        return False
    if not os.path.isdir(cache_dir):
        os.makedirs(cache_dir)
    all_ok = True
    for name in REQUIRED_FILES:
        path = os.path.join(master_dir, name)
        if not os.path.isfile(path):
            print("Missing required config: %s" % name)
            all_ok = False
            continue
        data = load_yaml_file(path)
        if data is None:
            print("Invalid YAML: %s" % name)
            all_ok = False
            continue
        if not isinstance(data, dict):
            print("Root must be a map: %s" % name)
            all_ok = False
            continue
        if len(list(data.keys())) == 0:
            print("Empty config: %s" % name)
            all_ok = False
            continue
        if name == "rules.yaml":
            rules_ok = validate_rules(data)
            if rules_ok is False:
                all_ok = False
                continue
        cache_name = name.replace(".yaml", ".json")
        cache_path = os.path.join(cache_dir, cache_name)
        with open(cache_path, "w", encoding="utf-8") as handle:
            json.dump(data, handle, indent=2)
        print("OK %s" % name)
    if all_ok:
        print("All master configs valid")
        print("JSON cache written to config/cache")
    return all_ok


if __name__ == "__main__":
    root = "config"
    if len(sys.argv) > 1:
        root = sys.argv[1]
    ok = validate_all(root)
    if not ok:
        sys.exit(1)
