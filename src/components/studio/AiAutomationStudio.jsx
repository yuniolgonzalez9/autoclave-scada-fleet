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
  FolderOpen,
  Trash2,
  Edit3,
  FileCode,
  ArrowRight,
  Database,
  Check,
  X
} from 'lucide-react';

export default function AiAutomationStudio({ fleet, sendCommand, initialDeviceMac = null }) {
  // Pestañas del Studio
  const [activeTab, setActiveTab] = useState('STUDIO'); // 'STUDIO', 'BIBLIOTECA', 'EDITOR_JSON'

  // Estados del Prompt y Compilador
  const [prompt, setPrompt] = useState('Ambulancia de rescate con arranque remoto inteligente, corte de ignición, indicador de alternador D+ y medidor de batería 12V');
  const [compilando, setCompilando] = useState(false);
  const [vistaLienzo, setVistaLienzo] = useState('WIDGETS'); // 'WIDGETS' o 'HAL_CODE'

  // Objeto Compilado Activo
  const [perfilActivoId, setPerfilActivoId] = useState(null); // ID en Supabase si ya existe
  const [perfilNombre, setPerfilNombre] = useState('Ambulancia Hyundai Staria v1');
  const [tipoEquipo, setTipoEquipo] = useState('VEHICULO');
  const [widgets, setWidgets] = useState([]);
  const [halPayload, setHalPayload] = useState(null);
  const [jsonRaw, setJsonRaw] = useState('');

  // Equipos Destino
  const [selectedMac, setSelectedMac] = useState(initialDeviceMac || '');
  const [transmitting, setTransmitting] = useState(false);
  const [msg, setMsg] = useState('');

  // Biblioteca de Perfiles en Supabase ('perfiles_hardware')
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

      if (!error && data) {
        setPerfilesGuardados(data);
      }
    } catch (e) {
      console.warn('Error cargando biblioteca:', e);
    } finally {
      setLoadingLib(false);
    }
  };

  useEffect(() => {
    cargarBiblioteca();
  }, []);

  // 1. COMPILAR CON IA
  const handleCompilar = async (promptTexto = null) => {
    const textoFinal = promptTexto || prompt;
    if (!textoFinal.trim()) return alert('Describe qué automatización deseas compilar.');

    setCompilando(true);
    setMsg('');

    try {
      const targetDev = fleet[selectedMac] || null;
      const res = await compilarConIA({
        prompt: textoFinal,
        device: targetDev,
        hardwareInfo: targetDev?.meta?.config_deseada || {}
      });

      if (res.exito) {
        setPerfilActivoId(null); // Nuevo perfil no guardado aún
        setPerfilNombre(res.titulo || 'Nuevo Perfil');
        setTipoEquipo(res.halPayload?.tipo || 'UNIVERSAL_PLC');
        setWidgets(res.dashboardWidgets || []);
        setHalPayload(res.halPayload || {});
        
        const fullPayload = {
          tipo: res.halPayload?.tipo || 'UNIVERSAL_PLC',
          hal: res.halPayload,
          dashboard: res.dashboardWidgets
        };
        setJsonRaw(JSON.stringify(fullPayload, null, 2));

        setMsg(`✨ Compilación exitosa: [${res.fuente === 'IA_NUBE' ? 'IA Nube' : 'Compilador Semántico'}] generó ${res.dashboardWidgets?.length || 0} widgets y la lógica física.`);
      }
    } catch (e) {
      alert('Error de compilación: ' + e.message);
    } finally {
      setCompilando(false);
    }
  };

  // 2. GUARDAR / ACTUALIZAR EN SUPABASE ('perfiles_hardware')
  const handleGuardarEnSupabase = async () => {
    if (!halPayload && !jsonRaw) return alert('No hay lógica para guardar. Compila primero.');

    let contenidoAGuardar;
    try {
      contenidoAGuardar = jsonRaw ? JSON.parse(jsonRaw) : { tipo: tipoEquipo, hal: halPayload, dashboard: widgets };
    } catch (e) {
      return alert('El JSON contiene errores de sintaxis: ' + e.message);
    }

    setMsg('Guardando en Supabase...');

    try {
      const payloadDB = {
        nombre: perfilNombre.trim() || 'Perfil Sin Nombre',
        descripcion: `Generado para ${tipoEquipo} • ${new Date().toLocaleDateString()}`,
        hardware_rev: 'HKL-EA8_RJ45',
        perfil_json: contenidoAGuardar,
        activo: true,
        updated_at: new Date().toISOString()
      };

      if (perfilActivoId) {
        // Actualizar existente
        const { error } = await supabase
          .from('perfiles_hardware')
          .update(payloadDB)
          .eq('id', perfilActivoId);
        if (error) throw error;
        setMsg(`💾 ¡Perfil "${perfilNombre}" actualizado con éxito en Supabase!`);
      } else {
        // Insertar nuevo
        const { data, error } = await supabase
          .from('perfiles_hardware')
          .insert([payloadDB])
          .select();
        if (error) throw error;
        if (data && data[0]) setPerfilActivoId(data[0].id);
        setMsg(`💾 ¡Perfil "${perfilNombre}" guardado como nuevo en la base de datos!`);
      }

      cargarBiblioteca();
    } catch (err) {
      setMsg('Error guardando en Supabase: ' + err.message);
    }
  };

  // 3. CARGAR UN PERFIL GUARDADO DE LA BIBLIOTECA
  const handleCargarPerfil = (p) => {
    setPerfilActivoId(p.id);
    setPerfilNombre(p.nombre);
    
    const json = p.perfil_json || {};
    setTipoEquipo(json.tipo || 'UNIVERSAL_PLC');
    setHalPayload(json.hal || json.halPayload || json);
    setWidgets(json.dashboard || json.dashboardWidgets || []);
    setJsonRaw(JSON.stringify(json, null, 2));

    setActiveTab('STUDIO');
    setMsg(`📂 Perfil "${p.nombre}" cargado desde la nube.`);
  };

  // 4. ELIMINAR PERFIL DE SUPABASE
  const handleEliminarPerfil = async (id, nombre) => {
    if (!confirm(`¿Estás seguro de eliminar permanentemente el perfil "${nombre}" de la base de datos?`)) return;

    try {
      const { error } = await supabase.from('perfiles_hardware').delete().eq('id', id);
      if (error) throw error;
      setMsg(`🗑️ Perfil "${nombre}" eliminado.`);
      if (perfilActivoId === id) {
        setPerfilActivoId(null);
      }
      cargarBiblioteca();
    } catch (err) {
      alert('Error eliminando: ' + err.message);
    }
  };

  // 5. DESPLEGAR EL PERFIL ACTIVO AL DISPOSITIVO SELECCIONADO (MQTT + SUPABASE)
  const handleDesplegarADispositivo = async () => {
    if (!selectedMac) return alert('Selecciona un dispositivo destino en el menú superior.');
    
    let contenido;
    try {
      contenido = jsonRaw ? JSON.parse(jsonRaw) : { tipo: tipoEquipo, hal: halPayload, dashboard: widgets };
    } catch (e) {
      return alert('JSON inválido: ' + e.message);
    }

    setTransmitting(true);
    setMsg(`Desplegando perfil a ${selectedMac}...`);

    const halToSend = contenido.hal || halPayload || {};
    const commandPayload = {
      cmd: 'APPLY_HAL_MAP',
      mac: selectedMac,
      tipo: contenido.tipo || tipoEquipo,
      ...halToSend,
      custom_dashboard: {
        titulo: perfilNombre,
        widgets: contenido.dashboard || widgets
      }
    };

    try {
      // Orden MQTT al ESP32
      if (sendCommand) {
        sendCommand(selectedMac, commandPayload);
        sendCommand(selectedMac, { cmd: 'SET_META', alias: perfilNombre, config_deseada: commandPayload });
      }

      // Actualizar asignaciones_equipos en Supabase
      await supabase.from('asignaciones_equipos').update({
        config_deseada: commandPayload,
        modelo: perfilNombre,
        updated_at: new Date().toISOString()
      }).eq('mac', selectedMac);

      setMsg(`⚡ ¡Lógica desplegada con éxito a [${selectedMac}]! Grabada en LittleFS.`);
    } catch (err) {
      setMsg('Error desplegando: ' + err.message);
    } finally {
      setTransmitting(false);
    }
  };

  return (
    <div className="space-y-4 font-mono text-xs">
      
      {/* BARRA SUPERIOR DE CONTROL */}
      <div className="ultra-glass p-4 rounded-2xl border border-amber-500/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              AI Automation Studio & Profile Manager
              {perfilActivoId && (
                <span className="px-2 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px]">
                  ID DB: #{perfilActivoId}
                </span>
              )}
            </h2>
            <p className="text-[11px] text-slate-300 font-sans">
              Compila con IA, administra perfiles en Supabase y despliega a cualquier equipo por LittleFS.
            </p>
          </div>
        </div>

        {/* NAVEGACIÓN INTERNA */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl">
            <button
              onClick={() => setActiveTab('STUDIO')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-bold transition-all ${
                activeTab === 'STUDIO' ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Studio IA</span>
            </button>

            <button
              onClick={() => setActiveTab('BIBLIOTECA')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-bold transition-all ${
                activeTab === 'BIBLIOTECA' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Biblioteca Cloud ({perfilesGuardados.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('EDITOR_JSON')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-bold transition-all ${
                activeTab === 'EDITOR_JSON' ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>JSON Raw</span>
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
      {/* VISTA 1: STUDIO IA (PROMPT + LIENZO DE WIDGETS ESTILO ARDUINO CLOUD)     */}
      {/* ========================================================================= */}
      {activeTab === 'STUDIO' && (
        <div className="space-y-4">
          
          {/* CAJA DE PROMPT DE LENGUAJE NATURAL */}
          <div className="ultra-glass p-4 rounded-2xl border border-amber-500/30 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-amber-300 font-bold uppercase text-[11px] flex items-center gap-1.5">
                <Wand2 className="w-3.5 h-3.5" />
                Copilot de Lógica: ¿Qué máquina deseas compilar hoy?
              </span>
              <span className="text-[10px] text-slate-400">Escribe en español libre</span>
            </div>

            <div className="flex gap-2">
              <textarea
                rows={2}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ej: Camión de bomberos con electroválvula de llenado en R1, sirena en R4, sensor de boya en IN1 y medidor de agua..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-sans focus:outline-none focus:border-amber-400"
              />
              <button
                type="button"
                onClick={() => handleCompilar()}
                disabled={compilando}
                className="px-5 py-2 bg-gradient-to-r from-amber-500 to-emerald-500 hover:opacity-90 text-slate-950 font-bold rounded-xl flex flex-col items-center justify-center gap-1 shadow-lg shadow-amber-500/20 shrink-0 font-mono disabled:opacity-50"
              >
                {compilando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>{compilando ? 'Compilando...' : 'Generar IA'}</span>
              </button>
            </div>

            {/* Atajos Rápidos */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  const p = 'Ambulancia Hyundai Staria con arranque remoto, switch de ignición, corte de inmovilizador y sensor alternador 14V';
                  setPrompt(p);
                  handleCompilar(p);
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-amber-300 text-[10px]"
              >
                🚗 Ambulancia Staria
              </button>

              <button
                type="button"
                onClick={() => {
                  const p = 'Autoclave de esterilización a 134°C con curva de vapor, botón de iniciar ciclo, purga automática y cálculo F0';
                  setPrompt(p);
                  handleCompilar(p);
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 text-[10px]"
              >
                ♨️ Autoclave Quirófano
              </button>

              <button
                type="button"
                onClick={() => {
                  const p = 'Sistema industrial de bombeo con control de boyas de nivel, electroválvulas y seta de paro de emergencia';
                  setPrompt(p);
                  handleCompilar(p);
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-emerald-300 text-[10px]"
              >
                ⚙️ Soft-PLC Llenado Tanques
              </button>
            </div>
          </div>

          {/* BARRA DE IDENTIDAD Y HERRAMIENTAS DEL PERFIL ACTIVO */}
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

              {/* Selector de Dispositivo Destino para Despliegue Inmediato */}
              <div className="flex items-center gap-1.5">
                <select
                  value={selectedMac}
                  onChange={(e) => setSelectedMac(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-cyan-300 font-bold"
                >
                  <option value="">-- Elegir Equipo Destino --</option>
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

          {/* LIENZO DE WIDGETS VISUALES GENERADOS */}
          <div className="ultra-glass p-5 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-white font-bold flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-cyan-400" />
                Dashboard Visual ({widgets.length} Widgets Activos):
              </span>
              <span className="text-[10px] text-slate-400">Personaliza columnas (1-4) y colores de cada widget</span>
            </div>

            {widgets.length === 0 ? (
              <div className="py-12 border-2 border-dashed border-slate-800 rounded-xl text-center text-slate-500 space-y-2">
                <Sparkles className="w-8 h-8 mx-auto text-amber-500/30" />
                <p>Escribe tu automatización arriba y pulsa "Generar IA" para ver los widgets.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                {widgets.map((w, idx) => (
                  <div
                    key={w.id || idx}
                    className={`p-3 rounded-xl border bg-slate-900/90 flex flex-col justify-between space-y-2 relative ${
                      w.colSpan === 2 ? 'sm:col-span-2' :
                      w.colSpan === 3 ? 'sm:col-span-3' :
                      w.colSpan === 4 ? 'sm:col-span-4' : 'sm:col-span-1'
                    } ${
                      w.color === 'emerald' ? 'border-emerald-500/40 text-emerald-300' :
                      w.color === 'amber' ? 'border-amber-500/40 text-amber-300' :
                      w.color === 'rose' ? 'border-rose-500/40 text-rose-300' :
                      'border-cyan-500/40 text-cyan-300'
                    }`}
                  >
                    {/* Barra de Personalización del Widget */}
                    <div className="flex justify-between items-center text-[9px] border-b border-slate-800 pb-1">
                      <span className="font-bold text-white uppercase truncate">{w.titulo}</span>
                      <div className="flex items-center gap-1">
                        <select
                          value={w.colSpan || 1}
                          onChange={(e) => {
                            const next = [...widgets];
                            next[idx].colSpan = Number(e.target.value);
                            setWidgets(next);
                          }}
                          className="bg-slate-950 border border-slate-700 rounded px-1 text-[9px] text-slate-300"
                        >
                          <option value={1}>1 Col</option>
                          <option value={2}>2 Col</option>
                          <option value={4}>Full</option>
                        </select>
                        <select
                          value={w.color || 'cyan'}
                          onChange={(e) => {
                            const next = [...widgets];
                            next[idx].color = e.target.value;
                            setWidgets(next);
                          }}
                          className="bg-slate-950 border border-slate-700 rounded px-1 text-[9px] text-slate-300"
                        >
                          <option value="cyan">Cian</option>
                          <option value="emerald">Verde</option>
                          <option value="amber">Ámbar</option>
                          <option value="rose">Rojo</option>
                        </select>
                      </div>
                    </div>

                    {/* Contenido Visual */}
                    <div className="py-2 flex flex-col items-center justify-center">
                      {w.tipo === 'ACTION_BUTTON' && (
                        <div className="w-full py-2 bg-slate-950 border border-current rounded-lg text-center font-bold">
                          {w.titulo}
                        </div>
                      )}
                      {w.tipo === 'SWITCH_TOGGLE' && (
                        <div className="flex justify-between w-full px-2 text-[10px]">
                          <span>Canal {w.canal}</span>
                          <span className="font-bold text-white">INTERRUPTOR ON/OFF</span>
                        </div>
                      )}
                      {w.tipo === 'GAUGE_RADIAL' && (
                        <div className="text-center">
                          <span className="text-2xl font-bold font-mono">12.6</span>
                          <span className="text-xs text-slate-400 ml-1">{w.unidad}</span>
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
                        <div className="w-full h-12 bg-slate-950/60 rounded flex items-center justify-center text-slate-500 text-[10px]">
                          📈 Curva en Vivo
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISTA 2: BIBLIOTECA CLOUD DE PERFILES GUARDADOS EN SUPABASE               */}
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
      {/* VISTA 3: EDITOR JSON RAW (MODIFICACIÓN Y AJUSTES MANUALES)                */}
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
