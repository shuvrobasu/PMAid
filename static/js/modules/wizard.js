/* Discovery wizard — 6 steps driven by YAML config */
var Wizard = {
  step: 1,
  totalSteps: 6,
  draft: null,
  originalSnapshot: null,

  start: function (projectName) {
    Wizard.step = 1;
    Wizard.originalSnapshot = null;
    Wizard.draft = StateManager.createEmpty(projectName || "New Project");
    Wizard.draft.discovery_inputs = {
      project_name: projectName || "New Project",
      problem_statement: "",
      problem_types: [],
      success_definitions: [],
      data_state: null,
      pretrained_available: "no",
      rule_complexity: "medium",
      ai_maturity: "early",
      team_exists: "partial",
      infra: "cloud",
      budget_shape: "phased",
      timeline_horizon: "6_to_12m",
      affects_people: "no",
      eu_domain: "none",
      autonomy: "human_in_loop",
      methodology: "scrum"
    };
    return Wizard.draft;
  },

  loadDraft: function () {
    var active = StateManager.get();
    if (active) {
      if (active.discovery_inputs) {
        Wizard.originalSnapshot = Wizard.historySnapshot(active);
        Wizard.draft = active;
        return active;
      }
    }
    return Wizard.start("New Project");
  },

  cloneValue: function (value) {
    return JSON.parse(JSON.stringify(value));
  },

  historySnapshot: function (project) {
    var recommendation = {};
    if (project.recommendations) {
      recommendation = {
        ai_type: project.recommendations.ai_type,
        ai_label: project.recommendations.ai_label,
        confidence: project.recommendations.confidence
      };
    }
    var inputs = {};
    if (project.discovery_inputs) {
      inputs = Wizard.cloneValue(project.discovery_inputs);
    }
    return {
      project_name: project.project_name,
      discovery_inputs: inputs,
      recommendation: recommendation,
      eu_tier: project.eu_tier,
      captured_at: project.updated_at
    };
  },

  historyFieldLabels: function () {
    return {
      project_name: "Project name",
      problem_statement: "Problem statement",
      problem_types: "Business problem",
      success_definitions: "Success definition",
      data_state: "Data state",
      pretrained_available: "Pre-trained model",
      rule_complexity: "Rule complexity",
      ai_maturity: "AI maturity",
      team_exists: "Team",
      infra: "Infrastructure",
      budget_shape: "Budget shape",
      timeline_horizon: "Timeline horizon",
      affects_people: "Affects decisions about people",
      eu_domain: "EU AI Act domain",
      autonomy: "Human oversight",
      methodology: "Methodology"
    };
  },

  historyValue: function (value) {
    if (value === null) {
      return "Not set";
    }
    if (value === undefined) {
      return "Not set";
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return "None";
      }
      var readable = [];
      var i = 0;
      while (i < value.length) {
        readable.push(Wizard.historyValue(value[i]));
        i = i + 1;
      }
      return readable.join(", ");
    }
    return String(value).replace(/_/g, " ");
  },

  valuesMatch: function (left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  },

  appendHistoryChange: function (changes, field, label, before, after) {
    if (Wizard.valuesMatch(before, after)) {
      return;
    }
    changes.push({
      field: field,
      label: label,
      before: Wizard.historyValue(before),
      after: Wizard.historyValue(after)
    });
  },

  historyChanges: function (before, after) {
    var changes = [];
    var labels = Wizard.historyFieldLabels();
    var keys = Object.keys(labels);
    var beforeInputs = before.discovery_inputs;
    var afterInputs = after.discovery_inputs;
    var i = 0;
    while (i < keys.length) {
      var key = keys[i];
      if (key === "project_name") {
        Wizard.appendHistoryChange(
          changes,
          key,
          labels[key],
          before.project_name,
          after.project_name
        );
      } else {
        Wizard.appendHistoryChange(
          changes,
          key,
          labels[key],
          beforeInputs[key],
          afterInputs[key]
        );
      }
      i = i + 1;
    }
    Wizard.appendHistoryChange(
      changes,
      "recommendation",
      "Recommended approach",
      before.recommendation.ai_label,
      after.recommendation.ai_label
    );
    Wizard.appendHistoryChange(
      changes,
      "eu_tier",
      "EU AI Act tier",
      before.eu_tier,
      after.eu_tier
    );
    return changes;
  },

  addHistoryEntry: function (project) {
    if (Array.isArray(project.version_history) === false) {
      project.version_history = [];
    }
    var current = Wizard.historySnapshot(project);
    var original = Wizard.originalSnapshot;
    if (project.version_history.length === 0) {
      if (original !== null) {
        project.version_history.push({
          version: 1,
          created_at: original.captured_at,
          summary: "Saved project baseline",
          changes: [],
          snapshot: original
        });
      }
    }
    var changes = [];
    var summary = "Initial discovery completed";
    if (original !== null) {
      changes = Wizard.historyChanges(original, current);
      summary = "Discovery answers updated and verdict recalculated";
      if (changes.length === 0) {
        summary = "Verdict recalculated with no answer changes";
      }
    }
    var versionNumber = project.version_history.length + 1;
    project.version_history.push({
      version: versionNumber,
      created_at: new Date().toISOString(),
      summary: summary,
      changes: changes,
      snapshot: current
    });
    Wizard.originalSnapshot = current;
  },

  setField: function (key, value) {
    if (!Wizard.draft) {
      Wizard.loadDraft();
    }
    Wizard.draft.discovery_inputs[key] = value;
    if (key === "project_name") {
      Wizard.draft.project_name = value;
    }
    if (key === "methodology") {
      Wizard.draft.methodology = value;
    }
  },

  toggleMulti: function (key, value, checked) {
    if (!Wizard.draft) {
      Wizard.loadDraft();
    }
    var list = Wizard.draft.discovery_inputs[key];
    if (!list) {
      list = [];
    }
    var next = [];
    var found = false;
    var i = 0;
    while (i < list.length) {
      if (list[i] === value) {
        found = true;
        if (checked) {
          next.push(list[i]);
        }
      } else {
        next.push(list[i]);
      }
      i = i + 1;
    }
    if (checked) {
      if (!found) {
        next.push(value);
      }
    }
    Wizard.draft.discovery_inputs[key] = next;
  },

  canAdvance: function () {
    var d = Wizard.draft.discovery_inputs;
    if (Wizard.step === 1) {
      if (!d.problem_types || d.problem_types.length === 0) {
        return false;
      }
      return true;
    }
    if (Wizard.step === 2) {
      if (!d.success_definitions || d.success_definitions.length === 0) {
        return false;
      }
      return true;
    }
    if (Wizard.step === 3) {
      if (!d.data_state) {
        return false;
      }
      return true;
    }
    if (Wizard.step === 4) {
      return true;
    }
    if (Wizard.step === 5) {
      if (!d.eu_domain) {
        return false;
      }
      if (!d.affects_people) {
        return false;
      }
      return true;
    }
    if (Wizard.step === 6) {
      if (!d.methodology) {
        return false;
      }
      return true;
    }
    return false;
  },

  next: function () {
    if (!Wizard.canAdvance()) {
      return false;
    }
    if (Wizard.step < Wizard.totalSteps) {
      Wizard.step = Wizard.step + 1;
      return true;
    }
    return Wizard.finish();
  },

  back: function () {
    if (Wizard.step > 1) {
      Wizard.step = Wizard.step - 1;
      return true;
    }
    return false;
  },

  finish: function () {
    var config = ConfigManager.get();
    var inputs = Wizard.draft.discovery_inputs;
    Wizard.draft.project_name = inputs.project_name || Wizard.draft.project_name;
    Wizard.draft.methodology = inputs.methodology;

    var eu = EuClassifier.classify(inputs, config);
    Wizard.draft.eu_tier = eu.tier_id;
    Wizard.draft.eu_classification = eu;

    var ruleInputs = {
      problem_types: inputs.problem_types,
      problem_type: inputs.problem_types[0],
      data_state: inputs.data_state,
      pretrained_available: inputs.pretrained_available,
      rule_complexity: inputs.rule_complexity,
      eu_tier: eu.tier_id,
      affects_people: inputs.affects_people,
      eu_domain: inputs.eu_domain,
      autonomy: inputs.autonomy
    };

    if (eu.hard_stop) {
      ruleInputs.eu_tier = "prohibited";
    }

    var rec = RuleEngine.evaluate(ruleInputs, config);
    rec.eu_classification = eu;
    rec.ai_label = RuleEngine.patternLabel(rec.ai_type, config);
    rec.alternatives = RuleEngine.alternatives(rec.ai_type, config);
    rec.override = false;
    Wizard.draft.recommendations = rec;

    var noPlan = false;
    if (eu.hard_stop) {
      noPlan = true;
    }
    if (rec.ai_type === "NO_MATCH") {
      noPlan = true;
    }
    if (noPlan) {
      Wizard.draft.phases = [];
      Wizard.draft.risks = [];
      Wizard.draft.raci = { matrix: {}, roles: {} };
      Wizard.draft.assumptions = [];
      Wizard.draft.stakeholder_map = [];
      Wizard.draft.non_ai_plan = null;
      Wizard.draft.question_back_list = [];
    } else {
      if (rec.ai_type === "NOT_AI") {
        ProcessBuilder.buildNonAIPlan(Wizard.draft, config);
      } else {
        ProcessBuilder.buildFromRecommendation(Wizard.draft, config);
      }
    }

    Wizard.addHistoryEntry(Wizard.draft);
    StateManager.set(Wizard.draft);
    return Wizard.draft;
  }
};
