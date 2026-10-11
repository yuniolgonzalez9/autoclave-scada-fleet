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
  User 
} from 'lucide-react';

const SNAP_GRID = 10;
const GROQ_DEFAULT_API_KEY = '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';

export default function AiAutomationStudio({ fleet = {}, sendCommand = null, initialDeviceMac = null }) {
  const [activeTab, setActiveTab] = useState('STUDIO');
  const [modoEdicion, setModoEdicion] = useState(false);
  const [widgetEnEdicion, setWidgetEnEdicion] = useState(null);

  // Estados del Chat
  const [prompt, setPrompt] = useState('');
  const [historialChat, setHistorialChat] = useState([
    {
      id: 'init_msg',
      sender: 'ai',
      texto: 'Hola. Soy tu Copilot de Ingeniería. Describe cualquier lógica, secuencia o proceso industrial y razonaré la arquitectura a tu medida sin plantillas fijas.'
    }
  ]);
  const [compilando, setCompilando] = useState(false);
  const [secuenciaEnProgreso, setSecuenciaEnProgreso] = useState(false);
  const chatBottomRef = useRef(null);

  const [apiKey] = useState(() => localStorage.getItem('biofleet_ai_key') || GROQ_DEFAULT_API_KEY);

  // Perfil y Dashboard
  const [perfilActivoId, setPerfilActivoId] = useState(null);
  const [perfilNombre, setPerfilNombre] = useState('Automatización Industrial v1');
  const [tipoEquipo, setTipoEquipo] = useState('UNIVERSAL_PLC');
  const [widgets, setWidgets] = useState([]);
  const [halPayload, setHalPayload] = useState(null);
  const [jsonRaw, setJsonRaw] = useState('');

  // Selección de Hardware HKL-EA8
  const macList = Object.keys(fleet || {});
  const [selectedMac, setSelectedMac] = useState(() => {
    if (initialDeviceMac) return initialDeviceMac.toUpperCase().replace(/[:\-]/g, '');
    if (macList.length > 0) return macList[0];
    return '';
  });

  const [transmitting, setTransmitting] = useState(false);
  const [msg, setMsg] = useState('');

  // Hardware y Escáner I2C
  const [rolesReles, setRolesReles] = useState({});
  const [nombresReles, setNombresReles] = useState({});
  const [liveRelayStates, setLiveRelayStates] = useState({});
  const [chipsDetectados, setChipsDetectados] = useState([]);
  const [scanningI2C, setScanningI2C] = useState(false);

  // Biblioteca Cloud
  const [perfilesGuardados, setPerfilesGuardados] = useState([]);
  const [loadingLib, setLoadingLib] = useState(false);

  // Referencias para Pointer Events
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
    const cleanMac = (selectedMac || '').toUpperCase().replace(/[:\-]/g, '');
    const dev = fleet[cleanMac];
    if (dev?.i2cReport?.chips) {
      setChipsDetectados(dev.i2cReport.chips);
      setScanningI2C(false);
    }
    if (dev?.datos?.reles) {
      setLiveRelayStates(dev.datos.reles);
    }
  }, [fleet, selectedMac]);

  // SECUENCIADOR UNIVERSAL EN TIEMPO REAL VÍA MQTT
  const handleEjecutarSecuenciaUniversal = async (widget) => {
    const cleanMac = (selectedMac || '').toUpperCase().replace(/[:\-]/g, '');
    if (!cleanMac) {
      alert('Por favor selecciona una placa en el selector para transmitir los comandos.');
      return;
    }

    if (secuenciaEnProgreso) return;
    setSecuenciaEnProgreso(true);
    setMsg('⚡ Iniciando secuencia...');

    const pasos = widget.secuencia || [];

    for (let i = 0; i < pasos.length; i++) {
      const paso = pasos[i];
      const canal = paso.canal;
      const estado = paso.val;

      // 1. Reflejo visual inmediato en el SCADA
      setLiveRelayStates(prev => ({
        ...prev,
        [canal]: estado,
        [`R${canal}`]: estado
      }));

      // 2. Transmisión física al controlador HKL-EA8
      if (sendCommand) {
        sendCommand(cleanMac, {
          cmd: 'SET_RELAY',
          canal: Number(canal),
          val: Number(estado)
        });
      }

      setMsg(`Secuencia [${i + 1}/${pasos.length}]: R${canal} -> ${estado === 1 ? 'ON' : 'OFF'}`);

      // 3. Retardo físico definido por la IA
      const delay = paso.delay_ms || 500;
      await new Promise(res => setTimeout(res, delay));
    }

    setMsg('✅ Secuencia completa ejecutada con éxito en la placa.');
    setSecuenciaEnProgreso(false);
  };

  // CONTROL DIRECTO DE RELÉ INDIVIDUAL
  const handleToggleRelayDirecto = (canal, currentState = null) => {
    const cleanMac = (selectedMac || '').toUpperCase().replace(/[:\-]/g, '');
    const stateActual = currentState !== null ? currentState : Boolean(liveRelayStates[canal] || liveRelayStates[`R${canal}`]);
    const nextVal = !stateActual;

    setLiveRelayStates(prev => ({
      ...prev,
      [canal]: nextVal ? 1 : 0,
      [`R${canal}`]: nextVal ? 1 : 0
    }));

    if (cleanMac && sendCommand) {
      sendCommand(cleanMac, {
        cmd: 'SET_RELAY',
        canal: Number(canal),
        val: nextVal ? 1 : 0
      });
      setMsg(`📡 Relé R${canal} -> ${nextVal ? 'ON (ACTIVO)' : 'OFF (APAGADO)'}`);
    }
  };

  // ENVIAR INSTRUCCIÓN A LA IA
  const handleEnviarMensaje = async (e) => {
    if (e) e.preventDefault();
    const textoUsuario = prompt.trim();
    if (!textoUsuario) return;

    setHistorialChat(prev => [...prev, { id: `u_${Date.now()}`, sender: 'user', texto: textoUsuario }]);
    setPrompt('');
    setCompilando(true);
    setMsg('');

    try {
      const cleanMac = (selectedMac || '').toUpperCase().replace(/[:\-]/g, '');
      const targetDev = fleet[cleanMac] || null;

      const res = await conversarYCompilarConIA({
        prompt: textoUsuario,
        historial: historialChat.map(h => ({ sender: h.sender, contenido: h.texto })),
        hardwareInfo: targetDev?.meta?.config_deseada || { reles: 8, entradas: 8 },
        apiKey
      });

      setHistorialChat(prev => [
        ...prev,
        { id: `ai_${Date.now()}`, sender: 'ai', texto: res.mensajeChat }
      ]);

      if (res.dashboardWidgets && res.dashboardWidgets.length > 0) {
        setWidgets(res.dashboardWidgets);
      }

      setPerfilNombre(res.titulo || perfilNombre);
      setTipoEquipo(res.tipo || tipoEquipo);

      if (res.halPayload?.nombres_reles) setNombresReles(res.halPayload.nombres_reles);
      if (res.halPayload?.roles_reles) setRolesReles(res.halPayload.roles_reles);

      setHalPayload(res.halPayload || {});
      setJsonRaw(JSON.stringify(res, null, 2));
      setMsg(`✨ Arquitectura generada: "${res.titulo}"`);
    } catch (err) {
      setHistorialChat(prev => [
        ...prev,
        { id: `ai_err_${Date.now()}`, sender: 'ai', texto: `Error: ${err.message}` }
      ]);
    } finally {
      setCompilando(false);
    }
  };

  // POINTER EVENTS (TOUCH Y MOUSE LIBRE)
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
      setJsonRaw(JSON.stringify({ tipo: tipoEquipo, hal: halPayload, dashboard: widgets }, null, 2));
    }
  };

  const handleScanI2C = () => {
    const cleanMac = (selectedMac || '').toUpperCase().replace(/[:\-]/g, '');
    if (!cleanMac) return alert('Selecciona una placa.');
    setScanningI2C(true);
    setMsg(`Escaneando bus I2C en [${cleanMac}]...`);
    if (sendCommand) sendCommand(cleanMac, { cmd: 'SCAN_HARDWARE' });
  };

  const handleDesplegarADispositivo = async () => {
    const cleanMac = (selectedMac || '').toUpperCase().replace(/[:\-]/g, '');
    if (!cleanMac) return alert('Selecciona un equipo destino.');

    setTransmitting(true);
    setMsg(`Transmitiendo lógica a [${cleanMac}]...`);

    const commandPayload = {
      cmd: 'APPLY_HAL_MAP',
      mac: cleanMac,
      tipo: tipoEquipo,
      timestamp: Date.now(),
      roles_reles: rolesReles,
      nombres_reles: nombresReles,
      custom_dashboard: {
        titulo: perfilNombre,
        widgets
      }
    };

    if (sendCommand) sendCommand(cleanMac, commandPayload);

    try {
      await supabase.from('asignaciones_equipos').upsert({
        mac: cleanMac,
        alias: perfilNombre,
        config_deseada: commandPayload,
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
              BioFleet AI Studio Enterprise
              <span className="px-2 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px]">
                GROQ LLAMA-3.1-8B
              </span>
            </h2>
            <p className="text-[11px] text-slate-300 font-sans">
              Compilador de razonamiento directo para SCADA, autómatas y hardware HKL-EA8.
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
              <span>Copilot & Lienzo</span>
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

      {/* 2. CHAT CON LA IA & LIENZO */}
      {activeTab === 'STUDIO' && (
        <div className="space-y-4">
          
          {/* CONSOLA DE DIÁLOGO */}
          <div className="ultra-glass p-4 rounded-2xl border border-amber-500/30 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-amber-300 font-bold uppercase text-[11px] flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-emerald-400" />
                Diálogo con el Ingeniero IA:
              </span>
              <button
                type="button"
                onClick={() => setHistorialChat([{ id: 'reset', sender: 'ai', texto: 'Historial reiniciado. Dime qué sistema o lógica deseas diseñar.' }])}
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
                placeholder="Escribe tu requerimiento (ej: 'creame un boton para encender de r1 a r8 y que se apaguen en orden')..."
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

          {/* LIENZO DE WIDGETS */}
          <div className="ultra-glass p-4 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-white font-bold flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-cyan-400" />
                Lienzo ({widgets.length} Widgets):
              </span>
              <span className="text-[10px] text-amber-300">
                {secuenciaEnProgreso 
                  ? '⚡ EJECUTANDO SECUENCIA EN LA PLACA FÍSICA...' 
                  : modoEdicion 
                  ? '🛠️ Arrastra la barra superior para mover y la esquina para redimensionar' 
                  : '👁️ Modo Operador: Toca para accionar relés o disparar la secuencia'}
              </span>
            </div>

            {widgets.length === 0 ? (
              <div className="py-16 border-2 border-dashed border-slate-800 rounded-xl text-center text-slate-500 space-y-2">
                <Sparkles className="w-8 h-8 mx-auto text-amber-500/40 animate-pulse" />
                <p>Escribe tu instrucción en el chat para que la IA razone y arme los controles.</p>
              </div>
            ) : (
              <div
                ref={canvasRef}
                className="w-full min-h-[580px] h-[680px] relative bg-slate-950/80 rounded-2xl border border-slate-800 overflow-auto bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:20px_20px]"
              >
                <div className="w-[2400px] h-[1800px] relative">
                  {widgets.map((w, idx) => {
                    const isEditingThis = widgetEnEdicion === idx;
                    const isRelayActive = Boolean(liveRelayStates[w.canal || 1] || liveRelayStates[`R${w.canal || 1}`]);
                    const esSecuencia = w.accion === 'SECUENCIA' || (w.secuencia && w.secuencia.length > 0);

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
                            {w.canal && !esSecuencia && (
                              <span className="text-[8px] px-1 py-0.2 rounded bg-slate-800 text-slate-300 shrink-0">R{w.canal}</span>
                            )}
                            {esSecuencia && (
                              <span className="text-[8px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0">SECUENCIA</span>
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

                        {/* CUERPO INTERACTIVO */}
                        <div 
                          className="flex-1 p-2.5 flex flex-col items-center justify-center overflow-hidden" 
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          {modoEdicion && isEditingThis ? (
                            <div className="w-full h-full overflow-y-auto space-y-2 p-1 text-[10px] bg-slate-950/90 rounded-lg">
                              <div>
                                <span className="text-slate-400">Título:</span>
                                <input
                                  type="text"
                                  value={w.titulo}
                                  onChange={(e) => {
                                    const next = [...widgets];
                                    next[idx].titulo = e.target.value;
                                    setWidgets(next);
                                  }}
                                  className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-white"
                                />
                              </div>
                            </div>
                          ) : (
                            <>
                              {w.tipo === 'ACTION_BUTTON' && (
                                <button
                                  type="button"
                                  disabled={secuenciaEnProgreso}
                                  onClick={() => {
                                    if (esSecuencia) {
                                      handleEjecutarSecuenciaUniversal(w);
                                    } else {
                                      handleToggleRelayDirecto(w.canal || 1);
                                    }
                                  }}
                                  className={`w-full py-3.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all ${
                                    secuenciaEnProgreso && esSecuencia
                                      ? 'bg-amber-500 text-slate-950 animate-pulse shadow-amber-500/30'
                                      : isRelayActive && !esSecuencia
                                      ? 'bg-cyan-500 text-slate-950 shadow-cyan-500/30 scale-95'
                                      : 'bg-slate-950 border border-current hover:brightness-125'
                                  }`}
                                >
                                  {secuenciaEnProgreso && esSecuencia ? (
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Play className={`w-3.5 h-3.5 ${isRelayActive ? 'fill-slate-950' : 'fill-current'}`} />
                                  )}
                                  <span>{secuenciaEnProgreso && esSecuencia ? 'Ejecutando Secuencia...' : w.titulo}</span>
                                </button>
                              )}

                              {w.tipo === 'SWITCH_TOGGLE' && (
                                <div
                                  onClick={() => handleToggleRelayDirecto(w.canal || 1)}
                                  className="flex items-center justify-between w-full px-3 cursor-pointer py-2 bg-slate-950/60 rounded-xl border border-slate-800"
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

                              {w.tipo === 'GAUGE_RADIAL' && (
                                <div className="text-center w-full">
                                  <span className="text-2xl font-bold font-mono tracking-tight text-white">{w.max ? Math.round(w.max * 0.42) : 42}</span>
                                  <span className="text-[10px] text-slate-400 ml-1">{w.unidad || ''}</span>
                                  <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden mt-1.5 border border-slate-800">
                                    <div className="bg-current h-full w-2/5 rounded-full"></div>
                                  </div>
                                  <span className="block text-[8px] text-slate-500 mt-1">{w.titulo}</span>
                                </div>
                              )}

                              {w.tipo === 'VALUE_CARD' && (
                                <div className="text-center">
                                  <span className="text-2xl font-bold font-mono tracking-tight text-white">0.00</span>
                                  <span className="text-xs text-slate-400 ml-1">{w.unidad || ''}</span>
                                  <span className="block text-[8px] text-slate-500 mt-0.5">{w.titulo}</span>
                                </div>
                              )}

                              {w.tipo === 'STATUS_LED' && (
                                <div className="flex items-center gap-2">
                                  <span className={`w-3 h-3 rounded-full ${isRelayActive ? 'bg-emerald-400 animate-ping' : 'bg-slate-700'}`}></span>
                                  <span className="font-bold text-xs">{isRelayActive ? 'ACTIVO' : 'OFF'}</span>
                                </div>
                              )}
                            </>
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
                onClick={handleScanI2C}
                disabled={scanningI2C}
                className="py-1.5 px-3 bg-amber-500 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5"
              >
                <Search className={`w-3.5 h-3.5 ${scanningI2C ? 'animate-spin' : ''}`} />
                <span>{scanningI2C ? 'Escaneando...' : 'Escanear I2C'}</span>
              </button>
            </div>
            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                const isRelayOn = Boolean(liveRelayStates[num] || liveRelayStates[`R${num}`]);
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
