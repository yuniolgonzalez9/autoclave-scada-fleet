import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSwipe, stepThrough } from '../../hooks/useSwipe';
import SwipeDots from '../common/SwipeDots';
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
import { ActionTile, DoorOpen, ProgramPicker, ToggleTile, iconFor } from '../device/controls';
import { fetchCycleStats } from '../../services/deviceService';
import { useNow } from '../../hooks/useNow';
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
  WifiOff,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';

// Catálogo normativo de programas clínicos (EN 13060)
const PROGRAMAS_CLINICOS = [
  { id: 1, nombre: '134°C Instrumental Quirúrgico (4 min meseta, 3 min secado)' },
  { id: 2, nombre: '121°C Material Termolábil / Gomas (15 min meseta, 5 min secado)' },
  { id: 3, nombre: '134°C Ciclo Prion Inactivación Proteica (18 min meseta)' },
  { id: 4, nombre: '121°C Líquidos / Soluciones Despresurización Lenta (5 min)' },
  { id: 5, nombre: 'Test Rápido de Penetración (10 min)' },
  { id: 6, nombre: 'P6: Test Ultrarrápido de Banco (1 min meseta - Prueba de Mesa)' }
];

function DeviceSection({ id, title, subtitle, icon: Icon, children, accent = 'cyan', active, dir }) {
  if (!active) return null;
  return (
    <section 
      id={`dev-sec-${id}`} 
      className={`device-section ${dir === 'prev' ? 'swipe-enter-prev' : dir === 'next' ? 'swipe-enter-next' : ''} scroll-mt-32 ultra-glass rounded-2xl border border-slate-700/60 p-4 sm:p-5 space-y-4`}
    >
      <header className="flex items-center gap-2.5">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
          accent === 'amber' ? 'bg-amber-500/15 text-amber-300' : 'bg-cyan-500/15 text-cyan-300'
        }`}>
          <Icon className="w-[18px] h-[18px]" />
        </span>
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
  const [activeSection, setActiveSection] = useState(() => sessionStorage.getItem('scada_device_section') || 'panel');
  const [sectionDir, setSectionDir] = useState('none');
  const rootRef = useRef(null);
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
  const segRestantes = Number(d.seg_restantes || 0);
  const faseEnVivo = String(d.fase || 'EN ESPERA').toUpperCase();
  const enCicloActivo = !/^(EN[ _]?ESPERA|ESPERA|APAGADO|CANCELADO|FINALIZADO.*|LISTO|IDLE)$/i.test(faseEnVivo.trim());

  // Escáner I2C Local
  const [scanningI2C, setScanningI2C] = useState(false);
  const [chipsDetectados, setChipsDetectados] = useState([]);
  const scanI2CTimeoutRef = useRef(null);

  // Nombres para las 8 Salidas
  const [nombresReles] = useState({
    R1: 'Cierre Sello', R2: 'Succión Sello', R3: 'Alivio Sello', R4: 'Bomba Agua',
    R5: 'Resistencias Calor', R6: 'Bomba Vacío', R7: 'Purga / Desfogue', R8: 'Esterilizar'
  });

  const canEditHardware = Boolean(
    userRole && 
    !userRole.toLowerCase().includes('operador') && 
    !userRole.toLowerCase().includes('cliente')
  );

  // Odómetro y Mantenimiento
  const meta = device?.meta || {};
  const lastService = meta.ultimo_mantenimiento ? new Date(meta.ultimo_mantenimiento).toISOString() : null;
  const cloudSinceService = lastService ? cycleStats.filter((r) => r.created_at > lastService).length : cycleStats.length;
  const ciclos = Math.max(Number(meta.ciclos_activos || 0), cloudSinceService, lastService ? 0 : Number(d.cfg?.ciclos || 0));
  const limite = Math.max(10, Number(meta.limite_mantenimiento || d.cfg?.lim_mant || 300));
  const historicos = Math.max(
    Number(meta.ciclos_historicos || 0),
    cycleStats.length,
    ...cycleStats.map((r) => Number(r.ciclos_acumulados || 0)),
    ciclos
  );
  const alertaPct = Number(meta.alerta_porcentaje || d.cfg?.alerta_pct || 80);
  const healthNow = useNow(2000);
  const odometer = { ciclos, limite, historicos, alertaPct };
  const isOnline = healthNow - (device?.lastSeen || 0) < 15000;
  const pctMant = Math.min(100, Math.round((ciclos / limite) * 100));
  const isBloqueado100 = Boolean(d.cfg?.fuera_servicio || pctMant >= 100);

  // Sincronizar reporte I2C si la placa lo envía
  useEffect(() => {
    if (device?.i2cReport?.chips) {
      if (scanI2CTimeoutRef.current) {
        clearTimeout(scanI2CTimeoutRef.current);
      }
      queueMicrotask(() => {
        setChipsDetectados(device.i2cReport.chips);
        setScanningI2C(false);
      });
    }
  }, [device?.i2cReport]);

  // Sincronizar bypasses desde telemetría
  useEffect(() => {
    if (d.bypasses) {
      const nextBypasses = d.bypasses;
      queueMicrotask(() => setBypasses(nextBypasses));
    }
  }, [d.bypasses]);

  useEffect(() => {
    let alive = true;
    if (device?.mac) {
      fetchCycleStats(device.mac)
        .then((rows) => { if (alive) setCycleStats(rows); })
        .catch(() => {});
    }
    return () => { alive = false; };
  }, [device?.mac]);

  const sections = useMemo(() => [
    { id: 'panel', label: 'Panel', icon: LayoutGrid },
    { id: 'cabina', label: 'Cabina', icon: Activity },
    { id: 'ciclos', label: 'Ciclos', icon: History },
    { id: 'mantenimiento', label: 'Mantenimiento', icon: Wrench },
    { id: 'servicio', label: 'Reportes', icon: ClipboardList },
    { id: 'config', label: 'Configuración', icon: Settings2 },
    ...(canEditHardware ? [{ id: 'hardware', label: 'Hardware', icon: Cpu }] : [])
  ], [canEditHardware]);

  useEffect(() => {
    const strip = navRef.current;
    const btn = strip?.querySelector(`[data-sec="${activeSection}"]`);
    if (btn) {
      strip.scrollTo({ left: btn.offsetLeft - (strip.clientWidth - btn.offsetWidth) / 2, behavior: 'smooth' });
    }
  }, [activeSection]);

  const sectionIds = useMemo(() => sections.map((sec) => sec.id), [sections]);
  const sectionIndex = Math.max(0, sectionIds.indexOf(activeSection));
  const currentSection = sectionIds.includes(activeSection) ? activeSection : 'panel';

  const goToSection = useCallback((id) => {
    const to = sectionIds.indexOf(id);
    setSectionDir(to > sectionIndex ? 'next' : to < sectionIndex ? 'prev' : 'none');
    setActiveSection(id);
    sessionStorage.setItem('scada_device_section', id);
  }, [sectionIds, sectionIndex]);

  useSwipe(rootRef, {
    onSwipeLeft: () => stepThrough(sectionIds, currentSection, 1, goToSection),
    onSwipeRight: () => stepThrough(sectionIds, currentSection, -1, goToSection)
  });

  const handleDeviceUpdated = (row) => onDeviceUpdated?.(row);

  const cleanMac = useMemo(() => {
    return (device?.mac || '').toUpperCase().replace(/[:-]/g, '');
  }, [device?.mac]);

  // =========================================================================
  // CONTROL DIRECTO AL MICROCONTROLADOR POR MQTT
  // =========================================================================

  // 1. Iniciar Ciclo Clínico
  const handleIniciarCicloClinico = () => {
    if (isBloqueado100) {
      alert('ACCION DENEGADA: El equipo está fuera de servicio por límite de mantenimiento alcanzado. Registre el servicio técnico para desbloquear.');
      return;
    }

    const sel = PROGRAMAS_CLINICOS.find((p) => p.id === programaSeleccionado) || PROGRAMAS_CLINICOS[0];

    setConfirmModal({
      isOpen: true,
      title: `Iniciar Ciclo P${sel.id}`,
      description: `¿Confirma el inicio del programa en la unidad [${cleanMac.slice(-4)}]? Se presurizará la cámara y comenzará el cálculo de letalidad térmica F0.`,
      actionType: 'START',
      onConfirm: () => {
        if (sendCommand && cleanMac) {
          sendCommand(cleanMac, {
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
      title: 'PARO DE EMERGENCIA / ABORTAR CICLO',
      description: `ADVERTENCIA: ¿Confirma desenergizar todas las salidas y aliviar la presión de la cámara en [${cleanMac.slice(-4)}] de forma inmediata?`,
      actionType: 'STOP',
      onConfirm: () => {
        if (sendCommand && cleanMac) {
          sendCommand(cleanMac, { cmd: 'ABORTAR_CICLO' });
        }
      }
    });
  };

  // 3. Restablecer Alarma
  const handleRestablecerAlarma = () => {
    if (sendCommand && cleanMac) {
      sendCommand(cleanMac, { cmd: 'RESET_ALARMA' });
    }
  };

  // 4. Conmutar Bypass de Sensores
  const handleToggleBypass = (sensorKey) => {
    const nextVal = !bypasses[sensorKey];
    const nuevosBypasses = { ...bypasses, [sensorKey]: nextVal };
    setBypasses(nuevosBypasses);

    if (sendCommand && cleanMac) {
      sendCommand(cleanMac, {
        cmd: 'SET_BYPASS',
        ...nuevosBypasses
      });
    }
  };

  // 5. Apertura Segura de Puerta con Interlock de Presión
  const handleAbrirPuertaSegura = () => {
    if (enCicloActivo) {
      alert('INTERLOCK DE SEGURIDAD: No es posible abrir la puerta mientras se ejecuta un ciclo clínico.');
      return;
    }

    if (presionBar > 0.05) {
      alert(`APERTURA BLOQUEADA: La cámara registra presión positiva residual (${presionBar.toFixed(2)} bar). Espere a la despresurización total a 0.00 bar para evitar riesgos de eyección térmica.`);
      return;
    }

    if (sendCommand && cleanMac) {
      sendCommand(cleanMac, { cmd: 'CMD_ABRIR_PUERTA' });
    }
  };

  // 6. Cierre / Inflado de Sello
  const handleCerrarSelloPuerta = () => {
    if (sendCommand && cleanMac) {
      sendCommand(cleanMac, { cmd: 'CMD_CIERRE_PUERTA' });
    }
  };

  // 7. Toggle Manual de Relé
  const handleToggleManualRelay = (canal, currentState) => {
    if (enCicloActivo) {
      alert('Las salidas manuales están bloqueadas durante la ejecución de un ciclo automatizado.');
      return;
    }

    if (sendCommand && cleanMac) {
      sendCommand(cleanMac, {
        cmd: 'SET_RELAY',
        canal,
        val: !currentState
      });
    }
  };

  // 8. Escaneo I2C con Timeout
  const handleScanI2C = () => {
    if (!sendCommand || !cleanMac) return;

    setScanningI2C(true);
    sendCommand(cleanMac, { cmd: 'SCAN_HARDWARE' });

    if (scanI2CTimeoutRef.current) {
      clearTimeout(scanI2CTimeoutRef.current);
    }

    scanI2CTimeoutRef.current = setTimeout(() => {
      setScanningI2C(false);
    }, 4000);
  };

  return (
    <div ref={rootRef} className="device-detail-view flex flex-col gap-4 w-full font-mono text-xs select-none">

      {/* Alerta de bloqueo por servicio */}
      {isBloqueado100 && (
        <div className="bg-rose-600/90 border-2 border-rose-400 p-3.5 rounded-2xl text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xl">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-6 h-6 text-yellow-300 shrink-0" />
            <div>
              <p className="font-bold text-sm tracking-wide">EQUIPO FUERA DE SERVICIO · MANTENIMIENTO PREVENTIVO REQUERIDO</p>
              <p className="text-[11px] text-rose-100">Límite alcanzado ({ciclos}/{limite} ciclos). Salidas inhibidas para proteger la carga quirúrgica.</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={() => goToSection('mantenimiento')} 
            className="px-3 py-1.5 bg-white text-rose-700 font-bold text-xs rounded-xl shrink-0 font-sans shadow"
          >
            Registrar Servicio Técnico
          </button>
        </div>
      )}

      {/* Banner Principal del Dispositivo */}
      <div className="device-hero ultra-glass rounded-2xl border border-cyan-500/30 p-4 sm:p-5 space-y-4 overflow-hidden relative">
        <div className="relative flex flex-col md:flex-row md:items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {!isKioskMode && (
              <button 
                type="button" 
                onClick={onBack} 
                aria-label="Volver a la flota" 
                className="p-2 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-300 hover:text-white shrink-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-wide truncate">
                  {meta.alias || `EQUIPO [${cleanMac.slice(-4)}]`}
                </h2>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  isOnline ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' : 'bg-slate-800 text-slate-400 border-slate-600'
                }`}>
                  {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  {isOnline ? 'EN LÍNEA' : 'SIN SEÑAL'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                {[meta.marca && meta.marca.replace(/_/g, ' '), meta.modelo].filter(Boolean).join(' · ') || 'Modelo estándar'}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  {tipoEquipo.replace(/_/g, ' ')}
                </span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                  enCicloActivo ? 'bg-amber-500/15 text-amber-300 border-amber-400/50 animate-pulse' : 'bg-slate-800/80 text-slate-300 border-slate-700'
                }`}>
                  {faseEnVivo}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] bg-slate-800/80 text-slate-400 border border-slate-700 font-mono">
                  {cleanMac}
                </span>
                {(meta.cliente || meta.departamento) && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] bg-slate-800/80 text-slate-400 border border-slate-700 truncate max-w-full">
                    {[meta.cliente, meta.departamento].filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <ClinicalTooltip
              title={CLINICAL_HELP?.btn_anclar_terminal?.title || 'Terminal Fija'}
              description={CLINICAL_HELP?.btn_anclar_terminal?.desc || 'Fija este equipo como estación de trabajo'}
              badge={CLINICAL_HELP?.btn_anclar_terminal?.badge || 'KIOSK'}
              shortcut={CLINICAL_HELP?.btn_anclar_terminal?.action || 'FIJAR'}
            >
              <button
                type="button"
                onClick={onToggleKiosk}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all ${
                  isKioskMode ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-cyan-400'
                }`}
              >
                {isKioskMode ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{isKioskMode ? 'Desanclar' : 'Anclar'}</span>
              </button>
            </ClinicalTooltip>
            <button 
              type="button" 
              onClick={() => setShowQRModal(true)} 
              className="px-3 py-2 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow"
            >
              <QrCode className="w-4 h-4" />
              <span className="hidden sm:inline">Etiqueta QR</span>
            </button>
          </div>
        </div>

        {/* Indicadores Principales */}
        <div className="relative grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            ['Temperatura', `${tempCamara.toFixed(1)}`, '°C', 'text-white'],
            ['Presión', presionBar.toFixed(2), 'bar', 'text-white'],
            ['Letalidad F0', f0Score.toFixed(1), 'min', 'text-emerald-300'],
            ['Restante', `${Math.floor(segRestantes / 60)}:${(segRestantes % 60).toString().padStart(2, '0')}`, '', 'text-white'],
            ['Estado Fase', faseEnVivo, '', `block truncate !text-sm sm:!text-base ${enCicloActivo ? 'text-amber-300' : 'text-slate-200'}`]
          ].map(([label, value, unit, cls], idx) => (
            <div key={label} className={`rounded-xl bg-slate-950/60 border border-slate-800 px-3 py-2 ${idx === 4 ? 'col-span-2 sm:col-span-1' : ''}`}>
              <span className="block text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
              <span className={`text-lg sm:text-xl font-bold font-mono ${cls}`}>{value}</span>
              {unit && <span className="text-[10px] text-slate-400 ml-1">{unit}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Navegación de Secciones del Dispositivo */}
      <nav className="device-section-nav sticky top-14 sm:top-16 z-30 -mx-1 px-1 py-1.5">
        <div ref={navRef} className="flex gap-1.5 overflow-x-auto no-scrollbar p-1 rounded-2xl bg-slate-950/80 backdrop-blur-md border border-slate-800">
          {sections.map((s) => {
            const Icon = s.icon;
            const active = currentSection === s.id;
            return (
              <button
                key={s.id}
                type="button"
                data-sec={s.id}
                onClick={() => goToSection(s.id)}
                aria-current={active ? 'true' : undefined}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap flex items-center gap-1.5 transition-all ${
                  active ? 'bg-cyan-500 text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.45)]' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>
        <SwipeDots count={sections.length} index={sectionIndex} className="mt-1.5 lg:hidden" />
      </nav>

      {/* SECCIÓN 1: PANEL DE WIDGETS */}
      <DeviceSection id="panel" active={currentSection === 'panel'} dir={sectionDir} title="Panel de Telemetría Dinámico" subtitle="Supervisión modular en vivo" icon={LayoutGrid}>
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

      {/* SECCIÓN 2: CABINA DE CONTROL */}
      <DeviceSection id="cabina" active={currentSection === 'cabina'} dir={sectionDir} title="Cabina de Control de Ciclo" subtitle="Programas EN 13060, puerta neumática y salidas físicas" icon={Flame}>
        <div className="space-y-4">
          
          {/* Selector y Botón de Inicio/Paro */}
          <div className="rounded-2xl border border-slate-700/70 bg-slate-950/40 p-3 sm:p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Selección de Programa Clínico</span>
              <span className="text-[10px] text-slate-500">Norma EN 13060</span>
            </div>
            
            <ProgramPicker 
              programs={PROGRAMAS_CLINICOS} 
              value={programaSeleccionado} 
              onChange={setProgramaSeleccionado} 
              disabled={enCicloActivo} 
            />
            
            <div className="flex gap-2">
              {enCicloActivo ? (
                <button
                  type="button"
                  onClick={handleParoEmergencia}
                  className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-rose-600 to-red-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(244,63,94,0.45)] active:scale-[0.98] transition"
                >
                  <Square className="w-4 h-4 fill-white" />
                  <span>PARO DE EMERGENCIA / ABORTAR</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleIniciarCicloClinico}
                  disabled={isBloqueado100}
                  className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(34,211,238,0.35)] active:scale-[0.98] transition disabled:opacity-40"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>INICIAR CICLO P{programaSeleccionado}</span>
                </button>
              )}

              {faseEnVivo === 'CANCELADO' && (
                <button 
                  type="button" 
                  onClick={handleRestablecerAlarma} 
                  aria-label="Restablecer alarma" 
                  className="px-4 rounded-2xl border border-slate-700 bg-slate-900 text-cyan-300 active:scale-[0.97]"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Control de Puerta con Interlocks */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Actuadores de Puerta y Sello</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <ActionTile 
                label="Sellar Puerta" 
                hint="Inflar sello neumático perimetral" 
                icon={Lock} 
                tone="cyan" 
                onClick={handleCerrarSelloPuerta} 
              />
              <ActionTile
                label="Abrir Puerta"
                hint={
                  enCicloActivo
                    ? 'Bloqueada: Ciclo en ejecución'
                    : presionBar > 0.05 
                    ? `Bloqueada: ${presionBar.toFixed(2)} bar en cámara` 
                    : 'Apertura segura despresurizada'
                }
                icon={DoorOpen}
                tone="amber"
                disabled={enCicloActivo || presionBar > 0.05}
                onClick={handleAbrirPuertaSegura}
              />
            </div>
          </div>

          {/* Simulación de Banco de Pruebas */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Bypass de Banco de Pruebas</span>
              <span className="text-[10px] text-slate-500">Sustitución de sensores físicos para calibración</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {[
                ['puerta', 'Puerta Hermética'],
                ['sello', 'Sello Inflado'],
                ['recamara', 'Presión de Cámara'],
                ['caldera', 'Vapor en Caldera']
              ].map(([key, label]) => (
                <ToggleTile
                  key={key}
                  compact
                  label={label}
                  sublabel={bypasses[key] ? 'Simulado (Bypass)' : 'Sensor Físico'}
                  on={Boolean(bypasses[key])}
                  tone="amber"
                  icon={ShieldCheck}
                  onToggle={() => handleToggleBypass(key)}
                />
              ))}
            </div>
          </div>

          {/* Salidas Físicas de Relé */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Salidas Físicas de Potencia (0x24)</span>
              <span className="text-[10px] text-slate-500 font-mono">
                {Object.values(relesFisicos).filter((v) => Number(v) > 0).length} / 8 energizadas
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((ch) => {
                const id = `R${ch}`;
                const isActive = Boolean(Number(relesFisicos[id]));
                const name = meta.config_deseada?.nombres_reles?.[id] || nombresReles[id] || `Relé R${ch}`;
                return (
                  <ToggleTile
                    key={ch}
                    compact
                    label={name}
                    sublabel={`${id} · ${isActive ? 'Energizado' : 'Inactivo'}`}
                    on={isActive}
                    tone="emerald"
                    icon={iconFor(meta.config_deseada?.roles_reles?.[id], name)}
                    disabled={enCicloActivo}
                    onToggle={() => handleToggleManualRelay(ch, isActive)}
                  />
                );
              })}
            </div>
          </div>

          {/* Gráfica Térmica y de Presión en Tiempo Real */}
          <div className="rounded-2xl border border-slate-700/70 bg-slate-950/40 p-3 sm:p-4 space-y-2">
            <span className="block text-[11px] font-bold uppercase tracking-widest text-slate-400">
              Curva Térmica y Presión Absoluta (Telemetría a 800 ms)
            </span>
            <SterilizationChart telemetryData={device.history || []} />
          </div>
        </div>
      </DeviceSection>

      {/* SECCIÓN 3: HISTORIAL DE CICLOS */}
      <DeviceSection id="ciclos" active={currentSection === 'ciclos'} dir={sectionDir} title="Historial Clínico de Ciclos" subtitle="Expedientes de esterilización almacenados en Supabase" icon={History}>
        <CycleHistoryPanel mac={cleanMac} stats={cycleStats} onInspect={setInspectedSession} />
      </DeviceSection>

      {/* SECCIÓN 4: MANTENIMIENTO */}
      <DeviceSection id="mantenimiento" active={currentSection === 'mantenimiento'} dir={sectionDir} title="Mantenimiento Preventivo & Odómetro" subtitle="Contadores reales de fatiga térmica y planes de servicio" icon={Wrench}>
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

      {/* SECCIÓN 5: REPORTES TÉCNICOS */}
      <DeviceSection id="servicio" active={currentSection === 'servicio'} dir={sectionDir} title="Reportes Técnicos de Servicio" subtitle="Bitácora de atenciones y certificados emitidos" icon={ClipboardList}>
        <ServiceReportsView fleet={{ [cleanMac]: device }} fixedMac={cleanMac} operatorName={operatorName} isAdmin={isAdmin} embedded />
      </DeviceSection>

      {/* SECCIÓN 6: CONFIGURACIÓN DEL EQUIPO */}
      <DeviceSection id="config" active={currentSection === 'config'} dir={sectionDir} title="Identidad y Catálogo de Equipo" subtitle="Asignación clínica, fabricante y hardware" icon={Settings2}>
        <DeviceConfigPanel device={device} canEdit={canEditHardware} sendCommand={sendCommand} onDeviceUpdated={handleDeviceUpdated} />
      </DeviceSection>

      {/* SECCIÓN 7: HARDWARE I2C */}
      {canEditHardware && (
        <DeviceSection id="hardware" active={currentSection === 'hardware'} dir={sectionDir} title="Diagnóstico de Hardware & Bus I2C" subtitle="Sondeo de circuitos integrados conectados a la placa" icon={Cpu} accent="amber">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-amber-500/20 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-amber-400" />
                  Escáner de Bus I2C Físico (0x08 a 0x77)
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Barrido de silicio ejecutado en el Núcleo 1 de FreeRTOS en la placa ESP32.
                </p>
              </div>

              <button
                type="button"
                onClick={handleScanI2C}
                disabled={scanningI2C}
                className="py-2 px-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl flex items-center gap-1.5 shadow transition-all disabled:opacity-50"
              >
                <Search className={`w-3.5 h-3.5 ${scanningI2C ? 'animate-spin' : ''}`} />
                <span>{scanningI2C ? 'Consultando Bus Físico...' : 'Escanear Bus I2C'}</span>
              </button>
            </div>

            {chipsDetectados.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                {chipsDetectados.map((c, i) => (
                  <div key={c.dir || i} className="p-3 bg-slate-950 rounded-xl border border-amber-500/40">
                    <span className="text-amber-400 font-bold text-sm block">{c.dir}</span>
                    <span className="text-white text-xs font-semibold">{c.desc || c.tipo || 'Circuito I2C'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 bg-slate-950 rounded-xl border border-slate-800 font-sans">
                {scanningI2C 
                  ? 'Esperando respuesta del firmware en el bus I2C...' 
                  : 'Presione "Escanear Bus I2C" para consultar los circuitos integrados físicos conectados.'}
              </div>
            )}
          </div>
        </DeviceSection>
      )}

      {/* Modales Vinculados */}
      <SurgicalQRLabel isOpen={showQRModal} onClose={() => setShowQRModal(false)} deviceData={device} operatorName={operatorName} />
      <SessionDetailModal isOpen={inspectedSession !== null} onClose={() => setInspectedSession(null)} session={inspectedSession} />
      <ActionConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        description={confirmModal.description}
        actionType={confirmModal.actionType}
        deviceName={meta.alias || cleanMac}
        operatorName={operatorName}
      />
    </div>
  );
}
