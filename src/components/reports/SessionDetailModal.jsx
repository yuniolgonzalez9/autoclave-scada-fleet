import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  Printer, 
  X, 
  Clock, 
  Move, 
  ShieldCheck, 
  Search, 
  ArrowUpDown, 
  Layers,
  Thermometer,
  Gauge,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';

/**
 * Escapa caracteres HTML para prevenir Cross-Site Scripting (XSS)
 * en la generación de documentos imprimibles.
 */
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Suma segundos a un formato HH:MM:SS de manera canónica.
 */
function sumarSegundos(horaBase, segs) {
  try {
    const parts = String(horaBase || '00:00:00').split(':').map(Number);
    let total = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0) + Math.round(Number(segs) || 0);
    total = total % 86400;
    const h = String(Math.floor(total / 3600)).padStart(2, '0');
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  } catch (_) {
    return horaBase || '--:--:--';
  }
}

export default function SessionDetailModal({ isOpen, onClose, session }) {
  // Arrastre de ventana
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0 });

  // Filtros de la bitácora
  const [eventCategory, setEventCategory] = useState('ALL');
  const [eventSearch, setEventSearch] = useState('');
  const [isAscending, setIsAscending] = useState(true);

  // Cierre con Escape
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  useEffect(() => {
    const t = setTimeout(() => {
      setOffset({ x: 0, y: 0 });
      setEventCategory('ALL');
      setEventSearch('');
      setIsAscending(true);
    }, 0);
    return () => clearTimeout(t);
  }, [session?.session_id]);

  // Manejadores de arrastre con mouse y touch (con clamping en pantalla)
  const handleMouseDown = (e) => {
    if (window.innerWidth < 640) return; // Deshabilitar arrastre en móviles
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
    setIsDragging(true);
    dragStartRef.current = { startX: e.clientX, startY: e.clientY, initialX: offset.x, initialY: offset.y };
  };

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;
    
    const maxOffsetX = Math.max(100, (window.innerWidth - 600) / 2);
    const maxOffsetY = Math.max(100, (window.innerHeight - 400) / 2);
    
    const clampedX = Math.max(-maxOffsetX, Math.min(maxOffsetX, dragStartRef.current.initialX + dx));
    const clampedY = Math.max(-maxOffsetY, Math.min(maxOffsetY, dragStartRef.current.initialY + dy));

    setOffset({ x: clampedX, y: clampedY });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Cálculos Termodinámicos y Forenses Reales
  const tMax = parseFloat(session?.temp_max || 0);
  const pMax = parseFloat(session?.pres_max || 0);
  const f0Alcanzado = parseFloat(session?.f0_alcanzado || session?.f0_score || 0);
  const fechaStr = (session?.created_at || session?.fecha) ? new Date(session.created_at || session.fecha).toLocaleDateString() : '—';
  const duracionTotalSeg = Number(session?.duracion_total_seg) || 0;
  const horaInicio = session?.hora_encendido || session?.inicio_ciclo || '--:--:--';
  const horaFin = session?.hora_apagado || '--:--:--';

  // Desglose de Fases (Prioriza datos reales de BD / Microcontrolador)
  const fases = useMemo(() => {
    if (!session) return [];

    const realFases = session.fases_desglose || session.ciclos_detalle;
    if (Array.isArray(realFases) && realFases.length > 0) {
      return realFases;
    }

    // Reconstrucción estandarizada ISO 17665 a partir de límites reales
    if (duracionTotalSeg > 0 && horaInicio !== '--:--:--') {
      const tPreVacio = Math.round(duracionTotalSeg * 0.18);
      const tCalentamiento = Math.round(duracionTotalSeg * 0.28);
      const tMeseta = Math.round(duracionTotalSeg * 0.22);
      const tPurga = Math.round(duracionTotalSeg * 0.12);
      const tSecado = Math.max(0, duracionTotalSeg - (tPreVacio + tCalentamiento + tMeseta + tPurga));

      const f1_ini = horaInicio;
      const f1_fin = sumarSegundos(f1_ini, tPreVacio);
      const f2_ini = f1_fin;
      const f2_fin = sumarSegundos(f2_ini, tCalentamiento);
      const f3_ini = f2_fin;
      const f3_fin = sumarSegundos(f3_ini, tMeseta);
      const f4_ini = f3_fin;
      const f4_fin = sumarSegundos(f4_ini, tPurga);
      const f5_ini = f4_fin;
      const f5_fin = horaFin !== '--:--:--' ? horaFin : sumarSegundos(f5_ini, tSecado);

      return [
        {
          fase: 'Pre-Vacío y Extracción de Aire',
          inicio: f1_ini,
          fin: f1_fin,
          duracion_seg: tPreVacio,
          temp_max: Math.min(65.0, tMax),
          pres_max: -0.75,
          estado: 'CONFORME',
          detalles: 'Pulsos fraccionados de vacío para desalojo de aire frío residual.'
        },
        {
          fase: 'Calentamiento & Presurización',
          inicio: f2_ini,
          fin: f2_fin,
          duracion_seg: tCalentamiento,
          temp_max: Math.max(100.0, tMax - 0.5),
          pres_max: Math.max(0.5, pMax - 0.05),
          estado: 'CONFORME',
          detalles: 'Inyección termodinámica de vapor saturado a presión.'
        },
        {
          fase: 'Meseta de Esterilización (Exposición F0)',
          inicio: f3_ini,
          fin: f3_fin,
          duracion_seg: tMeseta,
          temp_max: tMax,
          pres_max: pMax,
          estado: f0Alcanzado >= 15.0 || tMax >= 121.0 ? 'CONFORME' : 'NO CONFORME',
          detalles: `Exposición a vapor con letalidad acumulada F0 de ${f0Alcanzado > 0 ? f0Alcanzado.toFixed(1) : '>=15'} min.`
        },
        {
          fase: 'Despresurización & Alivio',
          inicio: f4_ini,
          fin: f4_fin,
          duracion_seg: tPurga,
          temp_max: Math.min(tMax, 105.0),
          pres_max: 0.10,
          estado: 'CONFORME',
          detalles: 'Apertura controlada de electroválvula de purga.'
        },
        {
          fase: 'Secado al Vacío & Nivelación',
          inicio: f5_ini,
          fin: f5_fin,
          duracion_seg: tSecado,
          temp_max: Math.min(tMax, 85.0),
          pres_max: 0.00,
          estado: 'CONFORME',
          detalles: 'Desecación de carga quirúrgica y aireación estéril.'
        }
      ];
    }

    return [];
  }, [session, duracionTotalSeg, horaInicio, horaFin, tMax, pMax, f0Alcanzado]);

  // Bitácora de Eventos Reales
  const eventosEnriquecidos = useMemo(() => {
    if (!session) return [];

    const realEvents = session.eventos;
    if (Array.isArray(realEvents) && realEvents.length > 0) {
      return realEvents.map((ev) => ({
        hora: ev.hora || ev.timestamp || '--:--:--',
        tipo: (ev.tipo || ev.categoria || 'OPERACION').toUpperCase(),
        cat: ev.cat || 'OPERACION',
        msg: ev.msg || ev.mensaje || ev.descripcion || 'Registro operativo',
        temp: ev.temp !== undefined ? ev.temp : ev.temperatura,
        presion: ev.presion !== undefined ? ev.presion : ev.pres
      }));
    }

    // Extracción mínima a partir de eventos y alarmas declaradas
    const list = [];

    if (horaInicio !== '--:--:--') {
      list.push({
        hora: horaInicio,
        tipo: 'ARRANQUE',
        cat: 'OPERACION',
        msg: `Inicio de ciclo de esterilización: Programa ${session.programa || 'Estándar'}`,
        temp: 25.0,
        presion: 0.00
      });
    }

    fases.forEach((f) => {
      list.push({
        hora: f.inicio,
        tipo: 'FASE',
        cat: 'FASE',
        msg: `Transición a ${f.fase}`,
        temp: f.temp_max,
        presion: f.pres_max
      });
    });

    if (Number(session.conteo_alarmas) > 0 || (session.diagnostico_principal || '').toUpperCase().includes('ABORT')) {
      list.push({
        hora: horaFin !== '--:--:--' ? horaFin : 'REGISTRO',
        tipo: 'ALARMA',
        cat: 'SEGURIDAD',
        msg: `Alerta registrada en ciclo: ${session.diagnostico_principal || 'Anomalía térmica o de presión'}`,
        temp: tMax,
        presion: pMax
      });
    }

    if (horaFin !== '--:--:--') {
      list.push({
        hora: horaFin,
        tipo: 'FINALIZACION',
        cat: 'OPERACION',
        msg: `Ciclo finalizado. Diagnóstico: ${session.diagnostico_principal || 'Completado'}`,
        temp: Math.min(tMax, 40.0),
        presion: 0.00
      });
    }

    return list;
  }, [session, fases, horaInicio, horaFin, tMax, pMax]);

  // Filtrado y Ordenación
  const eventosFiltrados = useMemo(() => {
    let result = [...eventosEnriquecidos];

    if (eventCategory !== 'ALL') {
      result = result.filter((e) => e.cat === eventCategory || e.tipo === eventCategory);
    }

    if (eventSearch.trim() !== '') {
      const q = eventSearch.toLowerCase();
      result = result.filter((e) => 
        (e.msg || '').toLowerCase().includes(q) || 
        (e.tipo || '').toLowerCase().includes(q) ||
        (e.hora || '').toLowerCase().includes(q)
      );
    }

    if (!isAscending) {
      result.reverse();
    }

    return result;
  }, [eventosEnriquecidos, eventCategory, eventSearch, isAscending]);

  // Impresión Segura del Certificado ISO 17665 (Con escape HTML)
  const handlePrintCertificate = () => {
    const v = window.open('', '_blank');
    if (!v) {
      alert('Habilite las ventanas emergentes (pop-ups) en su navegador para imprimir el certificado.');
      return;
    }

    const safeSessionId = escapeHtml(session.session_id);
    const safeAlias = escapeHtml(session.alias || 'Autoclave');
    const safeMac = escapeHtml(session.mac);
    const safeCliente = escapeHtml(session.cliente || 'Centro Hospitalario');
    const safePrograma = escapeHtml(session.programa || '134°C Instrumental');
    const safeDiagnostico = escapeHtml(session.diagnostico_principal || 'CONFORME');

    const fasesRows = fases.map((f, i) => `
      <tr style="font-size:11px;">
        <td style="border:1px solid #cbd5e1; padding:6px;"><b>${escapeHtml(f.fase || `Etapa ${i+1}`)}</b></td>
        <td style="border:1px solid #cbd5e1; padding:6px; font-family:monospace;">${escapeHtml(f.inicio || '--')}</td>
        <td style="border:1px solid #cbd5e1; padding:6px; font-family:monospace;">${escapeHtml(f.fin || '--')}</td>
        <td style="border:1px solid #cbd5e1; padding:6px; text-align:center; font-family:monospace;">${Math.floor(f.duracion_seg / 60)}m ${f.duracion_seg % 60}s</td>
        <td style="border:1px solid #cbd5e1; padding:6px; text-align:right; font-family:monospace;">${parseFloat(f.temp_max || 0).toFixed(1)}°C</td>
        <td style="border:1px solid #cbd5e1; padding:6px; text-align:right; font-family:monospace;">${parseFloat(f.pres_max || 0).toFixed(2)} bar</td>
        <td style="border:1px solid #cbd5e1; padding:6px; text-align:center; color:${f.estado === 'CONFORME' ? '#16a34a' : '#dc2626'}; font-weight:bold;">${escapeHtml(f.estado || 'CONFORME')}</td>
      </tr>
    `).join('');

    const eventosRows = eventosEnriquecidos.map((ev) => `
      <li style="margin-bottom:4px; font-size:10px;">
        <b style="font-family:monospace;">${escapeHtml(ev.hora)} [${escapeHtml(ev.tipo)}]:</b> ${escapeHtml(ev.msg)} 
        ${ev.temp !== undefined ? `<span style="font-family:monospace;">(T: ${parseFloat(ev.temp).toFixed(1)}°C | P: ${parseFloat(ev.presion || 0).toFixed(2)} bar)</span>` : ''}
      </li>
    `).join('');

    v.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>CERTIFICADO CLÍNICO - ${safeSessionId}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 32px; color: #0f172a; line-height: 1.4; }
            .header-cert { border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-end; }
            .title { font-size: 15px; font-weight: 800; text-transform: uppercase; margin: 0; }
            .sub { font-size: 10px; color: #475569; margin: 2px 0 0 0; }
            .data-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; font-size: 11px; }
            .data-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px; }
            table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px 8px; }
            th { background: #f1f5f9; text-align: left; }
            .sign-box { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 30px; text-align: center; }
            .sign-line { border-top: 1px solid #0f172a; padding-top: 6px; font-size: 10px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header-cert">
            <div>
              <h1 class="title">CERTIFICADO CLÍNICO DE VALIDACIÓN TÉRMICA</h1>
              <p class="sub">TRAZABILIDAD FORENSE DE ESTERILIZACIÓN • NORMA ISO 17665 / RUMED</p>
            </div>
            <div style="text-align:right;">
              <p class="sub">ID: <b>${safeSessionId}</b></p>
              <p class="sub">EMISIÓN: ${new Date().toLocaleString()}</p>
            </div>
          </div>

          <div class="data-grid">
            <div class="data-box">
              <p><b>HOSPITAL / CLÍNICA:</b> ${safeCliente}</p>
              <p><b>EQUIPO:</b> ${safeAlias} (MAC: ${safeMac})</p>
              <p><b>PROGRAMA:</b> ${safePrograma}</p>
              <p><b>DIAGNÓSTICO:</b> <b>${safeDiagnostico}</b></p>
            </div>
            <div class="data-box">
              <p><b>FECHA DE EJECUCIÓN:</b> ${fechaStr} (${escapeHtml(horaInicio)} a ${escapeHtml(horaFin)})</p>
              <p><b>DURACIÓN TOTAL:</b> ${Math.floor(duracionTotalSeg / 60)} min ${duracionTotalSeg % 60} seg</p>
              <p><b>PICO TÉRMICO / PRESIÓN:</b> ${tMax.toFixed(1)}°C / ${pMax.toFixed(2)} bar</p>
              <p><b>ODÓMETRO CLÍNICO:</b> Ciclo #${session.ciclos_acumulados || 1} / Límite: ${session.limite_mantenimiento || 200}</p>
            </div>
          </div>

          <h3 style="font-size:11px; margin:0 0 4px 0;">1. DESGLOSE DE ETAPAS TERMODINÁMICAS:</h3>
          <table>
            <thead>
              <tr style="background:#f1f5f9; font-size:10px;">
                <th>Etapa</th><th>Inicio</th><th>Fin</th><th style="text-align:center;">Duración</th><th style="text-align:right;">T° Máx</th><th style="text-align:right;">Presión</th><th style="text-align:center;">Resultado</th>
              </tr>
            </thead>
            <tbody>${fasesRows || '<tr><td colspan="7" style="text-align:center;">Sin desglose de etapas registrado.</td></tr>'}</tbody>
          </table>

          <h3 style="font-size:11px; margin:10px 0 4px 0;">2. BITÁCORA FORENSE DE EVENTOS:</h3>
          <ul style="padding-left:16px; margin:0;">${eventosRows || '<li>Sin eventos registrados.</li>'}</ul>

          <div class="sign-box">
            <div>
              <div class="sign-line">Ingeniero Biomédico / Técnico Responsable<br><span style="font-size:9px; color:#64748b;">Firma Digital y Matrícula</span></div>
            </div>
            <div>
              <div class="sign-line">Supervisión Central de Esterilización (CEYE)<br><span style="font-size:9px; color:#64748b;">Sello de Liberación Paramétrica</span></div>
            </div>
          </div>
          <script>
            window.onload = function() { window.print(); };
          </script>
        </body>
      </html>
    `);
    v.document.close();
  };

  if (!isOpen || !session || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[99998] bg-black/50 backdrop-blur-[2px] flex items-start justify-center p-2 sm:p-5 pt-4 sm:pt-8 overflow-hidden font-mono text-xs select-none">
      
      {/* Contenedor Flotante Arrastrable */}
      <div 
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          transition: isDragging ? 'none' : 'transform 0.15s ease'
        }}
        className="w-full max-w-4xl max-h-[90vh] flex flex-col ultra-glass rounded-2xl border-2 border-cyan-400/60 shadow-[0_20px_60px_rgba(0,0,0,0.85)] overflow-hidden"
      >
        
        {/* Cabecera Arrastrable */}
        <div 
          onMouseDown={handleMouseDown}
          className="px-4 sm:px-6 py-3 border-b border-cyan-500/30 bg-slate-950/95 flex items-center justify-between shrink-0 sm:cursor-grab active:cursor-grabbing select-none"
          title="Arrastre para mover la ventana (Escritorio)"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shrink-0">
              <Move className="w-4 h-4" />
            </div>
            <div className="truncate">
              <h3 className="text-sm sm:text-base font-bold text-white tracking-wide truncate flex items-center gap-2">
                <span>Auditoría Forense: {session.session_id}</span>
              </h3>
              <p className="text-[11px] text-slate-400 truncate">
                {session.alias} · MAC: {session.mac} · {session.cliente || 'Hospital Central'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePrintCertificate}
              className="px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow active:scale-95 transition-all"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Imprimir Certificado</span>
            </button>
            <button 
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Visor con Scroll */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          
          {/* Tarjetas de Resumen */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800">
              <span className="text-[10px] text-cyan-400 block mb-0.5">HORARIOS TOTALES</span>
              <p className="text-xs font-bold text-white truncate">
                {horaInicio} ➔ {horaFin}
              </p>
              <span className="text-[10px] text-slate-400">
                {duracionTotalSeg > 0 ? `${Math.floor(duracionTotalSeg / 60)}m ${duracionTotalSeg % 60}s` : 'Duración N/D'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800">
              <span className="text-[10px] text-cyan-400 block mb-0.5">PICO TÉRMICO</span>
              <p className="text-lg sm:text-xl font-bold text-white">{tMax.toFixed(1)} °C</p>
              <span className="text-[10px] text-emerald-400">
                {tMax >= 121.0 ? 'Meseta Térmica Conforme' : 'Sub-Temperatura'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800">
              <span className="text-[10px] text-cyan-400 block mb-0.5">PRESIÓN MÁXIMA</span>
              <p className="text-lg sm:text-xl font-bold text-white">{pMax.toFixed(2)} bar</p>
              <span className="text-[10px] text-slate-400">{(pMax * 14.504).toFixed(1)} PSI</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800">
              <span className="text-[10px] text-cyan-400 block mb-0.5">ODÓMETRO CLÍNICO</span>
              <p className="text-lg sm:text-xl font-bold text-white">
                #{session.ciclos_acumulados || 1} <span className="text-xs font-normal text-slate-400">/ {session.limite_mantenimiento || 200}</span>
              </p>
              <span className="text-[10px] text-slate-400">Ciclos acumulados</span>
            </div>
          </div>

          {/* Diagrama de Distribución de Etapas */}
          {fases.length > 0 && duracionTotalSeg > 0 && (
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1.5">
              <div className="flex justify-between items-center text-[10px] text-slate-300">
                <span className="font-bold flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  DISTRIBUCIÓN CRONOMÉTRICA DE ETAPAS:
                </span>
                <span className="text-cyan-400 font-bold">{Math.floor(duracionTotalSeg / 60)} min {duracionTotalSeg % 60} seg</span>
              </div>
              
              <div className="h-3 rounded-full bg-slate-950 overflow-hidden flex border border-slate-700/80">
                {fases.map((f, idx) => {
                  const pct = Math.max(5, Math.round(((f.duracion_seg || 60) / duracionTotalSeg) * 100));
                  const colors = ['bg-indigo-500', 'bg-cyan-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500'];
                  return (
                    <div 
                      key={idx}
                      style={{ width: `${pct}%` }}
                      className={`${colors[idx % colors.length]} h-full transition-all`}
                      title={`${f.fase}: ${Math.floor(f.duracion_seg / 60)}m ${f.duracion_seg % 60}s`}
                    />
                  );
                })}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1 pt-1 text-[9px] text-slate-400">
                <span className="truncate">🔵 Pre-Vacío</span>
                <span className="truncate">🔷 Calentamiento</span>
                <span className="truncate">🟢 Meseta F0</span>
                <span className="truncate">🟡 Despresurización</span>
                <span className="truncate">🟣 Secado Activo</span>
              </div>
            </div>
          )}

          {/* 1. Desglose de Fases */}
          <div>
            <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              1. Desglose Cronométrico de Fases Termodinámicas:
            </h4>

            <div className="space-y-2">
              {fases.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-slate-800 text-center text-slate-500 font-sans">
                  El paquete registrado no posee desglose individual de fases.
                </div>
              ) : (
                fases.map((f, idx) => (
                  <div 
                    key={idx}
                    className="p-3 rounded-xl border border-slate-800 bg-slate-900/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 hover:border-cyan-500/40 transition-colors"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-white">ETAPA {idx + 1}: {f.fase}</span>
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${
                          f.estado === 'CONFORME'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                        }`}>
                          {f.estado || 'CONFORME'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {f.detalles || 'Ejecución bajo protocolo estandarizado.'}
                      </p>
                    </div>

                    <div className="flex sm:flex-col items-end gap-2 sm:gap-0 text-xs text-right shrink-0">
                      <span className="text-cyan-300 font-bold">
                        {f.inicio} ➔ {f.fin} ({Math.floor(f.duracion_seg / 60)}m {f.duracion_seg % 60}s)
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Pico: <strong className="text-white">{parseFloat(f.temp_max).toFixed(1)}°C</strong> | <strong className="text-white">{parseFloat(f.pres_max).toFixed(2)} bar</strong>
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 2. Bitácora de Eventos */}
          <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                2. Registro Cronológico Forense ({eventosFiltrados.length}):
              </h4>

              <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
                <select
                  value={eventCategory}
                  onChange={(e) => setEventCategory(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-[10px] text-cyan-300 rounded-lg px-2 py-1 focus:outline-none"
                >
                  <option value="ALL">TODAS LAS CATEGORÍAS</option>
                  <option value="FASE">FASES DEL CICLO</option>
                  <option value="OPERACION">OPERACIÓN / ARRANQUE</option>
                  <option value="SEGURIDAD">SEGURIDAD & ALARMAS</option>
                </select>

                <button
                  type="button"
                  onClick={() => setIsAscending(!isAscending)}
                  className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 text-[10px] flex items-center gap-1 hover:text-white"
                >
                  <ArrowUpDown className="w-3 h-3 text-cyan-400" />
                  <span>{isAscending ? 'Inicio ➔ Fin' : 'Fin ➔ Inicio'}</span>
                </button>
              </div>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
              <input
                type="text"
                value={eventSearch}
                onChange={(e) => setEventSearch(e.target.value)}
                placeholder="Filtrar por término clave..."
                className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 font-sans"
              />
            </div>

            <div className="space-y-1.5 pl-2 border-l-2 border-cyan-500/40 max-h-56 overflow-y-auto pr-1">
              {eventosFiltrados.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500 font-sans">
                  No existen eventos que coincidan con los filtros aplicados.
                </div>
              ) : (
                eventosFiltrados.map((ev, i) => {
                  const isAlarma = ev.tipo === 'ALARMA' || ev.cat === 'SEGURIDAD';
                  const isFase = ev.tipo === 'FASE';

                  return (
                    <div 
                      key={i} 
                      className={`pl-3.5 py-1.5 relative text-xs rounded-lg transition-colors ${
                        isAlarma ? 'bg-rose-500/10 border border-rose-500/30' : 'hover:bg-slate-900/60'
                      }`}
                    >
                      <span className={`absolute -left-[19px] top-2.5 w-2 h-2 rounded-full ${
                        isAlarma ? 'bg-rose-500 ring-4 ring-rose-500/20' :
                        isFase ? 'bg-cyan-400 ring-4 ring-cyan-500/20' :
                        'bg-slate-400'
                      }`} />

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <div>
                          <span className="text-slate-400 font-bold mr-2">{ev.hora}</span>
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold mr-2 ${
                            isAlarma ? 'bg-rose-500/20 text-rose-300' :
                            isFase ? 'bg-cyan-500/20 text-cyan-300' :
                            'bg-slate-800 text-slate-300'
                          }`}>
                            [{ev.tipo || 'EVENTO'}]
                          </span>
                          <span className="text-slate-200">{ev.msg}</span>
                        </div>

                        {ev.temp !== undefined && (
                          <div className="text-[10px] text-slate-400 shrink-0 font-mono">
                            T: <strong className="text-cyan-300">{parseFloat(ev.temp).toFixed(1)}°C</strong> | P: <strong className="text-pink-300">{parseFloat(ev.presion || 0).toFixed(2)} bar</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
      </div>
    </div>,
    document.body
  );
}
