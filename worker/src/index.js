const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return handleOptions(request, env);
    }

    if (!isCorsAllowed(request, env)) {
      return jsonResponse(
        { ok: false, error: "Origen no permitido" },
        403,
        env,
        request,
        { includeBlockedOrigin: true }
      );
    }

    try {
      if (url.pathname === "/api/health" && request.method === "GET") {
        return jsonResponse({ ok: true, service: "cci-servicio-worker" }, 200, env, request);
      }

      if (url.pathname === "/api/servidores" && request.method === "GET") {
        return handleGetServidores(request, env);
      }

      if (url.pathname === "/api/registro-mensual" && request.method === "POST") {
        return handleRegistroMensual(request, env);
      }

      if (url.pathname === "/api/actualizar-servidor" && request.method === "POST") {
        return handleActualizarServidor(request, env);
      }

      if (url.pathname === "/api/admin/resumen" && request.method === "POST") {
        return handleAdminResumen(request, env);
      }

      if (url.pathname === "/api/admin/generar-plan" && request.method === "POST") {
        return handleAdminGenerarPlan(request, env);
      }

      if (url.pathname === "/api/admin/guardar-plan" && request.method === "POST") {
        return handleAdminGuardarPlan(request, env);
      }

      return jsonResponse({ ok: false, error: "Ruta no encontrada" }, 404, env, request);
    } catch (error) {
      return jsonResponse({
        ok: false,
        error: "Error interno del Worker"
      }, 500, env, request);
    }
  }
};

async function handleGetServidores(request, env) {
  const servidoresFile = await readGithubJson(env, "data/servidores.json", { servidores: [] });
  const servidoresData = normalizeServidoresData(servidoresFile.data);
  sortServidores(servidoresData.servidores);
  return jsonResponse({ ok: true, servidores: servidoresData.servidores }, 200, env, request);
}

async function handleRegistroMensual(request, env) {
  const payload = await readJsonBody(request);
  const validation = validatePayload(payload, env);

  if (!validation.ok) {
    return jsonResponse({ ok: false, error: validation.error }, validation.status, env, request);
  }

  const servidoresFile = await readGithubJson(env, "data/servidores.json", { servidores: [] });
  const servidoresData = normalizeServidoresData(servidoresFile.data);

  if (validation.payload.nuevoServidor) {
    const rolesFile = await readGithubJson(env, "data/roles.json", {});
    const rolesValidation = validateProfileRoles(validation.payload.nuevoServidor, rolesFile.data);
    if (!rolesValidation.ok) {
      return jsonResponse({ ok: false, error: rolesValidation.error }, rolesValidation.status, env, request);
    }
  }

  const serverResult = resolveServidor(validation.payload, servidoresData.servidores);

  if (!serverResult.ok) {
    return jsonResponse({ ok: false, error: serverResult.error }, serverResult.status || 400, env, request);
  }

  if (serverResult.added) {
    servidoresData.servidores.push(serverResult.servidor);
  }

  if (serverResult.added) {
    sortServidores(servidoresData.servidores);
    await writeGithubJson(
      env,
      "data/servidores.json",
      servidoresData,
      servidoresFile.sha,
      "Actualiza servidores CCI"
    );
  }

  const disponibilidadPath = "data/disponibilidad/" + validation.payload.mes + ".json";
  const disponibilidadFile = await readGithubJson(env, disponibilidadPath, {
    mes: validation.payload.mes,
    registros: []
  });
  const disponibilidadData = normalizeDisponibilidadData(disponibilidadFile.data, validation.payload.mes);
  const registro = buildDisponibilidadRegistro(validation.payload, serverResult.servidor);

  upsertRegistro(disponibilidadData.registros, registro);

  await writeGithubJson(
    env,
    disponibilidadPath,
    disponibilidadData,
    disponibilidadFile.sha,
    "Actualiza disponibilidad " + validation.payload.mes
  );

  return jsonResponse({
    ok: true,
    servidorId: serverResult.servidor.id,
    servidorAgregado: serverResult.added,
    mes: validation.payload.mes
  }, 200, env, request);
}

