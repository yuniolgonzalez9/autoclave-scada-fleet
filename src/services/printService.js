// =========================================================================
// Servicio central de impresión.
// - Preferencias por estación (localStorage): impresora elegida + reglas de
//   auto-impresión (ticket al crear paquete, comprobante al iniciar ciclo,
//   reporte forense al finalizar).
// - Dentro del Hub (exe): impresión SILENCIOSA real vía Electron
//   (hub:printHtml → ventana oculta → spooler del SO a la impresora elegida).
// - En navegador: iframe oculto + window.print() (diálogo del sistema).
// =========================================================================

const PREFS_KEY = 'biofleet_print_prefs_v1';

const DEFAULT_PREFS = {
  printerName: '',        // '' = predeterminada del sistema
  autoTicket: true,       // imprimir ticket al registrar paquete
  autoInicio: false,      // comprobante cuando el ciclo arranca
  autoFin: true,          // reporte forense al terminar el ciclo
  autoReporte: false      // reservado: auto-imprimir reportes de servicio
};

export function getPrintPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')) };
  } catch (_) {
    return { ...DEFAULT_PREFS };
  }
}

export function setPrintPrefs(patch) {
  const next = { ...getPrintPrefs(), ...(patch || {}) };
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch (_) {}
  return next;
}

// Impresoras disponibles: Electron nativo (nombre exacto del driver) con
// fallback a wmic/lpstat y por último a "solo predeterminada".
export async function listAvailablePrinters() {
  if (typeof window !== 'undefined' && window.biofleetHub?.isHub) {
    try {
      const v2 = await window.biofleetHub.printersV2?.();
      if (Array.isArray(v2) && v2.length) {
        return v2.map((p) => ({ name: p.name || p.displayName, label: p.displayName || p.name, default: Boolean(p.isDefault) }));
      }
    } catch (_) {}
    try {
      const v1 = await window.biofleetHub.printers?.();
      if (Array.isArray(v1) && v1.length) {
        return v1.map((p) => ({ name: p.name, label: p.name, default: Boolean(p.default) }));
      }
    } catch (_) {}
  }
  return [];
}

// Imprime un documento HTML. En el Hub es silencioso (impresora elegida);
// en navegador abre el diálogo del sistema desde un iframe oculto.
export async function printDoc({ title = 'Documento', html = '', printerName } = {}) {
  if (typeof window !== 'undefined' && window.biofleetHub?.isHub && window.biofleetHub.printHtml) {
    try {
      const r = await window.biofleetHub.printHtml({ html, deviceName: printerName || undefined });
      return { ok: Boolean(r?.ok), err: r?.err };
    } catch (e) {
      return { ok: false, err: e?.message };
    }
  }
  return printViaIframe(title, html);
}

