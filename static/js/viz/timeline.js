/* Gantt-style SVG timeline — pure SVG, no library */
var Timeline = {
  render: function (container, project, onResize) {
    container.innerHTML = "";
    var phases = ProcessBuilder.enabledPhases(project);
    if (phases.length === 0) {
      container.textContent = "No enabled phases.";
      return;
    }

    var rowH = 44;
    var labelW = 230;
    var padTop = 38;
    var padLeft = 10;
    var totalMax = 0;
    var i = 0;
    while (i < phases.length) {
      var phaseDuration = ProcessBuilder.phaseDuration(phases[i]);
      totalMax = totalMax + phaseDuration.max;
      i = i + 1;
    }
    var weeks = totalMax;
    if (weeks < 1) {
      weeks = 1;
    }
    var pxPerWeek = 28;
    var chartW = weeks * pxPerWeek;
    var width = labelW + chartW + 40;
    var height = padTop + phases.length * rowH + 40;

    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("width", "100%");
    svg.setAttribute("class", "timeline-svg");

    var w = 0;
    while (w <= weeks) {
      var x = labelW + w * pxPerWeek;
      var grid = document.createElementNS("http://www.w3.org/2000/svg", "line");
      grid.setAttribute("x1", String(x));
      grid.setAttribute("y1", String(padTop - 10));
      grid.setAttribute("x2", String(x));
      grid.setAttribute("y2", String(height - 10));
      grid.setAttribute("stroke", "#dde3ea");
      grid.setAttribute("stroke-width", "1");
      svg.appendChild(grid);
      var lab = document.createElementNS("http://www.w3.org/2000/svg", "text");
      lab.setAttribute("x", String(x + 2));
      lab.setAttribute("y", String(padTop - 14));
      lab.setAttribute("font-size", "12");
      lab.setAttribute("fill", "var(--muted, #555)");
      lab.setAttribute("font-family", "Segoe UI, Arial, sans-serif");
      lab.textContent = "W" + w;
      svg.appendChild(lab);
      w = w + 2;
    }

    var cursor = 0;
    i = 0;
    while (i < phases.length) {
      var y = padTop + i * rowH;
      var name = document.createElementNS("http://www.w3.org/2000/svg", "text");
      name.setAttribute("x", String(padLeft));
      name.setAttribute("y", String(y + 24));
      name.setAttribute("font-size", "14");
      name.setAttribute("font-weight", "600");
      name.setAttribute("fill", "var(--navy, #1E3A5F)");
      name.setAttribute("font-family", "Segoe UI, Arial, sans-serif");
      name.textContent = phases[i].display_name;
      svg.appendChild(name);

      phaseDuration = ProcessBuilder.phaseDuration(phases[i]);
      var dMin = phaseDuration.min;
      var dMax = phaseDuration.max;
      var barX = labelW + cursor * pxPerWeek;
      var barW = dMax * pxPerWeek;
      if (barW < 8) {
        barW = 8;
      }

      var bar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bar.setAttribute("x", String(barX));
      bar.setAttribute("y", String(y + 4));
      bar.setAttribute("width", String(barW));
      bar.setAttribute("height", String(rowH - 12));
      bar.setAttribute("rx", "4");
      bar.setAttribute("fill", phases[i].color || "#4A90C8");
      bar.setAttribute("class", "timeline-bar");
      bar.setAttribute("data-phase", phases[i].phase_id);
      bar.style.cursor = "ew-resize";
      svg.appendChild(bar);

      var range = document.createElementNS("http://www.w3.org/2000/svg", "text");
      range.setAttribute("x", String(barX + 4));
      range.setAttribute("y", String(y + 25));
      range.setAttribute("font-size", "12");
      range.setAttribute("font-weight", "700");
      range.setAttribute("fill", "#fff");
      range.setAttribute("font-family", "Segoe UI, Arial, sans-serif");
      range.textContent = dMin + "-" + dMax + "w";
      svg.appendChild(range);

      Timeline.bindResize(bar, phases[i], project, pxPerWeek, onResize, container);

      cursor = cursor + dMax;
      i = i + 1;
    }

    container.appendChild(svg);
    var help = document.createElement("p");
    help.className = "timeline-help";
    help.textContent = "Tip: drag a timeline bar left or right to decrease or increase that phase duration. Process Flow uses the same timings.";
    container.appendChild(help);
  },

  bindResize: function (bar, phase, project, pxPerWeek, onResize, container) {
    var duration = ProcessBuilder.phaseDuration(phase);
    if (!phase.duration) {
      phase.duration = duration;
    }
    var dragging = false;
    var startX = 0;
    var startMax = phase.duration.max;

    bar.addEventListener("mousedown", function (ev) {
      dragging = true;
      startX = ev.clientX;
      startMax = phase.duration.max;
      ev.preventDefault();
    });

    window.addEventListener("mouseup", function () {
      if (dragging) {
        dragging = false;
        StateManager.set(project);
        if (onResize) {
          onResize();
        } else {
          Timeline.render(container, project, onResize);
        }
      }
    });

    window.addEventListener("mousemove", function (ev) {
      if (!dragging) {
        return;
      }
      var dx = ev.clientX - startX;
      var deltaWeeks = Math.round(dx / pxPerWeek);
      var next = startMax + deltaWeeks;
      if (next < phase.duration.min) {
        next = phase.duration.min;
      }
      if (next < 1) {
        next = 1;
      }
      if (next > 52) {
        next = 52;
      }
      phase.duration.max = next;
      bar.setAttribute("width", String(next * pxPerWeek));
    });
  }
};
