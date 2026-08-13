var ruleEditorConfig = null;
var currentRule = null;
var currentRuleId = "";
var ruleEditorDirty = false;
var ruleEditorLoading = false;
var ruleConditionDefinitions = [];

function copyRuleValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function setRuleStatus(message, kind) {
  var status = document.getElementById("rule-status");
  status.textContent = message;
  status.classList.remove("is-error");
  status.classList.remove("is-success");
  if (kind === "error") {
    status.classList.add("is-error");
  }
  if (kind === "success") {
    status.classList.add("is-success");
  }
}

function humanRuleName(ruleId) {
  var text = ruleId;
  if (text.indexOf("rule_") === 0) {
    text = text.substring(5);
  }
  var words = text.split("_");
  var i = 0;
  while (i < words.length) {
    if (words[i].length > 0) {
      words[i] = words[i].charAt(0).toUpperCase() + words[i].substring(1);
    }
    i = i + 1;
  }
  return words.join(" ");
}

function addSelectOption(select, value, label) {
  var option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  select.appendChild(option);
}

function getTierOptions(config) {
  var result = [];
  var tiers = config.eu_ai_act.tiers;
  var keys = Object.keys(tiers);
  var i = 0;
  while (i < keys.length) {
    var tier = tiers[keys[i]];
    result.push({
      id: tier.id,
      label: tier.label
    });
    i = i + 1;
  }
  return result;
}

function createConditionDefinitions(config) {
  return [
    {
      key: "problem_type",
      label: "Business problem",
      options: config.problem_types.problem_types
    },
    {
      key: "data_state",
      label: "Data state",
      options: config.ui.wizard.data_states
    },
    {
      key: "pretrained_available",
      label: "Existing trained model",
      options: config.ui.wizard.pretrained_options
    },
    {
      key: "rule_complexity",
      label: "Manual-process complexity",
      options: config.ui.wizard.rule_complexity_options
    },
    {
      key: "eu_tier",
      label: "EU AI Act tier",
      options: getTierOptions(config)
    }
  ];
}

function buildRecommendationOptions(config) {
  var select = document.getElementById("rule-ai-type");
  select.innerHTML = "";
  var patterns = config.ai_patterns.ai_patterns;
  var i = 0;
  while (i < patterns.length) {
    var value = patterns[i].id;
    if (value === "not_ai") {
      value = "NOT_AI";
    }
    addSelectOption(select, value, patterns[i].label);
    i = i + 1;
  }
}

function buildChoiceGrid(containerId, items, idKey, labelKey, inputPrefix) {
  var container = document.getElementById(containerId);
  container.innerHTML = "";
  var i = 0;
  while (i < items.length) {
    var choice = document.createElement("label");
    choice.className = "rule-choice";
    var input = document.createElement("input");
    input.type = "checkbox";
    input.id = inputPrefix + items[i][idKey];
    input.dataset.value = items[i][idKey];
    var labelText = document.createElement("span");
    labelText.textContent = items[i][labelKey];
    choice.appendChild(input);
    choice.appendChild(labelText);
    container.appendChild(choice);
    i = i + 1;
  }
}

function setChoiceGridValues(containerId, values) {
  var container = document.getElementById(containerId);
  var inputs = container.querySelectorAll('input[type="checkbox"]');
  var i = 0;
  while (i < inputs.length) {
    inputs[i].checked = values.indexOf(inputs[i].dataset.value) >= 0;
    i = i + 1;
  }
}

function readChoiceGridValues(containerId) {
  var result = [];
  var container = document.getElementById(containerId);
  var inputs = container.querySelectorAll('input[type="checkbox"]');
  var i = 0;
  while (i < inputs.length) {
    if (inputs[i].checked === true) {
      result.push(inputs[i].dataset.value);
    }
    i = i + 1;
  }
  return result;
}

