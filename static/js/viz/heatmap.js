/* Risk heat map — impact vs likelihood grid */
var Heatmap = {
  render: function (container, project, onRiskClick) {
    container.innerHTML = "";
    var risks = project.risks || [];
    var cell = 88;
    var label = 52;
    var size = label + 5 * cell + 28;
    var pad = 10;
    var gap = 4;
    var r = 8;

    var wrap = document.createElement("div");
    wrap.className = "heatmap-wrap";
    wrap.style.position = "relative";

    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 " + size + " " + size);
    svg.setAttribute("width", "100%");
    svg.setAttribute("class", "heatmap-svg");

    var tip = document.createElement("div");
    tip.className = "heatmap-tooltip";
    tip.style.display = "none";
    tip.setAttribute("role", "tooltip");

    var xTitle = document.createElementNS("http://www.w3.org/2000/svg", "text");
    xTitle.setAttribute("x", String(label + 2.5 * cell));
    xTitle.setAttribute("y", String(size - 4));
    xTitle.setAttribute("text-anchor", "middle");
    xTitle.setAttribute("font-size", "12");
    xTitle.setAttribute("fill", "#333");
    xTitle.setAttribute("font-family", "Segoe UI, Arial, sans-serif");
    xTitle.textContent = "Likelihood →";
    svg.appendChild(xTitle);

    var yTitle = document.createElementNS("http://www.w3.org/2000/svg", "text");
    yTitle.setAttribute("x", "14");
    yTitle.setAttribute("y", String(label + 2.5 * cell));
    yTitle.setAttribute("text-anchor", "middle");
    yTitle.setAttribute("font-size", "12");
    yTitle.setAttribute("fill", "#333");
    yTitle.setAttribute("font-family", "Segoe UI, Arial, sans-serif");
    yTitle.setAttribute("transform", "rotate(-90 14 " + (label + 2.5 * cell) + ")");
    yTitle.textContent = "Impact →";
    svg.appendChild(yTitle);

    var impact = 5;
    while (impact >= 1) {
      var likelihood = 1;
      while (likelihood <= 5) {
        var x = label + (likelihood - 1) * cell;
        var y = label + (5 - impact) * cell;
        var score = likelihood * impact;
        var fill = Heatmap.color(score);
        var rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", String(x));
        rect.setAttribute("y", String(y));
        rect.setAttribute("width", String(cell - 3));
        rect.setAttribute("height", String(cell - 3));
        rect.setAttribute("rx", "4");
        rect.setAttribute("fill", fill);
        rect.setAttribute("stroke", "#fff");
        rect.setAttribute("stroke-width", "1");
        svg.appendChild(rect);
        likelihood = likelihood + 1;
      }
      var yLab = document.createElementNS("http://www.w3.org/2000/svg", "text");
      yLab.setAttribute("x", String(label - 10));
      yLab.setAttribute("y", String(label + (5 - impact) * cell + cell / 2 + 4));
      yLab.setAttribute("text-anchor", "end");
      yLab.setAttribute("font-size", "11");
      yLab.setAttribute("fill", "#333");
      yLab.setAttribute("font-family", "Segoe UI, Arial, sans-serif");
      yLab.textContent = String(impact);
      svg.appendChild(yLab);
      impact = impact - 1;
    }

    var lx = 1;
    while (lx <= 5) {
      var xLab = document.createElementNS("http://www.w3.org/2000/svg", "text");
      xLab.setAttribute("x", String(label + (lx - 1) * cell + cell / 2));
      xLab.setAttribute("y", String(label + 5 * cell + 18));
      xLab.setAttribute("text-anchor", "middle");
      xLab.setAttribute("font-size", "11");
      xLab.setAttribute("fill", "#333");
      xLab.setAttribute("font-family", "Segoe UI, Arial, sans-serif");
      xLab.textContent = String(lx);
      svg.appendChild(xLab);
      lx = lx + 1;
    }

    var detail = document.createElement("div");
    detail.className = "heatmap-detail";
    detail.id = "heatmap-detail";
    detail.textContent = "Hover a risk for the name. Click for full detail.";

    var grid = RiskAnalyzer.grid(risks);
    var key;
    for (key in grid) {
      if (Object.prototype.hasOwnProperty.call(grid, key)) {
        var parts = key.split("_");
        var L = parseInt(parts[0], 10);
        var I = parseInt(parts[1], 10);
        var list = grid[key];
        if (list.length === 0) {
          continue;
        }
        var cellX = label + (L - 1) * cell;
        var cellY = label + (5 - I) * cell;
        var n = list.length;
        var cols = Math.ceil(Math.sqrt(n));
        var rows = Math.ceil(n / cols);
        var step = 2 * r + gap;
        var gridW = cols * step - gap;
        var gridH = rows * step - gap;
        var startX = cellX + (cell - 3 - gridW) / 2 + r;
        var startY = cellY + (cell - 3 - gridH) / 2 + r;
        if (startX < cellX + pad + r) {
          startX = cellX + pad + r;
        }
        if (startY < cellY + pad + r) {
          startY = cellY + pad + r;
        }
        // shrink radius if grid still overflows
        var maxStepX = (cell - 3 - 2 * pad) / cols;
        var maxStepY = (cell - 3 - 2 * pad) / rows;
        var maxStep = maxStepX;
        if (maxStepY < maxStep) {
          maxStep = maxStepY;
        }
        var useR = r;
        var useStep = step;
        if (maxStep < step) {
          useStep = maxStep;
          useR = Math.floor((useStep - gap) / 2);
          if (useR < 5) {
            useR = 5;
          }
          gridW = cols * useStep - gap;
          gridH = rows * useStep - gap;
          startX = cellX + (cell - 3 - gridW) / 2 + useR;
          startY = cellY + (cell - 3 - gridH) / 2 + useR;
        }
        var di = 0;
        while (di < n) {
          var col = di % cols;
          var row = Math.floor(di / cols);
          var cx = startX + col * useStep;
          var cy = startY + row * useStep;
          Heatmap.addDot(svg, list[di], cx, cy, useR, wrap, tip, detail, onRiskClick);
          di = di + 1;
        }
      }
    }

    wrap.appendChild(svg);
    wrap.appendChild(tip);

    var visual = document.createElement("div");
    visual.className = "heatmap-visual";
    visual.appendChild(wrap);
    visual.appendChild(detail);

    var layout = document.createElement("div");
    layout.className = "heatmap-layout";
    layout.appendChild(visual);
    layout.appendChild(Heatmap.riskTable(risks));
    container.appendChild(layout);
  },

  riskTable: function (risks) {
    var panel = document.createElement("section");
    panel.className = "risk-table-panel";

    var heading = document.createElement("div");
    heading.className = "risk-table-heading";
    var title = document.createElement("h2");
    title.textContent = "Risk register";
    var count = document.createElement("span");
    count.className = "risk-count";
    count.textContent = risks.length + " risks";
    heading.appendChild(title);
    heading.appendChild(count);
    panel.appendChild(heading);

    if (risks.length === 0) {
      var empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "No risks are recorded for this project.";
      panel.appendChild(empty);
      return panel;
    }

    var sorted = risks.slice();
    sorted.sort(function (left, right) {
      return RiskAnalyzer.score(right) - RiskAnalyzer.score(left);
    });

    var scroll = document.createElement("div");
    scroll.className = "risk-summary-scroll";
    var table = document.createElement("table");
    table.className = "risk-summary-table";
    var thead = document.createElement("thead");
    var headRow = document.createElement("tr");
    var headings = ["Risk", "L", "I", "Score", "Level"];
    var hi = 0;
    while (hi < headings.length) {
      var th = document.createElement("th");
      th.textContent = headings[hi];
      headRow.appendChild(th);
      hi = hi + 1;
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    var i = 0;
    while (i < sorted.length) {
      var risk = sorted[i];
      var row = document.createElement("tr");
      var riskCell = document.createElement("td");
      var riskName = document.createElement("strong");
      riskName.textContent = risk.title;
      var riskDescription = document.createElement("small");
      riskDescription.textContent = "No description provided.";
      if (risk.description) {
        riskDescription.textContent = risk.description;
      }
      riskCell.appendChild(riskName);
      riskCell.appendChild(riskDescription);
      row.appendChild(riskCell);
      Heatmap.addTextCell(row, risk.likelihood);
      Heatmap.addTextCell(row, risk.impact);
      Heatmap.addTextCell(row, RiskAnalyzer.score(risk));
      Heatmap.addTextCell(row, RiskAnalyzer.level(risk));
      tbody.appendChild(row);
      i = i + 1;
    }
    table.appendChild(tbody);
    scroll.appendChild(table);
    panel.appendChild(scroll);
    return panel;
  },

  addTextCell: function (row, value) {
    var cell = document.createElement("td");
    cell.textContent = String(value);
    row.appendChild(cell);
  },

  addDot: function (svg, risk, cx, cy, radius, wrap, tip, detail, onRiskClick) {
    var g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.style.cursor = "pointer";

    // invisible hit target larger than the visible dot so hover is stable
    var hit = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    hit.setAttribute("cx", String(cx));
    hit.setAttribute("cy", String(cy));
    hit.setAttribute("r", String(radius + 4));
    hit.setAttribute("fill", "transparent");
    g.appendChild(hit);

    var dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", String(cx));
    dot.setAttribute("cy", String(cy));
    dot.setAttribute("r", String(radius));
    dot.setAttribute("fill", "#1E3A5F");
    dot.setAttribute("stroke", "#fff");
    dot.setAttribute("stroke-width", "2");
    dot.setAttribute("pointer-events", "none");
    g.appendChild(dot);

    var labelText = risk.title + " — L" + risk.likelihood + "/I" + risk.impact;

    g.addEventListener("mouseenter", function (ev) {
      tip.textContent = labelText;
      tip.style.display = "block";
      Heatmap.positionTip(wrap, tip, ev);
    });
    g.addEventListener("mousemove", function (ev) {
      Heatmap.positionTip(wrap, tip, ev);
    });
    g.addEventListener("mouseleave", function () {
      tip.style.display = "none";
    });
    g.addEventListener("click", function () {
      detail.innerHTML =
        "<strong>" + risk.title + "</strong><br>" +
        (risk.description || "") +
        "<br>Likelihood " + risk.likelihood +
        " · Impact " + risk.impact +
        " · Score " + RiskAnalyzer.score(risk) +
        " (" + RiskAnalyzer.level(risk) + ")";
      if (onRiskClick) {
        onRiskClick(risk);
      }
    });

    svg.appendChild(g);
  },

  positionTip: function (wrap, tip, ev) {
    var rect = wrap.getBoundingClientRect();
    var x = ev.clientX - rect.left + 14;
    var y = ev.clientY - rect.top - 36;
    if (y < 4) {
      y = ev.clientY - rect.top + 18;
    }
    var maxX = rect.width - 16;
    if (x > maxX - 120) {
      x = ev.clientX - rect.left - 140;
    }
    if (x < 4) {
      x = 4;
    }
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  },

  color: function (score) {
    if (score >= 16) {
      return "#ef9a9a";
    }
    if (score >= 10) {
      return "#ffcc80";
    }
    if (score >= 5) {
      return "#fff59d";
    }
    return "#c8e6c9";
  }
};
