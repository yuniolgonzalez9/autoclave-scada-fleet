// =========================================================================
// 1. SUPABASE CLOUD & SINCRONIZACIÓN EN TIEMPO REAL
// =========================================================================
const SUPABASE_URL = "https://gjtqyodpgwfvfvkhlhik.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqdHF5b2RwZ3dmdmZ2a2hsaGlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNDAzNTYsImV4cCI6MjEwNTYxNjM1Nn0.g8t_PbEityaneKkOUHttQ_cZv50aczLU4Z9la8R4d_g";

const sbClient = (window.supabase && window.supabase.createClient) 
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) 
  : null;

// =========================================================================
// 2. ESTADO GLOBAL, PILA DE NAVEGACIÓN Y VARIABLES
// =========================================================================
let activityStack = ['act-login'];
let currentTopLevel = 'act-telemetry';
let currentActivity = 'act-login';
let currentInspectedMAC = null;
let currentDetailSubTab = 'tab-det-tele';
let currentViewingReport = null;
let currentHealthFilter = 'ONLINE';
let usuarioActual = null;
let ultimoToqueAtras = 0;
let realChartInstance = null;
let audioCtx = null;
let modalConfirmCallback = null;

function estaAutenticado() {
  return !!usuarioActual && !!localStorage.getItem("scada_logged_user");
}

// =========================================================================
// 3. SINTETIZADOR DE AUDIO (ALARMAS MÉDICAS)
// =========================================================================
function sonarAlarmaSonora() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.35);
    
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.35);
  } catch(e) {}
}

// =========================================================================
// 4. VENTANA EMERGENTE FLOTANTE CENTRALIZADA (MODAL DE CONFIRMACIÓN)
// =========================================================================
function mostrarModalConfirmacion({ icon = '⚠️', title = 'CONFIRMAR ACCIÓN', msg = '¿Deseas continuar?', okText = 'EJECUTAR', okClass = 'btn-danger', onConfirm = null }) {
  modalConfirmCallback = onConfirm;
  const overlay = document.getElementById("modalConfirmOverlay");
  const iEl = document.getElementById("modalConfirmIcon");
  const tEl = document.getElementById("modalConfirmTitle");
  const mEl = document.getElementById("modalConfirmMsg");
  const bEl = document.getElementById("btnModalConfirmOk");

  if (iEl) iEl.innerText = icon;
  if (tEl) tEl.innerText = title;
  if (mEl) mEl.innerText = msg;
  if (bEl) {
    bEl.innerText = okText;
    bEl.className = `btn flex-1 ${okClass}`;
  }
  if (overlay) overlay.style.display = "flex";
}

window.cerrarModalConfirmacion = function(confirmado) {
  const overlay = document.getElementById("modalConfirmOverlay");
  if (overlay) overlay.style.display = "none";
  if (confirmado && typeof modalConfirmCallback === 'function') {
    modalConfirmCallback();
  }
  modalConfirmCallback = null;
};

window.pedirConfirmacionComando = function(cmd, msg, btnText) {
  if (usuarioActual && usuarioActual.rol === "OPERADOR" && cmd !== 'INICIAR_CICLO') {
    return notify("Permiso denegado para tu nivel", "var(--red)");
  }
  mostrarModalConfirmacion({
    icon: cmd === 'ABORTAR_CICLO' ? '🛑' : '⚡',
    title: cmd === 'ABORTAR_CICLO' ? 'PARO DE EMERGENCIA' : 'EJECUTAR ACCIÓN',
    msg: msg,
    okText: btnText,
    okClass: cmd === 'ABORTAR_CICLO' ? 'btn-danger' : 'btn-primary',
    onConfirm: () => enviarComandoDetalle(cmd)
  });
};

window.pedirConfirmacionFota = function() {
  if (usuarioActual && usuarioActual.rol === "OPERADOR") return notify("Permiso denegado: solo Técnicos o SuperAdmin", "var(--red)");
  mostrarModalConfirmacion({
    icon: '🚀',
    title: 'TRANSMISIÓN FOTA',
    msg: '¿Confirmas el despliegue del binario hacia los autoclaves seleccionados?',
    okText: '🚀 TRANSMITIR AHORA',
    okClass: 'btn-primary',
    onConfirm: () => ejecutarFotaSeleccionados()
  });
};

// =========================================================================
// 5. ENRUTADOR SEGURO DE ACTIVIDADES
// =========================================================================
window.openTopLevel = function(secId) {
  if (!estaAutenticado() && secId !== 'act-login' && secId !== 'act-recovery') {
    renderScreen('act-login');
    return;
  }

  // Comprobar jerarquía antes de acceder a la sección
  if (usuarioActual && usuarioActual.rol === "OPERADOR" && (secId === 'act-fota' || secId === 'act-fleet-mgmt' || secId === 'act-users')) {
    notify("Acceso restringido por jerarquía RBAC", "var(--red)");
    return;
  }
  if (usuarioActual && usuarioActual.rol === "TECNICO" && secId === 'act-users') {
    notify("Acceso exclusivo para SuperAdmin", "var(--red)");
    return;
  }

  currentTopLevel = secId;
  currentInspectedMAC = null;
  activityStack = [secId];
  history.replaceState({ type: 'top', secId: secId }, '', '#' + secId);
  renderScreen(secId);
  guardarRutaNavegacion();
};

window.openActivity = function(actId) {
  if (!estaAutenticado()) {
    renderScreen('act-login');
    return;
  }
  if (currentActivity !== actId) {
    activityStack.push(actId);
    history.pushState({ type: 'child', actId: actId, parent: currentTopLevel }, '', '#' + actId);
    renderScreen(actId);
    guardarRutaNavegacion();
  }
};

window.goBackActivity = function() {
  if (activityStack.length > 1) {
    activityStack.pop();
    const prev = activityStack[activityStack.length - 1];
    renderScreen(prev);
  } else {
    history.back();
  }
};

window.addEventListener('popstate', () => {
  if (!estaAutenticado()) {
    renderScreen('act-login');
    return;
  }

  if (currentActivity === 'act-device-detail' || currentActivity === 'act-report-view') {
    currentInspectedMAC = null;
    activityStack = [currentTopLevel];
    renderScreen(currentTopLevel);
    guardarRutaNavegacion();
    return;
  }

  const ahora = Date.now();
  if (ahora - ultimoToqueAtras > 2500) {
    ultimoToqueAtras = ahora;
    history.pushState({ type: 'top', secId: currentTopLevel }, '', '#' + currentTopLevel);
    notify("⚠️ Presiona atrás una vez más para salir del SCADA", "var(--amber)");
  }
});

function renderScreen(screenId) {
  if (!estaAutenticado() && screenId !== 'act-login' && screenId !== 'act-recovery') {
    screenId = 'act-login';
  }

  currentActivity = screenId;
  const esPublico = (screenId === 'act-login' || screenId === 'act-recovery');

  if (esPublico) {
    document.body.classList.remove('authenticated');
    document.body.classList.add('unauthenticated');
  } else {
    document.body.classList.remove('unauthenticated');
    document.body.classList.add('authenticated');
  }

  const topBar = document.getElementById('topAppBar');
  const dDock = document.getElementById('desktopDockContainer');
  const backBtn = document.getElementById('btnGlobalBack');

  if (topBar) topBar.style.display = esPublico ? 'none' : 'flex';
  if (dDock) dDock.style.display = esPublico ? 'none' : 'flex';

  const esPantallaHija = (screenId === 'act-device-detail' || screenId === 'act-report-view');
  if (backBtn) backBtn.style.display = esPantallaHija ? 'inline-flex' : 'none';

  document.querySelectorAll('.activity').forEach(a => a.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) target.classList.add('active');

  if (!esPublico && !esPantallaHija) {
    document.querySelectorAll('.nav-btn, .m-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-tab') === screenId);
    });
  }

  if (screenId === 'act-fota') renderFotaLiveList();
  if (screenId === 'act-fleet-mgmt') renderFleetMgmtTable();
  if (screenId === 'act-reports') renderizarRegistros();
  if (screenId === 'act-telemetry') renderFleetDashboard();
}

function guardarRutaNavegacion() {
  if (estaAutenticado()) {
    localStorage.setItem("scada_nav_route_v5", JSON.stringify({
      topLevel: currentTopLevel,
      activity: currentActivity,
      mac: currentInspectedMAC,
      subTab: currentDetailSubTab
    }));
  }
}

function notify(msg, color = 'var(--cyan)') {
  const t = document.getElementById("toastApp");
  if (!t) return;
  t.innerText = msg;
  t.style.borderColor = color;
  t.style.color = color;
  t.style.display = "block";
  clearTimeout(t.timer);
  t.timer = setTimeout(() => { t.style.display = "none"; }, 2500);
}

// =========================================================================
// 6. NAVEGACIÓN Y MENÚ ENGRANAJE
// =========================================================================
window.toggleHorizontalDock = function() {
  const dock = document.getElementById("desktopNavBar");
  const arrow = document.getElementById("dockArrow");
  if (dock) {
    dock.classList.toggle("collapsed");
    const estaPlegado = dock.classList.contains("collapsed");
    if (arrow) arrow.innerText = estaPlegado ? "▶" : "◀";
  }
};

window.toggleGearMenu = function(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById("gearDropdownMenu");
  if (menu) menu.style.display = (menu.style.display === "block") ? "none" : "block";
};

