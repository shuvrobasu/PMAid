/* EU AI Act tier evaluation from eu_ai_act.yaml */
var EuClassifier = {
  classify: function (inputs, config) {
    var tiers = config.eu_ai_act.tiers;
    var domain = inputs.eu_domain;
    var affects = inputs.affects_people;
    var autonomy = inputs.autonomy;

    var prohibited = EuClassifier.matchTier(tiers.prohibited, domain, affects, autonomy);
    if (prohibited) {
      return EuClassifier.result("prohibited", tiers.prohibited);
    }

    var high = EuClassifier.matchTier(tiers.high_risk, domain, affects, autonomy);
    if (high) {
      return EuClassifier.result("high_risk", tiers.high_risk);
    }

    var limited = EuClassifier.matchTier(tiers.limited_risk, domain, affects, autonomy);
    if (limited) {
      return EuClassifier.result("limited_risk", tiers.limited_risk);
    }

    return EuClassifier.result("minimal_risk", tiers.minimal_risk);
  },

  matchTier: function (tier, domain, affects, autonomy) {
    if (!tier) {
      return false;
    }
    var conditions = tier.trigger_conditions;
    if (!conditions) {
      return false;
    }
    if (conditions.length === 0) {
      return false;
    }
    var i = 0;
    while (i < conditions.length) {
      var cond = conditions[i];
      var ok = true;
      if (cond.domain !== undefined) {
        if (cond.domain !== domain) {
          ok = false;
        }
      }
      if (ok) {
        if (cond.affects_people !== undefined) {
          if (cond.affects_people !== affects) {
            ok = false;
          }
        }
      }
      if (ok) {
        if (cond.autonomy !== undefined) {
          if (cond.autonomy !== autonomy) {
            ok = false;
          }
        }
      }
      if (ok) {
        return true;
      }
      i = i + 1;
    }
    return false;
  },

  result: function (id, tier) {
    var packages = [];
    if (tier.mandatory_work_packages) {
      packages = tier.mandatory_work_packages.slice();
    }
    return {
      tier_id: id,
      label: tier.label,
      color: tier.color,
      message: tier.message,
      mandatory_work_packages: packages,
      hard_stop: id === "prohibited"
    };
  }
};
