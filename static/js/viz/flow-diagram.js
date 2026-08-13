/* SVG process flow — phase cards and arrows */
var FlowDiagram = {
  render: function (container, project, onPhaseClick) {
    container.innerHTML = "";
    var phases = ProcessBuilder.enabledPhases(project);
    if (phases.length === 0) {
      container.textContent = "No enabled phases.";
      return;
    }
    var cardH = 90;
    var gap = 40;
    var pad = 20;
    var cardWidths = [];
    var cardsWidth = 0;
    var wi = 0;
    while (wi < phases.length) {
      var widthDuration = ProcessBuilder.phaseDuration(phases[wi]);
      var phaseWidth = 120 + widthDuration.max * 8;
      cardWidths.push(phaseWidth);
      cardsWidth = cardsWidth + phaseWidth;
      wi = wi + 1;
    }
    var width = pad * 2 + cardsWidth + (phases.length - 1) * gap;
    var height = 220;
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("width", "100%");
    svg.setAttribute("class", "flow-svg");

    var i = 0;
    var cursorX = pad;
    while (i < phases.length) {
      var cardW = cardWidths[i];
      var x = cursorX;
      var y = 50;
      var g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "flow-card");
      g.setAttribute("data-phase", phases[i].phase_id);
      g.style.cursor = "pointer";

      var rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", String(y));
      rect.setAttribute("width", String(cardW));
      rect.setAttribute("height", String(cardH));
      rect.setAttribute("rx", "8");
      rect.setAttribute("fill", phases[i].color || "#1E3A5F");
      g.appendChild(rect);

      var title = document.createElementNS("http://www.w3.org/2000/svg", "text");
      title.setAttribute("x", String(x + 10));
      title.setAttribute("y", String(y + 28));
      title.setAttribute("fill", "#ffffff");
      title.setAttribute("font-size", "12");
      title.setAttribute("font-family", "Segoe UI, Arial, sans-serif");
      title.textContent = FlowDiagram.clip(phases[i].display_name, 22);
      g.appendChild(title);

      var meta = document.createElementNS("http://www.w3.org/2000/svg", "text");
      meta.setAttribute("x", String(x + 10));
      meta.setAttribute("y", String(y + 50));
      meta.setAttribute("fill", "#e8f1fa");
      meta.setAttribute("font-size", "11");
      meta.setAttribute("font-family", "Segoe UI, Arial, sans-serif");
      var duration = ProcessBuilder.phaseDuration(phases[i]);
      var dmin = duration.min;
      var dmax = duration.max;
      meta.textContent = dmin + "-" + dmax + " wks · " + phases[i].tasks.length + " tasks";
      g.appendChild(meta);

      if (phases[i].is_iterative) {
        var iter = document.createElementNS("http://www.w3.org/2000/svg", "text");
        iter.setAttribute("x", String(x + 10));
        iter.setAttribute("y", String(y + 72));
        iter.setAttribute("fill", "#ffe082");
        iter.setAttribute("font-size", "10");
        iter.setAttribute("font-family", "Segoe UI, Arial, sans-serif");
        iter.textContent = "Iterative";
        g.appendChild(iter);
      }

      if (phases[i].gates && phases[i].gates.length > 0) {
        var gate = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        var gx = x + cardW / 2;
        var gy = y + cardH + 18;
        gate.setAttribute("points", gx + "," + (gy - 8) + " " + (gx + 8) + "," + gy + " " + gx + "," + (gy + 8) + " " + (gx - 8) + "," + gy);
        gate.setAttribute("fill", "#F9A825");
        g.appendChild(gate);
      }

      (function (phaseId) {
        g.addEventListener("click", function () {
          if (onPhaseClick) {
            onPhaseClick(phaseId);
          }
        });
      })(phases[i].phase_id);

      svg.appendChild(g);

      if (i < phases.length - 1) {
        var ax1 = x + cardW;
        var ax2 = x + cardW + gap;
        var ay = y + cardH / 2;
        var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", String(ax1));
        line.setAttribute("y1", String(ay));
        line.setAttribute("x2", String(ax2 - 6));
        line.setAttribute("y2", String(ay));
        line.setAttribute("stroke", "#5BA3D9");
        line.setAttribute("stroke-width", "2");
        line.setAttribute("marker-end", "url(#arrow)");
        svg.appendChild(line);
      }
      cursorX = x + cardW + gap;
      i = i + 1;
    }

    var defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    var marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.setAttribute("id", "arrow");
    marker.setAttribute("markerWidth", "8");
    marker.setAttribute("markerHeight", "8");
    marker.setAttribute("refX", "6");
    marker.setAttribute("refY", "3");
    marker.setAttribute("orient", "auto");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M0,0 L6,3 L0,6 Z");
    path.setAttribute("fill", "#5BA3D9");
    marker.appendChild(path);
    defs.appendChild(marker);
    svg.insertBefore(defs, svg.firstChild);

    container.appendChild(svg);
  },

  clip: function (text, max) {
    if (!text) {
      return "";
    }
    if (text.length <= max) {
      return text;
    }
    return text.slice(0, max - 1) + "…";
  }
};
