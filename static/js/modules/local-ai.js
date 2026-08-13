/* Optional llama.cpp completion client shared by PMAID AI-assisted features. */
var LocalAI = {
  settings: null,
  healthPromise: null,

  configure: function (config) {
    LocalAI.settings = null;
    if (config === null) {
      return false;
    }
    if (config === undefined) {
      return false;
    }
    if (config.ui === null) {
      return false;
    }
    if (config.ui === undefined) {
      return false;
    }
    if (config.ui.local_ai === null) {
      return false;
    }
    if (config.ui.local_ai === undefined) {
      return false;
    }
    if (config.ui.local_ai.enabled !== true) {
      return false;
    }
    if (typeof config.ui.local_ai.endpoint !== "string") {
      return false;
    }
    if (config.ui.local_ai.endpoint.length === 0) {
      return false;
    }
    LocalAI.settings = config.ui.local_ai;
    return true;
  },

  timeoutMilliseconds: function () {
    var seconds = 30;
    if (LocalAI.settings.timeout_seconds !== undefined) {
      seconds = Number(LocalAI.settings.timeout_seconds);
    }
    if (Number.isFinite(seconds) === false) {
      seconds = 30;
    }
    if (seconds <= 0) {
      seconds = 30;
    }
    return seconds * 1000;
  },

  formatPrompt: function (prompt) {
    var modelPath = "";
    if (typeof LocalAI.settings.model_path === "string") {
      modelPath = LocalAI.settings.model_path.toLowerCase();
    }
    if (modelPath.indexOf("mistral") >= 0) {
      return "[INST] " + prompt + " [/INST]";
    }
    return prompt;
  },

  complete: function (prompt) {
    if (LocalAI.settings === null) {
      return Promise.resolve(null);
    }
    if (typeof window.fetch !== "function") {
      return Promise.resolve(null);
    }
    if (typeof window.AbortController !== "function") {
      return Promise.resolve(null);
    }
    var controller = new window.AbortController();
    var timeoutId = window.setTimeout(function () {
      controller.abort();
    }, LocalAI.timeoutMilliseconds());
    var body = {
      prompt: LocalAI.formatPrompt(prompt),
      n_predict: 256,
      temperature: 0.3,
      stop: ["\n\n"]
    };
    return window.fetch(LocalAI.settings.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    }).then(function (response) {
      if (response.ok === false) {
        return null;
      }
      return response.json();
    }).then(function (response) {
      window.clearTimeout(timeoutId);
      if (response === null) {
        return null;
      }
      if (response === undefined) {
        return null;
      }
      if (typeof response.content !== "string") {
        return null;
      }
      var content = response.content.trim();
      if (content.length === 0) {
        return null;
      }
      return content;
    }).catch(function () {
      window.clearTimeout(timeoutId);
      return null;
    });
  },

  check: function (config) {
    if (LocalAI.healthPromise !== null) {
      return LocalAI.healthPromise;
    }
    var configured = LocalAI.configure(config);
    if (configured === false) {
      LocalAI.healthPromise = Promise.resolve(false);
      return LocalAI.healthPromise;
    }
    LocalAI.healthPromise = LocalAI.complete("Reply with OK.").then(function (content) {
      if (content === null) {
        return false;
      }
      return true;
    });
    return LocalAI.healthPromise;
  }
};
