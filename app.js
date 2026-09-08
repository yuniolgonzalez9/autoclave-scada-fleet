// =========================================================================
// 1. NOTIFICACIÓN Y NAVEGACIÓN BLINDADA
// =========================================================================
let toastTimer = null;
function notify(msg, color = 'var(--cyan)') {
  const t = document.getElementById("toastApp");
  t.innerText = msg;
  t.style.borderColor = color;
  t.style.color = color;
  t.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.style.display = "none"; }, 2000);
}

const RUTAS_PUBLICAS = ['act-login', 'act-recovery'];
let activityStack = ['act-login'];
let currentInspectedMAC = null;
let currentDetailSubTab = 'tab-det-tele';
let currentViewingReport = null;
let usuarioActual = null;
let temporizadorInactividad = null;
const TIEMPO_LIMITE_INACTIVIDAD = 45 * 60 * 1000;

function guardarEstadoRuta() {
  if (usuarioActual) {
    localStorage.setItem("scada_route_state", JSON.stringify({
      actId: activityStack[activityStack.length - 1],
      mac: currentInspectedMAC,
      subTab: currentDetailSubTab
    }));
  }
}

function fijarHistorialInfinito() {
  history.pushState({ app: 'scada' }, '', window.location.href);
}
fijarHistorialInfinito();

window.openActivity = function(actId) {
  if (activityStack[activityStack.length - 1] !== actId) {
    activityStack.push(actId);
    fijarHistorialInfinito();
  }
  renderActivity(actId);
  guardarEstadoRuta();
};

window.goBackActivity = function() {
  if (activityStack.length > 1) {
    history.back();
  }
};

window.addEventListener('popstate', (event) => {
  fijarHistorialInfinito();

  if (!usuarioActual) {
    activityStack = ['act-login'];
    renderActivity('act-login');
    return;
  }

  activityStack = activityStack.filter(act => !RUTAS_PUBLICAS.includes(act));
  if (activityStack.length === 0) activityStack = ['act-telemetry'];

  if (activityStack.length > 1) {
    activityStack.pop();
    const prevAct = activityStack[activityStack.length - 1];
    renderActivity(prevAct);
    guardarEstadoRuta();
  } else {
    renderActivity('act-telemetry');
    notify("⛔ Estás en el panel principal. Usa SALIR para desconectar.", "var(--amber)");
  }
});

function renderActivity(actId) {
  if (!usuarioActual) {
    if (!RUTAS_PUBLICAS.includes(actId)) {
      actId = 'act-login';
      activityStack = ['act-login'];
    }
  } else {
    if (RUTAS_PUBLICAS.includes(actId)) {
      actId = 'act-telemetry';
      activityStack = ['act-telemetry'];
    }
  }

  const esPublico = RUTAS_PUBLICAS.includes(actId);
  document.getElementById('topAppBar').style.display = esPublico ? 'none' : 'flex';
  document.getElementById('mainNavBar').style.display = esPublico ? 'none' : 'flex';

  document.querySelectorAll('.activity').forEach(a => a.classList.remove('active'));
  const target = document.getElementById(actId);
  if (target) target.classList.add('active');

  const backBtn = document.getElementById('btnGlobalBack');
  if (backBtn) {
    backBtn.style.display = (!esPublico && activityStack.length > 1) ? 'inline-flex' : 'none';
  }

  if (!esPublico) {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    const activeNavTab = Array.from(document.querySelectorAll('.nav-tab')).find(t => t.getAttribute('onclick')?.includes(actId));
    if (activeNavTab) activeNavTab.classList.add('active');
  }

  if (actId === 'act-fota') renderFotaLiveList();
  if (actId === 'act-fleet-mgmt') renderFleetMgmtTable();
  if (actId === 'act-reports') renderizarRegistros();
}

window.refrescarSistemaCompleto = function() {
  cargarEquiposGuardados();
  renderFleetDashboard();
  if (activityStack[activityStack.length - 1] === 'act-reports') renderizarRegistros();
  notify("⚡ Sistema sincronizado en tiempo real", "var(--green)");
};

window.alternarPantallaCompleta = function() {
  const el = document.documentElement;
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }
};

function reiniciarTemporizadorInactividad() {
  if (temporizadorInactividad) clearTimeout(temporizadorInactividad);
  if (usuarioActual) {
    temporizadorInactividad = setTimeout(() => {
      cerrarSesionManual();
    }, TIEMPO_LIMITE_INACTIVIDAD);
  }
}

['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
  window.addEventListener(evt, reiniciarTemporizadorInactividad, { passive: true });
});

window.cerrarSesionManual = function() {
  usuarioActual = null;
  currentInspectedMAC = null;
  localStorage.removeItem("scada_logged_user");
  localStorage.removeItem("scada_route_state");
  if (temporizadorInactividad) clearTimeout(temporizadorInactividad);
  
  activityStack = ['act-login'];
  history.replaceState({ app: 'login' }, '', window.location.pathname + '#login');
  renderActivity('act-login');
  cargarListaUsuariosLogin();
  notify("Sesión cerrada de forma segura", "var(--text-muted)");
};

// =========================================================================
// 2. BASE DE DATOS LOCAL CON ARQUITECTURA DE SESIONES & REPORTES
// =========================================================================
let db;
const fleet = {};
const sesionesActivas = {};

