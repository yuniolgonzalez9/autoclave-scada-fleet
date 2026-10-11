import React, { useState, useEffect, useRef } from 'react';
import { compilarConIA, detectarProveedorApiKey } from '../../services/aiStudioService';
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
  Wrench, 
  ExternalLink 
} from 'lucide-react';

const SNAP_GRID = 10;
const GROQ_DEFAULT_API_KEY = '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';

const CATALOGO_MAESTRO = {
  VEHICULO: {
    HYUNDAI: ['Staria Ambulancia / Van', 'Starex / H-1', 'Porter II'],
    KIA: ['Carnival / Sedona', 'Bongo III', 'Sportage'],
    TOYOTA: ['Hilux', 'HiAce Ambulancia', 'Land Cruiser'],
    MERCEDES_BENZ: ['Sprinter 315/415 CDI', 'Vito Combi'],
    GENERICO_VEHICULAR: ['Genérico 12V Gasolina', 'Genérico 24V Diésel']
  },
  AUTOCLAVE: {
    STERIS_AMSCO: ['Amsco 400 Small', 'Amsco Century V116', 'Steris V-PRO'],
    GETINGE: ['Getinge GSS67N', 'Getinge HS66', 'Getinge K-Series'],
    TUTTNAUER: ['2340M Manual', 'Elara 11 Clase B', 'EZ10k Plus'],
    GENERICO: ['Autoclave Clase B 24L', 'Horno Pasteur']
  },
  PLC_GENERICO: {
    HANKERILA: ['HKL-EA8 (8 Relés / 8 Entradas / ADS1115)'],
    GENERICO: ['Tablero Soft-PLC Universal 8 I/O', 'Controlador de Cuarto Frío']
  }
};

const PLACAS_PREFABRICADAS = {
  HKL_EA8: {
    nombre: 'Hankerila HKL-EA8 Industrial',
    desc: 'ESP32 16MB + Ethernet LAN8720 + I2C (0x24 Relés, 0x26 Opto, 0x48 ADC ADS1115)',
    uplink: 'ETHERNET_LAN8720',
    sda: 4,
    scl: 5
  },
  KINCONY_A8: {
    nombre: 'Kincony KC868-A8 PLC',
    desc: 'ESP32 + Ethernet LAN8720 + 8 Relés Directos + 8 Entradas Opto',
    uplink: 'ETHERNET_LAN8720',
    sda: 4,
    scl: 15
  },
  GENERIC_DEVKIT: {
    nombre: 'ESP32 DevKit Genérico / Custom',
    desc: 'Placa estándar con conexionado libre de taller',
    uplink: 'WIFI',
    sda: 21,
    scl: 22
  }
};

