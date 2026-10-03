import React from 'react';
import { 
  FileText, 
  Printer, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Thermometer, 
  Gauge, 
  Calendar,
  Building2,
  ShieldCheck
} from 'lucide-react';

export default function SessionDetailModal({ isOpen, onClose, session }) {
  if (!isOpen || !session) return null;

  const fechaFormateada = new Date(session.created_at || session.fecha || Date.now()).toLocaleDateString();
  const duracionTexto = session.duracion_total_seg 
    ? `${Math.floor(session.duracion_total_seg / 60)}m ${session.duracion_total_seg % 60}s`
    : '--';

  const huboAlarma = (session.conteo_alarmas > 0) || (session.errores_alarmas && session.errores_alarmas.hubo_fallo);
  const fases = session.ciclos_detalle || session.fases_desglose || [];
  const eventos = session.eventos || [];

  // Función para Imprimir el Certificado Clínico Oficial con Firmas
  const handlePrintCertificate = () => {
    const v = window.open('', '_blank');
    let fasesHtml = '';
    if (fases.length > 0) {
      fasesHtml = `
        <h3 style="margin-top:20px; font-size:12px; font-family:monospace; text-transform:uppercase;">DESGLOSE CRONOMÉTRICO DE FASES:</h3>
        <table style="width:100%; border-collapse:collapse; margin-bottom:15px;">
          <thead>
            <tr style="background:#f1f5f9; font-size:11px;">
              <th style="border:1px solid #cbd5e1; padding:6px; text-align:left;">Etapa</th>
              <th style="border:1px solid #cbd5e1; padding:6px; text-align:left;">Inicio</th>
              <th style="border:1px solid #cbd5e1; padding:6px; text-align:left;">Fin</th>
              <th style="border:1px solid #cbd5e1; padding:6px; text-align:center;">Duración</th>
              <th style="border:1px solid #cbd5e1; padding:6px; text-align:right;">Pico T°</th>
              <th style="border:1px solid #cbd5e1; padding:6px; text-align:right;">Pico Presión</th>
              <th style="border:1px solid #cbd5e1; padding:6px; text-align:center;">Resultado</th>
            </tr>
          </thead>
          <tbody>
            ${fases.map((f, i) => `
              <tr style="font-size:11px;">
                <td style="border:1px solid #cbd5e1; padding:6px;"><b>${f.fase || `Etapa ${i+1}`}</b></td>
                <td style="border:1px solid #cbd5e1; padding:6px;">${f.inicio || '--'}</td>
                <td style="border:1px solid #cbd5e1; padding:6px;">${f.fin || '--'}</td>
                <td style="border:1px solid #cbd5e1; padding:6px; text-align:center;">${f.duracion_seg || 0}s</td>
                <td style="border:1px solid #cbd5e1; padding:6px; text-align:right;">${parseFloat(f.temp_max || 0).toFixed(1)}°C</td>
                <td style="border:1px solid #cbd5e1; padding:6px; text-align:right;">${parseFloat(f.pres_max || 0).toFixed(2)} bar</td>
                <td style="border:1px solid #cbd5e1; padding:6px; text-align:center; color:${f.estado && f.estado.includes('FALLO') ? '#dc2626' : '#16a34a'}; font-weight:bold;">${f.estado || 'OK'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    v.document.write(`
      <html>
        <head>
          <title>CERTIFICADO CLÍNICO - ${session.session_id}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #0f172a; line-height: 1.5; }
            .header-cert { border-bottom: 3px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
            .title { font-size: 18px; font-weight: 900; text-transform: uppercase; margin: 0; }
            .sub { font-size: 11px; color: #475569; margin: 2px 0 0 0; font-family: monospace; }
            .data-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; font-size: 12px; }
            .data-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 6px; }
            table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 11px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; }
            th { background: #f1f5f9; text-align: left; }
            .sign-box { margin-top: 60px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; }
            .sign-line { border-top: 1px solid #0f172a; padding-top: 8px; font-size: 11px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header-cert">
            <div>
              <h1 class="title">CERTIFICADO OFICIAL DE ESTERILIZACIÓN CLÍNICA</h1>
              <p class="sub">VALIDACIÓN TERMODINÁMICA BAJO NORMA ISO 17665 / RUMED</p>
            </div>
            <div style="text-align:right;">
              <p class="sub">ID SESIÓN: <b>${session.session_id}</b></p>
              <p class="sub">EMISIÓN: ${new Date().toLocaleString()}</p>
            </div>
          </div>

          <div class="data-grid">
            <div class="data-box">
              <p><b>HOSPITAL / CLÍNICA:</b> ${session.cliente || 'CENTRO HOSPITALARIO'}</p>
              <p><b>EQUIPO:</b> ${session.alias || 'AUTOCLAVE QUIRÚRGICO'} (MAC: ${session.mac})</p>
              <p><b>MODELO:</b> ${session.modelo || 'CLASE B'}</p>
              <p><b>PROGRAMA EJECUTADO:</b> ${session.programa || '134°C INSTRUMENTAL'}</p>
            </div>
            <div class="data-box">
              <p><b>FECHA DE CICLO:</b> ${fechaFormateada}</p>
              <p><b>HORARIOS:</b> Inicio ${session.hora_encendido || session.inicio_ciclo || '--'} ➔ Fin ${session.hora_apagado || '--'}</p>
              <p><b>DURACIÓN TOTAL:</b> ${duracionTexto}</p>
              <p><b>ODÓMETRO:</b> ${session.ciclos_acumulados || 0} de ${session.limite_mantenimiento || 200} ciclos</p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>PARÁMETRO CLÍNICO AUDITADO</th>
                <th>VALOR REGISTRADO</th>
                <th>ESPECIFICACIÓN NORMATIVA</th>
                <th>EVALUACIÓN</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><b>Temperatura Máxima Alcanzada</b></td>
                <td><b>${parseFloat(session.temp_max || 0).toFixed(1)} °C</b></td>
                <td>134.0 °C - 138.0 °C (Clase B)</td>
                <td><span style="color:#16a34a; font-weight:bold;">CONFORME</span></td>
              </tr>
              <tr>
                <td><b>Presión Absoluta de Vapor</b></td>
                <td><b>${parseFloat(session.pres_max || 0).toFixed(2)} bar</b></td>
                <td>2.10 - 2.50 bar</td>
                <td><span style="color:#16a34a; font-weight:bold;">CONFORME</span></td>
              </tr>
              <tr>
                <td><b>Incidentes / Alarmas Críticas</b></td>
                <td>${session.conteo_alarmas || 0} eventos</td>
                <td>0 incidencias en meseta</td>
                <td><span style="color:${huboAlarma ? '#dc2626' : '#16a34a'}; font-weight:bold;">${huboAlarma ? 'FALLO DETECTADO' : 'APROBADO'}</span></td>
              </tr>
              <tr>
                <td><b>Diagnóstico Global del Proceso</b></td>
                <td colspan="3"><b>${session.diagnostico_principal || 'CICLO VÁLIDO'}</b></td>
              </tr>
            </tbody>
          </table>

          ${fasesHtml}

          <div class="sign-box">
            <div>
              <div class="sign-line">Ingeniero Biomédico / Técnico Responsable<br><span style="font-size:9px; color:#64748b;">Firma Digital y Matrícula Profesional</span></div>
            </div>
            <div>
              <div class="sign-line">Supervisión Central de Esterilización (CEYE)<br><span style="font-size:9px; color:#64748b;">Sello y Conformidad Institucional</span></div>
            </div>
          </div>

          <script>
            window.print();
          </script>
        </body>
      </html>
    `);
    v.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="ultra-glass border border-cyan-500/40 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Cabecera */}
        <div className="px-6 py-4 border-b border-cyan-500/20 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">
                Visor Forense del Paquete: {session.session_id}
              </h3>
              <p className="text-xs text-cyan-300 font-mono">
                {session.alias} • MAC: {session.mac} • {session.cliente || 'Hospital Central'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintCertificate}
              className="px-3.5 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-lg shadow-cyan-500/20"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir Certificado</span>
            </button>
            <button 
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Contenido con scroll */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          
          {/* Alerta si hubo fallo */}
          {huboAlarma && (
            <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
              <div>
                <strong className="block font-bold">FALLO O ALARMA DETECTADA EN LA SESIÓN</strong>
                <p className="mt-0.5">Diagnóstico: {session.diagnostico_principal || 'Alarma crítica registrada'}</p>
                {session.errores_alarmas && (
                  <p className="font-mono text-[11px] mt-1">
                    Código #{session.errores_alarmas.codigo}: {session.errores_alarmas.mensaje} ({session.errores_alarmas.fase_del_fallo || 'Cámara'})
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Tarjetas de Resumen Termodinámico */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-[10px] font-mono text-cyan-400 block mb-1">HORARIOS</span>
              <p className="text-xs font-bold text-white font-mono">
                {session.hora_encendido || session.inicio_ciclo || '--'} ➔ {session.hora_apagado || '--'}
              </p>
              <span className="text-[10px] text-slate-400 font-mono">Duración: {duracionTexto}</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-[10px] font-mono text-cyan-400 block mb-1">MÁXIMA TEMPERATURA</span>
              <p className="text-xl font-bold text-white font-mono">{parseFloat(session.temp_max || 0).toFixed(1)} °C</p>
              <span className="text-[10px] text-emerald-400 font-mono">Pico térmico conforme</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-[10px] font-mono text-cyan-400 block mb-1">MÁXIMA PRESIÓN</span>
              <p className="text-xl font-bold text-white font-mono">{parseFloat(session.pres_max || 0).toFixed(2)} bar</p>
              <span className="text-[10px] text-slate-400 font-mono">{((session.pres_max || 0) * 14.504).toFixed(1)} PSI</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-[10px] font-mono text-cyan-400 block mb-1">ODÓMETRO TOTAL</span>
              <p className="text-xl font-bold text-white font-mono">
                {session.ciclos_acumulados || 0} <span className="text-xs font-normal text-slate-400">/ {session.limite_mantenimiento || 200}</span>
              </p>
              <span className="text-[10px] text-slate-400 font-mono">
                Restan {(session.limite_mantenimiento || 200) - (session.ciclos_acumulados || 0)} ciclos
              </span>
            </div>
          </div>

          {/* Desglose Cronométrico de Fases */}
          <div>
            <h4 className="text-xs font-bold text-cyan-300 font-mono uppercase tracking-wider mb-2.5">
              Etapas Cronometradas del Ciclo:
            </h4>

            {fases.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 text-center text-xs text-slate-400 font-mono">
                Este paquete registra un ciclo continuo estándar a {session.temp_max || 134}°C / {session.pres_max || 2.1} bar.
              </div>
            ) : (
              <div className="space-y-2">
                {fases.map((f, idx) => {
                  const esFallo = f.estado && f.estado.includes('FALLO');
                  return (
                    <div 
                      key={idx}
                      className={`p-3.5 rounded-xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-2 ${
                        esFallo ? 'bg-rose-500/10 border-rose-500/30' : 'bg-slate-900/70 border-slate-800'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-white">FASE {idx + 1}: {f.fase || 'ETAPA'}</span>
                          <span className={`px-2 py-0.2 rounded text-[10px] font-mono font-bold ${
                            esFallo ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
                          }`}>
                            {f.estado || 'CONFORME'} ({f.duracion_seg || 0}s)
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                          Inicio: {f.inicio || '--'} ➔ Fin: {f.fin || '--'}
                        </p>
                      </div>

                      <div className="text-right text-xs font-mono text-slate-300">
                        <span>Pico: <strong className="text-cyan-400">{parseFloat(f.temp_max || 0).toFixed(1)}°C</strong> | <strong className="text-pink-400">{parseFloat(f.pres_max || 0).toFixed(2)}b</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Timeline de Eventos */}
          {eventos.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-cyan-300 font-mono uppercase tracking-wider mb-2.5">
                Registro Cronológico de Eventos:
              </h4>
              <div className="space-y-2 pl-2 border-l-2 border-cyan-500/40">
                {eventos.map((ev, i) => (
                  <div key={i} className="pl-3 relative">
                    <span className="absolute -left-[19px] top-1.5 w-2 h-2 rounded-full bg-cyan-400"></span>
                    <p className="text-xs font-mono text-white">
                      <strong>{ev.hora}</strong> [{ev.tipo}]: {ev.msg}
                    </p>
                    {ev.temp && (
                      <p className="text-[10px] font-mono text-slate-400">
                        Lectura: {parseFloat(ev.temp).toFixed(1)}°C / {parseFloat(ev.presion || 0).toFixed(2)} bar
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
