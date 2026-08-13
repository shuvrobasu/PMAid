/* Guided CRUD for organisation task, role, and risk libraries. */
var ConfigLibraryEditor = {
  config: null,
  libraryType: "tasks",
  items: [],
  editingId: null,

  definitions: {
    tasks: {
      title: "Task Library",
      description: "Create and maintain the tasks that phases can include in newly generated plans.",
      group: "tasks",
      list: "tasks",
      id: "task_id",
      name: "name"
    },
    roles: {
      title: "Role Library",
      description: "Create and maintain project roles and their default RACI responsibility.",
      group: "roles",
      list: "roles",
      id: "role_id",
      name: "name"
    },
    risks: {
      title: "Risk Library",
      description: "Create and maintain risks, scoring defaults, categories, and relevant phases.",
      group: "risks",
      list: "risks",
      id: "risk_id",
      name: "title"
    }
  },

  definition: function () {
    return ConfigLibraryEditor.definitions[ConfigLibraryEditor.libraryType];
  },

  requestedType: function () {
    var params = new URLSearchParams(window.location.search);
    var requested = params.get("type");
    var allowed = ["tasks", "roles", "risks"];
    if (allowed.indexOf(requested) < 0) {
      return "tasks";
    }
    return requested;
  },

  clone: function (value) {
    return JSON.parse(JSON.stringify(value));
  },

  setStatus: function (message, isError) {
    var status = document.getElementById("editor-status");
    status.textContent = message;
    status.className = "muted";
    if (isError) {
      status.className = "ai-error";
    }
  },

  makeOption: function (value, label, selected) {
    var option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    if (selected) {
      option.selected = true;
    }
    return option;
  },

  loadItems: function () {
    var definition = ConfigLibraryEditor.definition();
    var group = ConfigLibraryEditor.config[definition.group];
    ConfigLibraryEditor.items = [];
    if (group === undefined) {
      return;
    }
    if (group === null) {
      return;
    }
    var list = group[definition.list];
    if (Array.isArray(list) === false) {
      return;
    }
    ConfigLibraryEditor.items = ConfigLibraryEditor.clone(list);
    if (ConfigLibraryEditor.libraryType === "roles") {
      var i = 0;
      while (i < ConfigLibraryEditor.items.length) {
        ConfigLibraryEditor.items[i].phases = ConfigLibraryEditor.phasesForReference(
          "default_roles",
          ConfigLibraryEditor.items[i].role_id
        );
        i = i + 1;
      }
    }
  },

  phasesForReference: function (referenceField, entryId) {
    var result = [];
    var phases = ConfigLibraryEditor.config.phases.phases;
    var i = 0;
    while (i < phases.length) {
      var references = phases[i][referenceField];
      if (Array.isArray(references)) {
        if (references.indexOf(entryId) >= 0) {
          result.push(phases[i].phase_id);
        }
      }
      i = i + 1;
    }
    return result;
  },

  renderShell: function () {
    var definition = ConfigLibraryEditor.definition();
    document.getElementById("library-title").textContent = definition.title;
    document.getElementById("library-description").textContent = definition.description;
    document.getElementById("library-type").value = ConfigLibraryEditor.libraryType;
    var select = document.getElementById("entry-select");
    select.innerHTML = "";
    var i = 0;
    while (i < ConfigLibraryEditor.items.length) {
      var item = ConfigLibraryEditor.items[i];
      var id = item[definition.id];
      var label = item[definition.name];
      select.appendChild(ConfigLibraryEditor.makeOption(id, label, false));
      i = i + 1;
    }
    if (ConfigLibraryEditor.items.length === 0) {
      ConfigLibraryEditor.newEntry();
      return;
    }
    var selectedId = ConfigLibraryEditor.editingId;
    if (selectedId === null) {
      selectedId = ConfigLibraryEditor.items[0][definition.id];
    }
    select.value = selectedId;
    ConfigLibraryEditor.selectEntry(selectedId);
  },

  fieldMarkup: function (id, label, type) {
    var html = "<div class='form-group'>";
    html = html + "<label for='" + id + "'>" + label + "</label>";
    if (type === "textarea") {
      html = html + "<textarea id='" + id + "'></textarea>";
    } else {
      html = html + "<input type='" + type + "' id='" + id + "'>";
    }
    html = html + "</div>";
    return html;
  },

  renderTaskFields: function () {
    var root = document.getElementById("entry-fields");
    root.innerHTML = ConfigLibraryEditor.fieldMarkup("entry-id", "Task ID", "text") +
      ConfigLibraryEditor.fieldMarkup("entry-name", "Task name", "text") +
      ConfigLibraryEditor.fieldMarkup("entry-description", "Description", "textarea") +
      "<div class='form-group'><label for='entry-phase'>Phase</label><select id='entry-phase'></select></div>" +
      "<div class='form-group'><label for='entry-complexity'>Complexity</label><select id='entry-complexity'></select></div>";
    var phaseSelect = document.getElementById("entry-phase");
    var phases = ConfigLibraryEditor.config.phases.phases;
    var i = 0;
    while (i < phases.length) {
      phaseSelect.appendChild(ConfigLibraryEditor.makeOption(phases[i].phase_id, phases[i].display_name, false));
      i = i + 1;
    }
    var complexitySelect = document.getElementById("entry-complexity");
    var complexities = ["Low", "Medium", "High", "Very High"];
    i = 0;
    while (i < complexities.length) {
      complexitySelect.appendChild(ConfigLibraryEditor.makeOption(complexities[i], complexities[i], false));
      i = i + 1;
    }
  },

  renderRoleFields: function () {
    var root = document.getElementById("entry-fields");
    root.innerHTML = ConfigLibraryEditor.fieldMarkup("entry-id", "Role ID", "text") +
      ConfigLibraryEditor.fieldMarkup("entry-name", "Role name", "text") +
      ConfigLibraryEditor.fieldMarkup("entry-description", "Description", "textarea") +
      "<div class='form-group'><label for='entry-raci'>Default RACI responsibility</label><select id='entry-raci'></select></div>" +
      "<fieldset class='form-group'><legend>Relevant phases</legend><div class='check-list' id='entry-phases'></div></fieldset>";
    var raci = document.getElementById("entry-raci");
    raci.appendChild(ConfigLibraryEditor.makeOption("R", "R — Responsible", false));
    raci.appendChild(ConfigLibraryEditor.makeOption("A", "A — Accountable", false));
    raci.appendChild(ConfigLibraryEditor.makeOption("C", "C — Consulted", false));
    raci.appendChild(ConfigLibraryEditor.makeOption("I", "I — Informed", false));
    ConfigLibraryEditor.renderPhaseChecks();
  },

  renderPhaseChecks: function () {
    var phaseRoot = document.getElementById("entry-phases");
    var phases = ConfigLibraryEditor.config.phases.phases;
    var i = 0;
    while (i < phases.length) {
      var label = document.createElement("label");
      var input = document.createElement("input");
      input.type = "checkbox";
      input.value = phases[i].phase_id;
      input.setAttribute("data-entry-phase", "true");
      var text = document.createElement("span");
      text.textContent = phases[i].display_name;
      label.appendChild(input);
      label.appendChild(text);
      phaseRoot.appendChild(label);
      i = i + 1;
    }
  },

  riskCategories: function () {
    var result = [];
    var i = 0;
    while (i < ConfigLibraryEditor.items.length) {
      var category = ConfigLibraryEditor.items[i].category;
      if (typeof category === "string") {
        if (result.indexOf(category) < 0) {
          result.push(category);
        }
      }
      i = i + 1;
    }
    result.sort();
    return result;
  },

  renderRiskFields: function () {
    var root = document.getElementById("entry-fields");
    root.innerHTML = ConfigLibraryEditor.fieldMarkup("entry-id", "Risk ID", "text") +
      ConfigLibraryEditor.fieldMarkup("entry-name", "Risk title", "text") +
      ConfigLibraryEditor.fieldMarkup("entry-description", "Description", "textarea") +
      "<div class='form-group'><label for='entry-category'>Category</label><select id='entry-category'></select></div>" +
      "<div class='grid-2'><div class='form-group'><label for='entry-likelihood'>Default likelihood (1–5)</label><input type='number' id='entry-likelihood' min='1' max='5'></div>" +
      "<div class='form-group'><label for='entry-impact'>Default impact (1–5)</label><input type='number' id='entry-impact' min='1' max='5'></div></div>" +
      "<fieldset class='form-group'><legend>Relevant phases</legend><div class='check-list' id='entry-phases'></div></fieldset>";
    var categorySelect = document.getElementById("entry-category");
    var categories = ConfigLibraryEditor.riskCategories();
    var i = 0;
    while (i < categories.length) {
      categorySelect.appendChild(ConfigLibraryEditor.makeOption(categories[i], categories[i], false));
      i = i + 1;
    }
    ConfigLibraryEditor.renderPhaseChecks();
  },

  renderFields: function () {
    if (ConfigLibraryEditor.libraryType === "tasks") {
      ConfigLibraryEditor.renderTaskFields();
      return;
    }
    if (ConfigLibraryEditor.libraryType === "roles") {
      ConfigLibraryEditor.renderRoleFields();
      return;
    }
    ConfigLibraryEditor.renderRiskFields();
  },

  findItem: function (id) {
    var definition = ConfigLibraryEditor.definition();
    var i = 0;
    while (i < ConfigLibraryEditor.items.length) {
      if (ConfigLibraryEditor.items[i][definition.id] === id) {
        return ConfigLibraryEditor.items[i];
      }
      i = i + 1;
    }
    return null;
  },

  fillCommon: function (item) {
    var definition = ConfigLibraryEditor.definition();
    var idInput = document.getElementById("entry-id");
    idInput.value = item[definition.id];
    idInput.readOnly = true;
    document.getElementById("entry-name").value = item[definition.name];
    var description = item.description;
    if (typeof description !== "string") {
      description = "";
    }
    document.getElementById("entry-description").value = description;
  },

  fillTask: function (item) {
    document.getElementById("entry-phase").value = item.phase;
    document.getElementById("entry-complexity").value = item.complexity;
  },

  fillRole: function (item) {
    document.getElementById("entry-raci").value = item.raci_default;
    ConfigLibraryEditor.fillPhaseChecks(item.phases);
  },

  ensureRiskCategory: function (category) {
    var select = document.getElementById("entry-category");
    var found = false;
    var i = 0;
    while (i < select.options.length) {
      if (select.options[i].value === category) {
        found = true;
        break;
      }
      i = i + 1;
    }
    if (found === false) {
      select.appendChild(ConfigLibraryEditor.makeOption(category, category, false));
    }
  },

  fillRisk: function (item) {
    ConfigLibraryEditor.ensureRiskCategory(item.category);
    document.getElementById("entry-category").value = item.category;
    document.getElementById("entry-likelihood").value = item.default_likelihood;
    document.getElementById("entry-impact").value = item.default_impact;
    var phases = item.phases;
    if (Array.isArray(phases) === false) {
      phases = [];
    }
    ConfigLibraryEditor.fillPhaseChecks(phases);
  },

  fillPhaseChecks: function (phases) {
    var selected = phases;
    if (Array.isArray(selected) === false) {
      selected = [];
    }
    var inputs = document.querySelectorAll("input[data-entry-phase='true']");
    var i = 0;
    while (i < inputs.length) {
      inputs[i].checked = selected.indexOf(inputs[i].value) >= 0;
      i = i + 1;
    }
  },

  selectEntry: function (id) {
    var item = ConfigLibraryEditor.findItem(id);
    if (item === null) {
      ConfigLibraryEditor.newEntry();
      return;
    }
    ConfigLibraryEditor.editingId = id;
    ConfigLibraryEditor.renderFields();
    ConfigLibraryEditor.fillCommon(item);
    if (ConfigLibraryEditor.libraryType === "tasks") {
      ConfigLibraryEditor.fillTask(item);
    }
    if (ConfigLibraryEditor.libraryType === "roles") {
      ConfigLibraryEditor.fillRole(item);
    }
    if (ConfigLibraryEditor.libraryType === "risks") {
      ConfigLibraryEditor.fillRisk(item);
    }
    document.getElementById("delete-entry").disabled = false;
    ConfigLibraryEditor.setStatus("Editing " + id + ".", false);
  },

  newEntry: function () {
    ConfigLibraryEditor.editingId = null;
    ConfigLibraryEditor.renderFields();
    var idInput = document.getElementById("entry-id");
    idInput.value = "";
    idInput.readOnly = false;
    document.getElementById("entry-name").value = "";
    document.getElementById("entry-description").value = "";
    if (ConfigLibraryEditor.libraryType === "tasks") {
      document.getElementById("entry-complexity").value = "Medium";
    }
    if (ConfigLibraryEditor.libraryType === "roles") {
      document.getElementById("entry-raci").value = "C";
    }
    if (ConfigLibraryEditor.libraryType === "risks") {
      document.getElementById("entry-likelihood").value = "3";
      document.getElementById("entry-impact").value = "3";
    }
    document.getElementById("delete-entry").disabled = true;
    ConfigLibraryEditor.setStatus("Enter the new item details.", false);
    idInput.focus();
  },

  validateId: function (id) {
    return /^[a-z][a-z0-9_]*$/.test(id);
  },

  commonValue: function () {
    var definition = ConfigLibraryEditor.definition();
    var id = document.getElementById("entry-id").value.trim();
    var name = document.getElementById("entry-name").value.trim();
    var description = document.getElementById("entry-description").value.trim();
    if (ConfigLibraryEditor.validateId(id) === false) {
      throw new Error("ID must start with a letter and contain only lowercase letters, numbers, and underscores.");
    }
    if (name.length === 0) {
      throw new Error("Name is required.");
    }
    if (description.length === 0) {
      throw new Error("Description is required.");
    }
    var value = {
      description: description
    };
    value[definition.id] = id;
    value[definition.name] = name;
    return value;
  },

  collectSelectedPhases: function () {
    var result = [];
    var inputs = document.querySelectorAll("input[data-entry-phase='true']");
    var i = 0;
    while (i < inputs.length) {
      if (inputs[i].checked) {
        result.push(inputs[i].value);
      }
      i = i + 1;
    }
    return result;
  },

  collectValue: function () {
    var value = ConfigLibraryEditor.commonValue();
    if (ConfigLibraryEditor.libraryType === "tasks") {
      value.phase = document.getElementById("entry-phase").value;
      value.complexity = document.getElementById("entry-complexity").value;
      return value;
    }
    if (ConfigLibraryEditor.libraryType === "roles") {
      value.raci_default = document.getElementById("entry-raci").value;
      value.phases = ConfigLibraryEditor.collectSelectedPhases();
      if (value.phases.length === 0) {
        throw new Error("Select at least one relevant phase.");
      }
      return value;
    }
    value.category = document.getElementById("entry-category").value;
    value.default_likelihood = Number(document.getElementById("entry-likelihood").value);
    value.default_impact = Number(document.getElementById("entry-impact").value);
    value.phases = ConfigLibraryEditor.collectSelectedPhases();
    if (value.phases.length === 0) {
      throw new Error("Select at least one relevant phase.");
    }
    return value;
  },

  saveItems: function (successMessage) {
    var definition = ConfigLibraryEditor.definition();
    var orgConfig = ConfigManager.getOrgBundleConfig();
    orgConfig[definition.group] = {};
    orgConfig[definition.group][definition.list] = ConfigLibraryEditor.clone(ConfigLibraryEditor.items);
    ConfigLibraryEditor.synchronisePhaseReferences(orgConfig);
    ConfigLibraryEditor.setStatus("Saving…", false);
    return ConfigManager.saveOrgBundle(orgConfig).then(function () {
      ConfigLibraryEditor.config = ConfigManager.getOrgEffective();
      ConfigLibraryEditor.loadItems();
      ConfigLibraryEditor.renderShell();
      ConfigLibraryEditor.setStatus(successMessage, false);
    }).catch(function (error) {
      ConfigLibraryEditor.setStatus(error.message, true);
    });
  },

  synchronisePhaseReferences: function (orgConfig) {
    var field = "default_tasks";
    if (ConfigLibraryEditor.libraryType === "roles") {
      field = "default_roles";
    }
    if (ConfigLibraryEditor.libraryType === "risks") {
      field = "default_risks";
    }
    var phases = ConfigLibraryEditor.clone(ConfigLibraryEditor.config.phases.phases);
    var i = 0;
    while (i < phases.length) {
      phases[i][field] = [];
      i = i + 1;
    }
    i = 0;
    while (i < ConfigLibraryEditor.items.length) {
      var item = ConfigLibraryEditor.items[i];
      var phaseIds = [];
      var entryId = item.task_id;
      if (ConfigLibraryEditor.libraryType === "tasks") {
        phaseIds.push(item.phase);
      }
      if (ConfigLibraryEditor.libraryType === "roles") {
        entryId = item.role_id;
        phaseIds = item.phases;
      }
      if (ConfigLibraryEditor.libraryType === "risks") {
        entryId = item.risk_id;
        phaseIds = item.phases;
      }
      var p = 0;
      while (p < phases.length) {
        if (phaseIds.indexOf(phases[p].phase_id) >= 0) {
          phases[p][field].push(entryId);
        }
        p = p + 1;
      }
      i = i + 1;
    }
    orgConfig.phases = {
      phases: phases
    };
  },

  submit: function (event) {
    event.preventDefault();
    var value;
    try {
      value = ConfigLibraryEditor.collectValue();
    } catch (error) {
      ConfigLibraryEditor.setStatus(error.message, true);
      return;
    }
    var definition = ConfigLibraryEditor.definition();
    var id = value[definition.id];
    if (ConfigLibraryEditor.editingId === null) {
      if (ConfigLibraryEditor.findItem(id) !== null) {
        ConfigLibraryEditor.setStatus("That ID already exists.", true);
        return;
      }
      ConfigLibraryEditor.items.push(value);
    } else {
      var i = 0;
      while (i < ConfigLibraryEditor.items.length) {
        if (ConfigLibraryEditor.items[i][definition.id] === ConfigLibraryEditor.editingId) {
          ConfigLibraryEditor.items[i] = value;
          break;
        }
        i = i + 1;
      }
    }
    ConfigLibraryEditor.editingId = id;
    ConfigLibraryEditor.saveItems("Saved " + id + " in the organisation bundle.");
  },

  deleteEntry: function () {
    if (ConfigLibraryEditor.editingId === null) {
      return;
    }
    var confirmed = window.confirm("Delete " + ConfigLibraryEditor.editingId + " from the organisation library? Existing saved projects keep their embedded copy.");
    if (confirmed === false) {
      return;
    }
    var definition = ConfigLibraryEditor.definition();
    var next = [];
    var i = 0;
    while (i < ConfigLibraryEditor.items.length) {
      if (ConfigLibraryEditor.items[i][definition.id] !== ConfigLibraryEditor.editingId) {
        next.push(ConfigLibraryEditor.items[i]);
      }
      i = i + 1;
    }
    var deletedId = ConfigLibraryEditor.editingId;
    ConfigLibraryEditor.items = next;
    ConfigLibraryEditor.editingId = null;
    ConfigLibraryEditor.saveItems("Deleted " + deletedId + " from the organisation bundle.");
  },

  restoreMaster: function () {
    var definition = ConfigLibraryEditor.definition();
    var confirmed = window.confirm("Remove all organisation changes to " + definition.title.toLowerCase() + " and restore the master library?");
    if (confirmed === false) {
      return;
    }
    var orgConfig = ConfigManager.getOrgBundleConfig();
    delete orgConfig[definition.group];
    ConfigLibraryEditor.restoreMasterPhaseReferences(orgConfig);
    ConfigLibraryEditor.setStatus("Restoring…", false);
    ConfigManager.saveOrgBundle(orgConfig).then(function () {
      ConfigLibraryEditor.config = ConfigManager.getOrgEffective();
      ConfigLibraryEditor.editingId = null;
      ConfigLibraryEditor.loadItems();
      ConfigLibraryEditor.renderShell();
      ConfigLibraryEditor.setStatus("Master " + definition.title.toLowerCase() + " restored.", false);
    }).catch(function (error) {
      ConfigLibraryEditor.setStatus(error.message, true);
    });
  },

  restoreMasterPhaseReferences: function (orgConfig) {
    var field = "default_tasks";
    if (ConfigLibraryEditor.libraryType === "roles") {
      field = "default_roles";
    }
    if (ConfigLibraryEditor.libraryType === "risks") {
      field = "default_risks";
    }
    var phases = ConfigLibraryEditor.clone(ConfigLibraryEditor.config.phases.phases);
    var masterPhases = ConfigManager.master.phases.phases;
    var i = 0;
    while (i < phases.length) {
      var j = 0;
      while (j < masterPhases.length) {
        if (masterPhases[j].phase_id === phases[i].phase_id) {
          phases[i][field] = ConfigLibraryEditor.clone(masterPhases[j][field]);
          break;
        }
        j = j + 1;
      }
      i = i + 1;
    }
    orgConfig.phases = {
      phases: phases
    };
  },

  changeLibrary: function (event) {
    ConfigLibraryEditor.libraryType = event.target.value;
    var target = "/pages/config-library.html?type=" + encodeURIComponent(ConfigLibraryEditor.libraryType);
    window.history.replaceState({}, "", target);
    ConfigLibraryEditor.editingId = null;
    ConfigLibraryEditor.loadItems();
    ConfigLibraryEditor.renderShell();
  },

  start: function () {
    PrismStorage.applyTheme();
    ConfigLibraryEditor.libraryType = ConfigLibraryEditor.requestedType();
    ConfigManager.load().then(function (config) {
      ConfigLibraryEditor.config = ConfigManager.getOrgEffective();
      ConfigLibraryEditor.loadItems();
      ConfigLibraryEditor.renderShell();
      document.getElementById("library-type").addEventListener("change", ConfigLibraryEditor.changeLibrary);
      document.getElementById("entry-select").addEventListener("change", function (event) {
        ConfigLibraryEditor.selectEntry(event.target.value);
      });
      document.getElementById("new-entry").addEventListener("click", ConfigLibraryEditor.newEntry);
      document.getElementById("delete-entry").addEventListener("click", ConfigLibraryEditor.deleteEntry);
      document.getElementById("cancel-entry").addEventListener("click", function () {
        ConfigLibraryEditor.renderShell();
      });
      document.getElementById("restore-library").addEventListener("click", ConfigLibraryEditor.restoreMaster);
      document.getElementById("entry-form").addEventListener("submit", ConfigLibraryEditor.submit);
    }).catch(function () {
      ConfigLibraryEditor.setStatus("Could not load configuration. Start PMAID with python server.py.", true);
    });
  }
};

ConfigLibraryEditor.start();
