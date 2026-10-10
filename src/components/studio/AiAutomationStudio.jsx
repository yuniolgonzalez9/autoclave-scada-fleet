import React, { useState } from 'react';
import { compilarConIA } from '../../services/aiStudioService';
import { supabase } from '../../services/supabase';
import { 
  Sparkles, 
  Cpu, 
  Send, 
  Layers, 
  Sliders, 
  CheckCircle2, 
  Play, 
  Square, 
  Key, 
  Zap, 
  PowerOff, 
  Activity, 
  Thermometer, 
  Gauge, 
  X, 
  LayoutGrid, 
  Eye, 
  RefreshCw, 
  Wand2,
  SlidersHorizontal,
  Save
} from 'lucide-react';

export default function AiAutomationStudio({ isOpen, onClose, device, sendCommand, onDeployed }) {
  const [prompt, setPrompt] = useState('Quiero una ambulancia con arranque remoto, ignición con switch, medidor de batería 12V y verificación del alternador');
  const [compilando, setCompilando] = useState(false);
  const [vistaActiva, setVistaActiva] = useState('DASHBOARD'); // 'DASHBOARD' o 'HAL_CODE'
  
  // Resultado compilado (Programa y Widgets)
  const [programaCompilado, setProgramaCompilado] = useState(null);
  const [widgets, setWidgets] = useState([]);
  const [halPayload, setHalPayload] = useState(null);
  const [msg, setMsg] = useState('');
  const [desplegando, setDesplegando] = useState(false);

  if (!isOpen || !device) return null;

  // 1. COMPILAR CON IA
  const handleCompilar = async (promptAEjecutar = null) => {
    const textoPrompt = promptAEjecutar || prompt;
    if (!textoPrompt.trim()) return alert('Escribe una descripción de lo que deseas.');

    setCompilando(true);
    setMsg('');

    try {
      const res = await compilarConIA({
        prompt: textoPrompt,
        device,
        hardwareInfo: device.meta?.config_deseada || {}
      });

      if (res.exito) {
        setProgramaCompilado(res);
        setWidgets(res.dashboardWidgets || []);
        setHalPayload(res.halPayload || {});
        setMsg(`✨ ¡Compilación exitosa! [${res.fuente === 'IA_NUBE' ? 'IA en la Nube' : 'Compilador Semántico'}] generó ${res.dashboardWidgets?.length || 0} widgets y la lógica de hardware.`);
      }
    } catch (e) {
      alert('Error en compilación: ' + e.message);
    } finally {
      setCompilando(false);
    }
  };

  // 2. AJUSTAR ANCHO O COLOR DE UN WIDGET (PERSONALIZACIÓN VISUAL)
  const handleCambiarColSpan = (idx, nuevoSpan) => {
    const next = [...widgets];
    next[idx].colSpan = Number(nuevoSpan);
    setWidgets(next);
  };

  const handleCambiarColor = (idx, nuevoColor) => {
    const next = [...widgets];
    next[idx].color = nuevoColor;
    setWidgets(next);
  };

  // 3. GUARDAR EN SUPABASE Y TRANSMITIR AL ESP32
  const handleDesplegarTodo = async () => {
    if (!halPayload) return alert('Primero compila una automatización con IA.');

    setDesplegando(true);
    setMsg('');

    const payloadFinal = {
      cmd: 'APPLY_HAL_MAP',
      mac: device.mac,
      ...halPayload,
      custom_dashboard: {
        titulo: programaCompilado?.titulo || 'Dashboard Personalizado',
        widgets
      }
    };

    try {
      // A. Disparar orden física por MQTT al ESP32
      if (sendCommand) {
        sendCommand(device.mac, payloadFinal);
        sendCommand(device.mac, { cmd: 'SET_META', alias: device.meta?.alias || 'Equipo', config_deseada: payloadFinal });
      }

      // B. Guardar en Supabase asignaciones_equipos
      await supabase.from('asignaciones_equipos').update({
        config_deseada: payloadFinal,
        updated_at: new Date().toISOString()
      }).eq('mac', device.mac);

      setMsg('⚡ ¡Lógica grabada en Flash LittleFS del ESP32 y Dashboard guardado en Supabase!');
      if (onDeployed) onDeployed(payloadFinal);

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (e) {
      setMsg('Error durante el despliegue: ' + e.message);
    } finally {
      setDesplegando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999999] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 font-mono text-xs">
      <div className="ultra-glass border-2 border-amber-500/50 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col p-5 shadow-2xl space-y-4 overflow-hidden">
        
        {/* Cabecera */}
        <div className="flex justify-between items-center border-b border-amber-500/20 pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                BioFleet AI Studio & Widget Designer
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                  PROTOTIPO v2
                </span>
              </h3>
              <p className="text-xs text-slate-300 font-sans">
                Genera la lógica del ESP32 y personaliza la distribución del Dashboard con Inteligencia Artificial.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notificación de Estado */}
        {msg && (
          <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-xl flex items-center gap-2 shrink-0">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{msg}</span>
          </div>
        )}

        {/* CAMPO DE PROMPT DE IA CON SUGERENCIAS RÁPIDAS */}
        <div className="p-3.5 bg-slate-950/90 rounded-xl border border-amber-500/40 space-y-2.5 shrink-0">
          <div className="flex justify-between items-center">
            <span className="text-amber-300 font-bold flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
              <Wand2 className="w-3.5 h-3.5" />
              ¿Qué quieres que haga este equipo y cómo deseas su pantalla?
            </span>
            <span className="text-[10px] text-slate-400">Describe en lenguaje natural</span>
          </div>

          <div className="flex gap-2">
            <textarea
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ej: Control de llenado de agua con electroválvula en R1, boya en IN1 y medidor de nivel analógico..."
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white text-xs font-sans focus:outline-none focus:border-amber-400"
            />
            <button
              type="button"
              onClick={() => handleCompilar()}
              disabled={compilando}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-emerald-500 hover:opacity-90 text-slate-950 font-bold rounded-xl flex flex-col items-center justify-center gap-1 shadow-lg shadow-amber-500/20 shrink-0 font-mono disabled:opacity-50"
            >
              {compilando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>{compilando ? 'Compilando...' : 'Generar IA'}</span>
            </button>
          </div>

          {/* Plantillas Rápidas de 1 Clic */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => {
                const p = 'Ambulancia de rescate con arranque remoto inteligente, corte de ignición, indicador de alternador y medidor de batería 12V';
                setPrompt(p);
                handleCompilar(p);
              }}
              className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-amber-300 text-[10px]"
            >
              🚗 Ambulancia Staria
            </button>
            <button
              type="button"
              onClick={() => {
                const p = 'Autoclave quirúrgico hospitalario a 134°C con curva de vapor, botón de iniciar ciclo, purga y cálculo F0';
                setPrompt(p);
                handleCompilar(p);
              }}
              className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 text-[10px]"
            >
              ♨️ Autoclave Quirófano
            </button>
            <button
              type="button"
              onClick={() => {
                const p = 'Control industrial de bombeo con electroválvula de llenado, boyas de nivel y paro de emergencia en seta';
                setPrompt(p);
                handleCompilar(p);
              }}
              className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-emerald-300 text-[10px]"
            >
              ⚙️ Tablero Soft-PLC Llenado
            </button>
          </div>
        </div>

        {/* SELECTOR DE VISTA: DASHBOARD VISUAL vs MANIFIESTO HAL */}
        {programaCompilado && (
          <div className="flex justify-between items-center border-b border-slate-800 pb-1 shrink-0">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setVistaActiva('DASHBOARD')}
                className={`py-1.5 px-3 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                  vistaActiva === 'DASHBOARD' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Lienzo de Widgets ({widgets.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setVistaActiva('HAL_CODE')}
                className={`py-1.5 px-3 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                  vistaActiva === 'HAL_CODE' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Lógica para ESP32 (LittleFS)</span>
              </button>
            </div>

            <span className="text-[10px] text-slate-400">
              Dispositivo Destino: <strong className="text-white">{device.mac}</strong>
            </span>
          </div>
        )}

        {/* ÁREA CENTRAL INTERACTIVA */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3">
          
          {programaCompilado && vistaActiva === 'DASHBOARD' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-white font-bold text-xs uppercase flex items-center gap-1.5">
                  <LayoutGrid className="w-3.5 h-3.5 text-amber-400" />
                  Previsualización del Dashboard Generado (Personaliza tamaños y colores):
                </span>
              </div>

              {/* GRID INTERACTIVO DE WIDGETS (ESTILO ARDUINO IOT CLOUD) */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 p-3 bg-slate-950/80 rounded-xl border border-slate-800">
                {widgets.map((w, idx) => (
                  <div
                    key={w.id || idx}
                    className={`p-3 rounded-xl border bg-slate-900/90 flex flex-col justify-between space-y-2 relative group ${
                      w.colSpan === 2 ? 'sm:col-span-2' :
                      w.colSpan === 3 ? 'sm:col-span-3' :
                      w.colSpan === 4 ? 'sm:col-span-4' : 'sm:col-span-1'
                    } ${
                      w.color === 'emerald' ? 'border-emerald-500/40 text-emerald-300' :
                      w.color === 'amber' ? 'border-amber-500/40 text-amber-300' :
                      w.color === 'rose' ? 'border-rose-500/40 text-rose-300' :
                      w.color === 'pink' ? 'border-pink-500/40 text-pink-300' :
                      'border-cyan-500/40 text-cyan-300'
                    }`}
                  >
                    {/* Barra de Personalización Rápida en la esquina del Widget */}
                    <div className="flex justify-between items-center text-[9px] text-slate-400 border-b border-slate-800 pb-1">
                      <span className="font-bold text-white uppercase truncate">{w.titulo}</span>
                      
                      <div className="flex items-center gap-1">
                        {/* Selector de Ancho (colSpan) */}
                        <select
                          value={w.colSpan || 1}
                          onChange={(e) => handleCambiarColSpan(idx, e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded px-1 text-[9px] text-slate-300"
                          title="Ancho de columna"
                        >
                          <option value={1}>1 Col</option>
                          <option value={2}>2 Col</option>
                          <option value={3}>3 Col</option>
                          <option value={4}>Full</option>
                        </select>

                        {/* Selector de Color */}
                        <select
                          value={w.color || 'cyan'}
                          onChange={(e) => handleCambiarColor(idx, e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded px-1 text-[9px] text-slate-300"
                          title="Color del Widget"
                        >
                          <option value="cyan">Cian</option>
                          <option value="emerald">Verde</option>
                          <option value="amber">Ámbar</option>
                          <option value="rose">Rojo</option>
                        </select>
                      </div>
                    </div>

                    {/* CUERPO DEL WIDGET SEGÚN SU TIPO */}
                    <div className="py-2 flex flex-col items-center justify-center">
                      {w.tipo === 'ACTION_BUTTON' && (
                        <button
                          type="button"
                          className="w-full py-2 px-3 rounded-lg font-bold text-xs bg-slate-950 border border-current flex items-center justify-center gap-1.5 shadow-md"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>{w.titulo}</span>
                        </button>
                      )}

                      {w.tipo === 'SWITCH_TOGGLE' && (
                        <div className="flex items-center justify-between w-full px-2">
                          <span className="text-[10px] text-slate-300">Canal {w.canal}</span>
                          <span className="px-2 py-0.5 rounded bg-slate-950 border border-current text-[10px] font-bold">
                            INTERRUPTOR ON/OFF
                          </span>
                        </div>
                      )}

                      {w.tipo === 'GAUGE_RADIAL' && (
                        <div className="text-center">
                          <span className="text-2xl font-bold font-mono">12.6</span>
                          <span className="text-[10px] text-slate-400 ml-1">{w.unidad}</span>
                          <span className="block text-[9px] text-slate-500 font-sans mt-0.5">Rango: {w.min} a {w.max}{w.unidad}</span>
                        </div>
                      )}

                      {w.tipo === 'VALUE_CARD' && (
                        <div className="text-center">
                          <span className="text-2xl font-bold font-mono">134.0</span>
                          <span className="text-xs text-slate-400 ml-1">{w.unidad}</span>
                        </div>
                      )}

                      {w.tipo === 'STATUS_LED' && (
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-current animate-ping"></span>
                          <span className="font-bold text-xs">{w.labelOn || 'ACTIVO'}</span>
                        </div>
                      )}

                      {w.tipo === 'TEXT_STATUS' && (
                        <span className="text-sm font-bold tracking-wider">MOTOR_EN_MARCHA</span>
                      )}

                      {w.tipo === 'CHART_HISTORY' && (
                        <div className="w-full h-16 bg-slate-950/60 rounded flex items-center justify-center text-[10px] text-slate-500">
                          📈 Gráfica Histórica en Vivo
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {programaCompilado && vistaActiva === 'HAL_CODE' && (
            <div className="space-y-2">
              <span className="text-cyan-400 font-bold block text-xs">
                Manifiesto Técnico Compilado para LittleFS del ESP32:
              </span>
              <textarea
                rows={12}
                value={JSON.stringify(halPayload, null, 2)}
                onChange={(e) => {
                  try { setHalPayload(JSON.parse(e.target.value)); } catch (err) {}
                }}
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-cyan-300 font-mono text-[11px] leading-relaxed focus:outline-none"
              />
            </div>
          )}

          {!programaCompilado && (
            <div className="h-44 border-2 border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-500 space-y-2">
              <Sparkles className="w-6 h-6 text-amber-500/40" />
              <p className="text-xs font-sans">Escribe arriba qué necesitas o elige un botón rápido y pulsa "Generar IA".</p>
            </div>
          )}
        </div>

        {/* Barra Inferior con Botón de Despliegue */}
        <div className="pt-2 flex gap-2 shrink-0 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold"
          >
            Cerrar Studio
          </button>

          {programaCompilado && (
            <button
              type="button"
              onClick={handleDesplegarTodo}
              disabled={desplegando}
              className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 via-emerald-500 to-teal-500 hover:opacity-90 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{desplegando ? 'Desplegando...' : '⚡ Guardar y Desplegar al Microcontrolador'}</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
