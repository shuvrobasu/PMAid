/* Load and merge master + org + project config. Browser reads JSON cache from YAML. */
var ConfigManager = {
  master: null,
  orgBundle: {},
  org: null,
  merged: null,
  modePromise: null,

  fileNames: [
    "problem_types",
    "ai_patterns",
    "methodologies",
    "phases",
    "tasks",
    "roles",
    "risks",
    "gates",
    "rules",
    "guidance",
    "eu_ai_act",
    "ui"
  ],

  deepMerge: function (base, overlay) {
    if (overlay === null || overlay === undefined) {
      return base;
    }
    if (typeof overlay !== "object") {
      return overlay;
    }
    if (Array.isArray(overlay)) {
      return overlay.slice();
    }
    var result = {};
    var key;
    if (base && typeof base === "object" && !Array.isArray(base)) {
      for (key in base) {
        if (Object.prototype.hasOwnProperty.call(base, key)) {
          result[key] = base[key];
        }
      }
    }
    for (key in overlay) {
      if (Object.prototype.hasOwnProperty.call(overlay, key)) {
        if (
          result[key] &&
          typeof result[key] === "object" &&
          !Array.isArray(result[key]) &&
          typeof overlay[key] === "object" &&
          !Array.isArray(overlay[key]) &&
          overlay[key] !== null
        ) {
          result[key] = ConfigManager.deepMerge(result[key], overlay[key]);
        } else {
          result[key] = overlay[key];
        }
      }
    }
    return result;
  },

  insertBrowserBanner: function () {
    if (document.getElementById("browser-mode-banner")) {
      return;
    }
    var header = document.querySelector(".app-header");
    if (header === null) {
      return;
    }
    var banner = document.createElement("div");
    banner.id = "browser-mode-banner";
    banner.className = "browser-mode-banner";
    banner.setAttribute("role", "status");
    banner.textContent = "Running in browser-only mode. Projects are saved in this browser only and will be lost if browser data is cleared. Start server.py for persistent storage.";
    header.insertAdjacentElement("afterend", banner);
  },

  showBrowserBanner: function () {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", ConfigManager.insertBrowserBanner, {
        once: true
      });
      return;
    }
    ConfigManager.insertBrowserBanner();
  },

  insertExitControl: function () {
    if (document.getElementById("exit-pmaid")) {
      return;
    }
    var navigation = document.querySelector(".app-header .app-nav");
    if (navigation === null) {
      return;
    }
    var button = document.createElement("button");
    button.id = "exit-pmaid";
    button.className = "exit-app-btn";
    button.type = "button";
    button.title = "Exit PMAID and stop its local services";
    button.setAttribute("aria-label", "Exit PMAID and stop local services");
    button.innerHTML = "<svg class=\"exit-app-icon\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 2v10M6.3 5.3a9 9 0 1 0 11.4 0\"/></svg><span>Exit</span>";
    button.addEventListener("click", function () {
      var confirmed = window.confirm(
        "Exit PMAID? This stops PMAID and the llama.cpp server on PMAID's configured port. Unsaved form changes will be lost."
      );
      if (confirmed === false) {
        return;
      }
      button.disabled = true;
      button.textContent = "Exiting…";
      fetch("/api/exit", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin"
      }).then(function (response) {
        if (response.ok === false) {
          throw new Error("Exit request failed");
        }
        document.body.innerHTML = "<main class=\"exit-confirmation\"><h1>PMAID has stopped</h1><p>The PMAID server and its llama.cpp listener have been stopped. You can close this tab.</p></main>";
      }).catch(function () {
        button.disabled = false;
        button.innerHTML = "<svg class=\"exit-app-icon\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 2v10M6.3 5.3a9 9 0 1 0 11.4 0\"/></svg><span>Exit</span>";
        window.alert("PMAID could not be stopped. Use python stop_server.py from the project folder.");
      });
    });
    navigation.appendChild(button);
  },

  showExitControl: function () {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", ConfigManager.insertExitControl, {
        once: true
      });
      return;
    }
    ConfigManager.insertExitControl();
  },

  detectMode: function () {
    if (ConfigManager.modePromise) {
      return ConfigManager.modePromise;
    }
    var controller = new AbortController();
    var timeoutId = window.setTimeout(function () {
      controller.abort();
    }, 2000);
    ConfigManager.modePromise = fetch("/api/projects", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal
    }).then(function (response) {
      window.clearTimeout(timeoutId);
      if (response.ok === false) {
        throw new Error("Project API is unavailable");
      }
      window.PMAID_MODE = "server";
      ConfigManager.showExitControl();
      return window.PMAID_MODE;
    }).catch(function () {
      window.clearTimeout(timeoutId);
      window.PMAID_MODE = "browser";
      ConfigManager.showBrowserBanner();
      return window.PMAID_MODE;
    });
    return ConfigManager.modePromise;
  },

  whenModeReady: function () {
    return ConfigManager.detectMode();
  },

  fetchJson: function (url) {
    if (window.PMAID_MODE === "browser") {
      if (url.indexOf("/api/") === 0) {
        return Promise.reject(new Error("API calls are disabled in browser-only mode"));
      }
    }
    return fetch(url).then(function (response) {
      if (!response.ok) {
        throw new Error("Failed to load " + url);
      }
      return response.json();
    });
  },

  loadMaster: function () {
    var root = new URL("../config/cache/", window.location.href).href;
    var promises = ConfigManager.fileNames.map(function (name) {
      return ConfigManager.fetchJson(root + name + ".json").then(function (data) {
        return { name: name, data: data };
      });
    });
    return Promise.all(promises).then(function (parts) {
      var master = {};
      var i = 0;
      while (i < parts.length) {
        master[parts[i].name] = parts[i].data;
        i = i + 1;
      }
      ConfigManager.master = master;
      return master;
    });
  },

  loadOrg: function () {
    var org = PrismStorage.load("prism_org_config", {});
    ConfigManager.org = org;
    return Promise.resolve(org);
  },

  loadOrgBundle: function () {
    if (window.PMAID_MODE === "browser") {
      ConfigManager.orgBundle = {};
      return Promise.resolve(ConfigManager.orgBundle);
    }
    return ConfigManager.fetchJson("/api/config/org").then(function (bundle) {
      if (bundle === null) {
        ConfigManager.orgBundle = {};
        return ConfigManager.orgBundle;
      }
      if (typeof bundle !== "object") {
        ConfigManager.orgBundle = {};
        return ConfigManager.orgBundle;
      }
      if (typeof bundle.config !== "object") {
        ConfigManager.orgBundle = {};
        return ConfigManager.orgBundle;
      }
      if (bundle.config === null) {
        ConfigManager.orgBundle = {};
        return ConfigManager.orgBundle;
      }
      ConfigManager.orgBundle = bundle.config;
      return ConfigManager.orgBundle;
    }).catch(function () {
      ConfigManager.orgBundle = {};
      return ConfigManager.orgBundle;
    });
  },

  mergeAll: function (projectOverlay) {
    var merged = ConfigManager.deepMerge({}, ConfigManager.master);
    if (ConfigManager.orgBundle) {
      merged = ConfigManager.deepMerge(merged, ConfigManager.orgBundle);
    }
    if (ConfigManager.org) {
      merged = ConfigManager.deepMerge(merged, ConfigManager.org);
    }
    if (projectOverlay) {
      merged = ConfigManager.deepMerge(merged, projectOverlay);
    }
    ConfigManager.merged = merged;
    return merged;
  },

  load: function (projectOverlay) {
    return ConfigManager.whenModeReady().then(function () {
      return ConfigManager.loadMaster();
    }).then(function () {
      return ConfigManager.loadOrgBundle();
    }).then(function () {
      return ConfigManager.loadOrg();
    }).then(function () {
      return ConfigManager.mergeAll(projectOverlay);
    });
  },

  get: function () {
    return ConfigManager.merged;
  },

  getUi: function () {
    if (!ConfigManager.merged) {
      return null;
    }
    return ConfigManager.merged.ui;
  },

  saveOrg: function (orgConfig) {
    ConfigManager.org = orgConfig;
    PrismStorage.save("prism_org_config", orgConfig);
    ConfigManager.mergeAll(null);
    return true;
  },

  getOrgBundleConfig: function () {
    return ConfigManager.deepMerge({}, ConfigManager.orgBundle);
  },

  getOrgEffective: function () {
    var effective = ConfigManager.deepMerge({}, ConfigManager.master);
    if (ConfigManager.orgBundle) {
      effective = ConfigManager.deepMerge(effective, ConfigManager.orgBundle);
    }
    return effective;
  },

  saveOrgBundle: function (orgConfig) {
    if (window.PMAID_MODE === "browser") {
      return Promise.reject(new Error("Shared organisation bundles require server.py"));
    }
    var bundle = {
      format: "pmaid-org-config",
      version: 1,
      config: orgConfig
    };
    return fetch("/api/config/org", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(bundle)
    }).then(function (response) {
      if (response.ok) {
        return response.json();
      }
      return response.json().then(function (errorBody) {
        var message = "Could not save the organisation bundle.";
        if (errorBody) {
          if (typeof errorBody.error === "string") {
            message = errorBody.error;
          }
        }
        throw new Error(message);
      });
    }).then(function (savedBundle) {
      ConfigManager.orgBundle = savedBundle.config;
      ConfigManager.mergeAll(null);
      return savedBundle;
    });
  }
};

ConfigManager.detectMode();
