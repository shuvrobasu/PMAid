/* Risk helpers for heat map and registers */
var RiskAnalyzer = {
  score: function (risk) {
    var l = risk.likelihood || 1;
    var i = risk.impact || 1;
    return l * i;
  },

  level: function (risk) {
    var s = RiskAnalyzer.score(risk);
    if (s >= 16) {
      return "critical";
    }
    if (s >= 10) {
      return "high";
    }
    if (s >= 5) {
      return "medium";
    }
    return "low";
  },

  grid: function (risks) {
    // 5x5 impact (y) vs likelihood (x), 1..5
    var cells = {};
    var l = 1;
    while (l <= 5) {
      var im = 1;
      while (im <= 5) {
        cells[l + "_" + im] = [];
        im = im + 1;
      }
      l = l + 1;
    }
    var i = 0;
    while (i < risks.length) {
      var risk = risks[i];
      var lk = risk.likelihood;
      var ip = risk.impact;
      if (lk < 1) {
        lk = 1;
      }
      if (lk > 5) {
        lk = 5;
      }
      if (ip < 1) {
        ip = 1;
      }
      if (ip > 5) {
        ip = 5;
      }
      var key = lk + "_" + ip;
      cells[key].push(risk);
      i = i + 1;
    }
    return cells;
  }
};
