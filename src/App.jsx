import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginModal from './components/auth/LoginModal';
import UserManagementModal from './components/admin/UserManagementModal';
import UserManagementView from './components/admin/UserManagementView';
import CloudDiagnosticsModal from './components/admin/CloudDiagnosticsModal';
import DeviceDetailView from './components/dashboard/DeviceDetailView';
import ClinicalAuditView from './components/reports/ClinicalAuditView';
import FotaHubView from './components/fota/FotaHubView';
import FleetManagementView from './components/fleet/FleetManagementView';
import GearMenu, { WALLPAPERS_LIST } from './components/common/GearMenu';
import ClinicalTooltip from './components/common/ClinicalTooltip';
import ContextMenu from './components/common/ContextMenu';
import DeviceAssignmentModal from './components/admin/DeviceAssignmentModal';
import SurgicalQRLabel from './components/labels/SurgicalQRLabel';
import { CLINICAL_HELP } from './utils/clinicalDictionary';
import { useMqttFleet } from './hooks/useMqttFleet';
import { startIndustrialSiren, stopIndustrialSiren, initAudioUnlock } from './services/audioAlarm';
import { sendCriticalAlarmWithButtons } from './services/telegram';
import { supabase } from './services/supabase';
import { 
  Activity, 
  Flame, 
  FileText, 
  Rocket, 
  Building2, 
  ChevronRight, 
  Volume2, 
  VolumeX, 
  Bell, 
  Clock, 
  Pin, 
  PinOff, 
  Unlock, 
  Shield, 
  Database, 
  User as UserIcon 
} from 'lucide-react';

