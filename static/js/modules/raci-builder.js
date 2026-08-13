/* RACI defaults and cell updates */
var RaciBuilder = {
  buildDefaults: function (project, config) {
    var matrix = {};
    var roles = {};
    var i = 0;
    while (i < project.phases.length) {
      if (!project.phases[i].enabled) {
        i = i + 1;
        continue;
      }
      var t = 0;
      while (t < project.phases[i].tasks.length) {
        var task = project.phases[i].tasks[t];
        if (!task.enabled) {
          t = t + 1;
          continue;
        }
        matrix[task.task_id] = {};
        var r = 0;
        while (r < project.phases[i].roles.length) {
          var role = project.phases[i].roles[r];
          roles[role.role_id] = role.name;
          var def = RaciBuilder.defaultLetter(role.role_id, config);
          matrix[task.task_id][role.role_id] = def;
          r = r + 1;
        }
        t = t + 1;
      }
      i = i + 1;
    }
    return {
      matrix: matrix,
      roles: roles,
      owners: {}
    };
  },

  defaultLetter: function (roleId, config) {
    var list = config.roles.roles;
    var i = 0;
    while (i < list.length) {
      if (list[i].role_id === roleId) {
        if (list[i].raci_default) {
          return list[i].raci_default;
        }
        return "I";
      }
      i = i + 1;
    }
    return "I";
  },

  setCell: function (project, taskId, roleId, letter) {
    if (!project.raci) {
      project.raci = { matrix: {}, roles: {} };
    }
    if (!project.raci.matrix[taskId]) {
      project.raci.matrix[taskId] = {};
    }
    project.raci.matrix[taskId][roleId] = letter;
    return project;
  },

  letters: function () {
    return ["R", "A", "C", "I", "-"];
  }
};
