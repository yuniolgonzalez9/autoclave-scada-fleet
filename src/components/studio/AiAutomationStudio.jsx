import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Key, 
  Zap, 
  Power,
  PowerOff, 
  Activity, 
  LayoutGrid, 
  RefreshCw, 
  Wand2, 
  Save, 
  Trash2, 
  Edit3, 
  FileCode, 
  Database, 
  Check, 
  X,
  Smartphone,
  Monitor,
  Plus,
  Settings2,
  SlidersHorizontal,
  Eye,
  Lock,
  ArrowRight,
  GripHorizontal,
  Maximize2,
  Gauge,
  Clock,
  Radio
} from 'lucide-react';

const SNAP_GRID = 10; // Precisión de ajuste magnético al arrastrar o redimensionar

export default function AiAutomationStudio({ fleet = {}, sendCommand = null, initialDeviceMac = null }) {
  // ---------------------------------------------------------------------------
  // 1. PESTAÑAS Y MODOS DE VISUALIZACIÓN
  // ---------------------------------------------------------------------------
  const [activeTab, setActiveTab] = useState('STUDIO'); // 'STUDIO' | 'BIBLIOTECA' | 'EDITOR_JSON'
  const [vistaDispositivo, setVistaDispositivo] = useState('DESKTOP'); // 'DESKTOP' (Canvas Libre) | 'MOVIL' (Chasis Táctil)
  const [modoEdicion, setModoEdicion] = useState(false); // true: mover/redimensionar/editar, false: modo operador interactivo
  const [widgetEnEdicion, setWidgetEnEdicion] = useState(null); // Índice o ID del widget en el modal de configuración

  // ---------------------------------------------------------------------------
  // 2. MOTOR DE IA Y PROMPTS
  // ---------------------------------------------------------------------------
  const [prompt, setPrompt] = useState('Ambulancia de rescate con arranque remoto inteligente, corte de ignición, indicador de alternador D+ y medidor de batería 12V');
  const [modoIaRefinar, setModoIaRefinar] = useState(false); // false: Generar nuevo, true: Modificar sobre existente
  const [compilando, setCompilando] = useState(false);

  // ---------------------------------------------------------------------------
  // 3. PERFIL ACTIVO Y WIDGETS CON GEOMETRÍA LIBRE (x, y, w, h)
  // ---------------------------------------------------------------------------
  const [perfilActivoId, setPerfilActivoId] = useState(null);
  const [perfilNombre, setPerfilNombre] = useState('Ambulancia Hyundai Staria v1');
  const [tipoEquipo, setTipoEquipo] = useState('VEHICULO');
  const [widgets, setWidgets] = useState([]);
  const [halPayload, setHalPayload] = useState(null);
  const [jsonRaw, setJsonRaw] = useState('');

  // ---------------------------------------------------------------------------
  // 4. FLEET Y DESPLIEGUE MQTT / SUPABASE
  // ---------------------------------------------------------------------------
  const [selectedMac, setSelectedMac] = useState(initialDeviceMac || '');
  const [transmitting, setTransmitting] = useState(false);
  const [msg, setMsg] = useState('');

  // Estados interactivos en vivo para la simulación de relés
  const [liveRelayStates, setLiveRelayStates] = useState({});

  // ---------------------------------------------------------------------------
  // 5. BIBLIOTECA CLOUD
  // ---------------------------------------------------------------------------
  const [perfilesGuardados, setPerfilesGuardados] = useState([]);
  const [loadingLib, setLoadingLib] = useState(false);

  const macList = Object.keys(fleet || {});

  // Referencia al contenedor del lienzo para cálculo de coordenadas relativas
  const canvasRef = useRef(null);

  // Referencia para la interacción táctil y ratón (Drag & Resize unificado)
  const activeInteraction = useRef({
    type: null, // 'DRAG' | 'RESIZE'
    widgetIdx: null,
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
    initialW: 0,
    initialH: 0
  });

  // ---------------------------------------------------------------------------
  // 6. CARGA INICIAL DE SUPABASE
  // ---------------------------------------------------------------------------
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

  // Normalizar widgets para asegurar que siempre tengan propiedades libres x, y, w, h
  const normalizarWidgets = (rawWidgets = []) => {
    let startX = 20;
    let startY = 20;

    return rawWidgets.map((w, idx) => {
      const defW = w.w || (w.colSpan ? Math.min(600, w.colSpan * 180) : 260);
      const defH = w.h || 160;
      const posX = w.x !== undefined ? w.x : startX;
      const posY = w.y !== undefined ? w.y : startY;

      // Calcular siguiente posición si no venía definida
      if (w.x === undefined) {
        startX += defW + 20;
        if (startX > 840) {
          startX = 20;
          startY += defH + 20;
        }
      }

      return {
        ...w,
        id: w.id || `w_${idx}_${Date.now().toString(36)}`,
        x: posX,
        y: posY,
        w: defW,
        h: defH,
        canal: w.canal || 1,
        color: w.color || 'cyan',
        tipo: w.tipo || 'ACTION_BUTTON'
      };
    });
  };

  // ---------------------------------------------------------------------------
  // 7. COMPILACIÓN SEMÁNTICA CON IA (aiStudioService)
  // ---------------------------------------------------------------------------
  const handleCompilarIA = async (promptTexto = null) => {
    const texto = promptTexto || prompt;
    if (!texto.trim()) return alert('Describe qué deseas que haga la IA.');

    setCompilando(true);
    setMsg('');

    try {
      const targetDev = fleet[selectedMac] || null;

      const promptContextualizado = modoIaRefinar && widgets.length > 0
        ? `Toma los siguientes widgets y lógica existentes: ${JSON.stringify(widgets)}. Modifícalos o agrega lo siguiente según esta instrucción del usuario: "${texto}"`
        : texto;

      const res = await compilarConIA({
        prompt: promptContextualizado,
        device: targetDev,
        hardwareInfo: targetDev?.meta?.config_deseada || {}
      });

      if (res.exito) {
        if (!modoIaRefinar) {
          setPerfilActivoId(null);
          setPerfilNombre(res.titulo || 'Nuevo Perfil');
          setTipoEquipo(res.halPayload?.tipo || 'UNIVERSAL_PLC');
        }

        const widgetsNormalizados = normalizarWidgets(res.dashboardWidgets || []);
        setWidgets(widgetsNormalizados);
        setHalPayload(res.halPayload || {});

        const fullJson = {
          tipo: res.halPayload?.tipo || tipoEquipo,
          hal: res.halPayload,
          dashboard: widgetsNormalizados
        };
        setJsonRaw(JSON.stringify(fullJson, null, 2));

        setMsg(`✨ IA: ${modoIaRefinar ? '¡Lógica y Widgets refinados sin reiniciar!' : '¡Automatización y lienzo libre compilados con éxito!'}`);
      }
    } catch (e) {
      alert('Error en IA: ' + e.message);
    } finally {
      setCompilando(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 8. MOTOR POINTER (TOUCH + MOUSE) PARA ARRASTRE Y REDIMENSIÓN LIBRE
  // ---------------------------------------------------------------------------
  const handlePointerDown = (e, idx, action) => {
    if (!modoEdicion) return; // Solo permitir arrastrar/redimensionar en Modo Edición
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
      initialH: currentW.h || 160
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
          const nextW = Math.max(160, Math.round((initialW + deltaX) / SNAP_GRID) * SNAP_GRID);
          const nextH = Math.max(110, Math.round((initialH + deltaY) / SNAP_GRID) * SNAP_GRID);
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
      
      // Sincronizar el estado actual al jsonRaw de respaldo
      setJsonRaw(JSON.stringify({ tipo: tipoEquipo, hal: halPayload, dashboard: widgets }, null, 2));
    }
  };

  // ---------------------------------------------------------------------------
  // 9. AGREGAR / ELIMINAR / EDITAR WIDGETS
  // ---------------------------------------------------------------------------
  const handleAddWidgetManual = () => {
    const nuevo = {
      id: `w_custom_${Date.now().toString(36)}`,
      tipo: 'ACTION_BUTTON',
      titulo: 'Nuevo Control I2C',
      canal: 1,
      accion: 'SET_RELAY',
      color: 'cyan',
      icono: 'Zap',
      x: 30,
      y: 30,
      w: 260,
      h: 160
    };
    const nextWidgets = [...widgets, nuevo];
    setWidgets(nextWidgets);
    setWidgetEnEdicion(nextWidgets.length - 1);
  };

  const handleRemoveWidget = (idx) => {
    const filtrados = widgets.filter((_, i) => i !== idx);
    setWidgets(filtrados);
    if (widgetEnEdicion === idx) setWidgetEnEdicion(null);
  };

  // ---------------------------------------------------------------------------
  // 10. INTERACCIÓN EN VIVO: MQTT CON DISPOSITIVO
  // ---------------------------------------------------------------------------
  const handleExecuteWidgetAction = (widget) => {
    if (modoEdicion) return; // En modo edición no conmuta relés

    const canal = widget.canal || 1;
    const currentState = !!liveRelayStates[canal];
    const nextState = !currentState;

    setLiveRelayStates((prev) => ({ ...prev, [canal]: nextState }));

    // Si hay un dispositivo seleccionado y `sendCommand` disponible, enviar orden MQTT real
    if (selectedMac && sendCommand) {
      const payloadCmd = {
        cmd: 'SET_RELAY',
        relay: canal,
        state: nextState ? 1 : 0,
        mac: selectedMac
      };
      sendCommand(selectedMac, payloadCmd);
      setMsg(`📡 Comando enviado a [${selectedMac.slice(-4)}]: Relé R${canal} -> ${nextState ? 'ON' : 'OFF'}`);
    }
  };

  // ---------------------------------------------------------------------------
  // 11. GUARDAR EN SUPABASE ('perfiles_hardware')
  // ---------------------------------------------------------------------------
  const handleGuardarEnSupabase = async () => {
    const contenido = {
      tipo: tipoEquipo,
      hal: halPayload,
      dashboard: widgets
    };

    setMsg('Guardando en Supabase...');

    try {
      const payloadDB = {
        nombre: perfilNombre.trim() || 'Perfil Sin Nombre',
        descripcion: `Configuración para ${tipoEquipo} • ${widgets.length} Widgets (Lienzo Libre) • ${new Date().toLocaleDateString()}`,
        hardware_rev: 'HKL-EA8_RJ45',
        perfil_json: contenido,
        activo: true,
        updated_at: new Date().toISOString()
      };

      if (perfilActivoId) {
        const { error } = await supabase.from('perfiles_hardware').update(payloadDB).eq('id', perfilActivoId);
        if (error) throw error;
        setMsg(`💾 ¡Perfil "${perfilNombre}" actualizado en Supabase!`);
      } else {
        const { data, error } = await supabase.from('perfiles_hardware').insert([payloadDB]).select();
        if (error) throw error;
        if (data && data[0]) setPerfilActivoId(data[0].id);
        setMsg(`💾 ¡Perfil "${perfilNombre}" registrado en la biblioteca Cloud!`);
      }
      cargarBiblioteca();
    } catch (err) {
      setMsg('Error en Supabase: ' + err.message);
    }
  };

  // ---------------------------------------------------------------------------
  // 12. CARGAR PERFIL DE LA BIBLIOTECA
  // ---------------------------------------------------------------------------
  const handleCargarPerfil = (p) => {
    setPerfilActivoId(p.id);
    setPerfilNombre(p.nombre);
    const json = p.perfil_json || {};
    setTipoEquipo(json.tipo || 'UNIVERSAL_PLC');
    setHalPayload(json.hal || json.halPayload || json);

    const widgetsCargados = normalizarWidgets(json.dashboard || json.dashboardWidgets || []);
    setWidgets(widgetsCargados);
    setJsonRaw(JSON.stringify(json, null, 2));
    setActiveTab('STUDIO');
    setMsg(`📂 Perfil "${p.nombre}" cargado con éxito.`);
  };

  // ---------------------------------------------------------------------------
  // 13. ELIMINAR PERFIL DE SUPABASE
  // ---------------------------------------------------------------------------
  const handleEliminarPerfil = async (id, nombre) => {
    if (!confirm(`¿Eliminar permanentemente "${nombre}" de Supabase?`)) return;
    try {
      const { error } = await supabase.from('perfiles_hardware').delete().eq('id', id);
      if (error) throw error;
      setMsg(`🗑️ Perfil "${nombre}" eliminado.`);
      if (perfilActivoId === id) setPerfilActivoId(null);
      cargarBiblioteca();
    } catch (err) {
      alert('Error eliminando: ' + err.message);
    }
  };

  // ---------------------------------------------------------------------------
  // 14. DESPLEGAR A LA PLACA FÍSICA (LITTLEFS + SUPABASE)
  // ---------------------------------------------------------------------------
  const handleDesplegarADispositivo = async () => {
    if (!selectedMac) return alert('Selecciona un equipo destino en el selector.');

    setTransmitting(true);
    setMsg(`Desplegando lógica y widgets a ${selectedMac}...`);

    const commandPayload = {
      cmd: 'APPLY_HAL_MAP',
      mac: selectedMac,
      tipo: tipoEquipo,
      ...(halPayload || {}),
      custom_dashboard: {
        titulo: perfilNombre,
        widgets
      }
    };

    try {
      if (sendCommand) {
        sendCommand(selectedMac, commandPayload);
        sendCommand(selectedMac, { cmd: 'SET_META', alias: perfilNombre, config_deseada: commandPayload });
      }

      await supabase.from('asignaciones_equipos').update({
        config_deseada: commandPayload,
        modelo: perfilNombre,
        updated_at: new Date().toISOString()
      }).eq('mac', selectedMac);

      setMsg(`⚡ ¡Lógica grabada en Flash LittleFS de [${selectedMac}] y Dashboard aplicado!`);
    } catch (err) {
      setMsg('Error desplegando: ' + err.message);
    } finally {
      setTransmitting(false);
    }
  };

  // Helper para renderizar valores realistas según unidad
  const getValorMockRealista = (w) => {
    if (w.unidad === 'bar' || w.variable?.includes('presion')) return '2.15';
    if (w.unidad === '°C' || w.variable?.includes('temp')) return '134.0';
    if (w.unidad === 'V' || w.variable?.includes('bateria')) return '12.6';
    if (w.unidad === 'min' || w.variable?.includes('f0')) return '15.2';
    if (w.unidad === 'RPM') return '850';
    return '100.0';
  };

  return (
    <div className="space-y-4 font-mono text-xs select-none">
      
      {/* ========================================================================= */}
      {/* 1. BARRA SUPERIOR CON CONTROLES DE MODO MÓVIL, EDICIÓN Y CLOUD           */}
      {/* ========================================================================= */}
      <div className="ultra-glass p-4 rounded-2xl border border-amber-500/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              BioFleet AI Studio & Free-Touch Grid
              {perfilActivoId && (
                <span className="px-2 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px]">
                  Cloud DB: #{perfilActivoId}
                </span>
              )}
            </h2>
            <p className="text-[11px] text-slate-300 font-sans">
              Lienzo libre con arrastre y redimensionamiento táctil para HKL-EA8 (I2C Relés 0x24 y ADC 0x48).
            </p>
          </div>
        </div>

        {/* CONTROLES DE VISTA Y MODO EDICIÓN */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Conmutador Vista Móvil / Escritorio */}
          <div className="flex p-0.5 bg-slate-950 border border-slate-800 rounded-xl">
            <button
              onClick={() => setVistaDispositivo('DESKTOP')}
              className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 font-bold transition-all ${
                vistaDispositivo === 'DESKTOP' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
              }`}
              title="Lienzo Libre de Escritorio (Arrastre y Dimensiones X/Y/W/H)"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Lienzo Libre</span>
            </button>
            <button
              onClick={() => setVistaDispositivo('MOVIL')}
              className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 font-bold transition-all ${
                vistaDispositivo === 'MOVIL' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
              }`}
              title="Simulador de Chasis Móvil (Smartphone)"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Móvil</span>
            </button>
          </div>

          {/* Botón Maestro: MODO EDICIÓN / PERSONALIZACIÓN */}
          <button
            onClick={() => { setModoEdicion(!modoEdicion); setWidgetEnEdicion(null); }}
            className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 border transition-all ${
              modoEdicion 
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/30 animate-pulse' 
                : 'bg-slate-900 border-slate-700 text-amber-300 hover:border-amber-400'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>{modoEdicion ? '🛠️ Salir de Edición' : '🛠️ Modo Edición (Touch/Drag)'}</span>
          </button>

          {/* Pestañas de Navegación de Biblioteca */}
          <div className="flex gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-xl">
            <button
              onClick={() => setActiveTab('STUDIO')}
              className={`px-2.5 py-1.5 rounded-lg font-bold ${activeTab === 'STUDIO' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'}`}
            >
              Lienzo
            </button>
            <button
              onClick={() => setActiveTab('BIBLIOTECA')}
              className={`px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1 ${activeTab === 'BIBLIOTECA' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400'}`}
            >
              <Database className="w-3 h-3" />
              <span>Nube ({perfilesGuardados.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('EDITOR_JSON')}
              className={`px-2.5 py-1.5 rounded-lg font-bold ${activeTab === 'EDITOR_JSON' ? 'bg-indigo-500 text-white' : 'text-slate-400'}`}
            >
              JSON
            </button>
          </div>
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
      {/* 2. COPILOT DE INTELIGENCIA ARTIFICIAL GENERATIVA & REFINAMIENTO           */}
      {/* ========================================================================= */}
      {activeTab === 'STUDIO' && (
        <div className="space-y-4">
          <div className="ultra-glass p-4 rounded-2xl border border-amber-500/30 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-amber-300 font-bold uppercase text-[11px] flex items-center gap-1.5">
                <Wand2 className="w-3.5 h-3.5" />
                Copilot de IA: {modoIaRefinar ? 'Refinar y agregar sobre el diseño actual' : 'Crear automatización desde cero'}
              </span>
              
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-slate-300 cursor-pointer flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={modoIaRefinar}
                    onChange={(e) => setModoIaRefinar(e.target.checked)}
                    className="accent-amber-400"
                  />
                  <span>Modificar sin borrar widgets existentes</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2">
              <textarea
                rows={2}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  modoIaRefinar 
                    ? "Ej: Agrega un botón de purga en R4 y pon la tarjeta de temperatura en color rojo..." 
                    : "Ej: Generador diésel con precalentamiento 7s, arranque de 1s y descanso 7s en relé 3..."
                }
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-sans focus:outline-none focus:border-amber-400"
              />
              <button
                type="button"
                onClick={() => handleCompilarIA()}
                disabled={compilando}
                className="px-5 py-2 bg-gradient-to-r from-amber-500 to-emerald-500 hover:opacity-90 text-slate-950 font-bold rounded-xl flex flex-col items-center justify-center gap-1 shadow-lg shadow-amber-500/20 shrink-0 disabled:opacity-50 font-mono"
              >
                {compilando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>{compilando ? 'Procesando...' : modoIaRefinar ? 'Refinar IA' : 'Generar IA'}</span>
              </button>
            </div>

            {/* Atajos Rápidos */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setModoIaRefinar(false);
                  const p = 'Ambulancia Hyundai Staria con arranque remoto inteligente, corte de inmovilizador, alternador D+ y medidor de batería 12V';
                  setPrompt(p);
                  handleCompilarIA(p);
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-amber-300 text-[10px]"
              >
                🚗 Ambulancia Staria
              </button>
              <button
                type="button"
                onClick={() => {
                  setModoIaRefinar(false);
                  const p = 'Autoclave de esterilización a 134°C con curva de vapor, botón de iniciar ciclo, purga automática y cálculo F0';
                  setPrompt(p);
                  handleCompilarIA(p);
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 text-[10px]"
              >
                ♨️ Autoclave Quirófano
              </button>
              <button
                type="button"
                onClick={() => {
                  setModoIaRefinar(false);
                  const p = 'Generador de emergencia con ciclo de arranque: 7s precalentamiento, 1s starter y 7s descanso con sensor RPM';
                  setPrompt(p);
                  handleCompilarIA(p);
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-emerald-300 text-[10px]"
              >
                ⚡ Secuencia Arranque / Starter
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
                placeholder="Nombre del Perfil..."
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-bold text-xs focus:outline-none focus:border-cyan-400 w-full sm:w-64"
              />
              <span className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-amber-400 font-bold text-[10px]">
                {tipoEquipo}
              </span>

              {modoEdicion && (
                <button
                  type="button"
                  onClick={handleAddWidgetManual}
                  className="px-2.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold text-[10px] flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ Agregar Widget</span>
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
                <span>{perfilActivoId ? 'Actualizar en Cloud' : 'Guardar en Supabase'}</span>
              </button>

              <div className="flex items-center gap-1.5">
                <select
                  value={selectedMac}
                  onChange={(e) => setSelectedMac(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-cyan-300 font-bold"
                >
                  <option value="">-- Placa HKL Destino --</option>
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
          </div>

          {/* ========================================================================= */}
          {/* 3. LIENZO INTERACTIVO: LIENZO LIBRE X/Y/W/H O CHASIS MÓVIL               */}
          {/* ========================================================================= */}
          <div className="ultra-glass p-4 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-white font-bold flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-cyan-400" />
                {vistaDispositivo === 'MOVIL' ? 'Simulador de Smartphone (Touch/Scroll):' : 'Lienzo Libre de Control (Touch & Drag):'}
                <span className="text-[10px] text-slate-400 font-normal">({widgets.length} Widgets)</span>
              </span>
              <span className="text-[10px] text-amber-300">
                {modoEdicion
                  ? '🛠️ MODO EDICIÓN: Arrastra la barra superior para mover y la esquina inferior derecha para redimensionar libremente'
                  : '👁️ MODO OPERADOR: Toca cualquier botón o relé para conmutar por MQTT en vivo'}
              </span>
            </div>

            {widgets.length === 0 ? (
              <div className="py-12 border-2 border-dashed border-slate-800 rounded-xl text-center text-slate-500 space-y-2">
                <Sparkles className="w-8 h-8 mx-auto text-amber-500/30" />
                <p>Escribe tu automatización arriba y pulsa "Generar IA" o usa "+ Agregar Widget".</p>
              </div>
            ) : vistaDispositivo === 'MOVIL' ? (
              /* SIMULADOR MÓVIL CHASSIS */
              <div className="flex justify-center py-2">
                <div className="w-full max-w-[380px] bg-slate-950 border-4 border-slate-700 rounded-[40px] p-4 shadow-2xl space-y-3 max-h-[640px] overflow-y-auto relative">
                  <div className="sticky top-0 z-20 flex justify-center pb-2">
                    <div className="w-28 h-4 bg-slate-800 rounded-full border border-slate-700 flex items-center justify-center">
                      <span className="w-2 h-2 rounded-full bg-slate-900 mr-2"></span>
                      <span className="w-8 h-1 rounded-full bg-slate-700"></span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {widgets.map((w, idx) => (
                      <div
                        key={w.id || idx}
                        style={{ minHeight: `${w.h || 140}px` }}
                        className={`p-3 rounded-2xl border bg-slate-900/95 flex flex-col justify-between transition-all ${
                          w.color === 'emerald' ? 'border-emerald-500/40 text-emerald-300' :
                          w.color === 'amber' ? 'border-amber-500/40 text-amber-300' :
                          w.color === 'rose' ? 'border-rose-500/40 text-rose-300' :
                          'border-cyan-500/40 text-cyan-300'
                        }`}
                      >
                        <div className="flex justify-between items-center text-[10px] border-b border-slate-800 pb-1.5">
                          <span className="font-bold text-white uppercase truncate">{w.titulo}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                            R{w.canal || 1}
                          </span>
                        </div>
                        <div className="py-2 flex items-center justify-center">
                          {renderWidgetContent(w, idx)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* LIENZO LIBRE X/Y/W/H CON POINTER EVENTS FLUIDOS */
              <div
                ref={canvasRef}
                className="w-full min-h-[580px] h-[680px] relative bg-slate-950/80 rounded-2xl border border-slate-800 overflow-auto bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:20px_20px]"
              >
                <div className="w-[2400px] h-[1800px] relative">
                  {widgets.map((w, idx) => {
                    const isEditingThis = widgetEnEdicion === idx;

                    return (
                      <div
                        key={w.id || idx}
                        style={{
                          transform: `translate3d(${w.x || 0}px, ${w.y || 0}px, 0)`,
                          width: `${w.w || 260}px`,
                          height: `${w.h || 160}px`,
                          touchAction: modoEdicion ? 'none' : 'auto'
                        }}
                        className={`absolute rounded-2xl border bg-slate-900/95 flex flex-col justify-between shadow-xl transition-shadow ${
                          modoEdicion ? 'ring-1 ring-amber-500/40' : ''
                        } ${
                          w.color === 'emerald' ? 'border-emerald-500/40 text-emerald-300' :
                          w.color === 'amber' ? 'border-amber-500/40 text-amber-300' :
                          w.color === 'rose' ? 'border-rose-500/40 text-rose-300' :
                          w.color === 'purple' ? 'border-purple-500/40 text-purple-300' :
                          'border-cyan-500/40 text-cyan-300'
                        }`}
                      >
                        {/* HEADER DEL WIDGET (DRAG HANDLE TÁCTIL Y DE RATÓN) */}
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
                            <span className="font-bold text-white text-[10px] uppercase truncate">
                              {w.titulo}
                            </span>
                            {w.canal && (
                              <span className="text-[8px] px-1 py-0.2 rounded bg-slate-800 text-slate-300 shrink-0">
                                R{w.canal}
                              </span>
                            )}
                          </div>

                          {modoEdicion && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setWidgetEnEdicion(isEditingThis ? null : idx);
                                }}
                                className="p-1 rounded bg-slate-800 hover:bg-amber-500/30 text-amber-300 border border-slate-700"
                                title="Configurar widget"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveWidget(idx);
                                }}
                                className="p-1 rounded bg-slate-800 hover:bg-rose-500/30 text-rose-300 border border-slate-700"
                                title="Eliminar widget"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* CUERPO PRINCIPAL DEL WIDGET */}
                        <div className="flex-1 p-2 flex flex-col items-center justify-center overflow-hidden">
                          {renderWidgetContent(w, idx)}
                        </div>

                        {/* TIRADOR INFERIOR DERECHO: REDIMENSIONAMIENTO LIBRE (RESIZE HANDLE) */}
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
      {/* 4. MODAL DE EDICIÓN PROFUNDA (PIN A PIN I2C, VALORES Y COLORES)          */}
      {/* ========================================================================= */}
      {widgetEnEdicion !== null && widgets[widgetEnEdicion] && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-lg w-full p-5 shadow-2xl relative space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-400" />
                Configurar Widget #{widgetEnEdicion + 1}: {widgets[widgetEnEdicion].titulo}
              </h3>
              <button
                type="button"
                onClick={() => setWidgetEnEdicion(null)}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="col-span-2">
                <label className="block text-[10px] text-slate-400 mb-1">Nombre / Título</label>
                <input
                  type="text"
                  value={widgets[widgetEnEdicion].titulo}
                  onChange={(e) => {
                    const next = [...widgets];
                    next[widgetEnEdicion].titulo = e.target.value;
                    setWidgets(next);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Tipo de Widget</label>
                <select
                  value={widgets[widgetEnEdicion].tipo}
                  onChange={(e) => {
                    const next = [...widgets];
                    next[widgetEnEdicion].tipo = e.target.value;
                    setWidgets(next);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-cyan-300 font-bold"
                >
                  <option value="ACTION_BUTTON">🔘 Botón Pulsador / Relé</option>
                  <option value="SWITCH_TOGGLE">🎚️ Switch ON/OFF</option>
                  <option value="GAUGE_RADIAL">🧭 Gauge Analógico</option>
                  <option value="VALUE_CARD">🔢 Tarjeta de Valor</option>
                  <option value="STATUS_LED">💡 Indicador LED</option>
                  <option value="TEXT_STATUS">📝 Texto de Estado</option>
                  <option value="CHART_HISTORY">📈 Gráfica Histórica</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Salida I2C (HKL 0x24)</label>
                <select
                  value={widgets[widgetEnEdicion].canal || 1}
                  onChange={(e) => {
                    const next = [...widgets];
                    next[widgetEnEdicion].canal = Number(e.target.value);
                    setWidgets(next);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-amber-300 font-bold"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>
                      Relé R{n} (PCF8574 @ 0x24 P{n - 1})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Tema de Color</label>
                <select
                  value={widgets[widgetEnEdicion].color || 'cyan'}
                  onChange={(e) => {
                    const next = [...widgets];
                    next[widgetEnEdicion].color = e.target.value;
                    setWidgets(next);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                >
                  <option value="cyan">Cian Eléctrico</option>
                  <option value="emerald">Verde Médico</option>
                  <option value="amber">Ámbar Advertencia</option>
                  <option value="rose">Rojo Alerta</option>
                  <option value="purple">Púrpura Quirúrgico</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Unidad de Medida</label>
                <input
                  type="text"
                  placeholder="ej: bar, °C, RPM, V"
                  value={widgets[widgetEnEdicion].unidad || ''}
                  onChange={(e) => {
                    const next = [...widgets];
                    next[widgetEnEdicion].unidad = e.target.value;
                    setWidgets(next);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                />
              </div>

              {/* Ajuste manual de Ancho y Alto en píxeles */}
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Ancho Libre (px)</label>
                <input
                  type="number"
                  value={widgets[widgetEnEdicion].w || 260}
                  onChange={(e) => {
                    const next = [...widgets];
                    next[widgetEnEdicion].w = Number(e.target.value);
                    setWidgets(next);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Alto Libre (px)</label>
                <input
                  type="number"
                  value={widgets[widgetEnEdicion].h || 160}
                  onChange={(e) => {
                    const next = [...widgets];
                    next[widgetEnEdicion].h = Number(e.target.value);
                    setWidgets(next);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setWidgetEnEdicion(null)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs"
              >
                Guardar y Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. VISTA BIBLIOTECA CLOUD EN SUPABASE                                     */}
      {/* ========================================================================= */}
      {activeTab === 'BIBLIOTECA' && (
        <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-4">
          <div className="flex justify-between items-center border-b border-cyan-500/20 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-cyan-400" />
                Biblioteca de Automatizaciones en Supabase Cloud ({perfilesGuardados.length})
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Carga cualquier perfil existente para editarlo o desplegarlo a cualquier dispositivo de tu flota.
              </p>
            </div>
            <button
              onClick={cargarBiblioteca}
              className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-xs"
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
              perfilesGuardados.map((p) => {
                const json = p.perfil_json || {};
                const esActivo = perfilActivoId === p.id;

                return (
                  <div
                    key={p.id}
                    className={`p-3.5 rounded-xl border bg-slate-900/80 flex flex-col justify-between space-y-3 transition-all ${
                      esActivo ? 'border-amber-400 shadow-md shadow-amber-500/20' : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-bold text-white text-xs truncate max-w-[180px]">{p.nombre}</h4>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                          {json.tipo || 'PLC'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 line-clamp-2">{p.descripcion}</p>
                      <span className="text-[9px] text-slate-500 mt-1 block">
                        Actualizado: {new Date(p.updated_at || p.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 pt-2 border-t border-slate-800">
                      <button
                        onClick={() => handleCargarPerfil(p)}
                        className="flex-1 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold text-[10px] flex items-center justify-center gap-1"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Cargar al Studio</span>
                      </button>

                      <button
                        onClick={() => handleEliminarPerfil(p.id, p.nombre)}
                        className="p-1.5 bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 rounded-lg text-[10px]"
                        title="Eliminar de Supabase"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. VISTA EDITOR JSON RAW                                                  */}
      {/* ========================================================================= */}
      {activeTab === 'EDITOR_JSON' && (
        <div className="ultra-glass p-5 rounded-2xl border border-indigo-500/30 space-y-3">
          <div className="flex justify-between items-center border-b border-indigo-500/20 pb-2">
            <div>
              <h3 className="text-sm font-bold text-indigo-300 flex items-center gap-2">
                <FileCode className="w-4 h-4" />
                Editor Raw del Manifiesto JSON (Hardware LittleFS + Widgets)
              </h3>
              <p className="text-[10px] text-slate-400">
                Puedes modificar cualquier campo manualmente antes de guardar en Supabase o desplegar por MQTT.
              </p>
            </div>
            <button
              onClick={handleGuardarEnSupabase}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold flex items-center gap-1"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Guardar Cambios</span>
            </button>
          </div>

          <textarea
            rows={18}
            value={jsonRaw}
            onChange={(e) => setJsonRaw(e.target.value)}
            className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-cyan-300 font-mono text-[11px] leading-relaxed focus:outline-none focus:border-indigo-400"
            spellCheck="false"
          />
        </div>
      )}

    </div>
  );

  // Helper para renderizar el interior del widget
  function renderWidgetContent(w, idx) {
    const isRelayActive = !!liveRelayStates[w.canal || 1];

    if (w.tipo === 'ACTION_BUTTON') {
      return (
        <button
          type="button"
          onClick={() => handleExecuteWidgetAction(w)}
          className={`w-full py-3 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all ${
            isRelayActive
              ? 'bg-cyan-500 text-slate-950 shadow-cyan-500/30 scale-95'
              : 'bg-slate-950 border border-current hover:brightness-125'
          }`}
        >
          <Play className={`w-3.5 h-3.5 ${isRelayActive ? 'fill-slate-950' : 'fill-current'}`} />
          <span>{w.titulo}</span>
        </button>
      );
    }

    if (w.tipo === 'SWITCH_TOGGLE') {
      return (
        <div
          onClick={() => handleExecuteWidgetAction(w)}
          className="flex items-center justify-between w-full px-3 cursor-pointer py-1 bg-slate-950/40 rounded-xl"
        >
          <span className="text-[10px] text-slate-300">Canal R{w.canal || 1}</span>
          <div
            className={`w-12 h-6 rounded-full border border-current p-0.5 flex items-center transition-all ${
              isRelayActive ? 'justify-end bg-cyan-500/20' : 'justify-start bg-slate-950'
            }`}
          >
            <span className={`w-4 h-4 rounded-full shadow ${isRelayActive ? 'bg-cyan-400' : 'bg-slate-600'}`}></span>
          </div>
        </div>
      );
    }

    if (w.tipo === 'GAUGE_RADIAL') {
      return (
        <div className="text-center w-full">
          <span className="text-2xl font-bold font-mono tracking-tight text-white">
            {getValorMockRealista(w)}
          </span>
          <span className="text-[10px] text-slate-400 ml-1">{w.unidad || 'bar'}</span>
          <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden mt-1.5 border border-slate-800">
            <div className="bg-current h-full w-2/3 rounded-full"></div>
          </div>
          <span className="block text-[8px] text-slate-500 mt-1">Rango: 0 a 100 {w.unidad || 'bar'}</span>
        </div>
      );
    }

    if (w.tipo === 'VALUE_CARD') {
      return (
        <div className="text-center">
          <span className="text-2xl font-bold font-mono tracking-tight text-white">
            {getValorMockRealista(w)}
          </span>
          <span className="text-xs text-slate-400 ml-1">{w.unidad || '°C'}</span>
        </div>
      );
    }

    if (w.tipo === 'STATUS_LED') {
      return (
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full ${isRelayActive ? 'bg-emerald-400 animate-ping' : 'bg-slate-700'}`}></span>
          <span className="font-bold text-xs">{isRelayActive ? 'ACTIVO (ON)' : 'STANDBY (OFF)'}</span>
        </div>
      );
    }

    if (w.tipo === 'TEXT_STATUS') {
      return (
        <span className="text-sm font-bold tracking-wider uppercase text-white bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800">
          {isRelayActive ? 'EQUIPO_EN_MARCHA' : 'EQUIPO_DETENIDO'}
        </span>
      );
    }

    if (w.tipo === 'CHART_HISTORY') {
      return (
        <div className="w-full h-16 bg-slate-950/60 rounded-xl flex items-center justify-center text-[10px] text-slate-500 border border-slate-800/80">
          📈 Telemetría HKL-EA8 en Vivo (WSS 8884)
        </div>
      );
    }

    return null;
  }
}