async function handleActualizarServidor(request, env) {
  const payload = await readJsonBody(request);
  const validation = validateProfileUpdatePayload(payload, env);

  if (!validation.ok) {
    return jsonResponse({ ok: false, error: validation.error }, validation.status, env, request);
  }

  const servidoresFile = await readGithubJson(env, "data/servidores.json", { servidores: [] });
  const servidoresData = normalizeServidoresData(servidoresFile.data);
  const servidor = servidoresData.servidores.find(function (item) {
    return item.id === validation.payload.servidorId;
  });

  if (!servidor) {
    return jsonResponse({ ok: false, error: "El servidor seleccionado no existe" }, 404, env, request);
  }

  const rolesFile = await readGithubJson(env, "data/roles.json", {});
  const rolesValidation = validateProfileRoles(validation.payload.cambios, rolesFile.data);
  if (!rolesValidation.ok) {
    return jsonResponse({ ok: false, error: rolesValidation.error }, rolesValidation.status, env, request);
  }

  const otherServers = servidoresData.servidores.filter(function (item) {
    return item.id !== servidor.id;
  });
  const candidate = {
    ...servidor,
    primerApellido: validation.payload.cambios.primerApellido,
    equipos: validation.payload.cambios.equipos,
    rolPrincipal: validation.payload.cambios.rolPrincipal,
    roles: validation.payload.cambios.roles
  };

  if (!candidate.primerApellido && otherServers.some(function (item) {
    return sameFirstName(item, candidate);
  })) {
    return jsonResponse({
      ok: false,
      error: "Ya existe otro servidor con este primer nombre. Agrega tu primer apellido para diferenciarte."
    }, 409, env, request);
  }

  if (candidate.primerApellido && otherServers.some(function (item) {
    return sameCompleteName(item, candidate);
  })) {
    return jsonResponse({
      ok: false,
      error: "Ya existe otro servidor con el mismo nombre y apellido."
    }, 409, env, request);
  }

  const changed = JSON.stringify(servidor) !== JSON.stringify(candidate);
  if (changed) {
    Object.assign(servidor, candidate);
    sortServidores(servidoresData.servidores);
    await writeGithubJson(
      env,
      "data/servidores.json",
      servidoresData,
      servidoresFile.sha,
      "Actualiza perfil de servidor CCI"
    );
  }

  return jsonResponse({ ok: true, servidor }, 200, env, request);
}

async function handleAdminResumen(request, env) {
  const payload = await readJsonBody(request);
  const validation = validateAdminPayload(payload, env, false);
  if (!validation.ok) {
    return jsonResponse({ ok: false, error: validation.error }, validation.status, env, request);
  }

  const context = await loadPlanningContext(env, validation.payload.mes);
  return jsonResponse({
    ok: true,
    mes: validation.payload.mes,
    resumen: buildAdminSummary(context),
    servidores: context.servidores,
    registros: context.registros,
    rolesRequeridos: context.rolesRequeridos,
    posiciones: context.posiciones,
    planGuardado: context.planGuardado
  }, 200, env, request);
}

async function handleAdminGenerarPlan(request, env) {
  const payload = await readJsonBody(request);
  const validation = validateAdminPayload(payload, env, false);
  if (!validation.ok) {
    return jsonResponse({ ok: false, error: validation.error }, validation.status, env, request);
  }

  const context = await loadPlanningContext(env, validation.payload.mes);
  const plan = generateMonthlyPlan(validation.payload.mes, context);
  return jsonResponse({ ok: true, plan }, 200, env, request);
}

async function handleAdminGuardarPlan(request, env) {
  const payload = await readJsonBody(request);
  const validation = validateAdminPayload(payload, env, true);
  if (!validation.ok) {
    return jsonResponse({ ok: false, error: validation.error }, validation.status, env, request);
  }

  const context = await loadPlanningContext(env, validation.payload.mes);
  const planValidation = validateMonthlyPlan(validation.payload.fechas, validation.payload.mes, context);
  if (!planValidation.ok) {
    return jsonResponse({ ok: false, error: planValidation.error }, planValidation.status, env, request);
  }

  const path = "data/planificaciones/" + validation.payload.mes + ".json";
  const existingFile = await readGithubJson(env, path, null);
  const now = new Date().toISOString();
  const plan = {
    mes: validation.payload.mes,
    estado: "borrador",
    fechas: planValidation.fechas,
    generadoEn: existingFile.data && existingFile.data.generadoEn ? existingFile.data.generadoEn : now,
    actualizadoEn: now
  };

  await writeGithubJson(
    env,
    path,
    plan,
    existingFile.sha,
    "Guarda planificacion " + validation.payload.mes
  );

  return jsonResponse({ ok: true, plan }, 200, env, request);
}

function validateAdminPayload(payload, env, includesPlan) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return invalid("El cuerpo debe ser JSON valido");
  }

  const expectedKeys = includesPlan ? ["adminCode", "mes", "fechas"] : ["adminCode", "mes"];
  const contractValidation = validateExactKeys(payload, expectedKeys, "El payload administrativo");
  if (!contractValidation.ok) {
    return invalid(contractValidation.error);
  }

  if (!env.ADMIN_CODE) {
    return invalid("ADMIN_CODE no esta configurado en el Worker", 500);
  }

  if (payload.adminCode !== env.ADMIN_CODE) {
    return invalid("Codigo administrativo invalido", 401);
  }

  if (!isValidMonth(payload.mes)) {
    return invalid("El mes debe tener formato YYYY-MM");
  }

  if (includesPlan && !Array.isArray(payload.fechas)) {
    return invalid("fechas debe ser una lista");
  }

  return {
    ok: true,
    payload: {
      mes: payload.mes,
      fechas: includesPlan ? payload.fechas : undefined
    }
  };
}

