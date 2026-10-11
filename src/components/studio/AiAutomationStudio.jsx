import React, { useState, useEffect, useRef } from 'react';
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
  Radio,
  Search,
  Building2,
  Wrench,
  RotateCcw,
  Car
} from 'lucide-react';

const SNAP_GRID = 10;

// CATÁLOGO MAESTRO DE MÁQUINAS (VEHÍCULOS, AUTOCLAVES, CAMAS, PLC)
const CATALOGO_MAESTRO = {
  VEHICULO: {
    HYUNDAI: ['Staria Ambulancia / Van', 'Starex / H-1 / Grand Starex', 'Porter II / H-100 Taller', 'Tucson', 'Santa Fe', 'Elantra', 'Accent', 'Sonata'],
    KIA: ['Carnival / Sedona Traslado', 'Bongo III Utilitario', 'Sportage', 'Sorento', 'K5 / Optima', 'Cerato / Forte', 'Rio / K2', 'Mohave'],
    KGM_SSANGYONG: ['Musso / Grand Musso Pick-up', 'Rexton', 'Korando'],
    TOYOTA: ['Hilux', 'HiAce Ambulancia', 'Land Cruiser / Prado', 'Fortuner', 'Corolla'],
    MERCEDES_BENZ: ['Sprinter 315 / 415 / 516 CDI Ambulancia UCI', 'Vito Combi'],
    FORD: ['Transit Ambulancia', 'F-150 / F-250 Super Duty', 'Ranger'],
    CHEVROLET: ['Express Van Ambulancia', 'D-Max / Colorado', 'Silverado'],
    NISSAN: ['Urvan NV350 Ambulancia', 'Frontier / Navara', 'Patrol'],
    GENERICO_VEHICULAR: ['Genérico 12V Gasolina (Push-to-Start)', 'Genérico 12V Llave Tradicional', 'Genérico 24V Diésel (Precalentador)']
  },
  AUTOCLAVE: {
    STERIS_AMSCO: [
      'Amsco 400 Small (16x16x26)', 'Amsco 400 Small (20x20x38)', 'Amsco 400 Medium (26x26x39)', 
      'Amsco Century V116', 'Amsco Century V120', 'Amsco Century V136', 'Amsco Eagle 3011 / 3013', 
      'Amsco Eagle 3021 / 3023', 'Steris V-PRO 1 / V-PRO max', 'Steris V-PRO 60 Compacto'
    ],
    GETINGE: [
      'Getinge GSS67N (600L)', 'Getinge GSS56 Compacto', 'Getinge Solsus 66', 
      'Getinge HS6606 (600mm)', 'Getinge HS6610 (1000mm)', 'Getinge HS55-Series', 
      'Getinge HS33-B Quirúrgico', 'Getinge K-Series (K3+ / K5+ / K7+)', 'Getinge Stericool 110 (Plasma)'
    ],
    TUTTNAUER: ['2340M / 2540M Manual', 'Elara 11 (Clase B)', 'EZ10k Plus', '3870E Vertical', '5075ELV (160L)'],
    MIDMARK_RITTER: ['M9 UltraClave', 'M11 UltraClave'],
    MATACHANA: ['Serie S1000 Doble Puerta', 'Serie 500 Hospitalario', 'Miniclave S28'],
    GENERICO: ['Autoclave Quirúrgico Clase B 24L', 'Autoclave Vertical 50L / 75L', 'Horno Calor Seco Pasteur']
  },
  CAMA_HOSPITALARIA: {
    HILL_ROM: ['Progressa UCI', 'Centrella Smart+ Bed', 'TotalCare P500', 'Advanta 2'],
    STRYKER: ['InTouch Critical Care', 'ProCuity Smart Bed', 'S3 MedSurg'],
    LINET: ['Multicare UCI', 'Eleganza 4', 'Eleganza 2'],
    PARAMOUNT_BED: ['Qualitas Plus', 'A5 Series'],
    GENERICO: ['Cama Eléctrica 3 Motores', 'Cama UCI 5 Motores (Trendelenburg)']
  },
  PLC_GENERICO: {
    HANKERILA: ['HKL-EA8 (8 Relés / 8 Entradas / ADS1115)', 'HKL-EA16 Industrial'],
    GENERICO: ['Tablero Soft-PLC Universal 8 I/O', 'Controlador Cuarto Frío / Cadena de Frío']
  }
};