function buildConditionEditor(definition) {
  var fieldset = document.createElement("fieldset");
  fieldset.className = "rule-condition";
  var legend = document.createElement("legend");
  legend.textContent = definition.label;
  fieldset.appendChild(legend);

  var group = document.createElement("div");
  group.className = "form-group";
  var operatorLabel = document.createElement("label");
  operatorLabel.htmlFor = "condition-" + definition.key + "-operator";
  operatorLabel.textContent = "Match rule";
  var operator = document.createElement("select");
  operator.id = "condition-" + definition.key + "-operator";
  operator.dataset.conditionKey = definition.key;
  operator.className = "condition-operator";
  addSelectOption(operator, "ignore", "Ignore this answer");
  addSelectOption(operator, "in", "Must be one of");
  addSelectOption(operator, "not_in", "Must not be one of");
  group.appendChild(operatorLabel);
  group.appendChild(operator);
  fieldset.appendChild(group);

  var choices = document.createElement("div");
  choices.id = "condition-" + definition.key + "-choices";
  choices.className = "rule-choice-grid rule-choice-set";
  var i = 0;
  while (i < definition.options.length) {
    var choice = document.createElement("label");
    choice.className = "rule-choice";
    var checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.value = definition.options[i].id;
    checkbox.id = "condition-" + definition.key + "-" + definition.options[i].id;
    var labelText = document.createElement("span");
    labelText.textContent = definition.options[i].label;
    choice.appendChild(checkbox);
    choice.appendChild(labelText);
    choices.appendChild(choice);
    i = i + 1;
  }
  fieldset.appendChild(choices);
  document.getElementById("conditions-editor").appendChild(fieldset);

  operator.addEventListener("change", function () {
    updateConditionAvailability(definition.key);
  });
}

function buildConditionEditors() {
  var container = document.getElementById("conditions-editor");
  container.innerHTML = "";
  var i = 0;
  while (i < ruleConditionDefinitions.length) {
    buildConditionEditor(ruleConditionDefinitions[i]);
    i = i + 1;
  }
}

function updateConditionAvailability(conditionKey) {
  var operator = document.getElementById("condition-" + conditionKey + "-operator");
  var choices = document.getElementById("condition-" + conditionKey + "-choices");
  var inputs = choices.querySelectorAll('input[type="checkbox"]');
  var disabled = operator.value === "ignore";
  var i = 0;
  while (i < inputs.length) {
    inputs[i].disabled = disabled;
    i = i + 1;
  }
  if (disabled === true) {
    choices.classList.add("is-disabled");
  }
  if (disabled === false) {
    choices.classList.remove("is-disabled");
  }
}

function setConditionValue(definition, condition) {
  var operatorValue = "ignore";
  var values = [];
  if (condition !== undefined) {
    if (condition !== null) {
      if (Object.prototype.hasOwnProperty.call(condition, "in")) {
        operatorValue = "in";
        values = condition.in;
      }
      if (Object.prototype.hasOwnProperty.call(condition, "not_in")) {
        operatorValue = "not_in";
        values = condition.not_in;
      }
    }
  }
  var operator = document.getElementById("condition-" + definition.key + "-operator");
  operator.value = operatorValue;
  var choices = document.getElementById("condition-" + definition.key + "-choices");
  var inputs = choices.querySelectorAll('input[type="checkbox"]');
  var i = 0;
  while (i < inputs.length) {
    inputs[i].checked = values.indexOf(inputs[i].dataset.value) >= 0;
    i = i + 1;
  }
  updateConditionAvailability(definition.key);
}

function readConditions() {
  var baseConditions = currentRule.conditions;
  if (baseConditions === undefined) {
    baseConditions = {};
  }
  var result = copyRuleValue(baseConditions);
  var i = 0;
  while (i < ruleConditionDefinitions.length) {
    var definition = ruleConditionDefinitions[i];
    delete result[definition.key];
    var operator = document.getElementById("condition-" + definition.key + "-operator");
    if (operator.value !== "ignore") {
      var choices = document.getElementById("condition-" + definition.key + "-choices");
      var inputs = choices.querySelectorAll('input[type="checkbox"]');
      var values = [];
      var j = 0;
      while (j < inputs.length) {
        if (inputs[j].checked === true) {
          values.push(inputs[j].dataset.value);
        }
        j = j + 1;
      }
      if (values.length === 0) {
        setRuleStatus("Not saved. Choose at least one value for “" + definition.label + "”, or set it to “Ignore this answer”.", "error");
        operator.focus();
        return null;
      }
      result[definition.key] = {};
      result[definition.key][operator.value] = values;
    }
    i = i + 1;
  }
  return result;
}

