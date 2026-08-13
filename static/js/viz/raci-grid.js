/* Editable RACI matrix */
var RaciGrid = {
  render: function (container, project, onChange) {
    container.innerHTML = "";
    if (!project.raci || !project.raci.matrix) {
      container.textContent = "No RACI data.";
      return;
    }

    var roleIds = [];
    var roleNames = project.raci.roles || {};
    var taskIds = Object.keys(project.raci.matrix);
    var rid;
    for (rid in roleNames) {
      if (Object.prototype.hasOwnProperty.call(roleNames, rid)) {
        roleIds.push(rid);
      }
    }
    if (roleIds.length === 0) {
      var ti = 0;
      while (ti < taskIds.length) {
        var cells = project.raci.matrix[taskIds[ti]];
        var ck;
        for (ck in cells) {
          if (Object.prototype.hasOwnProperty.call(cells, ck)) {
            if (roleIds.indexOf(ck) < 0) {
              roleIds.push(ck);
            }
          }
        }
        ti = ti + 1;
      }
    }

    if (!project.raci.owners) {
      project.raci.owners = {};
    }

    var ownerHeading = document.createElement("div");
    ownerHeading.className = "raci-owner-heading";
    var ownerTitle = document.createElement("h2");
    ownerTitle.textContent = "RACI owner names";
    var ownerHelp = document.createElement("p");
    ownerHelp.className = "muted";
    ownerHelp.textContent = "Assign the person responsible for each project role. Names are saved with this project.";
    ownerHeading.appendChild(ownerTitle);
    ownerHeading.appendChild(ownerHelp);
    container.appendChild(ownerHeading);

    var ownerGrid = document.createElement("div");
    ownerGrid.className = "raci-owner-grid";
    var ownerInputs = {};
    var oi = 0;
    while (oi < roleIds.length) {
      var roleId = roleIds[oi];
      var ownerField = document.createElement("label");
      ownerField.className = "raci-owner-field";
      var ownerLabel = document.createElement("span");
      var ownerRoleName = roleNames[roleId];
      if (!ownerRoleName) {
        ownerRoleName = roleId;
      }
      ownerLabel.textContent = ownerRoleName;
      var ownerInput = document.createElement("input");
      ownerInput.type = "text";
      ownerInput.placeholder = "Owner name";
      ownerInput.setAttribute("data-role", roleId);
      var ownerValue = project.raci.owners[roleId];
      if (!ownerValue) {
        ownerValue = "";
      }
      ownerInput.value = ownerValue;
      ownerInputs[roleId] = ownerInput;
      ownerField.appendChild(ownerLabel);
      ownerField.appendChild(ownerInput);
      ownerGrid.appendChild(ownerField);
      oi = oi + 1;
    }
    container.appendChild(ownerGrid);

    var table = document.createElement("table");
    table.className = "raci-table";
    var thead = document.createElement("thead");
    var headRow = document.createElement("tr");
    var th0 = document.createElement("th");
    th0.textContent = "Task";
    headRow.appendChild(th0);
    var headerOwners = {};
    var r = 0;
    while (r < roleIds.length) {
      var th = document.createElement("th");
      var roleName = document.createElement("span");
      var roleDisplayName = roleNames[roleIds[r]];
      if (!roleDisplayName) {
        roleDisplayName = roleIds[r];
      }
      roleName.textContent = roleDisplayName;
      var headerOwner = document.createElement("small");
      headerOwner.className = "raci-owner-name";
      headerOwner.textContent = RaciGrid.ownerDisplay(project.raci.owners[roleIds[r]]);
      headerOwners[roleIds[r]] = headerOwner;
      th.appendChild(roleName);
      th.appendChild(headerOwner);
      headRow.appendChild(th);
      r = r + 1;
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    var taskName = RaciGrid.taskNames(project);
    var t = 0;
    while (t < taskIds.length) {
      var tr = document.createElement("tr");
      var tdName = document.createElement("td");
      tdName.textContent = taskName[taskIds[t]] || taskIds[t];
      tr.appendChild(tdName);
      r = 0;
      while (r < roleIds.length) {
        var td = document.createElement("td");
        var select = document.createElement("select");
        select.className = "raci-select";
        select.setAttribute("data-task", taskIds[t]);
        select.setAttribute("data-role", roleIds[r]);
        var letters = RaciBuilder.letters();
        var li = 0;
        while (li < letters.length) {
          var opt = document.createElement("option");
          opt.value = letters[li];
          opt.textContent = letters[li];
          var current = "-";
          if (project.raci.matrix[taskIds[t]]) {
            if (project.raci.matrix[taskIds[t]][roleIds[r]]) {
              current = project.raci.matrix[taskIds[t]][roleIds[r]];
            }
          }
          if (letters[li] === current) {
            opt.selected = true;
          }
          select.appendChild(opt);
          li = li + 1;
        }
        select.addEventListener("change", function (ev) {
          var el = ev.target;
          var taskId = el.getAttribute("data-task");
          var roleId = el.getAttribute("data-role");
          RaciBuilder.setCell(project, taskId, roleId, el.value);
          StateManager.set(project);
          if (onChange) {
            onChange(project);
          }
        });
        td.appendChild(select);
        tr.appendChild(td);
        r = r + 1;
      }
      tbody.appendChild(tr);
      t = t + 1;
    }
    table.appendChild(tbody);
    var tableWrap = document.createElement("div");
    tableWrap.className = "raci-table-wrap";
    tableWrap.appendChild(table);
    container.appendChild(tableWrap);

    var ownerRoleId;
    for (ownerRoleId in ownerInputs) {
      if (Object.prototype.hasOwnProperty.call(ownerInputs, ownerRoleId)) {
        RaciGrid.bindOwnerInput(
          ownerInputs[ownerRoleId],
          headerOwners[ownerRoleId],
          project,
          onChange
        );
      }
    }
  },

  bindOwnerInput: function (input, headerOwner, project, onChange) {
    input.addEventListener("change", function () {
      var roleId = input.getAttribute("data-role");
      var ownerName = input.value.trim();
      if (ownerName === "") {
        delete project.raci.owners[roleId];
      } else {
        project.raci.owners[roleId] = ownerName;
      }
      headerOwner.textContent = RaciGrid.ownerDisplay(ownerName);
      StateManager.set(project);
      if (onChange) {
        onChange(project);
      }
    });
  },

  ownerDisplay: function (ownerName) {
    if (ownerName) {
      return ownerName;
    }
    return "Unassigned";
  },

  taskNames: function (project) {
    var map = {};
    var i = 0;
    while (i < project.phases.length) {
      var t = 0;
      while (t < project.phases[i].tasks.length) {
        map[project.phases[i].tasks[t].task_id] = project.phases[i].tasks[t].name;
        t = t + 1;
      }
      i = i + 1;
    }
    return map;
  }
};
