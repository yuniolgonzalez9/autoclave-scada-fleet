import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { conversarYCompilarConIA, detectarProveedorApiKey } from '../../services/aiStudioService';
import { supabase } from '../../services/supabase';
import { 
  Sparkles, 
  Cpu, 
  Send, 
  CheckCircle2, 
  Play, 
  Square,
  Key, 
  LayoutGrid, 
  RefreshCw, 
  Trash2, 
  Edit3, 
  FileCode, 
  Database, 
  X, 
  Settings2, 
  GripHorizontal,
  Bot,
  User, 
  ShieldCheck, 
  Mic, 
  MicOff, 
  AlertTriangle 
} from 'lucide-react';

const SNAP_GRID = 10;

export default function AiAutomationStudio({ fleet = {}, sendCommand = null, initialDeviceMac = null, isAdmin = true, userRole = 'SUPERADMIN' }) {
  const [activeTab, setActiveTab] = useState('STUDIO'); // 'STUDIO' | 'BIBLIOTECA' | 'EDITOR_JSON'
  const [modoEdicion, setModoEdicion] = useState(false);
  const [widgetEnEdicion, setWidgetEnEdicion] = useState(null);

  // Chat y Dictado por Voz
  const [prompt, setPrompt] = useState('');
  const [proveedorSel, setProveedorSel] = useState(() => localStorage.getItem('biofleet_ai_provider') || 'GROQ');
  const [historialChat, setHistorialChat] = useState([
    {
      id: 'init_msg',
      sender: 'ai',
      texto: 'BIOFLEET AI en línea. Tengo visión total de la flota, telemetría en vivo y control ejecutivo del hardware. Consulte, ordene o dicte cualquier instrucción: diagnósticos, mantenimiento, secuencias, relés o configuración completa.'
    }
  ]);
  const [compilando, setCompilando] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const chatScrollRef = useRef(null);

  // Acción Ejecutiva Pendiente de Confirmación
  const [accionPendiente, setAccionPendiente] = useState(null);

  // Estados Locales en Tiempo Real (Relés y FSM)
  const [relesLocales, setRelesLocales] = useState({});
  const [timerEjecutando, setTimerEjecutando] = useState(null);
  const timerIntervalRef = useRef(null);
  const abortSequenceRef = useRef(false);

  // Gestión de Claves Cloud en Supabase (config_ai_keys)
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keysList, setKeysList] = useState([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [newKeyData, setNewKeyData] = useState({
    proveedor: 'GROQ',
    api_key: '',
    descripcion: 'Clave Primaria',
    prioridad: 1
  });

  // Perfil, Dashboard y Receta
  const [perfilNombre, setPerfilNombre] = useState('Consola SCADA Activa');
  const [tipoEquipo, setTipoEquipo] = useState('AUTOCLAVE');
  const [widgets, setWidgets] = useState([]);
  const [recetaActiva, setRecetaActiva] = useState(null);
  const [halPayload, setHalPayload] = useState(null);
  const [jsonRaw, setJsonRaw] = useState('');

  // Selección de Placa Física
  const macList = Object.keys(fleet || {});
  const [selectedMac, setSelectedMac] = useState(() => {
    if (initialDeviceMac) return initialDeviceMac.toUpperCase().replace(/[:\-]/g, '');
    const onlineMac = macList.find((m) => (Date.now() - (fleet[m]?.lastSeen || 0)) < 15000);
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

  // Pointer Events Suaves
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
  const rafId = useRef(null);

  // 1. RECONOCIMIENTO DE VOZ NATIVO (Web Speech API)
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'es-ES';

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results).map((r) => r[0].transcript).join('');
        setPrompt(transcript);
      };

      recognition.onend = () => setIsListening(false);
      recognition.onerror = (event) => {
        console.warn('[VOICE INPUT]', event.error);
        setIsListening(false);
      };
      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('El navegador en uso no soporta la interfaz de reconocimiento de voz Web Speech API.');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (_) {
        setIsListening(false);
      }
    }
  };

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [historialChat, compilando]);

  useEffect(() => {
    if (!isAdmin && activeTab === 'EDITOR_JSON') setActiveTab('STUDIO');
  }, [isAdmin, activeTab]);

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (rafId.current) cancelAnimationFrame(rafId.current);
      abortSequenceRef.current = true;
    };
  }, []);

  // Carga de Claves desde Supabase (Enmascaradas)
  const cargarClavesSupabase = useCallback(async () => {
    setLoadingKeys(true);
    try {
      const { data, error } = await supabase
        .from('config_ai_keys')
        .select('id, proveedor, descripcion, prioridad, activo, created_at')
        .order('prioridad', { ascending: true });

      if (!error && data) {
        setKeysList(data);
      }
    } catch (e) {
      console.warn('[AI STUDIO] Error consultando claves:', e);
    } finally {
      setLoadingKeys(false);
    }
  }, []);

  useEffect(() => {
    cargarClavesSupabase();
  }, [cargarClavesSupabase]);

  const cargarBiblioteca = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    cargarBiblioteca();
  }, [cargarBiblioteca]);

  useEffect(() => {
    if (activeDevice?.i2cReport?.chips) {
      setChipsDetectados(activeDevice.i2cReport.chips);
      setScanningI2C(false);
    }
  }, [activeDevice?.i2cReport]);

  useEffect(() => {
    if (dDev.reles) {
      setRelesLocales((prev) => ({ ...dDev.reles, ...prev }));
    }
  }, [dDev.reles]);

  // CRUD de Claves en Supabase
  const handleInsertarClave = async (e) => {
    e.preventDefault();
    if (!newKeyData.api_key.trim()) return alert('Debe proporcionar un token válido.');

    try {
      const detectedProv = newKeyData.proveedor || detectarProveedorApiKey(newKeyData.api_key);
      const { error } = await supabase.from('config_ai_keys').insert([{
        proveedor: detectedProv,
        api_key: newKeyData.api_key.trim(),
        descripcion: newKeyData.descripcion.trim() || 'Clave de Inferencia',
        prioridad: Number(newKeyData.prioridad) || 1,
        activo: true
      }]);

      if (error) throw error;
      setNewKeyData({ proveedor: 'GROQ', api_key: '', descripcion: '', prioridad: keysList.length + 1 });
      setMsg('Clave agregada al clúster de inferencia de forma segura.');
      cargarClavesSupabase();
    } catch (err) {
      alert(`Error guardando clave: ${err.message}`);
    }
  };

  const handleToggleClaveActiva = async (item) => {
    const nextActivo = !item.activo;
    setKeysList((prev) => prev.map((k) => k.id === item.id ? { ...k, activo: nextActivo } : k));

    try {
      await supabase.from('config_ai_keys').update({ activo: nextActivo }).eq('id', item.id);
    } catch (_) {
      cargarClavesSupabase();
    }
  };

  const handleEliminarClave = async (id, desc) => {
    if (!confirm(`¿Confirma eliminar la credencial "${desc || id}" del repositorio central?`)) return;
    setKeysList((prev) => prev.filter((k) => k.id !== id));
    try {
      await supabase.from('config_ai_keys').delete().eq('id', id);
      setMsg('Clave removida.');
    } catch (err) {
      alert(`Error: ${err.message}`);
      cargarClavesSupabase();
    }
  };

  // Toggle Manual de Relé
  const handleToggleRelayDirecto = (canal, currentState = null) => {
    if (!cleanMac) {
      alert('Seleccione un equipo de destino antes de conmutar salidas.');
      return;
    }

    const numCanal = Number(canal || 1);
    const estadoActual = currentState !== null ? currentState : Boolean(relesLocales[`R${numCanal}`]);
    const nextVal = !estadoActual;

    setRelesLocales((prev) => ({
      ...prev,
      [`R${numCanal}`]: nextVal ? 1 : 0
    }));

    if (sendCommand) {
      sendCommand(cleanMac, {
        cmd: 'SET_RELAY',
        canal: numCanal,
        val: nextVal
      });
      setMsg(`R${numCanal} -> ${nextVal ? 'ENERGIZADO (ON)' : 'DESACTIVADO (OFF)'}`);
    }
  };

  // Despliegue a la placa física
  const handleDesplegarADispositivo = async () => {
    if (!cleanMac) return alert('Seleccione una placa física destino.');

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

      setMsg(`Lógica y controles grabados en memoria flash de [${cleanMac}].`);
    } catch (err) {
      setMsg(`Aviso base de datos: ${err.message}`);
    } finally {
      setTransmitting(false);
    }
  };

  // Ejecución de Acciones Confirmadas
  const handleEjecutarAccionConfirmada = (accion) => {
    if (!accion) return;
    const targetMac = (accion.payload?.mac || cleanMac || '').toUpperCase().replace(/[:\-]/g, '');

    if (accion.tipo === 'DESPLEGAR_HARDWARE') {
      handleDesplegarADispositivo();
    } else if (accion.tipo === 'PARO_EMERGENCIA') {
      if (targetMac && sendCommand) {
        sendCommand(targetMac, { cmd: 'ABORTAR_PROCESO', mac: targetMac });
      }
      setRelesLocales({});
      setMsg(`PARO DE EMERGENCIA EJECUTADO EN [${targetMac.slice(-4)}]`);
    } else if (accion.tipo === 'CONMUTAR_RELE') {
      const ch = accion.payload?.canal || 1;
      handleToggleRelayDirecto(ch);
    } else if (accion.tipo === 'RESET_ALARMA') {
      if (targetMac && sendCommand) {
        sendCommand(targetMac, { cmd: 'RESET_ALARMA', mac: targetMac });
        setMsg(`Reseteo de alarma transmitido a [${targetMac.slice(-4)}]`);
      }
    } else if (accion.tipo === 'INICIAR_CICLO') {
      if (targetMac && sendCommand) {
        const prog = Math.min(6, Math.max(1, Number(accion.payload?.programa) || 1));
        sendCommand(targetMac, { cmd: 'INICIAR_CICLO', programa: prog, mac: targetMac });
        setMsg(`Programa clínico P${prog} ordenado a [${targetMac.slice(-4)}]`);
      }
    } else if (accion.tipo === 'SET_BYPASS') {
      if (targetMac && sendCommand) {
        const bp = accion.payload || {};
        sendCommand(targetMac, {
          cmd: 'SET_BYPASS',
          mac: targetMac,
          puerta: bp.puerta,
          sello: bp.sello,
          recamara: bp.recamara,
          caldera: bp.caldera
        });
        setMsg(`Bypasses de banco actualizados en [${targetMac.slice(-4)}]`);
      }
    } else if (accion.tipo === 'COMANDO_MQTT') {
      const comando = accion.payload?.comando || {};
      if (targetMac && sendCommand) {
        sendCommand(targetMac, { ...comando, mac: comando.mac || targetMac });
        setMsg(`Comando MQTT transmitido a [${targetMac.slice(-4)}]: ${JSON.stringify(comando).slice(0, 80)}`);
      }
    }

    setAccionPendiente(null);
  };

  // Detener Secuencia FSM
  const handleDetenerTemporizador = () => {
    abortSequenceRef.current = true;
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setTimerEjecutando(null);
    setRelesLocales({});

    if (cleanMac && sendCommand) {
      sendCommand(cleanMac, { cmd: 'ABORTAR_PROCESO', mac: cleanMac });
    }
    setMsg('Secuencia detenida por el operador.');
  };

  // Iniciar Secuencia FSM Sincronizada
  const handleIniciarSecuenciaMultiPaso = async (widget) => {
    if (!cleanMac) {
      alert('Seleccione un equipo antes de arrancar la secuencia.');
      return;
    }

    abortSequenceRef.current = false;
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

    const pasos = widget.pasos || (recetaActiva ? recetaActiva.pasos : []);
    if (!pasos || pasos.length === 0) {
      alert('El control seleccionado no posee etapas definidas en su receta.');
      return;
    }

    const totalSegs = widget.totalSegundos || Math.round(pasos.reduce((acc, p) => acc + (p.tiempoMs || p.tiempo_ms || 3000), 0) / 1000);

    setTimerEjecutando({
      widgetId: widget.id,
      segundosRestantes: totalSegs,
      totalSegundos: totalSegs
    });

    // Iniciar temporizador regresivo de control
    let segsRestantes = totalSegs;
    timerIntervalRef.current = setInterval(() => {
      segsRestantes--;
      if (segsRestantes <= 0 || abortSequenceRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
        setTimerEjecutando(null);
      } else {
        setTimerEjecutando({
          widgetId: widget.id,
          segundosRestantes: segsRestantes,
          totalSegundos: totalSegs
        });
      }
    }, 1000);

    // Ejecución secuencial exacta
    (async () => {
      for (let i = 0; i < pasos.length; i++) {
        if (abortSequenceRef.current) break;

        const paso = pasos[i];
        const canal = Number(paso.canal || (paso.acciones_encender?.[0]?.replace(/\D/g, '')) || (i + 1));
        const delayMs = Number(paso.tiempoMs || paso.tiempo_ms || 3000);

        if (canal >= 1 && canal <= 8) {
          setRelesLocales((prev) => {
            const copia = { ...prev };
            Object.keys(copia).forEach((k) => { copia[k] = 0; });
            copia[`R${canal}`] = 1;
            return copia;
          });

          if (sendCommand && !abortSequenceRef.current) {
            sendCommand(cleanMac, {
              cmd: 'SET_RELAY',
              canal,
              val: true,
              duracion_ms: delayMs
            });
          }
        }

        setMsg(`Ejecutando etapa ${i + 1}/${pasos.length}: ${paso.nombre || 'Etapa ' + (i + 1)} (R${canal})`);

        const slice = 100;
        let elapsed = 0;
        while (elapsed < delayMs && !abortSequenceRef.current) {
          await new Promise((r) => setTimeout(r, slice));
          elapsed += slice;
        }
      }

      if (!abortSequenceRef.current) {
        setRelesLocales({});
        setMsg('Secuencia finalizada con éxito.');
      }
    })();
  };

  // Enviar mensaje a la IA
  const handleEnviarMensaje = async (e) => {
    if (e) e.preventDefault();
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }

    const textoUsuario = prompt.trim();
    if (!textoUsuario) return;

    setHistorialChat((prev) => [...prev, { id: `u_${Date.now()}`, sender: 'user', texto: textoUsuario }]);
    setPrompt('');
    setCompilando(true);
    setMsg('');

    try {
      const targetDev = fleet[cleanMac] || null;

      const res = await conversarYCompilarConIA({
        prompt: textoUsuario,
        historial: historialChat.map((h) => ({ sender: h.sender, contenido: h.texto })),
        hardwareInfo: targetDev?.meta?.config_deseada || targetDev?.datos?.cfg || { tipo: 'AUTOCLAVE' },
        widgetsActuales: widgets,
        recetaActual: recetaActiva,
        telemetriaActual: { reles: relesLocales, fase: dDev.fase, adc: adcFisico },
        flota: fleet,
        rolUsuario: userRole,
        proveedorPreferido: proveedorSel
      });

      setHistorialChat((prev) => [
        ...prev,
        { id: `ai_${Date.now()}`, sender: 'ai', texto: res.mensajeChat }
      ]);

      if (res.dashboardWidgets !== undefined) setWidgets(res.dashboardWidgets);
      if (res.receta) setRecetaActiva(res.receta);

      if (res.accionPropuesta && res.accionPropuesta.tipo !== 'NINGUNA') {
        if (res.accionPropuesta.requiere_confirmacion) {
          setAccionPendiente(res.accionPropuesta);
        } else {
          handleEjecutarAccionConfirmada(res.accionPropuesta);
        }
      }

      setPerfilNombre(res.titulo || perfilNombre);
      setTipoEquipo(res.tipo || tipoEquipo);

      if (res.halPayload?.nombres_reles) setNombresReles(res.halPayload.nombres_reles);
      if (res.halPayload?.roles_reles) setRolesReles(res.halPayload.roles_reles);

      setHalPayload(res.halPayload || {});
      setJsonRaw(JSON.stringify(res, null, 2));
      setMsg(`${res.titulo || 'Instrucción procesada'}`);
    } catch (err) {
      setHistorialChat((prev) => [
        ...prev,
        { id: `ai_err_${Date.now()}`, sender: 'ai', texto: `Aviso del motor de inferencia: ${err.message}` }
      ]);
    } finally {
      setCompilando(false);
    }
  };

  // Pointer events optimizados con RAF
  const handlePointerDown = (e, idx, action) => {
    if (!modoEdicion) return;
    e.stopPropagation();

    const currentW = widgets[idx];
    activeInteraction.current = {
      type: action,
      widgetIdx: idx,
      startX: e.clientX,
      startY: e.clientY,
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

    if (rafId.current) cancelAnimationFrame(rafId.current);

    rafId.current = requestAnimationFrame(() => {
      setWidgets((prev) => prev.map((w, i) => {
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
      }));
    });
  };

  const handlePointerUp = (e) => {
    if (activeInteraction.current.type) {
      if (rafId.current) cancelAnimationFrame(rafId.current);
      if (e.currentTarget.releasePointerCapture) {
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
      }
      activeInteraction.current = { type: null, widgetIdx: null };
    }
  };

  const totalClavesActivas = keysList.filter((k) => k.activo).length;

  return (
    <div className="space-y-4 font-mono text-xs select-none">
      
      {/* Barra superior */}
      <div className="ultra-glass p-4 rounded-2xl border border-amber-500/30 relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400/70 to-transparent pointer-events-none" />
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/30 to-emerald-500/20 border border-amber-500/50 text-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.25)]">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold flex items-center gap-2 flex-wrap">
              <span className="studio-title-gradient">BIOFLEET AI · Automation Studio</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 text-[9px] flex items-center gap-1.5 font-bold">
                <span className="studio-status-dot" />
                POOL CLOUD · {totalClavesActivas} ACTIVAS
              </span>
            </h2>
            <p className="text-[11px] text-slate-300 font-sans">
              Copiloto ejecutivo de ingeniería — visión total de flota, lenguaje natural y control industrial en tiempo real
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={proveedorSel}
            onChange={(e) => { setProveedorSel(e.target.value); localStorage.setItem('biofleet_ai_provider', e.target.value); }}
            title="Motor de inferencia preferido"
            className="studio-provider-select bg-slate-950 border border-emerald-500/50 text-emerald-300 rounded-xl pl-2.5 pr-6 py-1.5 font-bold cursor-pointer hover:border-emerald-400 transition-colors"
          >
            <option value="AUTO">🧠 AUTO</option>
            {['GROQ', 'GEMINI', 'OPENAI', 'OPENROUTER']
              .filter((p, i, arr) => arr.indexOf(p) === i)
              .map((p) => {
                const disponible = keysList.some((k) => k.activo && (k.proveedor || '').toUpperCase() === p);
                return <option key={p} value={p}>{p}{disponible ? '' : ' (sin clave)'}</option>;
              })}
          </select>

          {isAdmin && (
            <button
              type="button"
              onClick={() => { cargarClavesSupabase(); setShowKeyModal(true); }}
              className="px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 border transition-all bg-slate-900 border-amber-500/60 text-amber-300 hover:border-amber-400 hover:bg-slate-800 shadow"
            >
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span>Pool Claves ({totalClavesActivas})</span>
            </button>
          )}

          <div className="flex p-0.5 bg-slate-950 border border-slate-800 rounded-xl overflow-x-auto no-scrollbar max-w-full">
            <button
              type="button"
              onClick={() => setActiveTab('STUDIO')}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                activeTab === 'STUDIO' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Consola IA</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('BIBLIOTECA')}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                activeTab === 'BIBLIOTECA' ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Perfiles</span>
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('EDITOR_JSON')}
                className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                  activeTab === 'EDITOR_JSON' ? 'bg-indigo-500 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>JSON</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {msg && (
        <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{msg}</span>
          </div>
          <button type="button" onClick={() => setMsg('')} className="text-emerald-400 font-bold">✕</button>
        </div>
      )}

      {/* TAB 1: STUDIO */}
      {activeTab === 'STUDIO' && (
        <div className="space-y-4">
          
          {/* Alerta de Confirmación de Acción Ejecutiva */}
          {accionPendiente && (
            <div className="p-4 rounded-2xl bg-amber-500/20 border-2 border-amber-400 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xl">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-6 h-6 text-amber-300 shrink-0" />
                <div>
                  <span className="font-bold text-xs uppercase tracking-wider block text-amber-300">
                    Interlock de Seguridad Clínico Requerido:
                  </span>
                  <p className="text-xs text-white">
                    {accionPendiente.mensaje_confirmacion || `¿Confirma la ejecución de la orden [${accionPendiente.tipo}] en [${cleanMac.slice(-4)}]?`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setAccionPendiente(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleEjecutarAccionConfirmada(accionPendiente)}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold shadow hover:bg-amber-400"
                >
                  Confirmar y Ejecutar
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
            {/* Columna izquierda: Consola IA + Destino */}
            <div className="xl:col-span-5 space-y-4 min-w-0">
              {/* Consola de Diálogo */}
              <div className="ultra-glass p-4 rounded-2xl border border-amber-500/30 space-y-3">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-amber-300 font-bold uppercase text-[11px] flex items-center gap-1.5">
                    <Bot className="w-4 h-4 text-emerald-400" />
                    Consola Ejecutiva
                    <span className="studio-status-dot" title="Motor en línea" />
                  </span>
                  <button
                    type="button"
                    onClick={() => setHistorialChat([{ id: 'reset', sender: 'ai', texto: 'Historial reiniciado. Indique los requerimientos del proceso.' }])}
                    className="text-[10px] text-slate-400 hover:text-white"
                  >
                    Limpiar
                  </button>
                </div>

                <div ref={chatScrollRef} className="h-[300px] xl:h-[400px] overflow-y-auto space-y-2 pr-1">
                  {historialChat.map((msgItem) => (
                    <div
                      key={msgItem.id}
                      className={`p-2.5 rounded-xl text-xs flex gap-2.5 ${
                        msgItem.sender === 'user'
                          ? 'studio-msg-user ml-8 text-cyan-100'
                          : 'studio-msg-ai mr-8 text-slate-200'
                      }`}
                    >
                      <div className={`mt-0.5 shrink-0 w-6 h-6 rounded-lg flex items-center justify-center ${
                        msgItem.sender === 'user'
                          ? 'bg-cyan-500/20 border border-cyan-400/40 studio-avatar-user'
                          : 'bg-emerald-500/15 border border-emerald-400/40 studio-avatar-ai'
                      }`}>
                        {msgItem.sender === 'user' ? <User className="w-3.5 h-3.5 text-cyan-300" /> : <Bot className="w-3.5 h-3.5 text-emerald-300" />}
                      </div>
                      <div className="flex-1 whitespace-pre-wrap leading-relaxed font-sans">{msgItem.texto}</div>
                    </div>
                  ))}
                  {compilando && (
                    <div className="studio-msg-ai mr-8 p-2.5 rounded-xl text-xs flex gap-2.5 items-center text-slate-300">
                      <div className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center bg-emerald-500/15 border border-emerald-400/40 studio-avatar-ai">
                        <Bot className="w-3.5 h-3.5 text-emerald-300" />
                      </div>
                      <span className="studio-typing"><i /><i /><i /></span>
                      <span className="text-[10px] text-slate-400 font-sans">procesando en el motor de inferencia…</span>
                    </div>
                  )}
                </div>

                {/* Input con micrófono */}
                <form onSubmit={handleEnviarMensaje} className="flex items-center gap-1.5 pt-1">
                  <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={isListening ? 'Escuchando...' : 'Ordene o consulte a la IA...'}
                    className={`flex-1 min-w-0 bg-slate-950 border rounded-xl px-3 py-2 text-white font-sans text-xs focus:outline-none transition-all ${
                      isListening ? 'border-rose-500 ring-2 ring-rose-500/30 animate-pulse' : 'border-slate-700 focus:border-amber-400'
                    }`}
                  />

                  <button
                    type="button"
                    onClick={toggleListening}
                    title={isListening ? 'Detener dictado' : 'Hablar por micrófono'}
                    className={`p-2 rounded-xl border transition-all shrink-0 ${
                      isListening
                        ? 'bg-rose-600 text-white border-rose-400 shadow-lg'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
                    }`}
                  >
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>

                  <button
                    type="submit"
                    disabled={compilando || !prompt.trim()}
                    className="studio-send-btn px-3.5 py-2 bg-gradient-to-r from-amber-500 to-emerald-500 hover:opacity-90 text-slate-950 font-bold rounded-xl flex items-center gap-1.5 disabled:opacity-50 shrink-0 font-mono transition-all"
                  >
                    {compilando ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">{compilando ? 'Procesando' : 'Transmitir'}</span>
                  </button>
                </form>
              </div>

              {/* Destino y Despliegue */}
              <div className="ultra-glass p-4 rounded-2xl border border-slate-800 space-y-3">
                <span className="text-white font-bold text-[11px] uppercase flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  Destino &amp; Despliegue
                </span>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={perfilNombre}
                    onChange={(e) => setPerfilNombre(e.target.value)}
                    className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-bold text-xs focus:outline-none focus:border-cyan-400"
                  />
                  <span className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-amber-400 font-bold text-[10px] shrink-0">
                    {tipoEquipo}
                  </span>
                </div>

                <select
                  value={selectedMac}
                  onChange={(e) => setSelectedMac(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-cyan-300 font-bold font-mono"
                >
                  <option value="">-- Seleccionar Placa --</option>
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
                  className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 shadow disabled:opacity-40"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{transmitting ? 'Enviando...' : 'Desplegar a Hardware'}</span>
                </button>
              </div>
            </div>

            {/* Lienzo SCADA */}
            <div className="xl:col-span-7 min-w-0">
          <div className="ultra-glass p-4 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2 gap-2">
              <span className="text-white font-bold flex items-center gap-2 min-w-0 truncate">
                <LayoutGrid className="w-4 h-4 text-cyan-400 shrink-0" />
                Lienzo SCADA ({widgets.length})
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-amber-300 font-bold hidden md:inline">
                  {timerEjecutando
                    ? `SECUENCIA: ${timerEjecutando.segundosRestantes}s`
                    : modoEdicion
                    ? 'Arrastre para posicionar · esquina para dimensionar'
                    : 'Control en tiempo real'}
                </span>
                <button
                  type="button"
                  onClick={() => { setModoEdicion(!modoEdicion); setWidgetEnEdicion(null); }}
                  className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 border transition-all text-[10px] ${
                    modoEdicion
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/30'
                      : 'bg-slate-900 border-slate-700 text-amber-300 hover:border-amber-400'
                  }`}
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  <span>{modoEdicion ? 'Bloquear' : 'Editar'}</span>
                </button>
              </div>
            </div>

            {widgets.length === 0 ? (
              <div className="py-16 border-2 border-dashed border-slate-800 rounded-xl text-center text-slate-500 space-y-2 font-sans">
                <Sparkles className="w-8 h-8 mx-auto text-amber-500/40" />
                <p>No hay controles en el lienzo. Indique a la IA mediante texto o voz los componentes requeridos.</p>
              </div>
            ) : (
              <div
                ref={canvasRef}
                className="w-full min-h-[520px] h-[640px] relative bg-slate-950/80 rounded-2xl border border-slate-800 overflow-auto bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:20px_20px]"
              >
                <div className="w-[1800px] h-[1200px] relative">
                  {widgets.map((w, idx) => {
                    const isEditingThis = widgetEnEdicion === idx;
                    const numCanal = Number(w.canal || 1);
                    const isRelayActive = Boolean(relesLocales[`R${numCanal}`]);
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
                        className={`absolute rounded-2xl border bg-slate-900/95 flex flex-col justify-between shadow-xl ${
                          modoEdicion ? 'ring-1 ring-amber-500/40' : ''
                        } ${
                          w.tipo === 'SEQUENCE_TIMER' ? 'border-amber-500/60 text-amber-300' :
                          w.color === 'emerald' ? 'border-emerald-500/40 text-emerald-300' :
                          w.color === 'amber' ? 'border-amber-500/40 text-amber-300' :
                          w.color === 'rose' ? 'border-rose-500/40 text-rose-300' :
                          'border-cyan-500/40 text-cyan-300'
                        }`}
                      >
                        {/* Cabecera del Control */}
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

                        {/* Cuerpo del Control */}
                        <div className="flex-1 p-3 flex flex-col justify-center overflow-hidden" onPointerDown={(e) => e.stopPropagation()}>
                          
                          {/* Control FSM */}
                          {w.tipo === 'SEQUENCE_TIMER' && (
                            <div className="flex flex-col justify-between h-full space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-slate-400 font-sans">Etapas FSM:</span>
                                <span className={`text-2xl font-bold font-mono tracking-wider ${esTimerActivo ? 'text-amber-400' : 'text-white'}`}>
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
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                                  {w.pasos.map((paso, pIdx) => {
                                    const segsPaso = Math.round((paso.tiempoMs || paso.tiempo_ms || 3000) / 1000);
                                    return (
                                      <div key={pIdx} className="p-1 rounded bg-slate-950 border border-slate-800 text-center">
                                        <span className="block text-[8px] text-slate-400 truncate">{paso.nombre}</span>
                                        <span className="font-mono text-cyan-300 font-bold text-[9px]">{segsPaso}s</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              <div className="pt-1">
                                {esTimerActivo ? (
                                  <button
                                    type="button"
                                    onClick={handleDetenerTemporizador}
                                    className="w-full py-2 bg-rose-600 hover:bg-rose-500 font-bold text-white rounded-xl flex items-center justify-center gap-1.5 shadow"
                                  >
                                    <Square className="w-3.5 h-3.5 fill-white" />
                                    <span>Cancelar Secuencia</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleIniciarSecuenciaMultiPaso(w)}
                                    className="w-full py-2 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:opacity-90 font-bold text-slate-950 rounded-xl flex items-center justify-center gap-1.5 shadow"
                                  >
                                    <Play className="w-3.5 h-3.5 fill-slate-950" />
                                    <span>Ejecutar Secuencia ({w.totalSegundos || 6}s)</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Control Switch */}
                          {w.tipo === 'SWITCH_TOGGLE' && (
                            <div
                              onClick={() => handleToggleRelayDirecto(w.canal || 1)}
                              className="flex items-center justify-between w-full px-3 cursor-pointer py-2.5 bg-slate-950/60 rounded-xl border border-slate-800 hover:border-cyan-400 transition-colors"
                            >
                              <span className="text-[10px] text-slate-300 font-bold">R{numCanal} · {w.titulo}</span>
                              <div
                                className={`w-12 h-6 rounded-full border border-current p-0.5 flex items-center transition-all ${
                                  isRelayActive ? 'justify-end bg-cyan-500/20' : 'justify-start bg-slate-950'
                                }`}
                              >
                                <span className={`w-4 h-4 rounded-full shadow ${isRelayActive ? 'bg-cyan-400' : 'bg-slate-600'}`}></span>
                              </div>
                            </div>
                          )}

                          {/* Control Botón */}
                          {w.tipo === 'ACTION_BUTTON' && (
                            <button
                              type="button"
                              onClick={() => handleToggleRelayDirecto(w.canal || 1)}
                              className="w-full py-3.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow bg-slate-950 border border-current text-cyan-300 hover:brightness-125"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>{w.titulo}</span>
                            </button>
                          )}
                        </div>

                        {/* Pomo de Redimensionado */}
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
          </div>
        </div>
      )}

      {/* TAB 2: BIBLIOTECA NUBE */}
      {activeTab === 'BIBLIOTECA' && (
        <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-4">
          <div className="flex justify-between items-center border-b border-cyan-500/20 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-cyan-400" />
              Biblioteca en Supabase ({perfilesGuardados.length})
            </h3>
            <button type="button" onClick={cargarBiblioteca} className="px-2.5 py-1 bg-slate-900 border border-slate-700 text-slate-300 rounded-lg text-xs">
              Actualizar
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
                    type="button"
                    onClick={() => {
                      setPerfilNombre(p.nombre);
                      const j = p.perfil_json || {};
                      setWidgets(j.dashboard || []);
                      setHalPayload(j.hal || {});
                      setRecetaActiva(j.receta || null);
                      setActiveTab('STUDIO');
                      setMsg(`Perfil "${p.nombre}" cargado en el lienzo.`);
                    }}
                    className="flex-1 py-1 bg-cyan-600 text-white rounded font-bold text-[10px]"
                  >
                    Cargar en Lienzo
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: EDITOR JSON */}
      {activeTab === 'EDITOR_JSON' && (
        <div className="ultra-glass p-5 rounded-2xl border border-indigo-500/30 space-y-3">
          <h3 className="text-sm font-bold text-indigo-300 flex items-center gap-2 border-b border-indigo-500/20 pb-2">
            <FileCode className="w-4 h-4" />
            Editor JSON del Manifiesto de Proceso
          </h3>
          <textarea
            rows={18}
            value={jsonRaw}
            onChange={(e) => setJsonRaw(e.target.value)}
            className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-cyan-300 font-mono text-[11px] leading-relaxed focus:outline-none"
            spellCheck="false"
          />
        </div>
      )}

      {/* MODAL GESTOR DE CLAVES CLOUD */}
      {showKeyModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[999999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="ultra-glass border-2 border-amber-500/60 p-6 rounded-2xl max-w-2xl w-full space-y-4 shadow-2xl font-mono text-xs">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-400" />
                Pool de Inferencia AI (`config_ai_keys`)
              </h3>
              <button type="button" onClick={() => setShowKeyModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="border border-slate-800 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-950 text-cyan-400 border-b border-slate-800">
                  <tr>
                    <th className="p-2 text-center w-12">Prio</th>
                    <th className="p-2">Proveedor</th>
                    <th className="p-2">Descripción</th>
                    <th className="p-2">Token</th>
                    <th className="p-2 text-center">Estado</th>
                    <th className="p-2 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-900/60 text-slate-300">
                  {loadingKeys ? (
                    <tr><td colSpan="6" className="p-4 text-center text-slate-400">Consultando registros...</td></tr>
                  ) : keysList.length === 0 ? (
                    <tr><td colSpan="6" className="p-4 text-center text-slate-500 font-sans">No hay credenciales registradas en la tabla.</td></tr>
                  ) : (
                    keysList.map((k) => (
                      <tr key={k.id} className="hover:bg-slate-800/40">
                        <td className="p-2 text-center font-bold text-amber-400">{k.prioridad}</td>
                        <td className="p-2 font-bold text-white">{k.proveedor}</td>
                        <td className="p-2 text-slate-400">{k.descripcion || '—'}</td>
                        <td className="p-2 font-mono text-[10px] text-cyan-300">
                          ••••••••••••••••
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleClaveActiva(k)}
                            className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                              k.activo ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-500'
                            }`}
                          >
                            {k.activo ? 'ACTIVA' : 'PAUSADA'}
                          </button>
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleEliminarClave(k.id, k.descripcion)}
                            className="p-1 text-slate-400 hover:text-rose-400 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <form onSubmit={handleInsertarClave} className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
              <span className="text-amber-400 font-bold block text-[10px] uppercase">
                + Agregar Nueva Credencial de Inferencia:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-slate-400 text-[9px] mb-0.5">Proveedor</label>
                  <select
                    value={newKeyData.proveedor}
                    onChange={(e) => setNewKeyData({ ...newKeyData, proveedor: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                  >
                    <option value="GROQ">Groq LPU</option>
                    <option value="OPENAI">OpenAI</option>
                    <option value="OPENROUTER">OpenRouter</option>
                    <option value="GEMINI">Gemini</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-slate-400 text-[9px] mb-0.5">API Key / Token Secreto</label>
                  <input
                    type="password"
                    required
                    value={newKeyData.api_key}
                    onChange={(e) => setNewKeyData({ ...newKeyData, api_key: e.target.value })}
                    placeholder="gsk_... / sk-..."
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono text-[10px]"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[9px] mb-0.5">Prioridad</label>
                  <input
                    type="number"
                    min="1"
                    value={newKeyData.prioridad}
                    onChange={(e) => setNewKeyData({ ...newKeyData, prioridad: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white text-center"
                  />
                </div>
              </div>
              <div className="flex justify-between items-center pt-1">
                <input
                  type="text"
                  value={newKeyData.descripcion}
                  onChange={(e) => setNewKeyData({ ...newKeyData, descripcion: e.target.value })}
                  placeholder="Descripción de la clave..."
                  className="flex-1 bg-slate-900 border border-slate-700 rounded p-1.5 text-white text-[10px] mr-2"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[10px]"
                >
                  Registrar Token
                </button>
              </div>
            </form>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowKeyModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs"
              >
                Cerrar Ventana
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