function addTextRow(containerId, value, makeDirty) {
  var container = document.getElementById(containerId);
  var row = document.createElement("div");
  row.className = "rule-text-row";
  var input = document.createElement("input");
  input.type = "text";
  input.className = "rule-text-value";
  input.value = value;
  input.setAttribute("aria-label", "Editable sentence");
  var remove = document.createElement("button");
  remove.type = "button";
  remove.className = "rule-remove-row";
  remove.textContent = "Remove";
  remove.setAttribute("aria-label", "Remove this sentence");
  remove.addEventListener("click", function () {
    row.remove();
    markRuleEditorDirty();
  });
  row.appendChild(input);
  row.appendChild(remove);
  container.appendChild(row);
  if (makeDirty === true) {
    markRuleEditorDirty();
    input.focus();
  }
}

function renderTextList(containerId, values) {
  var container = document.getElementById(containerId);
  container.innerHTML = "";
  var i = 0;
  while (i < values.length) {
    addTextRow(containerId, values[i], false);
    i = i + 1;
  }
}

function readTextList(containerId) {
  var result = [];
  var container = document.getElementById(containerId);
  var inputs = container.querySelectorAll(".rule-text-value");
  var i = 0;
  while (i < inputs.length) {
    var value = inputs[i].value.trim();
    if (value.length > 0) {
      result.push(value);
    }
    i = i + 1;
  }
  return result;
}

function findRule(ruleId) {
  var rules = ruleEditorConfig.rules.rules;
  var i = 0;
  while (i < rules.length) {
    if (rules[i].rule_id === ruleId) {
      return rules[i];
    }
    i = i + 1;
  }
  return null;
}

function fillRuleSelector(wantedRuleId) {
  var select = document.getElementById("rule-select");
  select.innerHTML = "";
  var rules = ruleEditorConfig.rules.rules;
  var i = 0;
  while (i < rules.length) {
    var label = humanRuleName(rules[i].rule_id) + " — priority " + rules[i].priority;
    addSelectOption(select, rules[i].rule_id, label);
    i = i + 1;
  }
  if (wantedRuleId.length > 0) {
    if (findRule(wantedRuleId) !== null) {
      select.value = wantedRuleId;
    }
  }
}

function loadRule(ruleId) {
  var rule = findRule(ruleId);
  if (rule === null) {
    setRuleStatus("This rule could not be loaded.", "error");
    return;
  }
  ruleEditorLoading = true;
  currentRule = copyRuleValue(rule);
  currentRuleId = rule.rule_id;
  document.getElementById("rule-select").value = rule.rule_id;
  document.getElementById("rule-id-display").textContent = rule.rule_id;
  document.getElementById("rule-priority").value = rule.priority;
  document.getElementById("rule-ai-type").value = rule.output.ai_type;
  document.getElementById("rule-confidence").value = rule.output.confidence;
  document.getElementById("rule-complexity").value = rule.output.complexity_shape;
  document.getElementById("rule-suggested-non-ai").value = rule.output.suggested_non_ai;

  var i = 0;
  while (i < ruleConditionDefinitions.length) {
    var definition = ruleConditionDefinitions[i];
    setConditionValue(definition, rule.conditions[definition.key]);
    i = i + 1;
  }

  setChoiceGridValues("phases-options", rule.output.suggested_phases);
  setChoiceGridValues("roles-options", rule.output.role_recommendations);
  renderTextList("reasons-list", rule.output.reasons);
  renderTextList("warnings-list", rule.output.warnings);
  renderTextList("next-steps-list", rule.output.sub_recommendations);
  renderTextList("questions-list", rule.output.questions);
  renderTextList("no-match-list", ruleEditorConfig.rules.no_match.questions);

  ruleEditorDirty = false;
  ruleEditorLoading = false;
  setRuleStatus("Editing “" + humanRuleName(rule.rule_id) + "”.", "");
}