// ESPECIFICACIONES DE PLACAS PRE-FABRICADAS
const PLACAS_PREFABRICADAS = {
  HKL_EA8: {
    nombre: 'Hankerila HKL-EA8 Industrial',
    desc: 'ESP32 16MB + Ethernet LAN8720 + I2C (0x24 Relés, 0x26 Opto, 0x48 ADC ADS1115)',
    uplink: 'ETHERNET_LAN8720',
    sda: 4,
    scl: 5,
    reles: 8,
    entradas: 8,
    adc: 4
  },
  KINCONY_A8: {
    nombre: 'Kincony KC868-A8 PLC',
    desc: 'ESP32 + Ethernet LAN8720 + RS485 + 8 Relés Directos + 8 Entradas Opto',
    uplink: 'ETHERNET_LAN8720',
    sda: 4,
    scl: 15,
    reles: 8,
    entradas: 8,
    adc: 4
  },
  OLIMEX_EVB: {
    nombre: 'Olimex ESP32-EVB Gateway',
    desc: 'ESP32 + Ethernet LAN8720 + 2 Relés 10A + Bus CAN + MicroSD',
    uplink: 'ETHERNET_LAN8720',
    sda: 13,
    scl: 16,
    reles: 2,
    entradas: 2,
    adc: 2
  },
  LILYGO_T_RELAY: {
    nombre: 'LilyGO T-Relay 8 Canales',
    desc: 'ESP32 WiFi/BLE + 8 Relés Optoacoplados Directos',
    uplink: 'WIFI',
    sda: 21,
    scl: 22,
    reles: 8,
    entradas: 4,
    adc: 2
  },
  GENERIC_DEVKIT: {
    nombre: 'ESP32 DevKit Genérico / Custom',
    desc: 'Placa estándar de 30 o 38 pines con conexionado libre de taller',
    uplink: 'WIFI',
    sda: 21,
    scl: 22,
    reles: 4,
    entradas: 4,
    adc: 2
  }
};

