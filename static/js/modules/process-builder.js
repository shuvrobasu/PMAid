/* Build and edit phase/task/gate plan from rule output + config */
var ProcessBuilder = {
  activeStakeholderProject: null,

  buildFromRecommendation: function (project, config) {
    var rec = project.recommendations;
    if (!rec) {
      return project;
    }
    var phaseIds = rec.suggested_phases || [];
    var allPhases = config.phases.phases;
    var built = [];
    var i = 0;
    while (i < allPhases.length) {
      var def = allPhases[i];
      var enabled = false;
      var j = 0;
      while (j < phaseIds.length) {
        if (phaseIds[j] === def.phase_id) {
          enabled = true;
          break;
        }
        j = j + 1;
      }
      if (rec.ai_type === "NOT_AI") {
        if (def.phase_id === "problem_framing") {
          enabled = true;
        }
      }
      var phase = ProcessBuilder.clonePhase(def, config, enabled);
      built.push(phase);
      i = i + 1;
    }
    var methodId = project.methodology || "scrum";
    var mapped = MethodologyMapper.apply(built, methodId, config);
    project.phases = mapped.phases;
    project.methodology_advisory = mapped.advisory;
    project.risks = ProcessBuilder.collectRisks(project.phases, config);
    project.raci = RaciBuilder.buildDefaults(project, config);
    project.assumptions = ProcessBuilder.buildAssumptions(project, config);
    project.stakeholder_map = ProcessBuilder.buildStakeholderMap(project.phases, project);
    project.question_back_list = ProcessBuilder.buildQuestions(
      rec,
      project.phases,
      config,
      project.stakeholder_map
    );
    project.non_ai_plan = null;
    return project;
  },

  clonePhase: function (def, config, enabled) {
    var tasks = ProcessBuilder.resolveTasks(def.default_tasks, config);
    var gates = ProcessBuilder.resolveGates(def.default_gates, config);
    var roles = ProcessBuilder.resolveRoles(def.default_roles, config);
    var risks = ProcessBuilder.resolveRisks(def.default_risks, config);
    var guidance = null;
    if (config.guidance) {
      if (config.guidance.guidance) {
        if (config.guidance.guidance.phases) {
          if (config.guidance.guidance.phases[def.phase_id]) {
            guidance = config.guidance.guidance.phases[def.phase_id];
          }
        }
      }
    }
    var depends = [];
    if (def.depends_on) {
      depends = def.depends_on.slice();
    }
    return {
      phase_id: def.phase_id,
      display_name: def.display_name,
      description: def.description,
      icon: def.icon,
      color: def.color,
      order: def.order,
      enabled: enabled,
      removable: def.removable,
      is_iterative: def.is_iterative,
      iteration_hint: def.iteration_hint,
      default_duration: {
        min: def.default_duration.min,
        max: def.default_duration.max
      },
      duration: {
        min: def.default_duration.min,
        max: def.default_duration.max
      },
      tasks: tasks,
      gates: gates,
      roles: roles,
      risks: risks,
      guidance: guidance,
      depends_on: depends
    };
  },

  resolveTasks: function (ids, config) {
    var result = [];
    if (!ids) {
      return result;
    }
    var all = config.tasks.tasks;
    var i = 0;
    while (i < ids.length) {
      var j = 0;
      while (j < all.length) {
        if (all[j].task_id === ids[i]) {
          result.push({
            task_id: all[j].task_id,
            name: all[j].name,
            description: all[j].description,
            complexity: all[j].complexity,
            enabled: true,
            status: "not_started"
          });
          break;
        }
        j = j + 1;
      }
      i = i + 1;
    }
    return result;
  },

  resolveGates: function (ids, config) {
    var result = [];
    if (!ids) {
      return result;
    }
    var all = config.gates.gates;
    var i = 0;
    while (i < ids.length) {
      var j = 0;
      while (j < all.length) {
        if (all[j].gate_id === ids[i]) {
          var criteria = [];
          if (all[j].criteria) {
            criteria = all[j].criteria.slice();
          }
          result.push({
            gate_id: all[j].gate_id,
            name: all[j].name,
            description: all[j].description,
            criteria: criteria,
            status: "open"
          });
          break;
        }
        j = j + 1;
      }
      i = i + 1;
    }
    return result;
  },

  resolveRoles: function (ids, config) {
    var result = [];
    if (!ids) {
      return result;
    }
    var all = config.roles.roles;
    var i = 0;
    while (i < ids.length) {
      var j = 0;
      while (j < all.length) {
        if (all[j].role_id === ids[i]) {
          result.push({
            role_id: all[j].role_id,
            name: all[j].name,
            description: all[j].description,
            raci_default: all[j].raci_default
          });
          break;
        }
        j = j + 1;
      }
      i = i + 1;
    }
    return result;
  },

  resolveRisks: function (ids, config) {
    var result = [];
    if (!ids) {
      return result;
    }
    var all = config.risks.risks;
    var i = 0;
    while (i < ids.length) {
      var j = 0;
      while (j < all.length) {
        if (all[j].risk_id === ids[i]) {
          result.push({
            risk_id: all[j].risk_id,
            title: all[j].title,
            description: all[j].description,
            category: all[j].category,
            likelihood: all[j].default_likelihood,
            impact: all[j].default_impact
          });
          break;
        }
        j = j + 1;
      }
      i = i + 1;
    }
    return result;
  },

  collectRisks: function (phases, config) {
    var seen = {};
    var result = [];
    var i = 0;
    while (i < phases.length) {
      if (!phases[i].enabled) {
        i = i + 1;
        continue;
      }
      var risks = phases[i].risks || [];
      var j = 0;
      while (j < risks.length) {
        if (!seen[risks[j].risk_id]) {
          seen[risks[j].risk_id] = true;
          var copy = {};
          var key;
          for (key in risks[j]) {
            if (Object.prototype.hasOwnProperty.call(risks[j], key)) {
              copy[key] = risks[j][key];
            }
          }
          copy.phase_id = phases[i].phase_id;
          result.push(copy);
        }
        j = j + 1;
      }
      i = i + 1;
    }
    return result;
  },

  optionLabel: function (items, id) {
    if (Array.isArray(items) === false) {
      return id;
    }
    var i = 0;
    while (i < items.length) {
      if (items[i].id === id) {
        return items[i].label;
      }
      i = i + 1;
    }
    return id;
  },

  buildAssumptions: function (project, config) {
    var inputs = project.discovery_inputs;
    if (inputs === undefined) {
      inputs = {};
    }
    var dataLabel = ProcessBuilder.optionLabel(
      config.ui.wizard.data_states,
      inputs.data_state
    );
    var oversightLabel = ProcessBuilder.optionLabel(
      config.eu_ai_act.autonomy_levels,
      inputs.autonomy
    );
    var assumptions = [
      {
        assumption_id: "assumption_problem_scope",
        statement: "The selected business problem accurately describes the decision or output that must change.",
        phase_id: "problem_framing",
        owner: "Business Sponsor",
        source: "Discovery",
        status: "open"
      },
      {
        assumption_id: "assumption_data_state",
        statement: "The stated data condition is accurate and the required data can be accessed: " + dataLabel + ".",
        phase_id: "data_discovery",
        owner: "Data Engineer",
        source: "Discovery",
        status: "open"
      },
      {
        assumption_id: "assumption_delivery_capacity",
        statement: "The stated team, infrastructure, budget, and timeline will be available when the plan needs them.",
        phase_id: "solution_architecture",
        owner: "Technical Programme Manager",
        source: "Discovery",
        status: "open"
      },
      {
        assumption_id: "assumption_human_oversight",
        statement: "The selected human oversight arrangement can be implemented in the real workflow: " + oversightLabel + ".",
        phase_id: "validation_testing",
        owner: "Product Owner",
        source: "Discovery",
        status: "open"
      },
      {
        assumption_id: "assumption_regulatory_screen",
        statement: "The EU AI Act tier is an initial planning screen and will be confirmed by qualified legal, risk, or compliance specialists.",
        phase_id: "problem_framing",
        owner: "Compliance Officer",
        source: "PMAID screen",
        status: "open"
      }
    ];
    return assumptions;
  },

  buildNonAIAssumptions: function (project) {
    var approach = project.recommendations.suggested_non_ai;
    if (typeof approach !== "string") {
      approach = "the selected standard software approach";
    }
    return [
      {
        assumption_id: "assumption_non_ai_problem",
        statement: "The stated business need is clear enough to design and test without a machine-learning model.",
        phase_id: "non_ai_plan",
        owner: "Business Sponsor",
        source: "Discovery",
        status: "open"
      },
      {
        assumption_id: "assumption_non_ai_approach",
        statement: "The simpler approach can meet the need: " + approach,
        phase_id: "non_ai_plan",
        owner: "Solution Architect",
        source: "PMAID verdict",
        status: "open"
      },
      {
        assumption_id: "assumption_non_ai_ownership",
        statement: "Data, process, and system owners will provide the access and decisions needed for the mini-plan.",
        phase_id: "non_ai_plan",
        owner: "Technical Programme Manager",
        source: "Planning",
        status: "open"
      },
      {
        assumption_id: "assumption_non_ai_exceptions",
        statement: "A person will own exceptions that the database query, workflow, or business rules cannot resolve safely.",
        phase_id: "non_ai_plan",
        owner: "Process Owner",
        source: "Planning",
        status: "open"
      }
    ];
  },

  stakeholderNeed: function (role) {
    if (role.raci_default === "A") {
      return "Approve the phase outcome, key decisions, and gate evidence.";
    }
    if (role.raci_default === "R") {
      return "Receive the task detail, dependencies, required evidence, and current blockers.";
    }
    if (role.raci_default === "C") {
      return "Review assumptions, risks, specialist evidence, and decisions before the gate.";
    }
    return "Receive a concise update on progress, timing, decisions, and material risks.";
  },

  existingStakeholders: function (project) {
    var result = {};
    var existing = project.stakeholder_map;
    if (Array.isArray(existing) === false) {
      return result;
    }
    var i = 0;
    while (i < existing.length) {
      result[existing[i].stakeholder_id] = existing[i];
      i = i + 1;
    }
    return result;
  },

  buildStakeholderMap: function (phases, project) {
    var result = [];
    var existing = ProcessBuilder.existingStakeholders(project);
    var p = 0;
    while (p < phases.length) {
      var phase = phases[p];
      if (phase.enabled === false) {
        p = p + 1;
        continue;
      }
      var r = 0;
      while (r < phase.roles.length) {
        var role = phase.roles[r];
        var stakeholderId = phase.phase_id + "__" + role.role_id;
        var entry = {
          stakeholder_id: stakeholderId,
          phase_id: phase.phase_id,
          role_id: role.role_id,
          role_name: role.name,
          involvement: role.raci_default,
          information_need: ProcessBuilder.stakeholderNeed(role)
        };
        if (existing[stakeholderId] !== undefined) {
          if (typeof existing[stakeholderId].information_need === "string") {
            entry.information_need = existing[stakeholderId].information_need;
          }
        }
        result.push(entry);
        r = r + 1;
      }
      p = p + 1;
    }
    return result;
  },

  addStakeholderQuestions: function (list, phases, stakeholderMap) {
    if (Array.isArray(stakeholderMap) === false) {
      return list;
    }
    var owners = {};
    var project = ProcessBuilder.activeStakeholderProject;
    if (project !== null) {
      if (project !== undefined) {
        if (project.raci !== undefined) {
          if (project.raci.owners !== undefined) {
            owners = project.raci.owners;
          }
        }
      }
    }
    var s = 0;
    while (s < stakeholderMap.length) {
      var stakeholder = stakeholderMap[s];
      var owner = owners[stakeholder.role_id];
      var question = "Who is the named " + stakeholder.role_name +
        ", and how will they receive or confirm: " + stakeholder.information_need;
      if (typeof owner === "string") {
        if (owner.trim().length > 0) {
          question = "Has " + owner + " (" + stakeholder.role_name +
            ") confirmed how they will receive or approve: " + stakeholder.information_need;
        }
      }
      list.push({
        phase_id: stakeholder.phase_id,
        source: "stakeholder_map",
        stakeholder_id: stakeholder.stakeholder_id,
        question: question
      });
      s = s + 1;
    }
    return list;
  },

  buildQuestions: function (rec, phases, config, stakeholderMap) {
    var list = [];
    var globalQs = rec.questions || [];
    var i = 0;
    while (i < globalQs.length) {
      list.push({
        phase_id: "problem_framing",
        question: globalQs[i]
      });
      i = i + 1;
    }
    var p = 0;
    while (p < phases.length) {
      if (!phases[p].enabled) {
        p = p + 1;
        continue;
      }
      var phaseQuestions = null;
      if (config.guidance) {
        if (config.guidance.guidance) {
          if (config.guidance.guidance.phase_questions) {
            phaseQuestions = config.guidance.guidance.phase_questions[phases[p].phase_id];
          }
        }
      }
      if (phaseQuestions) {
        var qi = 0;
        while (qi < phaseQuestions.length) {
          list.push({
            phase_id: phases[p].phase_id,
            question: phaseQuestions[qi]
          });
          qi = qi + 1;
        }
      }
      p = p + 1;
    }
    return ProcessBuilder.addStakeholderQuestions(list, phases, stakeholderMap);
  },

  refreshStakeholderQuestions: function (project) {
    var current = project.question_back_list;
    if (Array.isArray(current) === false) {
      current = [];
    }
    var retained = [];
    var i = 0;
    while (i < current.length) {
      if (current[i].source !== "stakeholder_map") {
        retained.push(current[i]);
      }
      i = i + 1;
    }
    ProcessBuilder.activeStakeholderProject = project;
    project.question_back_list = ProcessBuilder.addStakeholderQuestions(
      retained,
      project.phases,
      project.stakeholder_map
    );
    ProcessBuilder.activeStakeholderProject = null;
    return project.question_back_list;
  },

  nonAIPlanTemplate: function (rec, config) {
    var plans = null;
    if (config.guidance !== undefined) {
      if (config.guidance.guidance !== undefined) {
        plans = config.guidance.guidance.non_ai_plans;
      }
    }
    if (plans === null) {
      return null;
    }
    if (plans === undefined) {
      return null;
    }
    if (plans[rec.rule_id] !== undefined) {
      return plans[rec.rule_id];
    }
    return plans.default;
  },

  buildNonAIPlan: function (project, config) {
    var rec = project.recommendations;
    var template = ProcessBuilder.nonAIPlanTemplate(rec, config);
    var title = "Standard software alternative";
    var outcome = rec.suggested_non_ai;
    var sourceSteps = [];
    if (template !== null) {
      if (template !== undefined) {
        title = template.title;
        outcome = template.outcome;
        sourceSteps = template.steps;
      }
    }
    if (Array.isArray(sourceSteps) === false) {
      sourceSteps = [];
    }
    var steps = [];
    var i = 0;
    while (i < sourceSteps.length) {
      steps.push({
        step_id: "non_ai_step_" + (i + 1),
        name: sourceSteps[i],
        status: "not_started"
      });
      i = i + 1;
    }
    project.non_ai_plan = {
      title: title,
      approach: rec.suggested_non_ai,
      outcome: outcome,
      steps: steps,
      questions: rec.questions
    };
    project.phases = [];
    project.risks = [];
    project.raci = {
      matrix: {},
      roles: {}
    };
    project.assumptions = ProcessBuilder.buildNonAIAssumptions(project);
    project.stakeholder_map = [];
    project.question_back_list = [];
    var questions = rec.questions;
    if (Array.isArray(questions)) {
      i = 0;
      while (i < questions.length) {
        project.question_back_list.push({
          phase_id: "non_ai_plan",
          question: questions[i]
        });
        i = i + 1;
      }
    }
    return project;
  },

  hydratePlanningRegisters: function (project, config) {
    if (Array.isArray(project.assumptions) === false) {
      project.assumptions = ProcessBuilder.buildAssumptions(project, config);
    }
    if (project.assumptions.length === 0) {
      project.assumptions = ProcessBuilder.buildAssumptions(project, config);
    }
    if (Array.isArray(project.stakeholder_map) === false) {
      project.stakeholder_map = [];
    }
    project.stakeholder_map = ProcessBuilder.buildStakeholderMap(project.phases, project);
    ProcessBuilder.refreshStakeholderQuestions(project);
    return project;
  },

  togglePhase: function (project, phaseId, enabled) {
    var i = 0;
    while (i < project.phases.length) {
      if (project.phases[i].phase_id === phaseId) {
        if (project.phases[i].removable === false) {
          project.phases[i].enabled = true;
        } else {
          project.phases[i].enabled = enabled;
        }
        break;
      }
      i = i + 1;
    }
    return project;
  },

  reorderPhase: function (project, phaseId, direction) {
    var idx = -1;
    var i = 0;
    while (i < project.phases.length) {
      if (project.phases[i].phase_id === phaseId) {
        idx = i;
        break;
      }
      i = i + 1;
    }
    if (idx < 0) {
      return project;
    }
    var swapWith = idx + direction;
    if (swapWith < 0) {
      return project;
    }
    if (swapWith >= project.phases.length) {
      return project;
    }
    var tmp = project.phases[idx];
    project.phases[idx] = project.phases[swapWith];
    project.phases[swapWith] = tmp;
    var o = 0;
    while (o < project.phases.length) {
      project.phases[o].order = o + 1;
      o = o + 1;
    }
    return project;
  },

  stats: function (project) {
    var phaseCount = 0;
    var taskCount = 0;
    var riskCount = 0;
    var roleIds = {};
    var minWeeks = 0;
    var maxWeeks = 0;
    var i = 0;
    while (i < project.phases.length) {
      var ph = project.phases[i];
      if (ph.enabled) {
        phaseCount = phaseCount + 1;
        var duration = ProcessBuilder.phaseDuration(ph);
        minWeeks = minWeeks + duration.min;
        maxWeeks = maxWeeks + duration.max;
        var t = 0;
        while (t < ph.tasks.length) {
          if (ph.tasks[t].enabled) {
            taskCount = taskCount + 1;
          }
          t = t + 1;
        }
        var r = 0;
        while (r < ph.roles.length) {
          roleIds[ph.roles[r].role_id] = true;
          r = r + 1;
        }
      }
      i = i + 1;
    }
    if (project.risks) {
      riskCount = project.risks.length;
    }
    var roleCount = Object.keys(roleIds).length;
    return {
      phaseCount: phaseCount,
      taskCount: taskCount,
      riskCount: riskCount,
      roleCount: roleCount,
      durationMin: minWeeks,
      durationMax: maxWeeks
    };
  },

  phaseDuration: function (phase) {
    var minimum = 1;
    var maximum = 1;
    if (phase.duration) {
      if (typeof phase.duration.min === "number") {
        minimum = phase.duration.min;
      }
      if (typeof phase.duration.max === "number") {
        maximum = phase.duration.max;
      }
    }
    if (minimum < 1) {
      minimum = 1;
    }
    if (maximum < minimum) {
      maximum = minimum;
    }
    return {
      min: minimum,
      max: maximum
    };
  },

  enabledPhases: function (project) {
    var result = [];
    var i = 0;
    while (i < project.phases.length) {
      if (project.phases[i].enabled) {
        result.push(project.phases[i]);
      }
      i = i + 1;
    }
    return result;
  },

  // ponytail: checklist status only — not a tracker (no assignee/dates)
  hydrateStatuses: function (project) {
    if (!project || !project.phases) {
      return project;
    }
    var i = 0;
    while (i < project.phases.length) {
      var ph = project.phases[i];
      if (!ph.status) {
        ph.status = "not_started";
      }
      if (!ph.tasks) {
        ph.tasks = [];
      }
      if (!ph.gates) {
        ph.gates = [];
      }
      var t = 0;
      while (t < ph.tasks.length) {
        if (!ph.tasks[t].status) {
          ph.tasks[t].status = "not_started";
        }
        t = t + 1;
      }
      var g = 0;
      while (g < ph.gates.length) {
        if (!ph.gates[g].status) {
          ph.gates[g].status = "open";
        }
        g = g + 1;
      }
      i = i + 1;
    }
    return project;
  },

  statusMapFromTasks: function (tasks) {
    var map = {};
    if (!tasks) {
      return map;
    }
    var i = 0;
    while (i < tasks.length) {
      if (tasks[i].task_id) {
        map[tasks[i].task_id] = tasks[i].status || "not_started";
      }
      i = i + 1;
    }
    return map;
  },

  statusMapFromGates: function (gates) {
    var map = {};
    if (!gates) {
      return map;
    }
    var i = 0;
    while (i < gates.length) {
      if (gates[i].gate_id) {
        map[gates[i].gate_id] = gates[i].status || "open";
      }
      i = i + 1;
    }
    return map;
  },

  // Reload each phase's tasks/gates/roles/risks from master. Keeps status by id.
  resyncFromMaster: function (project, config) {
    if (!project || !project.phases || !config || !config.phases) {
      return project;
    }
    var master = config.phases.phases;
    var i = 0;
    while (i < project.phases.length) {
      var ph = project.phases[i];
      var j = 0;
      var def = null;
      while (j < master.length) {
        if (master[j].phase_id === ph.phase_id) {
          def = master[j];
          break;
        }
        j = j + 1;
      }
      if (!def) {
        i = i + 1;
        continue;
      }
      var taskStatus = ProcessBuilder.statusMapFromTasks(ph.tasks);
      var gateStatus = ProcessBuilder.statusMapFromGates(ph.gates);
      ph.display_name = def.display_name;
      ph.description = def.description;
      ph.tasks = ProcessBuilder.resolveTasks(def.default_tasks, config);
      ph.gates = ProcessBuilder.resolveGates(def.default_gates, config);
      ph.roles = ProcessBuilder.resolveRoles(def.default_roles, config);
      ph.risks = ProcessBuilder.resolveRisks(def.default_risks, config);
      if (!ph.status) {
        ph.status = "not_started";
      }
      var t = 0;
      while (t < ph.tasks.length) {
        if (taskStatus[ph.tasks[t].task_id]) {
          ph.tasks[t].status = taskStatus[ph.tasks[t].task_id];
        }
        t = t + 1;
      }
      var g = 0;
      while (g < ph.gates.length) {
        if (gateStatus[ph.gates[g].gate_id]) {
          ph.gates[g].status = gateStatus[ph.gates[g].gate_id];
        }
        g = g + 1;
      }
      if (config.guidance) {
        if (config.guidance.guidance) {
          if (config.guidance.guidance.phases) {
            if (config.guidance.guidance.phases[ph.phase_id]) {
              ph.guidance = config.guidance.guidance.phases[ph.phase_id];
            }
          }
        }
      }
      i = i + 1;
    }
    ProcessBuilder.hydrateStatuses(project);
    return project;
  },

  repairEmptyTasks: function (project, config) {
    return ProcessBuilder.resyncFromMaster(project, config);
  },

  setPhaseStatus: function (project, phaseId, status) {
    var i = 0;
    while (i < project.phases.length) {
      if (project.phases[i].phase_id === phaseId) {
        project.phases[i].status = status;
        return project;
      }
      i = i + 1;
    }
    return project;
  },

  setTaskStatus: function (project, phaseId, taskId, status) {
    var i = 0;
    while (i < project.phases.length) {
      if (project.phases[i].phase_id === phaseId) {
        var t = 0;
        while (t < project.phases[i].tasks.length) {
          if (project.phases[i].tasks[t].task_id === taskId) {
            project.phases[i].tasks[t].status = status;
            return project;
          }
          t = t + 1;
        }
      }
      i = i + 1;
    }
    return project;
  },

  setGateStatus: function (project, phaseId, gateId, status) {
    var i = 0;
    while (i < project.phases.length) {
      if (project.phases[i].phase_id === phaseId) {
        var g = 0;
        while (g < project.phases[i].gates.length) {
          if (project.phases[i].gates[g].gate_id === gateId) {
            project.phases[i].gates[g].status = status;
            return project;
          }
          g = g + 1;
        }
      }
      i = i + 1;
    }
    return project;
  },

  phaseProgress: function (phase) {
    var total = 0;
    var done = 0;
    var wip = 0;
    var t = 0;
    while (t < phase.tasks.length) {
      if (phase.tasks[t].enabled === false) {
        t = t + 1;
        continue;
      }
      total = total + 1;
      if (phase.tasks[t].status === "done") {
        done = done + 1;
      }
      if (phase.tasks[t].status === "wip") {
        wip = wip + 1;
      }
      t = t + 1;
    }
    return {
      total: total,
      done: done,
      wip: wip
    };
  }
};