window.closeGearMenu = function() {
  const menu = document.getElementById("gearDropdownMenu");
  if (menu) menu.style.display = "none";
};

document.addEventListener("click", () => closeGearMenu());

window.refrescarSistemaCompleto = function() {
  cargarEquiposGuardados();
  renderFleetDashboard();
  if (currentActivity === 'act-reports') renderizarRegistros();
  notify("⚡ Datos sincronizados en tiempo real", "var(--green)");
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

window.cerrarSesionManual = function() {
  usuarioActual = null;
  currentInspectedMAC = null;
  localStorage.removeItem("scada_logged_user");
  localStorage.removeItem("scada_nav_route_v5");

  document.body.classList.remove('authenticated');
  document.body.classList.add('unauthenticated');

  const topBar = document.getElementById("topAppBar");
  const dock = document.getElementById("desktopDockContainer");
  const passInp = document.getElementById("loginPassInput");
  if (topBar) topBar.style.display = "none";
  if (dock) dock.style.display = "none";
  if (passInp) passInp.value = "";

  activityStack = ['act-login'];
  currentTopLevel = 'act-login';
  history.replaceState({ app: 'login' }, '', window.location.pathname);
  renderScreen('act-login');
  cargarListaUsuariosLogin();
  notify("🔒 Sesión destruida y sistema bloqueado", "var(--red)");
};

// =========================================================================
// 7. BASE DE DATOS LOCAL Y TIEMPO REAL NUBE (SUPABASE REALTIME)
// =========================================================================
let db = null;
const fleet = {};

function initDB() {
  return new Promise((resolve) => {
    const req = indexedDB.open("AutoclaveFastFleetDB_v24", 1);
    req.onupgradeneeded = (e) => {
      db = e.target.result;
      if (!db.objectStoreNames.contains("asignaciones")) db.createObjectStore("asignaciones", { keyPath: "mac" });
      if (!db.objectStoreNames.contains("usuarios")) db.createObjectStore("usuarios", { keyPath: "user" });
      if (!db.objectStoreNames.contains("reportes_sesiones")) {
        const sr = db.createObjectStore("reportes_sesiones", { keyPath: "id", autoIncrement: true });
        sr.createIndex("mac", "mac", { unique: false });
        sr.createIndex("sessionId", "sessionId", { unique: false });
      }
    };
    req.onsuccess = (e) => {
      db = e.target.result;
      cargarEquiposGuardados();
      cargarListaUsuariosLogin();
      cargarUsuariosUI();
      verificarSesionPersistente();
      iniciarSuscripcionNubeRealtime();
      resolve(db);
    };
    req.onerror = () => {
      verificarSesionPersistente();
      resolve(null);
    };
  });
}

function iniciarSuscripcionNubeRealtime() {
  if (!sbClient) return;
  try {
    sbClient
      .channel('realtime_reportes_canal')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reportes_autoclaves' }, (payload) => {
        const syncText = document.getElementById("syncStatusText");
        if (syncText) syncText.innerText = "NUBE CONECTADA";
        notify(`📋 Paquete de sesión actualizado [${payload.eventType}]`, "var(--green)");
        if (currentActivity === 'act-reports') renderizarRegistros();
      })
      .subscribe();

    sbClient
      .channel('realtime_equipos_canal')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'asignaciones_equipos' }, () => {
        cargarEquiposGuardados();
      })
      .subscribe();

    sbClient
      .channel('realtime_usuarios_canal')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'usuarios_scada' }, () => {
        cargarUsuariosUI();
        cargarListaUsuariosLogin();
      })
      .subscribe();
  } catch(e) {}
}

function verificarSesionPersistente() {
  const sesionGuardada = localStorage.getItem("scada_logged_user");
  if (sesionGuardada) {
    try {
      const userObj = JSON.parse(sesionGuardada);
      iniciarSesionExitosa(userObj, true);

      const route = JSON.parse(localStorage.getItem("scada_nav_route_v5") || "null");
      if (route && route.activity) {
        if (route.activity === 'act-device-detail' && route.mac) {
          abrirDetalleEquipo(route.mac);
          if (route.subTab) switchDetailTab(route.subTab);
        } else {
          openTopLevel(route.topLevel || 'act-telemetry');
        }
      }
    } catch(e) {
      renderScreen('act-login');
    }
  } else {
    renderScreen('act-login');
  }
}

async function cargarEquiposGuardados() {
  if (sbClient) {
    try {
      const { data, error } = await sbClient.from('asignaciones_equipos').select('*');
      if (!error && data && data.length) {
        data.forEach(item => {
          inicializarDispositivoSiNoExiste(item.mac);
          fleet[item.mac].meta = Object.assign(fleet[item.mac].meta, item);
        });
        actualizarSelectoresGlobales();
        renderFleetDashboard();
        return;
      }
    } catch(e) {}
  }

  if (db) {
    const tx = db.transaction(["asignaciones"], "readonly");
    tx.objectStore("asignaciones").getAll().onsuccess = (e) => {
      (e.target.result || []).forEach(item => {
        inicializarDispositivoSiNoExiste(item.mac);
        fleet[item.mac].meta = Object.assign(fleet[item.mac].meta, item);
      });
      actualizarSelectoresGlobales();
      renderFleetDashboard();
    };
  }
}

// =========================================================================
// 8. MQTT HIVEMQ CLOUD (CANAL WSS 8884)
// =========================================================================
let mqttClient;

function initMQTT() {
  const uniqueId = "SCADA_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now().toString(36);
  const mqttBroker = "wss://d15a5980139147d99bb9e2ad3825e62e.s1.eu.hivemq.cloud:8884/mqtt";
  const mqttOptions = {
    clientId: uniqueId,
    clean: true,
    keepalive: 60,
    username: "admin_autoclave",
    password: "24331973"
  };

  mqttClient = mqtt.connect(mqttBroker, mqttOptions);

  mqttClient.on("connect", () => {
    const dot = document.getElementById("mqttDot");
    const txt = document.getElementById("mqttStatusText");
    if (dot) dot.className = "beacon online";
    if (txt) { txt.innerText = "HIVEMQ 8884"; txt.style.color = "var(--green)"; }
    
    mqttClient.subscribe("autoclave_med_2026/+/telemetria");
    mqttClient.subscribe("autoclave_med_2026/+/esquema");
    mqttClient.subscribe("autoclave_med_2026/+/meta");
    mqttClient.subscribe("autoclave_med_2026/+/reporte_paquete");
  });

  mqttClient.on("error", () => {
    const dot = document.getElementById("mqttDot");
    const txt = document.getElementById("mqttStatusText");
    if (dot) dot.className = "beacon offline";
    if (txt) { txt.innerText = "DESCONECTADO"; txt.style.color = "var(--red)"; }
  });

  mqttClient.on("message", (topic, msg) => {
    try {
      const payload = JSON.parse(msg.toString());
      const parts = topic.split("/");
      const mac = parts[1];
      const canal = parts[2];

      if (canal === "reporte_paquete") {
        procesarPaqueteOfflineSync(mac, payload);
      } else if (canal === "telemetria") {
        procesarTelemetriaReal(mac, payload);
      } else if (canal === "esquema") {
        procesarEsquemaReal(mac, payload);
      } else if (canal === "meta") {
        procesarMetaGlobal(mac, payload);
      }
    } catch(e) {}
  });
}

function inicializarDispositivoSiNoExiste(mac) {
  if (!fleet[mac]) {
    fleet[mac] = {
      mac: mac,
      lastSeen: Date.now(),
      datos: { cfg: {} },
      esquema: null,
      historyPoints: [],
      _pendingLock: {},
      meta: {
        alias: `AUTOCLAVE [${mac.substring(Math.max(0, mac.length - 4))}]`,
        cliente: "SIN REGISTRAR",
        modelo: "AUTODETECTADO",
        ciclosCompletados: 0,
        limiteMantenimiento: 200
      }
    };
  }
}

// SINCRONIZACIÓN DE PAQUETES DE SESIÓN (DESDE ENCENDIDO HASTA APAGADO)
async function procesarPaqueteOfflineSync(mac, payload) {
  inicializarDispositivoSiNoExiste(mac);
  notify(`📥 Guardando paquete de sesión del autoclave [${mac}]...`, "var(--purple)");

  const sesId = payload.session_id || `SES-${Date.now()}`;
  const reportObj = {
    session_id: sesId,
    mac: mac,
    alias: fleet[mac].meta.alias,
    cliente: fleet[mac].meta.cliente,
    modelo: fleet[mac].meta.modelo,
    hora_encendido: payload.hora_encendido || "00:00",
    hora_apagado: payload.hora_apagado || "00:00",
    ciclos_acumulados: payload.ciclos || fleet[mac].meta.ciclosCompletados,
    limite_mantenimiento: payload.limite || 200,
    temp_max: parseFloat(payload.temp_max) || 0,
    pres_max: parseFloat(payload.pres_max) || 0,
    conteo_alarmas: payload.alarmas || 0,
    diagnostico_principal: payload.diagnostico || "SESIÓN CONFORME",
    fase_final: payload.fase_final || "APAGADO_SEGURO",
    ciclos_detalle: payload.ciclos_detalle || [],
    eventos: payload.eventos || [],
    es_offline: !!payload.es_offline
  };

  if (sbClient) {
    try { await sbClient.from('reportes_autoclaves').insert([reportObj]); } catch(e) {}
  }
  if (db) {
    try {
      const tx = db.transaction(["reportes_sesiones"], "readwrite");
      tx.objectStore("reportes_sesiones").add(reportObj);
    } catch(e) {}
  }

  if (currentActivity === 'act-reports') renderizarRegistros();
  notify(`✅ Paquete de [${fleet[mac].meta.alias}] guardado con éxito`, "var(--green)");
}

