
// =========================================================================
// 1. CONEXIÓN CLOUD SUPABASE & REALTIME (NUBE CENTRAL 24/7 EN VERCEL)
// =========================================================================
const SUPABASE_URL = "https://gjtqyodpgwfvfvkhlhik.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqdHF5b2RwZ3dmdmZ2a2hsaGlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNDAzNTYsImV4cCI6MjEwNTYxNjM1Nn0.g8t_PbEityaneKkOUHttQ_cZv50aczLU4Z9la8R4d_g";

const sbClient = (window.supabase && window.supabase.createClient) 
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) 
  : null;

// =========================================================================
// 2. ESTADO GLOBAL, SESIÓN SÍNCRONA Y VARIABLES
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
let audioCtx = null;
let modalConfirmCallback = null;

// CONTROL DE INACTIVIDAD INTELIGENTE (14 MIN ACTIVIDAD + 1 MIN CUENTA REGRESIVA = 15 MIN)
let idleTimer = null;
let countdownInterval = null;
const IDLE_LIMIT_MS = 14 * 60 * 1000;
let countdownSeconds = 60;

// RESTAURACIÓN SÍNCRONA DE SESIÓN
(function restaurarSesionSincrona() {
  const sesionGuardada = localStorage.getItem("scada_logged_user");
  if (sesionGuardada) {
    try {
      usuarioActual = JSON.parse(sesionGuardada);
    } catch(e) {
      usuarioActual = null;
    }
  }
})();

function estaAutenticado() {
  return !!usuarioActual && !!localStorage.getItem("scada_logged_user");
}

// Detector forense de terminal/dispositivo
function detectarDispositivo() {
  const ua = navigator.userAgent;
  let so = "Dispositivo Desconocido";
  if (ua.includes("Win")) so = "Windows PC";
  else if (ua.includes("Mac")) so = "macOS";
  else if (ua.includes("Android")) so = "Android Móvil";
  else if (ua.includes("iPhone") || ua.includes("iPad")) so = "iOS / iPhone";
  else if (ua.includes("Linux")) so = "Linux";

  let nav = "Web";
  if (ua.includes("Chrome") && !ua.includes("Edg")) nav = "Chrome";
  else if (ua.includes("Edg")) nav = "Edge";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) nav = "Safari";
  else if (ua.includes("Firefox")) nav = "Firefox";

  return `${so} (${nav})`;
}

// Registro forense en Supabase
async function registrarAuditoriaAcceso(usuario, rol, evento, detalles = '') {
  if (!sbClient) return;
  try {
    await sbClient.from('auditoria_accesos').insert([{
      usuario: usuario || 'ANÓNIMO',
      rol: rol || 'OPERADOR',
      evento: evento,
      dispositivo: detectarDispositivo(),
      detalles: detalles,
      created_at: new Date().toISOString()
    }]);
  } catch(e) {
    console.warn("Fallo registro auditoría:", e);
  }
}

// Utilidad clínica para formatear fechas limpias
function formatearFechaClinica(fechaRaw) {
  if (!fechaRaw) return new Date().toLocaleDateString();
  const d = new Date(fechaRaw);
  if (isNaN(d.getTime())) {
    if (typeof fechaRaw === 'string' && fechaRaw.includes('-')) {
      const parts = fechaRaw.split('T')[0].split('-');
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return String(fechaRaw);
  }
  return d.toLocaleDateString();
}

function calcularDuracionTexto(horaInicio, horaFin, segRegistrados = 0) {
  if (segRegistrados && segRegistrados > 0) {
    const m = Math.floor(segRegistrados / 60);
    const s = segRegistrados % 60;
    return `${m}m ${s}s`;
  }
  if (!horaInicio || !horaFin || horaInicio === '--' || horaFin === '--') return '--';
  try {
    const pI = horaInicio.split(':').map(Number);
    const pF = horaFin.split(':').map(Number);
    if (pI.length >= 2 && pF.length >= 2) {
      let sI = pI[0] * 3600 + pI[1] * 60 + (pI[2] || 0);
      let sF = pF[0] * 3600 + pF[1] * 60 + (pF[2] || 0);
      if (sF < sI) sF += 86400;
      const diff = sF - sI;
      const m = Math.floor(diff / 60);
      const s = diff % 60;
      return `${m}m ${s}s`;
    }
  } catch(e) {}
  return '--';
}

// =========================================================================
// 3. CONTROLADOR DE TRANSPARENCIA ULTRA-GLASS (0% A 100%)
// =========================================================================
window.ajustarTransparencia = function(valor) {
  const numVal = parseInt(valor, 10);
  const alpha = Math.max(0.0, Math.min(1.0, numVal / 100));

  document.documentElement.style.setProperty('--card-alpha', alpha.toFixed(2));
  localStorage.setItem("scada_transparency", numVal);

  const txt = document.getElementById("transparencyValTxt");
  if (txt) txt.innerText = `${numVal}%`;
};

function inicializarTransparenciaGuardada() {
  const guardada = localStorage.getItem("scada_transparency") || "82";
  const slider = document.getElementById("rangeTransparency");
  if (slider) slider.value = guardada;
  window.ajustarTransparencia(guardada);
}

// =========================================================================
// 4. DETECTOR DE CONECTIVIDAD EN TIEMPO REAL
// =========================================================================
window.addEventListener('online', () => {
  notify("🟢 Red restablecida. Sincronizando con Supabase...", "var(--green)");
  const dot = document.getElementById("syncDot");
  const txt = document.getElementById("syncStatusText");
  if (dot) dot.className = "beacon online";
  if (txt) txt.innerText = "NUBE CONECTADA";
  refrescarSistemaCompleto();
  if (mqttClient && !mqttClient.connected) {
    initMQTT();
  }
});

window.addEventListener('offline', () => {
  notify("🔴 Sin conexión de red. Modo local activo", "var(--red)");
  const dot = document.getElementById("syncDot");
  const txt = document.getElementById("syncStatusText");
  if (dot) dot.className = "beacon offline";
  if (txt) txt.innerText = "MODO LOCAL (SIN RED)";
});

// =========================================================================
// 5. MOTOR DE TEMAS ORIGINALES + MOTOR DE PAPEL TAPIZ
// =========================================================================
window.cambiarTema = function(nombreTema) {
  if (!['clinical', 'cyber', 'tactical', 'hybrid'].includes(nombreTema)) nombreTema = 'tactical';
  
  document.documentElement.setAttribute('data-theme', nombreTema);
  localStorage.setItem("scada_theme", nombreTema);

  document.querySelectorAll('#themeBtnClinical, #themeBtnHybrid, #themeBtnCyber, #themeBtnTactical').forEach(btn => btn.classList.remove('active'));
  const btnId = nombreTema === 'clinical' ? 'themeBtnClinical' : 
               (nombreTema === 'hybrid' ? 'themeBtnHybrid' : 
               (nombreTema === 'cyber' ? 'themeBtnCyber' : 'themeBtnTactical'));
  const btnActivo = document.getElementById(btnId);
  if (btnActivo) btnActivo.classList.add('active');

  notify(`🎨 Tema: ${nombreTema.toUpperCase()}`, "var(--cyan)");
};

window.cambiarFondo = function(nombreFondo) {
  const fondosValidos = [
    'circuit-pcb', 
    'planet-nodes', 
    'cyber-matrix', 
    'motherboard-gold', 
    'quantum-connections', 
    'carbon', 
    'oled',
    'clean'
  ];
  if (!fondosValidos.includes(nombreFondo)) nombreFondo = 'circuit-pcb';

  document.documentElement.setAttribute('data-bg', nombreFondo);
  localStorage.setItem("scada_bg", nombreFondo);

  const select = document.getElementById("selectFondoWallpaper");
  if (select) select.value = nombreFondo;

  notify(`🖼️ Fondo: ${nombreFondo.toUpperCase()}`, "var(--cyan)");
};

function inicializarConfigVisualGuardada() {
  const temaGuardado = localStorage.getItem("scada_theme") || "tactical";
  window.cambiarTema(temaGuardado);

  const fondoGuardado = localStorage.getItem("scada_bg") || "circuit-pcb";
  window.cambiarFondo(fondoGuardado);

  inicializarTransparenciaGuardada();
}

// =========================================================================
// 6. SINTETIZADOR DE AUDIO (ALARMAS MÉDICAS)
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
// 7. VENTANAS EMERGENTES (MODALES DE CONFIRMACIÓN & SEGURIDAD)
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
  if (overlay) overlay.style.display = "grid";
}

window.cerrarModalConfirmacion = function(confirmado) {
  const overlay = document.getElementById("modalConfirmOverlay");
  if (overlay) overlay.style.display = "none";
  if (confirmado && typeof modalConfirmCallback === 'function') {
    modalConfirmCallback();
  }
  modalConfirmCallback = null;
};

// Temporizador de inactividad
function resetearTemporizadorInactividad() {
  if (!estaAutenticado()) return;

  const overlay = document.getElementById("modalTimeoutOverlay");
  if (overlay && overlay.style.display === "grid") return;

  clearTimeout(idleTimer);
  idleTimer = setTimeout(mostrarAdvertenciaInactividad, IDLE_LIMIT_MS);
}

function mostrarAdvertenciaInactividad() {
  if (!estaAutenticado()) return;
  const overlay = document.getElementById("modalTimeoutOverlay");
  const cnt = document.getElementById("timeoutCountdown");
  if (!overlay || !cnt) return;

  countdownSeconds = 60;
  cnt.innerText = countdownSeconds;
  overlay.style.display = "grid";
  sonarAlarmaSonora();

  clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    countdownSeconds--;
    cnt.innerText = countdownSeconds;
    if (countdownSeconds <= 0) {
      clearInterval(countdownInterval);
      overlay.style.display = "none";
      if (usuarioActual) {
        registrarAuditoriaAcceso(usuarioActual.user, usuarioActual.rol, 'TIMEOUT_INACTIVIDAD', 'Cierre automático tras 15 minutos desatendido');
      }
      cerrarSesionManual();
      notify("⚠️ Sesión cerrada por inactividad hospitalaria", "var(--amber)");
    }
  }, 1000);
}

window.extenderSesionInactividad = function() {
  clearInterval(countdownInterval);
  const overlay = document.getElementById("modalTimeoutOverlay");
  if (overlay) overlay.style.display = "none";
  clearTimeout(idleTimer);
  idleTimer = setTimeout(mostrarAdvertenciaInactividad, IDLE_LIMIT_MS);
  notify("✅ Sesión extendida con éxito", "var(--green)");
};

['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
  window.addEventListener(evt, resetearTemporizadorInactividad, { passive: true });
});