async function loadPlanningContext(env, mes) {
  const disponibilidadPath = "data/disponibilidad/" + mes + ".json";
  const planPath = "data/planificaciones/" + mes + ".json";
  const files = await Promise.all([
    readGithubJson(env, "data/servidores.json", { servidores: [] }),
    readGithubJson(env, disponibilidadPath, { mes, registros: [] }),
    readGithubJson(env, "data/configuracion/roles-requeridos.json", {}),
    readGithubJson(env, "data/configuracion/posiciones.json", {}),
    readGithubJson(env, planPath, null)
  ]);

  return {
    mes,
    servidores: normalizeServidoresData(files[0].data).servidores.filter(function (server) {
      return server.activo !== false;
    }),
    registros: normalizeDisponibilidadData(files[1].data, mes).registros,
    rolesRequeridos: files[2].data && typeof files[2].data === "object" ? files[2].data : {},
    posiciones: files[3].data && typeof files[3].data === "object" ? files[3].data : {},
    planGuardado: files[4].data
  };
}

function buildAdminSummary(context) {
  const activeServers = context.servidores;
  const activeIds = new Set(activeServers.map(function (server) {
    return server.id;
  }));
  const registeredIds = new Set(context.registros.filter(function (record) {
    return activeIds.has(record.servidorId);
  }).map(function (record) {
    return record.servidorId;
  }));
  const slots = buildPlanningSlots(context.rolesRequeridos, context.posiciones);
  const roles = [];

  Object.keys(context.rolesRequeridos).forEach(function (team) {
    Object.keys(context.rolesRequeridos[team] || {}).forEach(function (role) {
      const eligible = activeServers.filter(function (server) {
        return registeredIds.has(server.id) && server.equipos.includes(team) && server.roles.includes(role);
      });
      roles.push({
        equipo: team,
        rol: role,
        requeridos: Number(context.rolesRequeridos[team][role]) || 0,
        disponiblesMes: eligible.length
      });
    });
  });

  return {
    servidoresActivos: activeServers.length,
    servidoresRegistrados: registeredIds.size,
    servidoresPendientes: activeServers.filter(function (server) {
      return !registeredIds.has(server.id);
    }).map(function (server) {
      return { id: server.id, nombre: getServerDisplayName(server) };
    }),
    domingos: getSundaysForMonth(context.mes).length,
    puestosPorDomingo: slots.length,
    capacidadDeclarada: context.registros.reduce(function (total, record) {
      return total + (activeIds.has(record.servidorId) ? getServiceLimit(record) : 0);
    }, 0),
    roles
  };
}

function buildPlanningSlots(rolesRequeridos, posiciones) {
  const slots = [];
  Object.keys(rolesRequeridos || {}).forEach(function (team) {
    Object.keys(rolesRequeridos[team] || {}).forEach(function (role) {
      const required = Math.max(0, Number(rolesRequeridos[team][role]) || 0);
      const rolePositions = getPositionsForRole(team, role, required, posiciones);
      for (let index = 0; index < required; index += 1) {
        slots.push({
          slotId: slugify(team) + "-" + slugify(role) + "-" + String(index + 1),
          equipo: team,
          rol: role,
          posicion: rolePositions[index] || (required > 1 ? role + " " + String(index + 1) : role)
        });
      }
    });
  });
  return slots;
}

function getPositionsForRole(team, role, required, posiciones) {
  if (team === "Multimedia") {
    return Array.from({ length: required }, function (_, index) {
      return required > 1 ? role + " " + String(index + 1) : role;
    });
  }

  const altar = posiciones && posiciones.Altar ? posiciones.Altar : {};
  const direction = Array.isArray(altar.Direccion) ? altar.Direccion : [];
  const voices = Array.isArray(altar.Voces) ? altar.Voces : [];
  const instruments = Array.isArray(altar.Instrumentos) ? altar.Instrumentos : [];

  if (role === "Dirección de alabanza") {
    return direction.slice(0, required);
  }
  if (role === "Dirección musical") {
    return direction.slice(1, 1 + required);
  }
  if (role === "Coro/Voces") {
    return voices.slice(0, required);
  }
  if (role === "Piano") {
    return instruments.filter(function (position) {
      return normalizeIdentity(position).startsWith("piano");
    }).slice(0, required);
  }

  const exactInstrument = instruments.find(function (position) {
    return normalizeIdentity(position) === normalizeIdentity(role);
  });
  return exactInstrument ? [exactInstrument] : [];
}

