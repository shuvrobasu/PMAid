/* Three pre-built sample projects seeded on first run */
var Samples = {
  seedIfNeeded: function (config) {
    var projects = [
      Samples.churn(config),
      Samples.documentExtraction(config),
      Samples.processAutomation(config)
    ];
    var existing = StateManager.listProjects();
    var existingIds = {};
    var i = 0;
    while (i < existing.length) {
      existingIds[existing[i].project_id] = true;
      i = i + 1;
    }
    var seeded = false;
    i = 0;
    while (i < projects.length) {
      if (!existingIds[projects[i].project_id]) {
        StateManager.persistToList(projects[i]);
        seeded = true;
      }
      i = i + 1;
    }
    return seeded;
  },

  baseProject: function (name, methodology) {
    var p = StateManager.createEmpty(name);
    p.methodology = methodology;
    p.project_id = "sample_" + name.toLowerCase().replace(/\s+/g, "_");
    return p;
  },

  churn: function (config) {
    var p = Samples.baseProject("Customer churn prediction", "scrum");
    p.discovery_inputs = {
      project_name: "Customer churn prediction",
      problem_types: ["predict_outcome"],
      success_definitions: ["cost", "accuracy"],
      data_state: "clean_labelled",
      pretrained_available: "no",
      rule_complexity: "medium",
      ai_maturity: "some",
      team_exists: "yes",
      infra: "cloud",
      budget_shape: "phased",
      timeline_horizon: "6_to_12m",
      affects_people: "yes",
      eu_domain: "essential_services",
      autonomy: "assisted",
      methodology: "scrum"
    };
    var eu = EuClassifier.classify(p.discovery_inputs, config);
    p.eu_tier = eu.tier_id;
    p.eu_classification = eu;
    var rec = RuleEngine.evaluate({
      problem_types: ["predict_outcome"],
      problem_type: "predict_outcome",
      data_state: "clean_labelled",
      pretrained_available: "no",
      rule_complexity: "medium",
      eu_tier: eu.tier_id
    }, config);
    rec.eu_classification = eu;
    rec.ai_label = RuleEngine.patternLabel(rec.ai_type, config);
    rec.alternatives = RuleEngine.alternatives(rec.ai_type, config);
    rec.override = false;
    p.recommendations = rec;
    ProcessBuilder.buildFromRecommendation(p, config);
    return p;
  },

  documentExtraction: function (config) {
    var p = Samples.baseProject("Document extraction", "kanban");
    p.discovery_inputs = {
      project_name: "Document extraction",
      problem_types: ["classify_content"],
      success_definitions: ["speed", "accuracy"],
      data_state: "partial",
      pretrained_available: "yes",
      rule_complexity: "medium",
      ai_maturity: "early",
      team_exists: "partial",
      infra: "cloud",
      budget_shape: "fixed",
      timeline_horizon: "3_to_6m",
      affects_people: "yes",
      eu_domain: "chatbot_interaction",
      autonomy: "assisted",
      methodology: "kanban"
    };
    var eu = EuClassifier.classify(p.discovery_inputs, config);
    p.eu_tier = eu.tier_id;
    p.eu_classification = eu;
    var rec = RuleEngine.evaluate({
      problem_types: ["classify_content"],
      problem_type: "classify_content",
      data_state: "partial",
      pretrained_available: "yes",
      rule_complexity: "medium",
      eu_tier: eu.tier_id
    }, config);
    rec.eu_classification = eu;
    rec.ai_label = RuleEngine.patternLabel(rec.ai_type, config);
    rec.alternatives = RuleEngine.alternatives(rec.ai_type, config);
    rec.override = false;
    p.recommendations = rec;
    ProcessBuilder.buildFromRecommendation(p, config);
    return p;
  },

  processAutomation: function (config) {
    var p = Samples.baseProject("Process automation", "hybrid");
    p.discovery_inputs = {
      project_name: "Process automation",
      problem_types: ["automate_process"],
      success_definitions: ["cost", "speed"],
      data_state: "none",
      pretrained_available: "no",
      rule_complexity: "low",
      ai_maturity: "none",
      team_exists: "no",
      infra: "none",
      budget_shape: "fixed",
      timeline_horizon: "under_3m",
      affects_people: "no",
      eu_domain: "internal_ops",
      autonomy: "human_in_loop",
      methodology: "hybrid"
    };
    var eu = EuClassifier.classify(p.discovery_inputs, config);
    p.eu_tier = eu.tier_id;
    p.eu_classification = eu;
    var rec = RuleEngine.evaluate({
      problem_types: ["automate_process"],
      problem_type: "automate_process",
      data_state: "none",
      pretrained_available: "no",
      rule_complexity: "low",
      eu_tier: eu.tier_id
    }, config);
    rec.eu_classification = eu;
    rec.ai_label = RuleEngine.patternLabel(rec.ai_type, config);
    rec.alternatives = RuleEngine.alternatives(rec.ai_type, config);
    rec.override = false;
    p.recommendations = rec;
    if (rec.ai_type === "NOT_AI") {
      ProcessBuilder.buildNonAIPlan(p, config);
    } else {
      ProcessBuilder.buildFromRecommendation(p, config);
    }
    return p;
  }
};
