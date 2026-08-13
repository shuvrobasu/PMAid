/* Browser preferences plus one-time migration support; projects live in SQLite */
var PrismStorage = {
  save: function (key, value) {
    var text = JSON.stringify(value);
    localStorage.setItem(key, text);
    return true;
  },

  load: function (key, fallback) {
    var text = localStorage.getItem(key);
    if (text === null) {
      if (fallback === undefined) {
        return null;
      }
      return fallback;
    }
    try {
      return JSON.parse(text);
    } catch (err) {
      if (fallback === undefined) {
        return null;
      }
      return fallback;
    }
  },

  clear: function (key) {
    if (key) {
      localStorage.removeItem(key);
      return true;
    }
    localStorage.clear();
    return true;
  },

  has: function (key) {
    var text = localStorage.getItem(key);
    if (text === null) {
      return false;
    }
    return true;
  },

  keys: function (prefix) {
    var result = [];
    var i = 0;
    while (i < localStorage.length) {
      var k = localStorage.key(i);
      if (prefix) {
        if (k.indexOf(prefix) === 0) {
          result.push(k);
        }
      } else {
        result.push(k);
      }
      i = i + 1;
    }
    return result;
  },

  applyTheme: function () {
    var theme = PrismStorage.load("prism_theme", "light");
    if (theme !== "dark") {
      theme = "light";
    }
    document.body.className = "theme-" + theme;
    return theme;
  }
};