function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("AutoclaveFastFleetDB_v11", 1);
    req.onupgradeneeded = (e) => {
      db = e.target.result;
      if (!db.objectStoreNames.contains("asignaciones")) db.createObjectStore("asignaciones", { keyPath: "mac" });
      if (!db.objectStoreNames.contains("usuarios")) db.createObjectStore("usuarios", { keyPath: "user" });
      if (!db.objectStoreNames.contains("reportes_sesiones")) {
        const sr = db.createObjectStore("reportes_sesiones", { keyPath: "id", autoIncrement: true });
        sr.createIndex("mac", "mac", { unique: false });
        sr.createIndex("fecha", "fecha", { unique: false });
      }
    };
    req.onsuccess = (e) => {
      db = e.target.result;
      
      const tx = db.transaction(["usuarios"], "readwrite");
      const store = tx.objectStore("usuarios");
      store.get("admin").onsuccess = (ev) => {
        if (!ev.target.result) {
          const defaultPass = localStorage.getItem("scada_pass_admin") || "1234";
          store.add({
            user: "admin",
            pass: defaultPass,
            rol: "SUPERADMIN",
            email: "yuniolgonzalez9@gmail.com",
            otp: null,
            otpExpires: 0,
            otpUsado: false,
            fecha: new Date().toISOString()
          });
          localStorage.setItem("scada_pass_admin", defaultPass);
        }
      };

      cargarEquiposGuardados();
      cargarListaUsuariosLogin();
      cargarUsuariosUI();
      verificarSesionPersistente();
      resolve(db);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

function verificarSesionPersistente() {
  const sesionGuardada = localStorage.getItem("scada_logged_user");
  if (sesionGuardada) {
    try {
      const userObj = JSON.parse(sesionGuardada);
      const passActual = localStorage.getItem("scada_pass_" + userObj.user) || userObj.pass;
      userObj.pass = passActual;
      iniciarSesionExitosa(userObj, true);

      const route = JSON.parse(localStorage.getItem("scada_route_state") || "null");
      if (route && route.actId && !RUTAS_PUBLICAS.includes(route.actId)) {
        if (route.actId === 'act-device-detail' && route.mac) {
          abrirDetalleEquipo(route.mac);
          if (route.subTab) switchDetailTab(route.subTab);
        } else {
          openActivity(route.actId);
        }
      }
    } catch(e) {
      localStorage.removeItem("scada_logged_user");
      renderActivity('act-login');
    }
  } else {
    renderActivity('act-login');
  }
}

function cargarEquiposGuardados() {
  const tx = db.transaction(["asignaciones"], "readonly");
  tx.objectStore("asignaciones").getAll().onsuccess = (e) => {
    (e.target.result || []).forEach(item => {
      if (!fleet[item.mac]) {
        fleet[item.mac] = {
          mac: item.mac,
          lastSeen: 0,
          datos: {},
          esquema: null,
          _pendingLock: {},
          meta: {
            alias: item.alias || `AUTOCLAVE [${item.mac.slice(-4)}]`,
            cliente: item.cliente || "SIN ASIGNAR",
            modelo: item.modelo || "CLASE B",
            ciclosCompletados: item.ciclosCompletados || 0,
            limiteMantenimiento: item.limiteMantenimiento || 200
          }
        };
      }
    });
    actualizarSelectoresGlobales();
    renderFleetDashboard();
  };
}

// =========================================================================
// 3. MOTOR DE REPORTES EMPAQUETADOS (STORE & FORWARD)
// =========================================================================
function registrarEventoEnSesion(mac, tipo, msg, extra = {}) {
  const ahora = new Date().toISOString();
  const meta = fleet[mac]?.meta || { alias: mac, modelo: "Autoclave", cliente: "Clínica", ciclosCompletados: 0, limiteMantenimiento: 200 };

  if (!sesionesActivas[mac]) {
    sesionesActivas[mac] = {
      sessionId: `SES-${mac}-${Date.now()}`,
      mac: mac,
      alias: meta.alias,
      modelo: meta.modelo,
      cliente: meta.cliente,
      fecha: ahora,
      horaEncendido: new Date().toLocaleTimeString(),
      horaApagado: "EN OPERACIÓN",
      ciclosAcumulados: meta.ciclosCompletados,
      limiteMantenimiento: meta.limiteMantenimiento,
      tempMax: 25.0,
      presMax: 0.0,
      conteoAlarmas: 0,
      faseFinal: "ESPERA",
      eventos: [],
      esOffline: false
    };
  }

  const ses = sesionesActivas[mac];
  ses.eventos.push({
    hora: new Date().toLocaleTimeString(),
    tipo: tipo,
    msg: msg,
    temp: extra.temp || 0,
    presion: extra.presion || 0
  });

  if (extra.temp && extra.temp > ses.tempMax) ses.tempMax = extra.temp;
  if (extra.presion && extra.presion > ses.presMax) ses.presMax = extra.presion;
  if (tipo === "ALARMA") ses.conteoAlarmas++;
  if (extra.fase) ses.faseFinal = extra.fase;

  guardarSesionEnDB(ses);
}

function guardarSesionEnDB(sesionObj) {
  if (!db) return;
  const tx = db.transaction(["reportes_sesiones"], "readwrite");
  tx.objectStore("reportes_sesiones").put(sesionObj);
  tx.oncomplete = () => {
    if (activityStack[activityStack.length - 1] === 'act-reports') renderizarRegistros();
    if (currentInspectedMAC === sesionObj.mac) cargarLogsDetalle(sesionObj.mac);
  };
}

function procesarPaqueteOfflineSync(mac, paquete) {
  if (!db || !paquete) return;
  paquete.mac = mac;
  paquete.esOffline = true;
  if (!paquete.fecha) paquete.fecha = new Date().toISOString();
  
  const tx = db.transaction(["reportes_sesiones"], "readwrite");
  tx.objectStore("reportes_sesiones").put(paquete);
  tx.oncomplete = () => {
    notify(`📦 Paquete Offline recibido de ${mac}`, "var(--purple)");
    if (activityStack[activityStack.length - 1] === 'act-reports') renderizarRegistros();
  };
}

// =========================================================================
// 4. MQTT CONEXIÓN
// =========================================================================
let mqttClient;

function initMQTT() {
  const uniqueId = "SCADA_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now().toString(36);
  mqttClient = mqtt.connect("wss://broker.emqx.io:8084/mqtt", { clientId: uniqueId, clean: true, keepalive: 60 });

  mqttClient.on("connect", () => {
    document.getElementById("mqttDot").className = "dot online";
    document.getElementById("mqttStatusText").innerText = "ONLINE";
    document.getElementById("mqttStatusText").style.color = "var(--green)";
    mqttClient.subscribe("autoclave_med_2026/+/telemetria");
    mqttClient.subscribe("autoclave_med_2026/+/esquema");
    mqttClient.subscribe("autoclave_med_2026/+/reporte_paquete");
  });

  mqttClient.on("error", () => {
    document.getElementById("mqttDot").className = "dot offline";
    document.getElementById("mqttStatusText").innerText = "ERROR RED";
  });

  mqttClient.on("message", (topic, msg) => {
    try {
      const payload = JSON.parse(msg.toString());
      const mac = topic.split("/")[1];

      if (topic.includes("reporte_paquete")) {
        procesarPaqueteOfflineSync(mac, payload);
      } else if (topic.includes("telemetria")) {
        procesarTelemetriaReal(mac, payload);
      } else if (topic.includes("esquema")) {
        procesarEsquemaReal(mac, payload);
      }
    } catch(e) {}
  });
}

function inicializarDispositivoSiNoExiste(mac) {
  if (!fleet[mac]) {
    fleet[mac] = {
      mac: mac,
      lastSeen: Date.now(),
      datos: {},
      esquema: null,
      _pendingLock: {},
      meta: {
        alias: `AUTOCLAVE [${mac.substring(Math.max(0, mac.length - 4))}]`,
        cliente: "SIN REGISTRAR",
        modelo: "AUTODETECTADO",
        ciclosCompletados: 0,
        limiteMantenimiento: 200
      }
    };

    if (db) {
      db.transaction(["asignaciones"],"readonly").objectStore("asignaciones").get(mac).onsuccess = (e) => {
        if (e.target.result) fleet[mac].meta = e.target.result;
        actualizarSelectoresGlobales();
        renderFleetDashboard();
      };
    }
    registrarEventoEnSesion(mac, "ENCENDIDO", "Dispositivo en línea / Inicio de telemetría");
  }
}

function procesarTelemetriaReal(mac, data) {
  inicializarDispositivoSiNoExiste(mac);
  fleet[mac].lastSeen = Date.now();

  if (data.cfg && fleet[mac]._pendingLock && fleet[mac].datos.cfg) {
    const ahora = Date.now();
    Object.keys(fleet[mac]._pendingLock).forEach(k => {
      if (ahora < fleet[mac]._pendingLock[k]) data.cfg[k] = fleet[mac].datos.cfg[k];
    });
  }

  fleet[mac].datos = data;

  if (data.alarma_cod && data.alarma_cod > 0) {
    if (fleet[mac].ultimaAlarma !== data.alarma_cod) {
      fleet[mac].ultimaAlarma = data.alarma_cod;
      registrarEventoEnSesion(mac, "ALARMA", data.alarma_msg || "Alarma crítica", {
        temp: data.temp_camara,
        presion: data.presion,
        fase: data.fase
      });
    }
  } else {
    fleet[mac].ultimaAlarma = 0;
  }

  if (data.fase === "FINALIZADO CON EXITO" && !fleet[mac].cicloRegistrado) {
    fleet[mac].cicloRegistrado = true;
    fleet[mac].meta.ciclosCompletados = (fleet[mac].meta.ciclosCompletados || 0) + 1;
    
    const tx = db.transaction(["asignaciones"], "readwrite");
    tx.objectStore("asignaciones").put(fleet[mac].meta);

    registrarEventoEnSesion(mac, "CICLO_OK", `Ciclo #${fleet[mac].meta.ciclosCompletados} conforme`, {
      temp: data.temp_camara,
      presion: data.presion,
      fase: data.fase
    });
  } else if (data.fase !== "FINALIZADO CON EXITO") {
    fleet[mac].cicloRegistrado = false;
  }

  actualizarCardDashboard(mac);
  if (currentInspectedMAC === mac) actualizarPantallaDetalleDinamica();
}

function procesarEsquemaReal(mac, data) {
  inicializarDispositivoSiNoExiste(mac);
  fleet[mac].esquema = data;
  fleet[mac].fw = data.fw || "v3.x";
  if (data.modelo && fleet[mac].meta.modelo === "AUTODETECTADO") {
    fleet[mac].meta.modelo = data.modelo;
  }
  if (currentInspectedMAC === mac) generarUIEsquemaDinamico(mac);
  renderFleetDashboard();
}

function isOnline(dev) {
  return dev && dev.lastSeen && (Date.now() - dev.lastSeen) < 20000;
}

// =========================================================================
// 5. MONITOR PRINCIPAL
// =========================================================================
function renderFleetDashboard() {
  const container = document.getElementById("fleetLiveContainer");
  const keys = Object.keys(fleet);

  if (!keys.length) {
    container.innerHTML = `<div class="empty-state">ESPERANDO AUTOCLAVES TRANSMITIENDO...</div>`;
    return;
  }

  const emptyMsg = container.querySelector('.empty-state');
  if (emptyMsg) container.innerHTML = '';

  keys.forEach(mac => {
    let card = document.getElementById(`card-${mac}`);
    if (!card) {
      card = document.createElement('div');
      card.id = `card-${mac}`;
      card.className = 'node-item';
      card.setAttribute('onclick', `abrirDetalleEquipo('${mac}')`);
      container.appendChild(card);
    }
    actualizarCardDashboard(mac);
  });
}

function actualizarCardDashboard(mac) {
  const card = document.getElementById(`card-${mac}`);
  if (!card || !fleet[mac]) return;

  const item = fleet[mac];
  const d = item.datos || {};
  const meta = item.meta || { alias: mac, cliente: "Pendiente", modelo: "Autoclave", ciclosCompletados: 0, limiteMantenimiento: 200 };
  const online = isOnline(item);

  const ciclos = meta.ciclosCompletados || 0;
  const limite = meta.limiteMantenimiento || 200;
  const pct = Math.min(100, Math.round((ciclos / limite) * 100));
  const mantClass = pct >= 100 ? 'danger' : pct >= 80 ? 'warn' : '';

  card.innerHTML = `
    <div class="header-right" style="margin-bottom: 8px;">
      <div>
        <div style="font-size: 0.95rem; font-weight: 800; color: var(--cyan);">${meta.alias}</div>
        <div style="font-size: 0.68rem; color: var(--text-muted);">${meta.cliente} | ${meta.modelo}</div>
      </div>
      <span class="status-badge">
        <span class="dot ${online ? 'online' : 'offline'}"></span>
        ${online ? 'ONLINE' : 'OFFLINE'}
      </span>
    </div>

    <div class="gauge-grid" style="grid-template-columns: 1fr 1fr;">
      <div class="gauge-cell">
        <div class="gauge-val">${(d.temp_camara || 25.0).toFixed(1)}°C</div>
        <div class="gauge-lbl">TEMPERATURA</div>
      </div>
      <div class="gauge-cell">
        <div class="gauge-val p">${(d.presion || 0.0).toFixed(2)}b</div>
        <div class="gauge-lbl">PRESIÓN</div>
      </div>
    </div>

    <div style="margin: 8px 0;">
      <div class="header-right" style="font-size: 0.65rem; color: var(--text-muted);">
        <span>CICLOS: ${ciclos} / ${limite}</span>
        <span style="color:${pct >= 100 ? 'var(--red)' : pct >= 80 ? 'var(--amber)' : 'var(--green)'}; font-weight:700;">
          ${pct >= 100 ? 'MANT. VENCIDO' : pct >= 80 ? 'MANT. PRÓXIMO' : 'SALUD OK'}
        </span>
      </div>
      <div class="health-bar"><div class="health-fill ${mantClass}" style="width: ${pct}%;"></div></div>
    </div>

    <div style="background: rgba(0,0,0,0.35); padding: 7px 10px; border-radius: 4px; font-size: 0.72rem; margin-bottom: 8px; display:flex; justify-content:space-between;">
      <span style="color: var(--text-muted);">FASE:</span> 
      <span style="color: var(--green); font-weight: 700;">${d.fase || 'ESPERA'}</span>
    </div>

    <div style="text-align: center; font-size: 0.65rem; color: var(--cyan); padding: 4px; background: rgba(0,243,255,0.06); border-radius: 4px;">
      👉 TOCAR PARA CONTROL TOTAL
    </div>
  `;
}

// =========================================================================
// 6. DETALLE Y CONTROL DEL EQUIPO
// =========================================================================
window.abrirDetalleEquipo = function(mac) {
  try {
    currentInspectedMAC = mac;
    inicializarDispositivoSiNoExiste(mac);
    const item = fleet[mac];

    document.getElementById("detDeviceAlias").innerText = (item.meta?.alias || mac).toUpperCase();
    document.getElementById("detDeviceSub").innerText = `MAC: ${mac} | CLIENTE: ${item.meta?.cliente || 'SIN REGISTRAR'} | MODELO: ${item.meta?.modelo || 'CLASE B'}`;

    document.getElementById("fichaAlias").value = item.meta?.alias || "";
    document.getElementById("fichaCliente").value = item.meta?.cliente || "";
    document.getElementById("fichaModelo").value = item.meta?.modelo || "";

    generarUIEsquemaDinamico(mac);
    actualizarPantallaDetalleDinamica();
    cargarLogsDetalle(mac);

    switchDetailTab(currentDetailSubTab || 'tab-det-tele');
    openActivity('act-device-detail');
  } catch (err) {
    console.error("Error al abrir detalle:", err);
  }
};

window.eliminarDispositivoActual = function() {
  if (!currentInspectedMAC) return;
  eliminarEquipoTotal(currentInspectedMAC);
};

window.eliminarEquipoTotal = function(mac) {
  if (usuarioActual && usuarioActual.rol === "OPERADOR") return notify("Permiso denegado.", "var(--red)");
  
  const tx = db.transaction(["asignaciones"], "readwrite");
  tx.objectStore("asignaciones").delete(mac);
  tx.oncomplete = () => {
    delete fleet[mac];
    const c = document.getElementById(`card-${mac}`);
    if (c) c.remove();
    actualizarSelectoresGlobales();
    renderFleetDashboard();
    renderFleetMgmtTable();
    if (activityStack[activityStack.length - 1] === 'act-device-detail') goBackActivity();
    notify("Dispositivo eliminado", "var(--amber)");
  };
};

function switchDetailTab(tabId) {
  currentDetailSubTab = tabId;
  guardarEstadoRuta();

  document.querySelectorAll('.detail-subview').forEach(s => s.style.display = 'none');
  document.querySelectorAll('#act-device-detail .btn').forEach(b => {
    if (!b.classList.contains('btn-back') && !b.classList.contains('btn-danger') && !b.classList.contains('btn-warn')) {
      b.classList.remove('active');
    }
  });
  document.getElementById(tabId).style.display = 'block';

  if (tabId === 'tab-det-tele') document.getElementById('btnSubTele').classList.add('active');
  if (tabId === 'tab-det-cfg') document.getElementById('btnSubCfg').classList.add('active');
  if (tabId === 'tab-det-ficha') document.getElementById('btnSubFicha').classList.add('active');
  if (tabId === 'tab-det-logs') document.getElementById('btnSubLogs').classList.add('active');
}

function generarUIEsquemaDinamico(mac) {
  const item = fleet[mac];
  if (!item) return;

  const containerGauges = document.getElementById("containerDynamicGauges");
  const teleDef = item.esquema?.telemetria_def;

  if (teleDef && teleDef.length) {
    containerGauges.innerHTML = teleDef.map(t => `
      <div class="gauge-cell">
        <div class="gauge-val ${t.key === 'presion' ? 'p' : ''}" id="dyn-val-${t.key}">--</div>
        <div class="gauge-lbl">${t.label} ${t.unidad ? '(' + t.unidad + ')' : ''}</div>
      </div>
    `).join("");
  } else {
    containerGauges.innerHTML = `
      <div class="gauge-cell"><div class="gauge-val" id="dyn-val-temp_camara">--°C</div><div class="gauge-lbl">TEMP. CÁMARA</div></div>
      <div class="gauge-cell"><div class="gauge-val p" id="dyn-val-presion">--b</div><div class="gauge-lbl">PRESIÓN</div></div>
      <div class="gauge-cell"><div class="gauge-val" style="color:var(--green);" id="dyn-val-fase">--</div><div class="gauge-lbl">FASE</div></div>
      <div class="gauge-cell"><div class="gauge-val" style="color:var(--amber);" id="dyn-val-seg_restantes">--:--</div><div class="gauge-lbl">TIEMPO</div></div>
    `;
  }

  const containerMenus = document.getElementById("containerDynamicMenus");
  const menus = item.esquema?.menus;
  const currentCfg = item.datos?.cfg || {};

  if (menus && menus.length) {
    containerMenus.innerHTML = menus.map(cat => `
      <div class="category-box">
        <div class="category-title">${cat.categoria.toUpperCase()}</div>
        ${cat.campos.map(campo => {
          const valorActual = (currentCfg[campo.key] !== undefined) ? currentCfg[campo.key] : campo.val;
          if (campo.tipo === 'switch' || typeof valorActual === 'boolean') {
            return `
              <div class="dynamic-field-row">
                <span style="font-weight:600;">${campo.label}</span>
                <input type="checkbox" class="dyn-input-field" data-key="${campo.key}" ${valorActual ? 'checked' : ''} onchange="cambiarSwitchOptimista('${mac}', '${campo.key}', this.checked)">
              </div>
            `;
          } else {
            return `
              <div class="dynamic-field-row">
                <span>${campo.label}</span>
                <input type="number" step="${campo.step || 0.1}" min="${campo.min || 0}" max="${campo.max || 999}" class="input-field dyn-input-field" data-key="${campo.key}" value="${valorActual}" onkeydown="if(event.key==='Enter'){event.preventDefault(); guardarParametrosDinamicos();}">
              </div>
            `;
          }
        }).join("")}
      </div>
    `).join("");
  } else {
    containerMenus.innerHTML = `<div class="empty-state">Esperando esquema del equipo...</div>`;
  }
}

window.cambiarSwitchOptimista = function(mac, key, isChecked) {
  if (usuarioActual && usuarioActual.rol === "OPERADOR") return notify("Permiso denegado: rol OPERADOR", "var(--red)");
  if (!fleet[mac]) return;

  if (!fleet[mac].datos.cfg) fleet[mac].datos.cfg = {};
  fleet[mac].datos.cfg[key] = isChecked;

  fleet[mac]._pendingLock = fleet[mac]._pendingLock || {};
  fleet[mac]._pendingLock[key] = Date.now() + 3500;

  const payload = {};
  payload[key] = isChecked;
  mqttClient.publish(`autoclave_med_2026/${mac}/config`, JSON.stringify(payload));
  
  registrarEventoEnSesion(mac, "CONFIG", `Switch [${key}] cambiado a: ${isChecked ? 'ON' : 'OFF'}`);
  notify(`⚡ ${key.toUpperCase()}: ${isChecked ? 'ACTIVADO' : 'DESACTIVADO'}`, isChecked ? "var(--green)" : "var(--amber)");
};

function actualizarPantallaDetalleDinamica() {
  if (!currentInspectedMAC || !fleet[currentInspectedMAC]) return;
  const item = fleet[currentInspectedMAC];
  const d = item.datos || {};
  const online = isOnline(item);

  const ob = document.getElementById("detOnlineBadge");
  ob.innerHTML = `<span class="dot ${online ? 'online' : 'offline'}"></span> ${online ? 'ONLINE' : 'OFFLINE'}`;

  Object.keys(d).forEach(k => {
    const el = document.getElementById(`dyn-val-${k}`);
    if (el) {
      if (k === 'temp_camara') el.innerText = (d[k] || 0).toFixed(1) + "°C";
      else if (k === 'presion') el.innerText = (d[k] || 0).toFixed(2) + "b";
      else if (k === 'seg_restantes') {
        const m = Math.floor(d[k] / 60);
        const s = d[k] % 60;
        el.innerText = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
      } else if (typeof d[k] === 'boolean') {
        el.innerText = d[k] ? "ACTIVO" : "INACTIVO";
        el.style.color = d[k] ? "var(--green)" : "var(--text-muted)";
      } else {
        el.innerText = d[k];
      }
    }
  });

  if (d.alarma_cod && d.alarma_cod > 0) {
    document.getElementById("detAlarmaBanner").style.display = "block";
    document.getElementById("detAlarmaTexto").innerText = d.alarma_msg || "Alarma activa";
  } else {
    document.getElementById("detAlarmaBanner").style.display = "none";
  }
}

window.guardarParametrosDinamicos = function() {
  if (!currentInspectedMAC) return;
  if (usuarioActual && usuarioActual.rol === "OPERADOR") return notify("Permiso denegado", "var(--red)");

  const payload = {};
  document.querySelectorAll(".dyn-input-field").forEach(input => {
    const key = input.getAttribute("data-key");
    if (input.type === 'checkbox') {
      payload[key] = input.checked;
      fleet[currentInspectedMAC].datos.cfg = fleet[currentInspectedMAC].datos.cfg || {};
      fleet[currentInspectedMAC].datos.cfg[key] = input.checked;
      fleet[currentInspectedMAC]._pendingLock[key] = Date.now() + 3500;
    } else if (input.type === 'number') {
      payload[key] = parseFloat(input.value);
    } else {
      payload[key] = input.value;
    }
  });

  mqttClient.publish(`autoclave_med_2026/${currentInspectedMAC}/config`, JSON.stringify(payload));
  registrarEventoEnSesion(currentInspectedMAC, "CONFIG", "Parámetros NVS actualizados");
  notify("⚡ Parámetros enviados al ESP32", "var(--green)");
};

window.enviarComandoDetalle = function(cmd) {
  if (!currentInspectedMAC) return;
  mqttClient.publish(`autoclave_med_2026/${currentInspectedMAC}/config`, JSON.stringify({ cmd }));
  registrarEventoEnSesion(currentInspectedMAC, "COMANDO", `Comando ejecutado: ${cmd}`);
  notify(`Comando enviado: ${cmd}`, "var(--cyan)");
};

window.guardarFichaDetalle = function() {
  const alias = document.getElementById("fichaAlias").value.trim();
  const cliente = document.getElementById("fichaCliente").value.trim();
  const modelo = document.getElementById("fichaModelo").value.trim();

  const tx = db.transaction(["asignaciones"], "readwrite");
  tx.objectStore("asignaciones").put({ mac: currentInspectedMAC, alias, cliente, modelo, fecha: new Date().toISOString() });
  tx.oncomplete = () => {
    fleet[currentInspectedMAC].meta.alias = alias;
    fleet[currentInspectedMAC].meta.cliente = cliente;
    fleet[currentInspectedMAC].meta.modelo = modelo;
    document.getElementById("detDeviceAlias").innerText = alias.toUpperCase();
    document.getElementById("detDeviceSub").innerText = `MAC: ${currentInspectedMAC} | CLIENTE: ${cliente} | MODELO: ${modelo}`;
    actualizarCardDashboard(currentInspectedMAC);
    notify("Ficha actualizada", "var(--green)");
  };
};

function cargarLogsDetalle(mac) {
  const tbody = document.getElementById("detLogsTbody");
  const tx = db.transaction(["reportes_sesiones"], "readonly");
  tx.objectStore("reportes_sesiones").getAll().onsuccess = (e) => {
    const logs = e.target.result.filter(x => x.mac === mac).reverse();
    if (!logs.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Sin sesiones registradas para este equipo.</td></tr>`;
      return;
    }
    tbody.innerHTML = logs.map(s => {
      const ciclos = s.ciclosAcumulados || 0;
      const limite = s.limiteMantenimiento || 200;
      return `
        <tr>
          <td style="color:var(--cyan); font-weight:700;">${new Date(s.fecha).toLocaleDateString()} ${s.horaEncendido}</td>
          <td><span class="role-badge ${s.conteoAlarmas > 0 ? 'role-super' : 'role-oper'}">${s.faseFinal}</span></td>
          <td>${ciclos} / ${limite}</td>
          <td><span style="color:${ciclos >= limite ? 'var(--red)' : 'var(--green)'}">${ciclos >= limite ? 'VENCIDO' : 'OK'}</span></td>
          <td>T:${s.tempMax.toFixed(1)}°C | P:${s.presMax.toFixed(2)}b</td>
          <td><button class="btn btn-compact" onclick="verPaqueteSesion('${s.sessionId}')">👁️ VER</button></td>
        </tr>
      `;
    }).join("");
  };
}

// =========================================================================
// 7. CENTRO DE REPORTES AVANZADO: BÚSQUEDA, FILTROS Y BORRADO EN LOTE
// =========================================================================
let reportesCache = [];

function renderizarRegistros() {
  if (!db) return;
  const devFilter = document.getElementById("filterDeviceSelect").value;
  const fType = document.getElementById("filterType").value;
  const fDesde = document.getElementById("filterFechaDesde").value;
  const fHasta = document.getElementById("filterFechaHasta").value;
  const fText = document.getElementById("filterInput").value.toUpperCase();
  const tbody = document.getElementById("auditTableBody");

  const tx = db.transaction(["reportes_sesiones"], "readonly");
  tx.objectStore("reportes_sesiones").getAll().onsuccess = (e) => {
    let items = e.target.result.reverse();
    reportesCache = items;

    document.getElementById("kpiTotalSesiones").innerText = items.length;
    const totalCiclos = items.reduce((acc, cur) => acc + (cur.ciclosAcumulados || 0), 0);
    document.getElementById("kpiTotalCiclos").innerText = totalCiclos;
    const mantAlerts = items.filter(x => (x.ciclosAcumulados || 0) >= (x.limiteMantenimiento || 200) * 0.8).length;
    document.getElementById("kpiMantenimientoAlerta").innerText = mantAlerts;
    const totalAlarmas = items.filter(x => x.conteoAlarmas > 0).length;
    document.getElementById("kpiTotalAlarmas").innerText = totalAlarmas;

    if (devFilter !== "TODOS") items = items.filter(x => x.mac === devFilter);
    
    if (fType === "CICLO_OK") items = items.filter(x => x.faseFinal === "FINALIZADO CON EXITO");
    if (fType === "ALARMA") items = items.filter(x => x.conteoAlarmas > 0);
    if (fType === "MANT_WARN") items = items.filter(x => (x.ciclosAcumulados || 0) >= (x.limiteMantenimiento || 200) * 0.8);
    if (fType === "OFFLINE_SYNC") items = items.filter(x => x.esOffline === true);

    if (fDesde) items = items.filter(x => new Date(x.fecha) >= new Date(fDesde));
    if (fHasta) items = items.filter(x => new Date(x.fecha) <= new Date(fHasta + "T23:59:59"));

    if (fText) {
      items = items.filter(x => 
        x.mac.toUpperCase().includes(fText) || 
        x.alias.toUpperCase().includes(fText) || 
        x.cliente.toUpperCase().includes(fText) ||
        x.modelo.toUpperCase().includes(fText)
      );
    }

    if (!items.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:30px;">No se encontraron reportes coincidentes.</td></tr>`;
      return;
    }

    tbody.innerHTML = items.map(s => {
      const ciclos = s.ciclosAcumulados || 0;
      const limite = s.limiteMantenimiento || 200;
      const pct = Math.min(100, Math.round((ciclos / limite) * 100));

      return `
        <tr>
          <td style="text-align:center;"><input type="checkbox" class="check-report-item" value="${s.id}" style="width:18px; height:18px; accent-color:var(--cyan);"></td>
          <td>
            <div style="color:var(--cyan); font-weight:700;">${new Date(s.fecha).toLocaleDateString()}</div>
            <div style="font-size:0.65rem; color:var(--text-muted);">${s.sessionId || s.id}</div>
          </td>
          <td>
            <div style="font-weight:700;">${s.alias}</div>
            <div style="font-size:0.65rem; color:var(--purple);">MAC: ${s.mac} | ${s.modelo}</div>
          </td>
          <td>
            <div>ON: ${s.horaEncendido}</div>
            <div style="color:var(--text-muted);">OFF: ${s.horaApagado}</div>
          </td>
          <td>
            <div>${ciclos} de ${limite} ciclos (${pct}%)</div>
            <div class="health-bar"><div class="health-fill ${pct>=100?'danger':pct>=80?'warn':''}" style="width:${pct}%;"></div></div>
          </td>
          <td>T:${(s.tempMax||0).toFixed(1)}°C<br>P:${(s.presMax||0).toFixed(2)}b</td>
          <td>
            <span class="role-badge ${s.conteoAlarmas > 0 ? 'role-super' : 'role-oper'}">${s.faseFinal}</span>
            ${s.esOffline ? '<span class="role-badge role-tech" style="margin-left:4px;">OFFLINE</span>' : ''}
          </td>
          <td>
            <div style="display:flex; gap:4px;">
              <button class="btn btn-compact" onclick="verPaqueteSesion('${s.sessionId}')">👁️ VER</button>
              <button class="btn btn-danger btn-compact" style="padding:2px 6px;" onclick="eliminarReporteIndividual(${s.id})">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  };
}

window.verPaqueteSesion = function(sessionId) {
  const ses = reportesCache.find(x => x.sessionId === sessionId);
  if (!ses) return notify("Sesión no encontrada", "var(--red)");

  currentViewingReport = ses;
  document.getElementById("repPkgTitle").innerText = `SESIÓN: ${ses.alias.toUpperCase()}`;
  document.getElementById("repPkgSub").innerText = `MAC: ${ses.mac} | CLIENTE: ${ses.cliente} | MODELO: ${ses.modelo}`;
  
  document.getElementById("repEncendidoVal").innerText = `${new Date(ses.fecha).toLocaleDateString()} ${ses.horaEncendido}`;
  document.getElementById("repApagadoVal").innerText = ses.horaApagado;
  document.getElementById("repUptimeVal").innerText = `${ses.eventos.length} eventos registrados`;
  
  const ciclos = ses.ciclosAcumulados || 0;
  const limite = ses.limiteMantenimiento || 200;
  const pct = Math.min(100, Math.round((ciclos / limite) * 100));
  document.getElementById("repCiclosVal").innerText = `${ciclos} de ${limite} (${limite - ciclos} restantes)`;
  document.getElementById("repMantText").innerText = pct >= 100 ? 'MANTENIMIENTO VENCIDO' : pct >= 80 ? 'MANTENIMIENTO PRÓXIMO' : 'SALUD ÓPTIMA';
  document.getElementById("repMantText").style.color = pct >= 100 ? 'var(--red)' : pct >= 80 ? 'var(--amber)' : 'var(--green)';
  document.getElementById("repMantBar").style.width = `${pct}%`;
  document.getElementById("repMantBar").className = `health-fill ${pct>=100?'danger':pct>=80?'warn':''}`;

  const timelineBox = document.getElementById("repTimelineContainer");
  timelineBox.innerHTML = (ses.eventos || []).map(ev => `
    <div class="timeline-item">
      <div style="font-size:0.75rem; color:var(--cyan); font-weight:700;">${ev.hora} - <span class="role-badge ${ev.tipo==='ALARMA'?'role-super':ev.tipo==='CICLO_OK'?'role-oper':'role-tech'}">${ev.tipo}</span></div>
      <div style="font-size:0.8rem; margin-top:2px;">${ev.msg}</div>
      ${ev.temp ? `<div style="font-size:0.68rem; color:var(--text-muted); margin-top:2px;">Lectura: T:${ev.temp}°C | P:${ev.presion} Bar</div>` : ''}
    </div>
  `).join("");

  openActivity('act-report-view');
};

window.imprimirCertificadoSesionActual = function() {
  if (!currentViewingReport) return;
  const s = currentViewingReport;
  const v = window.open("", "_blank");
  v.document.write(`
    <html><head><title>CERTIFICADO CLÍNICO - ${s.alias}</title>
    <style>body{font-family:'Courier New',monospace;padding:35px;color:#111;}table{width:100%;border-collapse:collapse;margin:20px 0;}td,th{border:1px solid #333;padding:8px;}</style>
    </head><body>
    <h2>CERTIFICADO CLÍNICO OFICIAL DE ESTERILIZACIÓN</h2>
    <p>HOSPITAL / CLIENTE: <b>${s.cliente.toUpperCase()}</b></p>
    <p>AUTOCLAVE: <b>${s.alias}</b> (MAC: ${s.mac}) | MODELO: ${s.modelo}</p>
    <p>FECHA / SESIÓN: ${new Date(s.fecha).toLocaleDateString()} | Encendido: ${s.horaEncendido} - Cierre: ${s.horaApagado}</p>
    <table>
      <tr><th>PARÁMETRO</th><th>VALOR REGISTRADO</th></tr>
      <tr><td>Temperatura Máxima Registrada</td><td>${s.tempMax.toFixed(1)} °C</td></tr>
      <tr><td>Presión Máxima Alcanzada</td><td>${s.presMax.toFixed(2)} Bar</td></tr>
      <tr><td>Ciclos Acumulados del Equipo</td><td>${s.ciclosAcumulados} / ${s.limiteMantenimiento}</td></tr>
      <tr><td>Diagnóstico de Validación</td><td><b>${s.faseFinal}</b></td></tr>
    </table>
    <h3>REGISTRO CRONOLÓGICO:</h3>
    <ul>${(s.eventos||[]).map(e => `<li><b>${e.hora} [${e.tipo}]:</b> ${e.msg}</li>`).join("")}</ul>
    <br><br><p>Firma y Sello Responsable Biomédico: ___________________________</p>
    <script>window.print();<\/script></body></html>
  `);
  v.document.close();
};

window.toggleSelectAllReports = function(isChecked) {
  document.querySelectorAll(".check-report-item").forEach(c => c.checked = isChecked);
};

window.eliminarReporteIndividual = function(id) {
  if (usuarioActual && usuarioActual.rol === "OPERADOR") return notify("Permiso denegado.", "var(--red)");
  const tx = db.transaction(["reportes_sesiones"], "readwrite");
  tx.objectStore("reportes_sesiones").delete(id);
  tx.oncomplete = () => {
    renderizarRegistros();
    notify("Reporte eliminado", "var(--amber)");
  };
};

window.eliminarReportesSeleccionados = function() {
  if (usuarioActual && usuarioActual.rol === "OPERADOR") return notify("Permiso denegado.", "var(--red)");
  const seleccionados = Array.from(document.querySelectorAll(".check-report-item:checked")).map(c => parseInt(c.value));
  if (!seleccionados.length) return notify("Marca al menos un reporte", "var(--amber)");

  const tx = db.transaction(["reportes_sesiones"], "readwrite");
  const store = tx.objectStore("reportes_sesiones");
  seleccionados.forEach(id => store.delete(id));
  tx.oncomplete = () => {
    renderizarRegistros();
    notify(`🗑️ ${seleccionados.length} reportes eliminados con éxito`, "var(--amber)");
  };
};

window.confirmarVaciarDB = function() {
  if (usuarioActual && usuarioActual.rol !== "SUPERADMIN") return notify("Permiso denegado: solo SuperAdmin", "var(--red)");
  const tx = db.transaction(["reportes_sesiones"], "readwrite");
  tx.objectStore("reportes_sesiones").clear();
  tx.oncomplete = () => {
    renderizarRegistros();
    notify("Toda la auditoría fue vaciada", "var(--red)");
  };
};

window.exportarRegistrosCSV = function() {
  const tx = db.transaction(["reportes_sesiones"], "readonly");
  tx.objectStore("reportes_sesiones").getAll().onsuccess = (e) => {
    let data = e.target.result || [];
    if (!data.length) return notify("Sin datos para exportar", "var(--amber)");
    let csv = "ID_SESION,FECHA,MAC,ALIAS,CLIENTE,MODELO,HORA_ON,HORA_OFF,CICLOS,LIMITE_MANT,T_MAX,P_MAX,ESTADO\n";
    data.forEach(d => {
      csv += `"${d.sessionId}","${d.fecha}","${d.mac}","${d.alias}","${d.cliente}","${d.modelo}","${d.horaEncendido}","${d.horaApagado}","${d.ciclosAcumulados}","${d.limiteMantenimiento}","${d.tempMax}","${d.presMax}","${d.faseFinal}"\n`;
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `reporte_sesiones_autoclave_${Date.now()}.csv`;
    a.click();
    notify("Archivo CSV descargado", "var(--green)");
  };
};

// =========================================================================
// 8. FOTA HUB, GESTIÓN FLOTA Y USUARIOS
// =========================================================================
let currentFotaFilter = 'ALL';
window.filterFotaList = function(tipo) { currentFotaFilter = tipo; renderFotaLiveList(); };

function renderFotaLiveList() {
  const box = document.getElementById("fotaDevicesLiveList");
  let macs = Object.keys(fleet);
  if (currentFotaFilter === 'ONLINE') macs = macs.filter(m => isOnline(fleet[m]));
  if (currentFotaFilter === 'OFFLINE') macs = macs.filter(m => !isOnline(fleet[m]));

  if (!macs.length) {
    box.innerHTML = `<div class="empty-state">No hay autoclaves para este filtro.</div>`;
    return;
  }
  box.innerHTML = macs.map(mac => {
    const item = fleet[mac];
    const meta = item.meta || { alias: mac, modelo: "Autoclave" };
    const online = isOnline(item);
    return `
      <label class="fota-item">
        <input type="checkbox" class="fota-target-check fota-checkbox" value="${mac}" ${online ? 'checked' : ''}>
        <div class="flex-1">
          <div class="fota-item-title">${meta.alias}</div>
          <div class="fota-item-sub">${meta.cliente} | ${meta.modelo}</div>
        </div>
        <span class="status-badge"><span class="dot ${online ? 'online' : 'offline'}"></span> ${online ? 'ONLINE' : 'OFFLINE'}</span>
      </label>
    `;
  }).join("");
}

window.toggleSelectAllFota = function() {
  const checks = document.querySelectorAll(".fota-target-check");
  const anyUnchecked = Array.from(checks).some(c => !c.checked);
  checks.forEach(c => c.checked = anyUnchecked);
};

window.ejecutarFotaSeleccionados = function() {
  if (usuarioActual && usuarioActual.rol === "OPERADOR") return notify("Permiso denegado", "var(--red)");
  const seleccionados = Array.from(document.querySelectorAll(".fota-target-check:checked")).map(c => c.value);
  if (!seleccionados.length) return notify("Selecciona al menos un equipo", "var(--amber)");

  const version = document.getElementById("fotaVersionInput").value;
  const url = document.getElementById("fotaUrlInput").value;

  seleccionados.forEach(mac => {
    mqttClient.publish(`autoclave_med_2026/${mac}/config`, JSON.stringify({ cmd: "TRIGGER_FOTA", url, modelo: "UNIVERSAL" }));
  });
  notify(`🚀 FOTA transmitido a ${seleccionados.length} equipos`, "var(--green)");
};

window.handleFileSelected = function(files) {
  if (!files.length) return;
  document.getElementById("dropFileName").innerText = `Binario: ${files[0].name} (${(files[0].size/1024).toFixed(1)} KB)`;
  document.getElementById("dropFileName").style.color = "var(--green)";
  notify("Archivo binario cargado", "var(--cyan)");
};

let macSeleccionadaGestion = null;
window.seleccionarEquipoEnGestion = function(mac) {
  macSeleccionadaGestion = mac;
  inicializarDispositivoSiNoExiste(mac);
  const item = fleet[mac];
  const meta = item.meta || { alias: mac, cliente: "", modelo: "" };

  document.getElementById("titleFleetForm").innerText = `MODIFICAR: ${meta.alias.toUpperCase()}`;
  document.getElementById("addMac").value = mac;
  document.getElementById("addAlias").value = meta.alias;
  document.getElementById("addCliente").value = meta.cliente;
  document.getElementById("addModelo").value = meta.modelo;
  document.getElementById("btnSubmitFleet").innerText = "💾 ACTUALIZAR DATOS [ENTER]";
  document.getElementById("quickDeviceActions").style.display = "block";
  notify(`Seleccionado: ${meta.alias}`, "var(--cyan)");
};

window.guardarEquipoDesdeGestion = function() {
  const mac = document.getElementById("addMac").value.trim().toUpperCase().replace(/[:\-]/g, '');
  const alias = document.getElementById("addAlias").value.trim();
  const cliente = document.getElementById("addCliente").value.trim();
  const modelo = document.getElementById("addModelo").value.trim();

  if (mac.length < 6) return notify("MAC inválida", "var(--red)");

  const tx = db.transaction(["asignaciones"], "readwrite");
  tx.objectStore("asignaciones").put({ mac, alias, cliente, modelo, fecha: new Date().toISOString() });
  tx.oncomplete = () => {
    inicializarDispositivoSiNoExiste(mac);
    fleet[mac].meta = { alias, cliente, modelo, ciclosCompletados: fleet[mac].meta.ciclosCompletados || 0, limiteMantenimiento: fleet[mac].meta.limiteMantenimiento || 200 };
    actualizarSelectoresGlobales();
    renderFleetDashboard();
    renderFleetMgmtTable();
    notify("¡Equipo actualizado!", "var(--green)");
  };
};

window.testToggleMotor = function() {
  if (!macSeleccionadaGestion) return notify("Selecciona un equipo primero", "var(--amber)");
  const current = fleet[macSeleccionadaGestion]?.datos?.motor || false;
  mqttClient.publish(`autoclave_med_2026/${macSeleccionadaGestion}/config`, JSON.stringify({ mot_ok: !current }));
  notify(`💡 Motor/LED: ${!current ? 'ON' : 'OFF'}`, "var(--green)");
};

window.testResetAlarma = function() {
  if (!macSeleccionadaGestion) return notify("Selecciona un equipo primero", "var(--amber)");
  mqttClient.publish(`autoclave_med_2026/${macSeleccionadaGestion}/config`, JSON.stringify({ cmd: "RESET_ALARMA" }));
  notify("🔄 Reset de alarma enviado", "var(--cyan)");
};

function renderFleetMgmtTable() {
  const tbody = document.getElementById("fleetMgmtTbody");
  const keys = Object.keys(fleet);
  if (!keys.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Sin dispositivos registrados.</td></tr>`;
    return;
  }
  tbody.innerHTML = keys.map(mac => {
    const item = fleet[mac];
    const meta = item.meta || { alias: "Sin Alias", cliente: "Sin Asignar", modelo: "Genérico" };
    const online = isOnline(item);
    const esSeleccionado = macSeleccionadaGestion === mac;
    return `
      <tr style="cursor:pointer; background: ${esSeleccionado ? 'rgba(0,243,255,0.1)' : 'transparent'};" onclick="seleccionarEquipoEnGestion('${mac}')">
        <td style="color:var(--cyan); font-weight:700;">${mac}</td>
        <td><span class="status-badge"><span class="dot ${online ? 'online' : 'offline'}"></span> ${online ? 'ONLINE' : 'OFFLINE'}</span></td>
        <td style="font-weight:700;">${meta.alias}</td>
        <td>${meta.cliente}</td>
        <td style="color:var(--purple);">${meta.modelo}</td>
        <td>
          <button class="btn btn-compact" style="min-height:30px; padding:3px 8px; font-size:0.65rem;" onclick="event.stopPropagation(); abrirDetalleEquipo('${mac}')">⚙️ NVS</button>
          <button class="btn btn-danger btn-compact" style="min-height:30px; padding:3px 8px; font-size:0.65rem; margin-left:4px;" onclick="event.stopPropagation(); eliminarEquipoTotal('${mac}')">🗑️</button>
        </td>
      </tr>
    `;
  }).join("");
}

function actualizarSelectoresGlobales() {
  const sel = document.getElementById("filterDeviceSelect");
  const prev = sel.value;
  sel.innerHTML = `<option value="TODOS">TODOS LOS EQUIPOS</option>`;
  Object.keys(fleet).forEach(m => {
    const meta = fleet[m].meta || { alias: m };
    sel.innerHTML += `<option value="${m}">${meta.alias} (${m})</option>`;
  });
  sel.value = prev;
}

// GESTIÓN DE USUARIOS
function cargarUsuariosUI() {
  const tx = db.transaction(["usuarios"], "readonly");
  tx.objectStore("usuarios").getAll().onsuccess = (e) => {
    const users = e.target.result || [];
    document.getElementById("tablaUsuariosBody").innerHTML = users.map(u => `
      <tr>
        <td style="font-weight:700; color:var(--cyan);">${u.user}</td>
        <td><span class="role-badge ${u.rol === 'SUPERADMIN' ? 'role-super' : u.rol === 'TECNICO' ? 'role-tech' : 'role-oper'}">${u.rol}</span></td>
        <td>${new Date(u.fecha).toLocaleDateString()}</td>
        <td>${u.user !== 'admin' ? `<button class="btn btn-danger btn-compact" style="min-height:28px; padding:2px 8px; font-size:0.65rem;" onclick="eliminarUsuario('${u.user}')">X</button>` : '--'}</td>
      </tr>
    `).join("");
  };
}

window.crearUsuario = function() {
  if (usuarioActual && usuarioActual.rol !== "SUPERADMIN") return notify("Permiso denegado.", "var(--red)");
  const user = document.getElementById("uUser").value.trim();
  const pass = document.getElementById("uPass").value.trim();
  const rol = document.getElementById("uRol").value;
  if (!user || pass.length < 4) return notify("Mínimo 4 caracteres", "var(--red)");

  localStorage.setItem("scada_pass_" + user, pass);
  const tx = db.transaction(["usuarios"], "readwrite");
  tx.objectStore("usuarios").add({ user, pass, rol, email: "yuniolgonzalez9@gmail.com", otp: null, otpExpires: 0, otpUsado: false, fecha: new Date().toISOString() });
  tx.oncomplete = () => {
    document.getElementById("uUser").value = "";
    document.getElementById("uPass").value = "";
    cargarUsuariosUI();
    cargarListaUsuariosLogin();
    notify("Usuario creado", "var(--green)");
  };
  tx.onerror = () => notify("El usuario ya existe", "var(--red)");
};

window.eliminarUsuario = function(u) {
  localStorage.removeItem("scada_pass_" + u);
  const tx = db.transaction(["usuarios"], "readwrite");
  tx.objectStore("usuarios").delete(u);
  tx.oncomplete = () => { cargarUsuariosUI(); cargarListaUsuariosLogin(); notify("Usuario eliminado", "var(--amber)"); };
};

// AUTENTICACIÓN
function cargarListaUsuariosLogin() {
  if (!db) return;
  const tx = db.transaction(["usuarios"], "readonly");
  tx.objectStore("usuarios").getAll().onsuccess = (e) => {
    const users = e.target.result || [];
    const sel = document.getElementById("loginUserSelect");
    sel.innerHTML = `<option value="">-- Seleccionar usuario --</option>`;
    users.forEach(u => sel.innerHTML += `<option value="${u.user}">${u.user.toUpperCase()} (${u.rol})</option>`);
  };
}

window.seleccionarUsuarioRegistrado = function(val) {
  if (val) {
    document.getElementById("loginUserInput").value = val;
    document.getElementById("loginPassInput").focus();
  }
};

window.procesarInicioSesion = function() {
  const u = document.getElementById("loginUserInput").value.trim();
  const p = document.getElementById("loginPassInput").value.trim();
  const fb = document.getElementById("loginFeedback");

  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(()=>{});
    }
  } catch(e) {}

  if (!u || !p) return mostrarFeedback(fb, "Completa usuario y contraseña.", "var(--red)");

  const tx = db.transaction(["usuarios"], "readwrite");
  tx.objectStore("usuarios").get(u).onsuccess = (e) => {
    const user = e.target.result;
    if (!user) return mostrarFeedback(fb, "El usuario no existe.", "var(--red)");

    if (user.otp && p === user.otp) {
      if (user.otpUsado) return mostrarFeedback(fb, "Código temporal ya utilizado.", "var(--red)");
      if (Date.now() > user.otpExpires) return mostrarFeedback(fb, "Código temporal expirado.", "var(--red)");
      user.otpUsado = true;
      user.otp = null;
      tx.objectStore("usuarios").put(user);
      usuarioActual = user;
      openActivity('act-change-pass');
      return;
    }

    const passAlmacenada = localStorage.getItem("scada_pass_" + user.user) || user.pass;
    if (passAlmacenada === p) {
      iniciarSesionExitosa(user);
    } else {
      mostrarFeedback(fb, "Contraseña incorrecta.", "var(--red)");
    }
  };
};

function iniciarSesionExitosa(user, esRestauracion = false) {
  usuarioActual = user;
  localStorage.setItem("scada_logged_user", JSON.stringify(user));
  document.getElementById("currentUserName").innerText = user.user.toUpperCase();
  const b = document.getElementById("currentUserRoleBadge");
  b.innerText = user.rol;
  b.className = "role-badge " + (user.rol === "SUPERADMIN" ? "role-super" : user.rol === "TECNICO" ? "role-tech" : "role-oper");
  aplicarPermisosRol();

  if (!esRestauracion) {
    activityStack = ['act-telemetry'];
    history.replaceState({ activity: 'act-telemetry' }, '', window.location.pathname + '#telemetria');
    renderActivity('act-telemetry');
    guardarEstadoRuta();
  }
  notify(`Bienvenido, ${user.user.toUpperCase()}`, "var(--green)");
}

function mostrarFeedback(el, msg, color) {
  el.style.display = "block";
  el.style.color = color;
  el.style.border = `1px solid ${color}`;
  el.style.background = "rgba(0,0,0,0.5)";
  el.innerText = msg;
}

window.abrirRecuperacion = function() {
  document.getElementById("recovUser").value = document.getElementById("loginUserInput").value;
  document.getElementById("recovFeedback").style.display = "none";
  openActivity('act-recovery');
};

window.solicitarCodigoRecuperacion = function() {
  const u = document.getElementById("recovUser").value.trim();
  const fb = document.getElementById("recovFeedback");
  const btn = document.getElementById("btnSendRecovery");
  if (!u) return mostrarFeedback(fb, "Ingresa el usuario.", "var(--red)");

  const tx = db.transaction(["usuarios"], "readwrite");
  tx.objectStore("usuarios").get(u).onsuccess = (e) => {
    const user = e.target.result;
    if (!user) return mostrarFeedback(fb, "El usuario no existe.", "var(--red)");

    const otpCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    user.otp = otpCode;
    user.otpExpires = Date.now() + (15 * 60 * 1000);
    user.otpUsado = false;
    tx.objectStore("usuarios").put(user);

    btn.disabled = true;
    btn.innerText = "⏳ ENVIANDO...";

    fetch("https://formsubmit.co/ajax/yuniolgonzalez9@gmail.com", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ _subject: "🔐 CLAVE TEMPORAL SCADA", Usuario: user.user, Codigo_Temporal: otpCode, Validez: "15 Minutos" })
    })
    .then(() => {
      btn.disabled = false;
      btn.innerText = "📩 ENVIAR CÓDIGO [ENTER]";
      mostrarFeedback(fb, `¡Código enviado a yuniolgonzalez9@gmail.com! Clave: [ ${otpCode} ]`, "var(--green)");
    })
    .catch(() => {
      btn.disabled = false;
      btn.innerText = "📩 ENVIAR CÓDIGO [ENTER]";
      mostrarFeedback(fb, `Código generado: [ ${otpCode} ]. Úsalo en el login.`, "var(--cyan)");
    });
  };
};

