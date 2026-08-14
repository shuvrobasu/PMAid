"""Self-check: 10 rule scenarios + EU tier paths. Run: python test_rules.py"""

import json
import sys


def load(name):
    with open("config/cache/" + name + ".json", encoding="utf-8") as handle:
        return json.load(handle)


def match_cond(actual, condition):
    if condition is None:
        return True
    if "in" in condition:
        if actual is None:
            return False
        if isinstance(actual, list):
            for item in actual:
                if item in condition["in"]:
                    return True
            return False
        if actual in condition["in"]:
            return True
        return False
    if "not_in" in condition:
        if actual is None:
            return True
        if isinstance(actual, list):
            for item in actual:
                if item in condition["not_in"]:
                    return False
            return True
        if actual in condition["not_in"]:
            return False
        return True
    return True


def evaluate(rules, inputs):
    ordered = sorted(rules, key=lambda rule: 0 - rule["priority"])
    best_rule = None
    best_confidence = -1
    for rule in ordered:
        conds = rule.get("conditions")
        if conds is None:
            conds = {}
        ok = True
        for key in conds:
            cond = conds[key]
            actual = inputs.get(key)
            if key == "problem_type":
                actual = inputs.get("problem_types", inputs.get("problem_type"))
            if not match_cond(actual, cond):
                ok = False
                break
        if ok:
            confidence = rule["output"]["confidence"]
            if confidence > best_confidence:
                best_rule = rule
                best_confidence = confidence
    if best_rule is None:
        return "rule_no_match", "NO_MATCH"
    if best_confidence < 40:
        return "rule_no_match", "NO_MATCH"
    return best_rule["rule_id"], best_rule["output"]["ai_type"]


def match_tier(tier, domain, affects, autonomy):
    conditions = tier.get("trigger_conditions")
    if not conditions:
        return False
    for cond in conditions:
        ok = True
        if "domain" in cond:
            if cond["domain"] != domain:
                ok = False
        if ok:
            if "affects_people" in cond:
                if cond["affects_people"] != affects:
                    ok = False
        if ok:
            if "autonomy" in cond:
                if cond["autonomy"] != autonomy:
                    ok = False
        if ok:
            return True
    return False


def classify(eu, domain, affects, autonomy):
    if match_tier(eu["tiers"]["prohibited"], domain, affects, autonomy):
        return "prohibited"
    if match_tier(eu["tiers"]["high_risk"], domain, affects, autonomy):
        return "high_risk"
    if match_tier(eu["tiers"]["limited_risk"], domain, affects, autonomy):
        return "limited_risk"
    return "minimal_risk"


def main():
    rules = load("rules")["rules"]
    eu = load("eu_ai_act")
    scenarios = [
        ({"problem_types": ["predict_outcome"], "data_state": "clean_labelled", "pretrained_available": "no", "rule_complexity": "medium", "eu_tier": "high_risk"}, "supervised_classification"),
        ({"problem_types": ["classify_content"], "data_state": "partial", "pretrained_available": "yes", "rule_complexity": "medium", "eu_tier": "limited_risk"}, "document_extraction"),
        ({"problem_types": ["automate_process"], "data_state": "none", "pretrained_available": "no", "rule_complexity": "low", "eu_tier": "minimal_risk"}, "NOT_AI"),
        ({"problem_types": ["retrieve_lookup"], "data_state": "clean_labelled", "pretrained_available": "no", "rule_complexity": "low", "eu_tier": "minimal_risk"}, "NOT_AI"),
        ({"problem_types": ["predict_outcome"], "data_state": "none", "pretrained_available": "no", "rule_complexity": "medium", "eu_tier": "minimal_risk"}, "NOT_AI"),
        (
            {
                "problem_types": ["predict_outcome"],
                "data_state": "clean_labelled",
                "pretrained_available": "no",
                "rule_complexity": "medium",
                "eu_tier": "prohibited",
                "affects_people": "yes",
            },
            "NOT_AI",
        ),
        ({"problem_types": ["generate_content"], "data_state": "partial", "pretrained_available": "yes", "rule_complexity": "medium", "eu_tier": "limited_risk"}, "generative_llm"),
        ({"problem_types": ["detect_anomaly"], "data_state": "messy", "pretrained_available": "no", "rule_complexity": "high", "eu_tier": "minimal_risk"}, "anomaly_detection"),
        ({"problem_types": ["optimise_decision"], "data_state": "clean_labelled", "pretrained_available": "no", "rule_complexity": "high", "eu_tier": "minimal_risk"}, "optimisation"),
        ({"problem_types": ["unknown"], "data_state": "clean_labelled", "pretrained_available": "yes", "rule_complexity": "low", "eu_tier": "minimal_risk"}, "NO_MATCH"),
    ]
    failed = 0
    for inputs, expect in scenarios:
        rule_id, ai_type = evaluate(rules, inputs)
        if ai_type != expect:
            print("FAIL", inputs, "got", ai_type, "expect", expect)
            failed = failed + 1
        else:
            print("OK", rule_id, ai_type)
    eu_cases = [
        ("social_scoring", "yes", "human_in_loop", "prohibited"),
        ("essential_services", "yes", "assisted", "high_risk"),
        ("chatbot_interaction", "yes", "assisted", "limited_risk"),
        ("internal_ops", "no", "human_in_loop", "minimal_risk"),
    ]
    for domain, affects, autonomy, expect in eu_cases:
        got = classify(eu, domain, affects, autonomy)
        if got != expect:
            print("FAIL EU", domain, got, expect)
            failed = failed + 1
        else:
            print("OK EU", domain, got)
    packages = eu["tiers"]["high_risk"]["mandatory_work_packages"]
    if len(packages) != 8:
        print("FAIL package count", len(packages))
        failed = failed + 1
    else:
        print("OK high_risk packages", len(packages))
    no_match_questions = load("rules")["no_match"]["questions"]
    if len(no_match_questions) != 8:
        print("FAIL no_match question count", len(no_match_questions))
        failed = failed + 1
    else:
        print("OK no_match questions", len(no_match_questions))
    if failed > 0:
        print("FAILED", failed)
        sys.exit(1)
    print("All checks passed")


if __name__ == "__main__":
    main()
