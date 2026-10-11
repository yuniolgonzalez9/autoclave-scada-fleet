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

  const [prompt, setPrompt] = useState('');
  const [historialChat, setHistorialChat] = useState([
    {
      id: 'init_msg',
      sender: 'ai',
      texto: 'Hola. Soy tu Copilot de Ingeniería. Describe libremente tu requerimiento y programaré la lógica y los relés exactamente como necesitas.'
    }
  ]);
  const [compilando, setCompilando] = useState(false);
  const [secuenciaEnProgreso, setSecuenciaEnProgreso] = useState(false);
  const chatBottomRef = useRef(null);

  const [apiKey] = useState(() => localStorage.getItem('biofleet_ai_key') || GROQ_DEFAULT_API_KEY);

  const [perfilActivoId, setPerfilActivoId] = useState(null);
  const [perfilNombre, setPerfilNombre] = useState('Secuencia de Relés v1');
  const [tipoEquipo, setTipoEquipo] = useState('UNIVERSAL_PLC');
  const [widgets, setWidgets] = useState([]);
  const [halPayload, setHalPayload] = useState(null);
  const [jsonRaw, setJsonRaw] = useState('');

  const macList = Object.keys(fleet || {});
  const [selectedMac, setSelectedMac] = useState(() => {
    if (initialDeviceMac) return initialDeviceMac.toUpperCase().replace(/[:\-]/g, '');
    if (macList.length > 0) return macList[0];
    return '';
  });

  const [transmitting, setTransmitting] = useState(false);
  const [msg, setMsg] = useState('');

  const [rolesReles, setRolesReles] = useState({});
  const [nombresReles, setNombresReles] = useState({});
  const [liveRelayStates, setLiveRelayStates] = useState({});
  const [chipsDetectados, setChipsDetectados] = useState([]);
  const [scanningI2C, setScanningI2C] = useState(false);

  const [perfilesGuardados, setPerfilesGuardados] = useState([]);
  const [loadingLib, setLoadingLib] = useState(false);

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

  // MOTOR EJECUTOR DE SECUENCIA EN CASCADA PASO A PASO POR MQTT
  const handleEjecutarSecuenciaEnCascada = async (widget) => {
    const cleanMac = (selectedMac || '').toUpperCase().replace(/[:\-]/g, '');
    if (!cleanMac) {
      alert('Por favor selecciona una placa en el selector para enviar los comandos.');
      return;
    }

    if (secuenciaEnProgreso) return;
    setSecuenciaEnProgreso(true);
    setMsg('⚡ Iniciando secuencia en cascada...');

    // Pasos definidos por la IA o secuencia estándar R1->R8 ON y luego R1->R8 OFF
    let pasos = widget.secuencia;
    if (!pasos || pasos.length === 0) {
      pasos = [];
      for (let i = 1; i <= 8; i++) pasos.push({ canal: i, val: 1, delay_ms: 600 });
      for (let i = 1; i <= 8; i++) pasos.push({ canal: i, val: 0, delay_ms: 600 });
    }

    for (let i = 0; i < pasos.length; i++) {
      const paso = pasos[i];
      const canal = paso.canal;
      const estado = paso.val;

      // 1. Actualizar visualmente en pantalla de inmediato
      setLiveRelayStates(prev => ({
        ...prev,
        [canal]: estado,
        [`R${canal}`]: estado
      }));

      // 2. Transmitir el comando físico al ESP32 por MQTT
      if (sendCommand) {
        sendCommand(cleanMac, {
          cmd: 'SET_RELAY',
          canal: Number(canal),
          val: Number(estado)
        });
      }

      setMsg(`Paso ${i + 1}/${pasos.length}: Relé R${canal} -> ${estado === 1 ? 'ENCENDIDO' : 'APAGADO'}`);

      // 3. Esperar el delay configurado (600ms) antes del siguiente relé
      const delay = paso.delay_ms || 600;
      await new Promise(res => setTimeout(res, delay));
    }

    setMsg('✅ Secuencia completa ejecutada con éxito en la placa.');
    setSecuenciaEnProgreso(false);
  };

  // CONTROL INDIVIDUAL DE RELÉ
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

  // INTERACCIÓN CON EL COPILOT IA
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
      setMsg(`✨ Controles programados: "${res.titulo}"`);
    } catch (err) {
      setHistorialChat(prev => [
        ...prev,
        { id: `ai_err_${Date.now()}`, sender: 'ai', texto: `Nota: ${err.message}` }
      ]);
    } finally {
      setCompilando(false);
    }
  };

  // POINTER EVENTS (TOUCH & MOUSE DRAG/RESIZE)
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
    if (!cleanMac) return alert('Selecciona un equipo.');

    setTransmitting(true);
    setMsg(`Desplegando lógica a [${cleanMac}]...`);

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
      
      {/* BARRA SUPERIOR */}
      <div className="ultra-glass p-4 rounded-2xl border border-amber-500/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              BioFleet AI Studio Enterprise
              <span className="px-2 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px]">
                MOTOR DE SECUENCIAS ACTIVO
              </span>
            </h2>
            <p className="text-[11px] text-slate-300 font-sans">
              Compilador conversacional y ejecutor de secuencias de relés en tiempo real.
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

      {/* PESTAÑA PRINCIPAL: CHAT COPILOT Y LIENZO */}
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
                onClick={() => setHistorialChat([{ id: 'reset', sender: 'ai', texto: 'Historial reiniciado. Dime qué nuevo control o máquina deseas diseñar.' }])}
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
                placeholder="Escribe aquí tu requerimiento o contesta a la IA..."
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
                Lienzo Generado ({widgets.length} Widgets):
              </span>
              <span className="text-[10px] text-amber-300">
                {secuenciaEnProgreso 
                  ? '⚡ EJECUTANDO SECUENCIA EN LA PLACA FÍSICA...' 
                  : modoEdicion 
                  ? '🛠️ Arrastra la barra superior para mover y la esquina para redimensionar' 
                  : '👁️ Modo Operador: Toca para accionar relés o ejecutar la secuencia'}
              </span>
            </div>

            {widgets.length === 0 ? (
              <div className="py-16 border-2 border-dashed border-slate-800 rounded-xl text-center text-slate-500 space-y-2">
                <Sparkles cla
