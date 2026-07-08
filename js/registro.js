(function () {
  const form = document.querySelector("#availabilityForm");
  const serverSelect = document.querySelector("#serverSelect");
  const newServerFields = document.querySelector("#newServerFields");
  const firstNameInput = document.querySelector("#firstName");
  const lastNameInput = document.querySelector("#lastName");
  const teamSelect = document.querySelector("#teamSelect");
  const roleSelect = document.querySelector("#roleSelect");
  const monthInput = document.querySelector("#serviceMonth");
  const maxServicesInput = document.querySelector("#maxServices");
  const sundaysGrid = document.querySelector("#sundaysGrid");
  const statusMessage = document.querySelector("#statusMessage");

  const state = {
    servidores: [],
    roles: []
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    await loadBaseData();
    renderSundays(monthInput.value);

    serverSelect.addEventListener("change", handleServerSelectChange);
    monthInput.addEventListener("change", function () {
      renderSundays(monthInput.value);
    });
    form.addEventListener("submit", handleSubmit);
  }

  async function loadBaseData() {
    try {
      const [servidores, roles] = await Promise.all([
        fetchJson(window.CCI_CONFIG.dataPaths.servidores),
        fetchJson(window.CCI_CONFIG.dataPaths.roles)
      ]);

      state.servidores = servidores.servidores || [];
      state.roles = roles.roles || [];
      populateServers();
      populateTeamsAndRoles();
    } catch (error) {
      showStatus("No se pudieron cargar los datos iniciales. Revisa los archivos JSON.", true);
    }
  }

  async function fetchJson(path) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error("No se pudo cargar " + path);
    }
    return response.json();
  }

  function populateServers() {
    state.servidores.forEach(function (server) {
      const option = document.createElement("option");
      option.value = server.id;
      option.textContent = server.primerNombre + " " + server.primerApellido + " - " + server.equipo + " / " + server.rol;
      serverSelect.appendChild(option);
    });

    const newServerOption = document.createElement("option");
    newServerOption.value = "__nuevo__";
    newServerOption.textContent = "+ Agregar servidor";
    serverSelect.appendChild(newServerOption);
  }

  function populateTeamsAndRoles() {
    const teams = Array.from(new Set(state.roles.map(function (item) {
      return item.equipo;
    })));

    teams.forEach(function (team) {
      const option = document.createElement("option");
      option.value = team;
      option.textContent = team;
      teamSelect.appendChild(option);
    });

    state.roles.forEach(function (item) {
      const option = document.createElement("option");
      option.value = item.rol;
      option.textContent = item.equipo + " - " + item.rol;
      option.dataset.team = item.equipo;
      roleSelect.appendChild(option);
    });

    teamSelect.addEventListener("change", filterRolesByTeam);
  }

  function filterRolesByTeam() {
    Array.from(roleSelect.options).forEach(function (option) {
      if (!option.value) {
        return;
      }
      option.hidden = Boolean(teamSelect.value) && option.dataset.team !== teamSelect.value;
    });
    roleSelect.value = "";
  }

  function handleServerSelectChange() {
    const addingNewServer = serverSelect.value === "__nuevo__";
    newServerFields.hidden = !addingNewServer;
    firstNameInput.required = addingNewServer;
    lastNameInput.required = addingNewServer;
    teamSelect.required = addingNewServer;
    roleSelect.required = addingNewServer;
  }

  function renderSundays(monthValue) {
    sundaysGrid.innerHTML = "";

    if (!monthValue) {
      return;
    }

    getSundays(monthValue).forEach(function (date) {
      const id = "sunday-" + date.iso;
      const label = document.createElement("label");
      label.className = "sunday-option";
      label.setAttribute("for", id);

      const input = document.createElement("input");
      input.type = "checkbox";
      input.id = id;
      input.name = "unavailableSundays";
      input.value = date.iso;

      const span = document.createElement("span");
      span.textContent = date.label;

      label.append(input, span);
      sundaysGrid.appendChild(label);
    });
  }

  function getSundays(monthValue) {
    const parts = monthValue.split("-");
    const year = Number(parts[0]);
    const monthIndex = Number(parts[1]) - 1;
    const date = new Date(year, monthIndex, 1);
    const sundays = [];

    while (date.getMonth() === monthIndex) {
      if (date.getDay() === 0) {
        const iso = formatDate(date);
        sundays.push({
          iso: iso,
          label: formatDisplayDate(date)
        });
      }
      date.setDate(date.getDate() + 1);
    }

    return sundays;
  }

  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function formatDisplayDate(date) {
    return new Intl.DateTimeFormat("es-HN", {
      weekday: "long",
      day: "numeric",
      month: "long"
    }).format(date);
  }

  function handleSubmit(event) {
    event.preventDefault();

    const payload = buildPayload();

    if (!payload) {
      showStatus("Completa la informacion requerida antes de guardar.", true);
      return;
    }

    console.info("Registro listo para enviar al Worker:", payload);
    showStatus("Registro preparado. En el siguiente paso se conectara con el Cloudflare Worker.");
    form.reset();
    monthInput.value = payload.mes;
    handleServerSelectChange();
    newServerFields.hidden = true;
    renderSundays(monthInput.value);
  }

  function buildPayload() {
    const isNewServer = serverSelect.value === "__nuevo__";
    const unavailableSundays = Array.from(document.querySelectorAll("input[name='unavailableSundays']:checked")).map(function (input) {
      return input.value;
    });

    if (!monthInput.value || !maxServicesInput.value) {
      return null;
    }

    if (isNewServer) {
      if (!firstNameInput.value.trim() || !lastNameInput.value.trim() || !teamSelect.value || !roleSelect.value) {
        return null;
      }

      return {
        mes: monthInput.value,
        servidorNuevo: true,
        servidor: {
          primerNombre: firstNameInput.value.trim(),
          primerApellido: lastNameInput.value.trim(),
          equipo: teamSelect.value,
          rol: roleSelect.value
        },
        cantidadServicios: Number(maxServicesInput.value),
        domingosNoDisponibles: unavailableSundays
      };
    }

    if (!serverSelect.value) {
      return null;
    }

    return {
      mes: monthInput.value,
      servidorNuevo: false,
      servidorId: serverSelect.value,
      cantidadServicios: Number(maxServicesInput.value),
      domingosNoDisponibles: unavailableSundays
    };
  }

  function showStatus(message, isError) {
    statusMessage.textContent = message;
    statusMessage.classList.toggle("error", Boolean(isError));
  }
})();