window.pedirConfirmacionComando = function(cmd, msg, btnText) {
  if (usuarioActual && usuarioActual.rol === "OPERADOR" && cmd !== 'INICIAR_CICLO') {
    return notify("Permiso denegado para tu rol OPERADOR", "var(--red)");
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
// 8. ENRUTADOR SEGURO DE ACTIVIDADES & BLOQUEO JERÁRQUICO
// =========================================================================
window.openTopLevel = function(secId) {
  if (!estaAutenticado() && secId !== 'act-login' && secId !== 'act-recovery') {
    renderScreen('act-login');
    return;
  }

  if (usuarioActual && usuarioActual.rol === "OPERADOR") {
    if (secId === 'act-fota' || secId === 'act-fleet-mgmt' || secId === 'act-users') {
      notify("⛔ Acceso restringido para el rol OPERADOR", "var(--red)");
      return;
    }
  }

  if (usuarioActual && usuarioActual.rol === "TECNICO") {
    if (secId === 'act-users') {
      notify("⛔ Acceso exclusivo para SUPERADMIN", "var(--red)");
      return;
    }
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
  if (screenId === 'act-users') {
    cargarUsuariosUI();
    cargarBitacoraAccesos();
  }

  if (!esPublico) aplicarPermisosRol();
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
// 9. NAVEGACIÓN Y MENÚ ENGRANAJE
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

document.addEventListener("click", (e) => {
  const menu = document.getElementById("gearDropdownMenu");
  const btn = document.getElementById("btnGearToggle");
  if (menu && menu.style.display === "block") {
    if (!menu.contains(e.target) && (!btn || !btn.contains(e.target))) {
      menu.style.display = "none";
    }
  }
});

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
  if (usuarioActual) {
    registrarAuditoriaAcceso(usuarioActual.user, usuarioActual.rol, 'CIERRE_SESION', 'Cierre de sesión manual');
  }

  usuarioActual = null;
  currentInspectedMAC = null;
  clearTimeout(idleTimer);
  clearInterval(countdownInterval);

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
  notify("🔒 Sesión finalizada con seguridad", "var(--red)");
};

// =========================================================================
// 10. PURGA Y RESET DE CACHÉ LOCAL
// =========================================================================
window.solicitarLimpiezaCacheLocal = function() {
  mostrarModalConfirmacion({
    icon: '🔄',
    title: 'FORZAR SINCRONIZACIÓN NUBE',
    msg: '¿Deseas purgar la memoria local desfasada y forzar la lectura 100% directa desde Supabase Cloud?',
    okText: 'FORZAR NUBE AHORA',
    okClass: 'btn-primary',
    onConfirm: async () => {
      if (db) {
        try {
          const tx = db.transaction(["reportes_sesiones"], "readwrite");
          tx.objectStore("reportes_sesiones").clear();
        } catch(e) {}
      }
      reportesCache = [];
      await renderizarRegistros();
      notify("☁️ Memoria local purgada. Sincronizado con Supabase", "var(--green)");
    }
  });
};

// =========================================================================
// 11. BASE DE DATOS LOCAL Y TIEMPO REAL NUBE (KILL-SWITCH EN VIVO)
// =========================================================================
let db = null;
const fleet = {};

function initDB() {
  return new Promise((resolve) => {
    const req = indexedDB.open("AutoclaveFastFleetDB_v35", 1);
    req.onupgradeneeded = (e) => {
      db = e.target.result;
      if (!db.objectStoreNames.contains("asignaciones")) db.createObjectStore("asignaciones", { keyPath: "mac" });
      if (!db.objectStoreNames.contains("usuarios")) db.createObjectStore("usuarios", { keyPath: "user" });
      if (!db.objectStoreNames.contains("reportes_sesiones")) {
        const sr = db.createObjectStore("reportes_sesiones", { keyPath: "id", autoIncrement: true });
        sr.createIndex("mac", "mac", { unique: false });
        sr.createIndex("sessionId", "sessionId", { unique: false });
      }
      if (!db.objectStoreNames.contains("mantenimientos")) {
        const mr = db.createObjectStore("mantenimientos", { keyPath: "id", autoIncrement: true });
        mr.createIndex("mac", "mac", { unique: false });
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
        notify(`📋 Paquete recibido en la nube [${payload.eventType}]`, "var(--green)");
        if (currentActivity === 'act-reports') renderizarRegistros();
        if (currentActivity === 'act-device-detail' && currentInspectedMAC) {
          cargarLogsDetalle(currentInspectedMAC);
        }
      })
      .subscribe();

    sbClient
      .channel('realtime_equipos_canal')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'asignaciones_equipos' }, () => {
        cargarEquiposGuardados();
      })
      .subscribe();

    // KILL-SWITCH Y MODIFICACIÓN EN CALIENTE DE ROLES / ESTADO
    sbClient
      .channel('realtime_usuarios_canal')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'usuarios_scada' }, (payload) => {
        cargarUsuariosUI();
        cargarListaUsuariosLogin();

        if (usuarioActual && payload.new && payload.new.user.toLowerCase() === usuarioActual.user.toLowerCase()) {
          // Si el admin suspende la cuenta en tiempo real
          if (payload.new.estado === 'SUSPENDIDO') {
            cerrarSesionManual();
            sonarAlarmaSonora();
            mostrarModalConfirmacion({
              icon: '🚫',
              title: 'CUENTA SUSPENDIDA',
              msg: 'Tu cuenta ha sido bloqueada en vivo por el Administrador. El acceso ha sido revocado.',
              okText: 'ENTENDIDO',
              okClass: 'btn-danger',
              onConfirm: () => {}
            });
            return;
          }
          // Si cambian su jerarquía/rol en caliente
          if (payload.new.rol !== usuarioActual.rol) {
            usuarioActual.rol = payload.new.rol;
            localStorage.setItem("scada_logged_user", JSON.stringify(usuarioActual));
            const badge = document.getElementById("currentUserRoleBadge");
            if (badge) badge.innerText = usuarioActual.rol;
            aplicarPermisosRol();
            notify(`⚡ Tu jerarquía fue actualizada a: ${usuarioActual.rol}`, "var(--cyan)");
          }
        }
      })
      .subscribe();

    sbClient
      .channel('realtime_auditoria_canal')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'auditoria_accesos' }, () => {
        if (currentActivity === 'act-users') cargarBitacoraAccesos();
      })
      .subscribe();

    sbClient
      .channel('realtime_mantenimientos_canal')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mantenimientos_equipos' }, () => {
        if (currentActivity === 'act-device-detail' && currentInspectedMAC) {
          cargarMantenimientosEquipo(currentInspectedMAC);
        }
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
      if (route && route.activity && route.activity !== 'act-login') {
        if (route.activity === 'act-device-detail' && route.mac) {
          abrirDetalleEquipo(route.mac);
          if (route.subTab) switchDetailTab(route.subTab);
        } else {
          openTopLevel(route.topLevel || 'act-telemetry');
        }
      } else {
        openTopLevel('act-telemetry');
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
          const devMac = item.mac || item.Mac;
          if (devMac) {
            inicializarDispositivoSiNoExiste(devMac);
            fleet[devMac].meta = Object.assign(fleet[devMac].meta, item);
          }
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
        const devMac = item.mac || item.Mac;
        if (devMac) {
          inicializarDispositivoSiNoExiste(devMac);
          fleet[devMac].meta = Object.assign(fleet[devMac].meta, item);
        }
      });
      actualizarSelectoresGlobales();
      renderFleetDashboard();
    };
  }
}