function ScadaAppContent() {
  const { user, profile, loading, pendingRequests, logout } = useAuth();
  const { fleet, mqttConnected, sendDeviceCommand } = useMqttFleet();

  // Auditoría en vivo de conexión con Supabase Cloud
  const [supabaseConnected, setSupabaseConnected] = useState(true);
  useEffect(() => {
    const checkSupabase = async () => {
      try {
        const { error } = await supabase.from('usuarios_scada').select('*').limit(1);
        setSupabaseConnected(!error && navigator.onLine);
      } catch (e) {
        setSupabaseConnected(false);
      }
    };
    checkSupabase();
    const timer = setInterval(checkSupabase, 8000);
    return () => clearInterval(timer);
  }, []);

  const [currentTheme, setCurrentTheme] = useState(() => localStorage.getItem('scada_theme') || 'tactical');
  const [currentBg, setCurrentBg] = useState(() => localStorage.getItem('scada_bg') || 'circuit-pcb');
  const [opacity, setOpacity] = useState(() => Number(localStorage.getItem('scada_transparency')) || 82);

  useEffect(() => {
    initAudioUnlock();
  }, []);

  const [cloudDiagType, setCloudDiagType] = useState(null);

  const [kioskMac, setKioskMac] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const directKiosk = urlParams.get('kiosk');
    if (directKiosk) return directKiosk.toUpperCase().replace(/[:\-]/g, '');
    return sessionStorage.getItem('scada_tab_kiosk_mac') || null;
  });

  const [selectedMac, setSelectedMac] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const directMac = urlParams.get('mac') || urlParams.get('kiosk');
    if (directMac) return directMac.toUpperCase().replace(/[:\-]/g, '');
    if (sessionStorage.getItem('scada_tab_kiosk_mac')) return sessionStorage.getItem('scada_tab_kiosk_mac');
    return sessionStorage.getItem('scada_tab_selected_mac') || null;
  });

  const [activeSection, setActiveSection] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mac') || urlParams.get('kiosk') || sessionStorage.getItem('scada_tab_kiosk_mac')) {
      return 'detalle';
    }
    return sessionStorage.getItem('scada_tab_active_section') || 'flota';
  });

  const [healthFilter, setHealthFilter] = useState(() => sessionStorage.getItem('scada_tab_health_filter') || 'ALL');

  useEffect(() => {
    if (!kioskMac) {
      sessionStorage.setItem('scada_tab_active_section', activeSection);
    }
  }, [activeSection, kioskMac]);

  useEffect(() => {
    if (!kioskMac) {
      if (selectedMac) sessionStorage.setItem('scada_tab_selected_mac', selectedMac);
      else sessionStorage.removeItem('scada_tab_selected_mac');
    }
  }, [selectedMac, kioskMac]);

  useEffect(() => {
    sessionStorage.setItem('scada_tab_health_filter', healthFilter);
  }, [healthFilter]);

  const toggleKioskMode = (macToKiosk = null) => {
    if (kioskMac) {
      sessionStorage.removeItem('scada_tab_kiosk_mac');
      setKioskMac(null);
      if (window.location.search.includes('mac=') || window.location.search.includes('kiosk=')) {
        window.history.replaceState({}, '', window.location.pathname);
      }
      setActiveSection('flota');
      setSelectedMac(null);
    } else {
      const target = (macToKiosk || selectedMac || '').toUpperCase().replace(/[:\-]/g, '');
      if (target) {
        sessionStorage.setItem('scada_tab_kiosk_mac', target);
        setKioskMac(target);
        setSelectedMac(target);
        setActiveSection('detalle');
      }
    }
  };

  const [contextMenu, setContextMenu] = useState({ isOpen: false, position: { x: 0, y: 0 }, device: null });
  const [assignModal, setAssignModal] = useState({ isOpen: false, device: null });
  const [qrModalDevice, setQrModalDevice] = useState(null);

  const handleDeviceContextMenu = (e, dev) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      device: dev
    });
  };

  const [showAdminModal, setShowAdminModal] = useState(false);
  const [sirenActive, setSirenActive] = useState(false);

  const [currentTime, setCurrentTime] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const [showTimeoutModal, setShowTimeoutModal] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const idleTimerRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  const isAdmin = profile?.rol?.toLowerCase().includes('admin') || profile?.rol?.toLowerCase().includes('director');
  const canEditHardware = isAdmin || profile?.rol?.toLowerCase().includes('tecnico');
  const isOperator = profile?.rol?.toLowerCase().includes('operador') || profile?.rol?.toLowerCase().includes('cliente');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('scada_theme', currentTheme);
  }, [currentTheme]);

  useEffect(() => {
    const alpha = (opacity / 100).toFixed(2);
    document.documentElement.style.setProperty('--glass-opacity', alpha);
    localStorage.setItem('scada_transparency', opacity);
  }, [opacity]);

  useEffect(() => {
    localStorage.setItem('scada_bg', currentBg);
  }, [currentBg]);

  const resetIdleTimer = () => {
    if (!user) return;
    clearTimeout(idleTimerRef.current);
    if (!showTimeoutModal) {
      idleTimerRef.current = setTimeout(() => {
        setShowTimeoutModal(true);
        setCountdown(60);
      }, 14 * 60 * 1000);
    }
  };

  useEffect(() => {
    if (showTimeoutModal) {
      countdownIntervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownIntervalRef.current);
            setShowTimeoutModal(false);
            logout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(countdownIntervalRef.current);
    }
    return () => clearInterval(countdownIntervalRef.current);
  }, [showTimeoutModal, logout]);

  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    const handleActivity = () => resetIdleTimer();
    events.forEach((evt) => window.removeEventListener(evt, handleActivity));
    events.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }));
    resetIdleTimer();
    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleActivity));
      clearTimeout(idleTimerRef.current);
    };
  }, [user]);

  // Vigilante de Sirena Industrial
  useEffect(() => {
    let hasCriticalAlarm = false;
    Object.keys(fleet).forEach((mac) => {
      const dev = fleet[mac];
      if (dev?.datos?.alarma_cod && dev?.datos?.alarma_cod > 0) {
        hasCriticalAlarm = true;
        sendCriticalAlarmWithButtons({
          mac,
          alias: dev?.meta?.alias || mac,
          temp: parseFloat(dev?.datos?.temp_camara || 0),
          pres: parseFloat(dev?.datos?.presion || 0),
          fase: dev?.datos?.fase || 'CRÍTICA',
          errorMsg: dev?.datos?.alarma_msg || 'Alarma en cámara'
        });
      }
    });

    if (hasCriticalAlarm && !sirenActive) {
      startIndustrialSiren();
      setSirenActive(true);
    }
  }, [fleet, sirenActive]);

  const handleSilenceSiren = () => {
    stopIndustrialSiren();
    setSirenActive(false);
  };

  useEffect(() => {
    const channel = supabase
      .channel('realtime_telegram_ack')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'auditoria_accesos' }, (payload) => {
        if (payload.new && payload.new.evento === 'ACK_TELEGRAM') {
          handleSilenceSiren();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const bgObj = WALLPAPERS_LIST.find((b) => b.id === currentBg) || WALLPAPERS_LIST[0];

  const getDeviceHealthData = (dev) => {
    if (!dev || !dev.lastSeen || dev.lastSeen === 0) {
      return { status: 'OFFLINE', text: 'DESCONECTADO', timeAgo: 'Sin señal', colorClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30' };
    }
    const diffSegundos = Math.floor((currentTime - dev.lastSeen) / 1000);

    if (diffSegundos <= 4) {
      return { status: 'ONLINE', text: '100% ONLINE', timeAgo: diffSegundos === 0 ? 'En vivo' : `Hace ${diffSegundos}s`, colorClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
    } else if (diffSegundos <= 8) {
      return { status: 'LATENCY', text: 'LATENCIA', timeAgo: `Hace ${diffSegundos}s`, colorClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
    } else {
      const mins = Math.floor(diffSegundos / 60);
      return { status: 'OFFLINE', text: 'DESCONECTADO', timeAgo: mins > 0 ? `Hace ${mins}m` : `Hace ${diffSegundos}s`, colorClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30' };
    }
  };

  const macKeys = Object.keys(fleet);

  // Aislamiento Multi-Tenant
  const allowedDevices = macKeys
    .map((k) => fleet[k])
    .filter((dev) => {
      if (isAdmin) return true;

      const userHospital = (profile?.departamento || '').toLowerCase().trim();
      const devHospital = (dev?.meta?.cliente || '').toLowerCase().trim();
      const devAssignedUser = (dev?.meta?.usuario_asignado || '').toLowerCase().trim();
      const currentUsername = (profile?.usuario || profile?.user || user?.email || '').toLowerCase().trim();
      const userAuthMacs = (profile?.equipos_autorizados || '').toUpperCase().split(',').map((x) => x.trim());

      if (userAuthMacs.includes(dev.mac)) return true;
      if (devAssignedUser) return devAssignedUser === currentUsername;
      if (userHospital && devHospital) return devHospital.includes(userHospital) || userHospital.includes(devHospital);

      return false;
    });

  let countOn = 0, countLat = 0, countOff = 0;
  allowedDevices.forEach((dev) => {
    const health = getDeviceHealthData(dev);
    if (health.status === 'ONLINE') countOn++;
    else if (health.status === 'LATENCY') countLat++;
    else countOff++;
  });

  const filteredDevices = allowedDevices.filter((dev) => {
    const health = getDeviceHealthData(dev);
    if (healthFilter === 'ONLINE') return health.status === 'ONLINE';
    if (healthFilter === 'LATENCY') return health.status === 'LATENCY';
    if (healthFilter === 'OFFLINE') return health.status === 'OFFLINE';
    return true;
  });

  const inspectingMacToUse = kioskMac || selectedMac;
  const inspectingDevice = inspectingMacToUse 
    ? (fleet[inspectingMacToUse] || {
        mac: inspectingMacToUse,
        lastSeen: 0,
        datos: {
          temp_camara: 25.0,
          presion: 0.0,
          fase: 'SINCRONIZANDO...',
          seg_restantes: 0,
          cfg: { sp_temp: 121.0, t_ciclo: 2, ciclos: 0, lim_mant: 200 }
        },
        esquema: null,
        meta: { alias: `AUTOCLAVE [${inspectingMacToUse.slice(-4)}]`, cliente: 'Conectando a la red...', modelo: 'Clase B' },
        f0Score: 0.0,
        history: []
      })
    : (filteredDevices[0] || null);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070913] flex flex-col items-center justify-center">
        <Activity className="w-8 h-8 text-cyan-400 animate-spin mb-3" />
        <p className="text-xs font-mono text-cyan-400 tracking-wider">SINCRONIZANDO SESIÓN BIOMÉDICA CENTRAL...</p>
      </div>
    );
  }

  const displayName = profile?.nombre || profile?.usuario || profile?.user || user?.email?.split('@')[0] || 'ADMIN';
  const displayRole = profile?.rol || 'SUPERADMIN';
  const displayUser = profile?.usuario || profile?.user || user?.email?.split('@')[0] || 'admin';
  const displayHospital = profile?.departamento || 'Central Hospitalaria';
  const displayAuthMacs = profile?.equipos_autorizados ? profile.equipos_autorizados : 'Flota Completa (Root)';

  return (
    <div className="min-h-screen w-full relative pb-20 md:pb-6 flex flex-col overflow-x-hidden">
      
      {/* Fondo fijo visible */}
      <div 
        id="scada-background"
        className="fixed inset-0 z-0 pointer-events-none bg-cover bg-center bg-no-repeat transition-[background-image] duration-500"
        style={{
          backgroundImage: currentBg === 'oled'
            ? 'radial-gradient(circle at 50% -5%, rgba(139, 92, 246, 0.25) 0%, transparent 55%), radial-gradient(circle at 100% 100%, rgba(0, 243, 255, 0.18) 0%, transparent 50%)'
            : bgObj?.url 
            ? `linear-gradient(to bottom, rgba(4, 7, 18, 0.30), rgba(4, 7, 18, 0.60)), url('${bgObj.url}')`
            : 'none',
          backgroundColor: '#030712'
        }}
      />

      <div className="relative z-10 flex-1 flex flex-col w-full max-w-full">

        {/* Banner de Emergencia */}
        {sirenActive && (
          <div className="bg-rose-600 px-3 sm:px-4 py-2 flex items-center justify-between text-white font-bold text-xs shadow-2xl animate-pulse sticky top-0 z-50">
            <div className="flex items-center gap-2 truncate">
              <Volume2 className="w-4 h-4 animate-bounce shrink-0" />
              <span className="truncate">🚨 ALARMA CRÍTICA // SIRENA INDUSTRIAL EN BUCLE</span>
            </div>
            <button
              onClick={handleSilenceSiren}
              className="px-2.5 py-1 bg-white text-rose-700 hover:bg-slate-100 rounded-lg text-xs font-black shrink-0 ml-2 shadow-lg"
            >
              SILENCIAR
            </button>
          </div>
        )}

        {/* Header */}
        <header className="speedtest-laser-header border-b border-cyan-500/20 bg-slate-950/80 backdrop-blur-md px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between sticky top-0 z-40 w-full">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="p-1.5 sm:p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shrink-0">
              <Activity className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 truncate">
                <h1 className="text-sm sm:text-base md:text-lg font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-emerald-400 truncate">
                  BIOFLEET OS™
                </h1>
                <span className="text-[9px] sm:text-[10px] font-mono px-1 py-0.2 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 shrink-0">
                  v2.0
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono hidden sm:block truncate">
                Supervisión de Flota Biomédica & Trama Dinámica ESP32
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 ml-2">
            {kioskMac && (
              <button
                onClick={() => toggleKioskMode(null)}
                className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500 text-amber-300 rounded-lg text-xs font-mono font-bold transition-all shadow-[0_0_15px_rgba(245,158,11,0.3)] animate-pulse"
                title="Desanclar y volver a la flota completa"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">DESANCLAR [{kioskMac.slice(-4)}]</span>
              </button>
            )}

            {/* MQTT */}
            <ClinicalTooltip
              title="Broker MQTT (HiveMQ Cloud)"
              description={isAdmin ? "⚡ Click para abrir la Consola de Recursos y Latencia MQTT." : "Transmisión bidireccional continua por WebSockets (puerto seguro 8884)."}
              badge="WSS 8884"
              shortcut={isAdmin ? "CLICK PARA AUDITAR" : "EN TIEMPO REAL"}
              position="bottom"
            >
              <button
                onClick={() => { if (isAdmin) setCloudDiagType('hivemq'); }}
                className={`inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border transition-all ${
                  isAdmin ? 'cursor-pointer hover:scale-105 active:scale-95' : 'cursor-help'
                } ${
                  mqttConnected 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20' 
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${mqttConnected ? 'bg-emerald-400 animate-ping' : 'bg-rose-400'}`}></span>
                <span className="hidden sm:inline">{mqttConnected ? 'HIVEMQ 8884' : 'OFFLINE'}</span>
              </button>
            </ClinicalTooltip>

            {/* Supabase */}
            <ClinicalTooltip
              title="Base de Datos Supabase Cloud"
              description={isAdmin ? "⚡ Click para abrir el Inventario de Registros, Tablas y Latencia DB." : "Canal central de persistencia Postgres en tiempo real para sesiones."}
              badge="POSTGRES REST"
              shortcut={isAdmin ? "CLICK PARA AUDITAR" : "EN LÍNEA"}
              position="bottom"
            >
              <button
                onClick={() => { if (isAdmin) setCloudDiagType('supabase'); }}
                className={`inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border transition-all ${
                  isAdmin ? 'cursor-pointer hover:scale-105 active:scale-95' : 'cursor-help'
                } ${
                  supabaseConnected 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20' 
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${supabaseConnected ? 'bg-emerald-400 animate-ping' : 'bg-rose-400'}`}></span>
                <span className="hidden sm:inline">{supabaseConnected ? 'SUPABASE NUBE' : 'SIN RED'}</span>
              </button>
            </ClinicalTooltip>

            {/* Chip Usuario */}
            {user && (
              <ClinicalTooltip
                title={displayName}
                badge={displayRole}
                description="Credencial biomédica activa en esta estación de trabajo."
                extraDetails={
                  <div className="space-y-1 text-slate-300 font-mono text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">ID Usuario:</span>
                      <span className="text-cyan-300 font-bold">{displayUser}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Rango / Rol:</span>
                      <span className="text-emerald-400 font-bold">{displayRole}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Clínica / Depto:</span>
                      <span className="text-white truncate max-w-[130px] font-sans">{displayHospital}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Equipos Asignados:</span>
                      <span className="text-purple-300 truncate max-w-[130px]">{displayAuthMacs}</span>
                    </div>
                  </div>
                }
                shortcut="SESIÓN ACTIVA"
                position="bottom"
              >
                <div className="flex items-center gap-2 bg-slate-900/90 px-2 sm:px-3 py-1 rounded-xl border border-slate-700/80 shadow-inner hover:border-cyan-400/50 transition-colors cursor-help">
                  <div className="w-6 h-6 rounded-lg bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                    {displayName[0]}
                  </div>
                  <div className="text-left hidden sm:block">
                    <p className="text-xs font-bold text-white leading-tight truncate max-w-[110px]">
                      {displayName}
                    </p>
                    <p className="text-[9px] text-cyan-400 font-mono leading-none font-semibold">
                      {displayRole}
                    </p>
                  </div>
                </div>
              </ClinicalTooltip>
            )}

            {/* Notificaciones */}
            {user && isAdmin && (
              <button
                onClick={() => setShowAdminModal(true)}
                className="relative p-1.5 sm:p-2 rounded-xl bg-slate-900 border border-amber-500/40 text-amber-300 shrink-0"
                title="Personal y Aprobaciones"
              >
                <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
                {pendingRequests.length > 0 && (
                  <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 text-[9px] font-bold">
                    {pendingRequests.length}
                  </span>
                )}
              </button>
            )}

            {/* Engranaje */}
            {user && (
              <div className="shrink-0">
                <GearMenu
                  currentTheme={currentTheme}
                  setTheme={setCurrentTheme}
                  currentBg={currentBg}
                  setBg={setCurrentBg}
                  opacity={opacity}
                  setOpacity={setOpacity}
                  onLogout={logout}
                  kioskMac={kioskMac}
                  onUnlockKiosk={() => toggleKioskMode(null)}
                />
              </div>
            )}
          </div>
        </header>

        {/* Dock PC */}
        {user && !kioskMac && !isOperator && (
          <div className="hidden md:flex items-center gap-2 px-6 py-2 bg-slate-950/60 border-b border-cyan-500/10">
            <ClinicalTooltip title={CLINICAL_HELP.nav_flota.title} description={CLINICAL_HELP.nav_flota.desc} badge={CLINICAL_HELP.nav_flota.badge}>
              <button
                onClick={() => { setActiveSection('flota'); setSelectedMac(null); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                  activeSection === 'flota' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                ⚡ Flota en Vivo ({allowedDevices.length})
              </button>
            </ClinicalTooltip>

            <ClinicalTooltip title={CLINICAL_HELP.nav_gestion.title} description={CLINICAL_HELP.nav_gestion.desc} badge={CLINICAL_HELP.nav_gestion.badge}>
              <button
                onClick={() => { setActiveSection('gestion'); setSelectedMac(null); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                  activeSection === 'gestion' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                🏢 Gestión Flota
              </button>
            </ClinicalTooltip>

            <ClinicalTooltip title={CLINICAL_HELP.nav_usuarios.title} description={CLINICAL_HELP.nav_usuarios.desc} badge={CLINICAL_HELP.nav_usuarios.badge}>
              <button
                onClick={() => { setActiveSection('usuarios'); setSelectedMac(null); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                  activeSection === 'usuarios' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                🛡️ Usuarios & Permisos
              </button>
            </ClinicalTooltip>

            <ClinicalTooltip title={CLINICAL_HELP.nav_fota.title} description={CLINICAL_HELP.nav_fota.desc} badge={CLINICAL_HELP.nav_fota.badge}>
              <button
                onClick={() => { setActiveSection('fota'); setSelectedMac(null); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                  activeSection === 'fota' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                🚀 FOTA Hub
              </button>
            </ClinicalTooltip>

            <ClinicalTooltip title={CLINICAL_HELP.nav_auditoria.title} description={CLINICAL_HELP.nav_auditoria.desc} badge={CLINICAL_HELP.nav_auditoria.badge}>
              <button
                onClick={() => { setActiveSection('auditoria'); setSelectedMac(null); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                  activeSection === 'auditoria' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                📋 Auditoría Supabase
              </button>
            </ClinicalTooltip>
          </div>
        )}

        {/* Contenido Principal */}
        {!user ? (
          <main className="flex-1 flex items-center justify-center p-4 android-view-transition">
            <LoginModal />
          </main>
        ) : (
          <main className="flex-1 p-3 md:p-6 max-w-7xl mx-auto w-full flex flex-col gap-4 android-view-transition">
            
            {(kioskMac || activeSection === 'detalle') && inspectingDevice ? (
              <DeviceDetailView
                device={inspectingDevice}
                onBack={() => { setActiveSection('flota'); setSelectedMac(null); }}
                sendCommand={sendDeviceCommand}
                operatorName={profile?.nombre || user?.email}
                userRole={profile?.rol || 'Super Administrador'}
                isKioskMode={Boolean(kioskMac)}
                onToggleKiosk={() => toggleKioskMode(inspectingMacToUse)}
              />
            ) : (
              <>
                {/* SECCIÓN FLOTA */}
                {activeSection === 'flota' && (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div>
                        <h2 className="text-base md:text-lg font-bold font-mono flex items-center gap-2">
                          <Flame className="w-5 h-5 text-cyan-400" />
                          Monitor de Flota ({allowedDevices.length})
                        </h2>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                          👉 Haz <strong>clic derecho</strong> en cualquier autoclave para ver el menú contextual de opciones.
                        </p>
                      </div>

                      <div className="flex gap-2 overflow-x-auto w-full sm:w-auto pb-1">
                        <ClinicalTooltip title={CLINICAL_HELP.filter_online.title} description={CLINICAL_HELP.filter_online.desc} badge={CLINICAL_HELP.filter_online.badge}>
                          <button
                            onClick={() => setHealthFilter('ONLINE')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                              healthFilter === 'ONLINE' ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md' : 'bg-slate-900/80 border-slate-700 text-emerald-400'
                            }`}
                          >
                            🟢 ONLINE ({countOn})
                          </button>
                        </ClinicalTooltip>

                        <ClinicalTooltip title={CLINICAL_HELP.filter_latency.title} description={CLINICAL_HELP.filter_latency.desc} badge={CLINICAL_HELP.filter_latency.badge}>
                          <button
                            onClick={() => setHealthFilter('LATENCY')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                              healthFilter === 'LATENCY' ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md' : 'bg-slate-900/80 border-slate-700 text-amber-300'
                            }`}
                          >
                            🟡 LATENCIA ({countLat})
                          </button>
                        </ClinicalTooltip>

                        <ClinicalTooltip title={CLINICAL_HELP.filter_offline.title} description={CLINICAL_HELP.filter_offline.desc} badge={CLINICAL_HELP.filter_offline.badge}>
                          <button
                            onClick={() => setHealthFilter('OFFLINE')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                              healthFilter === 'OFFLINE' ? 'bg-rose-500 text-white border-rose-400 shadow-md' : 'bg-slate-900/80 border-slate-700 text-rose-400'
                            }`}
                          >
                            🔴 OFFLINE ({countOff})
                          </button>
                        </ClinicalTooltip>

                        <ClinicalTooltip title={CLINICAL_HELP.filter_all.title} description={CLINICAL_HELP.filter_all.desc} badge={CLINICAL_HELP.filter_all.badge}>
                          <button
                            onClick={() => setHealthFilter('ALL')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                              healthFilter === 'ALL' ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-md' : 'bg-slate-900/80 border-slate-700 text-slate-300'
                            }`}
                          >
                            🌐 TODOS ({allowedDevices.length})
                          </button>
                        </ClinicalTooltip>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredDevices.length === 0 ? (
                        <div className="col-span-full ultra-glass p-8 rounded-2xl text-center text-slate-400 font-mono text-xs">
                          No hay autoclaves en el estado [{healthFilter}].
                        </div>
                      ) : (
                        filteredDevices.map((dev) => {
                          const dDev = dev.datos || {};
                          const health = getDeviceHealthData(dev);
                          const cCount = Number(dDev?.cfg?.ciclos || dev?.meta?.ciclosCompletados || 0);
                          const cLim = Number(dDev?.cfg?.lim_mant || dev?.meta?.limiteMantenimiento || 200);

                          const tempNum = parseFloat(dDev.temp_camara || 25);
                          const presNum = parseFloat(dDev.presion || 0);

                          return (
                            <div
                              key={dev.mac}
                              onClick={() => { setSelectedMac(dev.mac); setActiveSection('detalle'); }}
                              onContextMenu={(e) => handleDeviceContextMenu(e, dev)}
                              className="ultra-glass p-5 rounded-2xl cursor-pointer transition-all duration-200 hover:-translate-y-1 shadow-xl flex flex-col justify-between"
                            >
                              <div>
                                <div className="flex justify-between items-start mb-3">
                                  <div>
                                    <h3 className="font-bold text-sm text-white">{dev.meta?.alias || `AUTOCLAVE [${dev.mac.slice(-4)}]`}</h3>
                                    <p className="text-[11px] text-slate-400 font-mono">{dev.meta?.cliente || 'Hospital Central'} • {dev.mac}</p>
                                    {dev.meta?.usuario_asignado && (
                                      <span className="text-[9px] text-purple-300 font-mono block">
                                        👤 Asignado a: {dev.meta.usuario_asignado}
                                      </span>
                                    )}
                                  </div>
                                  
                                  <div className="text-right">
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border font-bold ${health.colorClass}`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${
                                        health.status === 'ONLINE' ? 'bg-emerald-400 animate-ping' : 
                                        health.status === 'LATENCY' ? 'bg-amber-400 animate-pulse' : 
                                        'bg-rose-400'
                                      }`}></span>
                                      {health.text}
                                    </span>
                                    <span className="block text-[9px] text-slate-400 font-mono mt-0.5">
                                      {health.timeAgo}
                                    </span>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 my-3">
                                  <div className="p-2.5 rounded-xl glass-cell text-center w-full">
                                    <span className="text-[10px] font-mono text-cyan-400 block">TEMPERATURA</span>
                                    <span className="text-xl font-bold font-mono text-white">
                                      {isNaN(tempNum) ? '25.0' : tempNum.toFixed(1)}°C
                                    </span>
                                  </div>

                                  <div className="p-2.5 rounded-xl glass-cell text-center w-full">
                                    <span className="text-[10px] font-mono text-pink-400 block">PRESIÓN</span>
                                    <span className="text-xl font-bold font-mono text-white">
                                      {isNaN(presNum) ? '0.00' : presNum.toFixed(2)}b
                                    </span>
                                  </div>
                                </div>

                                <ClinicalTooltip title={CLINICAL_HELP.card_odometro.title} description={CLINICAL_HELP.card_odometro.desc} badge="VIDA ÚTIL">
                                  <div className="space-y-1 mb-3 w-full">
                                    <div className="flex justify-between text-[10px] font-mono text-slate-400">
                                      <span>Odómetro: {cCount}/{cLim} ciclos</span>
                                      <span>{Math.round((cCount / (cLim || 1)) * 100)}%</span>
                                    </div>
                                    <div className="w-full bg-slate-800/80 rounded-full h-1.5 overflow-hidden">
                                      <div className="bg-emerald-400 h-full" style={{ width: `${Math.min(100, (cCount / (cLim || 1)) * 100)}%` }}></div>
                                    </div>
                                  </div>
                                </ClinicalTooltip>
                              </div>

                              <ClinicalTooltip title={CLINICAL_HELP.card_control_total.title} description={CLINICAL_HELP.card_control_total.desc} badge="ENTRAR">
                                <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs font-mono text-cyan-400 font-bold w-full">
                                  <span>ENTRAR A CONTROL TOTAL</span>
                                  <ChevronRight className="w-4 h-4" />
                                </div>
                              </ClinicalTooltip>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* GESTIÓN FLOTA */}
                {activeSection === 'gestion' && (
                  <FleetManagementView
                    fleet={fleet}
                    sendCommand={sendDeviceCommand}
                    onSelectDevice={(mac) => { setSelectedMac(mac); setActiveSection('detalle'); }}
                  />
                )}

                {/* USUARIOS */}
                {activeSection === 'usuarios' && (
                  <UserManagementView
                    fleet={fleet}
                    onFleetUpdated={() => {}}
                  />
                )}

                {/* FOTA */}
                {activeSection === 'fota' && (
                  <FotaHubView fleet={fleet} sendCommand={sendDeviceCommand} />
                )}

                {/* AUDITORÍA */}
                {activeSection === 'auditoria' && (
                  <ClinicalAuditView />
                )}
              </>
            )}

          </main>
        )}

        {/* BARRA INFERIOR CELULAR */}
        {user && !kioskMac && (
          <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-slate-950/90 border-t border-cyan-500/30 backdrop-blur-xl flex items-center justify-around z-50 px-2">
            <button
              onClick={() => { setActiveSection('flota'); setSelectedMac(null); }}
              className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-lg text-xs font-mono ${
                activeSection === 'flota' || activeSection === 'detalle' ? 'text-cyan-400 font-bold' : 'text-slate-400'
              }`}
            >
              <Activity className="w-5 h-5" />
              <span>Flota</span>
            </button>

            <button
              onClick={() => { setActiveSection('gestion'); setSelectedMac(null); }}
              className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-lg text-xs font-mono ${
                activeSection === 'gestion' ? 'text-cyan-400 font-bold' : 'text-slate-400'
              }`}
            >
              <Building2 className="w-5 h-5" />
              <span>Gestión</span>
            </button>

            <button
              onClick={() => { setActiveSection('usuarios'); setSelectedMac(null); }}
              className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-lg text-xs font-mono ${
                activeSection === 'usuarios' ? 'text-cyan-400 font-bold' : 'text-slate-400'
              }`}
            >
              <Shield className="w-5 h-5" />
              <span>Personal</span>
            </button>

            <button
              onClick={() => { setActiveSection('fota'); setSelectedMac(null); }}
              className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-lg text-xs font-mono ${
                activeSection === 'fota' ? 'text-cyan-400 font-bold' : 'text-slate-400'
              }`}
            >
              <Rocket className="w-5 h-5" />
              <span>FOTA</span>
            </button>

            <button
              onClick={() => { setActiveSection('auditoria'); setSelectedMac(null); }}
              className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-lg text-xs font-mono ${
                activeSection === 'auditoria' ? 'text-cyan-400 font-bold' : 'text-slate-400'
              }`}
            >
              <FileText className="w-5 h-5" />
              <span>Auditoría</span>
            </button>
          </nav>
        )}

        {/* Modal Inactividad */}
        {showTimeoutModal && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
            <div className="ultra-glass border-2 border-amber-500 p-6 rounded-2xl max-w-sm w-full text-center space-y-4 shadow-[0_0_30px_rgba(245,158,11,0.3)]">
              <div className="inline-flex p-3 rounded-full bg-amber-500/20 text-amber-300 animate-bounce">
                <Clock className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-white font-mono uppercase">Sesión por Expirar</h3>
              <p className="text-xs text-slate-300 leading-relaxed font-mono">
                Por protocolo de seguridad hospitalaria, tu turno se cerrará en <strong className="text-cyan-300 text-sm">{countdown}s</strong> debido a inactividad.
              </p>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={logout}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
                >
                  Cerrar Turno
                </button>
                <button
                  onClick={() => { setShowTimeoutModal(false); resetIdleTimer(); }}
                  className="flex-1 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90 text-white rounded-xl text-xs font-bold shadow-lg"
                >
                  Seguir Conectado
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Diagnóstico Cloud */}
        <CloudDiagnosticsModal
          isOpen={Boolean(cloudDiagType)}
          onClose={() => setCloudDiagType(null)}
          type={cloudDiagType || 'hivemq'}
          fleet={fleet}
          mqttConnected={mqttConnected}
          supabaseConnected={supabaseConnected}
        />

        {/* Menú Contextual */}
        <ContextMenu
          isOpen={contextMenu.isOpen}
          position={contextMenu.position}
          onClose={() => setContextMenu({ isOpen: false, position: { x: 0, y: 0 }, device: null })}
          device={contextMenu.device}
          isAdmin={isAdmin}
          canEditHardware={canEditHardware}
          onOpenDetail={(mac) => { setSelectedMac(mac); setActiveSection('detalle'); }}
          onToggleKiosk={(mac) => toggleKioskMode(mac)}
          onOpenAssignModal={(dev) => setAssignModal({ isOpen: true, device: dev })}
          onTestMotor={(mac) => {
            const current = fleet[mac]?.datos?.motor || false;
            sendDeviceCommand(mac, { mot_ok: !current });
          }}
          onResetAlarm={(mac) => sendDeviceCommand(mac, { cmd: 'RESET_ALARMA' })}
          onOpenQR={(dev) => setQrModalDevice(dev)}
        />

        {/* Modal de Asignación */}
        <DeviceAssignmentModal
          isOpen={assignModal.isOpen}
          onClose={() => setAssignModal({ isOpen: false, device: null })}
          device={assignModal.device}
          onAssignmentUpdated={(updatedMeta) => {
            if (fleet[updatedMeta.mac]) {
              fleet[updatedMeta.mac].meta = Object.assign(fleet[updatedMeta.mac].meta || {}, updatedMeta);
            }
          }}
        />

        {/* Modal QR */}
        <SurgicalQRLabel
          isOpen={qrModalDevice !== null}
          onClose={() => setQrModalDevice(null)}
          deviceData={qrModalDevice}
          operatorName={profile?.nombre || user?.email}
        />

        {/* Modal Campana */}
        <UserManagementModal 
          isOpen={showAdminModal} 
          onClose={() => setShowAdminModal(false)} 
        />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ScadaAppContent />
    </AuthProvider>
  );
}
