/* Map selected methodology onto phase overlays and duration hints */
var MethodologyMapper = {
  getMethodology: function (methodId, config) {
    var list = config.methodologies.methodologies;
    var i = 0;
    while (i < list.length) {
      if (list[i].id === methodId) {
        return list[i];
      }
      i = i + 1;
    }
    return null;
  },

  apply: function (phases, methodId, config) {
    var method = MethodologyMapper.getMethodology(methodId, config);
    if (!method) {
      return {
        phases: phases,
        advisory: "",
        duration_multiplier: 1.0,
        overlay: {}
      };
    }
    var overlay = method.phase_overlay || {};
    var mult = method.duration_multiplier;
    if (mult === undefined || mult === null) {
      mult = 1.0;
    }
    var mapped = [];
    var i = 0;
    while (i < phases.length) {
      var phase = {};
      var key;
      for (key in phases[i]) {
        if (Object.prototype.hasOwnProperty.call(phases[i], key)) {
          phase[key] = phases[i][key];
        }
      }
      var pid = phase.phase_id;
      if (overlay[pid]) {
        phase.methodology_label = overlay[pid];
      } else {
        phase.methodology_label = method.label;
      }
      if (phase.default_duration) {
        phase.duration = {
          min: Math.max(1, Math.round(phase.default_duration.min * mult)),
          max: Math.max(1, Math.round(phase.default_duration.max * mult))
        };
      }
      mapped.push(phase);
      i = i + 1;
    }
    return {
      phases: mapped,
      advisory: method.advisory || "",
      duration_multiplier: mult,
      overlay: overlay,
      methodology: method
    };
  }
};
