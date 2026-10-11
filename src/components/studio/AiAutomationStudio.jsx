import React, { useState, useEffect } from 'react';
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
  ArrowRight
} from 'lucide-react';

export default function AiAutomationStudio({ fleet, sendCommand, initialDeviceMac = null }) {
  // Pestañas Principales
  const [activeTab, setActiveTab] = useState('STUDIO'); // 'STUDIO', 'BIBLIOTECA', 'EDITOR_JSON'

  // Controles del Lienzo
  const [vistaDispositivo, setVistaDispositivo] = useState('DESKTOP'); // 'DESKTOP' o 'MOVIL'
  const [modoEdicion, setModoEdicion] = useState(false); // true: permite editar/cambiar widgets, false: modo operador
  const [widgetEnEdicion, setWidgetEnEdicion] = useState(null); // Índice del widget abierto en el cajón de edición

  // Prompts y Modo IA
  const [prompt, setPrompt] = useState('Ambulancia de rescate con arranque remoto inteligente, corte de ignición, indicador de alternador D+ y medidor de batería 12V');
  const [modoIaRefinar, setModoIaRefinar] = useState(false); // false: Generar nuevo, true: Modificar existente
  const [compilando, setCompilando] = useState(false);

  // Perfil Activo
  const [perfilActivoId, setPerfilActivoId] = useState(null);
  const [perfilNombre, setPerfilNombre] = useState('Ambulancia Hyundai Staria v1');
  const [tipoEquipo, setTipoEquipo] = useState('VEHICULO');
  const [widgets, setWidgets] = useState([]);
  const [halPayload, setHalPayload] = useState(null);
  const [jsonRaw, setJsonRaw] = useState('');

  // Equipos Destino
  const [selectedMac, setSelectedMac] = useState(initialDeviceMac || '');
  const [transmitting, setTransmitting] = useState(false);
  const [msg, setMsg] = useState('');

  // Biblioteca Cloud
  const [perfilesGuardados, setPerfilesGuardados] = useState([]);
  const [loadingLib, setLoadingLib] = useState(false);

  const macList = Object.keys(fleet || {});

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

  // 1. COMPILAR O REFINAR CON IA
  const handleCompilarIA = async (promptTexto = null) => {
    const texto = promptTexto || prompt;
    if (!texto.trim()) return alert('Describe qué deseas que haga la IA.');

    setCompilando(true);
    setMsg('');

    try {
      const targetDev = fleet[selectedMac] || null;

      // Si está en modo refinamiento, le pasamos los widgets actuales para que no los destruya
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

        setWidgets(res.dashboardWidgets || []);
        setHalPayload(res.halPayload || {});

        const fullJson = {
          tipo: res.halPayload?.tipo || tipoEquipo,
          hal: res.halPayload,
          dashboard: res.dashboardWidgets
        };
        setJsonRaw(JSON.stringify(fullJson, null, 2));

        setMsg(`✨ IA: ${modoIaRefinar ? '¡Diseño y lógica refinados sin reiniciar!' : '¡Automatización y Dashboard compilados con éxito!'}`);
      }
    } catch (e) {
      alert('Error en IA: ' + e.message);
    } finally {
      setCompilando(false);
    }
  };

  // 2. AGREGAR WIDGET MANUALMENTE EN MODO EDICIÓN
  const handleAddWidgetManual = () => {
    const nuevo = {
      id: `w_custom_${Date.now().toString(36)}`,
      tipo: 'ACTION_BUTTON',
      titulo: 'Nueva Salida / Pulsador',
      canal: 1,
      accion: 'SET_RELAY',
      color: 'cyan',
      icono: 'Zap',
      colSpan: 1
    };
    setWidgets([...widgets, nuevo]);
    setWidgetEnEdicion(widgets.length); // Abrir en edición de inmediato
  };

  // 3. ELIMINAR WIDGET INDIVIDUAL
  const handleRemoveWidget = (idx) => {
    setWidgets(widgets.filter((_, i) => i !== idx));
    if (widgetEnEdicion === idx) setWidgetEnEdicion(null);
  };

  // 4. GUARDAR EN SUPABASE ('perfiles_hardware')
  const handleGuardarEnSupabase = async () => {
    let contenido;
    try {
      contenido = jsonRaw ? JSON.parse(jsonRaw) : { tipo: tipoEquipo, hal: halPayload, dashboard: widgets };
      contenido.dashboard = widgets; // Asegurar que guarde los widgets editados a mano
    } catch (e) {
      return alert('JSON con error: ' + e.message);
    }

    setMsg('Guardando en Supabase...');

    try {
      const payloadDB = {
        nombre: perfilNombre.trim() || 'Perfil Sin Nombre',
        descripcion: `Configuración para ${tipoEquipo} • ${widgets.length} Widgets • ${new Date().toLocaleDateString()}`,
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
        setMsg(`💾 ¡Perfil "${perfilNombre}" registrado en la biblioteca!`);
      }
      cargarBiblioteca();
    } catch (err) {
      setMsg('Error en Supabase: ' + err.message);
    }
  };

  // 5. CARGAR PERFIL DE LA BIBLIOTECA
  const handleCargarPerfil = (p) => {
    setPerfilActivoId(p.id);
    setPerfilNombre(p.nombre);
    const json = p.perfil_json || {};
    setTipoEquipo(json.tipo || 'UNIVERSAL_PLC');
    setHalPayload(json.hal || json.halPayload || json);
    setWidgets(json.dashboard || json.dashboardWidgets || []);
    setJsonRaw(JSON.stringify(json, null, 2));
    setActiveTab('STUDIO');
    setMsg(`📂 Perfil "${p.nombre}" cargado al Studio.`);
  };

  // 6. ELIMINAR PERFIL DE SUPABASE
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

  // 7. DESPLEGAR A LA PLACA FÍSICA (LITTLEFS + SUPABASE)
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
    return '100.0';
  };

  return (
    <div className="space-y-4 font-mono text-xs">
      
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
              BioFleet AI Studio & Dashboard Builder
              {perfilActivoId && (
                <span className="px-2 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px]">
                  Cloud DB: #{perfilActivoId}
                </span>
              )}
            </h2>
            <p className="text-[11px] text-slate-300 font-sans">
              Compilador generativo con IA, personalización gráfica de widgets y simulación móvil en tiempo real.
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
              title="Vista Completa de Pantalla de Escritorio"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Escritorio</span>
            </button>
            <button
              onClick={() => setVistaDispositivo('MOVIL')}
              className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 font-bold transition-all ${
                vistaDispositivo === 'MOVIL' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
              }`}
              title="Simulador de Pantalla Móvil (Smartphone)"
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
            <span>{modoEdicion ? '🛠️ Guardar Diseño' : '🛠️ Modo Edición'}</span>
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
              
              {/* Conmutador de Modo IA (Crear de cero vs Refinar) */}
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
                    : "Ej: Ambulancia con arranque remoto, switch de ignición, indicador de alternador y batería 12V..."
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
                  const p = 'Control industrial de bombeo con electroválvulas de llenado, boyas de nivel y paro de emergencia en seta';
                  setPrompt(p);
                  handleCompilarIA(p);
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-emerald-300 text-[10px]"
              >
                ⚙️ Soft-PLC Llenado Tanques
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
                  <option value="">-- Destino --</option>
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
          {/* 3. LIENZO INTERACTIVO: ESCRITORIO O CHASIS MÓVIL (FIGMA STYLE)           */}
          {/* ========================================================================= */}
          <div className="ultra-glass p-5 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-white font-bold flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-cyan-400" />
                {vistaDispositivo === 'MOVIL' ? 'Simulador de Smartphone (Android/iOS):' : 'Lienzo de Escritorio:'}
                <span className="text-[10px] text-slate-400 font-normal">({widgets.length} Widgets)</span>
              </span>
              <span className="text-[10px] text-amber-300">
                {modoEdicion ? '🛠️ MODO EDICIÓN ACTIVO: Toca el lápiz para cambiar cualquier widget' : '👁️ VISTA OPERADOR: Prueba los botones en directo'}
              </span>
            </div>

            {widgets.length === 0 ? (
              <div className="py-12 border-2 border-dashed border-slate-800 rounded-xl text-center text-slate-500 space-y-2">
                <Sparkles className="w-8 h-8 mx-auto text-amber-500/30" />
                <p>Escribe tu automatización arriba y pulsa "Generar IA" para armar el panel.</p>
              </div>
            ) : (
              /* CONTENEDOR PRINCIPAL (ESCRITORIO vs SIMULADOR MÓVIL) */
              <div className={vistaDispositivo === 'MOVIL' ? 'flex justify-center py-2' : ''}>
                
                <div className={
                  vistaDispositivo === 'MOVIL'
                    ? 'w-full max-w-[380px] bg-slate-950 border-4 border-slate-700 rounded-[40px] p-4 shadow-2xl space-y-3 max-h-[620px] overflow-y-auto relative'
                    : 'w-full'
                }>
                  {/* Notch del Simulador Móvil */}
                  {vistaDispositivo === 'MOVIL' && (
                    <div className="sticky top-0 z-20 flex justify-center pb-2">
                      <div className="w-28 h-4 bg-slate-800 rounded-full border border-slate-700 flex items-center justify-center">
                        <span className="w-2 h-2 rounded-full bg-slate-900 mr-2"></span>
                        <span className="w-8 h-1 rounded-full bg-slate-700"></span>
                      </div>
                    </div>
                  )}

                  {/* GRID DE WIDGETS */}
                  <div className={`grid gap-3 ${vistaDispositivo === 'MOVIL' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-4'}`}>
                    {widgets.map((w, idx) => (
                      <div
                        key={w.id || idx}
                        className={`p-3 rounded-xl border bg-slate-900/95 flex flex-col justify-between space-y-2 relative transition-all ${
                          vistaDispositivo === 'MOVIL' ? 'col-span-1' :
                          w.colSpan === 2 ? 'sm:col-span-2' :
                          w.colSpan === 3 ? 'sm:col-span-3' :
                          w.colSpan === 4 ? 'sm:col-span-4' : 'sm:col-span-1'
                        } ${
                          w.color === 'emerald' ? 'border-emerald-500/40 text-emerald-300' :
                          w.color === 'amber' ? 'border-amber-500/40 text-amber-300' :
                          w.color === 'rose' ? 'border-rose-500/40 text-rose-300' :
                          w.color === 'pink' ? 'border-pink-500/40 text-pink-300' :
                          w.color === 'purple' ? 'border-purple-500/40 text-purple-300' :
                          'border-cyan-500/40 text-cyan-300'
                        } ${modoEdicion ? 'hover:scale-[1.01] hover:border-amber-400' : ''}`}
                      >
                        {/* Barra Superior del Widget */}
                        <div className="flex justify-between items-center text-[9px] border-b border-slate-800 pb-1">
                          <span className="font-bold text-white uppercase truncate flex items-center gap-1">
                            {w.titulo}
                            {w.canal && <span className="text-[8px] px-1 rounded bg-slate-800 text-slate-400">R{w.canal}</span>}
                            {w.entrada && <span className="text-[8px] px-1 rounded bg-slate-800 text-emerald-400">{w.entrada}</span>}
                          </span>

                          {/* BOTONES DE EDICIÓN CUANDO MODO EDICIÓN ESTÁ ACTIVO */}
                          {modoEdicion ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setWidgetEnEdicion(widgetEnEdicion === idx ? null : idx)}
                                className="p-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded border border-amber-500/40"
                                title="Personalizar Widget"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveWidget(idx)}
                                className="p-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded border border-rose-500/40"
                                title="Eliminar Widget"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-[8px] text-slate-500 uppercase">{w.tipo}</span>
                          )}
                        </div>

                        {/* ================================================================= */}
                        {/* PANEL DE PERSONALIZACIÓN INLINE DEL WIDGET (MODAL EN EDICIÓN)     */}
                        {/* ================================================================= */}
                        {modoEdicion && widgetEnEdicion === idx && (
                          <div className="p-2.5 bg-slate-950 rounded-lg border border-amber-500/50 space-y-2 text-[10px] text-slate-300 my-1 animate-fadeIn">
                            <span className="font-bold text-amber-400 block border-b border-slate-800 pb-1">
                              Configurar Widget #{idx + 1}:
                            </span>

                            {/* Título */}
                            <div>
                              <span className="block text-[9px] text-slate-400">Nombre / Título</span>
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

                            {/* Selector de Tipo de Widget */}
                            <div className="grid grid-cols-2 gap-1.5">
                              <div>
                                <span className="block text-[9px] text-slate-400">Tipo de Widget</span>
                                <select
                                  value={w.tipo}
                                  onChange={(e) => {
                                    const next = [...widgets];
                                    next[idx].tipo = e.target.value;
                                    setWidgets(next);
                                  }}
                                  className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-cyan-300 font-bold"
                                >
                                  <option value="ACTION_BUTTON">🔘 Botón Pulsador</option>
                                  <option value="SWITCH_TOGGLE">🎚️ Switch ON/OFF</option>
                                  <option value="GAUGE_RADIAL">🧭 Gauge de Aguja</option>
                                  <option value="VALUE_CARD">🔢 Tarjeta de Valor</option>
                                  <option value="STATUS_LED">💡 Indicador LED</option>
                                  <option value="TEXT_STATUS">📝 Texto de Estado</option>
                                  <option value="CHART_HISTORY">📈 Gráfica Histórica</option>
                                </select>
                              </div>

                              {/* Vinculación a Relé de Salida */}
                              <div>
                                <span className="block text-[9px] text-slate-400">Salida Física</span>
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
                                    <option key={n} value={n}>Relé R{n}</option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {/* Dimensiones y Color */}
                            <div className="grid grid-cols-2 gap-1.5">
                              <div>
                                <span className="block text-[9px] text-slate-400">Ancho Columnas</span>
                                <select
                                  value={w.colSpan || 1}
                                  onChange={(e) => {
                                    const next = [...widgets];
                                    next[idx].colSpan = Number(e.target.value);
                                    setWidgets(next);
                                  }}
                                  className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-white"
                                >
                                  <option value={1}>1 Columna</option>
                                  <option value={2}>2 Columnas</option>
                                  <option value={4}>Ancho Completo</option>
                                </select>
                              </div>

                              <div>
                                <span className="block text-[9px] text-slate-400">Color Tema</span>
                                <select
                                  value={w.color || 'cyan'}
                                  onChange={(e) => {
                                    const next = [...widgets];
                                    next[idx].color = e.target.value;
                                    setWidgets(next);
                                  }}
                                  className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-white"
                                >
                                  <option value="cyan">Cian</option>
                                  <option value="emerald">Verde</option>
                                  <option value="amber">Ámbar</option>
                                  <option value="rose">Rojo</option>
                                  <option value="purple">Púrpura</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* CUERPO INTERACTIVO DEL WIDGET CON VALORES REALISTAS */}
                        <div className="py-2 flex flex-col items-center justify-center">
                          {w.tipo === 'ACTION_BUTTON' && (
                            <button
                              type="button"
                              className="w-full py-2.5 px-3 rounded-lg font-bold text-xs bg-slate-950 border border-current flex items-center justify-center gap-2 shadow-md hover:brightness-125 transition-all"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>{w.titulo}</span>
                            </button>
                          )}

                          {w.tipo === 'SWITCH_TOGGLE' && (
                            <div className="flex items-center justify-between w-full px-2">
                              <span className="text-[10px] text-slate-300">Canal R{w.canal || 1}</span>
                              <div className="w-12 h-6 bg-slate-950 rounded-full border border-current p-0.5 flex items-center justify-end">
                                <span className="w-4 h-4 rounded-full bg-current shadow"></span>
                              </div>
                            </div>
                          )}

                          {w.tipo === 'GAUGE_RADIAL' && (
                            <div className="text-center">
                              <span className="text-2xl font-bold font-mono tracking-tight">{getValorMockRealista(w)}</span>
                              <span className="text-[10px] text-slate-400 ml-1">{w.unidad || 'bar'}</span>
                              <span className="block text-[9px] text-slate-500 font-sans mt-0.5">Rango: {w.min || 0} a {w.max || 3} {w.unidad || 'bar'}</span>
                            </div>
                          )}

                          {w.tipo === 'VALUE_CARD' && (
                            <div className="text-center">
                              <span className="text-2xl font-bold font-mono tracking-tight">{getValorMockRealista(w)}</span>
                              <span className="text-xs text-slate-400 ml-1">{w.unidad || '°C'}</span>
                            </div>
                          )}

                          {w.tipo === 'STATUS_LED' && (
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-current animate-ping"></span>
                              <span className="font-bold text-xs">{w.labelOn || 'ACTIVO'}</span>
                            </div>
                          )}

                          {w.tipo === 'TEXT_STATUS' && (
                            <span className="text-sm font-bold tracking-wider uppercase text-white">MOTOR_EN_MARCHA</span>
                          )}

                          {w.tipo === 'CHART_HISTORY' && (
                            <div className="w-full h-14 bg-slate-950/60 rounded flex items-center justify-center text-[10px] text-slate-500">
                              📈 Curva de Presión & Temperatura en Vivo
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. VISTA BIBLIOTECA CLOUD EN SUPABASE                                     */}
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
      {/* 5. VISTA EDITOR JSON RAW                                                  */}
      {/* ========================================================================= */}
      {activeTab === 'EDITOR_JSON' && (
        <div className="ultra-glass p-5 rounded-2xl border border-indigo-500/30 space-y-3">
          <div className="flex justify-between items-center border-b border-indigo-500/20 pb-2">
            <div>
              <h3 className="text-sm font-bold text-indigo-300 flex items-center gap-2">
                <FileCode className="w-4 h-4" />
                Editor Raw del Manifiesto JSON (Hardware + Widgets)
              </h3>
              <p className="text-[10px] text-slate-400">Puedes modificar cualquier campo manualmente antes de guardar o desplegar.</p>
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
}
