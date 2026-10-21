import React, { useState, useEffect, useRef } from 'react';
import SterilizationChart from '../graphics/SterilizationChart';
import SurgicalQRLabel from '../labels/SurgicalQRLabel';
import SessionDetailModal from '../reports/SessionDetailModal';
import ClinicalTooltip from '../common/ClinicalTooltip';
import ActionConfirmModal from '../common/ActionConfirmModal';
import { CLINICAL_HELP } from '../../utils/clinicalDictionary';
import WidgetBoard from '../device/WidgetBoard';
import CycleHistoryPanel from '../device/CycleHistoryPanel';
import MaintenancePanel from '../device/MaintenancePanel';
import DeviceConfigPanel from '../device/DeviceConfigPanel';
import ServiceReportsView from '../service/ServiceReportsView';
import { fetchCycleStats } from '../../services/deviceService';
import { 
  Activity, 
  Flame, 
  Wind, 
  Lock, 
  ShieldCheck, 
  ShieldAlert, 
  Play, 
  Square, 
  RotateCcw, 
  ChevronLeft, 
  Pin, 
  PinOff, 
  QrCode, 
  History, 
  Wrench, 
  Cpu, 
  Search,
  LayoutGrid,
  Settings2,
  ClipboardList,
  Wifi,
  WifiOff
} from 'lucide-react';

// Catálogo normativo de programas clínicos (EN 13060)
const PROGRAMAS_CLINICOS = [
  { id: 1, nombre: '134°C Instrumental Quirúrgico (4 min meseta, 3 min secado)' },
  { id: 2, nombre: '121°C Material Termolábil / Gomas (15 min meseta, 5 min secado)' },
  { id: 3, nombre: '134°C Ciclo Prion Inactivación Proteica (18 min meseta)' },
  { id: 4, nombre: '121°C Líquidos / Soluciones Despresurización Lenta (5 min)' },
  { id: 5, nombre: 'Test Rápido de Penetración (10 min)' },
  { id: 6, nombre: '⚡ P6: Test Ultrarrápido de Banco (1 min meseta - Prueba de Mesa)' }
];

