// =========================================================================
// 1. SUPABASE CLOUD (BASE DE DATOS 24/7)
// =========================================================================
const SUPABASE_URL = "https://gjtqyodpgwfvfvkhlhik.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqdHF5b2RwZ3dmdmZ2a2hsaGlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNDAzNTYsImV4cCI6MjEwNTYxNjM1Nn0.g8t_PbEityaneKkOUHttQ_cZv50aczLU4Z9la8R4d_g";

const sbClient = (window.supabase && window.supabase.createClient) 
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) 
  : null;

// =========================================================================
// 2. ENRUTADOR NATIVO TIPO APP
// =========================================================================
let currentTopLevel = 'act-telemetry';
let currentActivity = 'act-login';
let currentInspectedMAC = null;
let currentDetailSubTab = 'tab-det-tele';
let currentViewingReport = null;
let currentHealthFilter = 'ONLINE'; // Por defecto solo muestra 100% ONLINE (Sin mezclas)
let usuarioActual = null;
let ultimoToqueAtras = 0;

window.openTopLevel = function(secId) {
  currentTopLevel = secId;
  currentInspectedMAC = null;
  history.replaceState({ type: 'top', secId: secId }, '', '#' + secId);
  renderScreen(secId);
  guardarRutaNavegacion();
};

window.openActivity = function(actId) {
  if (currentActivity !== actId) {
    history.pushState({ type: 'child', actId: actId, parent: currentTopLevel }, '', '#' + actId);
    renderScreen(actId);
    guardarRutaNavegacion();
  }
};

window.goBackActivity = function() {
  history.back();
};

window.addEventListener('popstate', () => {
  if (!usuarioActual) {
    renderScreen('act-login');
    return;
  }

  if (currentActivity === 'act-device-detail' || currentActivity === 'act-report-view') {
    currentInspectedMAC = null;
    renderScreen(currentTopLevel);
    guardarRutaNavegacion();
    return;
  }

  const ahora = Date.now();
  if (ahora - ultimoToqueAtras < 2500) {
    // Permitir retroceso
  } else {
    ultimoToqueAtras = ahora;
    history.pushState({ type: 'top', secId: currentTopLevel }, '', '#' + currentTopLevel);
    notify("⚠️ Presiona atrás una vez más para salir del SCADA", "var(--amber)");
  }
});

function renderScreen(screenId) {
  currentActivity = screenId;
  const esPublico = (screenId === 'act-login' || screenId === 'act-recovery');

  const topBar = document.getElementById('topAppBar');
  const dNav = document.getElementById('desktopNavBar');
  const mNav = document.getElementById('mobileBottomNav');
  const backBtn = document.getElementById('btnGlobalBack');

  if (topBar) topBar.style.display = esPublico ? 'none' : 'flex';
  if (dNav) dNav.style.display = esPublico ? 'none' : 'flex';
  if (mNav) mNav.style.display = esPublico ? 'none' : 'flex';

  const esPantallaHija = (screenId === 'act-device-detail' || screenId === 'act-report-view');
  if (backBtn) backBtn.style.display = esPantallaHija ? 'inline-flex' : 'none';

  document.querySelectorAll('.activity').forEach(a => a.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) target.classList.add('active');

  if (!esPublico && !esPantallaHija) {
    document.querySelectorAll('.nav-tab, .m-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-tab') === screenId);
    });
  }

  if (screenId === 'act-fota') renderFotaLiveList();
  if (screenId === 'act-fleet-mgmt') renderFleetMgmtTable();
  if (screenId === 'act-reports') renderizarRegistros();
}

