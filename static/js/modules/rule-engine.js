/* Deterministic priority-ordered rule evaluation from rules.yaml */
var RuleEngine = {
  matchesCondition: function (actual, condition) {
    if (condition === undefined || condition === null) {
      return true;
    }
    if (condition.in) {
      if (actual === undefined || actual === null) {
        return false;
      }
      if (Array.isArray(actual)) {
        var ai = 0;
        while (ai < actual.length) {
          var aj = 0;
          while (aj < condition.in.length) {
            if (actual[ai] === condition.in[aj]) {
              return true;
            }
            aj = aj + 1;
          }
          ai = ai + 1;
        }
        return false;
      }
      var i = 0;
      while (i < condition.in.length) {
        if (actual === condition.in[i]) {
          return true;
        }
        i = i + 1;
      }
      return false;
    }
    if (condition.not_in) {
      if (actual === undefined || actual === null) {
        return true;
      }
      if (Array.isArray(actual)) {
        var bi = 0;
        while (bi < actual.length) {
          var bj = 0;
          while (bj < condition.not_in.length) {
            if (actual[bi] === condition.not_in[bj]) {
              return false;
            }
            bj = bj + 1;
          }
          bi = bi + 1;
        }
        return true;
      }
      var k = 0;
      while (k < condition.not_in.length) {
        if (actual === condition.not_in[k]) {
          return false;
        }
        k = k + 1;
      }
      return true;
    }
    if (condition.gte !== undefined) {
      if (actual === undefined || actual === null) {
        return false;
      }
      if (actual >= condition.gte) {
        return true;
      }
      return false;
    }
    return true;
  },

  ruleMatches: function (rule, inputs) {
    var conditions = rule.conditions;
    if (!conditions) {
      return true;
    }
    var keys = Object.keys(conditions);
    if (keys.length === 0) {
      return true;
    }
    var i = 0;
    while (i < keys.length) {
      var key = keys[i];
      var cond = conditions[key];
      var actual = inputs[key];
      if (key === "problem_type") {
        actual = inputs.problem_types;
        if (!actual) {
          actual = inputs.problem_type;
        }
      }
      var ok = RuleEngine.matchesCondition(actual, cond);
      if (!ok) {
        return false;
      }
      i = i + 1;
    }
    return true;
  },

  evaluate: function (inputs, config) {
    var rules = [];
    if (config !== undefined) {
      if (config !== null) {
        if (config.rules !== undefined) {
          if (config.rules.rules !== undefined) {
            rules = config.rules.rules.slice();
          }
        }
      }
    }
    rules.sort(function (a, b) {
      return b.priority - a.priority;
    });
    var bestRule = null;
    var bestConfidence = -1;
    var i = 0;
    while (i < rules.length) {
      var rule = rules[i];
      if (RuleEngine.ruleMatches(rule, inputs)) {
        var confidence = Number(rule.output.confidence);
        if (Number.isFinite(confidence) === false) {
          confidence = 0;
        }
        if (confidence > bestConfidence) {
          bestRule = rule;
          bestConfidence = confidence;
        }
      }
      i = i + 1;
    }
    if (bestRule === null) {
      return RuleEngine.noMatch(config);
    }
    if (bestConfidence < 40) {
      return RuleEngine.noMatch(config);
    }
    var output = {};
    var src = bestRule.output;
    var key;
    for (key in src) {
      if (Object.prototype.hasOwnProperty.call(src, key)) {
        output[key] = src[key];
      }
    }
    output.rule_id = bestRule.rule_id;
    output.priority = bestRule.priority;
    if (bestConfidence < 60) {
      output.confidence_band = "limited_signal";
      output.confidence_warning = "This recommendation is based on limited signal. Treat it as a starting point, not a conclusion.";
    }
    if (inputs.eu_tier) {
      output.eu_tier = inputs.eu_tier;
      var packages = RuleEngine.packagesForTier(inputs.eu_tier, config);
      if (packages !== undefined) {
        if (packages !== null) {
          if (packages.length > 0) {
            output.mandatory_work_packages = packages;
          }
        }
      }
    }
    return output;
  },

  noMatch: function (config) {
    var questions = [];
    if (config !== undefined) {
      if (config !== null) {
        if (config.rules !== undefined) {
          if (config.rules.no_match !== undefined) {
            questions = config.rules.no_match.questions.slice();
          }
        }
      }
    }
    return {
      ai_type: "NO_MATCH",
      confidence: 0,
      message: "Your problem does not match any known pattern clearly enough to recommend an approach.",
      questions: questions
    };
  },

  packagesForTier: function (tierId, config) {
    if (!config || !config.eu_ai_act || !config.eu_ai_act.tiers) {
      return [];
    }
    var tiers = config.eu_ai_act.tiers;
    if (tiers[tierId] && tiers[tierId].mandatory_work_packages) {
      return tiers[tierId].mandatory_work_packages.slice();
    }
    return [];
  },

  patternLabel: function (aiType, config) {
    if (!config || !config.ai_patterns || !config.ai_patterns.ai_patterns) {
      return aiType;
    }
    var list = config.ai_patterns.ai_patterns;
    var i = 0;
    while (i < list.length) {
      if (list[i].id === aiType) {
        return list[i].label;
      }
      i = i + 1;
    }
    if (aiType === "NOT_AI") {
      return "Not AI";
    }
    return aiType;
  },

  alternatives: function (primaryType, config) {
    if (!config || !config.ai_patterns || !config.ai_patterns.ai_patterns) {
      return [];
    }
    if (primaryType === "NOT_AI") {
      return [];
    }
    if (primaryType === "NO_MATCH") {
      return [];
    }
    var result = [];
    var list = config.ai_patterns.ai_patterns;
    var i = 0;
    while (i < list.length) {
      if (list[i].id !== primaryType) {
        if (list[i].id !== "not_ai") {
          if (list[i].id !== "rules_engine") {
            result.push({
              id: list[i].id,
              label: list[i].label
            });
          }
        }
      }
      if (result.length >= 2) {
        break;
      }
      i = i + 1;
    }
    return result;
  }
};