function getSundaysForMonth(monthValue) {
  if (!isValidMonth(monthValue)) {
    return [];
  }

  const parts = monthValue.split("-");
  const year = Number(parts[0]);
  const monthIndex = Number(parts[1]) - 1;
  const date = new Date(Date.UTC(year, monthIndex, 1));
  const sundays = [];

  while (date.getUTCMonth() === monthIndex) {
    if (date.getUTCDay() === 0) {
      sundays.push(date.toISOString().slice(0, 10));
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return sundays;
}

function generateMonthlyPlan(mes, context) {
  const slots = buildPlanningSlots(context.rolesRequeridos, context.posiciones);
  const recordsByServer = new Map(context.registros.map(function (record) {
    return [record.servidorId, record];
  }));
  const assignmentCounts = new Map();
  const fechas = getSundaysForMonth(mes).map(function (fecha) {
    const usedOnDate = new Set();
    const assignmentsBySlot = new Map();
    const orderedSlots = slots.map(function (slot, index) {
      return { slot, index };
    }).sort(function (a, b) {
      const aCount = getEligibleServers(a.slot, fecha, context.servidores, recordsByServer).length;
      const bCount = getEligibleServers(b.slot, fecha, context.servidores, recordsByServer).length;
      return aCount - bCount || a.index - b.index;
    });

    orderedSlots.forEach(function (entry) {
      const candidates = getEligibleServers(entry.slot, fecha, context.servidores, recordsByServer).filter(function (server) {
        const record = recordsByServer.get(server.id);
        return !usedOnDate.has(server.id) && (assignmentCounts.get(server.id) || 0) < getServiceLimit(record);
      }).sort(function (a, b) {
        const aPrimary = a.rolPrincipal === entry.slot.rol ? 0 : 1;
        const bPrimary = b.rolPrincipal === entry.slot.rol ? 0 : 1;
        const aCount = assignmentCounts.get(a.id) || 0;
        const bCount = assignmentCounts.get(b.id) || 0;
        const aLimit = getServiceLimit(recordsByServer.get(a.id)) || 1;
        const bLimit = getServiceLimit(recordsByServer.get(b.id)) || 1;
        return aPrimary - bPrimary || (aCount / aLimit) - (bCount / bLimit) || aCount - bCount || getServerDisplayName(a).localeCompare(getServerDisplayName(b), "es");
      });

      const selected = candidates[0] || null;
      if (selected) {
        usedOnDate.add(selected.id);
        assignmentCounts.set(selected.id, (assignmentCounts.get(selected.id) || 0) + 1);
      }
      assignmentsBySlot.set(entry.slot.slotId, selected ? selected.id : null);
    });

    return {
      fecha,
      asignaciones: slots.map(function (slot) {
        return { ...slot, servidorId: assignmentsBySlot.get(slot.slotId) || null };
      })
    };
  });

  const assigned = fechas.reduce(function (total, day) {
    return total + day.asignaciones.filter(function (assignment) {
      return Boolean(assignment.servidorId);
    }).length;
  }, 0);
  const totalSlots = fechas.length * slots.length;

  return {
    mes,
    estado: "borrador",
    fechas,
    resumen: {
      puestos: totalSlots,
      asignados: assigned,
      vacantes: totalSlots - assigned
    },
    generadoEn: new Date().toISOString()
  };
}

function getEligibleServers(slot, fecha, servidores, recordsByServer) {
  return servidores.filter(function (server) {
    const record = recordsByServer.get(server.id);
    return record &&
      server.activo !== false &&
      server.equipos.includes(slot.equipo) &&
      server.roles.includes(slot.rol) &&
      !getUnavailableDates(record).includes(fecha) &&
      getServiceLimit(record) > 0;
  });
}

function validateMonthlyPlan(fechas, mes, context) {
  const expectedDates = getSundaysForMonth(mes);
  const expectedSlots = buildPlanningSlots(context.rolesRequeridos, context.posiciones);
  const serversById = new Map(context.servidores.map(function (server) {
    return [server.id, server];
  }));
  const recordsByServer = new Map(context.registros.map(function (record) {
    return [record.servidorId, record];
  }));
  const assignmentCounts = new Map();

  if (fechas.length !== expectedDates.length) {
    return invalid("La planificación debe incluir todos los domingos del mes");
  }

  const daysByDate = new Map(fechas.map(function (day) {
    return [day && day.fecha, day];
  }));
  const normalizedDates = [];

  for (const fecha of expectedDates) {
    const day = daysByDate.get(fecha);
    if (!day || !Array.isArray(day.asignaciones)) {
      return invalid("Falta la planificación del domingo " + fecha);
    }

    const assignmentsBySlot = new Map(day.asignaciones.map(function (assignment) {
      return [assignment && assignment.slotId, assignment];
    }));
    if (assignmentsBySlot.size !== expectedSlots.length) {
      return invalid("La cantidad de puestos no coincide para " + fecha);
    }

    const usedOnDate = new Set();
    const normalizedAssignments = [];

    for (const slot of expectedSlots) {
      const assignment = assignmentsBySlot.get(slot.slotId);
      if (!assignment) {
        return invalid("Falta el puesto " + slot.posicion + " para " + fecha);
      }

      const servidorId = assignment.servidorId === null || assignment.servidorId === "" ? null : cleanText(assignment.servidorId);
      if (servidorId) {
        const server = serversById.get(servidorId);
        const record = recordsByServer.get(servidorId);
        if (!server || !record || !getEligibleServers(slot, fecha, [server], recordsByServer).length) {
          return invalid("Asignación no válida en " + slot.posicion + " para " + fecha);
        }
        if (usedOnDate.has(servidorId)) {
          return invalid(getServerDisplayName(server) + " tiene más de una asignación el " + fecha);
        }

        const nextCount = (assignmentCounts.get(servidorId) || 0) + 1;
        if (nextCount > getServiceLimit(record)) {
          return invalid(getServerDisplayName(server) + " supera la cantidad de servicios declarada");
        }
        usedOnDate.add(servidorId);
        assignmentCounts.set(servidorId, nextCount);
      }

      normalizedAssignments.push({ ...slot, servidorId });
    }

    normalizedDates.push({ fecha, asignaciones: normalizedAssignments });
  }

  return { ok: true, fechas: normalizedDates };
}

function getServiceLimit(record) {
  const value = Number(record && record.vecesPuedeServir);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function getUnavailableDates(record) {
  return Array.isArray(record && record.fechasNoPuede) ? record.fechasNoPuede : [];
}

function getServerDisplayName(server) {
  return [server.primerNombre, server.primerApellido].filter(Boolean).join(" ");
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch (error) {
    return null;
  }
}

function validatePayload(payload, env) {
  if (!payload || typeof payload !== "object") {
    return invalid("El cuerpo debe ser JSON valido");
  }

  const contractValidation = validateContractKeys(payload);
  if (!contractValidation.ok) {
    return invalid(contractValidation.error);
  }

  if (!env.REGISTRATION_CODE || payload.codigoRegistro !== env.REGISTRATION_CODE) {
    return invalid("Codigo de registro invalido", 401);
  }

  if (!isValidMonth(payload.mes)) {
    return invalid("El mes debe tener formato YYYY-MM");
  }

  const vecesPuedeServir = Number(payload.vecesPuedeServir);
  if (!Number.isInteger(vecesPuedeServir) || vecesPuedeServir < 1 || vecesPuedeServir > 5) {
    return invalid("La cantidad de servicios debe ser un numero entre 1 y 5");
  }

  if (!Array.isArray(payload.fechasNoPuede)) {
    return invalid("fechasNoPuede debe ser una lista");
  }

  const hasInvalidDate = payload.fechasNoPuede.some(function (date) {
    return typeof date !== "string" || !date.startsWith(payload.mes + "-") || !isValidDate(date);
  });

  if (hasInvalidDate) {
    return invalid("Todos los domingos no disponibles deben pertenecer al mes indicado");
  }

  const servidorExistenteId = typeof payload.servidorExistenteId === "string" ? payload.servidorExistenteId.trim() : "";
  const hasExistingServer = Boolean(servidorExistenteId);
  const hasNewServer = payload.nuevoServidor !== null && typeof payload.nuevoServidor === "object";

  if (payload.servidorExistenteId !== null && typeof payload.servidorExistenteId !== "string") {
    return invalid("servidorExistenteId debe ser texto o null");
  }

  if (typeof payload.observaciones !== "string") {
    return invalid("observaciones debe ser texto");
  }

  if (hasExistingServer && hasNewServer) {
    return invalid("Envia servidorExistenteId o nuevoServidor, no ambos");
  }

  if (!hasExistingServer && !hasNewServer) {
    return invalid("Debes seleccionar un servidor existente o agregar uno nuevo");
  }

  if (hasNewServer) {
    const serverContractValidation = validateNewServerKeys(payload.nuevoServidor);
    if (!serverContractValidation.ok) {
      return invalid(serverContractValidation.error);
    }

    const primerNombre = cleanText(payload.nuevoServidor.primerNombre);
    const primerApellido = cleanText(payload.nuevoServidor.primerApellido);
    const equipos = cleanStringList(payload.nuevoServidor.equipos);
    const rolPrincipal = cleanText(payload.nuevoServidor.rolPrincipal);
    const roles = cleanStringList(payload.nuevoServidor.roles);

    if (!primerNombre || equipos.length === 0 || !rolPrincipal || roles.length === 0) {
      return invalid("El servidor nuevo requiere primer nombre, equipos, rol principal y roles");
    }

    if (!roles.includes(rolPrincipal)) {
      roles.unshift(rolPrincipal);
    }

    return {
      ok: true,
      payload: {
        mes: payload.mes,
        servidorExistenteId: null,
        nuevoServidor: { primerNombre, primerApellido, equipos, rolPrincipal, roles },
        vecesPuedeServir,
        fechasNoPuede: uniqueStrings(payload.fechasNoPuede),
        observaciones: cleanText(payload.observaciones)
      }
    };
  }

  return {
    ok: true,
    payload: {
      mes: payload.mes,
      servidorExistenteId,
      nuevoServidor: null,
      vecesPuedeServir,
      fechasNoPuede: uniqueStrings(payload.fechasNoPuede),
      observaciones: cleanText(payload.observaciones)
    }
  };
}

function invalid(error, status) {
  return { ok: false, error, status: status || 400 };
}

function validateContractKeys(payload) {
  const allowedKeys = [
    "codigoRegistro",
    "mes",
    "servidorExistenteId",
    "nuevoServidor",
    "vecesPuedeServir",
    "fechasNoPuede",
    "observaciones"
  ];
  const payloadKeys = Object.keys(payload);
  const unexpectedKeys = payloadKeys.filter(function (key) {
    return !allowedKeys.includes(key);
  });
  const missingKeys = allowedKeys.filter(function (key) {
    return !Object.prototype.hasOwnProperty.call(payload, key);
  });

  if (unexpectedKeys.length > 0) {
    return { ok: false, error: "El payload contiene campos no permitidos: " + unexpectedKeys.join(", ") };
  }

  if (missingKeys.length > 0) {
    return { ok: false, error: "Faltan campos requeridos: " + missingKeys.join(", ") };
  }

  return { ok: true };
}

function validateNewServerKeys(nuevoServidor) {
  const allowedKeys = ["primerNombre", "primerApellido", "equipos", "rolPrincipal", "roles"];
  const unexpectedKeys = Object.keys(nuevoServidor).filter(function (key) {
    return !allowedKeys.includes(key);
  });
  const missingKeys = allowedKeys.filter(function (key) {
    return !Object.prototype.hasOwnProperty.call(nuevoServidor, key);
  });

  if (unexpectedKeys.length > 0) {
    return { ok: false, error: "nuevoServidor contiene campos no permitidos: " + unexpectedKeys.join(", ") };
  }

  if (missingKeys.length > 0) {
    return { ok: false, error: "Faltan campos en nuevoServidor: " + missingKeys.join(", ") };
  }

  if (!Array.isArray(nuevoServidor.equipos) || !Array.isArray(nuevoServidor.roles)) {
    return { ok: false, error: "equipos y roles deben ser listas" };
  }

  const hasInvalidArrayValue = nuevoServidor.equipos.concat(nuevoServidor.roles).some(function (value) {
    return typeof value !== "string" || !cleanText(value);
  });

  if (hasInvalidArrayValue) {
    return { ok: false, error: "equipos y roles solo pueden contener textos no vacios" };
  }

  return { ok: true };
}

function validateProfileUpdatePayload(payload, env) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return invalid("El cuerpo debe ser JSON valido");
  }

  const contractValidation = validateExactKeys(payload, ["codigoRegistro", "servidorId", "cambios"], "El payload");
  if (!contractValidation.ok) {
    return invalid(contractValidation.error);
  }

  if (!env.REGISTRATION_CODE || payload.codigoRegistro !== env.REGISTRATION_CODE) {
    return invalid("Codigo de registro invalido", 401);
  }

  const servidorId = cleanText(payload.servidorId);
  if (!servidorId) {
    return invalid("servidorId es requerido");
  }

  if (!payload.cambios || typeof payload.cambios !== "object" || Array.isArray(payload.cambios)) {
    return invalid("cambios debe ser un objeto");
  }

  const changesValidation = validateExactKeys(
    payload.cambios,
    ["primerApellido", "equipos", "rolPrincipal", "roles"],
    "cambios"
  );
  if (!changesValidation.ok) {
    return invalid(changesValidation.error);
  }

  if (typeof payload.cambios.primerApellido !== "string") {
    return invalid("primerApellido debe ser texto");
  }

  if (!Array.isArray(payload.cambios.equipos) || !Array.isArray(payload.cambios.roles)) {
    return invalid("equipos y roles deben ser listas");
  }

  const equipos = cleanStringList(payload.cambios.equipos);
  const rolPrincipal = cleanText(payload.cambios.rolPrincipal);
  const roles = cleanStringList(payload.cambios.roles);

  if (equipos.length === 0 || !rolPrincipal || roles.length === 0) {
    return invalid("La actualización requiere equipos, rol principal y roles");
  }

  if (!roles.includes(rolPrincipal)) {
    roles.unshift(rolPrincipal);
  }

  return {
    ok: true,
    payload: {
      servidorId,
      cambios: {
        primerApellido: cleanText(payload.cambios.primerApellido),
        equipos,
        rolPrincipal,
        roles
      }
    }
  };
}

function validateExactKeys(value, allowedKeys, label) {
  const keys = Object.keys(value);
  const unexpectedKeys = keys.filter(function (key) {
    return !allowedKeys.includes(key);
  });
  const missingKeys = allowedKeys.filter(function (key) {
    return !Object.prototype.hasOwnProperty.call(value, key);
  });

  if (unexpectedKeys.length > 0) {
    return { ok: false, error: label + " contiene campos no permitidos: " + unexpectedKeys.join(", ") };
  }

  if (missingKeys.length > 0) {
    return { ok: false, error: "Faltan campos en " + label + ": " + missingKeys.join(", ") };
  }

  return { ok: true };
}

function validateProfileRoles(profile, rolesCatalog) {
  const equipos = cleanStringList(profile.equipos);
  const roles = cleanStringList(profile.roles);
  const rolPrincipal = cleanText(profile.rolPrincipal);
  const unknownTeams = equipos.filter(function (team) {
    return !Array.isArray(rolesCatalog[team]);
  });

  if (unknownTeams.length > 0) {
    return invalid("Equipo no permitido: " + unknownTeams.join(", "));
  }

  const allowedRoles = new Set(equipos.flatMap(function (team) {
    return rolesCatalog[team];
  }));
  const unknownRoles = roles.filter(function (role) {
    return !allowedRoles.has(role);
  });

  if (unknownRoles.length > 0 || !allowedRoles.has(rolPrincipal)) {
    return invalid("Uno o mas roles no pertenecen a los equipos seleccionados");
  }

  if (!roles.includes(rolPrincipal)) {
    return invalid("El rol principal debe estar incluido en roles");
  }

  return { ok: true };
}

function resolveServidor(payload, servidores) {
  if (payload.servidorExistenteId) {
    const existing = servidores.find(function (server) {
      return server.id === payload.servidorExistenteId;
    });

    if (!existing) {
      return { ok: false, error: "El servidor seleccionado no existe" };
    }

    return { ok: true, servidor: existing, added: false };
  }

  const serversWithSameFirstName = servidores.filter(function (server) {
    return sameFirstName(server, payload.nuevoServidor);
  });

  if (!payload.nuevoServidor.primerApellido && serversWithSameFirstName.length > 0) {
    return {
      ok: false,
      status: 409,
      error: "Ya existe otro servidor con este primer nombre. Agrega tu primer apellido para diferenciarte."
    };
  }

  const existingWithCompleteName = servidores.find(function (server) {
    return sameCompleteName(server, payload.nuevoServidor);
  });

  if (payload.nuevoServidor.primerApellido && existingWithCompleteName) {
    return {
      ok: false,
      status: 409,
      error: "Ya existe un servidor con el mismo nombre y apellido. Seleccionalo en la lista."
    };
  }

  const id = createUniqueServerId(payload.nuevoServidor, servidores);

  return {
    ok: true,
    added: true,
    servidor: {
      id,
      primerNombre: payload.nuevoServidor.primerNombre,
      primerApellido: payload.nuevoServidor.primerApellido,
      equipos: payload.nuevoServidor.equipos,
      rolPrincipal: payload.nuevoServidor.rolPrincipal,
      roles: payload.nuevoServidor.roles,
      activo: true
    }
  };
}

function buildDisponibilidadRegistro(payload, servidor) {
  return {
    servidorId: servidor.id,
    vecesPuedeServir: payload.vecesPuedeServir,
    fechasNoPuede: payload.fechasNoPuede,
    observaciones: payload.observaciones,
    actualizadoEn: new Date().toISOString()
  };
}

function upsertRegistro(registros, registro) {
  const index = registros.findIndex(function (item) {
    return item.servidorId === registro.servidorId;
  });

  if (index >= 0) {
    registros[index] = registro;
  } else {
    registros.push(registro);
  }

  registros.sort(function (a, b) {
    return String(a.servidorId || "").localeCompare(String(b.servidorId || ""), "es");
  });
}

async function readGithubJson(env, path, fallbackData) {
  const response = await githubFetch(env, "/repos/" + env.GITHUB_OWNER + "/" + env.GITHUB_REPO + "/contents/" + encodePath(path) + "?ref=" + encodeURIComponent(env.GITHUB_BRANCH), {
    method: "GET"
  });

  if (response.status === 404) {
    return { data: fallbackData, sha: undefined };
  }

  if (!response.ok) {
    throw new Error("No se pudo leer " + path);
  }

  const body = await response.json();
  const content = decodeBase64(body.content || "");
  return {
    data: JSON.parse(content),
    sha: body.sha
  };
}

async function writeGithubJson(env, path, data, sha, message) {
  const body = {
    message,
    content: encodeBase64(JSON.stringify(data, null, 2) + "\n"),
    branch: env.GITHUB_BRANCH,
    committer: {
      name: env.COMMITTER_NAME,
      email: env.COMMITTER_EMAIL
    }
  };

  if (sha) {
    body.sha = sha;
  }

  const response = await githubFetch(env, "/repos/" + env.GITHUB_OWNER + "/" + env.GITHUB_REPO + "/contents/" + encodePath(path), {
    method: "PUT",
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error("No se pudo guardar " + path);
  }

  return response.json();
}

async function githubFetch(env, path, init) {
  assertEnv(env);

  return fetch("https://api.github.com" + path, {
    ...init,
    headers: {
      "accept": "application/vnd.github+json",
      "authorization": "Bearer " + env.GITHUB_TOKEN,
      "content-type": "application/json",
      "user-agent": "cci-servicio-worker",
      "x-github-api-version": "2022-11-28",
      ...(init.headers || {})
    }
  });
}

function assertEnv(env) {
  const required = [
    "GITHUB_OWNER",
    "GITHUB_REPO",
    "GITHUB_BRANCH",
    "GITHUB_TOKEN",
    "COMMITTER_NAME",
    "COMMITTER_EMAIL"
  ];

  const missing = required.filter(function (key) {
    return !env[key];
  });

  if (missing.length > 0) {
    throw new Error("Faltan variables del Worker: " + missing.join(", "));
  }
}

function normalizeServidoresData(data) {
  return {
    servidores: Array.isArray(data.servidores) ? data.servidores.map(normalizeServidor) : []
  };
}

function normalizeServidor(server) {
  const legacyTeam = cleanText(server.equipo);
  const legacyRole = cleanText(server.rol);
  const equipos = cleanStringList(Array.isArray(server.equipos) ? server.equipos : [legacyTeam]);
  const roles = cleanStringList(Array.isArray(server.roles) ? server.roles : [legacyRole]);
  const rolPrincipal = cleanText(server.rolPrincipal) || legacyRole || roles[0] || "";

  if (rolPrincipal && !roles.includes(rolPrincipal)) {
    roles.unshift(rolPrincipal);
  }

  return {
    id: cleanText(server.id) || createLegacyServerId(server),
    primerNombre: cleanText(server.primerNombre),
    primerApellido: cleanText(server.primerApellido),
    equipos,
    rolPrincipal,
    roles,
    activo: server.activo !== false
  };
}

function normalizeDisponibilidadData(data, mes) {
  return {
    mes,
    registros: Array.isArray(data.registros) ? data.registros : []
  };
}

function sortServidores(servidores) {
  servidores.sort(function (a, b) {
    return a.primerNombre.localeCompare(b.primerNombre, "es") || a.primerApellido.localeCompare(b.primerApellido, "es");
  });
}

function sameFirstName(server, input) {
  return normalizeIdentity(server.primerNombre) === normalizeIdentity(input.primerNombre);
}

function sameCompleteName(server, input) {
  const serverLastName = normalizeIdentity(server.primerApellido);
  const inputLastName = normalizeIdentity(input.primerApellido);
  return Boolean(serverLastName && inputLastName) &&
    sameFirstName(server, input) &&
    serverLastName === inputLastName;
}

function createUniqueServerId(server, servidores) {
  const base = slugify(server.primerNombre) || "servidor";
  let id = "";

  do {
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    id = base + "-" + suffix;
  } while (servidores.some(function (item) {
    return item.id === id;
  }));

  return id;
}

function createLegacyServerId(server) {
  return [
    server.primerNombre,
    server.primerApellido
  ].map(slugify).filter(Boolean).join("-");
}

function slugify(value) {
  return normalize(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeIdentity(value) {
  return normalize(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function cleanText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map(function (value) {
    return String(value).trim();
  }))).sort();
}

function cleanStringList(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(new Set(values.map(cleanText).filter(Boolean)));
}

function isValidMonth(value) {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function decodeBase64(value) {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, function (char) {
    return char.charCodeAt(0);
  });
  return new TextDecoder().decode(bytes);
}

function encodeBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";

  bytes.forEach(function (byte) {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
}

function handleOptions(request, env) {
  if (!isCorsAllowed(request, env)) {
    return jsonResponse(
      { ok: false, error: "Origen no permitido" },
      403,
      env,
      request,
      { includeBlockedOrigin: true }
    );
  }

  return new Response(null, {
    status: 204,
    headers: corsHeaders(env, request)
  });
}

function jsonResponse(body, status, env, request, options) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...corsHeaders(env, request, options)
    }
  });
}

function corsHeaders(env, request, options) {
  const origin = request.headers.get("origin") || "";
  const allowedOrigins = getAllowedOrigins(env);
  const includeBlockedOrigin = Boolean(options && options.includeBlockedOrigin);
  const headers = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };

  if (origin && (allowedOrigins.includes(origin) || includeBlockedOrigin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  } else if (!origin && allowedOrigins.length === 1) {
    headers["Access-Control-Allow-Origin"] = allowedOrigins[0];
  }

  return headers;
}

function isCorsAllowed(request, env) {
  const origin = request.headers.get("origin");

  if (!origin) {
    return true;
  }

  return getAllowedOrigins(env).includes(origin);
}

function getAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGIN || "")
    .split(",")
    .map(function (origin) {
      return origin.trim();
    })
    .filter(Boolean);
}