function guardarRutaNavegacion() {
  if (usuarioActual) {
    localStorage.setItem("scada_nav_route_v4", JSON.stringify({
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
  t.timer = setTimeout(() => { t.style.display = "none"; }, 2200);
}

// =========================================================================
// 3. MENÚ ENGRANAJE ⚙️ Y PANTALLA COMPLETA
// =========================================================================
window.toggleGearMenu = function(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById("gearDropdownMenu");
  if (menu) {
    menu.style.display = (menu.style.display === "block") ? "none" : "block";
  }
};

window.closeGearMenu = function() {
  const menu = document.getElementById("gearDropdownMenu");
  if (menu) menu.style.display = "none";
};

document.addEventListener("click", () => {
  closeGearMenu();
});

window.refrescarSistemaCompleto = function() {
  cargarEquiposGuardados();
  renderFleetDashboard();
  if (activityStack[activityStack.length - 1] === 'act-reports') renderizarRegistros();
  notify("⚡ Datos sincronizados al milisegundo", "var(--green)");
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

// =========================================================================
// 4. BASE DE DATOS LOCAL Y SESIÓN PERSISTENTE
// =========================================================================
let db = null;
const fleet = {};
const sesionesActivas = {};

function initDB() {
  return new Promise((resolve) => {
    localStorage.setItem("scada_pass_admin", "24331973");

    const req = indexedDB.open("AutoclaveFastFleetDB_v22", 1);
    req.onupgradeneeded = (e) => {
      db = e.target.result;
      if (!db.objectStoreNames.contains("asignaciones")) db.createObjectStore("asignaciones", { keyPath: "mac" });
      if (!db.objectStoreNames.contains("usuarios")) db.createObjectStore("usuarios", { keyPath: "user" });
      if (!db.objectStoreNames.contains("reportes_sesiones")) {
        const sr = db.createObjectStore("reportes_sesiones", { keyPath: "id", autoIncrement: true });
        sr.createIndex("mac", "mac", { unique: false });
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

function verificarSesionPersistente() {
  const sesionGuardada = localStorage.getItem("scada_logged_user");
  if (sesionGuardada) {
    try {
      const userObj = JSON.parse(sesionGuardada);
      iniciarSesionExitosa(userObj, true);

      const route = JSON.parse(localStorage.getItem("scada_nav_route_v4") || "null");
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
// 5. MQTT HIVEMQ CLOUD (PUERTO WSS 8884)
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
    if (dot) dot.className = "beacon online"; // Pulso verde animado activo
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
      ultimaFase: null,
      _pendingLock: {},
      meta: {
        alias: `AUTOCLAVE [${mac.substring(Math.max(0, mac.length - 4))}]`,
        cliente: "SIN REGISTRAR",
        modelo: "AUTODETECTADO",
        ciclosCompletados: 0,
        limiteMantenimiento: 200
      }
    };
    cargarEquiposGuardados();
  }
}

function procesarMetaGlobal(mac, metaData) {
  inicializarDispositivoSiNoExiste(mac);
  fleet[mac].meta = Object.assign(fleet[mac].meta, metaData);
  actualizarCardDashboard(mac);
  actualizarSelectoresGlobales();
  renderFleetMgmtTable();
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

  fleet[mac].datos = data;
  actualizarCardDashboard(mac);
  if (currentInspectedMAC === mac) actualizarPantallaDetalleDinamica();
}

function procesarEsquemaReal(mac, data) {
  inicializarDispositivoSiNoExiste(mac);
  fleet[mac].esquema = data;
  fleet[mac].fw = data.fw || "v3.2";
  if (data.modelo && fleet[mac].meta.modelo === "AUTODETECTADO") {
    fleet[mac].meta.modelo = data.modelo;
  }
  if (currentInspectedMAC === mac) generarUIEsquemaDinamico(mac);
  renderFleetDashboard();
}

// CÁLCULO DE SALUD Y CALIDAD DE RED
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
// 6. MONITOR DE FLOTA SEGMENTADO (CERO MANGÚ)
// =========================================================================
window.setFleetHealthFilter = function(filterType) {
  currentHealthFilter = filterType;
  document.querySelectorAll(".btn-filter").forEach(b => b.classList.remove("active"));
  
  if (filterType === 'ONLINE') document.getElementById("filterBtnOnline")?.classList.add("active");
  if (filterType === 'LATENCY') document.getElementById("filterBtnLatency")?.classList.add("active");
  if (filterType === 'OFFLINE') document.getElementById("filterBtnOffline")?.classList.add("active");
  if (filterType === 'ALL') document.getElementById("filterBtnAll")?.classList.add("active");

  renderFleetDashboard();
};

function renderFleetDashboard() {
  const container = document.getElementById("fleetLiveContainer");
  if (!container) return;
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

  if (!filteredKeys.length) {
    container.innerHTML = `<div class="empty-deck">NO HAY AUTOCLAVES EN EL APARTADO [${currentHealthFilter}].</div>`;
    return;
  }

  container.innerHTML = '';
  filteredKeys.forEach(mac => {
    const card = document.createElement('div');
    card.id = `card-${mac}`;
    card.className = 'node-item';
    card.setAttribute('onclick', `abrirDetalleEquipo('${mac}')`);
    container.appendChild(card);
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
// 7. CONTROL TOTAL Y NVS (SINCRONIZACIÓN EN MILISEGUNDOS)
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
  currentDetailSubTab = tabId;
  document.querySelectorAll('.detail-subview').forEach(s => s.style.display = 'none');
  document.querySelectorAll('.subtab-slider .btn').forEach(b => b.classList.remove('active'));

  const el = document.getElementById(tabId);
  if (el) el.style.display = 'block';

  if (tabId === 'tab-det-tele') document.getElementById('btnSubTele')?.classList.add('active');
  if (tabId === 'tab-det-cfg') document.getElementById('btnSubCfg')?.classList.add('active');
  if (tabId === 'tab-det-ficha') document.getElementById('btnSubFicha')?.classList.add('active');
  if (tabId === 'tab-det-logs') document.getElementById('btnSubLogs')?.classList.add('active');
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
                <input type="number" step="${campo.step || 0.1}" min="${campo.min || 0}" max="${campo.max || 999}" class="input-field dyn-input-field" data-key="${campo.key}" value="${valorActual}" onkeydown="if(event.key==='Enter'){event.preventDefault(); guardarParametrosDinamicos();}">
              </div>
            `;
          }
        }).join("")}
      </div>
    `).join("");
  } else {
    containerMenus.innerHTML = `<div class="empty-deck">Esperando capacidades del dispositivo...</div>`;
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
    if (txt) txt.innerText = d.alarma_msg || "Alarma activa";
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
  if (usuarioActual && usuarioActual.rol === "OPERADOR") return notify("Permiso denegado", "var(--red)");

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
  notify(`Comando: ${cmd}`, "var(--cyan)");
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
  notify("Ficha sincronizada globalmente", "var(--green)");
};

function cargarLogsDetalle(mac) {
  const tbody = document.getElementById("detLogsTbody");
  if (!tbody || !db) return;
  const tx = db.transaction(["reportes_sesiones"], "readonly");
  tx.objectStore("reportes_sesiones").getAll().onsuccess = (e) => {
    const logs = (e.target.result || []).filter(x => x.mac === mac).reverse();
    if (!logs.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Sin sesiones registradas.</td></tr>`;
      return;
    }
    tbody.innerHTML = logs.map(s => `
      <tr>
        <td style="color:var(--cyan); font-weight:700;">${new Date(s.fecha).toLocaleDateString()} ${s.horaEncendido}</td>
        <td><span class="user-role">${s.diagnosticoPrincipal || s.faseFinal}</span></td>
        <td>${s.ciclosAcumulados} / ${s.limiteMantenimiento}</td>
        <td><span style="color:${s.ciclosAcumulados >= s.limiteMantenimiento ? 'var(--red)' : 'var(--green)'}; font-weight:700;">${s.ciclosAcumulados >= s.limiteMantenimiento ? 'VENCIDO' : 'OK'}</span></td>
        <td>T:${s.tempMax.toFixed(1)}°C | P:${s.presMax.toFixed(2)}b</td>
        <td><button class="btn btn-sm" onclick="verPaqueteSesion('${s.sessionId}')">👁️</button></td>
      </tr>
    `).join("");
  };
}

// =========================================================================
// 8. REPORTES & SUPABASE CLOUD
// =========================================================================
let reportesCache = [];

async function renderizarRegistros() {
  const devFilter = document.getElementById("filterDeviceSelect")?.value || "TODOS";
  const fType = document.getElementById("filterType")?.value || "TODOS";
  const fDesde = document.getElementById("filterFechaDesde")?.value;
  const fHasta = document.getElementById("filterFechaHasta")?.value;
  const fText = document.getElementById("filterInput")?.value.toUpperCase() || "";
  const tbody = document.getElementById("auditTableBody");
  if (!tbody) return;

  let items = [];

  if (sbClient) {
    try {
      const { data, error } = await sbClient
        .from('reportes_autoclaves')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length) {
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
            eventos: r.eventos || [],
            esOffline: r.es_offline || false
          };
        });
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

function pintarTablaReportes(items, devFilter, fType, fDesde, fHasta, fText, tbody) {
  reportesCache = items;

  document.getElementById("kpiTotalSesiones").innerText = items.length;
  const totalCiclos = items.reduce((acc, cur) => acc + (cur.ciclosAcumulados || 0), 0);
  document.getElementById("kpiTotalCiclos").innerText = totalCiclos;
  const mantAlerts = items.filter(x => (x.ciclosAcumulados || 0) >= (x.limiteMantenimiento || 200) * 0.8).length;
  document.getElementById("kpiMantenimientoAlerta").innerText = mantAlerts;
  const totalAlarmas = items.filter(x => x.conteoAlarmas > 0).length;
  document.getElementById("kpiTotalAlarmas").innerText = totalAlarmas;

  if (devFilter !== "TODOS") items = items.filter(x => x.mac === devFilter);
  if (fType === "CICLO_OK") items = items.filter(x => x.diagnosticoPrincipal && x.diagnosticoPrincipal.includes("CONFORME"));
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
      x.modelo.toUpperCase().includes(fText) ||
      (x.diagnosticoPrincipal && x.diagnosticoPrincipal.toUpperCase().includes(fText))
    );
  }

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:30px;">No hay reportes disponibles.</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(s => {
    const ciclos = s.ciclosAcumulados || 0;
    const limite = s.limiteMantenimiento || 200;
    const pct = Math.min(100, Math.round((ciclos / limite) * 100));

    return `
      <tr>
        <td style="text-align:center;"><input type="checkbox" class="check-report-item" value="${s.id}" data-session="${s.sessionId}" style="width:18px; height:18px; accent-color:var(--cyan);"></td>
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
          <div>${ciclos} de ${limite} (${pct}%)</div>
          <div class="health-bar"><div class="health-fill ${pct>=100?'danger':pct>=80?'warn':''}" style="width:${pct}%;"></div></div>
        </td>
        <td>T:${(s.tempMax||0).toFixed(1)}°C<br>P:${(s.presMax||0).toFixed(2)}b</td>
        <td>
          <span class="user-role" style="color:${s.conteoAlarmas > 0 ? 'var(--red)' : (s.diagnosticoPrincipal && s.diagnosticoPrincipal.includes('CONFORME')) ? 'var(--green)' : 'var(--cyan)'};">
            ${s.diagnosticoPrincipal || 'EN REPOSO'}
          </span>
        </td>
        <td>
          <div style="display:flex; gap:4px;">
            <button class="btn btn-sm" onclick="verPaqueteSesion('${s.sessionId}')">👁️</button>
            <button class="btn btn-sm btn-danger" style="padding:4px 8px;" onclick="eliminarReporteIndividual('${s.sessionId}')">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
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
    <p>FECHA / SESIÓN: ${new Date(s.fecha).toLocaleDateString()} | Encendido: ${s.horaEncendido} - Cierre: ${s.horaApagado}</p>
    <table>
      <tr><th>PARÁMETRO</th><th>VALOR REGISTRADO</th></tr>
      <tr><td>Temperatura Máxima Registrada</td><td>${s.tempMax.toFixed(1)} °C</td></tr>
      <tr><td>Presión Máxima Alcanzada</td><td>${s.presMax.toFixed(2)} Bar</td></tr>
      <tr><td>Ciclos Acumulados del Equipo</td><td>${s.ciclosAcumulados} / ${s.limiteMantenimiento}</td></tr>
      <tr><td>Diagnóstico de Validación</td><td><b>${s.diagnosticoPrincipal || s.faseFinal}</b></td></tr>
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

window.eliminarReporteIndividual = async function(sessionId) {
  if (usuarioActual && usuarioActual.rol === "OPERADOR") return notify("Permiso denegado.", "var(--red)");
  if (sbClient) {
    try { await sbClient.from('reportes_autoclaves').delete().eq('session_id', sessionId); } catch(e) {}
  }
  renderizarRegistros();
  notify("Reporte eliminado de la nube", "var(--amber)");
};

window.eliminarReportesSeleccionados = async function() {
  if (usuarioActual && usuarioActual.rol === "OPERADOR") return notify("Permiso denegado.", "var(--red)");
  const seleccionados = Array.from(document.querySelectorAll(".check-report-item:checked")).map(c => c.getAttribute("data-session"));
  if (!seleccionados.length) return notify("Marca al menos un reporte", "var(--amber)");

  if (sbClient) {
    try { await sbClient.from('reportes_autoclaves').delete().in('session_id', seleccionados); } catch(e) {}
  }
  renderizarRegistros();
  notify(`🗑️ ${seleccionados.length} reportes eliminados`, "var(--amber)");
};

window.confirmarVaciarDB = async function() {
  if (usuarioActual && usuarioActual.rol !== "SUPERADMIN") return notify("Permiso denegado: solo SuperAdmin", "var(--red)");
  if (sbClient) {
    try { await sbClient.from('reportes_autoclaves').delete().neq('mac', 'NONE'); } catch(e) {}
  }
  renderizarRegistros();
  notify("Auditoría vaciada por completo", "var(--red)");
};

window.exportarRegistrosCSV = function() {
  const data = reportesCache || [];
  if (!data.length) return notify("Sin datos para exportar", "var(--amber)");
  let csv = "ID_SESION,FECHA,MAC,ALIAS,CLIENTE,MODELO,HORA_ON,HORA_OFF,CICLOS,LIMITE_MANT,T_MAX,P_MAX,DIAGNOSTICO\n";
  data.forEach(d => {
    csv += `"${d.sessionId}","${d.fecha}","${d.mac}","${d.alias}","${d.cliente}","${d.modelo}","${d.horaEncendido}","${d.horaApagado}","${d.ciclosAcumulados}","${d.limiteMantenimiento}","${d.tempMax}","${d.presMax}","${d.diagnosticoPrincipal||d.faseFinal}"\n`;
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `reporte_sesiones_${Date.now()}.csv`;
  a.click();
  notify("Archivo CSV descargado", "var(--green)");
};

// =========================================================================
// 9. FOTA HUB & GESTIÓN DIRECTA
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
  notify("¡Equipo actualizado globalmente!", "var(--green)");
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
// 10. USUARIOS & AUTENTICACIÓN
// =========================================================================
function cargarUsuariosUI() {
  if (!db) return;
  const tx = db.transaction(["usuarios"], "readonly");
  tx.objectStore("usuarios").getAll().onsuccess = (e) => {
    const users = e.target.result || [];
    const tbody = document.getElementById("tablaUsuariosBody");
    if (!tbody) return;
    tbody.innerHTML = users.map(u => `
      <tr>
        <td style="font-weight:800; color:var(--cyan);">${u.user}</td>
        <td><span class="user-role">${u.rol}</span></td>
        <td>${new Date(u.fecha).toLocaleDateString()}</td>
        <td>${u.user !== 'admin' ? `<button class="btn btn-sm btn-danger" onclick="eliminarUsuario('${u.user}')">X</button>` : '--'}</td>
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
  if (db) {
    const tx = db.transaction(["usuarios"], "readwrite");
    tx.objectStore("usuarios").add({ user, pass, rol, email: "yuniolgonzalez9@gmail.com", otp: null, otpExpires: 0, otpUsado: false, fecha: new Date().toISOString() });
  }

  document.getElementById("uUser").value = "";
  document.getElementById("uPass").value = "";
  cargarUsuariosUI();
  cargarListaUsuariosLogin();
  notify("Usuario creado", "var(--green)");
};

window.eliminarUsuario = function(u) {
  localStorage.removeItem("scada_pass_" + u);
  if (db) {
    const tx = db.transaction(["usuarios"], "readwrite");
    tx.objectStore("usuarios").delete(u);
  }
  cargarUsuariosUI();
  cargarListaUsuariosLogin();
  notify("Usuario eliminado", "var(--amber)");
};

function cargarListaUsuariosLogin() {
  const sel = document.getElementById("loginUserSelect");
  if (!sel) return;
  sel.innerHTML = `<option value="">-- Seleccionar cuenta --</option>`;
  if (db) {
    const tx = db.transaction(["usuarios"], "readonly");
    tx.objectStore("usuarios").getAll().onsuccess = (e) => {
      (e.target.result || []).forEach(u => sel.innerHTML += `<option value="${u.user}">${u.user.toUpperCase()} (${u.rol})</option>`);
    };
  } else {
    sel.innerHTML += `<option value="admin">ADMIN (SUPERADMIN)</option>`;
  }
}

window.seleccionarUsuarioRegistrado = function(val) {
  if (val) {
    document.getElementById("loginUserInput").value = val;
    document.getElementById("loginPassInput").focus();
  }
};

window.procesarInicioSesion = function() {
  const u = document.getElementById("loginUserInput").value.trim().toLowerCase();
  const p = document.getElementById("loginPassInput").value.trim();
  const fb = document.getElementById("loginFeedback");

  if (!u || !p) return mostrarFeedback(fb, "Completa usuario y contraseña.", "var(--red)");

  if (u === "admin" && p === "24331973") {
    localStorage.setItem("scada_pass_admin", "24331973");
    iniciarSesionExitosa({ user: "admin", pass: "24331973", rol: "SUPERADMIN" });
    return;
  }

  if (p === (localStorage.getItem("scada_pass_" + u) || "24331973")) {
    iniciarSesionExitosa({ user: u, pass: p, rol: "SUPERADMIN" });
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

  aplicarPermisosRol();

  if (!esRestauracion) {
    openTopLevel('act-telemetry');
  }
  notify(`Bienvenido, ${user.user.toUpperCase()}`, "var(--green)");
}

function aplicarPermisosRol() {
  const esAdmin = usuarioActual && usuarioActual.rol === "SUPERADMIN";
  const esTech = usuarioActual && (usuarioActual.rol === "TECNICO" || esAdmin);

  const tabUsers = document.getElementById("tabNavUsers");
  if (tabUsers) tabUsers.style.display = esAdmin ? "inline-flex" : "none";

  const tabMob = document.getElementById("tabMobileUsers");
  if (tabMob) tabMob.style.display = esAdmin ? "flex" : "none";

  const btnVaciar = document.getElementById("btnVaciarLogs");
  const btnFota = document.getElementById("btnExecuteFota");
  const bg = document.getElementById("btnGuardarDinamico");

  if (btnVaciar) btnVaciar.style.display = esAdmin ? "inline-flex" : "none";
  if (btnFota) { btnFota.disabled = !esTech; btnFota.style.opacity = esTech ? "1" : "0.4"; }
  if (bg) { bg.disabled = !esTech; bg.style.opacity = esTech ? "1" : "0.4"; }
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

window.solicitarCodigoRecuperacion = function() {
  const u = document.getElementById("recovUser").value.trim().toLowerCase();
  const fb = document.getElementById("recovFeedback");
  const btn = document.getElementById("btnSendRecovery");
  if (!u) return mostrarFeedback(fb, "Ingresa el usuario.", "var(--red)");

  const otpCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  btn.disabled = true;
  btn.innerText = "⏳ ENVIANDO...";

  fetch("https://formsubmit.co/ajax/yuniolgonzalez9@gmail.com", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ _subject: "🔐 CLAVE TEMPORAL SCADA", Usuario: u, Codigo_Temporal: otpCode, Validez: "15 Minutos" })
  })
  .then(() => {
    btn.disabled = false;
    btn.innerText = "ENVIAR CLAVE TEMPORAL [ENTER]";
    mostrarFeedback(fb, `¡Código enviado a yuniolgonzalez9@gmail.com! Clave: [ ${otpCode} ]`, "var(--green)");
  })
  .catch(() => {
    btn.disabled = false;
    btn.innerText = "ENVIAR CLAVE TEMPORAL [ENTER]";
    mostrarFeedback(fb, `Código generado: [ ${otpCode} ]. Úsalo en el login.`, "var(--cyan)");
  });
};

window.guardarNuevaContrasena = function() {
  const p1 = document.getElementById("newPassInput").value.trim();
  const p2 = document.getElementById("confirmPassInput").value.trim();
  if (!usuarioActual || !usuarioActual.user) return notify("Sesión no válida", "var(--red)");
  if (p1.length < 4) return notify("Mínimo 4 caracteres", "var(--red)");
  if (p1 !== p2) return notify("Las contraseñas no coinciden", "var(--red)");

  localStorage.setItem("scada_pass_" + usuarioActual.user, p1);
  usuarioActual.pass = p1;
  localStorage.setItem("scada_logged_user", JSON.stringify(usuarioActual));
  iniciarSesionExitosa(usuarioActual);
  notify("¡Contraseña actualizada con éxito!", "var(--green)");
};

// Refresco periódico del monitor y estado de red
setInterval(() => {
  renderFleetDashboard();
  if (currentActivity === 'act-fota') renderFotaLiveList();
}, 1500);

window.addEventListener("load", () => {
  initDB();
  initMQTT();
});
