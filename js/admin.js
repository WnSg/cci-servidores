(function () {
  const controlsForm = document.querySelector("#adminControlsForm");
  const adminCodeInput = document.querySelector("#adminCode");
  const monthSelect = document.querySelector("#adminMonth");
  const loadButton = document.querySelector("#loadAdminButton");
  const adminStatus = document.querySelector("#adminStatus");
  const dashboard = document.querySelector("#adminDashboard");
  const registeredMetric = document.querySelector("#registeredMetric");
  const activeMetric = document.querySelector("#activeMetric");
  const sundaysMetric = document.querySelector("#sundaysMetric");
  const slotsMetric = document.querySelector("#slotsMetric");
  const capacityMetric = document.querySelector("#capacityMetric");
  const pendingCount = document.querySelector("#pendingCount");
  const pendingList = document.querySelector("#pendingList");
  const coverageBody = document.querySelector("#coverageBody");
  const generateButton = document.querySelector("#generatePlanButton");
  const loadSavedButton = document.querySelector("#loadSavedPlanButton");
  const planningSection = document.querySelector("#planningSection");
  const planningTotals = document.querySelector("#planningTotals");
  const planningAlerts = document.querySelector("#planningAlerts");
  const planningDays = document.querySelector("#planningDays");
  const savePlanButton = document.querySelector("#savePlanButton");
  const planningStatus = document.querySelector("#planningStatus");

  const state = {
    mes: "",
    servidores: [],
    registros: [],
    rolesRequeridos: {},
    posiciones: {},
    planGuardado: null,
    plan: null
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    populateMonths();
    controlsForm.addEventListener("submit", loadAdminData);
    generateButton.addEventListener("click", generatePlan);
    loadSavedButton.addEventListener("click", loadSavedPlan);
    savePlanButton.addEventListener("click", savePlan);
  }

  async function loadAdminData(event) {
    event.preventDefault();
    setBusy(loadButton, true, "Cargando...");
    clearMessage(adminStatus);

    try {
      const result = await adminRequest("/api/admin/resumen");
      state.mes = result.mes;
      state.servidores = result.servidores || [];
      state.registros = result.registros || [];
      state.rolesRequeridos = result.rolesRequeridos || {};
      state.posiciones = result.posiciones || {};
      state.planGuardado = result.planGuardado || null;
      state.plan = null;

      renderSummary(result.resumen);
      dashboard.hidden = false;
      planningSection.hidden = true;
      loadSavedButton.hidden = !state.planGuardado;
      showMessage(
        adminStatus,
        result.planDesactualizado
          ? "La planificación guardada usa una configuración anterior. Genera una propuesta nueva con los puestos actualizados."
          : "Información mensual cargada correctamente.",
        result.planDesactualizado ? "warning" : "success"
      );
    } catch (error) {
      dashboard.hidden = true;
      showMessage(adminStatus, error.message, "error");
    } finally {
      setBusy(loadButton, false, "Cargar información");
    }
  }

  function renderSummary(summary) {
    registeredMetric.textContent = summary.servidoresRegistrados;
    activeMetric.textContent = "de " + summary.servidoresActivos + " servidores activos";
    sundaysMetric.textContent = summary.domingos;
    slotsMetric.textContent = summary.puestosPorDomingo;
    capacityMetric.textContent = summary.capacidadDeclarada;

    const pending = summary.servidoresPendientes || [];
    pendingCount.textContent = pending.length;
    pendingList.innerHTML = "";
    if (pending.length === 0) {
      const message = document.createElement("p");
      message.className = "empty-state";
      message.textContent = "Todos los servidores activos registraron su disponibilidad.";
      pendingList.appendChild(message);
    } else {
      pending.forEach(function (server) {
        const chip = document.createElement("span");
        chip.className = "pending-chip";
        chip.textContent = server.nombre;
        pendingList.appendChild(chip);
      });
    }

    coverageBody.innerHTML = "";
    (summary.roles || []).forEach(function (item) {
      const row = document.createElement("tr");
      const roleCell = document.createElement("td");
      const requiredCell = document.createElement("td");
      const availableCell = document.createElement("td");
      roleCell.textContent = item.equipo + " / " + item.rol;
      requiredCell.textContent = item.requeridos;
      availableCell.textContent = item.disponiblesMes;
      availableCell.className = item.disponiblesMes >= item.requeridos ? "coverage-ok" : "coverage-low";
      row.append(roleCell, requiredCell, availableCell);
      coverageBody.appendChild(row);
    });
  }

  async function generatePlan() {
    setBusy(generateButton, true, "Generando...");
    clearMessage(planningStatus);
    try {
      const result = await adminRequest("/api/admin/generar-plan");
      state.plan = result.plan;
      renderPlan();
      planningSection.hidden = false;
      planningSection.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      showMessage(adminStatus, error.message, "error");
    } finally {
      setBusy(generateButton, false, "Generar propuesta");
    }
  }

  function loadSavedPlan() {
    if (!state.planGuardado) {
      return;
    }
    state.plan = JSON.parse(JSON.stringify(state.planGuardado));
    renderPlan();
    planningSection.hidden = false;
    planningSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderPlan() {
    planningDays.innerHTML = "";
    clearMessage(planningStatus);

    (state.plan.fechas || []).forEach(function (day) {
      const dayCard = document.createElement("article");
      dayCard.className = "planning-day";
      const heading = document.createElement("div");
      heading.className = "planning-day-heading";
      const title = document.createElement("h3");
      title.textContent = formatDate(day.fecha);
      heading.appendChild(title);
      dayCard.appendChild(heading);

      ["Altar", "Multimedia"].forEach(function (team) {
        const assignments = day.asignaciones.filter(function (assignment) {
          return assignment.equipo === team;
        });
        if (assignments.length === 0) {
          return;
        }

        const teamSection = document.createElement("section");
        teamSection.className = "planning-team";
        const teamTitle = document.createElement("h4");
        teamTitle.textContent = team;
        teamSection.appendChild(teamTitle);
        const rows = document.createElement("div");
        rows.className = "assignment-list";

        assignments.forEach(function (assignment) {
          rows.appendChild(buildAssignmentRow(day, assignment));
        });
        teamSection.appendChild(rows);
        dayCard.appendChild(teamSection);
      });
      planningDays.appendChild(dayCard);
    });

    validatePlanLocally();
  }

  function buildAssignmentRow(day, assignment) {
    const row = document.createElement("div");
    row.className = "assignment-row";
    const label = document.createElement("label");
    const select = document.createElement("select");
    const id = "slot-" + day.fecha + "-" + assignment.slotId;

    label.setAttribute("for", id);
    label.innerHTML = "";
    const position = document.createElement("strong");
    const role = document.createElement("small");
    position.textContent = assignment.posicion;
    role.textContent = assignment.rol;
    label.append(position, role);

    select.id = id;
    select.dataset.date = day.fecha;
    select.dataset.slotId = assignment.slotId;
    select.dataset.currentServer = assignment.servidorId || "";
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "Vacante";
    select.appendChild(emptyOption);

    const eligibleServers = getEligibleServers(assignment, day.fecha);
    eligibleServers.forEach(function (server) {
      const option = document.createElement("option");
      option.value = server.id;
      option.textContent = getServerName(server) + (server.rolPrincipal === assignment.rol ? " · principal" : "");
      option.selected = server.id === assignment.servidorId;
      select.appendChild(option);
    });

    if (assignment.servidorId && !eligibleServers.some(function (server) {
      return server.id === assignment.servidorId;
    })) {
      const unavailableServer = state.servidores.find(function (server) {
        return server.id === assignment.servidorId;
      });
      const option = document.createElement("option");
      option.value = assignment.servidorId;
      option.textContent = getServerName(unavailableServer) + " · no disponible";
      option.selected = true;
      select.appendChild(option);
    }

    select.addEventListener("change", function () {
      assignment.servidorId = select.value || null;
      select.dataset.currentServer = select.value;
      validatePlanLocally();
    });

    row.append(label, select);
    return row;
  }

  function getEligibleServers(assignment, date) {
    const recordsById = new Map(state.registros.map(function (record) {
      return [record.servidorId, record];
    }));
    return state.servidores.filter(function (server) {
      const record = recordsById.get(server.id);
      return server.activo !== false && record &&
        server.equipos.includes(assignment.equipo) &&
        server.roles.includes(assignment.rol) &&
        !(record.fechasNoPuede || []).includes(date);
    }).sort(function (a, b) {
      return getServerName(a).localeCompare(getServerName(b), "es");
    });
  }

  function validatePlanLocally() {
    const messages = new Set();
    const totalCounts = new Map();
    const recordsById = new Map(state.registros.map(function (record) {
      return [record.servidorId, record];
    }));
    const selects = Array.from(planningDays.querySelectorAll("select[data-slot-id]"));
    selects.forEach(function (select) {
      select.classList.remove("input-error");
    });

    (state.plan.fechas || []).forEach(function (day) {
      const dailyAssignments = new Map();
      day.asignaciones.forEach(function (assignment) {
        if (!assignment.servidorId) {
          return;
        }
        if (!getEligibleServers(assignment, day.fecha).some(function (server) {
          return server.id === assignment.servidorId;
        })) {
          const invalidServer = state.servidores.find(function (item) { return item.id === assignment.servidorId; });
          messages.add(getServerName(invalidServer) + " no está disponible para " + assignment.posicion + " el " + formatDate(day.fecha) + ".");
          markSelectError(day.fecha, assignment.slotId);
        }
        if (!dailyAssignments.has(assignment.servidorId)) {
          dailyAssignments.set(assignment.servidorId, []);
        }
        dailyAssignments.get(assignment.servidorId).push(assignment.slotId);
        totalCounts.set(assignment.servidorId, (totalCounts.get(assignment.servidorId) || 0) + 1);
      });

      dailyAssignments.forEach(function (slotIds, serverId) {
        if (slotIds.length > 1) {
          const server = state.servidores.find(function (item) { return item.id === serverId; });
          messages.add(getServerName(server) + " tiene más de una asignación el " + formatDate(day.fecha) + ".");
          slotIds.forEach(function (slotId) {
            markSelectError(day.fecha, slotId);
          });
        }
      });
    });

    totalCounts.forEach(function (count, serverId) {
      const record = recordsById.get(serverId);
      const limit = Number(record && record.vecesPuedeServir) || 0;
      if (count > limit) {
        const server = state.servidores.find(function (item) { return item.id === serverId; });
        messages.add(getServerName(server) + " supera su máximo mensual de " + limit + " servicio(s).");
        selects.filter(function (select) {
          return select.value === serverId;
        }).forEach(function (select) {
          select.classList.add("input-error");
        });
      }
    });

    const allAssignments = (state.plan.fechas || []).flatMap(function (day) {
      return day.asignaciones;
    });
    const assigned = allAssignments.filter(function (assignment) {
      return Boolean(assignment.servidorId);
    }).length;
    const vacancies = allAssignments.length - assigned;
    planningTotals.textContent = assigned + " asignados · " + vacancies + " vacantes";
    planningAlerts.innerHTML = "";

    if (messages.size > 0) {
      const list = document.createElement("ul");
      Array.from(messages).forEach(function (message) {
        const item = document.createElement("li");
        item.textContent = message;
        list.appendChild(item);
      });
      planningAlerts.className = "planning-alerts has-errors";
      planningAlerts.appendChild(list);
      savePlanButton.disabled = true;
    } else {
      planningAlerts.className = vacancies > 0 ? "planning-alerts has-vacancies" : "planning-alerts is-complete";
      planningAlerts.textContent = vacancies > 0
        ? "La propuesta contiene vacantes. Puedes guardarla como borrador y completarla después."
        : "La propuesta cubre todos los puestos sin conflictos.";
      savePlanButton.disabled = false;
    }
  }

  function markSelectError(date, slotId) {
    const select = Array.from(planningDays.querySelectorAll("select[data-slot-id]")).find(function (item) {
      return item.dataset.date === date && item.dataset.slotId === slotId;
    });
    if (select) {
      select.classList.add("input-error");
    }
  }

  async function savePlan() {
    if (!state.plan) {
      return;
    }
    setBusy(savePlanButton, true, "Guardando...");
    clearMessage(planningStatus);
    try {
      const result = await adminRequest("/api/admin/guardar-plan", {
        fechas: state.plan.fechas
      });
      state.plan = result.plan;
      state.planGuardado = result.plan;
      loadSavedButton.hidden = false;
      showMessage(planningStatus, "Planificación guardada correctamente.", "success");
    } catch (error) {
      showMessage(planningStatus, error.message, "error");
    } finally {
      setBusy(savePlanButton, false, "Guardar planificación");
      validatePlanLocally();
    }
  }

  async function adminRequest(path, extra) {
    const payload = {
      adminCode: adminCodeInput.value,
      mes: monthSelect.value,
      ...(extra || {})
    };
    const response = await fetch(window.CCI_CONFIG.workerUrl + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store"
    });
    const result = await readResponseJson(response);
    if (!response.ok || !result.ok) {
      throw new Error(result.error || "No se pudo completar la operación.");
    }
    return result;
  }

  async function readResponseJson(response) {
    try {
      return await response.json();
    } catch (error) {
      return { ok: false, error: "El servidor respondió con un formato inesperado." };
    }
  }

  function populateMonths() {
    getAvailableMonths().forEach(function (month) {
      const option = document.createElement("option");
      option.value = month;
      option.textContent = formatMonth(month);
      monthSelect.appendChild(option);
    });
  }

  function getAvailableMonths() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const year = currentMonth === 11 ? now.getFullYear() + 1 : now.getFullYear();
    const startMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    const months = [];
    for (let index = startMonth; index < 12; index += 1) {
      months.push(year + "-" + String(index + 1).padStart(2, "0"));
    }
    return months;
  }

  function formatMonth(value) {
    const parts = value.split("-");
    const date = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
    const label = new Intl.DateTimeFormat("es-HN", { month: "long", year: "numeric" }).format(date);
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("es-HN", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC"
    }).format(new Date(value + "T00:00:00Z"));
  }

  function getServerName(server) {
    return server ? [server.primerNombre, server.primerApellido].filter(Boolean).join(" ") : "Servidor";
  }

  function setBusy(button, busy, label) {
    button.disabled = busy;
    button.textContent = label;
  }

  function showMessage(element, message, type) {
    element.textContent = message;
    element.classList.remove("success", "warning", "error");
    element.classList.add(type || "success");
  }

  function clearMessage(element) {
    element.textContent = "";
    element.classList.remove("success", "warning", "error");
  }
})();