export default function AiAutomationStudio({ fleet = {}, sendCommand = null, initialDeviceMac = null }) {
  // Pestañas Maestras
  const [activeTab, setActiveTab] = useState('STUDIO'); // 'STUDIO' | 'HARDWARE_I2C' | 'BIBLIOTECA' | 'EDITOR_JSON'

  // Controles de Lienzo
  const [vistaDispositivo, setVistaDispositivo] = useState('DESKTOP'); // 'DESKTOP' | 'MOVIL'
  const [modoEdicion, setModoEdicion] = useState(false);
  const [widgetEnEdicion, setWidgetEnEdicion] = useState(null);

  // IA y Prompts
  const [prompt, setPrompt] = useState('Ambulancia Hyundai Staria con arranque remoto inteligente, corte de ignición, indicador de alternador D+ y medidor de batería 12V');
  const [modoIaRefinar, setModoIaRefinar] = useState(false);
  const [compilando, setCompilando] = useState(false);

  // Perfil y Dashboard
  const [perfilActivoId, setPerfilActivoId] = useState(null);
  const [perfilNombre, setPerfilNombre] = useState('Ambulancia Hyundai Staria v1');
  const [widgets, setWidgets] = useState([]);
  const [halPayload, setHalPayload] = useState(null);
  const [jsonRaw, setJsonRaw] = useState('');

  // Identidad y Flota
  const macList = Object.keys(fleet || {});
  const [selectedMac, setSelectedMac] = useState(() => {
    if (initialDeviceMac) return initialDeviceMac.toUpperCase().replace(/[:\-]/g, '');
    if (macList.length > 0) return macList[0];
    return '';
  });

  const [transmitting, setTransmitting] = useState(false);
  const [msg, setMsg] = useState('');

  // =========================================================================
  // ESTADOS DE HARDWARE, PROVISIÓN Y ESCÁNER I2C (CAPTURAS 1 Y 2)
  // =========================================================================
  const [modoHardware, setModoHardware] = useState('PREFABRICADO'); // 'PREFABRICADO' | 'LIBRE_DIY'
  const [placaPrefabricada, setPlacaPrefabricada] = useState('HKL_EA8');
  const [uplinkLibre, setUplinkLibre] = useState('ETHERNET_LAN8720');
  const [pinSda, setPinSda] = useState(4);
  const [pinScl, setPinScl] = useState(5);
  const [pinesLibres, setPinesLibres] = useState([
    { gpio: 2, rol: 'SALIDA_DIGITAL', nombre: 'Relé Principal 1' },
    { gpio: 4, rol: 'SALIDA_DIGITAL', nombre: 'Relé Principal 2' },
    { gpio: 15, rol: 'ENTRADA_PULLUP', nombre: 'Sensor de Puerta' },
    { gpio: 34, rol: 'ADC_ANALOGICO', nombre: 'Transductor Presión 0-3.3V' }
  ]);

  const [tipoEquipo, setTipoEquipo] = useState('VEHICULO');
  const [marca, setMarca] = useState('HYUNDAI');
  const [modelo, setModelo] = useState('Staria Ambulancia / Van');
  const [starterMs, setStarterMs] = useState(1200);
  const [aliasEquipo, setAliasEquipo] = useState('Ambulancia Hyundai Staria');
  const [clienteEquipo, setClienteEquipo] = useState('Central Hospitalaria');

  // Escáner I2C Real
  const [scanningI2C, setScanningI2C] = useState(false);
  const [chipsDetectados, setChipsDetectados] = useState([]);
  const [selectedChipDir, setSelectedChipDir] = useState('0x24');
  const [addrLcd, setAddrLcd] = useState('0x27');
  const [lcdCols, setLcdCols] = useState(16);
  const [lcdRows, setLcdRows] = useState(2);
  const [addrRelays, setAddrRelays] = useState('0x24');
  const [addrInputs, setAddrInputs] = useState('0x26');
  const [addrAdc, setAddrAdc] = useState('0x48');

  // Roles y nombres de las 8 Salidas
  const [rolesReles, setRolesReles] = useState({
    R1: 'IGNICION_ON', R2: 'STARTER_MOTOR', R3: 'INMOVILIZADOR', R4: 'SIRENA_LUCES',
    R5: 'MANUAL', R6: 'MANUAL', R7: 'MANUAL', R8: 'MANUAL'
  });

  const [nombresReles, setNombresReles] = useState({
    R1: 'Contacto Ignición', R2: 'Motor de Arranque (Start)', R3: 'Corte Combustible',
    R4: 'Sirena / Luces', R5: 'Salida 5', R6: 'Salida 6', R7: 'Salida 7', R8: 'Salida 8'
  });

  // Roles y nombres de las 8 Entradas
  const [rolesEntradas, setRolesEntradas] = useState({
    IN1: 'SENSOR_FRENO', IN2: 'ALTERNADOR_D', IN3: 'PUERTA_CABINA', IN4: 'PARO_EMERGENCIA',
    IN5: 'LIBRE', IN6: 'LIBRE', IN7: 'LIBRE', IN8: 'LIBRE'
  });

  const [nombresEntradas, setNombresEntradas] = useState({
    IN1: 'Pedal de Freno', IN2: 'Alternador D+ 14V', IN3: 'Puerta Conductor',
    IN4: 'Pulsador Paro', IN5: 'Entrada 5', IN6: 'Entrada 6', IN7: 'Entrada 7', IN8: 'Entrada 8'
  });

  // Estado en vivo de relés para botones TEST
  const [liveRelayStates, setLiveRelayStates] = useState({});

  // Biblioteca Cloud
  const [perfilesGuardados, setPerfilesGuardados] = useState([]);
  const [loadingLib, setLoadingLib] = useState(false);

  // Referencias para Pointer Events (Touch + Mouse Drag & Resize libre)
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

  // Escuchar reporte I2C físico emitido por el ESP32 en vivo
  useEffect(() => {
    const cleanMac = (selectedMac || '').toUpperCase().replace(/[:\-]/g, '');
    const dev = fleet[cleanMac];
    if (dev?.i2cReport?.chips) {
      setChipsDetectados(dev.i2cReport.chips);
      setScanningI2C(false);
      setMsg(`¡Escáner I2C: ${dev.i2cReport.chips.length} chips detectados en bus físico!`);
    }
    if (dev?.datos?.reles) {
      setLiveRelayStates(dev.datos.reles);
    }
  }, [fleet, selectedMac]);

  // Selección de tipo y catálogo de máquina
  const tiposDisponibles = Object.keys(CATALOGO_MAESTRO);
  const marcasDisponibles = Object.keys(CATALOGO_MAESTRO[tipoEquipo] || {});
  const modelosDisponibles = (CATALOGO_MAESTRO[tipoEquipo] && CATALOGO_MAESTRO[tipoEquipo][marca]) || [];

  const handleTipoChange = (newTipo) => {
    setTipoEquipo(newTipo);
    const primMarcas = Object.keys(CATALOGO_MAESTRO[newTipo] || {});
    const primMarca = primMarcas[0] || '';
    setMarca(primMarca);
    const primModelos = (CATALOGO_MAESTRO[newTipo] && CATALOGO_MAESTRO[newTipo][primMarca]) || [];
    setModelo(primModelos[0] || '');
  };

  const handleMarcaChange = (newMarca) => {
    setMarca(newMarca);
    const modelos = (CATALOGO_MAESTRO[tipoEquipo] && CATALOGO_MAESTRO[tipoEquipo][newMarca]) || [];
    setModelo(modelos[0] || '');
  };

  // Normalizar widgets con coordenadas x, y, w, h libres
  const normalizarWidgets = (rawWidgets = []) => {
    let startX = 20;
    let startY = 20;

    return rawWidgets.map((w, idx) => {
      const defW = w.w || (w.colSpan ? Math.min(600, w.colSpan * 180) : 260);
      const defH = w.h || 170;
      const posX = w.x !== undefined ? w.x : startX;
      const posY = w.y !== undefined ? w.y : startY;

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

  // Compilación Semántica con IA
  const handleCompilarIA = async (promptTexto = null) => {
    const texto = promptTexto || prompt;
    if (!texto.trim()) return alert('Describe qué deseas que haga la IA.');

    setCompilando(true);
    setMsg('');

    try {
      const cleanMac = (selectedMac || '').toUpperCase().replace(/[:\-]/g, '');
      const targetDev = fleet[cleanMac] || null;

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
          setTipoEquipo(res.halPayload?.tipo || tipoEquipo);
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

  // =========================================================================
  // MOTOR DE POINTER EVENTS: DRAG Y RESIZE LIBRE (CORREGIDO SIN BLOQUEOS)
  // =========================================================================
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

      setJsonRaw(JSON.stringify({
        tipo: tipoEquipo,
        hal: halPayload,
        dashboard: widgets
      }, null, 2));
    }
  };

  // Agregar Widget Manual
  const handleAddWidgetManual = () => {
    const nuevo = {
      id: `w_custom_${Date.now().toString(36)}`,
      tipo: 'ACTION_BUTTON',
      titulo: nombresReles.R1 || 'Nuevo Control I2C',
      canal: 1,
      accion: 'SET_RELAY',
      color: 'cyan',
      icono: 'Zap',
      x: 30,
      y: 30,
      w: 260,
      h: 170
    };
    const next = [...widgets, nuevo];
    setWidgets(next);
    setWidgetEnEdicion(next.length - 1);
  };

  const handleRemoveWidget = (idx) => {
    const filtrados = widgets.filter((_, i) => i !== idx);
    setWidgets(filtrados);
    if (widgetEnEdicion === idx) setWidgetEnEdicion(null);
  };

  // =========================================================================
  // CONTROL EN VIVO DE RELÉS (MODO OPERADOR & BOTONES TEST)
  // =========================================================================
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

  // Disparar Escaneo Físico Real I2C
  const handleScanI2C = () => {
    const cleanMac = (selectedMac || '').toUpperCase().replace(/[:\-]/g, '');
    if (!cleanMac) return alert('Selecciona una placa en el selector para realizar el escaneo.');
    setScanningI2C(true);
    setMsg(`Enviando orden física SCAN_HARDWARE a [${cleanMac}]...`);
    if (sendCommand) sendCommand(cleanMac, { cmd: 'SCAN_HARDWARE' });
  };

  // Guardar en Supabase 'perfiles_hardware'
  const handleGuardarEnSupabase = async () => {
    const contenido = {
      tipo: tipoEquipo,
      hal: halPayload,
      dashboard: widgets,
      hardware_config: {
        modoHardware,
        placaPrefabricada,
        uplinkLibre,
        pinSda,
        pinScl,
        pinesLibres,
        rolesReles,
        nombresReles,
        rolesEntradas,
        nombresEntradas
      }
    };

    setMsg('Guardando perfil completo en Supabase Cloud...');

    try {
      const payloadDB = {
        nombre: perfilNombre.trim() || 'Perfil Sin Nombre',
        descripcion: `Configuración para ${tipoEquipo} (${marca} ${modelo}) • ${widgets.length} Widgets • ${new Date().toLocaleDateString()}`,
        hardware_rev: modoHardware === 'PREFABRICADO' ? PLACAS_PREFABRICADAS[placaPrefabricada]?.nombre : 'Placa Libre DIY',
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
        setMsg(`💾 ¡Perfil "${perfilNombre}" registrado en Supabase Cloud!`);
      }
      cargarBiblioteca();
    } catch (err) {
      setMsg('Error en Supabase: ' + err.message);
    }
  };

  // Cargar Perfil de la Biblioteca
  const handleCargarPerfil = (p) => {
    setPerfilActivoId(p.id);
    setPerfilNombre(p.nombre);
    const json = p.perfil_json || {};
    setTipoEquipo(json.tipo || 'VEHICULO');
    setHalPayload(json.hal || json.halPayload || json);

    if (json.hardware_config) {
      const hw = json.hardware_config;
      if (hw.modoHardware) setModoHardware(hw.modoHardware);
      if (hw.placaPrefabricada) setPlacaPrefabricada(hw.placaPrefabricada);
      if (hw.rolesReles) setRolesReles(hw.rolesReles);
      if (hw.nombresReles) setNombresReles(hw.nombresReles);
      if (hw.rolesEntradas) setRolesEntradas(hw.rolesEntradas);
      if (hw.nombresEntradas) setNombresEntradas(hw.nombresEntradas);
    }

    const widgetsCargados = normalizarWidgets(json.dashboard || json.dashboardWidgets || []);
    setWidgets(widgetsCargados);
    setJsonRaw(JSON.stringify(json, null, 2));
    setActiveTab('STUDIO');
    setMsg(`📂 Perfil "${p.nombre}" cargado al Studio.`);
  };

  // Eliminar Perfil
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

  // =========================================================================
  // DESPLIEGUE INTEGRAL: HARDWARE PROVISIONING + HAL + LITTLEFS FLASH
  // =========================================================================
  const handleDesplegarADispositivo = async (reiniciarPlaca = false) => {
    const cleanMac = (selectedMac || '').toUpperCase().replace(/[:\-]/g, '');

    if (!cleanMac) {
      alert('⚠️ Por favor selecciona un equipo destino en el selector de placa.');
      return;
    }

    setTransmitting(true);
    setMsg(`Transmitiendo provisión física y dashboard a [${cleanMac}]...`);

    // 1. Configuración de Hardware de Silicio
    const provisionPayload = {
      modo_hardware: modoHardware,
      placa_prefabricada: modoHardware === 'PREFABRICADO' ? placaPrefabricada : null,
      uplink_red: modoHardware === 'PREFABRICADO' ? PLACAS_PREFABRICADAS[placaPrefabricada]?.uplink : uplinkLibre,
      i2c_sda: modoHardware === 'PREFABRICADO' ? PLACAS_PREFABRICADAS[placaPrefabricada]?.sda : Number(pinSda),
      i2c_scl: modoHardware === 'PREFABRICADO' ? PLACAS_PREFABRICADAS[placaPrefabricada]?.scl : Number(pinScl),
      pines_libres: modoHardware === 'LIBRE_DIY' ? pinesLibres : [],
      tipo: tipoEquipo,
      marca,
      modelo,
      starter_ms: Number(starterMs)
    };

    // 2. HAL Map y Widgets Consolidado
    const commandPayload = {
      cmd: 'APPLY_HAL_MAP',
      mac: cleanMac,
      tipo: tipoEquipo,
      timestamp: Date.now(),
      provision: provisionPayload,
      addr_lcd: addrLcd,
      lcd_cols: Number(lcdCols),
      lcd_rows: Number(lcdRows),
      addr_relays: addrRelays,
      addr_inputs: addrInputs,
      addr_adc: addrAdc,
      roles_reles: rolesReles,
      nombres_reles: nombresReles,
      roles_entradas: rolesEntradas,
      nombres_entradas: nombresEntradas,
      reiniciar: Boolean(reiniciarPlaca),
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

    console.log(`🚀 [BIOFLEET MQTT] Desplegando en tópico: autoclave_med_2026/${cleanMac}/config`, commandPayload);

    let mqttExitoso = false;

    if (typeof sendCommand === 'function') {
      try {
        sendCommand(cleanMac, commandPayload);
        mqttExitoso = true;
      } catch (errMqtt) {
        console.error('❌ [BIOFLEET MQTT ERROR]:', errMqtt);
      }
    }

    try {
      const metaPayload = {
        mac: cleanMac,
        alias: aliasEquipo.trim() || perfilNombre,
        cliente: clienteEquipo.trim() || 'Central Hospitalaria',
        modelo: modelo.trim() || 'Estándar',
        config_deseada: commandPayload,
        updated_at: new Date().toISOString()
      };

      await supabase.from('asignaciones_equipos').upsert(metaPayload, { onConflict: 'mac' });

      if (mqttExitoso) {
        setMsg(`⚡ ¡Configuración grabada en Flash LittleFS de [${cleanMac}] y sincronizada en Cloud!`);
      } else {
        setMsg(`⚠️ Guardado en Supabase, pero verifica la conexión MQTT con la placa.`);
      }
    } catch (err) {
      console.error('[SUPABASE ERROR]:', err);
      setMsg('Error en Supabase: ' + err.message);
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
      {/* 1. BARRA SUPERIOR: SELECCIÓN DE MODOS, VISTA Y ACCIONES                   */}
      {/* ========================================================================= */}
      <div className="ultra-glass p-4 rounded-2xl border border-amber-500/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              BioFleet AI Studio Enterprise
              {perfilActivoId && (
                <span className="px-2 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px]">
                  Cloud DB: #{perfilActivoId}
                </span>
              )}
            </h2>
            <p className="text-[11px] text-slate-300 font-sans">
              Diseño integral de hardware desde cero, escáner I2C en vivo, lienzo libre y Flash LittleFS.
            </p>
          </div>
        </div>

        {/* PESTAÑAS Y CONTROLES MAESTROS */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex p-0.5 bg-slate-950 border border-slate-800 rounded-xl">
            <button
              onClick={() => setActiveTab('STUDIO')}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'STUDIO' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Lienzo & Widgets</span>
            </button>
            <button
              onClick={() => setActiveTab('HARDWARE_I2C')}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'HARDWARE_I2C' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Hardware & Escáner I2C</span>
            </button>
            <button
              onClick={() => setActiveTab('BIBLIOTECA')}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'BIBLIOTECA' ? 'bg-emerald-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Nube ({perfilesGuardados.length})</span>
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
              <span>{modoEdicion ? '🛠️ Salir de Edición' : '🛠️ Modo Edición (Drag/Resize)'}</span>
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
      {/* 2. PESTAÑA A: LIENZO GRÁFICO & WIDGET DESIGNER                            */}
      {/* ========================================================================= */}
      {activeTab === 'STUDIO' && (
        <div className="space-y-4">
          
          {/* COPILOT IA */}
          <div className="ultra-glass p-4 rounded-2xl border border-amber-500/30 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-amber-300 font-bold uppercase text-[11px] flex items-center gap-1.5">
                <Wand2 className="w-3.5 h-3.5" />
                Copilot de IA: {modoIaRefinar ? 'Refinar sobre widgets existentes' : 'Crear automatización desde cero'}
              </span>
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

            <div className="flex gap-2">
              <textarea
                rows={2}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ej: Ambulancia Hyundai Staria con arranque remoto inteligente, corte de ignición en R1, starter en R2..."
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
          </div>

          {/* BARRA DE IDENTIDAD Y DESTINO MQTT */}
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
                <span>{perfilActivoId ? 'Actualizar Cloud' : 'Guardar en Supabase'}</span>
              </button>

              <div className="flex items-center gap-1.5">
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
                  onClick={() => handleDesplegarADispositivo(false)}
                  disabled={transmitting || !selectedMac}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90 text-white font-bold rounded-lg flex items-center gap-1.5 shadow-md disabled:opacity-40"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{transmitting ? 'Enviando...' : 'Desplegar a Placa'}</span>
                </button>
              </div>
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
                {modoEdicion
                  ? '🛠️ MODO EDICIÓN: Arrastra desde la barra superior y usa la esquina inferior para redimensionar libremente'
                  : '👁️ MODO OPERADOR: Toca cualquier botón para conmutar su relé en vivo'}
              </span>
            </div>

            {widgets.length === 0 ? (
              <div className="py-12 border-2 border-dashed border-slate-800 rounded-xl text-center text-slate-500 space-y-2">
                <Sparkles className="w-8 h-8 mx-auto text-amber-500/30" />
                <p>Escribe tu automatización arriba y pulsa "Generar IA" o pulsa "+ Agregar Widget".</p>
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
                          w.color === 'purple' ? 'border-purple-500/40 text-purple-300' :
                          'border-cyan-500/40 text-cyan-300'
                        }`}
                      >
                        {/* 1. BARRA SUPERIOR: EXCLUSIVA PARA DRAG (NO BLOQUEA CLICKS ABAJO) */}
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
                            <div className="flex items-center gap-1 shrink-0" onPointerDown={(e) => e.stopPropagation()}>
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

                        {/* 2. CUERPO INTERACTIVO DEL WIDGET CON CONMUTACIÓN DIRECTA */}
                        <div 
                          className="flex-1 p-2.5 flex flex-col items-center justify-center overflow-hidden"
                          onPointerDown={(e) => e.stopPropagation()} // Permite clicks sin disparar arrastre
                        >
                          {/* PANEL DE EDICIÓN INLINE CUANDO ESTÁ SELECCIONADO */}
                          {modoEdicion && isEditingThis ? (
                            <div className="w-full h-full overflow-y-auto space-y-2 p-1 text-[10px] bg-slate-950/90 rounded-lg">
                              <div>
                                <span className="block text-slate-400">Título:</span>
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
                                  <span className="block text-slate-400">Tipo:</span>
                                  <select
                                    value={w.tipo}
                                    onChange={(e) => {
                                      const next = [...widgets];
                                      next[idx].tipo = e.target.value;
                                      setWidgets(next);
                                    }}
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-cyan-300 font-bold"
                                  >
                                    <option value="ACTION_BUTTON">🔘 Botón Relé</option>
                                    <option value="SWITCH_TOGGLE">🎚️ Switch ON/OFF</option>
                                    <option value="GAUGE_RADIAL">🧭 Gauge Aguja</option>
                                    <option value="VALUE_CARD">🔢 Valor Numérico</option>
                                    <option value="STATUS_LED">💡 Indicador LED</option>
                                  </select>
                                </div>

                                <div>
                                  <span className="block text-slate-400">Relé HKL 0x24:</span>
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
                                      <option key={n} value={n}>
                                        R{n} ({nombresReles[`R${n}`] || `Relé ${n}`})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-1.5">
                                <div>
                                  <span className="block text-slate-400">Color:</span>
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
                                <div>
                                  <span className="block text-slate-400">Unidad:</span>
                                  <input
                                    type="text"
                                    placeholder="bar, V, °C"
                                    value={w.unidad || ''}
                                    onChange={(e) => {
                                      const next = [...widgets];
                                      next[idx].unidad = e.target.value;
                                      setWidgets(next);
                                    }}
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-white"
                                  />
                                </div>
                              </div>
                            </div>
                          ) : (
                            /* MODO VISUAL INTERACTIVO CON CLICKS EN VIVO */
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
                                  <span className="text-2xl font-bold font-mono tracking-tight text-white">
                                    {getValorMockRealista(w)}
                                  </span>
                                  <span className="text-[10px] text-slate-400 ml-1">{w.unidad || 'bar'}</span>
                                  <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden mt-1.5 border border-slate-800">
                                    <div className="bg-current h-full w-2/3 rounded-full"></div>
                                  </div>
                                  <span className="block text-[8px] text-slate-500 mt-1">R{w.canal || 1} • Salida Asignada</span>
                                </div>
                              )}

                              {w.tipo === 'VALUE_CARD' && (
                                <div className="text-center">
                                  <span className="text-2xl font-bold font-mono tracking-tight text-white">
                                    {getValorMockRealista(w)}
                                  </span>
                                  <span className="text-xs text-slate-400 ml-1">{w.unidad || '°C'}</span>
                                  <span className="block text-[8px] text-slate-500 mt-0.5">{w.titulo}</span>
                                </div>
                              )}

                              {w.tipo === 'STATUS_LED' && (
                                <div className="flex items-center gap-2">
                                  <span className={`w-3 h-3 rounded-full ${isRelayActive ? 'bg-emerald-400 animate-ping' : 'bg-slate-700'}`}></span>
                                  <span className="font-bold text-xs">{isRelayActive ? 'ACTIVO (ON)' : 'STANDBY (OFF)'}</span>
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {/* 3. TIRADOR INFERIOR DERECHO: REDIMENSIONAMIENTO LIBRE TÁCTIL/MOUSE */}
                        {modoEdicion && (
                          <div
                            onPointerDown={(e) => handlePointerDown(e, idx, 'RESIZE')}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            title="Tira con el dedo o mouse para redimensionar libremente"
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
      {/* 3. PESTAÑA B: CENTRO DE PROVISIÓN HARDWARE & ESCÁNER I2C EN VIVO          */}
      {/* ========================================================================= */}
      {activeTab === 'HARDWARE_I2C' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            
            {/* PANEL IZQUIERDO: DEFINICIÓN DE HARDWARE DE SILICIO (PREFABRICADO vs DIY) */}
            <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-4">
              <div className="flex justify-between items-center border-b border-cyan-500/20 pb-2">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-cyan-400" />
                  Centro de Provisión de Hardware
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500 text-cyan-300 font-bold">
                  {modoHardware === 'PREFABRICADO' ? 'COMERCIAL' : 'DIY LIBRE'}
                </span>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Dirección MAC Física del Dispositivo</label>
                <input
                  type="text"
                  value={selectedMac}
                  onChange={(e) => setSelectedMac(e.target.value)}
                  placeholder="Ej: 244CABC731B7"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-bold focus:outline-none focus:border-cyan-400 uppercase text-xs"
                />
              </div>

              {/* MODALIDAD DE HARDWARE */}
              <div className="p-3 bg-slate-950/90 rounded-xl border border-cyan-500/40 space-y-3">
                <span className="text-cyan-400 font-bold block text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-amber-400" />
                  1. Modalidad de Hardware:
                </span>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setModoHardware('PREFABRICADO')}
                    className={`py-2 px-3 rounded-xl border font-bold text-xs flex flex-col items-center gap-1 transition-all ${
                      modoHardware === 'PREFABRICADO'
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400 shadow-lg shadow-cyan-500/20'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Cpu className="w-4 h-4" />
                    <span>Placa Pre-fabricada</span>
                    <span className="text-[9px] font-normal text-slate-400">(HKL-EA8, Kincony, etc.)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModoHardware('LIBRE_DIY')}
                    className={`py-2 px-3 rounded-xl border font-bold text-xs flex flex-col items-center gap-1 transition-all ${
                      modoHardware === 'LIBRE_DIY'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-400 shadow-lg shadow-amber-500/20'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Wrench className="w-4 h-4" />
                    <span>Placa Libre / DIY</span>
                    <span className="text-[9px] font-normal text-slate-400">(Mapeo Pin a Pin de Cero)</span>
                  </button>
                </div>

                {modoHardware === 'PREFABRICADO' ? (
                  <div className="space-y-2 pt-1 border-t border-slate-800">
                    <label className="text-slate-300 block mb-1">Modelo de Placa Comercial</label>
                    <select
                      value={placaPrefabricada}
                      onChange={(e) => setPlacaPrefabricada(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-cyan-300 font-bold"
                    >
                      {Object.keys(PLACAS_PREFABRICADAS).map((k) => (
                        <option key={k} value={k}>{PLACAS_PREFABRICADAS[k].nombre}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400 bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                      ℹ️ {PLACAS_PREFABRICADAS[placaPrefabricada]?.desc}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 pt-1 border-t border-slate-800">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-slate-300 block mb-1">Uplink Red</label>
                        <select
                          value={uplinkLibre}
                          onChange={(e) => setUplinkLibre(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-amber-300 text-[10px]"
                        >
                          <option value="ETHERNET_LAN8720">Ethernet LAN8720</option>
                          <option value="ETHERNET_W5500">Ethernet W5500</option>
                          <option value="WIFI">WiFi 2.4GHz</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-slate-300 block mb-1">SDA I2C</label>
                        <input
                          type="number"
                          value={pinSda}
                          onChange={(e) => setPinSda(Number(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1 text-white text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-slate-300 block mb-1">SCL I2C</label>
                        <input
                          type="number"
                          value={pinScl}
                          onChange={(e) => setPinScl(Number(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1 text-white text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* PERFIL DE MÁQUINA */}
              <div className="p-3 bg-slate-950/90 rounded-xl border border-cyan-500/40 space-y-3">
                <span className="text-cyan-400 font-bold block text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  2. Comportamiento & Perfil de Máquina:
                </span>

                <div>
                  <label className="block text-slate-300 mb-1 font-bold">Tipo / Categoría de Dispositivo</label>
                  <select
                    value={tipoEquipo}
                    onChange={(e) => handleTipoChange(e.target.value)}
                    className="w-full bg-slate-900 border border-cyan-500/60 rounded-lg p-2 text-cyan-300 font-bold text-xs"
                  >
                    {tiposDisponibles.map((t) => (
                      <option key={t} value={t}>{t.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-300 mb-1">Marca / Fabricante</label>
                    <select
                      value={marca}
                      onChange={(e) => handleMarcaChange(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-xs"
                    >
                      {marcasDisponibles.map((m) => (
                        <option key={m} value={m}>{m.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1">Modelo Específico</label>
                    <select
                      value={modelo}
                      onChange={(e) => setModelo(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-cyan-200 text-xs"
                    >
                      {modelosDisponibles.map((mod) => (
                        <option key={mod} value={mod}>{mod}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {tipoEquipo === 'VEHICULO' && (
                  <div>
                    <label className="block text-slate-300 mb-1">Duración Pulso Arranque / Starter (ms)</label>
                    <input
                      type="number"
                      step="100"
                      value={starterMs}
                      onChange={(e) => setStarterMs(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-amber-300 font-bold"
                    />
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleDesplegarADispositivo(false)}
                className="w-full py-3 bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:opacity-90 text-white font-bold rounded-xl text-xs shadow-lg shadow-cyan-500/25 uppercase tracking-wider"
              >
                ⚡ APROVISIONAR HARDWARE Y APLICAR AL DISPOSITIVO
              </button>
            </div>

            {/* PANEL DERECHO: ESCÁNER I2C EN VIVO & MAPEO DE CHIPS */}
            <div className="ultra-glass p-5 rounded-2xl border border-amber-500/30 space-y-4">
              <div className="flex justify-between items-center border-b border-amber-500/20 pb-2">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-amber-400" />
                    Escáner I2C en Vivo & Chips Físicos
                  </h3>
                  <p className="text-[10px] text-slate-400">Detección física de direcciones PCF8574, ADS1115 y LCD</p>
                </div>

                <button
                  type="button"
                  onClick={handleScanI2C}
                  disabled={scanningI2C}
                  className="py-2 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md"
                >
                  <Search className={`w-3.5 h-3.5 ${scanningI2C ? 'animate-spin' : ''}`} />
                  <span>{scanningI2C ? 'Barrido en Marcha...' : '🔍 Escanear Bus I2C'}</span>
                </button>
              </div>

              {/* CHIPS DETECTADOS */}
              {chipsDetectados.length > 0 ? (
                <div className="space-y-2">
                  <span className="text-amber-400 font-bold text-[10px] uppercase">
                    Chips Detectados ({chipsDetectados.length}):
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {chipsDetectados.map(c => (
                      <div
                        key={c.dir}
                        onClick={() => setSelectedChipDir(c.dir)}
                        className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                          selectedChipDir === c.dir
                            ? 'bg-amber-950/60 border-amber-400 shadow-md'
                            : 'bg-slate-900 border-slate-800'
                        }`}
                      >
                        <span className="text-amber-400 font-bold text-xs">{c.dir}</span>
                        <p className="text-white text-[10px] truncate">{c.desc || c.tipo}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-center text-slate-500 text-[11px]">
                  Pulsa "Escanear Bus I2C" para que el ESP32 transmita los chips detectados.
                </div>
              )}

              {/* PROGRAMACIÓN DE SALIDAS RELÉS (0x24) CON BOTÓN TEST EN VIVO */}
              <div className="space-y-3 pt-2 border-t border-slate-800">
                <span className="text-cyan-400 font-bold block uppercase text-[11px] flex items-center gap-1.5">
                  <Layers className="w-4 h-4" />
                  1. Programación de Salidas (Relés 1 a 8 - Chip {addrRelays}):
                </span>

                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                    const isRelayOn = Boolean(liveRelayStates[num] || liveRelayStates[`R${num}`]);
                    return (
                      <div key={num} className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="text-white font-bold text-xs">Salida R{num}:</span>
                          <button
                            type="button"
                            onClick={() => handleToggleRelayDirecto(num, isRelayOn)}
                            className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${
                              isRelayOn 
                                ? 'bg-emerald-500 text-slate-950 shadow-[0_0_10px_#10b981]' 
                                : 'bg-slate-800 text-slate-300 hover:text-white'
                            }`}
                          >
                            {isRelayOn ? 'PROBANDO (ON)' : 'TEST (OFF)'}
                          </button>
                        </div>

                        <input
                          type="text"
                          value={nombresReles[`R${num}`] || ''}
                          onChange={(e) => setNombresReles(prev => ({ ...prev, [`R${num}`]: e.target.value }))}
                          placeholder="Nombre de esta salida..."
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-[11px]"
                        />

                        <select
                          value={rolesReles[`R${num}`] || 'MANUAL'}
                          onChange={(e) => setRolesReles(prev => ({ ...prev, [`R${num}`]: e.target.value }))}
                          className="w-full bg-slate-900 text-cyan-300 border border-slate-700 rounded px-2 py-1 text-[10px]"
                        >
                          <option value="IGNICION_ON">🚗 Ignición Vehículo (ACC/ON)</option>
                          <option value="STARTER_MOTOR">⚡ Starter Arranque (Pulso ms)</option>
                          <option value="INMOVILIZADOR">🛑 Inmovilizador / Corte Bomba</option>
                          <option value="SIRENA_LUCES">🚨 Sirena / Luces Auxiliares</option>
                          <option value="CALENTADOR">♨️ Calentador Vapor / Resistencias</option>
                          <option value="BOMBA_VACIO">💨 Bomba de Vacío / Secado</option>
                          <option value="PURGA_VAPOR">💧 Electroválvula de Purga</option>
                          <option value="MANUAL">⚪ Manual / Libre</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
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
      {/* 5. PESTAÑA D: MANIFIESTO JSON RAW                                         */}
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
}
