(function () {
  const form = document.querySelector("#availabilityForm");
  const submitButton = form.querySelector("button[type='submit']");
  const registrationCodeInput = document.querySelector("#registrationCode");
  const serverSelect = document.querySelector("#serverSelect");
  const profileEditEntry = document.querySelector("#profileEditEntry");
  const editProfileButton = document.querySelector("#editProfileButton");
  const serverProfileFields = document.querySelector("#serverProfileFields");
  const profileEditActions = document.querySelector("#profileEditActions");
  const saveProfileButton = document.querySelector("#saveProfileButton");
  const cancelProfileButton = document.querySelector("#cancelProfileButton");
  const profileStatusMessage = document.querySelector("#profileStatusMessage");
  const firstNameInput = document.querySelector("#firstName");
  const lastNameInput = document.querySelector("#lastName");
  const teamSelect = document.querySelector("#teamSelect");
  const roleSelect = document.querySelector("#roleSelect");
  const additionalRolesGroup = document.querySelector("#additionalRolesGroup");
  const monthInput = document.querySelector("#serviceMonth");
  const maxServicesInput = document.querySelector("#maxServices");
  const observationsInput = document.querySelector("#observations");
  const sundaysGrid = document.querySelector("#sundaysGrid");
  const statusMessage = document.querySelector("#statusMessage");
  const defaultSubmitText = submitButton.textContent;
  const defaultSaveProfileText = saveProfileButton.textContent;

  const state = {
    servidores: [],
    roles: {}
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    await loadBaseData();
    populateMonthOptions();
    renderSundays(monthInput.value);

    serverSelect.addEventListener("change", handleServerSelectChange);
    editProfileButton.addEventListener("click", startProfileEdit);
    saveProfileButton.addEventListener("click", handleProfileSave);
    cancelProfileButton.addEventListener("click", cancelProfileEdit);
    monthInput.addEventListener("change", function () {
      renderSundays(monthInput.value);
    });
    form.addEventListener("submit", handleSubmit);
  }

  async function loadBaseData() {
    try {
      const [servidores, roles] = await Promise.all([
        fetchWorkerJson("/api/servidores"),
        fetchJson(window.CCI_CONFIG.dataPaths.roles)
      ]);

      state.servidores = servidores.servidores || [];
      state.roles = roles && typeof roles === "object" ? roles : {};
      populateServers();
      populateTeamsAndRoles();
    } catch (error) {
      showStatus("No se pudieron cargar los datos iniciales. Revisa los archivos JSON.", "error");
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

  async function fetchWorkerJson(path) {
    const response = await fetch(withCacheBuster(window.CCI_CONFIG.workerUrl + path), {
      cache: "no-store"
    });
    const result = await readResponseJson(response);
    if (!response.ok || !result.ok) {
      throw new Error(result.error || "No se pudieron cargar los datos del servidor");
    }
    return result;
  }

  function populateServers(selectedServerId) {
    serverSelect.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Selecciona tu nombre";
    serverSelect.appendChild(placeholder);

    state.servidores.filter(function (server) {
      return server.activo !== false;
    }).forEach(function (server) {
      const option = document.createElement("option");
      option.value = server.id;
      const fullName = [server.primerNombre, server.primerApellido].filter(Boolean).join(" ");
      const teams = Array.isArray(server.equipos) ? server.equipos.join(", ") : "";
      option.textContent = fullName + " - " + teams + " / " + server.rolPrincipal;
      serverSelect.appendChild(option);
    });

    const newServerOption = document.createElement("option");
    newServerOption.value = "__nuevo__";
    newServerOption.textContent = "+ Agregar servidor";
    serverSelect.appendChild(newServerOption);

    if (selectedServerId && Array.from(serverSelect.options).some(function (option) {
      return option.value === selectedServerId;
    })) {
      serverSelect.value = selectedServerId;
    }
  }

  function populateTeamsAndRoles() {
    const teams = Object.keys(state.roles);

    teams.forEach(function (team) {
      const option = document.createElement("option");
      option.value = team;
      option.textContent = team;
      teamSelect.appendChild(option);
    });

    teamSelect.addEventListener("change", populateRoleOptions);
    roleSelect.addEventListener("change", populateAdditionalRoleOptions);
  }

  function populateRoleOptions() {
    roleSelect.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Selecciona rol principal";
    roleSelect.appendChild(placeholder);

    getRolesForSelectedTeam().forEach(function (role) {
      const option = document.createElement("option");
      option.value = role;
      option.textContent = role;
      roleSelect.appendChild(option);
    });

    populateAdditionalRoleOptions();
  }

  function populateAdditionalRoleOptions(rolesToSelect) {
    const selectedRoles = rolesToSelect || new Set(Array.from(additionalRolesGroup.querySelectorAll("input:checked")).map(function (input) {
      return input.value;
    }));
    additionalRolesGroup.innerHTML = "";

    getRolesForSelectedTeam().forEach(function (role) {
      if (role === roleSelect.value) {
        return;
      }

      const input = document.createElement("input");
      const label = document.createElement("label");
      const text = document.createElement("span");
      const id = "additional-role-" + slugifyForId(role);

      input.type = "checkbox";
      input.id = id;
      input.name = "additionalRoles";
      input.value = role;
      input.checked = selectedRoles.has(role);

      label.className = "role-option";
      label.setAttribute("for", id);
      text.textContent = role;
      label.append(input, text);
      additionalRolesGroup.appendChild(label);
    });
  }

  function slugifyForId(value) {
    return value.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function getRolesForSelectedTeam() {
    return Array.isArray(state.roles[teamSelect.value]) ? state.roles[teamSelect.value] : [];
  }

  function handleServerSelectChange() {
    const addingNewServer = serverSelect.value === "__nuevo__";
    const selectedExistingServer = getSelectedExistingServer();

    profileEditEntry.hidden = !selectedExistingServer;
    serverProfileFields.hidden = !addingNewServer;
    profileEditActions.hidden = true;
    clearProfileStatus();
    resetProfileFields();
    firstNameInput.readOnly = false;
    firstNameInput.required = addingNewServer;
    lastNameInput.required = false;
    teamSelect.required = addingNewServer;
    roleSelect.required = addingNewServer;
  }

  function getSelectedExistingServer() {
    if (!serverSelect.value || serverSelect.value === "__nuevo__") {
      return null;
    }

    return state.servidores.find(function (server) {
      return server.id === serverSelect.value;
    }) || null;
  }

  function startProfileEdit() {
    const server = getSelectedExistingServer();
    if (!server) {
      return;
    }

    firstNameInput.value = server.primerNombre || "";
    firstNameInput.readOnly = true;
    lastNameInput.value = server.primerApellido || "";
    teamSelect.value = Array.isArray(server.equipos) ? server.equipos[0] || "" : "";
    populateRoleOptions();
    roleSelect.value = server.rolPrincipal || "";
    populateAdditionalRoleOptions(new Set(Array.isArray(server.roles) ? server.roles : []));

    profileEditEntry.hidden = true;
    serverProfileFields.hidden = false;
    profileEditActions.hidden = false;
    teamSelect.required = true;
    roleSelect.required = true;
    clearProfileStatus();
  }

  function cancelProfileEdit() {
    profileEditEntry.hidden = !getSelectedExistingServer();
    serverProfileFields.hidden = true;
    profileEditActions.hidden = true;
    teamSelect.required = false;
    roleSelect.required = false;
    clearProfileStatus();
    resetProfileFields();
  }

  function resetProfileFields() {
    firstNameInput.value = "";
    lastNameInput.value = "";
    teamSelect.value = "";
    roleSelect.innerHTML = '<option value="">Selecciona rol principal</option>';
    additionalRolesGroup.innerHTML = "";
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

  async function handleProfileSave() {
    const payload = buildProfileUpdatePayload();

    if (!payload) {
      showMessage(profileStatusMessage, "Completa el código, equipo y rol principal antes de guardar.", "error");
      return;
    }

    const selectedServer = getSelectedExistingServer();
    if (!payload.cambios.primerApellido && hasAnotherServerWithFirstName(selectedServer.primerNombre, selectedServer.id)) {
      showMessage(profileStatusMessage, "Ya existe otro servidor con este primer nombre. Debes agregar tu primer apellido para diferenciarte.", "warning");
      return;
    }

    setProfileSavingState(true);

    try {
      const response = await fetch(window.CCI_CONFIG.workerUrl + "/api/actualizar-servidor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const result = await readResponseJson(response);

      if (!response.ok || !result.ok) {
        showMessage(profileStatusMessage, result.error || "No se pudo actualizar tu información.", response.status === 409 ? "warning" : "error");
        return;
      }

      if (result.servidor) {
        upsertLocalServer(result.servidor);
        populateServers(result.servidor.id);
      }

      showMessage(profileStatusMessage, "Tu información fue actualizada correctamente.", "success");
    } catch (error) {
      showMessage(profileStatusMessage, "No se pudo conectar con el servidor. Intenta nuevamente en unos minutos.", "error");
    } finally {
      setProfileSavingState(false);
    }
  }

  function buildProfileUpdatePayload() {
    const server = getSelectedExistingServer();
    if (!server || !registrationCodeInput.value.trim() || !teamSelect.value || !roleSelect.value) {
      return null;
    }

    return {
      codigoRegistro: registrationCodeInput.value.trim(),
      servidorId: server.id,
      cambios: {
        primerApellido: lastNameInput.value.trim(),
        equipos: [teamSelect.value],
        rolPrincipal: roleSelect.value,
        roles: getSelectedProfileRoles()
      }
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (serverSelect.value === "__nuevo__" && !lastNameInput.value.trim() && hasAnotherServerWithFirstName(firstNameInput.value)) {
      showStatus("Ya existe otro servidor con este primer nombre. Agrega tu primer apellido para poder diferenciarte.", "warning");
      return;
    }

    const payload = buildPayload();

    if (!payload) {
      showStatus("Completa la informacion requerida antes de guardar.", "error");
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
        showStatus(result.error || "No se pudo guardar el registro.", response.status === 409 ? "warning" : "error");
        return;
      }

      showStatus(getSuccessMessage(payload, result), "success");
      const serverSaved = buildSavedServer(payload, result);
      form.reset();
      populateMonthOptions();
      handleServerSelectChange();
      renderSundays(monthInput.value);
      await reloadServers(serverSaved);
    } catch (error) {
      showStatus("No se pudo conectar con el servidor. Intenta nuevamente en unos minutos.", "error");
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
      if (!firstNameInput.value.trim() || !teamSelect.value || !roleSelect.value) {
        return null;
      }

      return {
        codigoRegistro: registrationCodeInput.value.trim(),
        mes: monthInput.value,
        servidorExistenteId: null,
        nuevoServidor: {
          primerNombre: firstNameInput.value.trim(),
          primerApellido: lastNameInput.value.trim(),
          equipos: [teamSelect.value],
          rolPrincipal: roleSelect.value,
          roles: getSelectedProfileRoles()
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

  function getSelectedProfileRoles() {
    return Array.from(new Set([roleSelect.value].concat(
      Array.from(additionalRolesGroup.querySelectorAll("input:checked")).map(function (input) {
        return input.value;
      })
    ))).filter(Boolean);
  }

  function hasAnotherServerWithFirstName(firstName, excludedServerId) {
    const normalizedFirstName = normalizeName(firstName);
    if (!normalizedFirstName) {
      return false;
    }

    return state.servidores.some(function (server) {
      return server.id !== excludedServerId && normalizeName(server.primerNombre) === normalizedFirstName;
    });
  }

  function normalizeName(value) {
    return String(value || "").trim().toLocaleLowerCase("es")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  async function reloadServers(serverToKeep) {
    try {
      const servidores = await fetchWorkerJson("/api/servidores");
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
      showStatus("Registro guardado, pero no se pudo refrescar la lista de servidores.", "warning");
    }
  }

  function getSuccessMessage(payload, result) {
    if (payload.nuevoServidor && result.servidorAgregado === true) {
      return "Servidor agregado y disponibilidad guardada correctamente.";
    }

    return "Disponibilidad guardada correctamente.";
  }

  function buildSavedServer(payload, result) {
    if (!payload.nuevoServidor || !result.servidorId || result.servidorAgregado !== true) {
      return null;
    }

    return {
      id: result.servidorId,
      primerNombre: payload.nuevoServidor.primerNombre,
      primerApellido: payload.nuevoServidor.primerApellido,
      equipos: payload.nuevoServidor.equipos,
      rolPrincipal: payload.nuevoServidor.rolPrincipal,
      roles: payload.nuevoServidor.roles,
      activo: true
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

  function setProfileSavingState(isSaving) {
    saveProfileButton.disabled = isSaving;
    cancelProfileButton.disabled = isSaving;
    saveProfileButton.textContent = isSaving ? "Guardando cambios..." : defaultSaveProfileText;
  }

  function populateMonthOptions() {
    monthInput.innerHTML = "";

    getAvailableMonths().forEach(function (month) {
      const option = document.createElement("option");
      option.value = month;
      option.textContent = formatMonthLabel(month);
      monthInput.appendChild(option);
    });
  }

  function getAvailableMonths() {
    const now = new Date();
    const currentMonthIndex = now.getMonth();
    const year = currentMonthIndex === 11 ? now.getFullYear() + 1 : now.getFullYear();
    const startMonth = currentMonthIndex === 11 ? 0 : currentMonthIndex + 1;
    const months = [];

    for (let monthIndex = startMonth; monthIndex < 12; monthIndex += 1) {
      months.push(year + "-" + String(monthIndex + 1).padStart(2, "0"));
    }

    return months;
  }

  function formatMonthLabel(monthValue) {
    const parts = monthValue.split("-");
    const date = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
    const label = new Intl.DateTimeFormat("es-HN", {
      month: "long",
      year: "numeric"
    }).format(date);

    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function showStatus(message, type) {
    showMessage(statusMessage, message, type);
  }

  function showMessage(element, message, type) {
    const statusType = type || "success";
    element.textContent = message;
    element.classList.remove("success", "warning", "error");
    element.classList.add(statusType);
  }

  function clearProfileStatus() {
    profileStatusMessage.textContent = "";
    profileStatusMessage.classList.remove("success", "warning", "error");
  }
})();
