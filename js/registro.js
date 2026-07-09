(function () {
  const form = document.querySelector("#availabilityForm");
  const submitButton = form.querySelector("button[type='submit']");
  const registrationCodeInput = document.querySelector("#registrationCode");
  const serverSelect = document.querySelector("#serverSelect");
  const newServerFields = document.querySelector("#newServerFields");
  const firstNameInput = document.querySelector("#firstName");
  const lastNameInput = document.querySelector("#lastName");
  const teamSelect = document.querySelector("#teamSelect");
  const roleSelect = document.querySelector("#roleSelect");
  const monthInput = document.querySelector("#serviceMonth");
  const maxServicesInput = document.querySelector("#maxServices");
  const observationsInput = document.querySelector("#observations");
  const sundaysGrid = document.querySelector("#sundaysGrid");
  const statusMessage = document.querySelector("#statusMessage");
  const defaultSubmitText = submitButton.textContent;

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
    const response = await fetch(withCacheBuster(path), {
      cache: "no-store"
    });
    if (!response.ok) {
      throw new Error("No se pudo cargar " + path);
    }
    return response.json();
  }

  function populateServers() {
    serverSelect.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Selecciona tu nombre";
    serverSelect.appendChild(placeholder);

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

  async function handleSubmit(event) {
    event.preventDefault();

    const payload = buildPayload();

    if (!payload) {
      showStatus("Completa la informacion requerida antes de guardar.", true);
      return;
    }

    setSavingState(true);

    try {
      const response = await fetch(window.CCI_CONFIG.workerUrl + "/api/registro-mensual", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const result = await readResponseJson(response);

      if (!response.ok || !result.ok) {
        showStatus(result.error || "No se pudo guardar el registro.", true);
        return;
      }

      showStatus("Registro guardado correctamente.");
      const serverSaved = buildSavedServer(payload, result);
      form.reset();
      monthInput.value = getCurrentMonth();
      handleServerSelectChange();
      renderSundays(monthInput.value);
      await reloadServers(serverSaved);
    } catch (error) {
      showStatus("No se pudo conectar con el servidor. Intenta nuevamente en unos minutos.", true);
    } finally {
      setSavingState(false);
    }
  }

  function buildPayload() {
    const isNewServer = serverSelect.value === "__nuevo__";
    const unavailableDates = Array.from(document.querySelectorAll("input[name='unavailableSundays']:checked")).map(function (input) {
      return input.value;
    });

    if (!registrationCodeInput.value.trim() || !monthInput.value || !serverSelect.value || !maxServicesInput.value) {
      return null;
    }

    if (isNewServer) {
      if (!firstNameInput.value.trim() || !lastNameInput.value.trim() || !teamSelect.value || !roleSelect.value) {
        return null;
      }

      return {
        codigoRegistro: registrationCodeInput.value.trim(),
        mes: monthInput.value,
        servidorExistenteId: null,
        nuevoServidor: {
          primerNombre: firstNameInput.value.trim(),
          primerApellido: lastNameInput.value.trim(),
          equipo: teamSelect.value,
          rol: roleSelect.value
        },
        vecesPuedeServir: Number(maxServicesInput.value),
        fechasNoPuede: unavailableDates,
        observaciones: observationsInput.value.trim()
      };
    }

    return {
      codigoRegistro: registrationCodeInput.value.trim(),
      mes: monthInput.value,
      servidorExistenteId: serverSelect.value,
      nuevoServidor: null,
      vecesPuedeServir: Number(maxServicesInput.value),
      fechasNoPuede: unavailableDates,
      observaciones: observationsInput.value.trim()
    };
  }

  async function reloadServers(serverToKeep) {
    try {
      const servidores = await fetchJson(window.CCI_CONFIG.dataPaths.servidores);
      state.servidores = servidores.servidores || [];
      if (serverToKeep) {
        upsertLocalServer(serverToKeep);
      }
      populateServers();
    } catch (error) {
      if (serverToKeep) {
        upsertLocalServer(serverToKeep);
        populateServers();
        return;
      }
      showStatus("Registro guardado, pero no se pudo refrescar la lista de servidores.", true);
    }
  }

  function buildSavedServer(payload, result) {
    if (!payload.nuevoServidor || !result.servidorId) {
      return null;
    }

    return {
      id: result.servidorId,
      primerNombre: payload.nuevoServidor.primerNombre,
      primerApellido: payload.nuevoServidor.primerApellido,
      equipo: payload.nuevoServidor.equipo,
      rol: payload.nuevoServidor.rol
    };
  }

  function upsertLocalServer(server) {
    const existingIndex = state.servidores.findIndex(function (item) {
      return item.id === server.id;
    });

    if (existingIndex >= 0) {
      state.servidores[existingIndex] = server;
    } else {
      state.servidores.push(server);
    }

    state.servidores.sort(function (a, b) {
      return a.primerNombre.localeCompare(b.primerNombre, "es") || a.primerApellido.localeCompare(b.primerApellido, "es");
    });
  }

  async function readResponseJson(response) {
    try {
      return await response.json();
    } catch (error) {
      return { ok: false, error: "El servidor respondio con un formato inesperado." };
    }
  }

  function withCacheBuster(path) {
    const separator = path.includes("?") ? "&" : "?";
    return path + separator + "v=" + Date.now();
  }

  function setSavingState(isSaving) {
    submitButton.disabled = isSaving;
    submitButton.textContent = isSaving ? "Guardando..." : defaultSubmitText;
  }

  function getCurrentMonth() {
    const now = new Date();
    return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  }

  function showStatus(message, isError) {
    statusMessage.textContent = message;
    statusMessage.classList.toggle("error", Boolean(isError));
  }
})();