function printViaIframe(title, html) {
  return new Promise((resolve) => {
    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${html}</body></html>`);
      doc.close();
      const cleanup = () => { try { document.body.removeChild(iframe); } catch (_) {} };
      iframe.contentWindow.onafterprint = cleanup;
      setTimeout(() => {
        try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (e) {}
        setTimeout(cleanup, 60000);
      }, 250);
      resolve({ ok: true });
    } catch (e) {
      resolve({ ok: false, err: e?.message });
    }
  });
}

// ── Helpers de formato ──
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fdate = (ts) => (ts ? new Date(ts).toLocaleString() : '—');

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; margin: 0; padding: 24px; }
  .doc { max-width: 720px; margin: 0 auto; border: 2px solid #111; border-radius: 10px; padding: 20px; }
  .head { text-align: center; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 14px; }
  .head h1 { margin: 0; font-size: 15px; letter-spacing: 1px; text-transform: uppercase; }
  .head p { margin: 3px 0 0; font-size: 10px; color: #444; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  td, th { padding: 5px 8px; border-bottom: 1px solid #ddd; text-align: left; vertical-align: top; }
  th { width: 40%; color: #444; font-weight: 600; }
  .big-code { font-size: 44px; font-weight: 900; letter-spacing: 8px; text-align: center;
    font-family: 'Consolas','JetBrains Mono',monospace; margin: 10px 0; }
  .estado { display: inline-block; padding: 3px 12px; border-radius: 20px; font-weight: 800; font-size: 12px; }
  .ok { background: #dcfce7; color: #166534; } .warn { background: #fef9c3; color: #854d0e; }
  .bad { background: #fee2e2; color: #991b1b; } .info { background: #e0f2fe; color: #075985; }
  .foot { margin-top: 14px; padding-top: 8px; border-top: 1px dashed #999; font-size: 9px;
    text-align: center; color: #555; }
  .qr { text-align: center; margin: 8px 0; } .qr img { width: 130px; height: 130px; }
`;

// QR público gratuito (sin dependencias nativas): api.qrserver.com
const qrImg = (text, size = 150) =>
  `<img src="https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}" alt="QR">`;

const publicUrl = (codigo) => `https://biofle.vercel.app/?consulta=${encodeURIComponent(codigo)}`;

// ── Ticket de recepción del paquete (se entrega al cliente) ──
export function buildPackageTicketDoc(pkg = {}) {
  const html = `<style>${BASE_CSS}</style>
  <div class="doc">
    <div class="head">
      <h1>Central de Esterilización · Ticket de Recepción</h1>
      <p>BIOFLEET OS · CONTROL DE PAQUETES ESTÉRILES</p>
    </div>
    <div class="big-code">${esc(pkg.codigo)}</div>
    <div class="qr">${qrImg(publicUrl(pkg.codigo))}</div>
    <table>
      <tr><th>CLIENTE</th><td>${esc(pkg.cliente)}</td></tr>
      <tr><th>CONTENIDO</th><td>${esc(pkg.contenido || '—')}</td></tr>
      <tr><th>EQUIPO</th><td>${esc(pkg.equipo_alias || pkg.mac)}</td></tr>
      <tr><th>PROGRAMA</th><td>${esc(pkg.programa)}</td></tr>
      <tr><th>VIGENCIA ESTÉRIL</th><td>${Number(pkg.dias_esterilidad) || 30} días tras ciclo conforme</td></tr>
      <tr><th>RECIBIDO</th><td>${fdate(pkg.creado_at || Date.now())}</td></tr>
      <tr><th>OPERADOR</th><td>${esc(pkg.creado_por || '—')}</td></tr>
    </table>
    <div class="foot">
      Consulte el estado de su paquete escaneando el QR o en<br>
      <strong>${esc(publicUrl(pkg.codigo)).replace(/</g,'&lt;')}</strong><br>
      Conserve este ticket — será requerido para la entrega.
    </div>
  </div>`;
  return { title: `Ticket Paquete ${pkg.codigo}`, html };
}

// ── Comprobante de inicio de ciclo (opción "en tiempo real") ──
export function buildStartSlipDoc(pkg = {}, dev = {}) {
  const html = `<style>${BASE_CSS}</style>
  <div class="doc">
    <div class="head">
      <h1>Ciclo Iniciado · Paquete en Proceso</h1>
      <p>BIOFLEET OS · SEGUIMIENTO EN TIEMPO REAL</p>
    </div>
    <div class="big-code">${esc(pkg.codigo)}</div>
    <table>
      <tr><th>ESTADO</th><td><span class="estado info">EN PROCESO</span></td></tr>
      <tr><th>EQUIPO</th><td>${esc(dev?.meta?.alias || pkg.equipo_alias || pkg.mac)}</td></tr>
      <tr><th>PROGRAMA</th><td>${esc(pkg.programa)}</td></tr>
      <tr><th>FASE ACTUAL</th><td>${esc(dev?.datos?.fase || 'INICIANDO')}</td></tr>
      <tr><th>INICIO</th><td>${fdate(Date.now())}</td></tr>
    </table>
    <div class="foot">Documento de control interno — el resultado final se emite al cierre del ciclo.</div>
  </div>`;
  return { title: `Inicio Ciclo ${pkg.codigo}`, html };
}

// ── Reporte forense de fin de ciclo ──
export function buildCycleReportDoc(dev = {}, reporte = {}) {
  const conforme = /CONFORME/i.test(reporte.diagnostico_principal || reporte.fase_final || '');
  const fases = Array.isArray(reporte.ciclos_detalle) ? reporte.ciclos_detalle : [];
  const eventos = Array.isArray(reporte.eventos) ? reporte.eventos.slice(0, 20) : [];
  const filas = (arr, fmt) =>
    arr.map((x) => `<tr><td colspan="2" style="font-size:11px">${esc(fmt(x))}</td></tr>`).join('');
  const html = `<style>${BASE_CSS}</style>
  <div class="doc">
    <div class="head">
      <h1>Reporte Forense de Esterilización</h1>
      <p>BIOFLEET OS · ${esc(dev?.meta?.alias || reporte.alias || reporte.mac || '')}</p>
    </div>
    <table>
      <tr><th>RESULTADO</th><td><span class="estado ${conforme ? 'ok' : 'bad'}">${esc(reporte.diagnostico_principal || '—')}</span></td></tr>
      <tr><th>SESIÓN</th><td>${esc(reporte.session_id || '—')}</td></tr>
      <tr><th>EQUIPO</th><td>${esc(dev?.meta?.alias || reporte.alias || reporte.mac || '—')}</td></tr>
      <tr><th>PROGRAMA</th><td>${esc(reporte.programa || '—')}</td></tr>
      <tr><th>INICIO</th><td>${esc(reporte.inicio_ciclo || reporte.hora_encendido || '—')}</td></tr>
      <tr><th>FIN</th><td>${esc(reporte.hora_apagado || '—')}</td></tr>
      <tr><th>DURACIÓN</th><td>${Math.round(Number(reporte.duracion_total_seg || 0) / 60)} min</td></tr>
      <tr><th>TEMP MÁX</th><td>${Number(reporte.temp_max || 0).toFixed(1)} °C</td></tr>
      <tr><th>PRESIÓN MÁX</th><td>${Number(reporte.pres_max || 0).toFixed(2)} bar</td></tr>
      <tr><th>CICLO N°</th><td>${Number(reporte.ciclos_acumulados || reporte.ciclos || 0)}</td></tr>
      <tr><th>ALARMAS</th><td>${Number(reporte.conteo_alarmas || 0)}</td></tr>
      <tr><th>FASE FINAL</th><td>${esc(reporte.fase_final || '—')}</td></tr>
      ${fases.length ? `<tr><th>FASES</th><td></td></tr>${filas(fases, (f) => (typeof f === 'string' ? f : `${f.fase || f.nombre || ''} — ${f.seg || f.duracion || f.duracion_seg || ''}s`))}` : ''}
      ${eventos.length ? `<tr><th>EVENTOS</th><td></td></tr>${filas(eventos, (e) => (typeof e === 'string' ? e : `${e.hora || e.t || ''} ${e.msg || e.evento || ''}`))}` : ''}
    </table>
    <div class="foot">
      Liberación paramétrica · ISO 17665 / EN 285<br>
      Documento generado automáticamente por Biofleet Hub — ${fdate(Date.now())}
    </div>
  </div>`;
  return { title: `Reporte Ciclo ${reporte.session_id || ''}`, html };
}

// ── Comprobante de entrega al cliente ──
export function buildDeliveryDoc(pkg = {}) {
  const html = `<style>${BASE_CSS}</style>
  <div class="doc">
    <div class="head">
      <h1>Comprobante de Entrega · Paquete Estéril</h1>
      <p>BIOFLEET OS</p>
    </div>
    <div class="big-code">${esc(pkg.codigo)}</div>
    <table>
      <tr><th>CLIENTE</th><td>${esc(pkg.cliente)}</td></tr>
      <tr><th>CONTENIDO</th><td>${esc(pkg.contenido || '—')}</td></tr>
      <tr><th>EQUIPO</th><td>${esc(pkg.equipo_alias || pkg.mac)}</td></tr>
      <tr><th>ESTERILIZADO</th><td>${fdate(pkg.esterilizado_at)}</td></tr>
      <tr><th>VÁLIDO HASTA</th><td><strong>${fdate(pkg.expira_at)}</strong></td></tr>
      <tr><th>ENTREGADO</th><td>${fdate(Date.now())}</td></tr>
    </table>
    <div class="foot">
      No usar si el empaque está húmedo, roto o vencida la fecha.<br>
      Firma de recepción: ______________________________
    </div>
  </div>`;
  return { title: `Entrega ${pkg.codigo}`, html };
}
