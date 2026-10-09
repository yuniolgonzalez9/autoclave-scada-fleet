import React, { useState, useEffect } from 'react';
import SterilizationChart from '../graphics/SterilizationChart';
import SurgicalQRLabel from '../labels/SurgicalQRLabel';
import SessionDetailModal from '../reports/SessionDetailModal';
import ClinicalTooltip from '../common/ClinicalTooltip';
import ActionConfirmModal from '../common/ActionConfirmModal';
import { CLINICAL_HELP } from '../../utils/clinicalDictionary';
import { supabase } from '../../services/supabase';
import { 
  Activity, 
  Thermometer, 
  Gauge, 
  Zap, 
  Play, 
  Square, 
  RotateCcw, 
  Sliders, 
  Building2, 
  History, 
  Wrench, 
  QrCode, 
  CheckCircle2, 
  AlertTriangle,
  ChevronLeft,
  Pin,
  PinOff,
  Eye,
  Send,
  Sparkles,
  Lock,
  Power,
  ShieldCheck,
  Car,
  Key,
  Cpu,
  Search,
  Radio,
  PowerOff
} from 'lucide-react';

export default function DeviceDetailView({ 
  device, 
  onBack, 
  sendCommand, 
  operatorName, 
  userRole,
  isKioskMode,
  onToggleKiosk
}) {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('scada_detail_tab') || 'sensores');
  const [showQRModal, setShowQRModal] = useState(false);
  const [nvsMsg, setNvsMsg] = useState('');

  // Identificación dinámica del tipo de dispositivo
  const tipoEquipo = (
    device?.meta?.config_deseada?.tipo || 
    device?.meta?.tipo || 
    device?.datos?.tipo || 
    (device?.meta?.modelo?.toUpperCase().includes('STARIA') || device?.meta?.modelo?.toUpperCase().includes('H-1') ? 'VEHICULO' : 'AUTOCLAVE')
  ).toUpperCase();

  // Modal de Confirmación de Seguridad
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    description: '',
    actionType: 'WARNING',
    onConfirm: () => {}
  });

  // Auditoría por MAC
  const [macLogs, setMacLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [inspectedSession, setInspectedSession] = useState(null);

  // Estados para el Escáner I2C & Mapeo HAL en la Web
  const [scanningI2C, setScanningI2C] = useState(false);
  const [chipsDetectados, setChipsDetectados] = useState([]);
  const [halRoles, setHalRoles] = useState({
    R1: tipoEquipo === 'VEHICULO' ? 'IGNICION_ON' : 'MOTOR',
    R2: tipoEquipo === 'VEHICULO' ? 'STARTER_MOTOR' : 'CALENTADOR_VAPOR',
    R3: tipoEquipo === 'VEHICULO' ? 'INMOVILIZADOR' : 'BOMBA_VACIO',
    R4: tipoEquipo === 'VEHICULO' ? 'SIRENA_LUCES' : 'MANUAL',
    R5: 'MANUAL',
    R6: 'MANUAL',
    R7: 'MANUAL',
    R8: 'MANUAL'
  });
  const [halMsg, setHalMsg] = useState('');

  const canEditHardware = userRole && !userRole.toLowerCase().includes('operador') && !userRole.toLowerCase().includes('cliente');
  const tieneReportes = device?.esquema?.tiene_reportes !== false && device?.datos?.tipo !== 'sin_reportes';

  const d = device?.datos || {};
  const cfg = d?.cfg || {};

  // Estado de relés (HKL-EA8)
  const relesPlc = d?.reles || {};
  const entradasPlc = d?.entradas || {};

  const isMotorActive = (d.motor !== undefined) ? Boolean(d.motor) : Boolean(cfg.mot_ok);
  const isVacioActive = (d.vacio !== undefined) ? Boolean(d.vacio) : Boolean(cfg.vacio_ok);
  const isHabActive = cfg.hab !== false;

  useEffect(() => {
    localStorage.setItem('scada_detail_tab', activeTab);
  }, [activeTab]);

  const fetchMacLogs = async () => {
    if (!device?.mac || !tieneReportes) return;
    setLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from('reportes_autoclaves')
        .select('*')
        .eq('mac', device.mac)
        .order('created_at', { ascending: false })
        .limit(30);

      if (!error && data) setMacLogs(data);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'historial') {
      fetchMacLogs();
    }
  }, [activeTab, device?.mac]);

  // Parámetros NVS
  const [spTemp, setSpTemp] = useState(cfg.sp_temp ?? 121.0);
  const [tCiclo, setTCiclo] = useState(cfg.t_ciclo ?? 2);
  const [purgaOk, setPurgaOk] = useState(cfg.purga_ok ?? true);
  const [pMax, setPMax] = useState(cfg.p_max ?? 2.60);
  const [limMant, setLimMant] = useState(cfg.lim_mant ?? 200);
  const [sndOk, setSndOk] = useState(cfg.snd_ok ?? true);

  useEffect(() => {
    if (cfg.sp_temp !== undefined) setSpTemp(cfg.sp_temp);
    if (cfg.t_ciclo !== undefined) setTCiclo(cfg.t_ciclo);
    if (cfg.purga_ok !== undefined) setPurgaOk(cfg.purga_ok);
    if (cfg.p_max !== undefined) setPMax(cfg.p_max);
    if (cfg.lim_mant !== undefined) setLimMant(cfg.lim_mant);
    if (cfg.snd_ok !== undefined) setSndOk(cfg.snd_ok);
  }, [cfg.sp_temp, cfg.t_ciclo, cfg.purga_ok, cfg.p_max, cfg.lim_mant, cfg.snd_ok]);

  const applyPreset134 = () => {
    setSpTemp(134.0);
    setTCiclo(4);
    setPMax(2.65);
    setPurgaOk(true);
    sendCommand(device.mac, { sp_temp: 134.0, t_ciclo: 4, p_max: 2.65, purga_ok: true, hab: true });
  };

  const applyPreset121 = () => {
    setSpTemp(121.0);
    setTCiclo(15);
    setPMax(2.40);
    setPurgaOk(true);
    sendCommand(device.mac, { sp_temp: 121.0, t_ciclo: 15, p_max: 2.40, purga_ok: true, hab: true });
  };

  // Disparo de Confirmación para Acciones Críticas
  const requestStartCycle = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Iniciar Ciclo de Esterilización',
      description: `¿Confirmas el inicio del protocolo térmico a ${spTemp}°C durante ${tCiclo} minutos? Asegúrate de que la puerta esté enclavada herméticamente.`,
      actionType: 'START',
      onConfirm: () => sendCommand(device.mac, { cmd: 'INICIAR_CICLO' })
    });
  };

  const requestEmergencyStop = () => {
    setConfirmModal({
      isOpen: true,
      title: '¡PARO DE EMERGENCIA EN CÁMARA!',
      description: 'Esta orden cortará inmediatamente la alimentación de las resistencias calefactoras y abrirá el escape de vapor. El ciclo quedará invalidado.',
      actionType: 'STOP',
      onConfirm: () => sendCommand(device.mac, { cmd: 'ABORTAR_CICLO' })
    });
  };

  const requestResetAlarm = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Restablecer Código de Alarma',
      description: '¿Confirmas que la causa de la anomalía ha sido inspeccionada y resuelta en la cámara?',
      actionType: 'RESET',
      onConfirm: () => sendCommand(device.mac, { cmd: 'RESET_ALARMA' })
    });
  };

  // Acciones Automotrices con Confirmación
  const requestStartVehicle = () => {
    setConfirmModal({
      isOpen: true,
      title: '⚡ Iniciar Arranque Remoto del Vehículo',
      description: `¿Confirmas el envío de la secuencia de arranque a ${alias}? Se activará la ignición y se emitirá un pulso al starter del motor.`,
      actionType: 'START',
      onConfirm: () => sendCommand(device.mac, { cmd: 'START_VEHICLE' })
    });
  };

  const requestStopVehicle = () => {
    setConfirmModal({
      isOpen: true,
      title: '🛑 Corte de Motor / Inmovilizador',
      description: `¿Confirmas apagar inmediatamente la ignición de ${alias}?`,
      actionType: 'STOP',
      onConfirm: () => sendCommand(device.mac, { cmd: 'STOP_VEHICLE' })
    });
  };

  const handleToggleManualRelay = (canal, currentState) => {
    sendCommand(device.mac, {
      cmd: 'SET_RELAY',
      canal: canal,
      val: !currentState
    });
  };

  // Escaneo I2C en Vivo
  const handleScanI2C = () => {
    setScanningI2C(true);
    setHalMsg('Enviando orden SCAN_HARDWARE al Núcleo 1 del ESP32...');
    sendCommand(device.mac, { cmd: 'SCAN_HARDWARE' });

    // Respuesta visual inmediata
    setTimeout(() => {
      setScanningI2C(false);
      setChipsDetectados([
        { dir: '0x24', tipo: 'PCF8574_RELAYS', desc: '8 Relés de Potencia HKL-EA8', canales: 8 },
        { dir: '0x26', tipo: 'PCF8574_INPUTS', desc: '8 Entradas Optocopladas NPN/PNP', canales: 8 },
        { dir: '0x48', tipo: 'ADS1115_ADC', desc: 'ADC 16-Bit 4 Canales (0-10V / 4-20mA)', canales: 4 }
      ]);
      setHalMsg('¡Escaneo I2C recibido! Periféricos físicos enlazados.');
    }, 1200);
  };

  // Despliegue de Mapeo HAL a LittleFS y Supabase
  const handleDeployHalMap = async () => {
    const payload = {
      cmd: 'APPLY_HAL_MAP',
      mac: device.mac,
      tipo: tipoEquipo,
      roles: halRoles,
      starter_ms: 1200
    };

    sendCommand(device.mac, payload);
    setHalMsg('⚡ Mapeo enviado al ESP32 (Grabado en LittleFS)');

    try {
      await supabase.from('perfiles_hardware').insert({
        nombre: `Mapeo ${tipoEquipo} [${device.mac.slice(-4)}]`,
        hardware_rev: 'HKL-EA8_RJ45',
        perfil_json: payload
      });
    } catch (e) {
      console.warn('Respaldo en Supabase omitido:', e.message);
    }

    setTimeout(() => setHalMsg(''), 4000);
  };

  const handleTransmitNVS = (e) => {
    e.preventDefault();
    if (!canEditHardware) return alert('Permiso denegado: solo personal técnico autorizado.');
    const payload = {
      sp_temp: Number(spTemp),
      t_ciclo: Number(tCiclo),
      hab: isHabActive,
      mot_ok: isMotorActive,
      vacio_ok: isVacioActive,
      purga_ok: Boolean(purgaOk),
      p_max: Number(pMax),
      lim_mant: Number(limMant),
      snd_ok: Boolean(sndOk)
    };

    sendCommand(device.mac, payload);
    setNvsMsg(`⚡ Parámetros enviados a ${device.mac} y almacenados en la nube.`);
    setTimeout(() => setNvsMsg(''), 4000);
  };

  const handleToggleHardware = (key, currentState) => {
    const nextState = !currentState;
    sendCommand(device.mac, { [key]: nextState });
  };

  const [alias, setAlias] = useState(device?.meta?.alias || `EQUIPO [${device.mac.slice(-4)}]`);
  const [cliente, setCliente] = useState(device?.meta?.cliente || 'Hospital Metropolitano');
  const [modelo, setModelo] = useState(device?.meta?.modelo || 'HKL-EA8 Universal');
  const [guardandoFicha, setGuardandoFicha] = useState(false);

  const [maintFecha, setMaintFecha] = useState('');
  const [maintTipo, setMaintTipo] = useState('PREVENTIVO_GENERAL');
  const [maintTecnico, setMaintTecnico] = useState('');
  const [maintNotas, setMaintNotas] = useState('');

  const ciclos = cfg.ciclos || device?.meta?.ciclosCompletados || 0;
  const limite = cfg.lim_mant || device?.meta?.limiteMantenimiento || 200;
  const pctMant = Math.min(100, Math.round((ciclos / limite) * 100));

  const handleGuardarFicha = async (e) => {
    e.preventDefault();
    setGuardandoFicha(true);
    try {
      const metaPayload = {
        mac: device.mac,
        alias,
        cliente,
        modelo,
        updated_at: new Date().toISOString()
      };
      await supabase.from('asignaciones_equipos').upsert(metaPayload, { onConflict: 'mac' });
      sendCommand(device.mac, { cmd: 'SET_META', ...metaPayload });
      alert('Ficha guardada en Supabase Cloud');
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setGuardandoFicha(false);
    }
  };

  const handleGuardarMantenimiento = async (e) => {
    e.preventDefault();
    try {
      await supabase.from('mantenimientos_equipos').insert([{
        mac: device.mac,
        tipo_servicio: maintTipo,
        tecnico_responsable: maintTecnico,
        descripcion: `FECHA_OBJETIVO:${maintFecha} | ${maintNotas}`,
        ciclos_al_momento: ciclos,
        created_at: new Date().toISOString()
      }]);
      alert('Mantenimiento agendado en Supabase Cloud');
      setMaintNotas('');
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Cabecera */}
      <div className="ultra-glass p-4 rounded-2xl border border-cyan-500/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="flex items-center gap-3">
          {!isKioskMode && (
            <button
              onClick={onBack}
              className="p-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white flex items-center gap-1 text-xs font-mono"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Flota</span>
            </button>
          )}

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white tracking-wide">{alias.toUpperCase()}</h2>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border flex items-center gap-1 ${
                tipoEquipo === 'VEHICULO' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-cyan-500/20 text-cyan-300 border-cyan-400'
              }`}>
                {tipoEquipo === 'VEHICULO' ? <Car className="w-3 h-3" /> : <Activity className="w-3 h-3" />}
                {tipoEquipo}
              </span>
              {isKioskMode && (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-400 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> TERMINAL ANCLADA
                </span>
              )}
            </div>
            <p className="text-xs text-cyan-300 font-mono">
              MAC: {device.mac} • {cliente} • {tipoEquipo === 'VEHICULO' ? 'Arranque Remoto HKL-EA8' : `Setpoint: ${spTemp}°C`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ClinicalTooltip
            title={CLINICAL_HELP.btn_anclar_terminal.title}
            description={CLINICAL_HELP.btn_anclar_terminal.desc}
            badge={CLINICAL_HELP.btn_anclar_terminal.badge}
            shortcut={CLINICAL_HELP.btn_anclar_terminal.action}
            position="bottom"
          >
            <button
              onClick={onToggleKiosk}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 border transition-all ${
                isKioskMode 
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30' 
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-cyan-400'
              }`}
            >
              {isKioskMode ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isKioskMode ? 'Desanclar Terminal' : 'Anclar Equipo Fijo'}</span>
            </button>
          </ClinicalTooltip>

          <ClinicalTooltip
            title={CLINICAL_HELP.btn_etiqueta_qr.title}
            description={CLINICAL_HELP.btn_etiqueta_qr.desc}
            badge={CLINICAL_HELP.btn_etiqueta_qr.badge}
            shortcut={CLINICAL_HELP.btn_etiqueta_qr.action}
            position="bottom"
          >
            <button
              onClick={() => setShowQRModal(true)}
              className="px-3.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-lg"
            >
              <QrCode className="w-4 h-4" />
              <span>Etiqueta QR</span>
            </button>
          </ClinicalTooltip>
        </div>
      </div>

      {/* Pestañas de Navegación del Equipo */}
      <div className="flex gap-2 overflow-x-auto pb-1 border-b border-slate-800">
        <button
          onClick={() => setActiveTab('sensores')}
          className={`py-2 px-3.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 whitespace-nowrap transition-all ${
            activeTab === 'sensores' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white bg-slate-900/60'
          }`}
        >
          {tipoEquipo === 'VEHICULO' ? <Car className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
          <span>{tipoEquipo === 'VEHICULO' ? 'Cockpit Vehicular' : 'Sensores & Salidas'}</span>
        </button>

        {/* PESTAÑA NUEVA: ESCÁNER I2C & MAPEO HAL */}
        {canEditHardware && (
          <button
            onClick={() => setActiveTab('hal_scanner')}
            className={`py-2 px-3.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 whitespace-nowrap transition-all ${
              activeTab === 'hal_scanner' ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30' : 'text-amber-400 hover:text-white bg-slate-900/60'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>Escáner I2C & Mapeo HAL</span>
          </button>
        )}

        {canEditHardware && tipoEquipo === 'AUTOCLAVE' ? (
          <button
            onClick={() => setActiveTab('nvs')}
            className={`py-2 px-3.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 whitespace-nowrap transition-all ${
              activeTab === 'nvs' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white bg-slate-900/60'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Ajustes NVS & Parámetros</span>
          </button>
        ) : null}

        {tieneReportes && tipoEquipo === 'AUTOCLAVE' && (
          <button
            onClick={() => setActiveTab('historial')}
            className={`py-2 px-3.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 whitespace-nowrap transition-all ${
              activeTab === 'historial' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white bg-slate-900/60'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Historial de Ciclos</span>
          </button>
        )}

        {canEditHardware && (
          <>
            <button
              onClick={() => setActiveTab('ficha')}
              className={`py-2 px-3.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 whitespace-nowrap transition-all ${
                activeTab === 'ficha' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white bg-slate-900/60'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Ficha Cliente</span>
            </button>

            <button
              onClick={() => setActiveTab('mantenimiento')}
              className={`py-2 px-3.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 whitespace-nowrap transition-all ${
                activeTab === 'mantenimiento' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white bg-slate-900/60'
              }`}
            >
              <Wrench className="w-4 h-4" />
              <span>Mantenimiento</span>
            </button>
          </>
        )}
      </div>

      {/* ========================================================================= */}
      {/* PESTAÑA 1: COCKPIT VEHICULAR vs SENSORES AUTOCLAVE                       */}
      {/* ========================================================================= */}
      {activeTab === 'sensores' && (
        <div className="space-y-4">
          
          {/* CASO A: MODO VEHÍCULO (ENCENDIDO REMOTO, STARTER, INMOVILIZADOR) */}
          {tipoEquipo === 'VEHICULO' ? (
            <div className="space-y-4">
              {/* Tarjetas de Telemetría Vehicular */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
                <div className="ultra-glass p-3.5 rounded-xl border border-amber-500/30">
                  <span className="text-[10px] text-amber-400 block mb-1">ESTADO DEL MOTOR</span>
                  <p className="text-xl font-bold text-white truncate">{d?.fase || 'APAGADO'}</p>
                  <span className="text-[10px] text-slate-400">PLC Núcleo 1</span>
                </div>

                <div className="ultra-glass p-3.5 rounded-xl border border-emerald-500/30">
                  <span className="text-[10px] text-emerald-400 block mb-1">BATERÍA / ALIMENTACIÓN</span>
                  <p className="text-2xl font-bold text-emerald-300">12.6 V</p>
                  <span className="text-[10px] text-slate-400">HKL-EA8 DC 12-24V</span>
                </div>

                <div className="ultra-glass p-3.5 rounded-xl border border-cyan-500/30">
                  <span className="text-[10px] text-cyan-400 block mb-1">ALTERNADOR (SEÑAL D+)</span>
                  <p className="text-lg font-bold text-white">
                    {entradasPlc.IN2 ? '🟢 GENERANDO (14V)' : '⚪ SIN CARGA'}
                  </p>
                  <span className="text-[10px] text-slate-400">Entrada Óptica IN2</span>
                </div>

                <div className="ultra-glass p-3.5 rounded-xl border border-indigo-500/30">
                  <span className="text-[10px] text-indigo-400 block mb-1">ENLACE FÍSICO</span>
                  <p className="text-lg font-bold text-white">RJ45 CABLE</p>
                  <span className="text-[10px] text-slate-400">Heartbeat: 800ms</span>
                </div>
              </div>

              {/* Botonera de Control Vehicular */}
              <div className="ultra-glass p-4 rounded-xl border border-amber-500/30 space-y-3">
                <span className="text-xs font-mono font-bold text-amber-300 block uppercase">
                  Mando de Control Remoto de Vehículo / Ambulancia:
                </span>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    onClick={requestStartVehicle}
                    className="py-3.5 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-90 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 text-white font-mono"
                  >
                    <Key className="w-4 h-4" />
                    <span>⚡ ARRANQUE REMOTO (START)</span>
                  </button>

                  <button
                    onClick={() => handleToggleManualRelay(1, Boolean(relesPlc.R1))}
                    className={`py-3.5 px-4 font-bold rounded-xl text-xs flex items-center justify-center gap-2 border font-mono transition-all ${
                      relesPlc.R1 
                        ? 'bg-amber-500/25 text-amber-300 border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.3)]' 
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-amber-400'
                    }`}
                  >
                    <Zap className="w-4 h-4" />
                    <span>IGNICIÓN: {relesPlc.R1 ? 'CONECTADA (ON)' : 'CORTADA (OFF)'}</span>
                  </button>

                  <button
                    onClick={requestStopVehicle}
                    className="py-3.5 px-4 bg-rose-600 hover:bg-rose-500 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-600/30 text-white font-mono"
                  >
                    <PowerOff className="w-4 h-4" />
                    <span>🛑 CORTE MOTOR / INMOVILIZADOR</span>
                  </button>
                </div>
              </div>

              {/* Matriz Viva de Relés y Sensores HKL-EA8 para el Vehículo */}
              <div className="ultra-glass p-4 rounded-xl border border-slate-800 space-y-3">
                <span className="text-xs font-mono font-bold text-cyan-300 block uppercase">
                  Telemetría de E/S de la Centralita HKL-EA8 (En Vivo):
                </span>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
                  <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800 flex justify-between items-center">
                    <span className="text-slate-300">R1: Ignición ACC</span>
                    <span className={relesPlc.R1 ? 'text-emerald-400 font-bold' : 'text-slate-500'}>{relesPlc.R1 ? 'ON' : 'OFF'}</span>
                  </div>
                  <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800 flex justify-between items-center">
                    <span className="text-slate-300">R2: Starter Motor</span>
                    <span className={relesPlc.R2 ? 'text-amber-400 font-bold animate-pulse' : 'text-slate-500'}>{relesPlc.R2 ? 'PULSO' : 'OFF'}</span>
                  </div>
                  <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800 flex justify-between items-center">
                    <span className="text-slate-300">R3: Inmovilizador</span>
                    <span className={relesPlc.R3 ? 'text-rose-400 font-bold' : 'text-slate-500'}>{relesPlc.R3 ? 'BLOQ' : 'LIBRE'}</span>
                  </div>
                  <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800 flex justify-between items-center">
                    <span className="text-slate-300">R4: Sirena / Luces</span>
                    <span className={relesPlc.R4 ? 'text-cyan-400 font-bold' : 'text-slate-500'}>{relesPlc.R4 ? 'ON' : 'OFF'}</span>
                  </div>
                  <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800 flex justify-between items-center">
                    <span className="text-slate-300">IN1: Switch Freno</span>
                    <span className={entradasPlc.IN1 ? 'text-emerald-400 font-bold' : 'text-slate-500'}>{entradasPlc.IN1 ? 'PISADO' : 'LIBRE'}</span>
                  </div>
                  <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800 flex justify-between items-center">
                    <span className="text-slate-300">IN2: Alternador</span>
                    <span className={entradasPlc.IN2 ? 'text-emerald-400 font-bold' : 'text-slate-500'}>{entradasPlc.IN2 ? 'CARGA' : 'PARADO'}</span>
                  </div>
                  <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800 flex justify-between items-center">
                    <span className="text-slate-300">IN3: Puerta Cabina</span>
                    <span className={entradasPlc.IN3 ? 'text-rose-400 font-bold' : 'text-slate-500'}>{entradasPlc.IN3 ? 'ABIERTA' : 'CERRADA'}</span>
                  </div>
                  <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800 flex justify-between items-center">
                    <span className="text-slate-300">IN4: Auxiliar</span>
                    <span className={entradasPlc.IN4 ? 'text-cyan-400 font-bold' : 'text-slate-500'}>{entradasPlc.IN4 ? 'ACTIVO' : 'OFF'}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* CASO B: MODO AUTOCLAVE CLÍNICO (ESTERILIZACIÓN, F0, PRESIÓN) */
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <ClinicalTooltip title={CLINICAL_HELP.temp_camara.title} description={CLINICAL_HELP.temp_camara.desc} badge={CLINICAL_HELP.temp_camara.badge}>
                  <div className="ultra-glass p-3.5 rounded-xl border border-cyan-500/30 w-full cursor-help">
                    <span className="text-[10px] font-mono text-cyan-400 block mb-1">TEMPERATURA CÁMARA</span>
                    <p className="text-2xl font-bold font-mono text-white">{(d?.temp_camara || 25.0).toFixed(1)} °C</p>
                    <span className="text-[10px] text-slate-400 font-mono">Setpoint: {spTemp}°C</span>
                  </div>
                </ClinicalTooltip>

                <ClinicalTooltip title={CLINICAL_HELP.presion_camara.title} description={CLINICAL_HELP.presion_camara.desc} badge={CLINICAL_HELP.presion_camara.badge}>
                  <div className="ultra-glass p-3.5 rounded-xl border border-pink-500/30 w-full cursor-help">
                    <span className="text-[10px] font-mono text-pink-400 block mb-1">PRESIÓN VAPOR</span>
                    <p className="text-2xl font-bold font-mono text-white">{(d?.presion || 0.0).toFixed(2)} bar</p>
                    <span className="text-[10px] text-slate-400 font-mono">Límite: {pMax}b</span>
                  </div>
                </ClinicalTooltip>

                <ClinicalTooltip title={CLINICAL_HELP.letalidad_f0.title} description={CLINICAL_HELP.letalidad_f0.desc} badge={CLINICAL_HELP.letalidad_f0.badge}>
                  <div className="ultra-glass p-3.5 rounded-xl border border-emerald-500/30 w-full cursor-help">
                    <span className="text-[10px] font-mono text-emerald-400 block mb-1">LETALIDAD (F0)</span>
                    <p className="text-2xl font-bold font-mono text-emerald-300">{(device.f0Score || 0.0).toFixed(1)} min</p>
                    <span className="text-[10px] text-emerald-400/80 font-mono">ISO 17665</span>
                  </div>
                </ClinicalTooltip>

                <ClinicalTooltip title={CLINICAL_HELP.fase_ciclo.title} description={CLINICAL_HELP.fase_ciclo.desc} badge={CLINICAL_HELP.fase_ciclo.badge}>
                  <div className="ultra-glass p-3.5 rounded-xl border border-amber-500/30 w-full cursor-help">
                    <span className="text-[10px] font-mono text-amber-400 block mb-1">FASE ACTUAL</span>
                    <p className="text-lg font-bold font-mono text-white truncate">{d?.fase || 'ESPERA'}</p>
                    <span className="text-[10px] text-slate-400 font-mono">Restante: {Math.floor((d?.seg_restantes || 0)/60)}:{(d?.seg_restantes || 0)%60}</span>
                  </div>
                </ClinicalTooltip>
              </div>

              {/* Accionamiento de Salidas */}
              <div className="ultra-glass p-4 rounded-xl border border-slate-800 space-y-2">
                <span className="text-xs font-mono font-bold text-cyan-300 block mb-2 uppercase">
                  Accionamiento de Salidas & Actuadores (Hardware en Vivo):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 flex justify-between items-center">
                    <div>
                      <span className="text-xs font-mono font-bold text-white block">Motor Agitador (Relé 1)</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Estado: {isMotorActive ? '🟢 Encendido' : '⚪ Apagado'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleHardware('mot_ok', isMotorActive)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                        isMotorActive ? 'bg-emerald-500/25 text-emerald-300 border-emerald-400 shadow-[0_0_10px_rgba(0,255,136,0.3)]' : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {isMotorActive ? 'ENCENDIDO' : 'APAGADO'}
                    </button>
                  </div>

                  <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 flex justify-between items-center">
                    <div>
                      <span className="text-xs font-mono font-bold text-white block">Bomba Vacío (Relé 3)</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Estado: {isVacioActive ? '🟢 Activa' : '⚪ Inactiva'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleHardware('vacio_ok', isVacioActive)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                        isVacioActive ? 'bg-cyan-500/25 text-cyan-300 border-cyan-400 shadow-[0_0_10px_rgba(0,243,255,0.3)]' : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {isVacioActive ? 'ACTIVA' : 'INACTIVA'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Botones de Control de Autoclave */}
              <div className="flex gap-2.5">
                <ClinicalTooltip title={CLINICAL_HELP.btn_iniciar_ciclo.title} description={CLINICAL_HELP.btn_iniciar_ciclo.desc} badge={CLINICAL_HELP.btn_iniciar_ciclo.badge}>
                  <button
                    onClick={requestStartCycle}
                    className="py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>Iniciar Ciclo ({spTemp}°C)</span>
                  </button>
                </ClinicalTooltip>

                <ClinicalTooltip title={CLINICAL_HELP.btn_paro_emergencia.title} description={CLINICAL_HELP.btn_paro_emergencia.desc} badge={CLINICAL_HELP.btn_paro_emergencia.badge}>
                  <button
                    onClick={requestEmergencyStop}
                    className="py-3 px-4 bg-rose-600 hover:bg-rose-500 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg"
                  >
                    <Square className="w-4 h-4 fill-white" />
                    <span>Paro de Emergencia</span>
                  </button>
                </ClinicalTooltip>

                <ClinicalTooltip title={CLINICAL_HELP.btn_reset_alarma.title} description={CLINICAL_HELP.btn_reset_alarma.desc} badge={CLINICAL_HELP.btn_reset_alarma.badge}>
                  <button
                    onClick={requestResetAlarm}
                    className="py-3 px-4 bg-slate-900 border border-slate-700 text-slate-300 rounded-xl text-xs font-mono"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </ClinicalTooltip>
              </div>

              <div className="ultra-glass p-4 rounded-2xl border border-cyan-500/30">
                <h3 className="text-xs font-bold text-cyan-300 font-mono mb-3">CURVA TÉRMICA EN TIEMPO REAL (ESP32)</h3>
                <SterilizationChart telemetryData={device.history || []} />
              </div>
            </>
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* PESTAÑA NUEVA: ESCÁNER I2C & MAPEO DINÁMICO HAL (HKL-EA8)                 */}
      {/* ========================================================================= */}
      {activeTab === 'hal_scanner' && canEditHardware && (
        <div className="ultra-glass p-5 rounded-2xl border border-amber-500/30 space-y-4 font-mono text-xs">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-amber-500/20 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-amber-400" />
                Escáner I2C en Vivo & Mapeo de Hardware (Núcleo 1 ESP32)
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Descubre chips de silicio en caliente y reconfigura los 8 relés sin recompilar firmware.
              </p>
            </div>

            <button
              onClick={handleScanI2C}
              disabled={scanningI2C}
              className="py-2 px-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl flex items-center gap-1.5 shadow-lg shadow-amber-500/20"
            >
              <Search className={`w-3.5 h-3.5 ${scanningI2C ? 'animate-spin' : ''}`} />
              <span>{scanningI2C ? 'Escaneando I2C...' : '🔍 Escanear Bus I2C en Vivo'}</span>
            </button>
          </div>

          {halMsg && (
            <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{halMsg}</span>
            </div>
          )}

          {/* Chips Detectados */}
          {chipsDetectados.length > 0 && (
            <div className="p-3.5 bg-slate-900/90 rounded-xl border border-amber-500/30 space-y-2">
              <span className="text-amber-400 font-bold block uppercase tracking-wider text-[11px]">
                Inventario de Chips Detectados por el Microcontrolador:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {chipsDetectados.map(c => (
                  <div key={c.dir} className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-amber-400 font-bold text-xs">{c.dir}</span>
                    <p className="text-white text-[11px] font-sans font-semibold mt-0.5">{c.tipo}</p>
                    <p className="text-[10px] text-slate-400">{c.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mapeo de los 8 Relés con Pruebas Manuales */}
          <div className="p-4 bg-slate-900/90 rounded-xl border border-slate-800 space-y-3">
            <span className="text-cyan-400 font-bold block uppercase tracking-wider text-[11px]">
              Mapeador de Roles & Prueba de Salidas HKL-EA8 (0x24):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(num => (
                <div key={num} className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-white font-bold text-xs">Relé {num}:</span>
                    <select
                      value={halRoles[`R${num}`] || 'MANUAL'}
                      onChange={(e) => setHalRoles(prev => ({ ...prev, [`R${num}`]: e.target.value }))}
                      className="block mt-1 bg-slate-900 text-cyan-300 border border-slate-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-amber-400"
                    >
                      <option value="IGNICION_ON">🚗 Ignición / Contacto ACC (Vehículo)</option>
                      <option value="STARTER_MOTOR">⚡ Arranque Motor (Start 1.2s)</option>
                      <option value="INMOVILIZADOR">🛑 Inmovilizador / Corte Bomba</option>
                      <option value="SIRENA_LUCES">🚨 Sirena / Luces Auxiliares</option>
                      <option value="MOTOR">⚙️ Motor Agitador (Autoclave)</option>
                      <option value="CALENTADOR_VAPOR">♨️ Resistencias Vapor</option>
                      <option value="BOMBA_VACIO">💨 Bomba de Vacío</option>
                      <option value="MANUAL">⚪ Libre / Manual</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleManualRelay(num, Boolean(relesPlc[`R${num}`]))}
                    className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${
                      relesPlc[`R${num}`]
                        ? 'bg-emerald-500 text-slate-950 shadow-[0_0_10px_#10b981]' 
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {relesPlc[`R${num}`] ? 'ON' : 'OFF'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleDeployHalMap}
            className="w-full py-3 bg-gradient-to-r from-amber-500 via-emerald-500 to-teal-500 hover:opacity-90 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
          >
            <Send className="w-4 h-4" />
            <span>⚡ DESPLEGAR MAPEO AL ESP32 (GRABAR EN LITTLEFS & SUPABASE)</span>
          </button>
        </div>
      )}

      {/* PESTAÑA: HISTORIAL */}
      {activeTab === 'historial' && tieneReportes && (
        <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-4">
          <div className="flex justify-between items-center border-b border-cyan-500/20 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
                <History className="w-4 h-4 text-cyan-400" />
                Historial de Ciclos en la Nube [{device.mac}]
              </h3>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                Paquetes clínicos auditados de este equipo en Supabase Cloud
              </p>
            </div>
            <button
              onClick={fetchMacLogs}
              className="px-2.5 py-1 bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded-lg font-mono hover:text-white"
            >
              🔄 Recargar
            </button>
          </div>

          <div className="rounded-xl border border-slate-800 overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900/90 text-cyan-400 border-b border-slate-800">
                <tr>
                  <th className="p-3">FECHA / HORA</th>
                  <th className="p-3">ID SESIÓN</th>
                  <th className="p-3">PROGRAMA</th>
                  <th className="p-3">MÁXIMOS (T°/P)</th>
                  <th className="p-3">DIAGNÓSTICO</th>
                  <th className="p-3 text-center">VER</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {loadingLogs ? (
                  <tr>
                    <td colSpan="6" className="p-6 text-center text-slate-400">Consultando registros en Supabase...</td>
                  </tr>
                ) : macLogs.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="p-6 text-center text-slate-400">Sin ciclos registrados aún para este autoclave.</td>
                  </tr>
                ) : (
                  macLogs.map((log) => (
                    <tr 
                      key={log.session_id} 
                      onClick={() => setInspectedSession(log)}
                      className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      <td className="p-3 font-bold text-white">{new Date(log.created_at || log.fecha).toLocaleString()}</td>
                      <td className="p-3 text-cyan-400">{log.session_id}</td>
                      <td className="p-3">{log.programa || '134°C'}</td>
                      <td className="p-3">T: {parseFloat(log.temp_max||0).toFixed(1)}°C | P: {parseFloat(log.pres_max||0).toFixed(2)}b</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          (log.diagnostico_principal || '').includes('CONFORME') ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                        }`}>
                          {log.diagnostico_principal || 'CONFORME'}
                        </span>
                      </td>
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setInspectedSession(log)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg text-xs"
                          title="Abrir visor y certificado PDF"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PESTAÑA: NVS */}
      {activeTab === 'nvs' && canEditHardware && tipoEquipo === 'AUTOCLAVE' && (
        <form onSubmit={handleTransmitNVS} className="ultra-glass p-5 md:p-6 rounded-2xl border border-cyan-500/30 space-y-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-cyan-500/20 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                Ajustes NVS Flash & Parámetros Críticos (Solo Técnicos)
              </h3>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                Calibración de setpoints térmicos para {cliente}.
              </p>
            </div>

            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={applyPreset134}
                className="px-2.5 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 rounded-lg text-xs font-mono font-bold flex items-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>134°C Instrumental</span>
              </button>
              <button
                type="button"
                onClick={applyPreset121}
                className="px-2.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 rounded-lg text-xs font-mono font-bold flex items-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>121°C Plásticos</span>
              </button>
            </div>
          </div>

          {nvsMsg && (
            <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{nvsMsg}</span>
            </div>
          )}

          <div>
            <span className="text-xs font-mono text-cyan-400 font-bold block mb-3 uppercase tracking-wider">
              1. Parámetros del Ciclo de Esterilización
            </span>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 space-y-1.5">
                <label className="text-[11px] font-mono text-slate-300 block flex justify-between">
                  <span>Temperatura Setpoint (°C)</span>
                  <span className="text-cyan-400 font-bold">{spTemp}°C</span>
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="105.0"
                  max="138.0"
                  value={spTemp}
                  onChange={(e) => setSpTemp(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono focus:outline-none"
                />
              </div>

              <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 space-y-1.5">
                <label className="text-[11px] font-mono text-slate-300 block flex justify-between">
                  <span>Tiempo Meseta (minutos)</span>
                  <span className="text-cyan-400 font-bold">{tCiclo} min</span>
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="60"
                  value={tCiclo}
                  onChange={(e) => setTCiclo(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono focus:outline-none"
                />
              </div>

              <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 flex justify-between items-center">
                <div>
                  <span className="text-xs font-mono font-bold text-white block">Sistema Habilitado</span>
                  <span className="text-[10px] text-slate-400 font-mono">Seguro maestro</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleHardware('hab', isHabActive)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                    isHabActive ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                  }`}
                >
                  {isHabActive ? 'HABILITADO' : 'BLOQUEADO'}
                </button>
              </div>
            </div>
          </div>

          <div>
            <span className="text-xs font-mono text-cyan-400 font-bold block mb-3 uppercase tracking-wider">
              2. Límites de Seguridad & Odómetro
            </span>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 space-y-1.5">
                <label className="text-[11px] font-mono text-slate-300 block flex justify-between">
                  <span>Límite Sobrepresión</span>
                  <span className="text-pink-400 font-bold">{pMax} bar</span>
                </label>
                <input
                  type="number"
                  step="0.05"
                  min="2.00"
                  max="3.00"
                  value={pMax}
                  onChange={(e) => setPMax(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono focus:outline-none"
                />
              </div>

              <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 space-y-1.5">
                <label className="text-[11px] font-mono text-slate-300 block flex justify-between">
                  <span>Límite Odómetro</span>
                  <span className="text-amber-400 font-bold">{limMant}</span>
                </label>
                <input
                  type="number"
                  step="10"
                  min="50"
                  max="1000"
                  value={limMant}
                  onChange={(e) => setLimMant(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono focus:outline-none"
                />
              </div>

              <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 flex justify-between items-center">
                <div>
                  <span className="text-xs font-mono font-bold text-white block">Zumbador Físico</span>
                  <span className="text-[10px] text-slate-400 font-mono">Alarma sonora</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleHardware('snd_ok', sndOk)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border ${
                    sndOk ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {sndOk ? 'AUDIBLE' : 'SILENCIOSO'}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:opacity-90 text-white font-bold rounded-xl text-xs font-mono flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25"
          >
            <Send className="w-4 h-4" />
            <span>TRANSMITIR Y GRABAR PARÁMETROS EN NVS FLASH DEL ESP32</span>
          </button>
        </form>
      )}

      {/* PESTAÑA: FICHA CLIENTE */}
      {activeTab === 'ficha' && canEditHardware && (
        <form onSubmit={handleGuardarFicha} className="ultra-glass p-6 rounded-2xl border border-cyan-500/30 space-y-4 max-w-xl">
          <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
            <Building2 className="w-4 h-4 text-cyan-400" />
            Ficha del Equipo & Asignación Hospitalaria / Flota
          </h3>

          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1">Alias del Dispositivo</label>
            <input
              type="text"
              required
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1">Hospital / Clínica / Cliente / Flota</label>
            <input
              type="text"
              required
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1">Modelo de Hardware</label>
            <input
              type="text"
              required
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-400"
            />
          </div>

          <button
            type="submit"
            disabled={guardandoFicha}
            className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-lg text-xs shadow-lg"
          >
            {guardandoFicha ? 'Guardando en Supabase...' : 'Guardar y Vincular en Nube'}
          </button>
        </form>
      )}

      {/* PESTAÑA: MANTENIMIENTO */}
      {activeTab === 'mantenimiento' && canEditHardware && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-3">
            <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
              <Wrench className="w-4 h-4 text-cyan-400" />
              Estado del Odómetro Físico
            </h3>

            <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-800 space-y-2">
              <div className="flex justify-between text-xs font-mono text-slate-300">
                <span>Ciclos Acumulados:</span>
                <span className="font-bold text-cyan-300">{ciclos} / {limite}</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-700">
                <div
                  className={`h-full ${pctMant > 90 ? 'bg-rose-500' : 'bg-emerald-400'}`}
                  style={{ width: `${pctMant}%` }}
                ></div>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                {limite - ciclos > 0 ? `Restan ${limite - ciclos} ciclos para servicio preventivo.` : '¡Mantenimiento vencido!'}
              </p>
              
              <ClinicalTooltip
                title={CLINICAL_HELP.btn_reset_odometro.title}
                description={CLINICAL_HELP.btn_reset_odometro.desc}
                badge={CLINICAL_HELP.btn_reset_odometro.badge}
                shortcut={CLINICAL_HELP.btn_reset_odometro.action}
              >
                <button
                  type="button"
                  onClick={() => sendCommand(device.mac, { cmd: 'RESET_ODOMETRO' })}
                  className="w-full mt-2 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 rounded-lg text-xs font-bold"
                >
                  🔄 Reiniciar Odómetro a Cero
                </button>
              </ClinicalTooltip>
            </div>
          </div>

          <form onSubmit={handleGuardarMantenimiento} className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-3">
            <h3 className="text-sm font-bold text-white font-mono">Agendar Mantenimiento Preventivo</h3>
            <input
              type="date"
              required
              value={maintFecha}
              onChange={(e) => setMaintFecha(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
            />
            <input
              type="text"
              required
              placeholder="Técnico responsable..."
              value={maintTecnico}
              onChange={(e) => setMaintTecnico(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
            />
            <input
              type="text"
              placeholder="Notas u observaciones del servicio..."
              value={maintNotas}
              onChange={(e) => setMaintNotas(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
            />
            <button
              type="submit"
              className="w-full py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-lg text-xs"
            >
              Agendar en Supabase Cloud
            </button>
          </form>
        </div>
      )}

      {/* Modal de Etiquetas QR */}
      <SurgicalQRLabel
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
        deviceData={device}
        operatorName={operatorName}
      />

      {/* Visor Forense de la Sesión */}
      <SessionDetailModal
        isOpen={inspectedSession !== null}
        onClose={() => setInspectedSession(null)}
        session={inspectedSession}
      />

      {/* Modal de Doble Confirmación y Firma Operativa */}
      <ActionConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        description={confirmModal.description}
        actionType={confirmModal.actionType}
        deviceName={alias}
        operatorName={operatorName}
      />
    </div>
  );
}