function procesarMetaGlobal(mac, metaData) {
  inicializarDispositivoSiNoExiste(mac);
  fleet[mac].meta = Object.assign(fleet[mac].meta, metaData);
  actualizarCardDashboard(mac);
  actualizarSelectoresGlobales();
  if (currentActivity === 'act-fleet-mgmt') renderFleetMgmtTable();
  if (currentInspectedMAC === mac) {
    document.getElementById("detDeviceAlias").innerText = fleet[mac].meta.alias.toUpperCase();
    document.getElementById("detDeviceSub").innerText = `MAC: ${mac} | CLIENTE: ${fleet[mac].meta.cliente} | MODELO: ${fleet[mac].meta.modelo}`;
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

  if (data.alarma_cod && data.alarma_cod > 0) {
    sonarAlarmaSonora();
  }

  fleet[mac].datos = data;

  const temp = data.temp_camara || 25.0;
  const pres = data.presion || 0.0;
  fleet[mac].historyPoints.push({
    time: new Date().toLocaleTimeString().split(' ')[0],
    temp: temp,
    pres: pres
  });
  if (fleet[mac].historyPoints.length > 30) fleet[mac].historyPoints.shift();

  actualizarCardDashboard(mac);

  if (currentInspectedMAC === mac) {
    actualizarPantallaDetalleDinamica();
    if (currentDetailSubTab === 'tab-det-graph') actualizarGraficoEnVivo();
  }
}

function procesarEsquemaReal(mac, data) {
  inicializarDispositivoSiNoExiste(mac);
  fleet[mac].esquema = data;
  fleet[mac].fw = data.fw || "v3.2";
  if (data.modelo && fleet[mac].meta.modelo === "AUTODETECTADO") {
    fleet[mac].meta.modelo = data.modelo;
  }
  if (currentInspectedMAC === mac) generarUIEsquemaDinamico(mac);
}

function isOnline(dev) {
  return dev && dev.lastSeen && (Date.now() - dev.lastSeen) < 18000;
}

function getHealthStatus(dev) {
  if (!dev || !dev.lastSeen) return 'OFFLINE';
  const diff = Date.now() - dev.lastSeen;
  if (diff < 5000) return 'ONLINE';
  if (diff < 18000) return 'LATENCY';
  return 'OFFLINE';
}

function getConnectionQuality(dev) {
  const status = getHealthStatus(dev);
  if (status === 'ONLINE') return { text: "100% ONLINE", color: "var(--green)", dot: "online" };
  if (status === 'LATENCY') return { text: "LATENCIA", color: "var(--amber)", dot: "online" };
  return { text: "OFFLINE", color: "var(--red)", dot: "offline" };
}

// =========================================================================
// 9. DASHBOARD ADAPTATIVO (SIN CLIENTES DESCONECTADOS EN VISTA ONLINE)
// =========================================================================
window.setFleetHealthFilter = function(filterType) {
  currentHealthFilter = filterType;
  document.querySelectorAll(".btn-filter").forEach(b => b.classList.remove("active"));
  
  if (filterType === 'ONLINE') document.getElementById("filterBtnOnline")?.classList.add("active");
  if (filterType === 'LATENCY') document.getElementById("filterBtnLatency")?.classList.add("active");
  if (filterType === 'OFFLINE') document.getElementById("filterBtnOffline")?.classList.add("active");
  if (filterType === 'ALL') document.getElementById("filterBtnAll")?.classList.add("active");

  const container = document.getElementById("fleetLiveContainer");
  if (container) container.innerHTML = '';
  renderFleetDashboard();
};

function renderFleetDashboard() {
  const container = document.getElementById("fleetLiveContainer");
  if (!container || currentActivity !== 'act-telemetry') return;
  const keys = Object.keys(fleet);

  let countOn = 0, countLat = 0, countOff = 0;
  keys.forEach(k => {
    const s = getHealthStatus(fleet[k]);
    if (s === 'ONLINE') countOn++;
    else if (s === 'LATENCY') countLat++;
    else countOff++;
  });

  const elOn = document.getElementById("countOnline");
  const elLat = document.getElementById("countLatency");
  const elOff = document.getElementById("countOffline");
  const elAll = document.getElementById("countAll");

  if (elOn) elOn.innerText = countOn;
  if (elLat) elLat.innerText = countLat;
  if (elOff) elOff.innerText = countOff;
  if (elAll) elAll.innerText = keys.length;

  let filteredKeys = keys;
  if (currentHealthFilter !== 'ALL') {
    filteredKeys = keys.filter(k => getHealthStatus(fleet[k]) === currentHealthFilter);
  }

  // Si un equipo no está conectado, NUNCA se muestra bajo ONLINE
  if (!filteredKeys.length) {
    container.innerHTML = `<div class="empty-deck">NO HAY AUTOCLAVES TRANSMITIENDO EN EL FILTRO [${currentHealthFilter}].</div>`;
    return;
  }

  const emptyEl = container.querySelector(".empty-deck");
  if (emptyEl) emptyEl.remove();

  filteredKeys.forEach(mac => {
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
  const health = getConnectionQuality(item);

  const ciclos = meta.ciclosCompletados || 0;
  const limite = meta.limiteMantenimiento || 200;
  const pct = Math.min(100, Math.round((ciclos / limite) * 100));
  const mantClass = pct >= 100 ? 'danger' : pct >= 80 ? 'warn' : '';

  card.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
      <div>
        <div style="font-size: 0.95rem; font-weight: 800; color: var(--cyan);">${meta.alias}</div>
        <div style="font-size: 0.68rem; color: var(--text-muted);">${meta.cliente} | ${meta.modelo}</div>
      </div>
      <span class="status-badge" style="border-color:${health.color};">
        <span class="beacon ${health.dot}"></span>
        <span style="color:${health.color}; font-weight:800;">${health.text}</span>
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
      <div style="display:flex; justify-content:space-between; font-size:0.65rem; color:var(--text-muted); font-weight:700;">
        <span>CICLOS: ${ciclos} / ${limite}</span>
        <span style="color:${pct >= 100 ? 'var(--red)' : pct >= 80 ? 'var(--amber)' : 'var(--green)'};">
          ${pct >= 100 ? 'MANT. VENCIDO' : pct >= 80 ? 'MANT. PRÓXIMO' : 'SALUD OK'}
        </span>
      </div>
      <div class="health-bar"><div class="health-fill ${mantClass}" style="width: ${pct}%;"></div></div>
    </div>

    <div style="background: rgba(0,0,0,0.35); padding: 7px 10px; border-radius: 4px; font-size: 0.72rem; margin-bottom: 8px; display:flex; justify-content:space-between; align-items:center;">
      <span style="color: var(--text-muted); font-weight:700;">FASE ACTUAL:</span> 
      <span style="color: var(--green); font-weight: 800; letter-spacing:1px;">${d.fase || 'ESPERA'}</span>
    </div>

    <div style="text-align: center; font-size: 0.68rem; color: var(--cyan); padding: 5px; background: rgba(0,240,255,0.06); border-radius: 4px; font-weight:800;">
      👉 ENTRAR A CONTROL TOTAL (1 CLICK)
    </div>
  `;
}

// =========================================================================
// 10. DETALLE DEL EQUIPO Y GRÁFICO EN VIVO
// =========================================================================
window.abrirDetalleEquipo = function(mac) {
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

  switchDetailTab('tab-det-tele');
  openActivity('act-device-detail');
};

function switchDetailTab(tabId) {
  // Comprobación de rol para pestaña NVS y Ficha
  if (usuarioActual && usuarioActual.rol === "OPERADOR" && (tabId === 'tab-det-cfg' || tabId === 'tab-det-ficha')) {
    return notify("Pestaña restringida para nivel OPERADOR", "var(--red)");
  }

  currentDetailSubTab = tabId;
  document.querySelectorAll('.detail-subview').forEach(s => s.style.display = 'none');
  document.querySelectorAll('.subtab-slider .btn').forEach(b => b.classList.remove('active'));

  const el = document.getElementById(tabId);
  if (el) el.style.display = 'block';

  if (tabId === 'tab-det-tele') document.getElementById('btnSubTele')?.classList.add('active');
  if (tabId === 'tab-det-graph') {
    document.getElementById('btnSubGraph')?.classList.add('active');
    inicializarGraficoEsterilizacion();
  }
  if (tabId === 'tab-det-cfg') document.getElementById('btnSubCfg')?.classList.add('active');
  if (tabId === 'tab-det-ficha') document.getElementById('btnSubFicha')?.classList.add('active');
  if (tabId === 'tab-det-logs') document.getElementById('btnSubLogs')?.classList.add('active');
}

function inicializarGraficoEsterilizacion() {
  const ctx = document.getElementById('realtimeSterileChart');
  if (!ctx) return;

  if (realChartInstance) {
    realChartInstance.destroy();
  }

  const history = fleet[currentInspectedMAC]?.historyPoints || [];
  const labels = history.map(h => h.time);
  const dataTemp = history.map(h => h.temp);
  const dataPres = history.map(h => h.pres);

  realChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Temperatura (°C)',
          data: dataTemp,
          borderColor: '#00f0ff',
          backgroundColor: 'rgba(0, 240, 255, 0.1)',
          yAxisID: 'yTemp',
          tension: 0.35,
          borderWidth: 2
        },
        {
          label: 'Presión (Bar)',
          data: dataPres,
          borderColor: '#bf7fff',
          backgroundColor: 'rgba(157, 78, 221, 0.1)',
          yAxisID: 'yPres',
          tension: 0.35,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' } },
        yTemp: {
          type: 'linear',
          position: 'left',
          grid: { color: 'rgba(0,240,255,0.1)' },
          ticks: { color: '#00f0ff' },
          title: { display: true, text: '°C', color: '#00f0ff' }
        },
        yPres: {
          type: 'linear',
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { color: '#bf7fff' },
          title: { display: true, text: 'Bar', color: '#bf7fff' }
        }
      },
      plugins: {
        legend: { labels: { color: '#f8fafc', font: { family: 'JetBrains Mono' } } }
      }
    }
  });
}

function actualizarGraficoEnVivo() {
  if (!realChartInstance || !currentInspectedMAC || !fleet[currentInspectedMAC]) return;
  const history = fleet[currentInspectedMAC].historyPoints || [];
  realChartInstance.data.labels = history.map(h => h.time);
  realChartInstance.data.datasets[0].data = history.map(h => h.temp);
  realChartInstance.data.datasets[1].data = history.map(h => h.pres);
  realChartInstance.update();
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
      <div class="gauge-cell"><div class="gauge-val" id="dyn-val-temp_camara">--°C</div><div class="gauge-lbl">TEMPERATURA</div></div>
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
                <span style="font-weight:700;">${campo.label}</span>
                <input type="checkbox" class="dyn-input-field" data-key="${campo.key}" ${valorActual ? 'checked' : ''} onchange="cambiarSwitchOptimista('${mac}', '${campo.key}', this.checked)">
              </div>
            `;
          } else {
            return `
              <div class="dynamic-field-row">
                <span>${campo.label}</span>
                <input type="number" step="${campo.step || 0.1}" min="${campo.min || 0}" max="${campo.max || 999}" class="input-field dyn-input-field" data-key="${campo.key}" value="${valorActual}" inputmode="decimal" onkeydown="if(event.key==='Enter'){event.preventDefault(); guardarParametrosDinamicos();}">
              </div>
            `;
          }
        }).join("")}
      </div>
    `).join("");
  } else {
    containerMenus.innerHTML = `<div class="empty-deck">Esperando capacidades anunciadas por el autoclave...</div>`;
  }
}

function actualizarPantallaDetalleDinamica() {
  if (!currentInspectedMAC || !fleet[currentInspectedMAC]) return;
  const item = fleet[currentInspectedMAC];
  const d = item.datos || {};
  const health = getConnectionQuality(item);

  const ob = document.getElementById("detOnlineBadge");
  if (ob) {
    ob.innerHTML = `<span class="dot ${health.dot}"></span> ${health.text}`;
    ob.style.borderColor = health.color;
  }

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

  if (d.cfg) {
    Object.keys(d.cfg).forEach(k => {
      const inputEl = document.querySelector(`.dyn-input-field[data-key="${k}"]`);
      if (inputEl) {
        const ahora = Date.now();
        const estaBloqueado = item._pendingLock && ahora < item._pendingLock[k];
        if (!estaBloqueado) {
          if (inputEl.type === 'checkbox') inputEl.checked = !!d.cfg[k];
          else if (inputEl.type === 'number' && document.activeElement !== inputEl) inputEl.value = d.cfg[k];
        }
      }
    });
  }

  const banner = document.getElementById("detAlarmaBanner");
  const txt = document.getElementById("detAlarmaTexto");
  if (d.alarma_cod && d.alarma_cod > 0) {
    if (banner) banner.style.display = "block";
    if (txt) txt.innerText = d.alarma_msg || "Alarma activa en cámara";
  } else {
    if (banner) banner.style.display = "none";
  }
}

window.cambiarSwitchOptimista = function(mac, key, isChecked) {
  if (usuarioActual && usuarioActual.rol === "OPERADOR") return notify("Permiso denegado: rol OPERADOR", "var(--red)");
  if (!fleet[mac]) return;

  if (!fleet[mac].datos.cfg) fleet[mac].datos.cfg = {};
  fleet[mac].datos.cfg[key] = isChecked;

  fleet[mac]._pendingLock = fleet[mac]._pendingLock || {};
  fleet[mac]._pendingLock[key] = Date.now() + 2500;

  const payload = {};
  payload[key] = isChecked;
  mqttClient.publish(`autoclave_med_2026/${mac}/config`, JSON.stringify(payload));
  notify(`⚡ ${key.toUpperCase()}: ${isChecked ? 'ON' : 'OFF'}`, isChecked ? "var(--green)" : "var(--amber)");
};

window.guardarParametrosDinamicos = function() {
  if (!currentInspectedMAC) return;
  if (usuarioActual && usuarioActual.rol === "OPERADOR") return notify("Permiso denegado para tu nivel", "var(--red)");

  const payload = {};
  document.querySelectorAll(".dyn-input-field").forEach(input => {
    const key = input.getAttribute("data-key");
    if (input.type === 'checkbox') {
      payload[key] = input.checked;
      fleet[currentInspectedMAC].datos.cfg = fleet[currentInspectedMAC].datos.cfg || {};
      fleet[currentInspectedMAC].datos.cfg[key] = input.checked;
      fleet[currentInspectedMAC]._pendingLock[key] = Date.now() + 2500;
    } else if (input.type === 'number') {
      payload[key] = parseFloat(input.value);
    } else {
      payload[key] = input.value;
    }
  });

  mqttClient.publish(`autoclave_med_2026/${currentInspectedMAC}/config`, JSON.stringify(payload));
  notify("⚡ Parámetros enviados al ESP32", "var(--green)");
};

window.enviarComandoDetalle = function(cmd) {
  if (!currentInspectedMAC) return;
  mqttClient.publish(`autoclave_med_2026/${currentInspectedMAC}/config`, JSON.stringify({ cmd }));
  notify(`Comando transmitido: ${cmd}`, "var(--cyan)");
};

window.guardarFichaDetalle = async function() {
  const alias = document.getElementById("fichaAlias").value.trim();
  const cliente = document.getElementById("fichaCliente").value.trim();
  const modelo = document.getElementById("fichaModelo").value.trim();

  const metaData = { mac: currentInspectedMAC, alias, cliente, modelo };

  if (sbClient) {
    try { await sbClient.from('asignaciones_equipos').upsert(metaData, { onConflict: 'mac' }); } catch(e) {}
  }
  if (db) {
    const tx = db.transaction(["asignaciones"], "readwrite");
    tx.objectStore("asignaciones").put(metaData);
  }

  fleet[currentInspectedMAC].meta = Object.assign(fleet[currentInspectedMAC].meta, metaData);
  mqttClient.publish(`autoclave_med_2026/${currentInspectedMAC}/meta`, JSON.stringify(metaData), { retain: true, qos: 1 });

  document.getElementById("detDeviceAlias").innerText = alias.toUpperCase();
  document.getElementById("detDeviceSub").innerText = `MAC: ${currentInspectedMAC} | CLIENTE: ${cliente} | MODELO: ${modelo}`;
  actualizarCardDashboard(currentInspectedMAC);
  notify("Ficha guardada y sincronizada en nube", "var(--green)");
};

window.solicitarEliminacionActual = function() {
  if (!currentInspectedMAC) return;
  mostrarModalConfirmacion({
    icon: '🗑️',
    title: 'ELIMINAR AUTOCLAVE',
    msg: `¿Deseas purgar el autoclave ${fleet[currentInspectedMAC]?.meta?.alias || currentInspectedMAC} hasta que vuelva a enlazarse?`,
    okText: 'ELIMINAR DEFINITIVAMENTE',
    okClass: 'btn-danger',
    onConfirm: () => eliminarEquipoTotal(currentInspectedMAC)
  });
};

window.eliminarEquipoTotal = async function(mac) {
  if (usuarioActual && usuarioActual.rol !== "SUPERADMIN") {
    return notify("Permiso denegado: solo SUPERADMIN", "var(--red)");
  }

  delete fleet[mac];

  if (sbClient) {
    try { await sbClient.from('asignaciones_equipos').delete().eq('mac', mac); } catch(e) {}
  }

  if (db) {
    try {
      const tx = db.transaction(["asignaciones"], "readwrite");
      tx.objectStore("asignaciones").delete(mac);
    } catch(e) {}
  }

  const card = document.getElementById(`card-${mac}`);
  if (card) card.remove();

  actualizarSelectoresGlobales();
  renderFleetMgmtTable();
  renderFleetDashboard();

  if (currentInspectedMAC === mac) {
    currentInspectedMAC = null;
    openTopLevel('act-telemetry');
  }

  notify(`Autoclave [${mac}] purgado del sistema`, "var(--amber)");
};

function cargarLogsDetalle(mac) {
  const tbody = document.getElementById("detLogsTbody");
  if (!tbody) return;

  if (sbClient) {
    sbClient
      .from('reportes_autoclaves')
      .select('*')
      .eq('mac', mac)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (!error && data && data.length) {
          renderLogsDetalleFilas(data, tbody);
          return;
        }
        fallbackLocalLogsDetalle(mac, tbody);
      });
  } else {
    fallbackLocalLogsDetalle(mac, tbody);
  }
}

function fallbackLocalLogsDetalle(mac, tbody) {
  if (!db) return;
  const tx = db.transaction(["reportes_sesiones"], "readonly");
  tx.objectStore("reportes_sesiones").getAll().onsuccess = (e) => {
    const logs = (e.target.result || []).filter(x => x.mac === mac).reverse();
    renderLogsDetalleFilas(logs, tbody);
  };
}

function renderLogsDetalleFilas(logs, tbody) {
  if (!logs.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:18px;">Sin sesiones registradas en la base de datos.</td></tr>`;
    return;
  }
  tbody.innerHTML = logs.map(s => {
    const countCiclos = (s.ciclos_detalle && s.ciclos_detalle.length) ? s.ciclos_detalle.length : (s.ciclos_acumulados || 1);
    return `
      <tr class="report-package-row" onclick="verPaqueteSesion('${s.session_id || s.sessionId}')">
        <td style="color:var(--cyan); font-weight:700;">${new Date(s.created_at || s.fecha || Date.now()).toLocaleDateString()} ${s.hora_encendido || s.horaEncendido || '--'}</td>
        <td><span class="user-role">${s.diagnostico_principal || s.diagnosticoPrincipal || s.fase_final || '--'}</span></td>
        <td><span class="cycle-badge">${countCiclos} Ciclos</span></td>
        <td><span style="color:${(s.ciclos_acumulados || 0) >= (s.limite_mantenimiento || 200) ? 'var(--red)' : 'var(--green)'}; font-weight:700;">${(s.ciclos_acumulados || 0) >= (s.limite_mantenimiento || 200) ? 'VENCIDO' : 'OK'}</span></td>
        <td>T:${parseFloat(s.temp_max || s.tempMax || 0).toFixed(1)}°C | P:${parseFloat(s.pres_max || s.presMax || 0).toFixed(2)}b</td>
        <td><button class="btn btn-sm" onclick="event.stopPropagation(); verPaqueteSesion('${s.session_id || s.sessionId}')">👁️</button></td>
      </tr>
    `;
  }).join("");
}