// =========================================================================
// 12. MQTT HIVEMQ CLOUD (CANAL WSS 8884) & ALERTAS INSTANTÁNEAS
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
    mqttClient.subscribe("autoclave_med_2026/+/alerta_critica");
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
      } else if (canal === "alerta_critica") {
        procesarAlertaCriticaInmediata(mac, payload);
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

function procesarAlertaCriticaInmediata(mac, payload) {
  sonarAlarmaSonora();
  mostrarModalConfirmacion({
    icon: '🚨',
    title: '¡FALLO CRÍTICO EN AUTOCLAVE!',
    msg: `Equipo: ${fleet[mac]?.meta?.alias || mac}\nFase: ${payload.fase || 'DESCONOCIDA'}\nError: ${payload.alerta_msg || 'Alarma activa'}\nHora: ${payload.hora || 'Ahora'}`,
    okText: 'SILENCIAR ALARMA',
    okClass: 'btn-danger',
    onConfirm: () => {}
  });
}

async function procesarPaqueteOfflineSync(mac, payload) {
  inicializarDispositivoSiNoExiste(mac);
  notify(`📥 Guardando paquete clínico de [${mac}]...`, "var(--purple)");

  const ciclosReales = payload.ciclos_acumulados || payload.ciclos || 0;
  fleet[mac].meta.ciclosCompletados = ciclosReales;
  if (!fleet[mac].datos.cfg) fleet[mac].datos.cfg = {};
  fleet[mac].datos.cfg.ciclos = ciclosReales;

  const sesId = payload.session_id || `SES-${Date.now()}`;
  const reportObj = {
    session_id: sesId,
    mac: mac,
    alias: fleet[mac].meta.alias || payload.alias || mac,
    cliente: fleet[mac].meta.cliente || payload.cliente || "Clínica",
    modelo: fleet[mac].meta.modelo || payload.modelo || "Autoclave",
    programa: payload.programa || "ESTÁNDAR",
    hora_encendido: payload.hora_encendido || "00:00",
    inicio_ciclo: payload.inicio_ciclo || payload.hora_encendido || "00:00",
    hora_apagado: payload.hora_apagado || "00:00",
    duracion_total_seg: payload.duracion_total_seg || 0,
    ciclos_acumulados: ciclosReales,
    limite_mantenimiento: payload.limite_mantenimiento || payload.limite || 200,
    temp_max: parseFloat(payload.temp_max) || 0,
    pres_max: parseFloat(payload.pres_max) || 0,
    conteo_alarmas: payload.conteo_alarmas || payload.alarmas || 0,
    diagnostico_principal: payload.diagnostico_principal || payload.diagnostico || "SESIÓN CONFORME",
    fase_final: payload.fase_final || "APAGADO_SEGURO",
    ciclos_detalle: payload.fases_desglose || payload.ciclos_detalle || [],
    errores_alarmas: payload.errores_alarmas || null,
    eventos: payload.eventos || [],
    es_offline: !!payload.es_offline
  };

  let guardadoEnNube = false;
  if (sbClient) {
    try { 
      const { error } = await sbClient.from('reportes_autoclaves').upsert(reportObj, { onConflict: 'session_id' }); 
      if (!error) guardadoEnNube = true;
    } catch(err) {}
  }

  if (db) {
    try {
      const tx = db.transaction(["reportes_sesiones"], "readwrite");
      tx.objectStore("reportes_sesiones").add(reportObj);
    } catch(e) {}
  }

  actualizarCardDashboard(mac);
  if (currentActivity === 'act-reports') renderizarRegistros();
  if (currentActivity === 'act-device-detail' && currentInspectedMAC === mac) {
    cargarLogsDetalle(mac);
  }
  notify(guardadoEnNube ? `☁️ Paquete guardado en Supabase con éxito` : `Paquete guardado localmente`, guardadoEnNube ? "var(--green)" : "var(--amber)");
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

  if (data.cfg) {
    if (data.cfg.ciclos !== undefined) fleet[mac].meta.ciclosCompletados = data.cfg.ciclos;
    if (data.cfg.lim_mant !== undefined) fleet[mac].meta.limiteMantenimiento = data.cfg.lim_mant;

    if (fleet[mac]._pendingLock && fleet[mac].datos.cfg) {
      const ahora = Date.now();
      Object.keys(fleet[mac]._pendingLock).forEach(k => {
        if (ahora < fleet[mac]._pendingLock[k]) data.cfg[k] = fleet[mac].datos.cfg[k];
      });
    }
  }

  if (data.alarma_cod && data.alarma_cod > 0) {
    sonarAlarmaSonora();
  }

  fleet[mac].datos = data;
  actualizarCardDashboard(mac);

  if (currentInspectedMAC === mac) {
    actualizarPantallaDetalleDinamica();
  }
}

function procesarEsquemaReal(mac, data) {
  inicializarDispositivoSiNoExiste(mac);
  fleet[mac].esquema = data;
  fleet[mac].fw = data.fw || "v4.0";
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
// 13. DASHBOARD ADAPTATIVO & ODÓMETRO
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

  const ciclos = (d.cfg && d.cfg.ciclos !== undefined) ? d.cfg.ciclos : (meta.ciclosCompletados || 0);
  const limite = (d.cfg && d.cfg.lim_mant !== undefined) ? d.cfg.lim_mant : (meta.limiteMantenimiento || 200);
  const pct = Math.min(100, Math.round((ciclos / limite) * 100));

  const esVencido = ciclos >= limite;
  const esAlertaProximo = (limite - ciclos) <= (limite * 0.10);
  const mantClass = esVencido ? 'danger' : (esAlertaProximo ? 'warn' : '');
  const estadoTexto = esVencido ? 'MANT. VENCIDO' : (esAlertaProximo ? 'MANT. PRÓXIMO (10%)' : 'SALUD ÓPTIMA');

  const faseTexto = d.fase || 'ESPERA';
  const faseColor = (faseTexto === 'FINALIZADO CON EXITO') ? 'var(--green)' : 
                    (faseTexto === 'ESPERA' ? 'var(--cyan)' : 
                    (faseTexto.includes('ALARMA') ? 'var(--red)' : 'var(--amber)'));

  card.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
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
      <div style="display:flex; justify-content:space-between; font-size:0.65rem; color:var(--text-muted); font-weight:700; flex-wrap: wrap; gap: 4px;">
        <span>ODÓMETRO: ${ciclos} / ${limite} ciclos</span>
        <span style="color:${esVencido ? 'var(--red)' : (esAlertaProximo ? 'var(--amber)' : 'var(--green)')}; font-weight:800;">
          ${estadoTexto}
        </span>
      </div>
      <div class="health-bar"><div class="health-fill ${mantClass}" style="width: ${pct}%;"></div></div>
    </div>

    <div style="background: rgba(10, 17, 32, 0.6); border: 1px solid var(--border-subtle); padding: 8px 10px; border-radius: 6px; font-size: 0.72rem; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
      <span style="color: var(--text-muted); font-weight: 800; font-size: 0.68rem;">FASE ACTUAL:</span> 
      <span style="color: ${faseColor}; font-weight: 900; letter-spacing: 0.8px; text-align: right; word-break: break-word;">${faseTexto}</span>
    </div>

    <div style="text-align: center; font-size: 0.68rem; color: var(--cyan); padding: 6px; background: var(--cyan-deep); border: 1px solid var(--border-subtle); border-radius: 4px; font-weight: 800;">
      👉 ENTRAR A CONTROL TOTAL (1 CLICK)
    </div>
  `;
}

// =========================================================================
// 14. DETALLE DEL EQUIPO Y ACCIONES DE ODÓMETRO
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
  cargarMantenimientosEquipo(mac);

  switchDetailTab('tab-det-tele');
  openActivity('act-device-detail');
};

function switchDetailTab(tabId) {
  if (usuarioActual && usuarioActual.rol === "OPERADOR" && (tabId === 'tab-det-cfg' || tabId === 'tab-det-ficha' || tabId === 'tab-det-maint')) {
    return notify("Pestaña restringida para nivel OPERADOR", "var(--red)");
  }

  currentDetailSubTab = tabId;
  document.querySelectorAll('.detail-subview').forEach(s => s.style.display = 'none');
  document.querySelectorAll('.subtab-slider .btn').forEach(b => b.classList.remove('active'));

  const el = document.getElementById(tabId);
  if (el) el.style.display = 'block';

  if (tabId === 'tab-det-tele') document.getElementById('btnSubTele')?.classList.add('active');
  if (tabId === 'tab-det-cfg') document.getElementById('btnSubCfg')?.classList.add('active');
  if (tabId === 'tab-det-ficha') document.getElementById('btnSubFicha')?.classList.add('active');
  if (tabId === 'tab-det-logs') {
    document.getElementById('btnSubLogs')?.classList.add('active');
    if (currentInspectedMAC) cargarLogsDetalle(currentInspectedMAC);
  }
  if (tabId === 'tab-det-maint') {
    document.getElementById('btnSubMaint')?.classList.add('active');
    if (currentInspectedMAC) cargarMantenimientosEquipo(currentInspectedMAC);
  }
}

window.resetearOdometroHardware = function() {
  if (!currentInspectedMAC) return notify("Selecciona un equipo primero", "var(--amber)");
  if (usuarioActual && usuarioActual.rol !== "SUPERADMIN") return notify("Permiso denegado: solo SUPERADMIN", "var(--red)");

  mostrarModalConfirmacion({
    icon: '🔄',
    title: 'RESETEAR ODÓMETRO DE CICLOS',
    msg: `¿Deseas reiniciar a 0 el odómetro físico de ciclos del autoclave ${fleet[currentInspectedMAC]?.meta?.alias || currentInspectedMAC}? El siguiente ciclo comenzará como #1.`,
    okText: 'RESETEAR A CERO',
    okClass: 'btn-danger',
    onConfirm: () => {
      mqttClient.publish(`autoclave_med_2026/${currentInspectedMAC}/config`, JSON.stringify({ cmd: "RESET_ODOMETRO" }));
      if (fleet[currentInspectedMAC]?.meta) fleet[currentInspectedMAC].meta.ciclosCompletados = 0;
      if (fleet[currentInspectedMAC]?.datos?.cfg) fleet[currentInspectedMAC].datos.cfg.ciclos = 0;
      actualizarCardDashboard(currentInspectedMAC);
      notify("Odómetro reiniciado a 0 en la memoria física del equipo", "var(--green)");
    }
  });
};