window.guardarNuevaContrasena = function() {
  const p1 = document.getElementById("newPassInput").value.trim();
  const p2 = document.getElementById("confirmPassInput").value.trim();
  if (!usuarioActual || !usuarioActual.user) return notify("Sesión no válida", "var(--red)");
  if (p1.length < 4) return notify("Mínimo 4 caracteres", "var(--red)");
  if (p1 !== p2) return notify("Las contraseñas no coinciden", "var(--red)");

  localStorage.setItem("scada_pass_" + usuarioActual.user, p1);
  const tx = db.transaction(["usuarios"], "readwrite");
  tx.objectStore("usuarios").get(usuarioActual.user).onsuccess = (e) => {
    const user = e.target.result;
    user.pass = p1;
    user.otp = null;
    user.otpUsado = false;
    tx.objectStore("usuarios").put(user);
    tx.oncomplete = () => {
      usuarioActual.pass = p1;
      localStorage.setItem("scada_logged_user", JSON.stringify(usuarioActual));
      iniciarSesionExitosa(user);
      notify("¡Contraseña actualizada con éxito!", "var(--green)");
    };
  };
};

function aplicarPermisosRol() {
  const esAdmin = usuarioActual && usuarioActual.rol === "SUPERADMIN";
  const esTech = usuarioActual && (usuarioActual.rol === "TECNICO" || esAdmin);
  document.getElementById("tabNavUsers").style.display = esAdmin ? "block" : "none";
  document.getElementById("btnVaciarLogs").style.display = esAdmin ? "inline-flex" : "none";
  document.getElementById("btnExecuteFota").disabled = !esTech;
  document.getElementById("btnExecuteFota").style.opacity = esTech ? "1" : "0.4";
  const bg = document.getElementById("btnGuardarDinamico");
  if (bg) { bg.disabled = !esTech; bg.style.opacity = esTech ? "1" : "0.4"; }
}

setInterval(() => {
  renderFleetDashboard();
  if (activityStack[activityStack.length - 1] === 'act-fota') renderFotaLiveList();
}, 1500);

window.addEventListener("load", () => {
  initDB();
  initMQTT();
});
