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
  PowerOff,
  BellRing
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

  // Identificación del tipo
  const tipoEquipo = (
    device?.meta?.config_deseada?.tipo || 
    device?.meta?.tipo || 
    device?.datos?.tipo || 
    'AUTOCLAVE'
  ).toUpperCase();

  const isVehicle = tipoEquipo === 'VEHICULO';
  const isPlc = tipoEquipo === 'UNIVERSAL_PLC' || tipoEquipo === 'PLC_GENERICO';
  const isAutoclave = !isVehicle && !isPlc;

  // Modal de Confirmación
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    description: '',
    actionType: 'WARNING',
    onConfirm: () => {}
  });

  const [macLogs, setMacLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [inspectedSession, setInspectedSession] = useState(null);

  // Escáner I2C Real
  const [scanningI2C, setScanningI2C] = useState(false);
  const [chipsDetectados, setChipsDetectados] = useState([]);
  const [halMsg, setHalMsg] = useState('');

  // Mapeador Completo de Nombres y Roles para 8 Salidas y 8 Entradas
  const [rolesReles, setRolesReles] = useState({
    R1: 'CALENTADOR', R2: 'BOMBA_VACIO', R3: 'MOTOR_AGITADOR', R4: 'PURGA_VAPOR',
    R5: 'MANUAL', R6: 'MANUAL', R7: 'MANUAL', R8: 'MANUAL'
  });
  const [nombresReles, setNombresReles] = useState({
    R1: 'Calentador Vapor', R2: 'Bomba de Vacío', R3: 'Motor Agitador', R4: 'Válvula Purga',
    R5: 'Salida Aux 5', R6: 'Salida Aux 6', R7: 'Salida Aux 7', R8: 'Salida Aux 8'
  });

  const canEditHardware = userRole && !userRole.toLowerCase().includes('operador') && !userRole.toLowerCase().includes('cliente');
  const tieneReportes = isAutoclave;

  const d = device?.datos || {};
  const cfg = d?.cfg || {};
  const relesPlc = d?.reles || {};
  const entradasPlc = d?.entradas || {};

  // Odómetro Real y Umbral Configurable de Mantenimiento (10% a 100%)
  const ciclos = Number(cfg.ciclos || device?.meta?.ciclosCompletados || 0);
  const limite = Number(cfg.lim_mant || device?.meta?.limiteMantenimiento || 200);
  const [alertaPct, setAlertaPct] = useState(cfg.alerta_pct || 80);
  const pctMant = Math.min(100, Math.round((ciclos / (limite || 1)) * 100));
  const alertaActiva = pctMant >= alertaPct;

  // Escuchar el reporte I2C real que emite el ESP32
  useEffect(() => {
    if (device?.i2cReport && device.i2cReport.chips) {
      setChipsDetectados(device.i2cReport.chips);
      setScanningI2C(false);
      setHalMsg(`¡Reporte físico recibido! ${device.i2cReport.total || device.i2cReport.chips.length} chips detectados en bus I2C.`);

      // Guardar auditoría real en Supabase 'diagnosticos_i2c'
      supabase.from('diagnosticos_i2c').insert({
        mac: device.mac,
        dispositivos: device.i2cReport.chips,
        total: device.i2cReport.total || device.i2cReport.chips.length,
        created_at: new Date().toISOString()
      }).then(({ error }) => {
        if (error) console.warn('Nota diagnosticos_i2c:', error.message);
      });
    }
  }, [device?.i2cReport]);

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
    if (activeTab === 'historial') fetchMacLogs();
  }, [activeTab, device?.mac]);

  // Parámetros NVS
  const [spTemp, setSpTemp] = useState(cfg.sp_temp ?? 121.0);
  const [tCiclo, setTCiclo] = useState(cfg.t_ciclo ?? 2);
  const [pMax, setPMax] = useState(cfg.p_max ?? 2.60);
  const [limMant, setLimMant] = useState(cfg.lim_mant ?? 200);

  // ACCIONES CON CONFIRMACIÓN
  const requestStartCycle = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Iniciar Ciclo de Esterilización',
      description: `¿Confirmas el inicio del protocolo térmico a ${spTemp}°C durante ${tCiclo} minutos?`,
      actionType: 'START',
      onConfirm: () => sendCommand(device.mac, { cmd: 'INICIAR_CICLO' })
    });
  };

  const requestEmergencyStop = () => {
    setConfirmModal({
      isOpen: true,
      title: '¡PARO DE EMERGENCIA!',
      description: 'Corte inmediato de calentadores y despresurización.',
      actionType: 'STOP',
      onConfirm: () => sendCommand(device.mac, { cmd: 'ABORTAR_CICLO' })
    });
  };

  const requestResetAlarm = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Restablecer Código de Alarma',
      description: '¿Confirmas que la causa de la alarma ha sido resuelta?',
      actionType: 'RESET',
      onConfirm: () => sendCommand(device.mac, { cmd: 'RESET_ALARMA' })
    });
  };

  const requestStartVehicle = () => {
    setConfirmModal({
      isOpen: true,
      title: '⚡ Iniciar Arranque Remoto',
      description: `¿Confirmas la activación de la ignición y arranque del motor?`,
      actionType: 'START',
      onConfirm: () => sendCommand(device.mac, { cmd: 'START_VEHICLE' })
    });
  };

  const requestStopVehicle = () => {
    setConfirmModal({
      isOpen: true,
      title: '🛑 Corte de Motor / Inmovilizador',
      description: `¿Confirmas cortar la ignición inmediatamente?`,
      actionType: 'STOP',
      onConfirm: () => sendCommand(device.mac, { cmd: 'STOP_VEHICLE' })
    });
  };

  // Disparar Escaneo I2C Físico Real
  const handleScanI2C = () => {
    setScanningI2C(true);
    setHalMsg('Enviando orden física SCAN_HARDWARE al Núcleo 1...');
    sendCommand(device.mac, { cmd: 'SCAN_HARDWARE' });
  };

  // Desplegar Mapeo Completo al ESP32 (LittleFS)
  const handleDeployHalMap = async () => {
    const payload = {
      cmd: 'APPLY_HAL_MAP',
      mac: device.mac,
      tipo: tipoEquipo,
      sp_temp: Number(spTemp),
      t_ciclo: Number(tCiclo),
      p_max: Number(pMax),
      lim_mant: Number(limMant),
      alerta_pct: Number(alertaPct),
      roles_reles: rolesReles,
      nombres_reles: nombresReles
    };

    sendCommand(device.mac, payload);
    setHalMsg('⚡ Mapeo enviado al ESP32 (Grabado en LittleFS & NVS)');

    try {
      await supabase.from('asignaciones_equipos').update({
        config_deseada: payload,
        updated_at: new Date().toISOString()
      }).eq('mac', device.mac);
    } catch (e) {
      console.warn(e);
    }

    setTimeout(() => setHalMsg(''), 4000);
  };

  const handleToggleManualRelay = (canal, currentState) => {
    sendCommand(device.mac, {
      cmd: 'SET_RELAY',
      canal: canal,
      val: !currentState
    });
  };

  const [alias, setAlias] = useState(device?.meta?.alias || `EQUIPO [${device.mac.slice(-4)}]`);
  const [cliente, setCliente] = useState(device?.meta?.cliente || 'Central Hospitalaria');
  const [modelo, setModelo] = useState(device?.meta?.modelo || 'HKL-EA8 Modular');
  const [guardandoFicha, setGuardandoFicha] = useState(false);

  const [maintFecha, setMaintFecha] = useState('');
  const [maintTipo, setMaintTipo] = useState('PREVENTIVO_GENERAL');
  const [maintTecnico, setMaintTecnico] = useState('');
  const [maintNotas, setMaintNotas] = useState('');

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
        descripcion: `FECHA:${maintFecha} | ALERTA_${alertaPct}% | ${maintNotas}`,
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
                isVehicle ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 
                isPlc ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' :
                'bg-cyan-500/20 text-cyan-300 border-cyan-400'
              }`}>
                {isVehicle ? <Car className="w-3 h-3" /> : isPlc ? <Cpu className="w-3 h-3" /> : <Activity className="w-3 h-3" />}
                {tipoEquipo}
              </span>
              {alertaActiva && (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-rose-500/20 text-rose-300 border border-rose-500 flex items-center gap-1 font-bold animate-pulse">
                  <BellRing className="w-3 h-3" /> MANTENIMIENTO REQUERIDO ({pctMant}%)
                </span>
              )}
            </div>
            <p className="text-xs text-cyan-300 font-mono">
              MAC: {device.mac} • {cliente} • {modelo}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ClinicalTooltip
            title={CLINICAL_HELP.btn_anclar_terminal.title}
            description={CLINICAL_HELP.btn_anclar_terminal.desc}
            badge={CLINICAL_HELP.btn_anclar_terminal.badge}
            shortcut={CLINICAL_HELP.btn_anclar_terminal.action}
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

          <button
            onClick={() => setShowQRModal(true)}
            className="px-3.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-lg"
          >
            <QrCode className="w-4 h-4" />
            <span>Etiqueta QR</span>
          </button>
        </div>
      </div>

      {/* Pestañas de Navegación */}
      <div className="flex gap-2 overflow-x-auto pb-1 border-b border-slate-800">
        <button
          onClick={() => setActiveTab('sensores')}
          className={`py-2 px-3.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 whitespace-nowrap transition-all ${
            activeTab === 'sensores' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white bg-slate-900/60'
          }`}
        >
          {isVehicle ? <Car className="w-4 h-4" /> : isPlc ? <Cpu className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
          <span>{isVehicle ? 'Cockpit Vehicular' : isPlc ? 'Matriz I/O Soft-PLC' : 'Sensores & Esterilización'}</span>
        </button>

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

        {canEditHardware && isAutoclave && (
          <button
            onClick={() => setActiveTab('nvs')}
            className={`py-2 px-3.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 whitespace-nowrap transition-all ${
              activeTab === 'nvs' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white bg-slate-900/60'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Ajustes NVS & Parámetros</span>
          </button>
        )}

        {tieneReportes && (
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
              <span>Mantenimiento & Odómetro</span>
            </button>
          </>
        )}
      </div>

      {/* PESTAÑA PRINCIPAL: ADAPTATIVA AL 100% */}
      {activeTab === 'sensores' && (
        <div className="space-y-4 font-mono text-xs">
          
          {/* MODO A: VEHÍCULO */}
          {isVehicle && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="ultra-glass p-3.5 rounded-xl border border-amber-500/30">
                  <span className="text-[10px] text-amber-400 block mb-1">ESTADO DEL MOTOR</span>
                  <p className="text-xl font-bold text-white truncate">{d?.fase || 'APAGADO'}</p>
                  <span className="text-[10px] text-slate-400">Core 1 Soft-PLC</span>
                </div>

                <div className="ultra-glass p-3.5 rounded-xl border border-emerald-500/30">
                  <span className="text-[10px] text-emerald-400 block mb-1">BATERÍA 12V</span>
                  <p className="text-2xl font-bold text-emerald-300">{(d?.bateria_v || 12.6).toFixed(1)} V</p>
                  <span className="text-[10px] text-slate-400">HKL-EA8 DC 12-24V</span>
                </div>

                <div className="ultra-glass p-3.5 rounded-xl border border-cyan-500/30">
                  <span className="text-[10px] text-cyan-400 block mb-1">ALTERNADOR (D+)</span>
                  <p className="text-lg font-bold text-white">
                    {entradasPlc.IN2 ? '🟢 CARGA 14V' : '⚪ PARADO'}
                  </p>
                  <span className="text-[10px] text-slate-400">Entrada IN2</span>
                </div>

                <div className="ultra-glass p-3.5 rounded-xl border border-indigo-500/30">
                  <span className="text-[10px] text-indigo-400 block mb-1">ENLACE FÍSICO</span>
                  <p className="text-lg font-bold text-white">RJ45 EN VIVO</p>
                  <span className="text-[10px] text-slate-400">800ms Heartbeat</span>
                </div>
              </div>

              {/* Mando de Control Vehicular */}
              <div className="ultra-glass p-4 rounded-xl border border-amber-500/30 space-y-3">
                <span className="text-xs font-bold text-amber-300 block uppercase">
                  Mando de Control Remoto de Vehículo:
                </span>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    onClick={requestStartVehicle}
                    className="py-3.5 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-90 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 text-white"
                  >
                    <Key className="w-4 h-4" />
                    <span>⚡ ARRANQUE REMOTO (START)</span>
                  </button>

                  <button
                    onClick={() => handleToggleManualRelay(1, Boolean(relesPlc.R1))}
                    className={`py-3.5 px-4 font-bold rounded-xl text-xs flex items-center justify-center gap-2 border transition-all ${
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
                    className="py-3.5 px-4 bg-rose-600 hover:bg-rose-500 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg text-white"
                  >
                    <PowerOff className="w-4 h-4" />
                    <span>🛑 CORTE MOTOR / INMOVILIZADOR</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* MODO B: UNIVERSAL_PLC (CONTROL DE RELÉS Y ENTRADAS DIRECTAS) */}
          {isPlc && (
            <div className="space-y-4">
              <div className="ultra-glass p-4 rounded-xl border border-purple-500/30 space-y-3">
                <span className="text-xs font-bold text-purple-300 block uppercase">
                  Matriz Soft-PLC: 8 Relés de Salida (Conmutación Interactiva HKL-EA8):
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(ch => (
                    <div key={ch} className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 flex justify-between items-center">
                      <div>
                        <span className="text-white font-bold block">{nombresReles[`R${ch}`] || `Relé ${ch}`}</span>
                        <span className="text-[10px] text-slate-400">{relesPlc[`R${ch}`] ? '🟢 ACTIVO' : '⚪ OFF'}</span>
                      </div>
                      <button
                        onClick={() => handleToggleManualRelay(ch, Boolean(relesPlc[`R${ch}`]))}
                        className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${
                          relesPlc[`R${ch}`] ? 'bg-emerald-500 text-slate-950 shadow-[0_0_10px_#10b981]' : 'bg-slate-800 text-slate-300 hover:text-white'
                        }`}
                      >
                        {relesPlc[`R${ch}`] ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Entradas Digitales */}
              <div className="ultra-glass p-4 rounded-xl border border-slate-800 space-y-3">
                <span className="text-xs font-bold text-cyan-300 block uppercase">
                  Lectura en Vivo de las 8 Entradas Optoacopladas (NPN/PNP):
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(inNum => (
                    <div key={inNum} className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 flex justify-between items-center">
                      <span className="text-slate-300">IN{inNum}</span>
                      <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                        entradasPlc[`IN${inNum}`] ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-slate-900 text-slate-500'
                      }`}>
                        {entradasPlc[`IN${inNum}`] ? 'CERRADO (1)' : 'ABIERTO (0)'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* MODO C: AUTOCLAVE CLÍNICO (ESTERILIZACIÓN REAL CON INICIAR CICLO) */}
          {isAutoclave && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="ultra-glass p-3.5 rounded-xl border border-cyan-500/30">
                  <span className="text-[10px] text-cyan-400 block mb-1">TEMPERATURA CÁMARA</span>
                  <p className="text-2xl font-bold text-white">{(d?.temp_camara || 25.0).toFixed(1)} °C</p>
                  <span className="text-[10px] text-slate-400">Setpoint: {spTemp}°C</span>
                </div>

                <div className="ultra-glass p-3.5 rounded-xl border border-pink-500/30">
                  <span className="text-[10px] text-pink-400 block mb-1">PRESIÓN VAPOR</span>
                  <p className="text-2xl font-bold text-white">{(d?.presion || 0.0).toFixed(2)} bar</p>
                  <span className="text-[10px] text-slate-400">Límite: {pMax}b</span>
                </div>

                <div className="ultra-glass p-3.5 rounded-xl border border-emerald-500/30">
                  <span className="text-[10px] text-emerald-400 block mb-1">LETALIDAD (F0)</span>
                  <p className="text-2xl font-bold text-emerald-300">{(device.f0Score || 0.0).toFixed(1)} min</p>
                  <span className="text-[10px] text-emerald-400/80">ISO 17665</span>
                </div>

                <div className="ultra-glass p-3.5 rounded-xl border border-amber-500/30">
                  <span className="text-[10px] text-amber-400 block mb-1">FASE ACTUAL</span>
                  <p className="text-lg font-bold text-white truncate">{d?.fase || 'ESPERA'}</p>
                  <span className="text-[10px] text-slate-400">Restante: {Math.floor((d?.seg_restantes || 0)/60)}:{(d?.seg_restantes || 0)%60}</span>
                </div>
              </div>

              {/* Botones de Control de Autoclave con Acción Real */}
              <div className="flex gap-2.5">
                <button
                  onClick={requestStartCycle}
                  className="py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg text-white"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Iniciar Ciclo ({spTemp}°C)</span>
                </button>

                <button
                  onClick={requestEmergencyStop}
                  className="py-3 px-4 bg-rose-600 hover:bg-rose-500 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg text-white"
                >
                  <Square className="w-4 h-4 fill-white" />
                  <span>Paro de Emergencia</span>
                </button>

                <button
                  onClick={requestResetAlarm}
                  className="py-3 px-4 bg-slate-900 border border-slate-700 text-slate-300 rounded-xl text-xs"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>

              <div className="ultra-glass p-4 rounded-2xl border border-cyan-500/30">
                <h3 className="text-xs font-bold text-cyan-300 mb-3">CURVA TÉRMICA EN TIEMPO REAL (ESP32)</h3>
                <SterilizationChart telemetryData={device.history || []} />
              </div>
            </div>
          )}

        </div>
      )}

      {/* PESTAÑA: ESCÁNER I2C REAL & PROGRAMACIÓN DE CERO DE PINES */}
      {activeTab === 'hal_scanner' && canEditHardware && (
        <div className="ultra-glass p-5 rounded-2xl border border-amber-500/30 space-y-4 font-mono text-xs">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-amber-500/20 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-amber-400" />
                Escáner I2C en Vivo & Programación Integral de Salidas/Entradas
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Configura cada pin como si programaras el microcontrolador desde cero.
              </p>
            </div>

            <button
              onClick={handleScanI2C}
              disabled={scanningI2C}
              className="py-2 px-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl flex items-center gap-1.5 shadow-lg shadow-amber-500/20"
            >
              <Search className={`w-3.5 h-3.5 ${scanningI2C ? 'animate-spin' : ''}`} />
              <span>{scanningI2C ? 'Barrido Físico en Marcha...' : '🔍 Escanear Bus I2C en Vivo'}</span>
            </button>
          </div>

          {halMsg && (
            <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{halMsg}</span>
            </div>
          )}

          {/* Chips Detectados por el Escaneo Real */}
          {chipsDetectados.length > 0 && (
            <div className="p-3.5 bg-slate-900/90 rounded-xl border border-amber-500/30 space-y-2">
              <span className="text-amber-400 font-bold block uppercase tracking-wider text-[11px]">
                Inventario de Silicio Físico Detectado en Tiempo Real:
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

          {/* Programación de las 8 Salidas */}
          <div className="p-4 bg-slate-900/90 rounded-xl border border-slate-800 space-y-3">
            <span className="text-cyan-400 font-bold block uppercase tracking-wider text-[11px]">
              Programación de Salidas (Relés 1 a 8):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(num => (
                <div key={num} className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-white font-bold text-xs">Salida R{num}:</span>
                    <button
                      type="button"
                      onClick={() => handleToggleManualRelay(num, Boolean(relesPlc[`R${num}`]))}
                      className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                        relesPlc[`R${num}`] ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {relesPlc[`R${num}`] ? 'PROBANDO (ON)' : 'TEST (OFF)'}
                    </button>
                  </div>

                  <input
                    type="text"
                    value={nombresReles[`R${num}`] || ''}
                    onChange={(e) => setNombresReles(prev => ({ ...prev, [`R${num}`]: e.target.value }))}
                    placeholder="Nombre del componente..."
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-[11px]"
                  />

                  <select
                    value={rolesReles[`R${num}`] || 'MANUAL'}
                    onChange={(e) => setRolesReles(prev => ({ ...prev, [`R${num}`]: e.target.value }))}
                    className="w-full bg-slate-900 text-cyan-300 border border-slate-700 rounded px-2 py-1 text-[11px]"
                  >
                    <option value="CALENTADOR">♨️ Calentador Vapor</option>
                    <option value="BOMBA_VACIO">💨 Bomba de Vacío</option>
                    <option value="MOTOR_AGITADOR">⚙️ Motor Agitador</option>
                    <option value="PURGA_VAPOR">💧 Válvula de Purga / Escape</option>
                    <option value="IGNICION_ON">🚗 Ignición Vehículo (ACC/ON)</option>
                    <option value="STARTER_MOTOR">⚡ Starter Arranque (Pulso ms)</option>
                    <option value="INMOVILIZADOR">🛑 Inmovilizador / Corte Bomba</option>
                    <option value="SIRENA_LUCES">🚨 Sirena / Luces Auxiliares</option>
                    <option value="MANUAL">⚪ Manual / Libre</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleDeployHalMap}
            className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-emerald-500 to-teal-500 hover:opacity-90 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
          >
            <Send className="w-4 h-4" />
            <span>⚡ GRABAR PROGRAMACIÓN EN FLASH LITTLEFS & NVS DEL MICROCONTROLADOR</span>
          </button>
        </div>
      )}

      {/* PESTAÑA: MANTENIMIENTO CON SELECTOR DE ALERTA DEL 10% AL 100% */}
      {activeTab === 'mantenimiento' && canEditHardware && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
          <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Wrench className="w-4 h-4 text-cyan-400" />
              Odómetro Clínico & Alertas Preventivas
            </h3>

            <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-800 space-y-3">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Ciclos Completados Reales:</span>
                <span className="font-bold text-cyan-300">{ciclos} / {limite} ciclos</span>
              </div>

              <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-700">
                <div
                  className={`h-full ${pctMant >= alertaPct ? 'bg-amber-400' : 'bg-emerald-400'}`}
                  style={{ width: `${pctMant}%` }}
                ></div>
              </div>

              <p className="text-[11px] text-slate-400">
                Uso actual: <strong className={alertaActiva ? 'text-amber-400' : 'text-emerald-400'}>{pctMant}%</strong> del ciclo de vida.
              </p>

              {/* SELECTOR CONFIGURABLE DE ALERTA (10% AL 100%) */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <label className="text-slate-300 flex justify-between">
                  <span>Disparar Alerta Preventiva en:</span>
                  <span className="text-amber-300 font-bold">{alertaPct}% del Odómetro</span>
                </label>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={alertaPct}
                  onChange={(e) => setAlertaPct(Number(e.target.value))}
                  className="w-full accent-amber-400 cursor-pointer"
                />
                <span className="text-[10px] text-slate-500 block">
                  El sistema alertará automáticamente cuando el equipo alcance el {alertaPct}% ({Math.round(limite * (alertaPct / 100))} ciclos).
                </span>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleDeployHalMap}
                  className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold"
                >
                  Guardar Umbral Alerta
                </button>
                <button
                  type="button"
                  onClick={() => sendCommand(device.mac, { cmd: 'RESET_ODOMETRO' })}
                  className="py-2 px-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg font-bold"
                >
                  Reiniciar Odómetro
                </button>
              </div>
            </div>
          </div>

          <form onSubmit={handleGuardarMantenimiento} className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-3">
            <h3 className="text-sm font-bold text-white">Agendar Servicio Preventivo</h3>
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
              className="w-full py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-lg text-xs shadow-lg"
            >
              Agendar en Supabase Cloud
            </button>
          </form>
        </div>
      )}

      {/* PESTAÑA: AJUSTES NVS */}
      {activeTab === 'nvs' && canEditHardware && isAutoclave && (
        <form onSubmit={(e) => { e.preventDefault(); handleDeployHalMap(); }} className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-4 font-mono text-xs">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-cyan-500/20 pb-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            Parámetros Operacionales NVS Flash
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-slate-300 block mb-1">Temperatura Setpoint (°C)</label>
              <input
                type="number"
                step="0.5"
                value={spTemp}
                onChange={(e) => setSpTemp(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white"
              />
            </div>

            <div>
              <label className="text-slate-300 block mb-1">Tiempo de Meseta (min)</label>
              <input
                type="number"
                value={tCiclo}
                onChange={(e) => setTCiclo(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white"
              />
            </div>

            <div>
              <label className="text-slate-300 block mb-1">Límite Sobrepresión (bar)</label>
              <input
                type="number"
                step="0.05"
                value={pMax}
                onChange={(e) => setPMax(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-xl shadow-lg"
          >
            Transmitir Parámetros a Flash NVS
          </button>
        </form>
      )}

      {/* PESTAÑA: HISTORIAL */}
      {activeTab === 'historial' && tieneReportes && (
        <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-4">
          <div className="flex justify-between items-center border-b border-cyan-500/20 pb-3">
            <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
              <History className="w-4 h-4 text-cyan-400" />
              Historial de Ciclos en la Nube [{device.mac}]
            </h3>
            <button
              onClick={fetchMacLogs}
              className="px-2.5 py-1 bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded-lg font-mono hover:text-white"
            >
              🔄 Recargar
            </button>
          </div>

          <div className="rounded-xl border border-slate-800 overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900 text-cyan-400 border-b border-slate-800">
                <tr>
                  <th className="p-3">FECHA</th>
                  <th className="p-3">ID SESIÓN</th>
                  <th className="p-3">MÁXIMOS</th>
                  <th className="p-3">DIAGNÓSTICO</th>
                  <th className="p-3 text-center">VER</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {loadingLogs ? (
                  <tr><td colSpan="5" className="p-6 text-center text-slate-400">Consultando Supabase...</td></tr>
                ) : macLogs.length === 0 ? (
                  <tr><td colSpan="5" className="p-6 text-center text-slate-400">Sin ciclos registrados aún.</td></tr>
                ) : (
                  macLogs.map((log) => (
                    <tr key={log.session_id} onClick={() => setInspectedSession(log)} className="hover:bg-slate-800/40 cursor-pointer">
                      <td className="p-3 text-white">{new Date(log.created_at || log.fecha).toLocaleString()}</td>
                      <td className="p-3 text-cyan-400">{log.session_id}</td>
                      <td className="p-3">T: {parseFloat(log.temp_max||0).toFixed(1)}°C | P: {parseFloat(log.pres_max||0).toFixed(2)}b</td>
                      <td className="p-3">{log.diagnostico_principal || 'CONFORME'}</td>
                      <td className="p-3 text-center">
                        <button onClick={() => setInspectedSession(log)} className="p-1 bg-slate-800 rounded">
                          <Eye className="w-3.5 h-3.5 text-cyan-300" />
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

      {/* PESTAÑA: FICHA CLIENTE */}
      {activeTab === 'ficha' && canEditHardware && (
        <form onSubmit={handleGuardarFicha} className="ultra-glass p-6 rounded-2xl border border-cyan-500/30 space-y-4 max-w-xl font-mono text-xs">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Building2 className="w-4 h-4 text-cyan-400" />
            Ficha del Equipo & Asignación
          </h3>

          <div>
            <label className="block text-slate-300 mb-1">Alias del Dispositivo</label>
            <input
              type="text"
              required
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-1">Hospital / Base / Cliente</label>
            <input
              type="text"
              required
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-1">Modelo de Hardware</label>
            <input
              type="text"
              required
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
            />
          </div>

          <button
            type="submit"
            disabled={guardandoFicha}
            className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-lg shadow-lg"
          >
            {guardandoFicha ? 'Guardando en Supabase...' : 'Guardar y Vincular en Nube'}
          </button>
        </form>
      )}

      {/* Modales */}
      <SurgicalQRLabel isOpen={showQRModal} onClose={() => setShowQRModal(false)} deviceData={device} operatorName={operatorName} />
      <SessionDetailModal isOpen={inspectedSession !== null} onClose={() => setInspectedSession(null)} session={inspectedSession} />
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
