import React, { useState, useEffect, useRef } from 'react';
import { conversarYCompilarConIA } from '../../services/aiStudioService';
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
  Power, 
  LayoutGrid, 
  RefreshCw, 
  Wand2, 
  Save, 
  Trash2, 
  Edit3, 
  FileCode, 
  Database, 
  X, 
  Plus, 
  Settings2, 
  GripHorizontal, 
  Search, 
  Building2, 
  Bot, 
  User, 
  Activity, 
  Clock, 
  Timer, 
  OctagonAlert, 
  Radio 
} from 'lucide-react';

const SNAP_GRID = 10;
const GROQ_DEFAULT_API_KEY = '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';

export default function AiAutomationStudio({ fleet = {}, sendCommand = null, initialDeviceMac = null }) {
  const [activeTab, setActiveTab] = useState('STUDIO');
  const [modoEdicion, setModoEdicion] = useState(false);
  const [widgetEnEdicion, setWidgetEnEdicion] = useState(null);

  const [prompt, setPrompt] = useState('');
  const [historialChat, setHistorialChat] = useState([
    {
      id: 'init_msg',
      sender: 'ai',
      texto: 'BioFleet SCADA listo con conciencia total del entorno. Puedes pedirme crear nuevos sistemas, pero también eliminar widgets existentes (ej: "elimina el botón de R2"), modificar parámetros (ej: "cambia el tiempo a 10s") o preguntarme qué controles tienes en pantalla.'
    }
  ]);
  const [compilando, setCompilando] = useState(false);
  const chatBottomRef = useRef(null);

  // Estados Locales en Tiempo Real (0 ms de Lag)
  const [relesLocales, setRelesLocales] = useState({});
  const [timerEjecutando, setTimerEjecutando] = useState(null);
  const timerIntervalRef = useRef(null);

  const [apiKey] = useState(() => localStorage.getItem('biofleet_ai_key') || GROQ_DEFAULT_API_KEY);

  // Perfil, Dashboard y Receta FSM
  const [perfilActivoId, setPerfilActivoId] = useState(null);
  const [perfilNombre, setPerfilNombre] = useState('Consola SCADA Activa');
  const [tipoEquipo, setTipoEquipo] = useState('UNIVERSAL_PLC');
  const [widgets, setWidgets] = useState([]);
  const [recetaActiva, setRecetaActiva] = useState(null);
  const [halPayload, setHalPayload] = useState(null);
  const [jsonRaw, setJsonRaw] = useState('');

  // Hardware y Telemetría en Vivo
  const macList = Object.keys(fleet || {});
  const [selectedMac, setSelectedMac] = useState(() => {
    if (initialDeviceMac) return initialDeviceMac.toUpperCase().replace(/[:\-]/g, '');
    const onlineMac = macList.find(m => (Date.now() - (fleet[m]?.lastSeen || 0)) < 12000);
    return onlineMac || macList[0] || '';
  });

  const cleanMac = (selectedMac || '').toUpperCase().replace(/[:\-]/g, '');
  const activeDevice = fleet[cleanMac] || null;
  const dDev = activeDevice?.datos || {};
  const relesFisicos = dDev.reles || {};
  const adcFisico = dDev.adc || {};

  const [transmitting, setTransmitting] = useState(false);
  const [msg, setMsg] = useState('');

  const [rolesReles, setRolesReles] = useState({});
  const [nombresReles, setNombresReles] = useState({});
  const [chipsDetectados, setChipsDetectados] = useState([]);
  const [scanningI2C, setScanningI2C] = useState(false);

  const [perfilesGuardados, setPerfilesGuardados] = useState([]);
  const [loadingLib, setLoadingLib] = useState(false);

  // Pointer Events para Lienzo Libre
  const canvasRef = useRef(null);
  const activeInteraction = useRef({
    type: null,
    widgetIdx: null,
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
    initialW: 0,
    initialH: 0
  });

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [historialChat]);

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  const cargarBiblioteca = async () => {
    setLoadingLib(true);
    try {
      const { data, error } = await supabase
        .from('perfiles_hardware')
        .select('*')
        .order('updated_at', { ascending: false });
      if (!error && data) setPerfilesGuardados(data);
    } catch (_) {} finally {
      setLoadingLib(false);
    }
  };

  useEffect(() => {
    cargarBiblioteca();
  }, []);

  useEffect(() => {
    if (activeDevice?.i2cReport?.chips) {
      setChipsDetectados(activeDevice.i2cReport.chips);
      setScanningI2C(false);
    }
  }, [activeDevice?.i2cReport]);

  useEffect(() => {
    if (dDev.reles) {
      setRelesLocales(prev => ({ ...dDev.reles, ...prev }));
    }
  }, [dDev.reles]);

  // =========================================================================
  // EJECUCIÓN MULTI-ETAPA PASO A PASO EN LA PLACA FÍSICA Y EN LA WEB
  // =========================================================================
  const handleIniciarSecuenciaMultiPaso = async (widget) => {
    if (!cleanMac) {
      alert('Por favor selecciona una placa física en el selector.');
      return;
    }

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

    // 1. Enviar la receta al Core 1 del ESP32 para ejecución en hardware
    if (recetaActiva && sendCommand) {
      sendCommand(cleanMac, {
        cmd: 'APPLY_LOGICA_SECUENCIA',
        mac: cleanMac,
        receta: recetaActiva
      });
      setMsg(`⚡ Receta FSM enviada al Core 1 de [${cleanMac.slice(-4)}]`);
    }

    const pasos = widget.pasos || (recetaActiva ? recetaActiva.pasos : []);
    const totalSegs = widget.totalSegundos || 6;

    setTimerEjecutando({
      widgetId: widget.id,
      segundosRestantes: totalSegs,
      totalSegundos: totalSegs
    });

    // 2. Orquestación local para actualización en vivo a 0 ms
    if (pasos && pasos.length > 0) {
      (async () => {
        for (let i = 0; i < pasos.length; i++) {
          const paso = pasos[i];
          const canal = paso.canal;
          const delayMs = paso.tiempoMs || 2000;

          if (canal) {
            setRelesLocales(prev => {
              const copia = { ...prev };
              Object.keys(copia).forEach(k => { copia[k] = 0; });
              copia[`R${canal}`] = 1;
              return copia;
            });

            if (sendCommand) {
              sendCommand(cleanMac, {
                cmd: 'SET_RELAY',
                canal: Number(canal),
                val: true,
                duracion_ms: delayMs
              });
            }
          }

          setMsg(`⚡ Ejecutando: ${paso.nombre || 'Etapa ' + (i + 1)} en placa física...`);
          await new Promise(r => setTimeout(r, delayMs));
        }

        setRelesLocales({});
        setMsg('✅ Secuencia multi-etapa completada con éxito.');
      })();
    }

    // Cuenta regresiva visual en el widget
    let segs = totalSegs;
    timerIntervalRef.current = setInterval(() => {
      segs--;
      if (segs <= 0) {
        clearInterval(timerIntervalRef.current);
        setTimerEjecutando(null);
      } else {
        setTimerEjecutando({
          widgetId: widget.id,
          segundosRestantes: segs,
          totalSegundos: totalSegs
        });
      }
    }, 1000);
  };

  const handleDetenerTemporizador = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setTimerEjecutando(null);
    setRelesLocales({});
    if (cleanMac && sendCommand) {
      sendCommand(cleanMac, { cmd: 'ABORTAR_PROCESO', mac: cleanMac });
    }
    setMsg('🛑 Secuencia detenida.');
  };

  // CONTROL MANUAL DIRECTO DE RELÉ
  const handleToggleRelayDirecto = (canal, currentState = null) => {
    if (!cleanMac) {
      alert('Por favor selecciona una placa física.');
      return;
    }

    const estadoActual = currentState !== null ? currentState : Boolean(relesLocales[`R${canal}`]);
    const nextVal = !estadoActual;

    setRelesLocales(prev => ({
      ...prev,
      [`R${canal}`]: nextVal ? 1 : 0
    }));

    if (sendCommand) {
      sendCommand(cleanMac, {
        cmd: 'SET_RELAY',
        canal: Number(canal),
        val: nextVal
      });
      setMsg(`📡 R${canal} -> ${nextVal ? 'ON (ACTIVO)' : 'OFF (APAGADO)'}`);
    }
  };

  // =========================================================================
  // ENVIAR MENSAJE AL COPILOT CON CONCIENCIA TOTAL DEL LIENZO
  // =========================================================================
  const handleEnviarMensaje = async (e) => {
    if (e) e.preventDefault();
    const textoUsuario = prompt.trim();
    if (!textoUsuario) return;

    setHistorialChat(prev => [...prev, { id: `u_${Date.now()}`, sender: 'user', texto: textoUsuario }]);
    setPrompt('');
    setCompilando(true);
    setMsg('');

    try {
      const targetDev = fleet[cleanMac] || null;

      // PASAR EL ESTADO VIVO DEL LIENZO A LA IA PARA QUE TENGA OJOS COMPLETOS
      const res = await conversarYCompilarConIA({
        prompt: textoUsuario,
        historial: historialChat.map(h => ({ sender: h.sender, contenido: h.texto })),
        hardwareInfo: targetDev?.meta?.config_deseada || { reles: 8, entradas: 8 },
        widgetsActuales: widgets, // <--- LA IA AHORA VE TODOS LOS WIDGETS DE TU PANTALLA
        recetaActual: recetaActiva,
        telemetriaActual: { reles: relesLocales, fase: dDev.fase, adc: adcFisico },
        apiKey
      });

      setHistorialChat(prev => [
        ...prev,
        { id: `ai_${Date.now()}`, sender: 'ai', texto: res.mensajeChat }
      ]);

      // Si la IA eliminó, modificó o agregó widgets, actualizar el lienzo de inmediato
      if (res.dashboardWidgets !== undefined) {
        setWidgets(res.dashboardWidgets);
      }

      if (res.receta) {
        setRecetaActiva(res.receta);
      }

      setPerfilNombre(res.titulo || perfilNombre);
      setTipoEquipo(res.tipo || tipoEquipo);

      if (res.halPayload?.nombres_reles) setNombresReles(res.halPayload.nombres_reles);
      if (res.halPayload?.roles_reles) setRolesReles(res.halPayload.roles_reles);

      setHalPayload(res.halPayload || {});
      setJsonRaw(JSON.stringify(res, null, 2));
      setMsg(`✨ Entorno actualizado: "${res.titulo}"`);
    } catch (err) {
      setHistorialChat(prev => [
        ...prev,
        { id: `ai_err_${Date.now()}`, sender: 'ai', texto: `Nota: ${err.message}` }
      ]);
    } finally {
      setCompilando(false);
    }
  };

  // POINTER EVENTS: DRAG Y RESIZE
  const handlePointerDown = (e, idx, action) => {
    if (!modoEdicion) return;
    e.stopPropagation();

    const clientX = e.clientX;
    const clientY = e.clientY;
    const currentW = widgets[idx];

    activeInteraction.current = {
      type: action,
      widgetIdx: idx,
      startX: clientX,
      startY: clientY,
      initialX: currentW.x || 0,
      initialY: currentW.y || 0,
      initialW: currentW.w || 260,
      initialH: currentW.h || 170
    };

    if (e.currentTarget.setPointerCapture) {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e) => {
    if (!activeInteraction.current.type) return;

    const { type, widgetIdx, startX, startY, initialX, initialY, initialW, initialH } = activeInteraction.current;
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    setWidgets((prev) =>
      prev.map((w, i) => {
        if (i !== widgetIdx) return w;

        if (type === 'DRAG') {
          const nextX = Math.max(0, Math.round((initialX + deltaX) / SNAP_GRID) * SNAP_GRID);
          const nextY = Math.max(0, Math.round((initialY + deltaY) / SNAP_GRID) * SNAP_GRID);
          return { ...w, x: nextX, y: nextY };
        }

        if (type === 'RESIZE') {
          const nextW = Math.max(180, Math.round((initialW + deltaX) / SNAP_GRID) * SNAP_GRID);
          const nextH = Math.max(120, Math.round((initialH + deltaY) / SNAP_GRID) * SNAP_GRID);
          return { ...w, w: nextW, h: nextH };
        }

        return w;
      })
    );
  };

  const handlePointerUp = (e) => {
    if (activeInteraction.current.type) {
      if (e.currentTarget.releasePointerCapture) {
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
      }
      activeInteraction.current = { type: null, widgetIdx: null };
      setJsonRaw(JSON.stringify({ tipo: tipoEquipo, hal: halPayload, receta: recetaActiva, dashboard: widgets }, null, 2));
    }
  };

  const handleDesplegarADispositivo = async () => {
    if (!cleanMac) return alert('Selecciona una placa.');

    setTransmitting(true);
    setMsg(`Desplegando lógica a LittleFS en [${cleanMac}]...`);

    if (recetaActiva && sendCommand) {
      sendCommand(cleanMac, { cmd: 'APPLY_LOGICA_SECUENCIA', mac: cleanMac, receta: recetaActiva });
    }

    const commandPayload = {
      cmd: 'APPLY_HAL_MAP',
      mac: cleanMac,
      tipo: tipoEquipo,
      roles_reles: rolesReles,
      nombres_reles: nombresReles,
      custom_dashboard: { titulo: perfilNombre, widgets }
    };

    if (sendCommand) sendCommand(cleanMac, commandPayload);

    try {
      await supabase.from('asignaciones_equipos').upsert({
        mac: cleanMac,
        alias: perfilNombre,
        config_deseada: { ...commandPayload, receta: recetaActiva },
        updated_at: new Date().toISOString()
      }, { onConflict: 'mac' });

      setMsg(`⚡ ¡Lógica grabada en Flash LittleFS de [${cleanMac}]!`);
    } catch (err) {
      setMsg('Error Supabase: ' + err.message);
    } finally {
      setTransmitting(false);
    }
  };

  return (
    <div className="space-y-4 font-mono text-xs select-none">
      
      {/* 1. BARRA SUPERIOR */}
      <div className="ultra-glass p-4 rounded-2xl border border-amber-500/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              BioFleet SCADA Enterprise v2.0
              <span className="px-2 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] flex items-center gap-1">
                <Timer className="w-3 h-3" /> CONCIENCIA TOTAL DE LIENZO
              </span>
            </h2>
            <p className="text-[11px] text-slate-300 font-sans">
              La IA ahora ve, modifica, agrega y elimina controles de tu pantalla en tiempo real.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex p-0.5 bg-slate-950 border border-slate-800 rounded-xl">
            <button
              onClick={() => setActiveTab('STUDIO')}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'STUDIO' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Copilot & SCADA</span>
            </button>
            <button
              onClick={() => setActiveTab('HARDWARE_I2C')}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'HARDWARE_I2C' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Hardware & I2C</span>
            </button>
            <button
              onClick={() => setActiveTab('BIBLIOTECA')}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'BIBLIOTECA' ? 'bg-emerald-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Nube</span>
            </button>
            <button
              onClick={() => setActiveTab('EDITOR_JSON')}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'EDITOR_JSON' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>JSON</span>
            </button>
          </div>

          {activeTab === 'STUDIO' && (
            <button
              onClick={() => { setModoEdicion(!modoEdicion); setWidgetEnEdicion(null); }}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 border transition-all ${
                modoEdicion 
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/30 animate-pulse' 
                  : 'bg-slate-900 border-slate-700 text-amber-300 hover:border-amber-400'
              }`}
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>{modoEdicion ? '🛠️ Salir Edición' : '🛠️ Modo Edición'}</span>
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{msg}</span>
          </div>
          <button onClick={() => setMsg('')}><X className="w-4 h-4 text-emerald-400" /></button>
        </div>
      )}

      {/* 2. CHAT DE CONTROL Y LIENZO */}
      {activeTab === 'STUDIO' && (
        <div className="space-y-4">
          
          {/* CONSOLA DE DIÁLOGO CON MEMORIA Y VISTA DEL LIENZO */}
          <div className="ultra-glass p-4 rounded-2xl border border-amber-500/30 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-amber-300 font-bold uppercase text-[11px] flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-emerald-400" />
                Diálogo con el Ingeniero IA (Puede ver, agregar, modificar y eliminar controles):
              </span>
              <button
                type="button"
                onClick={() => setHistorialChat([{ id: 'reset', sender: 'ai', texto: 'Historial reiniciado. Dime qué acción o diseño deseas realizar en el entorno.' }])}
                className="text-[10px] text-slate-400 hover:text-white"
              >
                Limpiar Chat
              </button>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
              {historialChat.map((msgItem) => (
                <div
                  key={msgItem.id}
                  className={`p-2.5 rounded-xl text-xs flex gap-2 ${
                    msgItem.sender === 'user'
                      ? 'bg-slate-900 border border-cyan-500/30 ml-8 text-cyan-200'
                      : 'bg-slate-950/90 border border-amber-500/40 mr-8 text-slate-200'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {msgItem.sender === 'user' ? <User className="w-3.5 h-3.5 text-cyan-400" /> : <Bot className="w-3.5 h-3.5 text-emerald-400" />}
                  </div>
                  <div className="flex-1 whitespace-pre-wrap leading-relaxed font-sans">{msgItem.texto}</div>
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>

            <form onSubmit={handleEnviarMensaje} className="flex gap-2 pt-1">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ejemplo: 'elimina el botón de R2', 'cambia el tiempo a 10s' o '¿qué controles tengo en pantalla?'..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-sans text-xs focus:outline-none focus:border-amber-400"
              />
              <button
                type="submit"
                disabled={compilando || !prompt.trim()}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-emerald-500 hover:opacity-90 text-slate-950 font-bold rounded-xl flex items-center gap-1.5 shadow-lg disabled:opacity-50 shrink-0 font-mono"
              >
                {compilando ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>{compilando ? 'Procesando...' : 'Enviar'}</span>
              </button>
            </form>
          </div>

          {/* BARRA DE IDENTIDAD Y DESTINO */}
          <div className="ultra-glass p-3 rounded-xl border border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                value={perfilNombre}
                onChange={(e) => setPerfilNombre(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-bold text-xs focus:outline-none focus:border-cyan-400 w-full sm:w-64"
              />
              <span className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-amber-400 font-bold text-[10px]">
                {tipoEquipo}
              </span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
              <select
                value={selectedMac}
                onChange={(e) => setSelectedMac(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-cyan-300 font-bold"
              >
                <option value="">-- Placa Destino --</option>
                {macList.map((m) => (
                  <option key={m} value={m}>
                    {fleet[m]?.meta?.alias || m} ({m.slice(-4)})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleDesplegarADispositivo}
                disabled={transmitting || !selectedMac}
                className="px-3.5 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90 text-white font-bold rounded-lg flex items-center gap-1.5 shadow-md disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{transmitting ? 'Enviando...' : 'Desplegar a Placa'}</span>
              </button>
            </div>
          </div>

          {/* LIENZO SCADA */}
          <div className="ultra-glass p-4 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-white font-bold flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-cyan-400" />
                Lienzo SCADA ({widgets.length} Controles):
              </span>
              <span className="text-[10px] text-amber-300">
                {timerEjecutando 
                  ? `⏱️ SECUENCIA EN EJECUCIÓN: ${timerEjecutando.segundosRestantes}s RESTANTES` 
                  : modoEdicion 
                  ? '🛠️ Arrastra la barra superior para mover y la esquina para redimensionar' 
                  : '👁️ Modo Operador: Puedes interactuar o pedirle a la IA que modifique cualquier widget'}
              </span>
            </div>

            {widgets.length === 0 ? (
              <div className="py-16 border-2 border-dashed border-slate-800 rounded-xl text-center text-slate-500 space-y-2">
                <Sparkles className="w-8 h-8 mx-auto text-amber-500/40 animate-pulse" />
                <p>Escribe tu instrucción en el diálogo para generar los controles.</p>
              </div>
            ) : (
              <div
                ref={canvasRef}
                className="w-full min-h-[580px] h-[680px] relative bg-slate-950/80 rounded-2xl border border-slate-800 overflow-auto bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:20px_20px]"
              >
                <div className="w-[2400px] h-[1800px] relative">
                  {widgets.map((w, idx) => {
                    const isEditingThis = widgetEnEdicion === idx;
                    const isRelayActive = Boolean(relesLocales[`R${w.canal || 1}`]);
                    const esTimerActivo = timerEjecutando && timerEjecutando.widgetId === w.id;
                    const segRest = esTimerActivo ? timerEjecutando.segundosRestantes : (w.totalSegundos || 6);
                    const pctProgreso = esTimerActivo ? ((w.totalSegundos - segRest) / w.totalSegundos) * 100 : 0;

                    return (
                      <div
                        key={w.id || idx}
                        style={{
                          transform: `translate3d(${w.x || 0}px, ${w.y || 0}px, 0)`,
                          width: `${w.w || 260}px`,
                          height: `${w.h || 170}px`,
                          touchAction: modoEdicion ? 'none' : 'auto'
                        }}
                        className={`absolute rounded-2xl border bg-slate-900/95 flex flex-col justify-between shadow-xl transition-shadow ${
                          modoEdicion ? 'ring-1 ring-amber-500/40' : ''
                        } ${
                          w.tipo === 'SEQUENCE_TIMER' ? 'border-amber-500/60 text-amber-300' :
                          w.color === 'emerald' ? 'border-emerald-500/40 text-emerald-300' :
                          w.color === 'amber' ? 'border-amber-500/40 text-amber-300' :
                          w.color === 'rose' ? 'border-rose-500/40 text-rose-300' :
                          'border-cyan-500/40 text-cyan-300'
                        }`}
                      >
                        {/* HEADER DRAG */}
                        <div
                          onPointerDown={(e) => handlePointerDown(e, idx, 'DRAG')}
                          onPointerMove={handlePointerMove}
                          onPointerUp={handlePointerUp}
                          className={`px-3 py-2 border-b border-slate-800/80 rounded-t-2xl flex items-center justify-between select-none ${
                            modoEdicion ? 'cursor-move bg-amber-500/10' : 'bg-slate-950/60'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            {modoEdicion && <GripHorizontal className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                            <span className="font-bold text-white text-[10px] uppercase truncate">{w.titulo}</span>
                            {w.canal && (
                              <span className="text-[8px] px-1 py-0.2 rounded bg-slate-800 text-slate-300 shrink-0">R{w.canal}</span>
                            )}
                          </div>

                          {modoEdicion && (
                            <div className="flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => setWidgetEnEdicion(isEditingThis ? null : idx)}
                                className="p-1 rounded bg-slate-800 text-amber-300"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setWidgets(widgets.filter((_, i) => i !== idx))}
                                className="p-1 rounded bg-slate-800 text-rose-300"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* CUERPO DEL WIDGET */}
                        <div 
                          className="flex-1 p-3 flex flex-col justify-center overflow-hidden" 
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          {/* WIDGET TEMPORIZADOR MULTI-ETAPA */}
                          {w.tipo === 'SEQUENCE_TIMER' && (
                            <div className="flex flex-col justify-between h-full space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-slate-400 font-sans">Secuencia FSM:</span>
                                <span className={`text-2xl font-bold font-mono tracking-wider ${esTimerActivo ? 'text-amber-400 animate-pulse' : 'text-white'}`}>
                                  {segRest}s
                                </span>
                              </div>

                              <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
                                <div 
                                  className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full transition-all duration-300"
                                  style={{ width: `${esTimerActivo ? pctProgreso : 0}%` }}
                                />
                              </div>

                              {w.pasos && w.pasos.length > 0 && (
                                <div className="grid grid-cols-3 gap-1">
                                  {w.pasos.map((paso, pIdx) => (
                                    <div key={pIdx} className="p-1 rounded bg-slate-950 border border-slate-800 text-center">
                                      <span className="block text-[8px] text-slate-400 truncate">{paso.nombre}</span>
                                      <span className="font-mono text-cyan-300 font-bold text-[9px]">
                                        {Math.round(paso.tiempoMs / 1000)}s
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="pt-1">
                                {esTimerActivo ? (
                                  <button
                                    type="button"
                                    onClick={handleDetenerTemporizador}
                                    className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 font-bold text-white rounded-xl flex items-center justify-center gap-1.5 shadow-md"
                                  >
                                    <Square className="w-3.5 h-3.5 fill-white" />
                                    <span>Cancelar Secuencia</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleIniciarSecuenciaMultiPaso(w)}
                                    className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:opacity-90 font-bold text-slate-950 rounded-xl flex items-center justify-center gap-1.5 shadow-md"
                                  >
                                    <Play className="w-3.5 h-3.5 fill-slate-950" />
                                    <span>Iniciar Secuencia ({w.totalSegundos || 6}s)</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* SWITCH INTERRUPTOR */}
                          {w.tipo === 'SWITCH_TOGGLE' && (
                            <div
                              onClick={() => handleToggleRelayDirecto(w.canal || 1)}
                              className="flex items-center justify-between w-full px-3 cursor-pointer py-2.5 bg-slate-950/60 rounded-xl border border-slate-800 hover:border-cyan-400 transition-colors"
                            >
                              <span className="text-[10px] text-slate-300 font-bold">R{w.canal || 1} • {w.titulo}</span>
                              <div
                                className={`w-12 h-6 rounded-full border border-current p-0.5 flex items-center transition-all ${
                                  isRelayActive ? 'justify-end bg-cyan-500/20' : 'justify-start bg-slate-950'
                                }`}
                              >
                                <span className={`w-4 h-4 rounded-full shadow ${isRelayActive ? 'bg-cyan-400' : 'bg-slate-600'}`}></span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* RESIZE HANDLE */}
                        {modoEdicion && (
                          <div
                            onPointerDown={(e) => handlePointerDown(e, idx, 'RESIZE')}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            className="absolute bottom-0 right-0 w-6 h-6 flex items-center justify-center cursor-nwse-resize z-30 touch-none group"
                          >
                            <div className="w-2.5 h-2.5 border-r-2 border-b-2 border-amber-400 group-hover:w-3.5 group-hover:h-3.5 transition-all" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. HARDWARE & I2C */}
      {activeTab === 'HARDWARE_I2C' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-cyan-400" />
              Provisión de Hardware
            </h3>
            <div>
              <label className="text-slate-300 block mb-1">MAC Dispositivo:</label>
              <input
                type="text"
                value={selectedMac}
                onChange={(e) => setSelectedMac(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-bold"
              />
            </div>
            <button
              type="button"
              onClick={handleDesplegarADispositivo}
              className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-xl shadow-lg"
            >
              ⚡ APROVISIONAR Y ENVIAR AL ESP32
            </button>
          </div>

          <div className="ultra-glass p-5 rounded-2xl border border-amber-500/30 space-y-4">
            <div className="flex justify-between items-center border-b border-amber-500/20 pb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-amber-400" />
                Escáner I2C & Mapeo de Salidas
              </h3>
              <button
                type="button"
                onClick={() => {
                  if (!cleanMac) return alert('Selecciona una placa.');
                  setScanningI2C(true);
                  if (sendCommand) sendCommand(cleanMac, { cmd: 'SCAN_HARDWARE' });
                }}
                disabled={scanningI2C}
                className="py-1.5 px-3 bg-amber-500 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5"
              >
                <Search className={`w-3.5 h-3.5 ${scanningI2C ? 'animate-spin' : ''}`} />
                <span>{scanningI2C ? 'Escaneando...' : 'Escanear I2C'}</span>
              </button>
            </div>
            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                const isRelayOn = Boolean(relesLocales[`R${num}`]);
                return (
                  <div key={num} className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-white font-bold">Salida R{num}:</span>
                      <button
                        type="button"
                        onClick={() => handleToggleRelayDirecto(num, isRelayOn)}
                        className={`px-3 py-1 rounded text-[10px] font-bold ${
                          isRelayOn ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {isRelayOn ? 'PROBANDO (ON)' : 'TEST (OFF)'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 4. BIBLIOTECA CLOUD */}
      {activeTab === 'BIBLIOTECA' && (
        <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-4">
          <div className="flex justify-between items-center border-b border-cyan-500/20 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-cyan-400" />
              Biblioteca en Supabase ({perfilesGuardados.length})
            </h3>
            <button onClick={cargarBiblioteca} className="px-2.5 py-1 bg-slate-900 border border-slate-700 text-slate-300 rounded-lg text-xs">
              🔄 Recargar
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {perfilesGuardados.map((p) => (
              <div key={p.id} className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/80 flex flex-col justify-between space-y-3">
                <div>
                  <h4 className="font-bold text-white text-xs truncate">{p.nombre}</h4>
                  <p className="text-[10px] text-slate-400 line-clamp-2 mt-1">{p.descripcion}</p>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                  <button
                    onClick={() => {
                      setPerfilActivoId(p.id);
                      setPerfilNombre(p.nombre);
                      const j = p.perfil_json || {};
                      setWidgets(j.dashboard || []);
                      setHalPayload(j.hal || {});
                      setRecetaActiva(j.receta || null);
                      setActiveTab('STUDIO');
                      setMsg(`📂 Perfil "${p.nombre}" cargado.`);
                    }}
                    className="flex-1 py-1 bg-cyan-600 text-white rounded font-bold text-[10px]"
                  >
                    Cargar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. EDITOR JSON */}
      {activeTab === 'EDITOR_JSON' && (
        <div className="ultra-glass p-5 rounded-2xl border border-indigo-500/30 space-y-3">
          <div className="flex justify-between items-center border-b border-indigo-500/20 pb-2">
            <h3 className="text-sm font-bold text-indigo-300 flex items-center gap-2">
              <FileCode className="w-4 h-4" />
              Editor JSON Manifiesto
            </h3>
          </div>
          <textarea
            rows={18}
            value={jsonRaw}
            onChange={(e) => setJsonRaw(e.target.value)}
            className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-cyan-300 font-mono text-[11px] leading-relaxed focus:outline-none"
            spellCheck="false"
          />
        </div>
      )}

    </div>
  );
}
