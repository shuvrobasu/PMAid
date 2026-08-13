/* Project state backed by SQLite in server mode or localStorage in browser mode */
var StateManager = {
  state: null,
  projects: [],
  readyPromise: null,
  writeChain: Promise.resolve(),
  lastError: null,
  browserProjectsKey: "pmaid_browser_projects",

  createEmpty: function (name) {
    var projectName = name;
    if (!projectName) {
      projectName = "Untitled Project";
    }
    return {
      project_id: StateManager.newId(),
      project_name: projectName,
      config_version: "1.0",
      methodology: "scrum",
      discovery_inputs: {},
      eu_tier: null,
      recommendations: null,
      phases: [],
      raci: {},
      risks: [],
      assumptions: [],
      stakeholder_map: [],
      non_ai_plan: null,
      question_back_list: [],
      version_history: [],
      custom_overrides: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  },

  newId: function () {
    return "proj_" + Date.now().toString(36) + "_" + Math.floor(Math.random() * 100000).toString(36);
  },

  request: function (method, path, value) {
    if (window.PMAID_MODE === "browser") {
      return Promise.reject(new Error("Project API calls are disabled in browser-only mode"));
    }
    var options = {
      method: method,
      cache: "no-store",
      credentials: "same-origin"
    };
    if (value !== undefined) {
      options.headers = {
        "Content-Type": "application/json"
      };
      options.body = JSON.stringify(value);
      options.keepalive = true;
    }
    return fetch(path, options).then(function (response) {
      if (!response.ok) {
        throw new Error("Project API returned " + response.status);
      }
      if (response.status === 204) {
        return null;
      }
      return response.json();
    });
  },

  ready: function () {
    if (StateManager.readyPromise) {
      return StateManager.readyPromise;
    }
    StateManager.readyPromise = ConfigManager.whenModeReady().then(function (mode) {
      if (mode === "browser") {
        StateManager.loadBrowserProjects();
        StateManager.restoreActive();
        return StateManager;
      }
      return StateManager.request("GET", "/api/projects").then(function (projects) {
        StateManager.projects = projects;
        return StateManager.migrateLegacyProjects();
      }).then(function () {
        return StateManager.request("GET", "/api/projects");
      }).then(function (projects) {
        StateManager.projects = projects;
        StateManager.restoreActive();
        return StateManager;
      });
    });
    return StateManager.readyPromise;
  },

  loadBrowserProjects: function () {
    var projects = PrismStorage.load(StateManager.browserProjectsKey, null);
    if (Array.isArray(projects) === false) {
      projects = PrismStorage.load("prism_projects", []);
    }
    if (Array.isArray(projects) === false) {
      projects = [];
    }
    StateManager.projects = projects;
    StateManager.saveBrowserProjects();
    return projects;
  },

  saveBrowserProjects: function () {
    PrismStorage.save(StateManager.browserProjectsKey, StateManager.projects);
    return true;
  },

  migrateLegacyProjects: function () {
    var marker = "pmaid_sqlite_migrated";
    if (PrismStorage.has(marker)) {
      return Promise.resolve(false);
    }
    var legacyProjects = PrismStorage.load("prism_projects", []);
    var legacyActive = PrismStorage.load("prism_active_project", null);
    if (legacyActive) {
      var activeFound = false;
      var ai = 0;
      while (ai < legacyProjects.length) {
        if (legacyProjects[ai].project_id === legacyActive.project_id) {
          activeFound = true;
          break;
        }
        ai = ai + 1;
      }
      if (activeFound === false) {
        legacyProjects.push(legacyActive);
      }
    }
    var writes = [];
    var i = 0;
    while (i < legacyProjects.length) {
      writes.push(StateManager.request("POST", "/api/projects", legacyProjects[i]));
      i = i + 1;
    }
    return Promise.all(writes).then(function () {
      if (legacyActive) {
        sessionStorage.setItem("pmaid_active_project_id", legacyActive.project_id);
      }
      PrismStorage.clear("prism_projects");
      PrismStorage.clear("prism_active_project");
      PrismStorage.save(marker, true);
      return true;
    });
  },

  restoreActive: function () {
    StateManager.state = null;
    var projectId = sessionStorage.getItem("pmaid_active_project_id");
    if (projectId === null) {
      return;
    }
    var i = 0;
    while (i < StateManager.projects.length) {
      if (StateManager.projects[i].project_id === projectId) {
        StateManager.state = StateManager.projects[i];
        return;
      }
      i = i + 1;
    }
    sessionStorage.removeItem("pmaid_active_project_id");
  },

  replaceProject: function (project) {
    var found = false;
    var i = 0;
    while (i < StateManager.projects.length) {
      if (StateManager.projects[i].project_id === project.project_id) {
        StateManager.projects[i] = project;
        found = true;
        break;
      }
      i = i + 1;
    }
    if (found === false) {
      StateManager.projects.push(project);
    }
  },

  queueWrite: function (project) {
    var snapshot = JSON.parse(JSON.stringify(project));
    if (window.PMAID_MODE === "browser") {
      StateManager.saveBrowserProjects();
      StateManager.writeChain = Promise.resolve(snapshot);
      return StateManager.writeChain;
    }
    StateManager.writeChain = StateManager.writeChain.catch(function (error) {
      StateManager.lastError = error;
      return null;
    }).then(function () {
      return StateManager.request("POST", "/api/projects", snapshot);
    });
    return StateManager.writeChain;
  },

  flush: function () {
    return StateManager.writeChain;
  },

  set: function (project) {
    StateManager.state = project;
    project.updated_at = new Date().toISOString();
    sessionStorage.setItem("pmaid_active_project_id", project.project_id);
    StateManager.replaceProject(project);
    StateManager.queueWrite(project);
    return project;
  },

  get: function () {
    return StateManager.state;
  },

  clearActive: function () {
    StateManager.state = null;
    sessionStorage.removeItem("pmaid_active_project_id");
  },

  listProjects: function () {
    return StateManager.projects.slice();
  },

  persistToList: function (project) {
    project.updated_at = new Date().toISOString();
    StateManager.replaceProject(project);
    StateManager.queueWrite(project);
    return project;
  },

  loadById: function (projectId) {
    var i = 0;
    while (i < StateManager.projects.length) {
      if (StateManager.projects[i].project_id === projectId) {
        StateManager.state = StateManager.projects[i];
        sessionStorage.setItem("pmaid_active_project_id", projectId);
        return StateManager.state;
      }
      i = i + 1;
    }
    return null;
  },

  deleteById: function (projectId) {
    var next = [];
    var i = 0;
    while (i < StateManager.projects.length) {
      if (StateManager.projects[i].project_id !== projectId) {
        next.push(StateManager.projects[i]);
      }
      i = i + 1;
    }
    StateManager.projects = next;
    var active = StateManager.get();
    if (active) {
      if (active.project_id === projectId) {
        StateManager.clearActive();
      }
    }
    if (window.PMAID_MODE === "browser") {
      StateManager.saveBrowserProjects();
      StateManager.writeChain = Promise.resolve(true);
      return StateManager.writeChain;
    }
    StateManager.writeChain = StateManager.writeChain.catch(function (error) {
      StateManager.lastError = error;
      return null;
    }).then(function () {
      return StateManager.request(
        "DELETE",
        "/api/projects/" + encodeURIComponent(projectId)
      );
    });
    return StateManager.writeChain;
  }
};
