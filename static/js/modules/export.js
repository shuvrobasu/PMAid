/* HTML export artefacts — browser print for PDF */
var ExportModule = {
  openPrintable: function (title, bodyHtml) {
    var win = window.open("", "_blank");
    if (!win) {
      alert("Pop-up blocked. Allow pop-ups to export.");
      return;
    }
    var html = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>" +
      ExportModule.escape(title) +
      "</title><style>" +
      "body{font-family:Segoe UI,Arial,sans-serif;margin:32px;color:#1a1a1a;}" +
      "h1{color:#1E3A5F;} h2{color:#2E5A8F;margin-top:28px;}" +
      "table{border-collapse:collapse;width:100%;margin:12px 0;}" +
      "th,td{border:1px solid #ccc;padding:8px;text-align:left;}" +
      "th{background:#e8eef5;}" +
      ".badge{display:inline-block;padding:4px 10px;border-radius:4px;color:#fff;font-weight:600;}" +
      ".reason{background:#f5f7fa;padding:10px;border-left:4px solid #4A90C8;margin:8px 0;}" +
      "@media print{button{display:none;}}" +
      "</style></head><body>" +
      bodyHtml +
      "<p><button onclick='window.print()'>Print / Save as PDF</button></p>" +
      "</body></html>";
    win.document.open();
    win.document.write(html);
    win.document.close();
  },

  escape: function (text) {
    if (text === null || text === undefined) {
      return "";
    }
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  charter: function (project, config) {
    var rec = project.recommendations || {};
    var eu = project.eu_classification || {};
    var reasons = rec.reasons || [];
    var html = "<h1>Project Charter</h1>";
    html = html + "<p><strong>Project:</strong> " + ExportModule.escape(project.project_name) + "</p>";
    html = html + "<p><strong>Methodology:</strong> " + ExportModule.escape(project.methodology) + "</p>";
    html = html + "<p><strong>Generated:</strong> " + ExportModule.escape(new Date().toISOString()) + "</p>";
    html = html + "<h2>Recommendation</h2>";
    html = html + "<p><strong>AI approach:</strong> " + ExportModule.escape(rec.ai_label || rec.ai_type) + "</p>";
    html = html + "<p><strong>Confidence:</strong> " + ExportModule.escape(String(rec.confidence)) + "%</p>";
    html = html + "<p><strong>Complexity shape:</strong> " + ExportModule.escape(rec.complexity_shape) + "</p>";
    html = html + "<h2>Reasoning</h2>";
    var i = 0;
    while (i < reasons.length) {
      html = html + "<div class='reason'>" + ExportModule.escape(reasons[i]) + "</div>";
      i = i + 1;
    }
    html = html + "<h2>EU AI Act</h2>";
    html = html + "<p><span class='badge' style='background:" + ExportModule.escape(eu.color || "#666") + "'>" +
      ExportModule.escape(eu.label || project.eu_tier) + "</span></p>";
    var euMessage = "";
    if (eu.message !== undefined) {
      euMessage = String(eu.message).replace(/\bPRISM\b/g, "PMAID");
    }
    html = html + "<p>" + ExportModule.escape(euMessage) + "</p>";
    if (eu.mandatory_work_packages && eu.mandatory_work_packages.length) {
      html = html + "<h3>Mandatory work packages</h3><ul>";
      i = 0;
      while (i < eu.mandatory_work_packages.length) {
        html = html + "<li>" + ExportModule.escape(eu.mandatory_work_packages[i]) + "</li>";
        i = i + 1;
      }
      html = html + "</ul>";
    }
    if (project.non_ai_plan) {
      html = html + "<h2>Suggested alternative plan</h2>";
      html = html + "<p><strong>" + ExportModule.escape(project.non_ai_plan.title) + "</strong></p>";
      html = html + "<p>" + ExportModule.escape(project.non_ai_plan.outcome) + "</p>";
      html = html + "<h3>Mini-plan</h3><ol>";
      var nonAiSteps = project.non_ai_plan.steps;
      i = 0;
      while (i < nonAiSteps.length) {
        html = html + "<li>" + ExportModule.escape(nonAiSteps[i].name) +
          " — " + ExportModule.escape(nonAiSteps[i].status) + "</li>";
        i = i + 1;
      }
      html = html + "</ol>";
    } else {
      html = html + "<h2>Phases</h2><table><tr><th>Phase</th><th>Duration (weeks)</th><th>Tasks</th></tr>";
      i = 0;
      while (i < project.phases.length) {
        if (project.phases[i].enabled) {
          var d = project.phases[i].duration || { min: 0, max: 0 };
          html = html + "<tr><td>" + ExportModule.escape(project.phases[i].display_name) +
            "</td><td>" + d.min + " - " + d.max +
            "</td><td>" + project.phases[i].tasks.length + "</td></tr>";
        }
        i = i + 1;
      }
      html = html + "</table>";
    }
    var assumptions = project.assumptions;
    if (Array.isArray(assumptions) === false) {
      assumptions = [];
    }
    html = html + "<h2>Assumption register</h2>";
    html = html + "<table><tr><th>Assumption</th><th>Confirm by</th><th>Owner</th><th>Status</th></tr>";
    i = 0;
    while (i < assumptions.length) {
      html = html + "<tr><td>" + ExportModule.escape(assumptions[i].statement) +
        "</td><td>" + ExportModule.escape(assumptions[i].phase_id) +
        "</td><td>" + ExportModule.escape(assumptions[i].owner) +
        "</td><td>" + ExportModule.escape(assumptions[i].status) + "</td></tr>";
      i = i + 1;
    }
    html = html + "</table>";
    var stakeholders = project.stakeholder_map;
    if (Array.isArray(stakeholders) === false) {
      stakeholders = [];
    }
    if (stakeholders.length > 0) {
      var owners = {};
      if (project.raci) {
        if (project.raci.owners) {
          owners = project.raci.owners;
        }
      }
      html = html + "<h2>Stakeholder map</h2>";
      html = html + "<table><tr><th>Phase</th><th>Role</th><th>Named owner</th><th>Needs to know or decide</th></tr>";
      i = 0;
      while (i < stakeholders.length) {
        html = html + "<tr><td>" + ExportModule.escape(stakeholders[i].phase_id) +
          "</td><td>" + ExportModule.escape(stakeholders[i].role_name) +
          "</td><td>" + ExportModule.escape(owners[stakeholders[i].role_id]) +
          "</td><td>" + ExportModule.escape(stakeholders[i].information_need) + "</td></tr>";
        i = i + 1;
      }
      html = html + "</table>";
    }
    html = html + "<p><em>Planning aid only. Not professional advice. Trace recommendations to rules.yaml.</em></p>";
    ExportModule.openPrintable("Charter — " + project.project_name, html);
  },

  riskRegister: function (project) {
    var html = "<h1>Risk Register</h1>";
    html = html + "<p><strong>Project:</strong> " + ExportModule.escape(project.project_name) + "</p>";
    html = html + "<table><tr><th>ID</th><th>Title</th><th>Description</th><th>Likelihood</th><th>Impact</th><th>Score</th><th>Level</th></tr>";
    var risks = project.risks || [];
    var i = 0;
    while (i < risks.length) {
      var r = risks[i];
      html = html + "<tr><td>" + ExportModule.escape(r.risk_id) +
        "</td><td>" + ExportModule.escape(r.title) +
        "</td><td>" + ExportModule.escape(r.description) +
        "</td><td>" + r.likelihood +
        "</td><td>" + r.impact +
        "</td><td>" + RiskAnalyzer.score(r) +
        "</td><td>" + RiskAnalyzer.level(r) +
        "</td></tr>";
      i = i + 1;
    }
    html = html + "</table>";
    ExportModule.openPrintable("Risk Register — " + project.project_name, html);
  },

  raci: function (project) {
    var html = "<h1>RACI Matrix</h1>";
    html = html + "<p><strong>Project:</strong> " + ExportModule.escape(project.project_name) + "</p>";
    if (!project.raci || !project.raci.matrix) {
      html = html + "<p>No RACI data.</p>";
      ExportModule.openPrintable("RACI — " + project.project_name, html);
      return;
    }
    var roleIds = Object.keys(project.raci.roles || {});
    var owners = {};
    if (project.raci.owners) {
      owners = project.raci.owners;
    }
    var taskIds = Object.keys(project.raci.matrix);
    var names = RaciGrid.taskNames(project);
    html = html + "<table><tr><th>Task</th>";
    var r = 0;
    while (r < roleIds.length) {
      var owner = owners[roleIds[r]];
      html = html + "<th>" + ExportModule.escape(project.raci.roles[roleIds[r]]);
      if (owner) {
        html = html + "<br><small>" + ExportModule.escape(owner) + "</small>";
      }
      html = html + "</th>";
      r = r + 1;
    }
    html = html + "</tr>";
    var t = 0;
    while (t < taskIds.length) {
      html = html + "<tr><td>" + ExportModule.escape(names[taskIds[t]] || taskIds[t]) + "</td>";
      r = 0;
      while (r < roleIds.length) {
        var letter = "-";
        if (project.raci.matrix[taskIds[t]][roleIds[r]]) {
          letter = project.raci.matrix[taskIds[t]][roleIds[r]];
        }
        html = html + "<td>" + ExportModule.escape(letter) + "</td>";
        r = r + 1;
      }
      html = html + "</tr>";
      t = t + 1;
    }
    html = html + "</table>";
    ExportModule.openPrintable("RACI — " + project.project_name, html);
  },

  questionBack: function (project) {
    var html = "<h1>Question-Back List</h1>";
    html = html + "<p><strong>Project:</strong> " + ExportModule.escape(project.project_name) + "</p>";
    html = html + "<p>Answer these with real stakeholders before treating the plan as valid.</p>";
    html = html + "<table><tr><th>Phase</th><th>Question</th></tr>";
    var list = project.question_back_list || [];
    var i = 0;
    while (i < list.length) {
      html = html + "<tr><td>" + ExportModule.escape(list[i].phase_id) +
        "</td><td>" + ExportModule.escape(list[i].question) + "</td></tr>";
      i = i + 1;
    }
    html = html + "</table>";
    ExportModule.openPrintable("Questions — " + project.project_name, html);
  }
};