// =========================================================================
// 11. AUDITORÍA DE REPORTES POR PAQUETE COMPLETO
// =========================================================================
let reportesCache = [];

async function renderizarRegistros() {
  const devFilter = document.getElementById("filterDeviceSelect")?.value || "TODOS";
  const fType = document.getElementById("filterType")?.value || "TODOS";
  const fDesde = document.getElementById("filterFechaDesde")?.value;
  const fHasta = document.getElementById("filterFechaHasta")?.value;
  const fLimit = document.getElementById("filterLimit")?.value || "100";
  const fText = document.getElementById("filterInput")?.value.toUpperCase() || "";
  const tbody = document.getElementById("auditTableBody");
  if (!tbody) return;

  let items = [];

  if (sbClient) {
    try {
      let query = sbClient.from('reportes_autoclaves').select('*').order('created_at', { ascending: false });

      if (fLimit !== 'ALL') query = query.limit(parseInt(fLimit));
      if (devFilter !== "TODOS") query = query.eq('mac', devFilter);
      if (fDesde) query = query.gte('created_at', fDesde);
      if (fHasta) query = query.lte('created_at', fHasta + 'T23:59:59');

      const { data, error } = await query;
      if (!error && data) {
        items = data.map(r => {
          const metaLocal = fleet[r.mac]?.meta || {};
          return {
            id: r.id,
            sessionId: r.session_id,
            mac: r.mac,
            alias: r.alias || metaLocal.alias || r.mac,
            cliente: r.cliente || metaLocal.cliente || "Clínica",
            modelo: r.modelo || metaLocal.modelo || "Autoclave",
            fecha: r.created_at,
            horaEncendido: r.hora_encendido || "--",
            horaApagado: r.hora_apagado || "--",
            ciclosAcumulados: r.ciclos_acumulados || 0,
            limiteMantenimiento: r.limite_mantenimiento || 200,
            tempMax: parseFloat(r.temp_max) || 0,
            presMax: parseFloat(r.pres_max) || 0,
            conteoAlarmas: r.conteo_alarmas || 0,
            diagnosticoPrincipal: r.diagnostico_principal || r.fase_final,
            faseFinal: r.fase_final || "ESPERA",
            ciclosDetalle: r.ciclos_detalle || [],
            eventos: r.eventos || [],
            esOffline: r.es_offline || false
          };
        });

        guardarCopiaEnIndexedDB(items);
      }
    } catch(e) {}
  }

  if (!items.length && db) {
    const tx = db.transaction(["reportes_sesiones"], "readonly");
    tx.objectStore("reportes_sesiones").getAll().onsuccess = (e) => {
      items = (e.target.result || []).reverse();
      pintarTablaReportes(items, devFilter, fType, fDesde, fHasta, fText, tbody);
    };
    return;
  }

  pintarTablaReportes(items, devFilter, fType, fDesde, fHasta, fText, tbody);
}

