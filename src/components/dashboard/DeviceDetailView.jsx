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
  BellRing, 
  ShieldAlert, 
  Layers,
  Monitor,
  Check,
  Radio,
  Flame,
  Wind,
  Droplets,
  Clock
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

  // Identificación del tipo de máquina
  const tipoEquipo = (
    device?.meta?.config_deseada?.tipo || 
    device?.meta?.tipo || 
    device?.datos?.tipo || 
    'AUTOCLAVE'
  ).toUpperCase();

  const isVehicle = tipoEquipo === 'VEHICULO';
  const isPlc = tipoEquipo === 'UNIVERSAL_PLC' || tipoEquipo === 'PLC_GENERICO';
  const isAutoclave = !isVehicle && !isPlc;

  // Modal de Confirmación Operativa
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

  // Selector del Programa Clínico Activo (P1 a P6)
  const [programaSeleccionado, setProgramaSeleccionado] = useState(1);

  // ESTADOS DE BYPASSES DE BANCO DE PRUEBAS (Permite simular sensores físicamente ausentes)
  const [bypasses, setBypasses] = useState({
    puerta: true,
    sello: true,
    recamara: true,
    caldera: true
  });

  // Datos en vivo desde la telemetría del ESP32 (Core 0 a 800ms)
  const d = device?.datos || {};
  const relesFisicos = d.reles || {};
  const entradasFisicas = d.entradas || {};
  const tempCamara = parseFloat(d.temp_camara !== undefined ? d.temp_camara : 25.0);
  const presionBar = parseFloat(d.presion !== undefined ? d.presion : 0.0);
  const f0Score = parseFloat(d.f0_score !== undefined ? d.f0_score : device?.f0Score || 0.0);
  const segRestantes = d.seg_restantes || 0;
  const faseEnVivo = d.fase || 'EN ESPERA';
  const enCicloActivo = faseEnVivo !== 'EN ESPERA' && faseEnVivo !== 'CANCELADO' && faseEnVivo !== 'FINALIZADO CON EXITO';

  // Escáner I2C Real
  const [scanningI2C, setScanningI2C] = useState(false);
  const [chipsDetectados, setChipsDetectados] = useState([]);
  const [selectedChipDir, setSelectedChipDir] = useState('0x24');
  const [halMsg, setHalMsg] = useState('');

  // Direcciones y parámetros de hardware I2C
  const cfgDeseada = device?.meta?.config_deseada || {};
  const [addrLcd, setAddrLcd] = useState(cfgDeseada.addr_lcd || '0x27');
  const [lcdCols, setLcdCols] = useState(cfgDeseada.lcd_cols || 16);
  const [lcdRows, setLcdRows] = useState(cfgDeseada.lcd_rows || 2);
  const [addrRelays, setAddrRelays] = useState(cfgDeseada.addr_relays || '0x24');
  const [addrInputs, setAddrInputs] = useState(cfgDeseada.addr_inputs || '0x26');

  // Nombres libres y roles para las 8 Salidas
  const [nombresReles, setNombresReles] = useState({
    R1: 'Cierre Sello', R2: 'Succión Sello', R3: 'Alivio Sello', R4: 'Bomba Agua',
    R5: 'Resistencias Calor', R6: 'Bomba Vacío', R7: 'Purga / Desfogue', R8: 'Esterilizar'
  });

  const canEditHardware = userRole && !userRole.toLowerCase().includes('operador') && !userRole.toLowerCase().includes('cliente');

  // Odómetro y Mantenimiento
  const ciclos = Number(device?.meta?.ciclos_activos || d.cfg?.ciclos || 0);
  const limite = Number(device?.meta?.limite_mantenimiento || d.cfg?.lim_mant || 300);
  const pctMant = Math.min(100, Math.round((ciclos / (limite || 1)) * 100));
  const isBloqueado100 = Boolean(d.cfg?.fuera_servicio || pctMant >= 100);
  const isAlertaActiva = Boolean(pctMant >= 80);

  // Escuchar reporte I2C físico emitido por el ESP32
  useEffect(() => {
    if (device?.i2cReport && device.i2cReport.chips) {
      setChipsDetectados(device.i2cReport.chips);
      setScanningI2C(false);
      setHalMsg(`¡Reporte físico recibido! ${device.i2cReport.total || device.i2cReport.chips.length} chips detectados en bus I2C.`);
    }
  }, [device?.i2cReport]);

  // Sincronizar bypasses si la telemetría los reporta
  useEffect(() => {
    if (d.bypasses) {
      setBypasses(d.bypasses);
    }
  }, [d.bypasses]);

  useEffect(() => {
    localStorage.setItem('scada_detail_tab', activeTab);
  }, [activeTab]);

  const fetchMacLogs = async () => {
    if (!device?.mac) return;
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

  // =========================================================================
  // OPERACIONES DE CONTROL CLÍNICO DIRECTO HACIA EL ESP32 (HANKERILA HKL-EA8)
  // =========================================================================

  // 1. INICIAR CICLO CLÍNICO (P1 a P6)
  const handleIniciarCicloClinico = () => {
    if (isBloqueado100) {
      alert('⛔ ACCIÓN DENEGADA: Equipo fuera de servicio por mantenimiento preventivo alcanzado.');
      return;
    }

    const progInfo = [
      { id: 1, nombre: '134°C Instrumental Quirúrgico', tMeseta: '4m' },
      { id: 2, nombre: '121°C Material Termolábil / Gomas', tMeseta: '15m' },
      { id: 3, nombre: '134°C Ciclo Prion Extendido', tMeseta: '18m' },
      { id: 4, nombre: '121°C Líquidos / Soluciones', tMeseta: '5m' },
      { id: 5, nombre: 'Test Rápido de Cámara', tMeseta: '10m' },
      { id: 6, nombre: 'Test Ultrarrápido de Banco (1 min)', tMeseta: '1m' }
    ];

    const sel = progInfo.find(p => p.id === programaSeleccionado) || progInfo[0];

    setConfirmModal({
      isOpen: true,
      title: `Iniciar Ciclo P${sel.id}: ${sel.nombre}`,
      description: `¿Confirmas arrancar el ciclo en la placa [${device.mac.slice(-4)}]? Se presurizará el sello, se ejecutarán las rampas térmicas y se acumulará letalidad F0.`,
      actionType: 'START',
      onConfirm: () => {
        if (sendCommand) {
          sendCommand(device.mac, {
            cmd: 'INICIAR_CICLO',
            programa: sel.id
          });
        }
      }
    });
  };

  // 2. PARO DE EMERGENCIA
  const handleParoEmergencia = () => {
    setConfirmModal({
      isOpen: true,
      title: '¡PARO DE EMERGENCIA / ABORTAR CICLO!',
      description: `¿Confirmas desenergizar todas las salidas y despresurizar la cámara del equipo [${device.mac.slice(-4)}] de forma inmediata?`,
      actionType: 'STOP',
      onConfirm: () => {
        if (sendCommand) {
          sendCommand(device.mac, { cmd: 'ABORTAR_CICLO' });
        }
      }
    });
  };

  // 3. RESTABLECER ALARMA
  const handleRestablecerAlarma = () => {
    if (sendCommand) {
      sendCommand(device.mac, { cmd: 'RESET_ALARMA' });
    }
  };

  // 4. CONMUTAR BYPASS DE SENSORES DE BANCO EN VIVO
  const handleToggleBypass = (sensorKey) => {
    const nextVal = !bypasses[sensorKey];
    const nuevosBypasses = { ...bypasses, [sensorKey]: nextVal };
    setBypasses(nuevosBypasses);

    if (sendCommand) {
      sendCommand(device.mac, {
        cmd: 'SET_BYPASS',
        ...nuevosBypasses
      });
    }
  };

  // 5. APERTURA SEGURA DE PUERTA
  const handleAbrirPuertaSegura = () => {
    if (presionBar > 0.05f) {
      alert(`⛔ APERTURA BLOQUEADA: La cámara tiene presión residual (${presionBar.toFixed(2)} bar). Espera a que baje a 0.00 bar por seguridad.`);
      return;
    }
    if (sendCommand) {
      sendCommand(device.mac, { cmd: 'CMD_ABRIR_PUERTA' });
    }
  };

  // 6. CIERRE / INFLADO DE SELLO
  const handleCerrarSelloPuerta = () => {
    if (sendCommand) {
      sendCommand(device.mac, { cmd: 'CMD_CIERRE_PUERTA' });
    }
  };

  // 7. TOGGLE MANUAL DE RELÉ
  const handleToggleManualRelay = (canal, currentState) => {
    if (sendCommand) {
      sendCommand(device.mac, {
        cmd: 'SET_RELAY',
        canal: canal,
        val: !currentState
      });
    }
  };

  // 8. ESCANEAR I2C EN VIVO
  const handleScanI2C = () => {
    setScanningI2C(true);
    setHalMsg('Enviando orden física SCAN_HARDWARE a la placa...');
    if (sendCommand) {
      sendCommand(device.mac, { cmd: 'SCAN_HARDWARE' });
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full font-mono text-xs select-none">
      
      {/* BANNER DE FUERA DE SERVICIO POR ODÓMETRO */}
      {isBloqueado100 && (
        <div className="bg-rose-600/90 border-2 border-rose-400 p-3.5 rounded-2xl text-white flex items-center justify-between shadow-2xl animate-pulse">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-6 h-6 text-yellow-300 shrink-0" />
            <div>
              <p className="font-bold text-sm tracking-wider">🚨 EQUIPO FUERA DE SERVICIO // PROTOCOLO DE MANTENIMIENTO PREVENTIVO REQUERIDO</p>
              <p className="text-[11px] text-rose-200">El equipo ha cumplido su intervalo operativo ({ciclos}/{limite} ciclos). Salidas inhibidas por seguridad clínica.</p>
            </div>
          </div>
          <button
            onClick={() => sendCommand(device.mac, { cmd: 'RESET_ODOMETRO' })}
            className="px-3 py-1.5 bg-white text-rose-700 hover:bg-slate-100 font-bold text-xs rounded-xl shadow-lg shrink-0 font-sans"
          >
            Reautorizar Servicio (Reset Odómetro)
          </button>
        </div>
      )}

      {/* CABECERA PRINCIPAL */}
      <div className="ultra-glass p-4 rounded-2xl border border-cyan-500/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="flex items-center gap-3">
          {!isKioskMode && (
            <button
              onClick={onBack}
              className="p-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white flex items-center gap-1 text-xs"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Flota</span>
            </button>
          )}

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">
                {device?.meta?.alias?.toUpperCase() || `EQUIPO [${device.mac.slice(-4)}]`}
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-cyan-500/20 text-cyan-300 border-cyan-400">
                CLASE B CLÍNICO
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                enCicloActivo 
                  ? 'bg-amber-500/20 text-amber-300 border-amber-400 animate-pulse' 
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              }`}>
                {faseEnVivo}
              </span>
            </div>
            <p className="text-xs text-cyan-300">
              MAC: {device.mac} • {device?.meta?.cliente || 'Central Hospitalaria'} • {device?.meta?.modelo || 'HKL-EA8 Industrial'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <ClinicalTooltip
            title={CLINICAL_HELP.btn_anclar_terminal.title}
            description={CLINICAL_HELP.btn_anclar_terminal.desc}
            badge={CLINICAL_HELP.btn_anclar_terminal.badge}
            shortcut={CLINICAL_HELP.btn_anclar_terminal.action}
          >
            <button
              onClick={onToggleKiosk}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all ${
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

      {/* PESTAÑAS DE NAVEGACIÓN */}
      <div className="flex gap-2 overflow-x-auto pb-1 border-b border-slate-800">
        <button
          onClick={() => setActiveTab('sensores')}
          className={`py-2 px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all ${
            activeTab === 'sensores' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white bg-slate-900/60'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Cabina de Control & Ciclos</span>
        </button>

        {canEditHardware && (
          <button
            onClick={() => setActiveTab('hal_scanner')}
            className={`py-2 px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all ${
              activeTab === 'hal_scanner' ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30' : 'text-amber-400 hover:text-white bg-slate-900/60'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>Escáner I2C & Mapeo de Silicio</span>
          </button>
        )}

        <button
          onClick={() => setActiveTab('historial')}
          className={`py-2 px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all ${
            activeTab === 'historial' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white bg-slate-900/60'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Historial Clínico (ISO 17665)</span>
        </button>

        {canEditHardware && (
          <button
            onClick={() => setActiveTab('mantenimiento')}
            className={`py-2 px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all ${
              activeTab === 'mantenimiento' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white bg-slate-900/60'
            }`}
          >
            <Wrench className="w-4 h-4" />
            <span>Mantenimiento & Odómetro</span>
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 1. CABINA PRINCIPAL: CONTROL DE CICLOS, BYPASSES Y TELEMETRÍA EN VIVO     */}
      {/* ========================================================================= */}
      {activeTab === 'sensores' && (
        <div className="space-y-4">
          
          {/* TARJETAS DE MAGNITUDES TERMODINÁMICAS EN TIEMPO REAL */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="ultra-glass p-3.5 rounded-xl border border-cyan-500/30 text-center">
              <span className="text-[10px] font-mono text-cyan-400 block mb-1">TEMPERATURA CÁMARA</span>
              <p className="text-2xl font-bold font-mono text-white">{tempCamara.toFixed(1)} °C</p>
              <span className="text-[10px] text-slate-400">Sensor PT100 / A0</span>
            </div>

            <div className="ultra-glass p-3.5 rounded-xl border border-pink-500/30 text-center">
              <span className="text-[10px] font-mono text-pink-400 block mb-1">PRESIÓN VAPOR</span>
              <p className="text-2xl font-bold font-mono text-white">{presionBar.toFixed(2)} bar</p>
              <span className="text-[10px] text-slate-400">Transductor / A1</span>
            </div>

            <div className="ultra-glass p-3.5 rounded-xl border border-emerald-500/30 text-center">
              <span className="text-[10px] font-mono text-emerald-400 block mb-1">LETALIDAD (F0)</span>
              <p className="text-2xl font-bold font-mono text-emerald-300">{f0Score.toFixed(1)} min</p>
              <span className="text-[10px] text-emerald-400/80">Meta ISO ≥ 15m</span>
            </div>

            <div className="ultra-glass p-3.5 rounded-xl border border-amber-500/30 text-center">
              <span className="text-[10px] font-mono text-amber-400 block mb-1">TIEMPO RESTANTE</span>
              <p className="text-2xl font-bold font-mono text-white">
                {Math.floor(segRestantes / 60)}:{(segRestantes % 60).toString().padStart(2, '0')}
              </p>
              <span className="text-[10px] text-slate-400">Core 1 Clock</span>
            </div>
          </div>

          {/* BARRA DE MANDO OPERATIVO Y DISPARO DE PROGRAMAS */}
          <div className="ultra-glass p-4 rounded-xl border border-cyan-500/40 space-y-3">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-white flex items-center gap-1.5 uppercase">
                <Flame className="w-4 h-4 text-amber-400" />
                Mando de Operación de Ciclos:
              </span>
              <span className="text-[10px] text-slate-400">
                Selecciona un programa clínico y pulsa iniciar
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Selector de Programas */}
              <div className="sm:col-span-2">
                <label className="text-slate-300 block text-[10px] mb-1">Programa Clínico Normativo (EN 13060):</label>
                <select
                  disabled={enCicloActivo}
                  value={programaSeleccionado}
                  onChange={(e) => setProgramaSeleccionado(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-bold text-xs focus:border-cyan-400 disabled:opacity-50"
                >
                  <option value={1}>P1: 134°C Instrumental Quirúrgico (4 min meseta, 3 min secado)</option>
                  <option value={2}>P2: 121°C Material Termolábil / Gomas (15 min meseta, 5 min secado)</option>
                  <option value={3}>P3: 134°C Ciclo Prion Inactivación Proteica (18 min meseta)</option>
                  <option value={4}>P4: 121°C Líquidos / Soluciones Despresurización Lenta (5 min)</option>
                  <option value={5}>P5: Test Rápido de Penetración (10 min)</option>
                  <option value={6}>⚡ P6: Test Ultrarrápido de Banco (1 min meseta - Prueba de Mesa)</option>
                </select>
              </div>

              {/* Botones de Control Iniciar / Parar */}
              <div className="flex items-end gap-2">
                {enCicloActivo ? (
                  <button
                    type="button"
                    onClick={handleParoEmergencia}
                    className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-rose-600/30 animate-pulse"
                  >
                    <Square className="w-4 h-4 fill-white" />
                    <span>PARO DE EMERGENCIA</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleIniciarCicloClinico}
                    disabled={isBloqueado100}
                    className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25 disabled:opacity-50"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>INICIAR CICLO P{programaSeleccionado}</span>
                  </button>
                )}

                {faseEnVivo === 'CANCELADO' && (
                  <button
                    type="button"
                    onClick={handleRestablecerAlarma}
                    className="p-2.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-xl"
                    title="Restablecer Alarma y volver a reposo"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Mandos de Puerta Neumática */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[11px]">
              <span className="text-slate-400">Control Neumático de Puerta:</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCerrarSelloPuerta}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-400 text-slate-200 font-bold flex items-center gap-1"
                >
                  <Lock className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Inflar / Sellar Puerta</span>
                </button>
                <button
                  type="button"
                  onClick={handleAbrirPuertaSegura}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-amber-400 text-slate-200 font-bold flex items-center gap-1"
                >
                  <Wind className="w-3.5 h-3.5 text-amber-400" />
                  <span>Apertura Despresurizada</span>
                </button>
              </div>
            </div>
          </div>

          {/* PANEL DE BYPASSES Y SIMULACIÓN DE SENSORES EN VIVO */}
          <div className="ultra-glass p-4 rounded-xl border border-amber-500/30 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5 uppercase">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Bypasses de Banco & Simulación de Sensores (Para Pruebas en Mesa):
              </span>
              <span className="text-[10px] text-slate-400">
                Activa para simular que el sensor está físicamente conectado
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* Bypass Puerta */}
              <div 
                onClick={() => handleToggleBypass('puerta')}
                className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between transition-all ${
                  bypasses.puerta 
                    ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300' 
                    : 'bg-slate-950 border-slate-800 text-slate-500'
                }`}
              >
                <div>
                  <span className="font-bold text-[10px] block">SIMULAR PUERTA</span>
                  <span className="text-[9px]">{bypasses.puerta ? '🟢 CERRADA (BYPASS)' : '⚪ FÍSICA'}</span>
                </div>
                <div className={`w-8 h-4 rounded-full border p-0.5 flex items-center ${bypasses.puerta ? 'justify-end bg-emerald-500/20 border-emerald-400' : 'justify-start bg-slate-900 border-slate-700'}`}>
                  <span className={`w-3 h-3 rounded-full ${bypasses.puerta ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                </div>
              </div>

              {/* Bypass Sello */}
              <div 
                onClick={() => handleToggleBypass('sello')}
                className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between transition-all ${
                  bypasses.sello 
                    ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300' 
                    : 'bg-slate-950 border-slate-800 text-slate-500'
                }`}
              >
                <div>
                  <span className="font-bold text-[10px] block">SIMULAR SELLO</span>
                  <span className="text-[9px]">{bypasses.sello ? '🟢 SELLADO OK' : '⚪ FÍSICO'}</span>
                </div>
                <div className={`w-8 h-4 rounded-full border p-0.5 flex items-center ${bypasses.sello ? 'justify-end bg-emerald-500/20 border-emerald-400' : 'justify-start bg-slate-900 border-slate-700'}`}>
                  <span className={`w-3 h-3 rounded-full ${bypasses.sello ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                </div>
              </div>

              {/* Bypass Recámara */}
              <div 
                onClick={() => handleToggleBypass('recamara')}
                className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between transition-all ${
                  bypasses.recamara 
                    ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300' 
                    : 'bg-slate-950 border-slate-800 text-slate-500'
                }`}
              >
                <div>
                  <span className="font-bold text-[10px] block">PRESIÓN CÁMARA</span>
                  <span className="text-[9px]">{bypasses.recamara ? '🟢 BYPASS ACTIVO' : '⚪ FÍSICO'}</span>
                </div>
                <div className={`w-8 h-4 rounded-full border p-0.5 flex items-center ${bypasses.recamara ? 'justify-end bg-emerald-500/20 border-emerald-400' : 'justify-start bg-slate-900 border-slate-700'}`}>
                  <span className={`w-3 h-3 rounded-full ${bypasses.recamara ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                </div>
              </div>

              {/* Bypass Caldera */}
              <div 
                onClick={() => handleToggleBypass('caldera')}
                className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between transition-all ${
                  bypasses.caldera 
                    ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300' 
                    : 'bg-slate-950 border-slate-800 text-slate-500'
                }`}
              >
                <div>
                  <span className="font-bold text-[10px] block">VAPOR CALDERA</span>
                  <span className="text-[9px]">{bypasses.caldera ? '🟢 LISTA (BYPASS)' : '⚪ FÍSICA'}</span>
                </div>
                <div className={`w-8 h-4 rounded-full border p-0.5 flex items-center ${bypasses.caldera ? 'justify-end bg-emerald-500/20 border-emerald-400' : 'justify-start bg-slate-900 border-slate-700'}`}>
                  <span className={`w-3 h-3 rounded-full ${bypasses.caldera ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                </div>
              </div>
            </div>
          </div>

          {/* MATRIZ DE SUPERVISIÓN Y CONTROL MANUAL DE SALIDAS FÍSICAS (RELÉS R1 A R8) */}
          <div className="ultra-glass p-4 rounded-xl border border-slate-800 space-y-3">
            <span className="text-xs font-bold text-cyan-300 block uppercase">
              Estado de Salidas Físicas HKL-EA8 (PCF8574 en 0x24):
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(ch => {
                const isActive = Boolean(relesFisicos[`R${ch}`]);
                return (
                  <div key={ch} className="p-2.5 bg-slate-950/90 rounded-xl border border-slate-800 flex justify-between items-center">
                    <div>
                      <span className="text-white font-bold block text-[11px] truncate max-w-[110px]">
                        R{ch}: {nombresReles[`R${ch}`] || `Relé ${ch}`}
                      </span>
                      <span className="text-[9px] text-slate-400">
                        {isActive ? '🟢 ENERGIZADO' : '⚪ DESACTIVADO'}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={enCicloActivo}
                      onClick={() => handleToggleManualRelay(ch, isActive)}
                      className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all disabled:opacity-40 ${
                        isActive ? 'bg-emerald-500 text-slate-950 shadow-[0_0_10px_#10b981]' : 'bg-slate-800 text-slate-300 hover:text-white'
                      }`}
                    >
                      {isActive ? 'ON' : 'OFF'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* GRÁFICA TÉRMICA EN TIEMPO REAL */}
          <div className="ultra-glass p-4 rounded-2xl border border-cyan-500/30">
            <h3 className="text-xs font-bold text-cyan-300 mb-3">CURVA TÉRMICA & PRESIÓN EN TIEMPO REAL (ESP32)</h3>
            <SterilizationChart telemetryData={device.history || []} />
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. PESTAÑA ESCÁNER I2C EN VIVO                                            */}
      {/* ========================================================================= */}
      {activeTab === 'hal_scanner' && canEditHardware && (
        <div className="ultra-glass p-5 rounded-2xl border border-amber-500/30 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-amber-500/20 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-amber-400" />
                Escáner I2C en Vivo & Chips Físicos de Silicio
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Barrido físico de direcciones 0x01 a 0x7F para verificar chips conectados a la placa.
              </p>
            </div>

            <button
              onClick={handleScanI2C}
              disabled={scanningI2C}
              className="py-2 px-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl flex items-center gap-1.5 shadow-lg shadow-amber-500/20"
            >
              <Search className={`w-3.5 h-3.5 ${scanningI2C ? 'animate-spin' : ''}`} />
              <span>{scanningI2C ? 'Barrido Físico en Marcha...' : '🔍 Escanear Bus I2C'}</span>
            </button>
          </div>

          {chipsDetectados.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              {chipsDetectados.map(c => (
                <div key={c.dir} className="p-3 bg-slate-950 rounded-xl border border-amber-500/40">
                  <span className="text-amber-400 font-bold text-sm block">{c.dir}</span>
                  <span className="text-white text-xs font-semibold">{c.desc || 'Dispositivo I2C'}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 bg-slate-950 rounded-xl border border-slate-800">
              Presiona "Escanear Bus I2C" para consultar los chips físicos conectados al ESP32.
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. PESTAÑA HISTORIAL CLÍNICO Y REPORTES (ISO 17665)                       */}
      {/* ========================================================================= */}
      {activeTab === 'historial' && (
        <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-4">
          <div className="flex justify-between items-center border-b border-cyan-500/20 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <History className="w-4 h-4 text-cyan-400" />
              Expedientes de Esterilización en Supabase [{device.mac}]
            </h3>
            <button
              onClick={fetchMacLogs}
              className="px-2.5 py-1 bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded-lg hover:text-white"
            >
              🔄 Recargar
            </button>
          </div>

          <div className="rounded-xl border border-slate-800 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-cyan-400 border-b border-slate-800">
                <tr>
                  <th className="p-3">FECHA</th>
                  <th className="p-3">ID SESIÓN</th>
                  <th className="p-3">PROGRAMA</th>
                  <th className="p-3">PICO (T° / P)</th>
                  <th className="p-3">DIAGNÓSTICO</th>
                  <th className="p-3 text-center">CERTIFICADO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {loadingLogs ? (
                  <tr><td colSpan="6" className="p-8 text-center text-slate-400">Consultando Supabase...</td></tr>
                ) : macLogs.length === 0 ? (
                  <tr><td colSpan="6" className="p-8 text-center text-slate-400">Sin ciclos registrados aún en la nube.</td></tr>
                ) : (
                  macLogs.map((log) => (
                    <tr key={log.session_id} onClick={() => setInspectedSession(log)} className="hover:bg-slate-800/40 cursor-pointer">
                      <td className="p-3 text-white">{new Date(log.created_at || log.fecha).toLocaleDateString()}</td>
                      <td className="p-3 text-cyan-400">{log.session_id}</td>
                      <td className="p-3">{log.programa || '134°C'}</td>
                      <td className="p-3">T: {parseFloat(log.temp_max||0).toFixed(1)}°C | P: {parseFloat(log.pres_max||0).toFixed(2)}b</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          (log.diagnostico_principal || '').includes('CONFORME') 
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                            : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        }`}>
                          {log.diagnostico_principal || 'CONFORME'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <button onClick={() => setInspectedSession(log)} className="p-1 bg-slate-800 hover:bg-slate-700 rounded text-cyan-300">
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

      {/* ========================================================================= */}
      {/* 4. PESTAÑA MANTENIMIENTO & ODÓMETRO                                       */}
      {activeTab === 'mantenimiento' && canEditHardware && (
        <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-4 max-w-xl">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
            <Wrench className="w-4 h-4 text-cyan-400" />
            Odómetro Clínico & Intervalos de Servicio
          </h3>

          <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-800 space-y-3">
            <div className="flex justify-between text-xs text-slate-300">
              <span>Ciclos Completados Reales:</span>
              <span className="font-bold text-cyan-300">{ciclos} / {limite} ciclos</span>
            </div>

            <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-700">
              <div
                className={`h-full ${pctMant >= 100 ? 'bg-rose-500' : pctMant >= 80 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                style={{ width: `${pctMant}%` }}
              />
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-800">
              <span className="text-[11px] text-slate-400">
                Uso: <strong className={pctMant >= 100 ? 'text-rose-400' : 'text-emerald-400'}>{pctMant}%</strong> del ciclo de vida.
              </span>
              <button
                type="button"
                onClick={() => sendCommand(device.mac, { cmd: 'RESET_ODOMETRO' })}
                className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-[10px] font-bold"
              >
                Reiniciar Odómetro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modales Clínicos */}
      <SurgicalQRLabel isOpen={showQRModal} onClose={() => setShowQRModal(false)} deviceData={device} operatorName={operatorName} />
      <SessionDetailModal isOpen={inspectedSession !== null} onClose={() => setInspectedSession(null)} session={inspectedSession} />
      <ActionConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        description={confirmModal.description}
        actionType={confirmModal.actionType}
        deviceName={device?.meta?.alias || device?.mac}
        operatorName={operatorName}
      />
    </div>
  );
}
