"""Run ten deterministic PMAID rule-engine scenarios without dependencies."""

from pathlib import Path

import config_validator


ROOT = Path(__file__).resolve().parent
RULES_PATH = ROOT / "config" / "master" / "rules.yaml"


def load_rules():
    source = RULES_PATH.read_text(encoding="utf-8")
    parsed = config_validator.parse_yaml(source)
    return parsed["rules"]


def condition_matches(value, condition):
    allowed = condition.get("in")
    if allowed is not None:
        if isinstance(value, list):
            for item in value:
                if item in allowed:
                    return True
            return False
        if value in allowed:
            return True
        return False
    rejected = condition.get("not_in")
    if rejected is not None:
        if isinstance(value, list):
            for item in value:
                if item in rejected:
                    return False
            return True
        if value in rejected:
            return False
        return True
    return True


def rule_matches(rule, inputs):
    for key, condition in rule["conditions"].items():
        value = inputs.get(key)
        if key == "problem_type":
            value = inputs.get("problem_type")
        if condition_matches(value, condition) is False:
            return False
    return True


def evaluate(inputs, rules):
    best = None
    best_confidence = -1
    for rule in rules:
        if rule_matches(rule, inputs) is False:
            continue
        confidence = rule["output"]["confidence"]
        if confidence > best_confidence:
            best = rule
            best_confidence = confidence
    if best is None:
        return "NO_MATCH"
    if best_confidence < 40:
        return "NO_MATCH"
    return best["rule_id"]


def scenario(name, inputs, expected, rules):
    actual = evaluate(inputs, rules)
    if actual != expected:
        print("FAIL %s expected %s got %s" % (name, expected, actual))
        return False
    print("OK %s" % name)
    return True


def main():
    rules = load_rules()
    cases = [
        ("rule_prohibited_stop", {"eu_tier": "prohibited", "affects_people": "yes"}, "rule_prohibited_stop"),
        ("rule_lookup_not_ai", {"problem_type": "retrieve_lookup", "eu_tier": "minimal_risk"}, "rule_lookup_not_ai"),
        ("rule_automate_low_not_ai", {"problem_type": "automate_process", "rule_complexity": "low"}, "rule_automate_low_not_ai"),
        ("rule_no_data_not_ai", {"data_state": "none", "problem_type": "predict_outcome", "pretrained_available": "no"}, "rule_no_data_not_ai"),
        ("rule_supervised_prediction", {"problem_type": "predict_outcome", "data_state": "clean_labelled"}, "rule_supervised_prediction"),
        ("rule_document_extraction", {"problem_type": "classify_content", "data_state": "partial"}, "rule_document_extraction"),
        ("rule_generative", {"problem_type": "generate_content", "eu_tier": "minimal_risk"}, "rule_generative"),
        ("rule_anomaly", {"problem_type": "detect_anomaly", "eu_tier": "minimal_risk"}, "rule_anomaly"),
        ("rule_optimise", {"problem_type": "optimise_decision", "eu_tier": "minimal_risk"}, "rule_optimise"),
        ("rule_unknown_default", {"problem_type": "unknown", "eu_tier": "minimal_risk"}, "NO_MATCH"),
    ]
    failed = False
    for name, inputs, expected in cases:
        passed = scenario(name, inputs, expected, rules)
        if passed is False:
            failed = True
    if failed:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