function guardarCopiaEnIndexedDB(items) {
  if (!db || !items.length) return;
  try {
    const tx = db.transaction(["reportes_sesiones"], "readwrite");
    const store = tx.objectStore("reportes_sesiones");
    items.slice(0, 50).forEach(item => {
      store.put(item);
    });
  } catch(e) {}
}

function pintarTablaReportes(items, devFilter, fType, fDesde, fHasta, fText, tbody) {
  reportesCache = items;

  document.getElementById("kpiTotalSesiones").innerText = items.length;
  const totalCiclos = items.reduce((acc, cur) => acc + (cur.ciclosAcumulados || 0), 0);
  document.getElementById("kpiTotalCiclos").innerText = totalCiclos;
  const mantAlerts = items.filter(x => (x.ciclosAcumulados || 0) >= (x.limiteMantenimiento || 200) * 0.8).length;
  document.getElementById("kpiMantenimientoAlerta").innerText = mantAlerts;
  const totalAlarmas = items.filter(x => x.conteoAlarmas > 0).length;
  document.getElementById("kpiTotalAlarmas").innerText = totalAlarmas;

  if (fType === "CICLO_OK") items = items.filter(x => x.diagnosticoPrincipal && x.diagnosticoPrincipal.includes("CONFORME"));
  if (fType === "ALARMA") items = items.filter(x => x.conteoAlarmas > 0);
  if (fType === "MANT_WARN") items = items.filter(x => (x.ciclosAcumulados || 0) >= (x.limiteMantenimiento || 200) * 0.8);
  if (fType === "OFFLINE_SYNC") items = items.filter(x => x.esOffline === true);

  if (fText) {
    items = items.filter(x => 
      x.mac.toUpperCase().includes(fText) || 
      x.alias.toUpperCase().includes(fText) || 
      x.cliente.toUpperCase().includes(fText) || 
      x.modelo.toUpperCase().includes(fText) ||
      (x.diagnosticoPrincipal && x.diagnosticoPrincipal.toUpperCase().includes(fText))
    );
  }

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:30px;">No hay paquetes de sesión disponibles.</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(s => {
    const ciclos = s.ciclosAcumulados || 0;
    const limite = s.limiteMantenimiento || 200;
    const countCiclos = (s.ciclosDetalle && s.ciclosDetalle.length) ? s.ciclosDetalle.length : (ciclos || 1);

    return `
      <tr class="report-package-row" onclick="verPaqueteSesion('${s.sessionId}')">
        <td style="text-align:center;">
          <input type="checkbox" class="check-report-item" value="${s.id}" data-session="${s.sessionId}" onclick="event.stopPropagation()" style="width:18px; height:18px; accent-color:var(--cyan);">
        </td>
        <td>
          <div style="color:var(--cyan); font-weight:800;">${new Date(s.fecha).toLocaleDateString()}</div>
          <div style="font-size:0.62rem; color:var(--text-muted);">${s.sessionId || s.id}</div>
        </td>
        <td>
          <div style="font-weight:800;">${s.alias}</div>
          <div style="font-size:0.62rem; color:var(--purple);">${s.cliente} | ${s.modelo}</div>
        </td>
        <td>
          <div>ON: ${s.horaEncendido}</div>
          <div style="color:var(--text-muted);">OFF: ${s.horaApagado}</div>
        </td>
        <td>
          <span class="cycle-badge">⚡ ${countCiclos} Ciclos Ejecutados</span>
        </td>
        <td>T:${(s.tempMax||0).toFixed(1)}°C<br>P:${(s.presMax||0).toFixed(2)}b</td>
        <td>
          <span class="user-role" style="color:${s.conteoAlarmas > 0 ? 'var(--red)' : s.diagnosticoPrincipal.includes('CONFORME') ? 'var(--green)' : 'var(--cyan)'};">
            ${s.diagnosticoPrincipal || 'EN REPOSO'}
          </span>
        </td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-sm" onclick="event.stopPropagation(); verPaqueteSesion('${s.sessionId}')" title="Ver detalle del paquete">👁️</button>
            <button class="btn btn-sm btn-danger" style="padding:4px 8px;" onclick="event.stopPropagation(); solicitarEliminarReporteIndividual('${s.sessionId}')" title="Eliminar paquete">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

window.verPaqueteSesion = function(sessionId) {
  const ses = reportesCache.find(x => x.sessionId === sessionId);
  if (!ses) return notify("Paquete de sesión no encontrado", "var(--red)");

  currentViewingReport = ses;
  document.getElementById("repPkgTitle").innerText = `SESIÓN COMPLETA: ${ses.alias.toUpperCase()}`;
  document.getElementById("repPkgSub").innerText = `ID: ${ses.sessionId} | MAC: ${ses.mac} | CLIENTE: ${ses.cliente} | MODELO: ${ses.modelo}`;
  
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

  // Desglose de ciclos exactos numerados dentro del paquete
  const cyclesContainer = document.getElementById("repCyclesListContainer");
  const ciclosArray = ses.ciclosDetalle || [];
  if (ciclosArray.length) {
    cyclesContainer.innerHTML = ciclosArray.map(c => `
      <div class="cycle-card-item">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span class="cycle-badge">CICLO #${c.numero || 1}: ${c.programa || 'ESTERILIZACIÓN'}</span>
          <span style="font-weight:800; color:${c.estado === 'CONFORME' ? 'var(--green)' : 'var(--red)'};">${c.estado || 'CONFORME'}</span>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:8px; font-size:0.75rem; color:var(--text-muted);">
          <div>INICIO: <span style="color:#fff; font-weight:700;">${c.hora_inicio || '--'}</span></div>
          <div>FIN: <span style="color:#fff; font-weight:700;">${c.hora_fin || '--'}</span></div>
          <div>MÁX T°: <span style="color:var(--cyan); font-weight:800;">${c.temp_max ? c.temp_max + '°C' : '--'}</span></div>
          <div>MÁX P: <span style="color:var(--purple); font-weight:800;">${c.pres_max ? c.pres_max + 'b' : '--'}</span></div>
        </div>
      </div>
    `).join("");
  } else {
    cyclesContainer.innerHTML = `
      <div class="cycle-card-item">
        <span class="cycle-badge">CICLO #1: ESTERILIZACIÓN CONTINUA</span>
        <div style="margin-top:6px; font-size:0.75rem; color:var(--text-muted);">
          Máximos alcanzados en este ciclo: <b style="color:var(--cyan);">${ses.tempMax.toFixed(1)}°C</b> | <b style="color:var(--purple);">${ses.presMax.toFixed(2)} Bar</b>
        </div>
      </div>
    `;
  }

  // Registro cronológico desde encendido hasta apagado
  const timelineBox = document.getElementById("repTimelineContainer");
  timelineBox.innerHTML = (ses.eventos || []).map(ev => `
    <div class="timeline-item">
      <div style="font-size:0.75rem; color:var(--cyan); font-weight:800;">${ev.hora} - <span class="user-role">${ev.tipo}</span></div>
      <div style="font-size:0.8rem; margin-top:2px;">${ev.msg}</div>
      ${ev.temp ? `<div style="font-size:0.68rem; color:var(--text-muted); margin-top:2px;">T:${ev.temp}°C | P:${ev.presion}b</div>` : ''}
    </div>
  `).join("");

  openActivity('act-report-view');
};

window.imprimirCertificadoSesionActual = function() {
  if (!currentViewingReport) return;
  const s = currentViewingReport;
  const v = window.open("", "_blank");
  v.document.write(`
    <html><head><title>CERTIFICADO - ${s.alias}</title>
    <style>body{font-family:'Courier New',monospace;padding:35px;color:#111;}table{width:100%;border-collapse:collapse;margin:20px 0;}td,th{border:1px solid #333;padding:8px;}</style>
    </head><body>
    <h2>CERTIFICADO CLÍNICO OFICIAL DE ESTERILIZACIÓN</h2>
    <p>HOSPITAL / CLIENTE: <b>${s.cliente.toUpperCase()}</b></p>
    <p>AUTOCLAVE: <b>${s.alias}</b> (MAC: ${s.mac}) | MODELO: ${s.modelo}</p>
    <p>SESIÓN / ID: ${s.sessionId} | FECHA: ${new Date(s.fecha).toLocaleDateString()}</p>
    <p>HORARIOS: Encendido (Boot): ${s.horaEncendido} ➔ Apagado: ${s.horaApagado}</p>
    <table>
      <tr><th>PARÁMETRO</th><th>VALOR REGISTRADO</th></tr>
      <tr><td>Temperatura Máxima de la Sesión</td><td>${s.tempMax.toFixed(1)} °C</td></tr>
      <tr><td>Presión Máxima Alcanzada</td><td>${s.presMax.toFixed(2)} Bar</td></tr>
      <tr><td>Ciclos Acumulados del Equipo</td><td>${s.ciclosAcumulados} / ${s.limiteMantenimiento}</td></tr>
      <tr><td>Diagnóstico Global de Validación</td><td><b>${s.diagnosticoPrincipal || s.faseFinal}</b></td></tr>
    </table>
    <h3>REGISTRO CRONOLÓGICO CONTINUO:</h3>
    <ul>${(s.eventos||[]).map(e => `<li><b>${e.hora} [${e.tipo}]:</b> ${e.msg}</li>`).join("")}</ul>
    <br><br><p>Firma y Sello Responsable Biomédico: ___________________________</p>
    <script>window.print();<\/script></body></html>
  `);
  v.document.close();
};

window.toggleSelectAllReports = function(isChecked) {
  document.querySelectorAll(".check-report-item").forEach(c => c.checked = isChecked);
};

window.solicitarEliminarReporteIndividual = function(sessionId) {
  mostrarModalConfirmacion({
    icon: '🗑️',
    title: 'ELIMINAR PAQUETE DE SESIÓN',
    msg: `¿Deseas purgar el paquete [${sessionId}] de la base de datos?`,
    okText: 'ELIMINAR PAQUETE',
    okClass: 'btn-danger',
    onConfirm: () => eliminarReporteIndividual(sessionId)
  });
};

async function eliminarReporteIndividual(sessionId) {
  if (usuarioActual && usuarioActual.rol !== "SUPERADMIN") return notify("Permiso denegado: solo SuperAdmin", "var(--red)");
  if (sbClient) {
    try { await sbClient.from('reportes_autoclaves').delete().eq('session_id', sessionId); } catch(e) {}
  }
  renderizarRegistros();
  notify("Paquete de sesión eliminado", "var(--amber)");
}

window.eliminarReportesSeleccionados = async function() {
  if (usuarioActual && usuarioActual.rol !== "SUPERADMIN") return notify("Permiso denegado: solo SuperAdmin", "var(--red)");
  const seleccionados = Array.from(document.querySelectorAll(".check-report-item:checked")).map(c => c.getAttribute("data-session"));
  if (!seleccionados.length) return notify("Marca al menos un reporte", "var(--amber)");

  mostrarModalConfirmacion({
    icon: '🗑️',
    title: 'ELIMINAR SELECCIÓN',
    msg: `¿Eliminar ${seleccionados.length} paquetes seleccionados de la base de datos?`,
    okText: `ELIMINAR (${seleccionados.length})`,
    okClass: 'btn-danger',
    onConfirm: async () => {
      if (sbClient) {
        try { await sbClient.from('reportes_autoclaves').delete().in('session_id', seleccionados); } catch(e) {}
      }
      renderizarRegistros();
      notify(`🗑️ ${seleccionados.length} paquetes eliminados`, "var(--amber)");
    }
  });
};

window.confirmarVaciarDB = async function() {
  if (usuarioActual && usuarioActual.rol !== "SUPERADMIN") return notify("Permiso denegado: solo SuperAdmin", "var(--red)");
  mostrarModalConfirmacion({
    icon: '🧹',
    title: 'VACIAR BASE DE DATOS',
    msg: '⚠️ ¡ADVERTENCIA! Se borrarán permanentemente todos los paquetes de sesiones en la nube.',
    okText: 'VACIAR NUBE AHORA',
    okClass: 'btn-danger',
    onConfirm: async () => {
      if (sbClient) {
        try { await sbClient.from('reportes_autoclaves').delete().neq('mac', 'NONE'); } catch(e) {}
      }
      renderizarRegistros();
      notify("Base de datos de auditoría vaciada", "var(--red)");
    }
  });
};

// =========================================================================
// 12. BACKUP Y RESTAURACIÓN INTEGRAL DE REPORTES (JSON & CSV)
// =========================================================================
window.descargarBackupJSON = function() {
  const data = reportesCache || [];
  if (!data.length) return notify("No hay datos en memoria para exportar", "var(--amber)");

  const backupPackage = {
    tipo: "SCADA_AUTOCLAVE_PAQUETES_CLINICOS",
    fechaExportacion: new Date().toISOString(),
    totalRegistros: data.length,
    reportes: data
  };

  const blob = new Blob([JSON.stringify(backupPackage, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `backup_paquetes_sesiones_${Date.now()}.json`;
  a.click();
  notify("💾 Backup JSON de paquetes descargado", "var(--green)");
};

window.restaurarBackupJSON = function(files) {
  if (!files || !files.length) return;
  const file = files[0];
  const reader = new FileReader();

  reader.onload = async (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      const list = parsed.reportes || (Array.isArray(parsed) ? parsed : null);

      if (!list || !list.length) throw new Error("Archivo inválido");

      notify(`Subiendo ${list.length} paquetes a la base de datos...`, "var(--purple)");

      if (sbClient) {
        for (const item of list) {
          const insertObj = {
            session_id: item.sessionId || item.session_id || `REST-${Math.random().toString(36).substring(7)}`,
            mac: item.mac,
            alias: item.alias,
            cliente: item.cliente,
            modelo: item.modelo,
            hora_encendido: item.horaEncendido || item.hora_encendido,
            hora_apagado: item.horaApagado || item.hora_apagado,
            ciclos_acumulados: item.ciclosAcumulados || item.ciclos_acumulados || 0,
            limite_mantenimiento: item.limiteMantenimiento || item.limite_mantenimiento || 200,
            temp_max: item.tempMax || item.temp_max || 0,
            pres_max: item.presMax || item.pres_max || 0,
            conteo_alarmas: item.conteoAlarmas || item.conteo_alarmas || 0,
            diagnostico_principal: item.diagnosticoPrincipal || item.diagnostico_principal || "RESTAURADO",
            fase_final: item.faseFinal || item.fase_final || "COMPLETADO",
            ciclos_detalle: item.ciclosDetalle || item.ciclos_detalle || [],
            eventos: item.eventos || []
          };
          try { await sbClient.from('reportes_autoclaves').insert([insertObj]); } catch(err) {}
        }
      }

      renderizarRegistros();
      notify(`✅ ${list.length} paquetes restaurados en la nube`, "var(--green)");
    } catch(err) {
      notify("Error al leer el archivo JSON", "var(--red)");
    }
  };

  reader.readAsText(file);
};

window.exportarRegistrosCSV = function() {
  const data = reportesCache || [];
  if (!data.length) return notify("Sin datos para exportar", "var(--amber)");
  let csv = "ID_SESION,FECHA,MAC,ALIAS,CLIENTE,MODELO,HORA_ON,HORA_OFF,TOTAL_CICLOS,T_MAX,P_MAX,DIAGNOSTICO\n";
  data.forEach(d => {
    const cCount = (d.ciclosDetalle && d.ciclosDetalle.length) ? d.ciclosDetalle.length : (d.ciclosAcumulados || 1);
    csv += `"${d.sessionId}","${d.fecha}","${d.mac}","${d.alias}","${d.cliente}","${d.modelo}","${d.horaEncendido}","${d.horaApagado}","${cCount}","${d.tempMax}","${d.presMax}","${d.diagnosticoPrincipal||d.faseFinal}"\n`;
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `reporte_sesiones_${Date.now()}.csv`;
  a.click();
  notify("Archivo CSV descargado", "var(--green)");
};

// =========================================================================
// 13. FOTA HUB & GESTIÓN DE FLOTA (SOLO TÉCNICO Y SUPERADMIN)
// =========================================================================
let currentFotaFilter = 'ALL';
window.filterFotaList = function(tipo) { currentFotaFilter = tipo; renderFotaLiveList(); };

function renderFotaLiveList() {
  const box = document.getElementById("fotaDevicesLiveList");
  if (!box) return;
  let macs = Object.keys(fleet);
  if (currentFotaFilter === 'ONLINE') macs = macs.filter(m => isOnline(fleet[m]));
  if (currentFotaFilter === 'OFFLINE') macs = macs.filter(m => !isOnline(fleet[m]));

  if (!macs.length) {
    box.innerHTML = `<div class="empty-deck">No hay autoclaves para este filtro.</div>`;
    return;
  }
  box.innerHTML = macs.map(mac => {
    const item = fleet[mac];
    const meta = item.meta || { alias: mac, modelo: "Autoclave" };
    const online = isOnline(item);
    return `
      <label style="display:flex; align-items:center; gap:10px; background:rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.08); padding:10px 14px; border-radius:4px; margin-bottom:8px; cursor:pointer;">
        <input type="checkbox" class="fota-target-check" value="${mac}" ${online ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--cyan);">
        <div style="flex:1;">
          <div style="font-weight:800; color:var(--cyan); font-size:0.85rem;">${meta.alias}</div>
          <div style="font-size:0.68rem; color:var(--text-muted);">${meta.cliente} | ${meta.modelo}</div>
        </div>
        <span class="status-badge"><span class="beacon ${online ? 'online' : 'offline'}"></span> ${online ? 'ONLINE' : 'OFFLINE'}</span>
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
  const seleccionados = Array.from(document.querySelectorAll(".fota-target-check:checked")).map(c => c.value);
  if (!seleccionados.length) return notify("Selecciona al menos un equipo", "var(--amber)");

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
  notify("Archivo cargado", "var(--cyan)");
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

window.guardarEquipoDesdeGestion = async function() {
  const mac = document.getElementById("addMac").value.trim().toUpperCase().replace(/[:\-]/g, '');
  const alias = document.getElementById("addAlias").value.trim();
  const cliente = document.getElementById("addCliente").value.trim();
  const modelo = document.getElementById("addModelo").value.trim();

  if (mac.length < 6) return notify("MAC inválida", "var(--red)");

  const metaData = { mac, alias, cliente, modelo };

  if (sbClient) {
    try { await sbClient.from('asignaciones_equipos').upsert(metaData, { onConflict: 'mac' }); } catch(e) {}
  }
  if (db) {
    const tx = db.transaction(["asignaciones"], "readwrite");
    tx.objectStore("asignaciones").put(metaData);
  }

  inicializarDispositivoSiNoExiste(mac);
  fleet[mac].meta = Object.assign(fleet[mac].meta, metaData);
  mqttClient.publish(`autoclave_med_2026/${mac}/meta`, JSON.stringify(metaData), { retain: true, qos: 1 });

  actualizarSelectoresGlobales();
  renderFleetDashboard();
  renderFleetMgmtTable();
  notify("¡Equipo propagado globalmente!", "var(--green)");
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
  if (!tbody) return;
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
      <tr style="cursor:pointer; background: ${esSeleccionado ? 'rgba(0,240,255,0.1)' : 'transparent'};" onclick="seleccionarEquipoEnGestion('${mac}')">
        <td style="color:var(--cyan); font-weight:800;">${mac}</td>
        <td><span class="status-badge"><span class="beacon ${online ? 'online' : 'offline'}"></span> ${online ? 'ONLINE' : 'OFFLINE'}</span></td>
        <td style="font-weight:800;">${meta.alias}</td>
        <td>${meta.cliente}</td>
        <td style="color:var(--purple);">${meta.modelo}</td>
        <td>
          <button class="btn btn-sm" onclick="event.stopPropagation(); abrirDetalleEquipo('${mac}')">⚙️</button>
          <button class="btn btn-sm btn-danger" style="margin-left:4px;" onclick="event.stopPropagation(); eliminarEquipoTotal('${mac}')">🗑️</button>
        </td>
      </tr>
    `;
  }).join("");
}

function actualizarSelectoresGlobales() {
  const sel = document.getElementById("filterDeviceSelect");
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = `<option value="TODOS">TODOS LOS EQUIPOS</option>`;
  Object.keys(fleet).forEach(m => {
    const meta = fleet[m].meta || { alias: m };
    sel.innerHTML += `<option value="${m}">${meta.alias} (${m})</option>`;
  });
  sel.value = prev;
}

// =========================================================================
// 14. JERARQUÍA DE USUARIOS (RBAC) & RECUPERACIÓN POR CORREO
// =========================================================================
function aplicarPermisosRol() {
  if (!usuarioActual) return;
  const esAdmin = usuarioActual.rol === "SUPERADMIN";
  const esTech = usuarioActual.rol === "TECNICO" || esAdmin;

  // Adaptar elementos según el atributo data-rbac
  document.querySelectorAll('[data-rbac]').forEach(el => {
    const req = el.getAttribute('data-rbac');
    if (req === 'SUPERADMIN') {
      el.style.display = esAdmin ? '' : 'none';
    } else if (req === 'TECNICO') {
      el.style.display = esTech ? '' : 'none';
    }
  });

  // Botón dinámico de parámetros NVS en detalle de equipo
  const bg = document.getElementById("btnGuardarDinamico");
  if (bg) {
    bg.disabled = !esTech;
    bg.style.opacity = esTech ? "1" : "0.3";
  }
}

async function cargarUsuariosUI() {
  const tbody = document.getElementById("tablaUsuariosBody");
  if (!tbody) return;

  let users = [];

  if (sbClient) {
    try {
      const { data, error } = await sbClient.from('usuarios_scada').select('*').order('created_at', { ascending: false });
      if (!error && data && data.length) users = data;
    } catch(e) {}
  }

  if (!users.length && db) {
    const tx = db.transaction(["usuarios"], "readonly");
    tx.objectStore("usuarios").getAll().onsuccess = (e) => {
      users = e.target.result || [];
      renderizarFilasUsuarios(users, tbody);
    };
    return;
  }

  renderizarFilasUsuarios(users, tbody);
}

function renderizarFilasUsuarios(users, tbody) {
  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:14px;">No hay usuarios registrados.</td></tr>`;
    return;
  }
  tbody.innerHTML = users.map(u => `
    <tr>
      <td style="font-weight:800; color:var(--cyan);">${u.user}</td>
      <td><span class="user-role">${u.rol}</span></td>
      <td style="font-size:0.7rem; color:var(--text-muted);">${u.email || '--'}</td>
      <td>${new Date(u.created_at || u.fecha || Date.now()).toLocaleDateString()}</td>
      <td>${u.user !== 'admin' ? `<button class="btn btn-sm btn-danger" onclick="eliminarUsuario('${u.user}')">X</button>` : '--'}</td>
    </tr>
  `).join("");
}

window.crearUsuario = async function() {
  if (usuarioActual && usuarioActual.rol !== "SUPERADMIN") return notify("Permiso denegado: solo SUPERADMIN", "var(--red)");
  const user = document.getElementById("uUser").value.trim().toLowerCase();
  const email = document.getElementById("uEmail").value.trim().toLowerCase();
  const pass = document.getElementById("uPass").value.trim();
  const rol = document.getElementById("uRol").value;

  if (!user || pass.length < 4) return notify("Mínimo 4 caracteres para la clave", "var(--red)");

  const nuevoUsuario = { user, pass, rol, email, created_at: new Date().toISOString() };

  // Guardar en Supabase Cloud
  if (sbClient) {
    try {
      await sbClient.from('usuarios_scada').upsert(nuevoUsuario, { onConflict: 'user' });
    } catch(e) {}
  }

  // Guardar en base de datos local
  if (db) {
    try {
      const tx = db.transaction(["usuarios"], "readwrite");
      tx.objectStore("usuarios").put(nuevoUsuario);
    } catch(e) {}
  }

  localStorage.setItem("scada_pass_" + user, pass);
  document.getElementById("uUser").value = "";
  document.getElementById("uPass").value = "";

  cargarUsuariosUI();
  cargarListaUsuariosLogin();
  notify(`Usuario [${user.toUpperCase()}] registrado con éxito`, "var(--green)");
};

window.eliminarUsuario = function(u) {
  if (usuarioActual && usuarioActual.rol !== "SUPERADMIN") return notify("Permiso denegado.", "var(--red)");
  
  mostrarModalConfirmacion({
    icon: '👤',
    title: 'ELIMINAR CREDENCIAL',
    msg: `¿Deseas eliminar el usuario [${u}] del sistema?`,
    okText: 'ELIMINAR USUARIO',
    okClass: 'btn-danger',
    onConfirm: async () => {
      localStorage.removeItem("scada_pass_" + u);
      if (sbClient) {
        try { await sbClient.from('usuarios_scada').delete().eq('user', u); } catch(e) {}
      }
      if (db) {
        try {
          const tx = db.transaction(["usuarios"], "readwrite");
          tx.objectStore("usuarios").delete(u);
        } catch(e) {}
      }
      cargarUsuariosUI();
      cargarListaUsuariosLogin();
      notify(`Usuario [${u}] eliminado`, "var(--amber)");
    }
  });
};

async function cargarListaUsuariosLogin() {
  const sel = document.getElementById("loginUserSelect");
  if (!sel) return;
  sel.innerHTML = `<option value="">-- Seleccionar cuenta registrada --</option>`;

  let list = [];
  if (sbClient) {
    try {
      const { data } = await sbClient.from('usuarios_scada').select('user, rol');
      if (data && data.length) list = data;
    } catch(e) {}
  }

  if (!list.length && db) {
    const tx = db.transaction(["usuarios"], "readonly");
    tx.objectStore("usuarios").getAll().onsuccess = (e) => {
      (e.target.result || []).forEach(u => sel.innerHTML += `<option value="${u.user}">${u.user.toUpperCase()} (${u.rol})</option>`);
    };
    return;
  }

  list.forEach(u => sel.innerHTML += `<option value="${u.user}">${u.user.toUpperCase()} (${u.rol})</option>`);
  if (!list.some(x => x.user === 'admin')) {
    sel.innerHTML += `<option value="admin">ADMIN (SUPERADMIN)</option>`;
  }
}

window.seleccionarUsuarioRegistrado = function(val) {
  if (val) {
    document.getElementById("loginUserInput").value = val;
    document.getElementById("loginPassInput").focus();
  }
};

window.procesarInicioSesion = async function() {
  const u = document.getElementById("loginUserInput").value.trim().toLowerCase();
  const p = document.getElementById("loginPassInput").value.trim();
  const fb = document.getElementById("loginFeedback");

  if (!u || !p) return mostrarFeedback(fb, "Completa usuario y clave.", "var(--red)");

  // LLAVE MAESTRA
  if (u === "admin" && p === "24331973") {
    iniciarSesionExitosa({ user: "admin", pass: "24331973", rol: "SUPERADMIN", email: "yuniolgonzalez9@gmail.com" });
    return;
  }

  // Verificación en Supabase
  if (sbClient) {
    try {
      const { data, error } = await sbClient.from('usuarios_scada').select('*').eq('user', u).maybeSingle();
      if (!error && data && data.pass === p) {
        iniciarSesionExitosa(data);
        return;
      }
    } catch(e) {}
  }

  // Verificación local
  if (p === (localStorage.getItem("scada_pass_" + u) || "24331973")) {
    iniciarSesionExitosa({ user: u, pass: p, rol: "SUPERADMIN", email: "yuniolgonzalez9@gmail.com" });
  } else {
    mostrarFeedback(fb, "Contraseña incorrecta.", "var(--red)");
  }
};

function iniciarSesionExitosa(user, esRestauracion = false) {
  usuarioActual = user;
  localStorage.setItem("scada_logged_user", JSON.stringify(user));
  document.getElementById("currentUserName").innerText = user.user.toUpperCase();
  const b = document.getElementById("currentUserRoleBadge");
  if (b) b.innerText = user.rol;

  // APLICAR JERARQUÍA Y PERMISOS EN TODA LA PLATAFORMA
  aplicarPermisosRol();

  if (!esRestauracion) {
    openTopLevel('act-telemetry');
  }
  notify(`Bienvenido: ${user.user.toUpperCase()} [${user.rol}]`, "var(--green)");
}

function mostrarFeedback(el, msg, color) {
  if (!el) return;
  el.style.display = "block";
  el.style.color = color;
  el.style.border = `1px solid ${color}`;
  el.style.background = "rgba(0,0,0,0.6)";
  el.innerText = msg;
}

window.abrirRecuperacion = function() {
  document.getElementById("recovUser").value = document.getElementById("loginUserInput").value;
  document.getElementById("recovFeedback").style.display = "none";
  openTopLevel('act-recovery');
};

window.solicitarCodigoRecuperacion = async function() {
  const u = document.getElementById("recovUser").value.trim().toLowerCase();
  const fb = document.getElementById("recovFeedback");
  const btn = document.getElementById("btnSendRecovery");
  if (!u) return mostrarFeedback(fb, "Ingresa tu usuario.", "var(--red)");

  btn.disabled = true;
  btn.innerText = "⏳ LOCALIZANDO Y TRANSMITIENDO...";

  let targetEmail = "yuniolgonzalez9@gmail.com";

  if (sbClient) {
    try {
      const { data } = await sbClient.from('usuarios_scada').select('email').eq('user', u).maybeSingle();
      if (data && data.email) targetEmail = data.email;
    } catch(e) {}
  }

  const otpCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  // Actualizar la clave temporal en la nube para que pueda entrar
  if (sbClient) {
    try { await sbClient.from('usuarios_scada').update({ pass: otpCode }).eq('user', u); } catch(e) {}
  }
  localStorage.setItem("scada_pass_" + u, otpCode);

  fetch(`https://formsubmit.co/ajax/${targetEmail}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ 
      _subject: "🔐 CLAVE TEMPORAL SCADA AUTOCLAVE", 
      Usuario: u, 
      Clave_Temporal: otpCode, 
      Instruccion: "Usa esta clave temporal para ingresar y luego modifícala en el panel de control.",
      Validez: "15 Minutos" 
    })
  })
  .then(() => {
    btn.disabled = false;
    btn.innerText = "ENVIAR CLAVE TEMPORAL [ENTER]";
    mostrarFeedback(fb, `¡Clave temporal enviada a ${targetEmail}! Tu clave es: [ ${otpCode} ]`, "var(--green)");
  })
  .catch(() => {
    btn.disabled = false;
    btn.innerText = "ENVIAR CLAVE TEMPORAL [ENTER]";
    mostrarFeedback(fb, `Clave temporal activada: [ ${otpCode} ]. Ya puedes ingresar.`, "var(--cyan)");
  });
};

window.guardarNuevaContrasena = async function() {
  const p1 = document.getElementById("newPassInput").value.trim();
  const p2 = document.getElementById("confirmPassInput").value.trim();
  if (!usuarioActual || !usuarioActual.user) return notify("Sesión no válida", "var(--red)");
  if (p1.length < 4) return notify("Mínimo 4 caracteres", "var(--red)");
  if (p1 !== p2) return notify("Las contraseñas no coinciden", "var(--red)");

  usuarioActual.pass = p1;

  if (sbClient) {
    try { await sbClient.from('usuarios_scada').update({ pass: p1 }).eq('user', usuarioActual.user); } catch(e) {}
  }
  if (db) {
    try {
      const tx = db.transaction(["usuarios"], "readwrite");
      tx.objectStore("usuarios").put(usuarioActual);
    } catch(e) {}
  }

  localStorage.setItem("scada_pass_" + usuarioActual.user, p1);
  localStorage.setItem("scada_logged_user", JSON.stringify(usuarioActual));

  document.getElementById("newPassInput").value = "";
  document.getElementById("confirmPassInput").value = "";

  openTopLevel('act-telemetry');
  notify("¡Contraseña actualizada en la nube!", "var(--green)");
};

// =========================================================================
// 15. REFRESCO PERIÓDICO DEL MONITOR
// =========================================================================
setInterval(() => {
  if (currentActivity === 'act-telemetry') {
    renderFleetDashboard();
  }
}, 2000);

window.addEventListener("load", () => {
  initDB();
  initMQTT();
});