function DeviceSection({ id, title, subtitle, icon: Icon, children, accent = 'cyan' }) {
  return (
    <section id={`dev-sec-${id}`} className="device-section scroll-mt-32 ultra-glass rounded-2xl border border-slate-700/60 p-4 sm:p-5 space-y-4">
      <header className="flex items-center gap-2.5">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${accent === 'amber' ? 'bg-amber-500/15 text-amber-300' : 'bg-cyan-500/15 text-cyan-300'}`}><Icon className="w-[18px] h-[18px]" /></span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white tracking-wide">{title}</h3>
          {subtitle && <p className="text-[11px] text-slate-400 font-sans truncate">{subtitle}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

export default function DeviceDetailView({ 
  device, 
  onBack, 
  sendCommand, 
  operatorName, 
  userRole, 
  isKioskMode, 
  onToggleKiosk,
  onDeviceUpdated,
  isAdmin = false
}) {
  const [showQRModal, setShowQRModal] = useState(false);

  // Identificación del tipo de máquina
  const tipoEquipo = (
    device?.meta?.config_deseada?.tipo || 
    device?.meta?.tipo || 
    device?.datos?.tipo || 
    'AUTOCLAVE'
  ).toUpperCase();

  // Modal de Confirmación Operativa (FDA 21 CFR Part 11)
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    description: '',
    actionType: 'WARNING',
    onConfirm: () => {}
  });

  const [cycleStats, setCycleStats] = useState([]);
  const [activeSection, setActiveSection] = useState('panel');
  const navRef = useRef(null);
  const [inspectedSession, setInspectedSession] = useState(null);

  // Programa Clínico Activo
  const [programaSeleccionado, setProgramaSeleccionado] = useState(1);

  // Bypasses de Banco de Pruebas
  const [bypasses, setBypasses] = useState({
    puerta: true,
    sello: true,
    recamara: true,
    caldera: true
  });

  // Telemetría en vivo del ESP32
  const d = device?.datos || {};
  const relesFisicos = d.reles || {};
  const tempCamara = parseFloat(d.temp_camara !== undefined ? d.temp_camara : 25.0);
  const presionBar = parseFloat(d.presion !== undefined ? d.presion : 0.0);
  const f0Score = parseFloat(d.f0_score !== undefined ? d.f0_score : (device?.f0Score || 0.0));
  const segRestantes = d.seg_restantes || 0;
  const faseEnVivo = d.fase || 'EN ESPERA';
  const enCicloActivo = !/^(EN[ _]?ESPERA|ESPERA|APAGADO|CANCELADO|FINALIZADO.*|LISTO|IDLE)$/i.test(String(faseEnVivo).trim());

  // Escáner I2C Real
  const [scanningI2C, setScanningI2C] = useState(false);
  const [chipsDetectados, setChipsDetectados] = useState([]);

  // Nombres para las 8 Salidas
  const [nombresReles] = useState({
    R1: 'Cierre Sello', R2: 'Succión Sello', R3: 'Alivio Sello', R4: 'Bomba Agua',
    R5: 'Resistencias Calor', R6: 'Bomba Vacío', R7: 'Purga / Desfogue', R8: 'Esterilizar'
  });

  const canEditHardware = Boolean(userRole && !userRole.toLowerCase().includes('operador') && !userRole.toLowerCase().includes('cliente'));

  // Odómetro y Mantenimiento Seguro
  const meta = device?.meta || {};
  const lastService = meta.ultimo_mantenimiento ? new Date(meta.ultimo_mantenimiento).toISOString() : null;
  const cloudSinceService = lastService ? cycleStats.filter((r) => r.created_at > lastService).length : cycleStats.length;
  const ciclos = Math.max(Number(meta.ciclos_activos || 0), cloudSinceService, lastService ? 0 : Number(d.cfg?.ciclos || 0));
  const limite = Math.max(1, Number(meta.limite_mantenimiento || d.cfg?.lim_mant || 300));
  const historicos = Math.max(
    Number(meta.ciclos_historicos || 0),
    cycleStats.length,
    ...cycleStats.map((r) => Number(r.ciclos_acumulados || 0)),
    ciclos
  );
  const alertaPct = Number(meta.alerta_porcentaje || d.cfg?.alerta_pct || 80);
  const odometer = { ciclos, limite, historicos, alertaPct };
  const isOnline = Date.now() - (device?.lastSeen || 0) < 15000;
  const pctMant = Math.min(100, Math.round((ciclos / limite) * 100));
  const isBloqueado100 = Boolean(d.cfg?.fuera_servicio || pctMant >= 100);

  // Sincronizar reporte I2C si la placa lo envía
  useEffect(() => {
    if (device?.i2cReport?.chips) {
      setChipsDetectados(device.i2cReport.chips);
      setScanningI2C(false);
    }
  }, [device?.i2cReport]);

  // Sincronizar bypasses desde telemetría
  useEffect(() => {
    if (d.bypasses) {
      setBypasses(d.bypasses);
    }
  }, [d.bypasses]);

  useEffect(() => {
    let alive = true;
    if (device?.mac) fetchCycleStats(device.mac).then((rows) => { if (alive) setCycleStats(rows); }).catch(() => {});
    return () => { alive = false; };
  }, [device?.mac]);

  const sections = [
    { id: 'panel', label: 'Panel', icon: LayoutGrid },
    { id: 'cabina', label: 'Cabina', icon: Activity },
    { id: 'ciclos', label: 'Ciclos', icon: History },
    { id: 'mantenimiento', label: 'Mantenimiento', icon: Wrench },
    { id: 'servicio', label: 'Reportes', icon: ClipboardList },
    { id: 'config', label: 'Configuración', icon: Settings2 },
    ...(canEditHardware ? [{ id: 'hardware', label: 'Hardware', icon: Cpu }] : [])
  ];

  useEffect(() => {
    const els = sections.map((s) => document.getElementById(`dev-sec-${s.id}`)).filter(Boolean);
    if (!els.length || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((entries) => {
      const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (hit) setActiveSection(hit.target.id.replace('dev-sec-', ''));
    }, { rootMargin: '-30% 0px -60% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [canEditHardware, device?.mac]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const strip = navRef.current;
    const btn = strip?.querySelector(`[data-sec="${activeSection}"]`);
    if (btn) strip.scrollTo({ left: btn.offsetLeft - (strip.clientWidth - btn.offsetWidth) / 2, behavior: 'smooth' });
  }, [activeSection]);

  const goToSection = (id) => {
    setActiveSection(id);
    document.getElementById(`dev-sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleDeviceUpdated = (row) => onDeviceUpdated?.(row);

  // =========================================================================
  // CONTROL DIRECTO AL ESP32
  // =========================================================================

  // 1. Iniciar Ciclo
  const handleIniciarCicloClinico = () => {
    if (isBloqueado100) {
      alert('⛔ ACCIÓN DENEGADA: Equipo fuera de servicio por mantenimiento preventivo alcanzado.');
      return;
    }

    const sel = PROGRAMAS_CLINICOS.find(p => p.id === programaSeleccionado) || PROGRAMAS_CLINICOS[0];

    setConfirmModal({
      isOpen: true,
      title: `Iniciar Ciclo P${sel.id}`,
      description: `¿Confirmas arrancar el programa en la placa [${device.mac.slice(-4)}]? Se presurizará el sello e iniciará la integración F0.`,
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

  // 2. Paro de Emergencia
  const handleParoEmergencia = () => {
    setConfirmModal({
      isOpen: true,
      title: '¡PARO DE EMERGENCIA / ABORTAR CICLO!',
      description: `¿Confirmas desenergizar salidas y despresurizar la cámara de [${device.mac.slice(-4)}] inmediatamente?`,
      actionType: 'STOP',
      onConfirm: () => {
        if (sendCommand) {
          sendCommand(device.mac, { cmd: 'ABORTAR_CICLO' });
        }
      }
    });
  };

  // 3. Restablecer Alarma
  const handleRestablecerAlarma = () => {
    if (sendCommand) {
      sendCommand(device.mac, { cmd: 'RESET_ALARMA' });
    }
  };

  // 4. Conmutar Bypass de Sensores
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

  // 5. Apertura Segura de Puerta (Corrección de sintaxis 0.05f -> 0.05)
  const handleAbrirPuertaSegura = () => {
    if (presionBar > 0.05) {
      alert(`⛔ APERTURA BLOQUEADA: La cámara tiene presión residual (${presionBar.toFixed(2)} bar). Espera a que baje a 0.00 bar por seguridad.`);
      return;
    }
    if (sendCommand) {
      sendCommand(device.mac, { cmd: 'CMD_ABRIR_PUERTA' });
    }
  };

  // 6. Cierre / Inflado de Sello
  const handleCerrarSelloPuerta = () => {
    if (sendCommand) {
      sendCommand(device.mac, { cmd: 'CMD_CIERRE_PUERTA' });
    }
  };

  // 7. Toggle Manual de Relé
  const handleToggleManualRelay = (canal, currentState) => {
    if (sendCommand) {
      sendCommand(device.mac, {
        cmd: 'SET_RELAY',
        canal,
        val: !currentState
      });
    }
  };

  // 8. Escaneo I2C
  const handleScanI2C = () => {
    setScanningI2C(true);
    if (sendCommand) {
      sendCommand(device.mac, { cmd: 'SCAN_HARDWARE' });
    }
  };


  const pctTone = pctMant >= 100 ? 'text-rose-300' : pctMant >= alertaPct ? 'text-amber-300' : 'text-emerald-300';

  return (
    <div className="device-detail-view flex flex-col gap-4 w-full font-mono text-xs select-none">

      {isBloqueado100 && (
        <div className="bg-rose-600/90 border-2 border-rose-400 p-3.5 rounded-2xl text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xl">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-6 h-6 text-yellow-300 shrink-0" />
            <div>
              <p className="font-bold text-sm tracking-wide">Equipo fuera de servicio · mantenimiento requerido</p>
              <p className="text-[11px] text-rose-100">Límite alcanzado ({ciclos}/{limite} ciclos). Salidas inhibidas.</p>
            </div>
          </div>
          <button type="button" onClick={() => goToSection('mantenimiento')} className="px-3 py-1.5 bg-white text-rose-700 font-bold text-xs rounded-xl shrink-0 font-sans">Registrar servicio</button>
        </div>
      )}

      <div className="device-hero ultra-glass rounded-2xl border border-cyan-500/30 p-4 sm:p-5 space-y-4 overflow-hidden relative">
        <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {!isKioskMode && (
              <button type="button" onClick={onBack} aria-label="Volver a la flota" className="p-2 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-300 hover:text-white shrink-0">
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-wide truncate">{meta.alias || `EQUIPO [${device.mac.slice(-4)}]`}</h2>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${isOnline ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' : 'bg-slate-800 text-slate-400 border-slate-600'}`}>
                  {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}{isOnline ? 'EN LÍNEA' : 'SIN SEÑAL'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">{[meta.marca && meta.marca.replace(/_/g, ' '), meta.modelo].filter(Boolean).join(' · ') || 'Modelo sin asignar'}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">{tipoEquipo.replace('_', ' ')}</span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${enCicloActivo ? 'bg-amber-500/15 text-amber-300 border-amber-400/50 animate-pulse' : 'bg-slate-800/80 text-slate-300 border-slate-700'}`}>{faseEnVivo}</span>
                <span className="px-2 py-0.5 rounded-md text-[10px] bg-slate-800/80 text-slate-400 border border-slate-700">{device.mac}</span>
                {(meta.cliente || meta.departamento) && <span className="px-2 py-0.5 rounded-md text-[10px] bg-slate-800/80 text-slate-400 border border-slate-700 truncate max-w-full">{[meta.cliente, meta.departamento].filter(Boolean).join(' · ')}</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <ClinicalTooltip
              title={CLINICAL_HELP.btn_anclar_terminal.title}
              description={CLINICAL_HELP.btn_anclar_terminal.desc}
              badge={CLINICAL_HELP.btn_anclar_terminal.badge}
              shortcut={CLINICAL_HELP.btn_anclar_terminal.action}
            >
              <button
                type="button"
                onClick={onToggleKiosk}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all ${isKioskMode ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-cyan-400'}`}
              >
                {isKioskMode ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{isKioskMode ? 'Desanclar' : 'Anclar'}</span>
              </button>
            </ClinicalTooltip>
            <button type="button" onClick={() => setShowQRModal(true)} className="px-3 py-2 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-xl flex items-center gap-1.5">
              <QrCode className="w-4 h-4" /><span className="hidden sm:inline">Etiqueta QR</span>
            </button>
          </div>
        </div>

        <div className="relative grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            ['Temperatura', `${tempCamara.toFixed(1)}`, '°C', 'text-white'],
            ['Presión', presionBar.toFixed(2), 'bar', 'text-white'],
            ['F0', f0Score.toFixed(1), 'min', 'text-emerald-300'],
            ['Restante', `${Math.floor(segRestantes / 60)}:${(segRestantes % 60).toString().padStart(2, '0')}`, '', 'text-white'],
            ['Servicio', `${pctMant}%`, `${ciclos}/${limite}`, pctTone]
          ].map(([label, value, unit, cls], idx) => (
            <div key={label} className={`rounded-xl bg-slate-950/60 border border-slate-800 px-3 py-2 ${idx === 4 ? 'col-span-2 sm:col-span-1' : ''}`}>
              <span className="block text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
              <span className={`text-lg sm:text-xl font-bold ${cls}`}>{value}</span>
              {unit && <span className="text-[10px] text-slate-400 ml-1">{unit}</span>}
            </div>
          ))}
        </div>
      </div>

      <nav className="device-section-nav sticky top-14 sm:top-16 z-30 -mx-1 px-1 py-1.5">
        <div ref={navRef} className="flex gap-1.5 overflow-x-auto no-scrollbar p-1 rounded-2xl bg-slate-950/80 backdrop-blur-md border border-slate-800">
          {sections.map((s) => {
            const Icon = s.icon;
            const active = activeSection === s.id;
            return (
              <button
                key={s.id}
                type="button"
                data-sec={s.id}
                onClick={() => goToSection(s.id)}
                aria-current={active ? 'true' : undefined}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap flex items-center gap-1.5 transition-all ${active ? 'bg-cyan-500 text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.45)]' : 'text-slate-400 hover:text-white'}`}
              >
                <Icon className="w-3.5 h-3.5" />{s.label}
              </button>
            );
          })}
        </div>
      </nav>

      <DeviceSection id="panel" title="Panel del equipo" subtitle="Widgets en vivo personalizables" icon={LayoutGrid}>
        <WidgetBoard
          device={device}
          canEdit={canEditHardware}
          sendCommand={sendCommand}
          enCicloActivo={enCicloActivo}
          odometer={odometer}
          onSaved={handleDeviceUpdated}
          onConfirm={({ title, description, onConfirm }) => setConfirmModal({ isOpen: true, title, description, actionType: 'WARNING', onConfirm })}
        />
      </DeviceSection>

      <DeviceSection id="cabina" title="Cabina de control" subtitle="Programas, puerta, simulación y salidas físicas" icon={Flame}>
        <div className="space-y-4">
          {/* Mando de Ciclos */}
          <div className="ultra-glass p-4 rounded-xl border border-cyan-500/40 space-y-3">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-white flex items-center gap-1.5 uppercase">
                <Flame className="w-4 h-4 text-amber-400" />
                Mando de Operación de Ciclos:
              </span>
              <span className="text-[10px] text-slate-400">
                Selecciona un programa normativo e inicia la secuencia
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="text-slate-300 block text-[10px] mb-1">Programa Clínico Normativo (EN 13060):</label>
                <select
                  disabled={enCicloActivo}
                  value={programaSeleccionado}
                  onChange={(e) => setProgramaSeleccionado(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-bold text-xs focus:border-cyan-400 disabled:opacity-50"
                >
                  {PROGRAMAS_CLINICOS.map((p) => (
                    <option key={p.id} value={p.id}>P{p.id}: {p.nombre}</option>
                  ))}
                </select>
              </div>

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
                    title="Restablecer Alarma"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Puerta Neumática */}
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

          {/* Bypasses de Banco */}
          <div className="ultra-glass p-4 rounded-xl border border-amber-500/30 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5 uppercase">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Bypasses de Banco & Simulación de Sensores:
              </span>
              <span className="text-[10px] text-slate-400">
                Simula presencia física en mesa de prueba
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {['puerta', 'sello', 'recamara', 'caldera'].map((key) => {
                const isActive = Boolean(bypasses[key]);
                const labels = {
                  puerta: 'SIMULAR PUERTA',
                  sello: 'SIMULAR SELLO',
                  recamara: 'PRESIÓN CÁMARA',
                  caldera: 'VAPOR CALDERA'
                };

                return (
                  <div 
                    key={key}
                    onClick={() => handleToggleBypass(key)}
                    className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between transition-all ${
                      isActive 
                        ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300' 
                        : 'bg-slate-950 border-slate-800 text-slate-500'
                    }`}
                  >
                    <div>
                      <span className="font-bold text-[10px] block">{labels[key]}</span>
                      <span className="text-[9px]">{isActive ? '🟢 ACTIVO' : '⚪ FÍSICO'}</span>
                    </div>
                    <div className={`w-8 h-4 rounded-full border p-0.5 flex items-center ${isActive ? 'justify-end bg-emerald-500/20 border-emerald-400' : 'justify-start bg-slate-900 border-slate-700'}`}>
                      <span className={`w-3 h-3 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Matriz de Salidas (Relés) */}
          <div className="ultra-glass p-4 rounded-xl border border-slate-800 space-y-3">
            <span className="text-xs font-bold text-cyan-300 block uppercase">
              Estado de Salidas Físicas HKL-EA8 (0x24):
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

          {/* Gráfica Térmica */}
          <div className="ultra-glass p-4 rounded-2xl border border-cyan-500/30">
            <h3 className="text-xs font-bold text-cyan-300 mb-3 uppercase">Curva Térmica & Presión en Tiempo Real (ESP32)</h3>
            <SterilizationChart telemetryData={device.history || []} />
          </div>
        </div>
      </DeviceSection>

      <DeviceSection id="ciclos" title="Historial de ciclos" subtitle="Expedientes de esterilización guardados en la nube" icon={History}>
        <CycleHistoryPanel mac={device.mac} stats={cycleStats} onInspect={setInspectedSession} />
      </DeviceSection>

      <DeviceSection id="mantenimiento" title="Mantenimiento y odómetro" subtitle="Contadores reales, planes y servicios registrados" icon={Wrench}>
        <MaintenancePanel
          device={device}
          odometer={odometer}
          stats={cycleStats}
          canEdit={canEditHardware}
          operatorName={operatorName}
          sendCommand={sendCommand}
          onDeviceUpdated={handleDeviceUpdated}
        />
      </DeviceSection>

      <DeviceSection id="servicio" title="Reportes de servicio" subtitle="Fallas reportadas y atención técnica de este equipo" icon={ClipboardList}>
        <ServiceReportsView fleet={{ [device.mac]: device }} fixedMac={device.mac} operatorName={operatorName} isAdmin={isAdmin} embedded />
      </DeviceSection>

      <DeviceSection id="config" title="Configuración del equipo" subtitle="Identidad, tipo, modelo y asignación" icon={Settings2}>
        <DeviceConfigPanel device={device} canEdit={canEditHardware} sendCommand={sendCommand} onDeviceUpdated={handleDeviceUpdated} />
      </DeviceSection>

      {canEditHardware && (
        <DeviceSection id="hardware" title="Hardware y bus I2C" subtitle="Chips detectados en la placa" icon={Cpu} accent="amber">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-amber-500/20 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-amber-400" />
                Escáner I2C en Vivo & Chips Físicos de Silicio
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Barrido físico de direcciones 0x01 a 0x7F en el Núcleo 1 del ESP32.
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
              Presiona "Escanear Bus I2C" para consultar los chips físicos conectados al bus I2C del ESP32.
            </div>
          )}
        </div>
        </DeviceSection>
      )}

      <SurgicalQRLabel isOpen={showQRModal} onClose={() => setShowQRModal(false)} deviceData={device} operatorName={operatorName} />
      <SessionDetailModal isOpen={inspectedSession !== null} onClose={() => setInspectedSession(null)} session={inspectedSession} />
      <ActionConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        description={confirmModal.description}
        actionType={confirmModal.actionType}
        deviceName={meta.alias || device?.mac}
        operatorName={operatorName}
      />
    </div>
  );
}
