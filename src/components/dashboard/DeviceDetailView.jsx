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
  Cpu,
  Search,
  FileJson,
  RefreshCw,
  Check,
  Download
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

  const canEditHardware = userRole && !userRole.toLowerCase().includes('operador') && !userRole.toLowerCase().includes('cliente');
  const tieneReportes = device?.esquema?.tiene_reportes !== false && device?.datos?.tipo !== 'sin_reportes';

  const d = device?.datos || {};
  const cfg = d?.cfg || {};
  const hwProf = device?.hwProfile || {};

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

  // NUEVO: Mapeo de Pines Dinámicos (GPIOs)
  const [pinMotor, setPinMotor] = useState(hwProf.pin_motor ?? 2);
  const [pinCalentador, setPinCalentador] = useState(hwProf.pin_calentador ?? 4);
  const [pinVacio, setPinVacio] = useState(hwProf.pin_vacio ?? 5);

  // NUEVO: Editor JSON Android-Style
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [jsonContent, setJsonContent] = useState('');
  const [jsonError, setJsonError] = useState('');

  // NUEVO: Estado del Escáner I2C
  const [scanningI2c, setScanningI2c] = useState(false);

  useEffect(() => {
    if (cfg.sp_temp !== undefined) setSpTemp(cfg.sp_temp);
    if (cfg.t_ciclo !== undefined) setTCiclo(cfg.t_ciclo);
    if (cfg.purga_ok !== undefined) setPurgaOk(cfg.purga_ok);
    if (cfg.p_max !== undefined) setPMax(cfg.p_max);
    if (cfg.lim_mant !== undefined) setLimMant(cfg.lim_mant);
    if (cfg.snd_ok !== undefined) setSndOk(cfg.snd_ok);

    if (hwProf.pin_motor !== undefined) setPinMotor(hwProf.pin_motor);
    if (hwProf.pin_calentador !== undefined) setPinCalentador(hwProf.pin_calentador);
    if (hwProf.pin_vacio !== undefined) setPinVacio(hwProf.pin_vacio);
  }, [cfg, hwProf]);

  // Generar representación JSON sincronizada
  useEffect(() => {
    const currentProfile = {
      perfil_version: "v2.0-HAL",
      dispositivo: {
        mac: device.mac,
        alias: alias
      },
      salidas_gpios: {
        pin_motor: Number(pinMotor),
        pin_calentador: Number(pinCalentador),
        pin_vacio: Number(pinVacio)
      },
      ciclo_parametros: {
        sp_temp: Number(spTemp),
        t_ciclo: Number(tCiclo),
        hab: Boolean(isHabActive),
        purga_ok: Boolean(purgaOk)
      },
      limites_seguridad: {
        p_max: Number(pMax),
        lim_mant: Number(limMant),
        snd_ok: Boolean(sndOk)
      }
    };
    setJsonContent(JSON.stringify(currentProfile, null, 2));
  }, [pinMotor, pinCalentador, pinVacio, spTemp, tCiclo, isHabActive, purgaOk, pMax, limMant, sndOk]);

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

  // TRANSMISIÓN DUAL: SUPABASE CLOUD (AUDITORÍA) + ESP32 (HIVEMQ)
  const handleTransmitNVS = async (e) => {
    e.preventDefault();
    if (!canEditHardware) return alert('Permiso denegado: solo personal técnico autorizado.');
    setJsonError('');

    let payloadMqtt = {};
    let fullJsonProfile = {};

    if (showJsonEditor) {
      try {
        fullJsonProfile = JSON.parse(jsonContent);
        payloadMqtt = {
          sp_temp: Number(fullJsonProfile.ciclo_parametros?.sp_temp ?? spTemp),
          t_ciclo: Number(fullJsonProfile.ciclo_parametros?.t_ciclo ?? tCiclo),
          hab: Boolean(fullJsonProfile.ciclo_parametros?.hab ?? isHabActive),
          mot_ok: isMotorActive,
          vacio_ok: isVacioActive,
          purga_ok: Boolean(fullJsonProfile.ciclo_parametros?.purga_ok ?? purgaOk),
          p_max: Number(fullJsonProfile.limites_seguridad?.p_max ?? pMax),
          lim_mant: Number(fullJsonProfile.limites_seguridad?.lim_mant ?? limMant),
          snd_ok: Boolean(fullJsonProfile.limites_seguridad?.snd_ok ?? sndOk),
          pin_motor: Number(fullJsonProfile.salidas_gpios?.pin_motor ?? pinMotor),
          pin_calentador: Number(fullJsonProfile.salidas_gpios?.pin_calentador ?? pinCalentador),
          pin_vacio: Number(fullJsonProfile.salidas_gpios?.pin_vacio ?? pinVacio)
        };
      } catch (err) {
        setJsonError('Error de sintaxis en el archivo JSON: ' + err.message);
        return;
      }
    } else {
      payloadMqtt = {
        sp_temp: Number(spTemp),
        t_ciclo: Number(tCiclo),
        hab: isHabActive,
        mot_ok: isMotorActive,
        vacio_ok: isVacioActive,
        purga_ok: Boolean(purgaOk),
        p_max: Number(pMax),
        lim_mant: Number(limMant),
        snd_ok: Boolean(sndOk),
        pin_motor: Number(pinMotor),
        pin_calentador: Number(pinCalentador),
        pin_vacio: Number(pinVacio)
      };
      fullJsonProfile = JSON.parse(jsonContent);
    }

    // 1. Guardar primero en Supabase Cloud (Persistencia y Trazabilidad)
    try {
      await supabase.from('perfiles_hardware').upsert({
        mac: device.mac,
        alias: alias,
        perfil_json: fullJsonProfile,
        version_config: `v${Date.now().toString().slice(-4)}`,
        actualizado_por: operatorName || 'Director Biomédico',
        updated_at: new Date().toISOString()
      }, { onConflict: 'mac' });
    } catch (err) {
      console.warn('[SUPABASE PERFIL ERROR]', err);
    }

    // 2. Transmitir por HiveMQ al microcontrolador ESP32
    sendCommand(device.mac, payloadMqtt);

    setNvsMsg(`⚡ Perfil guardado en Supabase y transmitido a Flash NVS de ${device.mac}.`);
    setTimeout(() => setNvsMsg(''), 4500);
  };

  const handleToggleHardware = (key, currentState) => {
    const nextState = !currentState;
    sendCommand(device.mac, { [key]: nextState });
  };

  // DISPARAR ESCANEO I2C EN TIEMPO REAL
  const handleTriggerI2CScan = () => {
    setScanningI2c(true);
    sendCommand(device.mac, { cmd: 'SCAN_I2C' });
    setTimeout(() => setScanningI2c(false), 3000);
  };

  const [alias, setAlias] = useState(device?.meta?.alias || `AUTOCLAVE [${device.mac.slice(-4)}]`);
  const [cliente, setCliente] = useState(device?.meta?.cliente || 'Hospital Metropolitano');
  const [modelo, setModelo] = useState(device?.meta?.modelo || 'Quirúrgico Clase B');
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

  // Dispositivos I2C detectados
  const i2cDevices = device?.i2cReport?.dispositivos || device?.i2cReport?.perifericos || device?.i2cReport?.encontrados || [];

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
              {isKioskMode && (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-400 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> TERMINAL ANCLADA
                </span>
              )}
            </div>
            <p className="text-xs text-cyan-300 font-mono">MAC: {device.mac} • {cliente} • Setpoint: {spTemp}°C</p>
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
          <Activity className="w-4 h-4" />
          <span>Sensores & Salidas</span>
        </button>

        {canEditHardware ? (
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
              <span>Mantenimiento & Diagnóstico</span>
            </button>
          </>
        )}
      </div>

      {/* PESTAÑA 1: SENSORES, F0 Y ACCIONES */}
      {activeTab === 'sensores' && (
        <div className="space-y-4">
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
                  <span className="text-xs font-mono font-bold text-white block">Motor Agitador (GPIO {pinMotor})</span>
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
                  <span className="text-xs font-mono font-bold text-white block">Bomba Vacío (GPIO {pinVacio})</span>
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

          {/* Botones de Control */}
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
        </div>
      )}

      {/* PESTAÑA 2: HISTORIAL */}
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

      {/* PESTAÑA 3: NVS + PERFIL DINÁMICO JSON (ANDROID-STYLE) */}
      {activeTab === 'nvs' && canEditHardware && (
        <form onSubmit={handleTransmitNVS} className="ultra-glass p-5 md:p-6 rounded-2xl border border-cyan-500/30 space-y-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-cyan-500/20 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                Ajustes NVS & Perfil Dinámico de Hardware
              </h3>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                Calibración y reconfiguración remota para {cliente} (Guardado en Supabase Cloud).
              </p>
            </div>

            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setShowJsonEditor(!showJsonEditor)}
                className={`px-2.5 py-1.5 border rounded-lg text-xs font-mono font-bold flex items-center gap-1 transition-all ${
                  showJsonEditor ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-md shadow-cyan-500/30' : 'bg-slate-900 border-slate-700 text-cyan-300 hover:border-cyan-400'
                }`}
              >
                <FileJson className="w-3.5 h-3.5" />
                <span>{showJsonEditor ? 'Ocultar JSON' : 'Editor JSON'}</span>
              </button>
              <button
                type="button"
                onClick={applyPreset134}
                className="px-2.5 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 rounded-lg text-xs font-mono font-bold flex items-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>134°C</span>
              </button>
              <button
                type="button"
                onClick={applyPreset121}
                className="px-2.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 rounded-lg text-xs font-mono font-bold flex items-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>121°C</span>
              </button>
            </div>
          </div>

          {nvsMsg && (
            <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{nvsMsg}</span>
            </div>
          )}

          {jsonError && (
            <div className="p-3 bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-mono rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{jsonError}</span>
            </div>
          )}

          {/* EDITOR JSON DINÁMICO (MODO ANDROID SYSTEM MANIFEST) */}
          {showJsonEditor ? (
            <div className="p-4 bg-slate-950 rounded-xl border border-cyan-500/40 space-y-2">
              <div className="flex justify-between items-center text-xs font-mono text-cyan-300">
                <span className="flex items-center gap-1.5">
                  <FileJson className="w-4 h-4 text-cyan-400" />
                  Archivo de Perfil JSON Activo (hw_profile.json)
                </span>
                <span className="text-[10px] text-slate-400">Edición Directa para el ESP32</span>
              </div>
              <textarea
                rows={12}
                value={jsonContent}
                onChange={(e) => setJsonContent(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 font-mono text-xs text-cyan-200 focus:outline-none focus:border-cyan-400 leading-relaxed"
                placeholder="Estructura del archivo JSON..."
              />
              <p className="text-[10px] text-slate-400 font-mono">
                💡 Este archivo se guarda en Supabase Cloud y se descarga en la memoria Flash (LittleFS) del microcontrolador.
              </p>
            </div>
          ) : (
            <>
              {/* SECCIÓN 1: PARÁMETROS DEL CICLO */}
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

              {/* SECCIÓN 2: LÍMITES DE SEGURIDAD & ODÓMETRO */}
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

              {/* SECCIÓN 3: MAPEO DINÁMICO DE HARDWARE (GPIOS & HAL) */}
              <div>
                <span className="text-xs font-mono text-cyan-400 font-bold block mb-3 uppercase tracking-wider flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  3. Mapeo Dinámico de Hardware (GPIOs & Relés)
                </span>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 space-y-1.5">
                    <label className="text-[11px] font-mono text-slate-300 block flex justify-between">
                      <span>Pin GPIO Motor</span>
                      <span className="text-emerald-400 font-bold">GPIO {pinMotor}</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="39"
                      value={pinMotor}
                      onChange={(e) => setPinMotor(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono focus:outline-none"
                    />
                  </div>

                  <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 space-y-1.5">
                    <label className="text-[11px] font-mono text-slate-300 block flex justify-between">
                      <span>Pin GPIO Calentador</span>
                      <span className="text-rose-400 font-bold">GPIO {pinCalentador}</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="39"
                      value={pinCalentador}
                      onChange={(e) => setPinCalentador(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono focus:outline-none"
                    />
                  </div>

                  <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 space-y-1.5">
                    <label className="text-[11px] font-mono text-slate-300 block flex justify-between">
                      <span>Pin GPIO Bomba Vacío</span>
                      <span className="text-cyan-400 font-bold">GPIO {pinVacio}</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="39"
                      value={pinVacio}
                      onChange={(e) => setPinVacio(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            className="w-full py-3 bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:opacity-90 text-white font-bold rounded-xl text-xs font-mono flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25"
          >
            <Send className="w-4 h-4" />
            <span>TRANSMITIR Y GRABAR EN SUPABASE & ESP32 FLASH</span>
          </button>
        </form>
      )}

      {/* PESTAÑA 4: FICHA CLIENTE */}
      {activeTab === 'ficha' && canEditHardware && (
        <form onSubmit={handleGuardarFicha} className="ultra-glass p-6 rounded-2xl border border-cyan-500/30 space-y-4 max-w-xl">
          <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
            <Building2 className="w-4 h-4 text-cyan-400" />
            Ficha del Equipo & Asignación Hospitalaria
          </h3>

          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1">Alias del Autoclave</label>
            <input
              type="text"
              required
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1">Hospital / Clínica / Cliente</label>
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

      {/* PESTAÑA 5: MANTENIMIENTO & DIAGNÓSTICO I2C */}
      {activeTab === 'mantenimiento' && canEditHardware && (
        <div className="space-y-4">
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

          {/* DIAGNÓSTICO Y ESCANEO I2C PLUG & PLAY */}
          <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-3">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-cyan-500/20 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
                  <Search className="w-4 h-4 text-cyan-400" />
                  Diagnóstico y Escaneo de Periféricos I2C (Plug & Play)
                </h3>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                  Detección física de chips en el bus del ESP32 (Registrado en Supabase).
                </p>
              </div>

              <button
                type="button"
                onClick={handleTriggerI2CScan}
                disabled={scanningI2c}
                className="px-3.5 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400 text-cyan-300 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${scanningI2c ? 'animate-spin' : ''}`} />
                <span>{scanningI2c ? 'Escaneando...' : '🔍 Escanear Bus I2C'}</span>
              </button>
            </div>

            {i2cDevices.length === 0 ? (
              <div className="p-6 text-center text-xs font-mono text-slate-400 border border-dashed border-slate-800 rounded-xl">
                Presiona "Escanear Bus I2C" para consultar los periféricos conectados al microcontrolador.
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-900/90 text-cyan-400 border-b border-slate-800">
                    <tr>
                      <th className="p-3">DIRECCIÓN HEX</th>
                      <th className="p-3">CHIP / HARDWARE RECONOCIDO</th>
                      <th className="p-3">ESTADO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {i2cDevices.map((dev, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="p-3 font-bold text-cyan-300">{dev.dir || dev.addr || dev.dir_hex}</td>
                        <td className="p-3 text-white">{dev.chip || dev.tipo || dev.posible_chip || 'Periférico I2C'}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 w-fit">
                            <Check className="w-3 h-3" /> CONECTADO
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
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