function generarUIEsquemaDinamico(mac) {
  const item = fleet[mac];
  if (!item) return;

  const containerGauges = document.getElementById("containerDynamicGauges");
  const teleDef = item.esquema?.telemetria_def;

  if (teleDef && teleDef.length) {
    containerGauges.innerHTML = teleDef.map(t => {
      const esTexto = (t.tipo === 'texto' || t.key === 'fase');
      return `
        <div class="gauge-cell">
          <div class="gauge-val ${t.key === 'presion' ? 'p' : ''} ${esTexto ? 'is-text' : ''}" id="dyn-val-${t.key}">--</div>
          <div class="gauge-lbl">${t.label} ${t.unidad ? '(' + t.unidad + ')' : ''}</div>
        </div>
      `;
    }).join("");
  } else {
    containerGauges.innerHTML = `
      <div class="gauge-cell"><div class="gauge-val" id="dyn-val-temp_camara">--°C</div><div class="gauge-lbl">TEMPERATURA</div></div>
      <div class="gauge-cell"><div class="gauge-val p" id="dyn-val-presion">--b</div><div class="gauge-lbl">PRESIÓN</div></div>
      <div class="gauge-cell"><div class="gauge-val is-text" style="color:var(--green);" id="dyn-val-fase">--</div><div class="gauge-lbl">FASE</div></div>
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
      if (k === 'temp_camara') {
        el.innerText = (d[k] || 0).toFixed(1) + "°C";
        el.classList.remove('is-text');
      } else if (k === 'presion') {
        el.innerText = (d[k] || 0).toFixed(2) + "b";
        el.classList.remove('is-text');
      } else if (k === 'seg_restantes') {
        const m = Math.floor(d[k] / 60);
        const s = d[k] % 60;
        el.innerText = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        el.classList.remove('is-text');
      } else if (typeof d[k] === 'boolean') {
        el.innerText = d[k] ? "ACTIVO" : "INACTIVO";
        el.style.color = d[k] ? "var(--green)" : "var(--text-muted)";
        el.classList.remove('is-text');
      } else {
        const valStr = String(d[k] || '--');
        el.innerText = valStr;
        if (valStr.length > 8 || valStr.includes(' ')) {
          el.classList.add('is-text');
        } else {
          el.classList.remove('is-text');
        }
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

  const metaData = { 
    mac: currentInspectedMAC, 
    alias: alias, 
    cliente: cliente, 
    modelo: modelo, 
    updated_at: new Date().toISOString() 
  };

  let guardadoNube = false;
  if (sbClient) {
    try { 
      const { error } = await sbClient.from('asignaciones_equipos').upsert(metaData, { onConflict: 'mac' }); 
      if (!error) guardadoNube = true;
    } catch(err) {}
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
  notify(guardadoNube ? "☁️ Ficha guardada en la nube con éxito" : "Ficha guardada localmente", "var(--green)");
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
    try { 
      await sbClient.from('asignaciones_equipos').delete().eq('mac', mac); 
    } catch(e) {}
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

  notify(`☁️ Autoclave [${mac}] purgado de la nube`, "var(--amber)");
};

// =========================================================================
// 15. HISTORIAL DE CICLOS DEL EQUIPO
// =========================================================================
async function cargarLogsDetalle(mac) {
  const tbody = document.getElementById("detLogsTbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:16px;">Consultando historial en Supabase Cloud...</td></tr>`;

  let logs = [];

  if (sbClient) {
    try {
      const { data, error } = await sbClient
        .from('reportes_autoclaves')
        .select('*')
        .eq('mac', mac)
        .order('created_at', { ascending: false })
        .limit(30);

      if (!error && data) {
        logs = data;
        renderLogsDetalleFilas(logs, tbody);
        return;
      }
    } catch(e) {}
  }

  if (db) {
    const tx = db.transaction(["reportes_sesiones"], "readonly");
    tx.objectStore("reportes_sesiones").getAll().onsuccess = (e) => {
      const localLogs = (e.target.result || []).filter(x => (x.mac === mac)).reverse();
      renderLogsDetalleFilas(localLogs, tbody);
    };
    return;
  }

  renderLogsDetalleFilas([], tbody);
}

function renderLogsDetalleFilas(logs, tbody) {
  if (!logs.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:18px;">Sin sesiones registradas en la nube para este equipo.</td></tr>`;
    return;
  }
  tbody.innerHTML = logs.map(s => {
    const countCiclos = (s.ciclos_detalle && s.ciclos_detalle.length) ? s.ciclos_detalle.length : (s.ciclos_acumulados || 1);
    const fechaTexto = formatearFechaClinica(s.created_at || s.fecha);

    return `
      <tr class="report-package-row" onclick="verPaqueteSesion('${s.session_id || s.sessionId}')">
        <td style="color:var(--cyan); font-weight:700;">${fechaTexto} ${s.hora_encendido || s.horaEncendido || '--'}</td>
        <td><span class="user-role">${s.diagnostico_principal || s.diagnosticoPrincipal || s.fase_final || '--'}</span></td>
        <td><span class="cycle-badge">⚡ ${countCiclos} Ciclos</span></td>
        <td><span style="color:${(s.ciclos_acumulados || 0) >= (s.limite_mantenimiento || 200) ? 'var(--red)' : 'var(--green)'}; font-weight:700;">Odómetro: ${s.ciclos_acumulados || 0}</span></td>
        <td>T:${parseFloat(s.temp_max || s.tempMax || 0).toFixed(1)}°C | P:${parseFloat(s.pres_max || s.presMax || 0).toFixed(2)}b</td>
        <td><button class="btn btn-sm" onclick="event.stopPropagation(); verPaqueteSesion('${s.session_id || s.sessionId}')">👁️</button></td>
      </tr>
    `;
  }).join("");
}

// =========================================================================
// 16. MANTENIMIENTOS CLÍNICOS & ALERTAS PROGRAMADAS
// =========================================================================
window.guardarProgramacionMantenimiento = async function() {
  if (!currentInspectedMAC) return notify("Selecciona un equipo primero", "var(--amber)");
  if (usuarioActual && usuarioActual.rol === "OPERADOR") return notify("Permiso denegado: solo Técnico o SuperAdmin", "var(--red)");

  const fechaProg = document.getElementById("maintFechaProgramada").value;
  const tipoServicio = document.getElementById("maintTipoServicio").value;
  const tecnico = document.getElementById("maintTecnico").value.trim();
  const notas = document.getElementById("maintNotas").value.trim();

  if (!fechaProg || !tecnico) return notify("Completa fecha y técnico responsable", "var(--red)");

  const registroMaint = {
    mac: currentInspectedMAC,
    tipo_servicio: tipoServicio,
    tecnico_responsable: tecnico,
    descripcion: `OBJETIVO_FECHA:${fechaProg} | ${notas}`,
    ciclos_al_momento: fleet[currentInspectedMAC]?.meta?.ciclosCompletados || 0,
    created_at: new Date().toISOString()
  };

  let guardadoNube = false;
  if (sbClient) {
    try {
      const { error } = await sbClient.from('mantenimientos_equipos').insert([registroMaint]);
      if (!error) guardadoNube = true;
    } catch(e) {}
  }

  if (db) {
    try {
      const tx = db.transaction(["mantenimientos"], "readwrite");
      tx.objectStore("mantenimientos").add(registroMaint);
    } catch(e) {}
  }

  document.getElementById("maintNotas").value = "";
  cargarMantenimientosEquipo(currentInspectedMAC);
  notify(guardadoNube ? "☁️ Mantenimiento programado en Supabase Cloud" : "Mantenimiento guardado localmente", "var(--green)");
};

async function cargarMantenimientosEquipo(mac) {
  const tbody = document.getElementById("maintHistoryTbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:14px;">Consultando mantenimientos en la nube...</td></tr>`;

  let items = [];

  if (sbClient) {
    try {
      const { data, error } = await sbClient
        .from('mantenimientos_equipos')
        .select('*')
        .eq('mac', mac)
        .order('created_at', { ascending: false });

      if (!error && data) items = data;
    } catch(e) {}
  }

  if (!items.length && db) {
    const tx = db.transaction(["mantenimientos"], "readonly");
    tx.objectStore("mantenimientos").getAll().onsuccess = (e) => {
      items = (e.target.result || []).filter(x => x.mac === mac).reverse();
      renderizarTablaMantenimientos(items, tbody);
      verificarAlarmasMantenimiento(items);
    };
    return;
  }

  renderizarTablaMantenimientos(items, tbody);
  verificarAlarmasMantenimiento(items);
}

function renderizarTablaMantenimientos(items, tbody) {
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:16px;">Sin mantenimientos registrados en la nube para este equipo.</td></tr>`;
    return;
  }
  tbody.innerHTML = items.map(m => {
    let fechaTarget = "--";
    if (m.descripcion && m.descripcion.includes("OBJETIVO_FECHA:")) {
      fechaTarget = m.descripcion.split("OBJETIVO_FECHA:")[1].split(" |")[0];
    }
    return `
      <tr>
        <td style="color:var(--cyan); font-weight:700;">${formatearFechaClinica(m.created_at)}</td>
        <td><span class="user-role">${m.tipo_servicio}</span></td>
        <td>${m.tecnico_responsable}</td>
        <td>${m.ciclos_al_momento || 0}</td>
        <td><span class="cycle-badge">Prog: ${fechaTarget}</span></td>
      </tr>
    `;
  }).join("");
}

function verificarAlarmasMantenimiento(items) {
  const banner = document.getElementById("maintAlarmBanner");
  const bannerText = document.getElementById("maintAlarmText");
  if (!banner || !bannerText) return;

  const hoyStr = new Date().toISOString().split("T")[0];
  const horaActual = new Date().getHours();

  let alerta = null;

  for (const m of items) {
    if (m.descripcion && m.descripcion.includes("OBJETIVO_FECHA:")) {
      const fechaTarget = m.descripcion.split("OBJETIVO_FECHA:")[1].split(" |")[0];
      if (fechaTarget < hoyStr) {
        alerta = `🚨 URGENTE: Mantenimiento VENCIDO (${fechaTarget}) - ${m.tipo_servicio}. Responsable: ${m.tecnico_responsable}`;
        break;
      } else if (fechaTarget === hoyStr) {
        alerta = `⚠️ ALERTA EN CALIENTE (8:00 AM): Mantenimiento programado para HOY - ${m.tipo_servicio}. Responsable: ${m.tecnico_responsable}`;
        break;
      }
    }
  }

  if (alerta) {
    banner.style.display = "block";
    bannerText.innerText = alerta;
    if (horaActual >= 8) sonarAlarmaSonora();
  } else {
    banner.style.display = "none";
  }
}

// Exportar mantenimientos a Excel
window.exportarMantenimientosExcel = function() {
  if (!currentInspectedMAC) return notify("Selecciona un autoclave primero", "var(--amber)");
  const item = fleet[currentInspectedMAC];
  const meta = item?.meta || { alias: currentInspectedMAC, cliente: "Clínica", modelo: "Autoclave" };

  sbClient
    .from('mantenimientos_equipos')
    .select('*')
    .eq('mac', currentInspectedMAC)
    .order('created_at', { ascending: false })
    .then(({ data }) => {
      const records = data || [];
      if (!records.length) return notify("Sin registros de mantenimiento para exportar", "var(--amber)");

      let csv = "\uFEFF";
      csv += "HISTORIAL TÉCNICO DE MANTENIMIENTO Y SERVICIO BIOMÉDICO\n";
      csv += `AUTOCLAVE,"${meta.alias}",MAC,"${currentInspectedMAC}",CLIENTE,"${meta.cliente}",MODELO,"${meta.modelo}"\n\n`;
      csv += "ID,FECHA_INTERVENCION,TIPO_SERVICIO,TECNICO_RESPONSABLE,CICLOS_ODOMETRO,FECHA_PROGRAMADA,NOTAS_DETALLES\n";

      records.forEach(m => {
        let fechaProg = "--";
        let notas = m.descripcion || "";
        if (m.descripcion && m.descripcion.includes("OBJETIVO_FECHA:")) {
          const parts = m.descripcion.split("OBJETIVO_FECHA:")[1].split(" |");
          fechaProg = parts[0];
          notas = parts.slice(1).join(" |").trim();
        }
        csv += `"${m.id}","${formatearFechaClinica(m.created_at)}","${m.tipo_servicio}","${m.tecnico_responsable}","${m.ciclos_al_momento || 0}","${fechaProg}","${notas}"\n`;
      });

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Mantenimientos_${meta.alias}_${Date.now()}.csv`;
      a.click();
      notify("📊 Archivo de mantenimiento descargado para Excel", "var(--green)");
    });
};

// Imprimir Acta Oficial de Mantenimiento en PDF
window.imprimirActaMantenimiento = function() {
  if (!currentInspectedMAC) return notify("Selecciona un autoclave primero", "var(--amber)");
  const item = fleet[currentInspectedMAC];
  const meta = item?.meta || { alias: currentInspectedMAC, cliente: "Clínica", modelo: "Autoclave" };

  sbClient
    .from('mantenimientos_equipos')
    .select('*')
    .eq('mac', currentInspectedMAC)
    .order('created_at', { ascending: false })
    .then(({ data }) => {
      const records = data || [];
      const v = window.open("", "_blank");
      v.document.write(`
        <html><head><title>ACTA DE SERVICIO TÉCNICO - ${meta.alias}</title>
        <style>body{font-family:'Segoe UI',sans-serif;padding:40px;color:#111;}table{width:100%;border-collapse:collapse;margin:20px 0;}th,td{border:1px solid #ccc;padding:10px;text-align:left;font-size:12px;}th{background:#f4f6f8;}</style>
        </head><body>
        <h2>ACTA TÉCNICA DE MANTENIMIENTO Y CALIBRACIÓN BIOMÉDICA</h2>
        <p>HOSPITAL / CLÍNICA: <b>${meta.cliente.toUpperCase()}</b></p>
        <p>EQUIPO: <b>${meta.alias}</b> (MAC: ${currentInspectedMAC}) | MODELO: ${meta.modelo}</p>
        <p>FECHA DE EMISIÓN: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</p>
        <hr>
        <h3>HISTORIAL DE INTERVENCIONES REGISTRADAS EN LA NUBE:</h3>
        <table>
          <thead><tr><th>ID</th><th>Fecha</th><th>Tipo de Servicio</th><th>Técnico Responsable</th><th>Ciclos Odómetro</th><th>Fecha Programada</th><th>Observaciones</th></tr></thead>
          <tbody>
            ${records.map(r => {
              let fProg = "--";
              let notas = r.descripcion || "";
              if (r.descripcion && r.descripcion.includes("OBJETIVO_FECHA:")) {
                const parts = r.descripcion.split("OBJETIVO_FECHA:")[1].split(" |");
                fProg = parts[0];
                notas = parts.slice(1).join(" |").trim();
              }
              return `<tr><td>#${r.id}</td><td>${formatearFechaClinica(r.created_at)}</td><td><b>${r.tipo_servicio}</b></td><td>${r.tecnico_responsable}</td><td>${r.ciclos_al_momento || 0}</td><td>${fProg}</td><td>${notas}</td></tr>`;
            }).join("")}
          </tbody>
        </table>
        <br><br><br>
        <table style="border:none; width:100%;">
          <tr style="border:none;">
            <td style="border:none; text-align:center; width:50%;">___________________________________<br><b>Firma Técnico Biomédico Certificado</b></td>
            <td style="border:none; text-align:center; width:50%;">___________________________________<br><b>Sello y Conformidad Institucional</b></td>
          </tr>
        </table>
        <script>window.print();<\/script></body></html>
      `);
      v.document.close();
    });
};

// =========================================================================
// 17. CENTRO DE AUDITORÍA CLÍNICA (SUPABASE DIRECTO)
// =========================================================================
let reportesCache = [];

async function renderizarRegistros() {
  const devFilter = document.getElementById("filterDeviceSelect")?.value || "TODOS";
  const fType = document.getElementById("filterType")?.value || "TODOS";
  const fDesde = document.getElementById("filterFechaDesde")?.value;
  const fHasta = document.getElementById("filterFechaHasta")?.value;
  const fLimit = document.getElementById("filterLimit")?.value || "100";
  const fText = document.getElementById("filterInput")?.value.trim().toUpperCase() || "";
  const tbody = document.getElementById("auditTableBody");
  if (!tbody) return;

  let items = [];

  if (sbClient) {
    try {
      let query = sbClient.from('reportes_autoclaves').select('*').order('created_at', { ascending: false });

      if (fLimit !== 'ALL') query = query.limit(parseInt(fLimit));
      if (devFilter !== "TODOS") query = query.eq('mac', devFilter);
      if (fDesde && fDesde.trim() !== "") query = query.gte('created_at', fDesde);
      if (fHasta && fHasta.trim() !== "") query = query.lte('created_at', fHasta + 'T23:59:59');

      const { data, error } = await query;
      if (!error && data) {
        items = data.map(r => {
          const deviceMac = r.mac || '';
          const metaLocal = fleet[deviceMac]?.meta || {};
          return {
            id: r.id,
            sessionId: r.session_id,
            mac: deviceMac,
            alias: r.alias || metaLocal.alias || deviceMac,
            cliente: r.cliente || metaLocal.cliente || "Clínica",
            modelo: r.modelo || metaLocal.modelo || "Autoclave",
            programa: r.programa || "ESTÁNDAR",
            horaEncendido: r.hora_encendido || "--",
            inicioCiclo: r.inicio_ciclo || "--",
            horaApagado: r.hora_apagado || "--",
            duracionTotalSeg: r.duracion_total_seg || 0,
            ciclosAcumulados: r.ciclos_acumulados || 0,
            limiteMantenimiento: r.limite_mantenimiento || 200,
            tempMax: parseFloat(r.temp_max) || 0,
            presMax: parseFloat(r.pres_max) || 0,
            conteoAlarmas: r.conteo_alarmas || 0,
            diagnosticoPrincipal: r.diagnostico_principal || r.fase_final,
            faseFinal: r.fase_final || "ESPERA",
            fasesDesglose: r.ciclos_detalle || [],
            erroresAlarmas: r.errores_alarmas || null,
            eventos: r.eventos || [],
            esOffline: r.es_offline || false
          };
        });

        guardarCopiaEnIndexedDB(items);
        pintarTablaReportes(items, fType, fText, tbody);
        return;
      }
    } catch(err) {}
  }

  if (!navigator.onLine && db) {
    const tx = db.transaction(["reportes_sesiones"], "readonly");
    tx.objectStore("reportes_sesiones").getAll().onsuccess = (e) => {
      items = (e.target.result || []).reverse();
      pintarTablaReportes(items, fType, fText, tbody);
    };
    return;
  }

  pintarTablaReportes([], fType, fText, tbody);
}

function guardarCopiaEnIndexedDB(items) {
  if (!db || !items.length) return;
  try {
    const tx = db.transaction(["reportes_sesiones"], "readwrite");
    const store = tx.objectStore("reportes_sesiones");
    store.clear();
    items.slice(0, 100).forEach(item => store.put(item));
  } catch(e) {}
}

function pintarTablaReportes(items, fType, fText, tbody) {
  reportesCache = items;

  document.getElementById("kpiTotalSesiones").innerText = items.length;

  const ciclosConformesReales = items.filter(x => x.diagnosticoPrincipal && x.diagnosticoPrincipal.includes("CONFORME")).length;
  document.getElementById("kpiTotalCiclos").innerText = ciclosConformesReales;

  const mantAlerts = items.filter(x => {
    const lim = x.limiteMantenimiento || 200;
    const acum = x.ciclosAcumulados || 0;
    return (lim - acum) <= (lim * 0.10);
  }).length;
  document.getElementById("kpiMantenimientoAlerta").innerText = mantAlerts;

  const totalAlarmas = items.filter(x => x.conteoAlarmas > 0).length;
  document.getElementById("kpiTotalAlarmas").innerText = totalAlarmas;

  if (fType === "CICLO_OK") items = items.filter(x => x.diagnosticoPrincipal && x.diagnosticoPrincipal.includes("CONFORME"));
  if (fType === "ALARMA") items = items.filter(x => x.conteoAlarmas > 0);
  if (fType === "MANT_WARN") items = items.filter(x => {
    const lim = x.limiteMantenimiento || 200;
    return (lim - (x.ciclosAcumulados || 0)) <= (lim * 0.10);
  });
  if (fType === "OFFLINE_SYNC") items = items.filter(x => x.esOffline === true);

  if (fText && fText.trim() !== "") {
    items = items.filter(x => 
      x.mac.toUpperCase().includes(fText) || 
      x.alias.toUpperCase().includes(fText) || 
      x.cliente.toUpperCase().includes(fText) || 
      x.modelo.toUpperCase().includes(fText) ||
      (x.diagnosticoPrincipal && x.diagnosticoPrincipal.toUpperCase().includes(fText))
    );
  }

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:35px;">No hay paquetes de sesión registrados en la base de datos de la nube.</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(s => {
    const fechaTexto = formatearFechaClinica(s.fecha);
    const durTexto = calcularDuracionTexto(s.horaEncendido, s.horaApagado, s.duracionTotalSeg);

    return `
      <tr class="report-package-row" onclick="verPaqueteSesion('${s.sessionId}')">
        <td style="text-align:center;">
          <input type="checkbox" class="check-report-item" value="${s.id}" data-session="${s.sessionId}" onclick="event.stopPropagation()" style="width:18px; height:18px; accent-color:var(--cyan);">
        </td>
        <td>
          <div style="color:var(--cyan); font-weight:800;">${fechaTexto}</div>
          <div style="font-size:0.62rem; color:var(--text-muted);">${s.sessionId || s.id}</div>
        </td>
        <td>
          <div style="font-weight:800; color:var(--text-main);">${s.alias}</div>
          <div style="font-size:0.62rem; color:var(--purple);">${s.cliente} | ${s.modelo}</div>
        </td>
        <td>
          <div>ON: ${s.horaEncendido} ➔ FIN: ${s.horaApagado}</div>
          <div style="color:var(--text-muted); font-size:0.65rem;">Duración: ${durTexto}</div>
        </td>
        <td>
          <span class="cycle-badge">⚡ ${s.programa}</span>
        </td>
        <td>T:${(s.tempMax||0).toFixed(1)}°C<br>P:${(s.presMax||0).toFixed(2)}b</td>
        <td>
          <span class="user-role" style="color:${s.conteoAlarmas > 0 ? 'var(--red)' : s.diagnosticoPrincipal.includes('CONFORME') ? 'var(--green)' : 'var(--cyan)'};">
            ${s.diagnosticoPrincipal || 'EN REPOSO'}
          </span>
        </td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-sm" onclick="event.stopPropagation(); verPaqueteSesion('${s.sessionId}')" title="Ver desglose de fases">👁️</button>
            <button class="btn btn-sm btn-danger" style="padding:4px 8px;" onclick="event.stopPropagation(); solicitarEliminarReporteIndividual('${s.sessionId}')" title="Eliminar paquete">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// =========================================================================
// 18. VISOR DETALLADO DEL PAQUETE CON FASES Y FALLOS
// =========================================================================
window.verPaqueteSesion = function(sessionId) {
  const ses = reportesCache.find(x => x.sessionId === sessionId);
  if (!ses) return notify("Paquete de sesión no encontrado", "var(--red)");

  currentViewingReport = ses;
  document.getElementById("repPkgTitle").innerText = `PAQUETE: ${ses.alias.toUpperCase()}`;
  document.getElementById("repPkgSub").innerText = `ID: ${ses.sessionId} | MAC: ${ses.mac} | CLIENTE: ${ses.cliente} | MODELO: ${ses.modelo}`;
  
  document.getElementById("repEncendidoVal").innerText = `${formatearFechaClinica(ses.fecha)} ${ses.horaEncendido}`;
  document.getElementById("repApagadoVal").innerText = ses.horaApagado;
  document.getElementById("repUptimeVal").innerText = calcularDuracionTexto(ses.horaEncendido, ses.horaApagado, ses.duracionTotalSeg);
  
  const ciclos = ses.ciclosAcumulados || 0;
  const limite = ses.limiteMantenimiento || 200;
  const pct = Math.min(100, Math.round((ciclos / limite) * 100));
  const esVencido = ciclos >= limite;
  const esAlertaProximo = (limite - ciclos) <= (limite * 0.10);

  document.getElementById("repCiclosVal").innerText = `Odómetro: ${ciclos} / ${limite} (${limite - ciclos} restantes)`;
  document.getElementById("repMantText").innerText = esVencido ? 'MANTENIMIENTO VENCIDO' : (esAlertaProximo ? 'PRÓXIMO A MANTENIMIENTO (10%)' : 'SALUD ÓPTIMA');
  document.getElementById("repMantText").style.color = esVencido ? 'var(--red)' : (esAlertaProximo ? 'var(--amber)' : 'var(--green)');
  document.getElementById("repMantBar").style.width = `${pct}%`;
  document.getElementById("repMantBar").className = `health-fill ${esVencido ? 'danger' : (esAlertaProximo ? 'warn' : '')}`;

  const cyclesContainer = document.getElementById("repCyclesListContainer");
  if (cyclesContainer) {
    let htmlContent = "";

    if (ses.erroresAlarmas && ses.erroresAlarmas.hubo_fallo) {
      htmlContent += `
        <div class="alarm-callout" style="display:block; margin-bottom:16px;">
          <div style="font-size:0.9rem; font-weight:900;">⚠️ FALLO DETECTADO DURANTE EL CICLO:</div>
          <div style="margin-top:4px;">CÓDIGO: #${ses.erroresAlarmas.codigo} | MENSAJE: ${ses.erroresAlarmas.mensaje}</div>
          <div style="font-size:0.75rem; color:#fff; margin-top:2px;">FASE AFECTADA: <b>${ses.erroresAlarmas.fase_del_fallo}</b> | HORA: ${ses.erroresAlarmas.hora_fallo}</div>
        </div>
      `;
    }

    const fases = ses.fasesDesglose || [];
    if (fases.length) {
      htmlContent += `<div style="font-family:'Orbitron'; font-size:0.85rem; color:var(--cyan); margin-bottom:10px; font-weight:800;">ETAPAS DEL CICLO CRONOMETRADAS:</div>`;
      htmlContent += fases.map((f, idx) => {
        const esFallo = f.estado && f.estado.includes("FALLO");
        return `
          <div class="cycle-card-item" style="border-left-color: ${esFallo ? 'var(--red)' : 'var(--green)'};">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; flex-wrap: wrap; gap: 4px;">
              <span class="cycle-badge" style="border-color:${esFallo ? 'var(--red)' : 'var(--cyan)'}; color:${esFallo ? 'var(--red)' : 'var(--cyan)'};">
                FASE ${idx + 1}: ${f.fase || 'ETAPA'}
              </span>
              <span style="font-weight:800; color:${esFallo ? 'var(--red)' : 'var(--green)'}; font-size:0.78rem;">
                ${f.estado || 'OK'} (${f.duracion_seg || 0}s)
              </span>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:8px; font-size:0.75rem; color:var(--text-muted);">
              <div>HORA INICIO: <span style="color:var(--text-main); font-weight:700;">${f.inicio || '--'}</span></div>
              <div>HORA FIN: <span style="color:var(--text-main); font-weight:700;">${f.fin || '--'}</span></div>
              <div>MÁX T°: <span style="color:var(--cyan); font-weight:800;">${f.temp_max ? parseFloat(f.temp_max).toFixed(1) + '°C' : '--'}</span></div>
              <div>MÁX P: <span style="color:var(--purple); font-weight:800;">${f.pres_max ? parseFloat(f.pres_max).toFixed(2) + 'b' : '--'}</span></div>
            </div>
          </div>
        `;
      }).join("");
    } else {
      htmlContent += `
        <div class="cycle-card-item">
          <span class="cycle-badge">CICLO DE ESTERILIZACIÓN</span>
          <div style="margin-top:6px; font-size:0.75rem; color:var(--text-muted);">
            Máximos registrados: <b style="color:var(--cyan);">${ses.tempMax.toFixed(1)}°C</b> | <b style="color:var(--purple);">${ses.presMax.toFixed(2)} Bar</b>
          </div>
        </div>
      `;
    }

    cyclesContainer.innerHTML = htmlContent;
  }

  const timelineBox = document.getElementById("repTimelineContainer");
  if (timelineBox) {
    timelineBox.innerHTML = (ses.eventos || []).map(ev => `
      <div class="timeline-item">
        <div style="font-size:0.75rem; color:var(--cyan); font-weight:800;">${ev.hora} - <span class="user-role">${ev.tipo}</span></div>
        <div style="font-size:0.8rem; margin-top:2px; color:var(--text-main);">${ev.msg}</div>
        ${ev.temp ? `<div style="font-size:0.68rem; color:var(--text-muted); margin-top:2px;">T:${parseFloat(ev.temp).toFixed(1)}°C | P:${parseFloat(ev.presion).toFixed(2)}b</div>` : ''}
      </div>
    `).join("");
  }

  openActivity('act-report-view');
};

// =========================================================================
// 19. EXPORTACIONES AVANZADAS (EXCEL & PDF DE AUDITORÍA)
// =========================================================================
window.exportarAuditoriaExcel = function() {
  const seleccionadosChecks = Array.from(document.querySelectorAll(".check-report-item:checked"));
  let dataParaExportar = [];

  if (seleccionadosChecks.length > 0) {
    const ids = seleccionadosChecks.map(c => c.getAttribute("data-session"));
    dataParaExportar = (reportesCache || []).filter(r => ids.includes(r.sessionId));
  } else {
    dataParaExportar = reportesCache || [];
  }

  if (!dataParaExportar.length) return notify("No hay datos de auditoría para exportar", "var(--amber)");

  let csv = "\uFEFF";
  csv += "AUDITORÍA CLÍNICA DE SESIONES Y CICLOS DE ESTERILIZACIÓN\n";
  csv += `GENERADO EL,"${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}",TOTAL_REGISTROS,"${dataParaExportar.length}"\n\n`;
  csv += "ID_SESION,FECHA,MAC,ALIAS_EQUIPO,CLIENTE_HOSPITAL,MODELO,PROGRAMA,HORA_BOOT,INICIO_CICLO,HORA_FIN,DURACION,ODOMETRO_CICLOS,T_MAX_C,P_MAX_BAR,DIAGNOSTICO_GLOBAL,FALLO_DETECTADO,MENSAJE_FALLO\n";

  dataParaExportar.forEach(d => {
    const durTexto = calcularDuracionTexto(d.horaEncendido, d.horaApagado, d.duracionTotalSeg);
    const huboFallo = (d.erroresAlarmas && d.erroresAlarmas.hubo_fallo) ? "SI" : "NO";
    const msgFallo = (d.erroresAlarmas && d.erroresAlarmas.mensaje) ? d.erroresAlarmas.mensaje : "--";

    csv += `"${d.sessionId}","${formatearFechaClinica(d.fecha)}","${d.mac}","${d.alias}","${d.cliente}","${d.modelo}","${d.programa}","${d.horaEncendido}","${d.inicioCiclo || d.horaEncendido}","${d.horaApagado}","${durTexto}","${d.ciclosAcumulados}","${d.tempMax}","${d.presMax}","${d.diagnosticoPrincipal}","${huboFallo}","${msgFallo}"\n`;
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `Auditoria_Clinica_${Date.now()}.csv`;
  a.click();
  notify("📊 Archivo de auditoría generado para Microsoft Excel", "var(--green)");
};

window.imprimirReporteAuditoriaCompleta = function() {
  const data = reportesCache || [];
  if (!data.length) return notify("Sin datos para imprimir", "var(--amber)");

  const v = window.open("", "_blank");
  const conformes = data.filter(x => x.diagnosticoPrincipal && x.diagnosticoPrincipal.includes("CONFORME")).length;
  const fallos = data.filter(x => x.conteoAlarmas > 0).length;

  v.document.write(`
    <html><head><title>INFORME DE AUDITORÍA CLÍNICA</title>
    <style>body{font-family:'Segoe UI',sans-serif;padding:30px;color:#111;}table{width:100%;border-collapse:collapse;margin:15px 0;}th,td{border:1px solid #bbb;padding:8px;text-align:left;font-size:11px;}th{background:#f1f5f9;}.kpi{display:inline-block;padding:10px 18px;margin-right:12px;background:#f8fafc;border:1px solid #ccc;border-radius:4px;font-size:12px;}</style>
    </head><body>
    <h2>CENTRO DE AUDITORÍA CLÍNICA // INFORME DE ESTERILIZACIÓN</h2>
    <p>FECHA DE EMISIÓN: <b>${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</b></p>
    <div>
      <div class="kpi">Total Sesiones: <b>${data.length}</b></div>
      <div class="kpi">Ciclos Conformes: <b style="color:green;">${conformes}</b></div>
      <div class="kpi">Incidentes / Alarmas: <b style="color:red;">${fallos}</b></div>
    </div>
    <table>
      <thead>
        <tr><th>ID Sesión</th><th>Fecha</th><th>Autoclave</th><th>Cliente</th><th>Horario</th><th>Programa</th><th>Máx T°</th><th>Máx P</th><th>Diagnóstico</th></tr>
      </thead>
      <tbody>
        ${data.map(d => `
          <tr>
            <td>${d.sessionId}</td>
            <td>${formatearFechaClinica(d.fecha)}</td>
            <td><b>${d.alias}</b> (${d.mac})</td>
            <td>${d.cliente}</td>
            <td>${d.horaEncendido} ➔ ${d.horaApagado}</td>
            <td>${d.programa}</td>
            <td>${d.tempMax.toFixed(1)}°C</td>
            <td>${d.presMax.toFixed(2)} Bar</td>
            <td style="color:${d.conteoAlarmas > 0 ? 'red' : 'green'}; font-weight:bold;">${d.diagnosticoPrincipal}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <br><br>
    <p>Certificación Biomédica: ___________________________________ Sello Responsable: _______________________</p>
    <script>window.print();<\/script></body></html>
  `);
  v.document.close();
};

window.imprimirCertificadoSesionActual = function() {
  if (!currentViewingReport) return;
  const s = currentViewingReport;
  const v = window.open("", "_blank");

  let fasesTableHtml = "";
  if (s.fasesDesglose && s.fasesDesglose.length) {
    fasesTableHtml = `
      <h3>DESGLOSE CRONOMÉTRICO DE FASES:</h3>
      <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
        <thead>
          <tr style="background:#eee;"><th>Fase</th><th>Inicio</th><th>Fin</th><th>Duración</th><th>Máx T°</th><th>Máx P</th><th>Estado</th></tr>
        </thead>
        <tbody>
          ${s.fasesDesglose.map(f => `
            <tr>
              <td><b>${f.fase}</b></td>
              <td>${f.inicio}</td>
              <td>${f.fin}</td>
              <td>${f.duracion_seg} seg</td>
              <td>${parseFloat(f.temp_max||0).toFixed(1)}°C</td>
              <td>${parseFloat(f.pres_max||0).toFixed(2)} Bar</td>
              <td style="color:${f.estado && f.estado.includes('FALLO') ? 'red' : 'green'}; font-weight:bold;">${f.estado}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  v.document.write(`
    <html><head><title>CERTIFICADO - ${s.alias}</title>
    <style>body{font-family:'Segoe UI',sans-serif;padding:35px;color:#111;}table{width:100%;border-collapse:collapse;margin:15px 0;}td,th{border:1px solid #333;padding:8px;text-align:left;font-size:12px;}</style>
    </head><body>
    <h2>CERTIFICADO CLÍNICO OFICIAL DE ESTERILIZACIÓN</h2>
    <p>HOSPITAL / CLIENTE: <b>${s.cliente.toUpperCase()}</b></p>
    <p>AUTOCLAVE: <b>${s.alias}</b> (MAC: ${s.mac}) | MODELO: ${s.modelo}</p>
    <p>PROGRAMA: <b>${s.programa}</b> | SESIÓN ID: ${s.sessionId}</p>
    <p>FECHA: ${formatearFechaClinica(s.fecha)} | Encendido: ${s.horaEncendido} ➔ Cierre: ${s.horaApagado}</p>
    
    <table>
      <tr style="background:#eee;"><th>PARÁMETRO CLÍNICO</th><th>VALOR AUDITADO</th></tr>
      <tr><td>Temperatura Máxima Registrada</td><td>${s.tempMax.toFixed(1)} °C</td></tr>
      <tr><td>Presión Máxima Alcanzada</td><td>${s.presMax.toFixed(2)} Bar</td></tr>
      <tr><td>Ciclos Acumulados (Odómetro)</td><td>${s.ciclosAcumulados} / ${s.limiteMantenimiento}</td></tr>
      <tr><td>Diagnóstico de Validación</td><td><b>${s.diagnosticoPrincipal || s.faseFinal}</b></td></tr>
    </table>

    ${fasesTableHtml}

    <h3>EVENTOS CRONOLÓGICOS REGISTRADOS:</h3>
    <ul>${(s.eventos||[]).map(e => `<li><b>${e.hora} [${e.tipo}]:</b> ${e.msg}</li>`).join("")}</ul>
    <br><br><br>
    <p>Firma Responsable Biomédico: ___________________________ Sello Clínica: ___________________</p>
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
    msg: `¿Deseas purgar el paquete [${sessionId}] de la base de datos de la nube?`,
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
  notify("☁️ Paquete de sesión eliminado de la nube", "var(--amber)");
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
      notify(`☁️ ${seleccionados.length} paquetes eliminados de la nube`, "var(--amber)");
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
      notify("☁️ Base de datos de auditoría vaciada en la nube", "var(--red)");
    }
  });
};

// =========================================================================
// 20. BACKUP Y RESTAURACIÓN INTEGRAL DE REPORTES (JSON)
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
  notify("💾 Backup JSON descargado", "var(--green)");
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

      notify(`Subiendo ${list.length} paquetes a la nube...`, "var(--purple)");

      if (sbClient) {
        for (const item of list) {
          const insertObj = {
            session_id: item.sessionId || item.session_id || `REST-${Math.random().toString(36).substring(7)}`,
            mac: item.mac,
            alias: item.alias,
            cliente: item.cliente,
            modelo: item.modelo,
            programa: item.programa || "ESTÁNDAR",
            hora_encendido: item.horaEncendido || item.hora_encendido,
            inicio_ciclo: item.inicioCiclo || item.inicio_ciclo,
            hora_apagado: item.horaApagado || item.hora_apagado,
            duracion_total_seg: item.duracionTotalSeg || item.duracion_total_seg || 0,
            ciclos_acumulados: item.ciclosAcumulados || item.ciclos_acumulados || 0,
            limite_mantenimiento: item.limiteMantenimiento || item.limite_mantenimiento || 200,
            temp_max: item.tempMax || item.temp_max || 0,
            pres_max: item.presMax || item.pres_max || 0,
            conteo_alarmas: item.conteoAlarmas || item.conteo_alarmas || 0,
            diagnostico_principal: item.diagnosticoPrincipal || item.diagnostico_principal || "RESTAURADO",
            fase_final: item.faseFinal || item.fase_final || "COMPLETADO",
            ciclos_detalle: item.fasesDesglose || item.ciclos_detalle || [],
            eventos: item.eventos || []
          };
          try { await sbClient.from('reportes_autoclaves').upsert(insertObj, { onConflict: 'session_id' }); } catch(err) {}
        }
      }

      renderizarRegistros();
      notify(`☁️ ${list.length} paquetes restaurados en la nube`, "var(--green)");
    } catch(err) {
      notify("Error al leer el archivo JSON", "var(--red)");
    }
  };

  reader.readAsText(file);
};

// =========================================================================
// 21. FOTA HUB & GESTIÓN DE FLOTA
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
      <label style="display:flex; align-items:center; gap:10px; background:rgba(17, 26, 46, 0.65); border:1px solid var(--border-subtle); padding:10px 14px; border-radius:4px; margin-bottom:8px; cursor:pointer;">
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

  const metaData = { mac: mac, alias: alias, cliente: cliente, modelo: modelo, updated_at: new Date().toISOString() };

  let guardadoNube = false;
  if (sbClient) {
    try { 
      const { error } = await sbClient.from('asignaciones_equipos').upsert(metaData, { onConflict: 'mac' }); 
      if (!error) guardadoNube = true;
    } catch(e) {}
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
  notify(guardadoNube ? "☁️ Equipo propagado en la nube con éxito" : "Equipo guardado localmente", "var(--green)");
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
      <tr style="cursor:pointer; background: ${esSeleccionado ? 'var(--cyan-deep)' : 'transparent'};" onclick="seleccionarEquipoEnGestion('${mac}')">
        <td style="color:var(--cyan); font-weight:800;">${mac}</td>
        <td><span class="status-badge"><span class="beacon ${online ? 'online' : 'offline'}"></span> ${online ? 'ONLINE' : 'OFFLINE'}</span></td>
        <td style="font-weight:800; color:var(--text-main);">${meta.alias}</td>
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
// 22. JERARQUÍA ESTRICTA (RBAC), GESTIÓN CLOUD & AUDITORÍA FORENSE
// =========================================================================
function aplicarPermisosRol() {
  if (!usuarioActual) return;
  const rol = usuarioActual.rol;
  const esAdmin = rol === "SUPERADMIN";
  const esTech = rol === "TECNICO" || esAdmin;

  document.querySelectorAll('[data-rbac]').forEach(el => {
    const req = el.getAttribute('data-rbac');
    if (req === 'SUPERADMIN') {
      el.style.display = esAdmin ? '' : 'none';
    } else if (req === 'TECNICO') {
      el.style.display = esTech ? '' : 'none';
    }
  });

  const bg = document.getElementById("btnGuardarDinamico");
  if (bg) {
    bg.disabled = !esTech;
    bg.style.opacity = esTech ? "1" : "0.3";
  }

  const btnDetDel = document.getElementById("btnDetDeleteDevice");
  if (btnDetDel) btnDetDel.style.display = esAdmin ? 'inline-flex' : 'none';

  const btnDetOdom = document.getElementById("btnDetResetOdometer");
  if (btnDetOdom) btnDetOdom.style.display = esAdmin ? 'inline-flex' : 'none';
}

// Cargar usuarios con estado en tiempo real y opciones
async function cargarUsuariosUI() {
  const tbody = document.getElementById("tablaUsuariosBody");
  if (!tbody) return;

  let users = [];

  if (sbClient) {
    try {
      const { data, error } = await sbClient.from('usuarios_scada').select('*').order('created_at', { ascending: false });
      if (!error && data && data.length) {
        users = data;
        if (db) {
          const tx = db.transaction(["usuarios"], "readwrite");
          const store = tx.objectStore("usuarios");
          data.forEach(u => store.put(u));
        }
      }
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
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:14px;">No hay usuarios registrados en la nube.</td></tr>`;
    return;
  }
  tbody.innerHTML = users.map(u => {
    const estado = u.estado || 'ACTIVO';
    const esActivo = estado === 'ACTIVO';
    const esAdminRaiz = u.user === 'admin';

    return `
      <tr>
        <td style="font-weight:800; color:var(--cyan);">${u.user}</td>
        <td>
          <button class="btn btn-sm" style="padding:2px 8px; font-size:0.62rem;" onclick="cambiarRolUsuario('${u.user}', '${u.rol}')" title="Clic para alternar jerarquía">
            ${u.rol} 🔄
          </button>
        </td>
        <td>
          <span class="status-badge" style="color:${esActivo ? 'var(--green)' : 'var(--red)'}; border-color:${esActivo ? 'var(--green)' : 'var(--red)'};">
            <span class="dot ${esActivo ? 'online' : 'offline'}"></span> ${estado}
          </span>
        </td>
        <td style="font-size:0.68rem; color:var(--text-muted);">${formatearFechaClinica(u.ultimo_acceso || u.created_at)}</td>
        <td style="font-size:0.68rem; color:var(--text-muted);">${u.dispositivo_reciente || '--'}</td>
        <td>
          <div style="display:flex; gap:4px;">
            ${!esAdminRaiz ? `
              <button class="btn btn-sm ${esActivo ? 'btn-warn' : 'btn-success'}" style="padding:2px 6px; font-size:0.65rem;" onclick="toggleEstadoUsuario('${u.user}', '${estado}')" title="${esActivo ? 'Suspender acceso' : 'Habilitar acceso'}">
                ${esActivo ? '⏸️ Bloquear' : '▶️ Activar'}
              </button>
              <button class="btn btn-sm btn-danger" style="padding:2px 6px;" onclick="eliminarUsuario('${u.user}')" title="Eliminar definitivamente">🗑️</button>
            ` : '<span style="color:var(--text-muted); font-size:0.65rem;">PROTEGIDO</span>'}
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// Alternar estado ACTIVO <-> SUSPENDIDO
window.toggleEstadoUsuario = async function(user, estadoActual) {
  if (usuarioActual && usuarioActual.rol !== "SUPERADMIN") return notify("Permiso denegado: solo SUPERADMIN", "var(--red)");
  if (user === 'admin') return notify("No se puede suspender al administrador raíz", "var(--amber)");

  const nuevoEstado = (estadoActual === 'ACTIVO') ? 'SUSPENDIDO' : 'ACTIVO';
  mostrarModalConfirmacion({
    icon: nuevoEstado === 'SUSPENDIDO' ? '🔒' : '🔓',
    title: nuevoEstado === 'SUSPENDIDO' ? 'SUSPENDER CUENTA' : 'ACTIVAR CUENTA',
    msg: `¿Confirmas cambiar el estado del usuario [${user.toUpperCase()}] a ${nuevoEstado}?`,
    okText: nuevoEstado === 'SUSPENDIDO' ? 'SUSPENDER ACCESO' : 'ACTIVAR ACCESO',
    okClass: nuevoEstado === 'SUSPENDIDO' ? 'btn-danger' : 'btn-success',
    onConfirm: async () => {
      if (sbClient) {
        await sbClient.from('usuarios_scada').update({ estado: nuevoEstado }).eq('user', user);
        await registrarAuditoriaAcceso(usuarioActual.user, usuarioActual.rol, 'CAMBIO_ESTADO', `Usuario [${user}] establecido como ${nuevoEstado}`);
      }
      cargarUsuariosUI();
      notify(`Usuario [${user.toUpperCase()}] ahora está ${nuevoEstado}`, nuevoEstado === 'ACTIVO' ? "var(--green)" : "var(--red)");
    }
  });
};

// Alternar jerarquía RBAC
window.cambiarRolUsuario = async function(user, rolActual) {
  if (usuarioActual && usuarioActual.rol !== "SUPERADMIN") return notify("Permiso denegado: solo SUPERADMIN", "var(--red)");
  if (user === 'admin') return notify("El administrador raíz siempre es SUPERADMIN", "var(--amber)");

  const roles = ['OPERADOR', 'TECNICO', 'SUPERADMIN'];
  const nextRolIndex = (roles.indexOf(rolActual) + 1) % roles.length;
  const nuevoRol = roles[nextRolIndex];

  mostrarModalConfirmacion({
    icon: '🛡️',
    title: 'MODIFICAR JERARQUÍA',
    msg: `¿Deseas cambiar el rango de [${user.toUpperCase()}] de ${rolActual} a ${nuevoRol}?`,
    okText: `ASIGNAR: ${nuevoRol}`,
    okClass: 'btn-primary',
    onConfirm: async () => {
      if (sbClient) {
        await sbClient.from('usuarios_scada').update({ rol: nuevoRol }).eq('user', user);
        await registrarAuditoriaAcceso(usuarioActual.user, usuarioActual.rol, 'CAMBIO_JERARQUIA', `Usuario [${user}] cambiado a ${nuevoRol}`);
      }
      cargarUsuariosUI();
      notify(`Jerarquía de [${user.toUpperCase()}] actualizada a ${nuevoRol}`, "var(--green)");
    }
  });
};

// Cargar la bitácora forense de accesos
async function cargarBitacoraAccesos() {
  const tbody = document.getElementById("tablaBitacoraAccesosBody");
  if (!tbody || !sbClient) return;

  try {
    const { data, error } = await sbClient
      .from('auditoria_accesos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);

    if (!error && data && data.length) {
      tbody.innerHTML = data.map(log => {
        let colorStyle = 'var(--cyan)';
        if (log.evento === 'LOGIN_EXITOSO') colorStyle = 'var(--green)';
        else if (log.evento === 'CLAVE_INCORRECTA' || log.evento === 'CUENTA_SUSPENDIDA') colorStyle = 'var(--red)';
        else if (log.evento === 'TIMEOUT_INACTIVIDAD') colorStyle = 'var(--amber)';

        return `
          <tr>
            <td style="color:var(--cyan); font-weight:700;">${formatearFechaClinica(log.created_at)} ${new Date(log.created_at).toLocaleTimeString()}</td>
            <td style="font-weight:800; color:var(--text-main);">${log.usuario.toUpperCase()}</td>
            <td><span class="user-role">${log.rol}</span></td>
            <td><span class="status-badge" style="color:${colorStyle}; border-color:${colorStyle}; font-size:0.65rem;">${log.evento}</span></td>
            <td style="font-size:0.7rem; color:var(--text-muted);">${log.dispositivo || '--'}</td>
            <td style="font-size:0.7rem; color:var(--text-muted);">${log.detalles || '--'}</td>
          </tr>
        `;
      }).join('');
    } else {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:16px;">Sin registros recientes en la bitácora.</td></tr>`;
    }
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:16px;">Error de lectura en Supabase.</td></tr>`;
  }
}

window.crearUsuario = async function() {
  if (usuarioActual && usuarioActual.rol !== "SUPERADMIN") return notify("Permiso denegado: solo SUPERADMIN", "var(--red)");
  const user = document.getElementById("uUser").value.trim().toLowerCase();
  const email = document.getElementById("uEmail").value.trim().toLowerCase();
  const pass = document.getElementById("uPass").value.trim();
  const rol = document.getElementById("uRol").value;

  if (!user || pass.length < 4) return notify("Mínimo 4 caracteres para la clave", "var(--red)");

  const nuevoUsuario = { 
    user, 
    pass, 
    rol, 
    email, 
    estado: 'ACTIVO',
    dispositivo_reciente: detectarDispositivo(),
    created_at: new Date().toISOString() 
  };

  let guardadoEnNube = false;

  if (sbClient) {
    try {
      const { error } = await sbClient.from('usuarios_scada').upsert(nuevoUsuario, { onConflict: 'user' });
      if (!error) {
        guardadoEnNube = true;
        await registrarAuditoriaAcceso(usuarioActual.user, usuarioActual.rol, 'CREACION_USUARIO', `Cuenta [${user}] registrada como ${rol}`);
      }
    } catch(e) {}
  }

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
  notify(guardadoEnNube ? `☁️ Cuenta [${user.toUpperCase()}] creada y activa en la nube` : `Cuenta guardada localmente`, "var(--green)");
};

window.eliminarUsuario = function(u) {
  if (usuarioActual && usuarioActual.rol !== "SUPERADMIN") return notify("Permiso denegado.", "var(--red)");
  
  mostrarModalConfirmacion({
    icon: '👤',
    title: 'ELIMINAR CREDENCIAL',
    msg: `¿Deseas purgar permanentemente al usuario [${u.toUpperCase()}] de la nube?`,
    okText: 'ELIMINAR USUARIO',
    okClass: 'btn-danger',
    onConfirm: async () => {
      localStorage.removeItem("scada_pass_" + u);
      if (sbClient) {
        try { 
          await sbClient.from('usuarios_scada').delete().eq('user', u); 
          await registrarAuditoriaAcceso(usuarioActual.user, usuarioActual.rol, 'ELIMINACION_USUARIO', `Cuenta [${u}] purgada de la plataforma`);
        } catch(e) {}
      }
      if (db) {
        try {
          const tx = db.transaction(["usuarios"], "readwrite");
          tx.objectStore("usuarios").delete(u);
        } catch(e) {}
      }
      cargarUsuariosUI();
      cargarListaUsuariosLogin();
      notify(`☁️ Usuario [${u.toUpperCase()}] eliminado de la nube`, "var(--amber)");
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
      const { data } = await sbClient.from('usuarios_scada').select('user, rol, estado');
      if (data && data.length) list = data;
    } catch(e) {}
  }

  if (!list.length && db) {
    const tx = db.transaction(["usuarios"], "readonly");
    tx.objectStore("usuarios").getAll().onsuccess = (e) => {
      (e.target.result || []).forEach(u => {
        const suspendido = u.estado === 'SUSPENDIDO';
        sel.innerHTML += `<option value="${u.user}" ${suspendido ? 'disabled style="color:var(--red);"' : ''}>${u.user.toUpperCase()} (${u.rol}) ${suspendido ? '[BLOQUEADO]' : ''}</option>`;
      });
    };
    return;
  }

  list.forEach(u => {
    const suspendido = u.estado === 'SUSPENDIDO';
    sel.innerHTML += `<option value="${u.user}" ${suspendido ? 'disabled style="color:var(--red);"' : ''}>${u.user.toUpperCase()} (${u.rol}) ${suspendido ? '[BLOQUEADO]' : ''}</option>`;
  });
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

// AUTENTICACIÓN DIRECTA, VALIDACIÓN DE ESTADO Y REGISTRO FORENSE
window.procesarInicioSesion = async function() {
  const u = document.getElementById("loginUserInput").value.trim().toLowerCase();
  const p = document.getElementById("loginPassInput").value.trim();
  const fb = document.getElementById("loginFeedback");

  if (!u || !p) return mostrarFeedback(fb, "Completa usuario y clave.", "var(--red)");

  const dispositivoActual = detectarDispositivo();

  // 1. Llave Maestra Raíz
  if (u === "admin" && p === "24331973") {
    await registrarAuditoriaAcceso("admin", "SUPERADMIN", 'LOGIN_EXITOSO', `Acceso concedido desde ${dispositivoActual}`);
    iniciarSesionExitosa({ user: "admin", pass: "24331973", rol: "SUPERADMIN", email: "yuniolgonzalez9@gmail.com", estado: "ACTIVO" });
    return;
  }

  // 2. Consulta y validación directa en Supabase Cloud
  if (sbClient) {
    try {
      const { data, error } = await sbClient.from('usuarios_scada').select('*').eq('user', u).maybeSingle();
      
      if (!error && data) {
        // Validación de Estado (Cuenta Suspendida)
        if (data.estado === 'SUSPENDIDO') {
          await registrarAuditoriaAcceso(u, data.rol || 'OPERADOR', 'CUENTA_SUSPENDIDA', 'Intento de acceso bloqueado');
          return mostrarFeedback(fb, "⛔ Cuenta suspendida por la administración.", "var(--red)");
        }

        // Validación de Contraseña
        if (data.pass === p) {
          // Actualización de último acceso y terminal
          await sbClient.from('usuarios_scada').update({
            ultimo_acceso: new Date().toISOString(),
            dispositivo_reciente: dispositivoActual
          }).eq('user', u);

          await registrarAuditoriaAcceso(u, data.rol, 'LOGIN_EXITOSO', `Conexión verificada desde ${dispositivoActual}`);

          iniciarSesionExitosa({
            user: data.user,
            pass: data.pass,
            rol: data.rol,
            email: data.email,
            estado: data.estado || 'ACTIVO'
          });
          return;
        } else {
          await registrarAuditoriaAcceso(u, data.rol || 'OPERADOR', 'CLAVE_INCORRECTA', 'Intento con credencial errónea');
        }
      }
    } catch(e) {}
  }

  // 3. Fallback de contingencia local
  if (db) {
    const tx = db.transaction(["usuarios"], "readonly");
    const req = tx.objectStore("usuarios").get(u);
    req.onsuccess = (e) => {
      const usuarioLocal = e.target.result;
      if (usuarioLocal && usuarioLocal.pass === p) {
        if (usuarioLocal.estado === 'SUSPENDIDO') {
          return mostrarFeedback(fb, "⛔ Cuenta suspendida por la administración.", "var(--red)");
        }
        iniciarSesionExitosa({
          user: usuarioLocal.user,
          pass: usuarioLocal.pass,
          rol: usuarioLocal.rol || "OPERADOR",
          email: usuarioLocal.email || "yuniolgonzalez9@gmail.com",
          estado: usuarioLocal.estado || "ACTIVO"
        });
        return;
      }
      mostrarFeedback(fb, "Contraseña incorrecta o usuario no registrado.", "var(--red)");
    };
    req.onerror = () => mostrarFeedback(fb, "Contraseña incorrecta.", "var(--red)");
    return;
  }

  mostrarFeedback(fb, "Contraseña incorrecta.", "var(--red)");
};

function iniciarSesionExitosa(user, esRestauracion = false) {
  usuarioActual = user;
  localStorage.setItem("scada_logged_user", JSON.stringify(user));
  
  const un = document.getElementById("currentUserName");
  if (un) un.innerText = user.user.toUpperCase();
  const b = document.getElementById("currentUserRoleBadge");
  if (b) b.innerText = user.rol;

  aplicarPermisosRol();
  resetearTemporizadorInactividad();

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
  el.style.background = "var(--bg-card)";
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
  btn.innerText = "⏳ TRANSMITIENDO...";

  let targetEmail = "yuniolgonzalez9@gmail.com";

  if (sbClient) {
    try {
      const { data } = await sbClient.from('usuarios_scada').select('email').eq('user', u).maybeSingle();
      if (data && data.email) targetEmail = data.email;
    } catch(e) {}
  }

  const otpCode = Math.random().toString(36).substring(2, 8).toUpperCase();

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
    try { 
      await sbClient.from('usuarios_scada').update({ pass: p1 }).eq('user', usuarioActual.user); 
      await registrarAuditoriaAcceso(usuarioActual.user, usuarioActual.rol, 'CAMBIO_CLAVE', 'Contraseña modificada con éxito');
    } catch(e) {}
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
  notify("☁️ Contraseña actualizada en la nube", "var(--green)");
};

// =========================================================================
// 23. REFRESCO PERIÓDICO DEL MONITOR Y CARGA INICIAL
// =========================================================================
setInterval(() => {
  if (currentActivity === 'act-telemetry') {
    renderFleetDashboard();
  }
}, 2000);

window.addEventListener("load", () => {
  inicializarConfigVisualGuardada();
  initDB();
  initMQTT();
});