function markRuleEditorDirty() {
  if (ruleEditorLoading === true) {
    return;
  }
  ruleEditorDirty = true;
  setRuleStatus("Unsaved changes.", "");
}

function changeSelectedRule() {
  var select = document.getElementById("rule-select");
  var nextRuleId = select.value;
  if (ruleEditorDirty === true) {
    var confirmed = window.confirm("Discard your unsaved changes and open another rule?");
    if (confirmed === false) {
      select.value = currentRuleId;
      return;
    }
  }
  loadRule(nextRuleId);
}

function validateNumber(value, minimum, maximum, fieldName, field) {
  if (Number.isFinite(value) === false) {
    setRuleStatus("Not saved. " + fieldName + " must be a number.", "error");
    field.focus();
    return false;
  }
  if (value < minimum) {
    setRuleStatus("Not saved. " + fieldName + " must be at least " + minimum + ".", "error");
    field.focus();
    return false;
  }
  if (value > maximum) {
    setRuleStatus("Not saved. " + fieldName + " must be no more than " + maximum + ".", "error");
    field.focus();
    return false;
  }
  return true;
}

function saveSelectedRule(event) {
  event.preventDefault();
  if (currentRule === null) {
    setRuleStatus("Not saved. Choose a rule first.", "error");
    return;
  }

  var priorityField = document.getElementById("rule-priority");
  var priority = Number(priorityField.value);
  if (validateNumber(priority, 0, 1000, "Priority", priorityField) === false) {
    return;
  }

  var confidenceField = document.getElementById("rule-confidence");
  var confidence = Number(confidenceField.value);
  if (validateNumber(confidence, 0, 100, "Match confidence", confidenceField) === false) {
    return;
  }

  var conditions = readConditions();
  if (conditions === null) {
    return;
  }

  var phases = readChoiceGridValues("phases-options");
  if (phases.length === 0) {
    setRuleStatus("Not saved. Choose at least one plan phase.", "error");
    document.getElementById("phases-options").scrollIntoView();
    return;
  }

  var roles = readChoiceGridValues("roles-options");
  if (roles.length === 0) {
    setRuleStatus("Not saved. Choose at least one recommended role.", "error");
    document.getElementById("roles-options").scrollIntoView();
    return;
  }

  var reasons = readTextList("reasons-list");
  if (reasons.length === 0) {
    setRuleStatus("Not saved. Add at least one plain-English reason.", "error");
    document.getElementById("reasons-list").scrollIntoView();
    return;
  }

  var noMatchQuestions = readTextList("no-match-list");
  if (noMatchQuestions.length === 0) {
    setRuleStatus("Not saved. Add at least one question for unclear cases.", "error");
    document.getElementById("no-match-list").scrollIntoView();
    return;
  }

  var editedRule = copyRuleValue(currentRule);
  editedRule.priority = priority;
  editedRule.conditions = conditions;
  editedRule.output.ai_type = document.getElementById("rule-ai-type").value;
  editedRule.output.confidence = confidence;
  editedRule.output.complexity_shape = document.getElementById("rule-complexity").value;
  editedRule.output.suggested_non_ai = document.getElementById("rule-suggested-non-ai").value.trim();
  editedRule.output.suggested_phases = phases;
  editedRule.output.role_recommendations = roles;
  editedRule.output.reasons = reasons;
  editedRule.output.warnings = readTextList("warnings-list");
  editedRule.output.sub_recommendations = readTextList("next-steps-list");
  editedRule.output.questions = readTextList("questions-list");

  var rules = copyRuleValue(ruleEditorConfig.rules.rules);
  var selectedIndex = -1;
  var i = 0;
  while (i < rules.length) {
    if (rules[i].rule_id === currentRuleId) {
      selectedIndex = i;
    }
    i = i + 1;
  }
  if (selectedIndex < 0) {
    setRuleStatus("Not saved. The selected rule no longer exists.", "error");
    return;
  }
  rules[selectedIndex] = editedRule;

  var org = PrismStorage.load("prism_org_config", {});
  if (org.rules === undefined) {
    org.rules = {};
  }
  var noMatch = copyRuleValue(ruleEditorConfig.rules.no_match);
  noMatch.questions = noMatchQuestions;
  org.rules.no_match = noMatch;
  org.rules.rules = rules;
  ConfigManager.saveOrg(org);

  ruleEditorConfig = ConfigManager.get();
  currentRule = copyRuleValue(editedRule);
  ruleEditorDirty = false;
  fillRuleSelector(currentRuleId);
  setRuleStatus("Saved in this browser. New Discovery verdicts will use this rule. Existing projects must be opened with Modify and submitted again.", "success");
}