export default function AiAutomationStudio({ fleet = {}, sendCommand = null, initialDeviceMac = null }) {
  // Pestañas Maestras
  const [activeTab, setActiveTab] = useState('STUDIO'); // 'STUDIO' | 'HARDWARE_I2C' | 'BIBLIOTECA' | 'EDITOR_JSON'
  const [modoEdicion, setModoEdicion] = useState(false);
  const [widgetEnEdicion, setWidgetEnEdicion] = useState(null);

  // Prompt de Razonamiento
  const [prompt, setPrompt] = useState('');
  const [modoIaRefinar, setModoIaRefinar] = useState(false);
  const [compilando, setCompilando] = useState(false);

  // Clave Groq conectada por defecto
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('biofleet_ai_key') || GROQ_DEFAULT_API_KEY);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyInputTemp, setKeyInputTemp] = useState('');

  // Perfil y Dashboard
  const [perfilActivoId, setPerfilActivoId] = useState(null);
  const [perfilNombre, setPerfilNombre] = useState('Automatización Industrial v1');
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
  const [modoHardware, setModoHardware] = useState('PREFABRICADO');
  const [placaPrefabricada, setPlacaPrefabricada] = useState('HKL_EA8');
  const [tipoEquipo, setTipoEquipo] = useState('UNIVERSAL_PLC');
  const [marca, setMarca] = useState('HANKERILA');
  const [modelo, setModelo] = useState('HKL-EA8 (8 Relés / 8 Entradas / ADS1115)');

  // Escáner I2C
  const [scanningI2C, setScanningI2C] = useState(false);
  const [chipsDetectados, setChipsDetectados] = useState([]);
  const [selectedChipDir, setSelectedChipDir] = useState('0x24');

  const [rolesReles, setRolesReles] = useState({
    R1: 'MANUAL', R2: 'MANUAL', R3: 'MANUAL', R4: 'MANUAL',
    R5: 'MANUAL', R6: 'MANUAL', R7: 'MANUAL', R8: 'MANUAL'
  });
  const [nombresReles, setNombresReles] = useState({
    R1: 'Salida R1', R2: 'Salida R2', R3: 'Salida R3', R4: 'Salida R4',
    R5: 'Salida R5', R6: 'Salida R6', R7: 'Salida R7', R8: 'Salida R8'
  });

  const [liveRelayStates, setLiveRelayStates] = useState({});
  const [perfilesGuardados, setPerfilesGuardados] = useState([]);
  const [loadingLib, setLoadingLib] = useState(false);

  // Referencias para Pointer Events (Touch & Mouse Drag & Resize libre)
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

  // Guardar en localStorage al montar si no estaba guardada
  useEffect(() => {
    if (!localStorage.getItem('biofleet_ai_key')) {
      localStorage.setItem('biofleet_ai_key', GROQ_DEFAULT_API_KEY);
    }
  }, []);

  // Cargar Biblioteca de Supabase
  const cargarBiblioteca = async () => {
    setLoadingLib(true);
    try {
      const { data, error } = await supabase
        .from('perfiles_hardware')
        .select('*')
        .order('updated_at', { ascending: false });
      if (!error && data) setPerfilesGuardados(data);
    } catch (e) {
      console.warn('Error biblioteca:', e);
    } finally {
      setLoadingLib(false);
    }
  };

  useEffect(() => {
    cargarBiblioteca();
  }, []);

  // Escuchar reporte I2C físico emitido por la placa
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

  // Guardar API Key
  const handleGuardarApiKey = () => {
    const clean = keyInputTemp.trim();
    if (!clean) {
      alert('Por favor ingresa una clave válida.');
      return;
    }
    setApiKey(clean);
    localStorage.setItem('biofleet_ai_key', clean);
    setShowKeyModal(false);
    setMsg(`✅ Motor activo: ${detectarProveedorApiKey(clean)}`);
  };

  // COMPILAR CON IA (RAZONAMIENTO PROFUNDO LLAMA 3.3 70B)
  const handleEjecutarCompilacion = async (textoPersonalizado = null) => {
    const texto = textoPersonalizado || prompt;
    if (!texto.trim()) {
      alert('Por favor describe qué automatización deseas razonar y compilar.');
      return;
    }

    setCompilando(true);
    setMsg('');

    try {
      const cleanMac = (selectedMac || '').toUpperCase().replace(/[:\-]/g, '');
      const targetDev = fleet[cleanMac] || null;

      const res = await compilarConIA({
        prompt: texto,
        device: targetDev,
        hardwareInfo: { placa: placaPrefabricada, modo: modoHardware },
        apiKey
      });

      if (res && res.dashboardWidgets) {
        if (!modoIaRefinar) {
          setPerfilActivoId(null);
          setPerfilNombre(res.titulo || 'Sistema Compilado');
          setTipoEquipo(res.tipo || res.halPayload?.tipo || 'UNIVERSAL_PLC');
        }

        if (res.halPayload?.nombres_reles) {
          setNombresReles(prev => ({ ...prev, ...res.halPayload.nombres_reles }));
        }
        if (res.halPayload?.roles_reles) {
          setRolesReles(prev => ({ ...prev, ...res.halPayload.roles_reles }));
        }

        setWidgets(res.dashboardWidgets);
        setHalPayload(res.halPayload || {});
        setJsonRaw(JSON.stringify(res, null, 2));

        setMsg(`🧠 [Groq Llama 3.3 70B]: ¡Arquitectura razonada con éxito para "${res.titulo}"!`);
      }
    } catch (err) {
      console.warn('Compilación ajustada:', err);
      setMsg('Aviso: ' + err.message);
    } finally {
      setCompilando(false);
    }
  };

  // POINTER EVENTS: DRAG Y RESIZE LIBRE
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
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch (_) {}
      }
      activeInteraction.current = { type: null, widgetIdx: null };
      setJsonRaw(JSON.stringify({ tipo: tipoEquipo, hal: halPayload, dashboard: widgets }, null, 2));
    }
  };

  // CONTROL EN VIVO DE RELÉS (MODO OPERADOR & TEST)
  const handleToggleRelayDirecto = (canal, currentState = null) => {
    const cleanMac = (selectedMac || '').toUpperCase().replace(/[:\-]/g, '');
    const stateActual = currentState !== null ? currentState : Boolean(liveRelayStates[canal] || liveRelayStates[`R${canal}`]);
    const nextVal = !stateActual;

    setLiveRelayStates(prev => ({
      ...prev,
      [canal]: nextVal ? 1 : 0,
      [`R${canal}`]: nextVal ? 1 : 0
    }));

    if (cleanMac && typeof sendCommand === 'function') {
      sendCommand(cleanMac, {
        cmd: 'SET_RELAY',
        canal: Number(canal),
        val: nextVal ? 1 : 0
      });
      setMsg(`📡 [${cleanMac.slice(-4)}] Relé R${canal} -> ${nextVal ? 'ON (ACTIVO)' : 'OFF (APAGADO)'}`);
    }
  };

  // ESCANEAR BUS I2C
  const handleScanI2C = () => {
    const cleanMac = (selectedMac || '').toUpperCase().replace(/[:\-]/g, '');
    if (!cleanMac) return alert('Selecciona una placa en el selector.');
    setScanningI2C(true);
    setMsg(`Enviando SCAN_HARDWARE a [${cleanMac}]...`);
    if (sendCommand) sendCommand(cleanMac, { cmd: 'SCAN_HARDWARE' });
  };

  // DESPLEGAR A LA PLACA FÍSICA (LITTLEFS & MQTT)
  const handleDesplegarADispositivo = async () => {
    const cleanMac = (selectedMac || '').toUpperCase().replace(/[:\-]/g, '');
    if (!cleanMac) return alert('Selecciona un equipo destino en el selector.');

    setTransmitting(true);
    setMsg(`Transmitiendo configuración a [${cleanMac}]...`);

    const commandPayload = {
      cmd: 'APPLY_HAL_MAP',
      mac: cleanMac,
      tipo: tipoEquipo,
      timestamp: Date.now(),
      roles_reles: rolesReles,
      nombres_reles: nombresReles,
      custom_dashboard: {
        titulo: perfilNombre,
        widgets: widgets.map(w => ({
          id: w.id,
          tipo: w.tipo,
          titulo: w.titulo,
          canal: w.canal || 1,
          unidad: w.unidad || '',
          color: w.color || 'cyan',
          x: w.x || 0,
          y: w.y || 0,
          w: w.w || 260,
          h: w.h || 170
        }))
      }
    };

    let mqttOk = false;
    if (typeof sendCommand === 'function') {
      try {
        sendCommand(cleanMac, commandPayload);
        mqttOk = true;
      } catch (e) {
        console.error('MQTT error:', e);
      }
    }

    try {
      await supabase.from('asignaciones_equipos').upsert({
        mac: cleanMac,
        alias: perfilNombre,
        config_deseada: commandPayload,
        updated_at: new Date().toISOString()
      }, { onConflict: 'mac' });

      setMsg(mqttOk ? `⚡ ¡Configuración grabada en Flash LittleFS de [${cleanMac}]!` : '⚠️ Guardado en Supabase, verifica conexión MQTT.');
    } catch (err) {
      setMsg('Error Supabase: ' + err.message);
    } finally {
      setTransmitting(false);
    }
  };

  // GUARDAR EN SUPABASE
  const handleGuardarEnSupabase = async () => {
    const payloadDB = {
      nombre: perfilNombre.trim() || 'Perfil Sin Nombre',
      descripcion: `Automatización para ${tipoEquipo} • ${widgets.length} Widgets`,
      hardware_rev: placaPrefabricada,
      perfil_json: { tipo: tipoEquipo, hal: halPayload, dashboard: widgets },
      activo: true,
      updated_at: new Date().toISOString()
    };

    try {
      if (perfilActivoId) {
        await supabase.from('perfiles_hardware').update(payloadDB).eq('id', perfilActivoId);
      } else {
        const { data } = await supabase.from('perfiles_hardware').insert([payloadDB]).select();
        if (data && data[0]) setPerfilActivoId(data[0].id);
      }
      setMsg(`💾 ¡Perfil "${perfilNombre}" respaldado en Supabase Cloud!`);
      cargarBiblioteca();
    } catch (err) {
      setMsg('Error guardando en Supabase: ' + err.message);
    }
  };

  return (
    <div className="space-y-4 font-mono text-xs select-none">
      
      {/* 1. BARRA SUPERIOR DE CONTROL */}
      <div className="ultra-glass p-4 rounded-2xl border border-amber-500/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              BioFleet AI Studio Enterprise
              <span className="px-2 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px]">
                MOTOR: GROQ LLAMA 3.3 70B
              </span>
            </h2>
            <p className="text-[11px] text-slate-300 font-sans">
              Razonamiento de ingeniería profunda para procesos industriales, SCADA y silicio HKL-EA8.
            </p>
          </div>
        </div>

        {/* NAVEGACIÓN Y CONFIGURACIÓN */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => { setKeyInputTemp(apiKey); setShowKeyModal(true); }}
            className="px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 border transition-all bg-slate-900 border-emerald-500/50 text-emerald-300 hover:border-emerald-400"
          >
            <Key className="w-3.5 h-3.5" />
            <span>Groq Llama 3.3 (Activo)</span>
          </button>

          <div className="flex p-0.5 bg-slate-950 border border-slate-800 rounded-xl">
            <button
              onClick={() => setActiveTab('STUDIO')}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'STUDIO' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Lienzo</span>
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

      {/* ========================================================================= */}
      {/* 2. PESTAÑA PRINCIPAL: LIENZO Y PROMPT DE RAZONAMIENTO                     */}
      {/* ========================================================================= */}
      {activeTab === 'STUDIO' && (
        <div className="space-y-4">
          
          {/* PROMPT DE RAZONAMIENTO */}
          <div className="ultra-glass p-4 rounded-2xl border border-amber-500/30 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-amber-300 font-bold uppercase text-[11px] flex items-center gap-1.5">
                <Wand2 className="w-3.5 h-3.5" />
                Prompt Libre de Ingeniería (Razona secuencias, rampas, autoclaves, vehículos y lógicas complejas):
              </span>
              <label className="text-[10px] text-slate-300 cursor-pointer flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={modoIaRefinar}
                  onChange={(e) => setModoIaRefinar(e.target.checked)}
                  className="accent-amber-400"
                />
                <span>Modificar sobre widgets actuales</span>
              </label>
            </div>

            <div className="flex gap-2">
              <textarea
                rows={2}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ejemplo: 'Autoclave con doble rampa de vacío, calentamiento 134°C en R1, sensor A0, purga R4 si pasa de 2.5 bar y paro por puerta IN1'"
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-sans focus:outline-none focus:border-amber-400"
              />
              <button
                type="button"
                onClick={() => handleEjecutarCompilacion()}
                disabled={compilando}
                className="px-5 py-2 bg-gradient-to-r from-amber-500 to-emerald-500 hover:opacity-90 text-slate-950 font-bold rounded-xl flex flex-col items-center justify-center gap-1 shadow-lg shadow-amber-500/20 shrink-0 disabled:opacity-50 font-mono"
              >
                {compilando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>{compilando ? 'Razonando...' : 'Generar IA'}</span>
              </button>
            </div>
          </div>

          {/* BARRA DE IDENTIDAD Y ACCIONES RÁPIDAS */}
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

              {modoEdicion && (
                <button
                  type="button"
                  onClick={() => {
                    const nuevo = {
                      id: `w_${Date.now()}`,
                      tipo: 'ACTION_BUTTON',
                      titulo: 'Nuevo Control',
                      canal: 1,
                      color: 'cyan',
                      x: 30,
                      y: 30,
                      w: 260,
                      h: 170
                    };
                    setWidgets([...widgets, nuevo]);
                    setWidgetEnEdicion(widgets.length);
                  }}
                  className="px-2.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold text-[10px] flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ Widget</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
              <button
                type="button"
                onClick={handleGuardarEnSupabase}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{perfilActivoId ? 'Actualizar Cloud' : 'Guardar en Supabase'}</span>
              </button>

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

          {/* LIENZO LIBRE X/Y/W/H */}
          <div className="ultra-glass p-4 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-white font-bold flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-cyan-400" />
                Lienzo de Operación Libre ({widgets.length} Widgets):
              </span>
              <span className="text-[10px] text-amber-300">
                {modoEdicion ? '🛠️ Arrastra la barra superior para mover y la esquina inferior derecha para redimensionar' : '👁️ Modo Operador: Toca para accionar relés en vivo'}
              </span>
            </div>

            {widgets.length === 0 ? (
              <div className="py-16 border-2 border-dashed border-slate-800 rounded-xl text-center text-slate-500 space-y-2">
                <Sparkles className="w-8 h-8 mx-auto text-amber-500/40 animate-pulse" />
                <p>Escribe tu automatización compleja arriba y pulsa "Generar IA".</p>
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
                        {/* 1. HEADER EXCLUSIVO PARA DRAG */}
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

                        {/* 2. CUERPO INTERACTIVO */}
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
                              <div className="grid grid-cols-2 gap-1.5">
                                <div>
                                  <span className="text-slate-400">Tipo:</span>
                                  <select
                                    value={w.tipo}
                                    onChange={(e) => {
                                      const next = [...widgets];
                                      next[idx].tipo = e.target.value;
                                      setWidgets(next);
                                    }}
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-cyan-300 font-bold"
                                  >
                                    <option value="ACTION_BUTTON">🔘 Botón</option>
                                    <option value="SWITCH_TOGGLE">🎚️ Switch</option>
                                    <option value="GAUGE_RADIAL">🧭 Gauge</option>
                                    <option value="VALUE_CARD">🔢 Valor</option>
                                    <option value="STATUS_LED">💡 LED</option>
                                  </select>
                                </div>
                                <div>
                                  <span className="text-slate-400">Relé:</span>
                                  <select
                                    value={w.canal || 1}
                                    onChange={(e) => {
                                      const next = [...widgets];
                                      next[idx].canal = Number(e.target.value);
                                      setWidgets(next);
                                    }}
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-amber-300 font-bold"
                                  >
                                    {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                                      <option key={n} value={n}>R{n}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <>
                              {w.tipo === 'ACTION_BUTTON' && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleRelayDirecto(w.canal || 1)}
                                  className={`w-full py-3 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all ${
                                    isRelayActive
                                      ? 'bg-cyan-500 text-slate-950 shadow-cyan-500/30 scale-95'
                                      : 'bg-slate-950 border border-current hover:brightness-125'
                                  }`}
                                >
                                  <Play className={`w-3.5 h-3.5 ${isRelayActive ? 'fill-slate-950' : 'fill-current'}`} />
                                  <span>{w.titulo}</span>
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
                                  <span className="text-2xl font-bold font-mono tracking-tight text-white">68.5</span>
                                  <span className="text-xs text-slate-400 ml-1">{w.unidad || '°C'}</span>
                                  <span className="block text-[8px] text-slate-500 mt-0.5">{w.titulo}</span>
                                </div>
                              )}

                              {w.tipo === 'STATUS_LED' && (
                                <div className="flex items-center gap-2">
                                  <span className={`w-3 h-3 rounded-full ${isRelayActive ? 'bg-emerald-400 animate-ping' : 'bg-slate-700'}`}></span>
                                  <span className="font-bold text-xs">{isRelayActive ? 'ACTIVO' : 'ESPERA'}</span>
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {/* 3. RESIZE HANDLE INFERIOR DERECHO */}
                        {modoEdicion && (
                          <div
                            onPointerDown={(e) => handlePointerDown(e, idx, 'RESIZE')}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            title="Tira con el dedo o mouse para redimensionar"
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

      {/* ========================================================================= */}
      {/* 3. PESTAÑA B: HARDWARE & ESCÁNER I2C EN VIVO                              */}
      {/* ========================================================================= */}
      {activeTab === 'HARDWARE_I2C' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-cyan-400" />
              Provisión de Placa HKL-EA8
            </h3>

            <div>
              <label className="text-slate-300 block mb-1">Dirección MAC:</label>
              <input
                type="text"
                value={selectedMac}
                onChange={(e) => setSelectedMac(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-bold"
              />
            </div>

            <div>
              <label className="text-slate-300 block mb-1">Placa Comercial:</label>
              <select
                value={placaPrefabricada}
                onChange={(e) => setPlacaPrefabricada(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-cyan-300 font-bold"
              >
                {Object.keys(PLACAS_PREFABRICADAS).map(k => (
                  <option key={k} value={k}>{PLACAS_PREFABRICADAS[k].nombre}</option>
                ))}
              </select>
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
                    <input
                      type="text"
                      value={nombresReles[`R${num}`] || ''}
                      onChange={(e) => setNombresReles(prev => ({ ...prev, [`R${num}`]: e.target.value }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-[11px]"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. PESTAÑA C: BIBLIOTECA CLOUD (SUPABASE)                                 */}
      {/* ========================================================================= */}
      {activeTab === 'BIBLIOTECA' && (
        <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-4">
          <div className="flex justify-between items-center border-b border-cyan-500/20 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-cyan-400" />
              Biblioteca de Automatizaciones en Supabase Cloud ({perfilesGuardados.length})
            </h3>
            <button
              onClick={cargarBiblioteca}
              className="px-2.5 py-1 bg-slate-900 border border-slate-700 text-slate-300 rounded-lg text-xs"
            >
              🔄 Recargar
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {loadingLib ? (
              <div className="col-span-full py-8 text-center text-slate-400">Consultando base de datos...</div>
            ) : perfilesGuardados.length === 0 ? (
              <div className="col-span-full py-8 text-center text-slate-500">
                No tienes perfiles guardados aún. Compila uno en el Studio y pulsa "Guardar en Supabase".
              </div>
            ) : (
              perfilesGuardados.map((p) => (
                <div
                  key={p.id}
                  className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/80 flex flex-col justify-between space-y-3"
                >
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
                    <button
                      onClick={async () => {
                        if (!confirm(`¿Eliminar "${p.nombre}"?`)) return;
                        await supabase.from('perfiles_hardware').delete().eq('id', p.id);
                        cargarBiblioteca();
                      }}
                      className="p-1 bg-slate-800 text-rose-400 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. PESTAÑA D: EDITOR JSON                                                 */}
      {/* ========================================================================= */}
      {activeTab === 'EDITOR_JSON' && (
        <div className="ultra-glass p-5 rounded-2xl border border-indigo-500/30 space-y-3">
          <div className="flex justify-between items-center border-b border-indigo-500/20 pb-2">
            <h3 className="text-sm font-bold text-indigo-300 flex items-center gap-2">
              <FileCode className="w-4 h-4" />
              Editor Raw del Manifiesto JSON (LittleFS + Widgets)
            </h3>
            <button
              onClick={handleGuardarEnSupabase}
              className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg font-bold flex items-center gap-1"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Guardar Cambios</span>
            </button>
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

      {/* MODAL CONFIGURACIÓN API KEY */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="ultra-glass border-2 border-emerald-500/60 p-6 rounded-2xl max-w-md w-full space-y-4 shadow-2xl font-mono text-xs">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-emerald-400" />
                Motor de IA: Groq Llama 3.3 (70B)
              </h3>
              <button onClick={() => setShowKeyModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-slate-300 leading-relaxed text-[11px]">
              Tu clave de Groq Llama 3.3 está precargada y conectada. Si deseas actualizarla, puedes pegarla aquí:
            </p>

            <div>
              <label className="text-slate-300 block mb-1 font-bold">API Key (Groq / gsk_...):</label>
              <input
                type="password"
                value={keyInputTemp}
                onChange={(e) => setKeyInputTemp(e.target.value)}
                placeholder="gsk_..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-mono focus:border-emerald-400 focus:outline-none"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowKeyModal(false)}
                className="flex-1 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={handleGuardarApiKey}
                className="flex-1 py-2 bg-emerald-500 text-slate-950 font-bold rounded-xl shadow-lg hover:bg-emerald-400"
              >
                Guardar Clave
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