function restoreMasterRules() {
  var org = PrismStorage.load("prism_org_config", {});
  if (org.rules === undefined) {
    setRuleStatus("Master rules are already in use.", "");
    return;
  }
  var confirmed = window.confirm("Remove every browser rule override and restore the master rules?");
  if (confirmed === false) {
    return;
  }
  delete org.rules;
  ConfigManager.saveOrg(org);
  ruleEditorConfig = ConfigManager.get();
  ruleEditorDirty = false;
  fillRuleSelector(currentRuleId);
  loadRule(document.getElementById("rule-select").value);
  setRuleStatus("All master rules were restored for this browser.", "success");
}

function addRuleEditorListeners() {
  document.getElementById("rule-select").addEventListener("change", changeSelectedRule);
  document.getElementById("rule-form").addEventListener("submit", saveSelectedRule);
  document.getElementById("rule-form").addEventListener("input", function (event) {
    if (event.target.id === "rule-select") {
      return;
    }
    markRuleEditorDirty();
  });
  document.getElementById("rule-form").addEventListener("change", function (event) {
    if (event.target.id === "rule-select") {
      return;
    }
    markRuleEditorDirty();
  });
  document.getElementById("restore-rules").addEventListener("click", restoreMasterRules);
  document.getElementById("add-reason").addEventListener("click", function () {
    addTextRow("reasons-list", "", true);
  });
  document.getElementById("add-warning").addEventListener("click", function () {
    addTextRow("warnings-list", "", true);
  });
  document.getElementById("add-next-step").addEventListener("click", function () {
    addTextRow("next-steps-list", "", true);
  });
  document.getElementById("add-question").addEventListener("click", function () {
    addTextRow("questions-list", "", true);
  });
  document.getElementById("add-no-match").addEventListener("click", function () {
    addTextRow("no-match-list", "", true);
  });
  window.addEventListener("beforeunload", function (event) {
    if (ruleEditorDirty === false) {
      return;
    }
    event.preventDefault();
    event.returnValue = "";
  });
}

function startRuleEditor(config) {
  ruleEditorConfig = config;
  ruleConditionDefinitions = createConditionDefinitions(config);
  buildRecommendationOptions(config);
  buildConditionEditors();
  buildChoiceGrid("phases-options", config.phases.phases, "phase_id", "display_name", "phase-");
  buildChoiceGrid("roles-options", config.roles.roles, "role_id", "name", "role-");
  fillRuleSelector("");
  addRuleEditorListeners();
  document.getElementById("rule-form").hidden = false;
  var selectedRuleId = document.getElementById("rule-select").value;
  loadRule(selectedRuleId);
}

PrismStorage.applyTheme();
ConfigManager.load().then(function (config) {
  startRuleEditor(config);
}).catch(function () {
  setRuleStatus("Could not load the decision rules. Start PMAID with python server.py and refresh this page.", "error");
});
