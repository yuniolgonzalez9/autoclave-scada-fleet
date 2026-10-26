import React, { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginModal from './components/auth/LoginModal';
import UserManagementModal from './components/admin/UserManagementModal';
import CloudDiagnosticsModal from './components/admin/CloudDiagnosticsModal';
import GearMenu, { WALLPAPERS_LIST } from './components/common/GearMenu';
import ClinicalTooltip from './components/common/ClinicalTooltip';
import ContextMenu from './components/common/ContextMenu';
import DeviceAssignmentModal from './components/admin/DeviceAssignmentModal';
import SurgicalQRLabel from './components/labels/SurgicalQRLabel';
import NotificationsPanel from './components/common/NotificationsPanel';
import SwipeDots from './components/common/SwipeDots';
import { useSwipe, stepThrough } from './hooks/useSwipe';
import { useNotificationCenter } from './hooks/useNotificationCenter';
import { useMqttFleet } from './hooks/useMqttFleet';
import { useAccountAppearance } from './hooks/useAccountAppearance';
import { startIndustrialSiren, stopIndustrialSiren, initAudioUnlock } from './services/audioAlarm';
import { sendCriticalAlarmWithButtons } from './services/telegram';
import { supabase } from './services/supabase';
import HeaderLaserOrbit from './components/common/HeaderLaserOrbit';

// Vistas pesadas: carga diferida para acelerar el arranque en móviles
const DeviceDetailView = lazy(() => import('./components/dashboard/DeviceDetailView'));
const FleetManagementView = lazy(() => import('./components/fleet/FleetManagementView'));
const ServiceReportsView = lazy(() => import('./components/service/ServiceReportsView'));
const AiAutomationStudio = lazy(() => import('./components/studio/AiAutomationStudio'));
const UserManagementView = lazy(() => import('./components/admin/UserManagementView'));
const FotaHubView = lazy(() => import('./components/fota/FotaHubView'));
const ClinicalAuditView = lazy(() => import('./components/reports/ClinicalAuditView'));

const ViewLoader = () => (
  <div className="p-8 text-center text-slate-400 text-[10px] tracking-[0.3em] uppercase animate-pulse">
    Cargando módulo…
  </div>
);
import { 
  Activity, 
  Flame, 
  ChevronRight, 
  Volume2, 
  Bell, 
  Clock, 
  Unlock, 
  Shield, 
  Sparkles,
  Car,
  Cpu,
  Building2,
  Rocket,
  Search,
  ArrowDownAZ,
  X,
  ChevronLeft
} from 'lucide-react';

const APP_SECTIONS = new Set(['flota', 'gestion', 'servicio', 'studio', 'usuarios', 'fota', 'auditoria', 'detalle']);
const MOBILE_SECTIONS = ['flota', 'gestion', 'studio', 'usuarios', 'fota'];

function getInitialActiveSection() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('mac') || urlParams.get('kiosk') || sessionStorage.getItem('scada_tab_kiosk_mac')) {
    return 'detalle';
  }

  const savedSection = localStorage.getItem('scada_active_section') || sessionStorage.getItem('scada_tab_active_section');
  return APP_SECTIONS.has(savedSection) ? savedSection : 'flota';
}

function ScadaAppContent() {
  const {
    user,
    profile,
    loading,
    pendingRequests,
    recoveryRequests,
    requestsLoadedAt,
    loadPendingRequests,
    updateUserStatus,
    resetUserPassword,
    logout,
    authMode
  } = useAuth();
  const { fleet, mqttConnected, sendDeviceCommand, patchDeviceMeta } = useMqttFleet();
  const { appearance, setAppearance, syncStatus: appearanceSyncStatus } = useAccountAppearance(profile, authMode);
  const currentTheme = appearance.theme;
  const currentBg = appearance.background;
  const opacity = appearance.opacity;
  const setCurrentTheme = (theme) => setAppearance((current) => ({ ...current, theme }));
  const setCurrentBg = (background) => setAppearance((current) => ({ ...current, background }));
  const setOpacity = (nextOpacity) => setAppearance((current) => ({ ...current, opacity: nextOpacity }));

  // Verificación periódica de conexión con Supabase (cada 15s)
  const [supabaseConnected, setSupabaseConnected] = useState(true);
  useEffect(() => {
    let isMounted = true;
    const checkSupabase = async () => {
      try {
        const { error } = await supabase.rpc('resolve_login_email', { p_identifier: '__ping__' });
        if (isMounted) {
          setSupabaseConnected(!error && navigator.onLine);
        }
      } catch (e) {
        if (isMounted) setSupabaseConnected(false);
      }
    };

    checkSupabase();
    const timer = setInterval(checkSupabase, 15000);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    initAudioUnlock();
  }, []);

  const [cloudDiagType, setCloudDiagType] = useState(null);

  // Kiosk & Navegación
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
    return localStorage.getItem('scada_selected_mac') || sessionStorage.getItem('scada_tab_selected_mac') || null;
  });

  const [activeSection, setActiveSection] = useState(getInitialActiveSection);
  const [visitedSections, setVisitedSections] = useState(() => new Set([activeSection]));

  const [healthFilter, setHealthFilter] = useState(() => sessionStorage.getItem('scada_tab_health_filter') || 'ALL');
  const [fleetSearch, setFleetSearch] = useState(() => sessionStorage.getItem('scada_fleet_search') || '');
  const [fleetSort, setFleetSort] = useState(() => sessionStorage.getItem('scada_fleet_sort') || 'STATUS');

  useEffect(() => {
    if (APP_SECTIONS.has(activeSection) && !kioskMac) {
      sessionStorage.setItem('scada_tab_active_section', activeSection);
      localStorage.setItem('scada_active_section', activeSection);
    }
  }, [activeSection, kioskMac]);

  useEffect(() => {
    if (APP_SECTIONS.has(activeSection)) {
      setVisitedSections((current) => current.has(activeSection) ? current : new Set([...current, activeSection]));
    }
  }, [activeSection]);

  useEffect(() => {
    if (kioskMac) return;
    if (selectedMac) {
      sessionStorage.setItem('scada_tab_selected_mac', selectedMac);
      localStorage.setItem('scada_selected_mac', selectedMac);
    } else {
      sessionStorage.removeItem('scada_tab_selected_mac');
      localStorage.removeItem('scada_selected_mac');
    }
  }, [selectedMac, kioskMac]);

  useEffect(() => {
    sessionStorage.setItem('scada_tab_health_filter', healthFilter);
  }, [healthFilter]);

  useEffect(() => {
    sessionStorage.setItem('scada_fleet_search', fleetSearch);
  }, [fleetSearch]);

  useEffect(() => {
    sessionStorage.setItem('scada_fleet_sort', fleetSort);
  }, [fleetSort]);

  const toggleKioskMode = useCallback((macToKiosk = null) => {
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
  }, [kioskMac, selectedMac]);

  // Modales y Menú Contextual
  const [contextMenu, setContextMenu] = useState({ isOpen: false, position: { x: 0, y: 0 }, device: null });
  const [assignModal, setAssignModal] = useState({ isOpen: false, device: null });
  const [qrModalDevice, setQrModalDevice] = useState(null);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [sirenActive, setSirenActive] = useState(false);
  const sirenActiveRef = useRef(false);

  const handleDeviceContextMenu = useCallback((e, dev) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      device: dev
    });
  }, []);

  // Reloj de inactividad con throttle
  const [showTimeoutModal, setShowTimeoutModal] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const idleTimerRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const lastActivityTimestamp = useRef(Date.now());

  const resetIdleTimer = useCallback(() => {
    if (!user) return;
    clearTimeout(idleTimerRef.current);
    if (!showTimeoutModal) {
      idleTimerRef.current = setTimeout(() => {
        setShowTimeoutModal(true);
        setCountdown(60);
      }, 14 * 60 * 1000);
    }
  }, [user, showTimeoutModal]);

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
    const handleThrottledActivity = () => {
      const now = Date.now();
      if (now - lastActivityTimestamp.current > 5000) {
        lastActivityTimestamp.current = now;
        resetIdleTimer();
      }
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart'];
    events.forEach((evt) => window.addEventListener(evt, handleThrottledActivity, { passive: true }));
    resetIdleTimer();
    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleThrottledActivity));
      clearTimeout(idleTimerRef.current);
    };
  }, [resetIdleTimer]);

  const userRole = (profile?.rol || '').toLowerCase();
  const isAdmin = userRole.includes('admin') || userRole.includes('director');
  const canEditHardware = isAdmin || userRole.includes('tecnico');
  const isOperator = userRole.includes('operador') || userRole.includes('cliente');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
  }, [currentTheme]);

  useEffect(() => {
    const alpha = (opacity / 100).toFixed(2);
    document.documentElement.style.setProperty('--glass-opacity', alpha);
  }, [opacity]);

  // Vigilante optimizado de sirena
  const alarmasNotificadasRef = useRef(new Set());
  useEffect(() => {
    let hasCriticalAlarm = false;
    const macs = Object.keys(fleet);

    for (const mac of macs) {
      const dev = fleet[mac];
      const alarmCod = dev?.datos?.alarma_cod;

      if (alarmCod && alarmCod > 0) {
        hasCriticalAlarm = true;

        if (!alarmasNotificadasRef.current.has(mac)) {
          alarmasNotificadasRef.current.add(mac);
          sendCriticalAlarmWithButtons({
            mac,
            alias: dev?.meta?.alias || mac,
            temp: parseFloat(dev?.datos?.temp_camara || 0),
            pres: parseFloat(dev?.datos?.presion || 0),
            fase: dev?.datos?.fase || 'CRÍTICA',
            errorMsg: dev?.datos?.alarma_msg || 'Alarma en cámara'
          });
        }
      } else {
        alarmasNotificadasRef.current.delete(mac);
      }
    }

    if (hasCriticalAlarm && !sirenActiveRef.current) {
      sirenActiveRef.current = true;
      setSirenActive(true);
      startIndustrialSiren();
    } else if (!hasCriticalAlarm && sirenActiveRef.current) {
      sirenActiveRef.current = false;
      setSirenActive(false);
      stopIndustrialSiren();
    }
  }, [fleet]);

  const handleSilenceSiren = useCallback(() => {
    sirenActiveRef.current = false;
    stopIndustrialSiren();
    setSirenActive(false);
  }, []);

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
  }, [handleSilenceSiren]);

  const allowedDevices = useMemo(() => {
    const macKeys = Object.keys(fleet);
    if (isAdmin) return macKeys.map((k) => fleet[k]).filter(Boolean);

    const userHospital = (profile?.departamento || '').toLowerCase().trim();
    const currentUsername = (profile?.user || profile?.usuario || user?.email || '').toLowerCase().trim();
    const userAuthMacs = (profile?.equipos_autorizados || '').toUpperCase().split(',').map((x) => x.trim()).filter(Boolean);

    return macKeys
      .map((k) => fleet[k])
      .filter((dev) => {
        if (!dev) return false;
        if (userAuthMacs.includes(dev.mac)) return true;
        const devAssignedUser = (dev?.meta?.usuario_asignado || '').toLowerCase().trim();
        if (devAssignedUser && devAssignedUser === currentUsername) return true;
        const devHospital = (dev?.meta?.cliente || '').toLowerCase().trim();
        if (userHospital && devHospital && (devHospital.includes(userHospital) || userHospital.includes(devHospital))) return true;
        return false;
      });
  }, [fleet, isAdmin, profile, user]);

  const notificationCenter = useNotificationCenter({
    enabled: Boolean(user),
    fleet,
    allowedDevices,
    isAdmin,
    profile,
    mqttConnected,
    pendingRequests,
    recoveryRequests,
    requestsLoadedAt,
    loadPendingRequests,
    updateUserStatus,
    resetUserPassword,
    sendDeviceCommand
  });
  const bellCount = notificationCenter.counts.unattended;
  const bellCritical = notificationCenter.counts.criticalNew > 0;

  const getDeviceHealthData = useCallback((dev) => {
    if (!dev || !dev.lastSeen || dev.lastSeen === 0) {
      return { status: 'OFFLINE', text: 'DESCONECTADO', timeAgo: 'Sin señal', colorClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30' };
    }
    const diffSegundos = Math.max(0, Math.floor((Date.now() - dev.lastSeen) / 1000));

    if (diffSegundos <= 5) {
      return { status: 'ONLINE', text: '100% ONLINE', timeAgo: diffSegundos === 0 ? 'En vivo' : `Hace ${diffSegundos}s`, colorClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
    } else if (diffSegundos <= 10) {
      return { status: 'LATENCY', text: 'LATENCIA', timeAgo: `Hace ${diffSegundos}s`, colorClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
    } else {
      const mins = Math.floor(diffSegundos / 60);
      return { status: 'OFFLINE', text: 'DESCONECTADO', timeAgo: mins > 0 ? `Hace ${mins}m` : `Hace ${diffSegundos}s`, colorClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30' };
    }
  }, []);

  const { countOn, countLat, countOff, filteredDevices } = useMemo(() => {
    let cOn = 0, cLat = 0, cOff = 0;
    const filtered = [];
    const query = fleetSearch.trim().toLocaleLowerCase();

    for (const dev of allowedDevices) {
      const health = getDeviceHealthData(dev);
      if (health.status === 'ONLINE') cOn++;
      else if (health.status === 'LATENCY') cLat++;
      else cOff++;

      const matchesStatus = healthFilter === 'ALL' || healthFilter === health.status;
      const searchableFields = [
        dev?.meta?.alias,
        dev?.meta?.cliente,
        dev?.meta?.tipo,
        dev?.mac,
        dev?.datos?.tipo,
        dev?.datos?.fase,
        health.status,
        health.text
      ];
      const matchesSearch = !query || searchableFields.some((value) => String(value || '').toLocaleLowerCase().includes(query));

      if (matchesStatus && matchesSearch) {
        filtered.push(dev);
      }
    }

    filtered.sort((a, b) => {
      const nameA = String(a?.meta?.alias || a?.mac || '').toLocaleLowerCase();
      const nameB = String(b?.meta?.alias || b?.mac || '').toLocaleLowerCase();
      if (fleetSort === 'NAME') return nameA.localeCompare(nameB, 'es');
      if (fleetSort === 'RECENT') return Number(b?.lastSeen || 0) - Number(a?.lastSeen || 0) || nameA.localeCompare(nameB, 'es');

      const statusRank = { ONLINE: 0, LATENCY: 1, OFFLINE: 2 };
      return statusRank[getDeviceHealthData(a).status] - statusRank[getDeviceHealthData(b).status] || nameA.localeCompare(nameB, 'es');
    });

    return { countOn: cOn, countLat: cLat, countOff: cOff, filteredDevices: filtered };
  }, [allowedDevices, healthFilter, fleetSearch, fleetSort, getDeviceHealthData]);

  const inspectingMacToUse = kioskMac || selectedMac;
  const inspectingDevice = useMemo(() => {
    if (inspectingMacToUse) {
      return fleet[inspectingMacToUse] || {
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
        meta: { alias: `EQUIPO [${inspectingMacToUse.slice(-4)}]`, cliente: 'Conectando a la red...', modelo: 'Universal' },
        f0Score: 0.0,
        history: []
      };
    }
    return filteredDevices[0] || null;
  }, [inspectingMacToUse, fleet, filteredDevices]);

  const mainRef = useRef(null);
  const [navDir, setNavDir] = useState('none');
  const navIndex = MOBILE_SECTIONS.indexOf(activeSection === 'detalle' ? 'flota' : activeSection === 'servicio' ? 'gestion' : activeSection);

  const goToSection = useCallback((next) => {
    const to = MOBILE_SECTIONS.indexOf(next);
    setNavDir(navIndex === -1 || to === -1 || navIndex === to ? 'none' : to > navIndex ? 'next' : 'prev');
    setActiveSection(next);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [navIndex]);

  const detailIndex = filteredDevices.findIndex((d) => d.mac === selectedMac);
  const goToDevice = useCallback((delta) => {
    const next = filteredDevices[detailIndex + delta];
    if (detailIndex === -1 || !next) return false;
    setNavDir(delta > 0 ? 'next' : 'prev');
    setSelectedMac(next.mac);
    return true;
  }, [filteredDevices, detailIndex]);

  useSwipe(mainRef, {
    enabled: Boolean(user) && !kioskMac,
    onSwipeLeft: () => (activeSection === 'detalle' ? false : stepThrough(MOBILE_SECTIONS, activeSection, 1, goToSection)),
    onSwipeRight: () => (activeSection === 'detalle' ? false : stepThrough(MOBILE_SECTIONS, activeSection, -1, goToSection))
  });

  const bgObj = useMemo(() => WALLPAPERS_LIST.find((b) => b.id === currentBg) || WALLPAPERS_LIST[0], [currentBg]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070913] flex flex-col items-center justify-center font-mono">
        <Activity className="w-8 h-8 text-cyan-400 animate-spin mb-3" />
        <p className="text-xs text-cyan-400 tracking-wider">SINCRONIZANDO SESIÓN BIOMÉDICA CENTRAL...</p>
      </div>
    );
  }

  const displayName = profile?.nombre || profile?.user || profile?.usuario || user?.email?.split('@')[0] || 'ADMIN';
  const displayRole = profile?.rol || 'SUPERADMIN';
  const displayUser = profile?.user || profile?.usuario || user?.email?.split('@')[0] || 'admin';
  const displayHospital = profile?.departamento || 'Central Hospitalaria';

  return (
    <div className="app-shell min-h-screen w-full relative pb-20 lg:pb-6 flex flex-col overflow-x-hidden font-mono">

      {/* Fondo de Partículas Animadas */}
      <div className="particle-background" />

      {/* Fondo Fijo */}
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
          <div className="bg-rose-600 px-3 sm:px-4 py-2 flex items-center justify-between text-white font-bold text-xs shadow-2xl animate-pulse sticky top-0 z-50 alert-wave">
            <div className="flex items-center gap-2 truncate">
              <Volume2 className="w-4 h-4 animate-bounce shrink-0 icon-glow" />
              <span className="truncate neon-text">🚨 ALARMA CRÍTICA // SIRENA INDUSTRIAL EN BUCLE</span>
            </div>
            <button
              onClick={handleSilenceSiren}
              className="px-2.5 py-1 bg-white text-rose-700 hover:bg-slate-100 rounded-lg text-xs font-black shrink-0 ml-2 shadow-lg btn-glow-effect"
            >
              SILENCIAR
            </button>
          </div>
        )}

        {/* Header Superior */}
        <header className="header-shell speedtest-laser-header border-b border-cyan-500/20 px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between sticky top-0 z-40 w-full glass-shine">
          <HeaderLaserOrbit />
          <div className="brand-lockup flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="brand-emitter p-1.5 sm:p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shrink-0">
              <Activity className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 truncate">
                <h1 className="brand-wordmark text-sm sm:text-base md:text-lg font-bold tracking-wider truncate">
                  BIOFLEET OS™
                </h1>
                <span className="text-[9px] sm:text-[10px] font-mono px-1 py-0.2 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 shrink-0">
                  v2.0
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono hidden sm:block truncate">
                Supervisión de Flota Biomédica, Vehicular & PLC Industrial
              </p>
            </div>
          </div>

          <div className="header-actions flex items-center gap-1.5 sm:gap-2.5 shrink-0 ml-2">
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
                  </div>
                }
                shortcut="SESIÓN ACTIVA"
                position="bottom"
              >
                <div className="user-chip ultra-glass flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-xl border border-cyan-500/30 shadow-sm hover:border-cyan-400/60 transition-all cursor-help group">
                  <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-400/40 text-cyan-300 flex items-center justify-center font-bold text-xs uppercase shrink-0 group-hover:scale-105 transition-transform">
                    {displayName[0]}
                  </div>
                  <div className="text-left hidden sm:block">
                    <p className="text-xs font-bold text-white leading-tight truncate max-w-[110px]">
                      {displayName}
                    </p>
                    <p className="text-[9px] text-cyan-400 font-mono leading-none font-semibold tracking-wide">
                      {displayRole}
                    </p>
                  </div>
                </div>
              </ClinicalTooltip>
            )}

            {/* Notificaciones */}
            {user && (
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-1.5 sm:p-2 rounded-xl bg-slate-900/90 border border-cyan-500/40 text-cyan-300 shrink-0 ultra-glass hover:bg-cyan-500/20 transition-all group"
                title="Notificaciones"
              >
                <Bell className={`w-4 h-4 sm:w-5 sm:h-5 ${bellCritical ? 'text-rose-300 animate-[ring_2s_ease-in-out_infinite]' : ''}`} />
                {bellCount > 0 && (
                  <span className={`absolute -top-1 -right-1 min-w-[16px] px-1 rounded-full text-[9px] font-bold leading-4 text-center status-indicator ${
                    bellCritical
                      ? 'bg-rose-500 text-white shadow-[0_0_12px_rgba(244,63,94,0.7)]'
                      : 'bg-amber-400 text-slate-950 shadow-[0_0_10px_rgba(251,191,36,0.6)]'
                  }`}>
                    {bellCount > 99 ? '99+' : bellCount}
                  </span>
                )}
                {bellCritical && (
                  <div className="absolute inset-0 rounded-xl bg-rose-500/10 animate-pulse"></div>
                )}
              </button>
            )}

            {/* Ajustes */}
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
                  onOpenDiagnostics={isAdmin ? () => setCloudDiagType('hivemq') : null}
                  appearanceSyncStatus={appearanceSyncStatus}
                />
              </div>
            )}
          </div>
        </header>

        {/* Barra de Navegación PC */}
        {user && !kioskMac && !isOperator && (
          <div className="fleet-main-nav hidden lg:flex items-center gap-2 px-6 py-2 border-b">
            <button
              onClick={() => setActiveSection('flota')}
              className={`fleet-nav-pill px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                activeSection === 'flota' ? 'fleet-nav-pill--active text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              ⚡ Flota en Vivo ({allowedDevices.length})
            </button>

            <button
              onClick={() => setActiveSection('gestion')}
              className={`fleet-nav-pill px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                activeSection === 'gestion' ? 'fleet-nav-pill--active text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              🏢 Gestión Flota
            </button>

            <button
              onClick={() => setActiveSection('servicio')}
              className={`fleet-nav-pill px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                activeSection === 'servicio' ? 'fleet-nav-pill--active text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              🛠️ Reportes técnicos
            </button>

            <button
              onClick={() => setActiveSection('studio')}
              className={`fleet-nav-pill px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${
                activeSection === 'studio' 
                  ? 'fleet-nav-pill--active text-slate-950' 
                  : 'text-amber-400 hover:text-white bg-slate-900/60 border border-amber-500/30'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>✨ AI Studio</span>
            </button>

            <button
              onClick={() => setActiveSection('usuarios')}
              className={`fleet-nav-pill px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                activeSection === 'usuarios' ? 'fleet-nav-pill--active text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              🛡️ Personal
            </button>

            <button
              onClick={() => setActiveSection('fota')}
              className={`fleet-nav-pill px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                activeSection === 'fota' ? 'fleet-nav-pill--active text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              🚀 FOTA Hub
            </button>

            <button
              onClick={() => setActiveSection('auditoria')}
              className={`fleet-nav-pill px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                activeSection === 'auditoria' ? 'fleet-nav-pill--active text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              📋 Auditoría Supabase
            </button>
          </div>
        )}

        {/* Contenido Principal */}
        {!user ? (
          <main className="flex-1 flex items-center justify-center p-4 android-view-transition">
            <LoginModal />
          </main>
        ) : (
          <main ref={mainRef} data-nav-dir={navDir} className="flex-1 p-3 md:p-6 max-w-7xl mx-auto w-full flex flex-col gap-4 android-view-transition">
            
            <>
              {inspectingDevice && (kioskMac || selectedMac) && (visitedSections.has('detalle') || activeSection === 'detalle' || kioskMac) && (
                <div className="app-view-panel" hidden={!(kioskMac || activeSection === 'detalle')}>
                  {!kioskMac && detailIndex !== -1 && filteredDevices.length > 1 && (
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <button
                        type="button"
                        onClick={() => goToDevice(-1)}
                        disabled={detailIndex <= 0}
                        aria-label="Equipo anterior"
                        className="p-2 rounded-xl border border-slate-700 bg-slate-900/60 text-slate-300 hover:text-white disabled:opacity-30"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <div className="flex flex-col items-center gap-1.5 min-w-0">
                        <span className="text-[10px] font-mono text-slate-400 text-center">
                          Equipo {detailIndex + 1} de {filteredDevices.length}
                        </span>
                        {filteredDevices.length <= 12 && <SwipeDots count={filteredDevices.length} index={detailIndex} />}
                      </div>
                      <button
                        type="button"
                        onClick={() => goToDevice(1)}
                        disabled={detailIndex >= filteredDevices.length - 1}
                        aria-label="Equipo siguiente"
                        className="p-2 rounded-xl border border-slate-700 bg-slate-900/60 text-slate-300 hover:text-white disabled:opacity-30"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  <div key={inspectingMacToUse} className={navDir === 'next' ? 'swipe-enter-next' : navDir === 'prev' ? 'swipe-enter-prev' : ''}>
                    <Suspense fallback={<ViewLoader />}>
                    <DeviceDetailView
                      key={inspectingMacToUse}
                      device={inspectingDevice}
                      onBack={() => { setActiveSection('flota'); setSelectedMac(null); }}
                      sendCommand={sendDeviceCommand}
                      operatorName={displayName}
                      userRole={displayRole}
                      isKioskMode={Boolean(kioskMac)}
                      onToggleKiosk={() => toggleKioskMode(inspectingMacToUse)}
                      onDeviceUpdated={(row) => patchDeviceMeta(inspectingMacToUse, row)}
                      isAdmin={isAdmin}
                    />
                    </Suspense>
                  </div>
                </div>
              )}

              {(visitedSections.has('flota') || activeSection === 'flota') && (
                <div className="app-view-panel" hidden={activeSection !== 'flota'}>
                  <div className="space-y-4">
                    <section className="fleet-overview flex flex-col lg:flex-row lg:items-center justify-between gap-5 px-4 py-4 sm:px-5 sm:py-5 rounded-xl">
                      <div className="relative z-10 flex items-start gap-3">
                        <div className="fleet-overview-mark flex items-center justify-center w-11 h-11 rounded-lg shrink-0">
                          <Activity className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[9px] tracking-[0.18em] font-bold text-cyan-300/80 uppercase">Biofleet / Operaciones</span>
                            <span className="fleet-overview-live"><span /> EN VIVO</span>
                          </div>
                          <h2 className="text-lg sm:text-xl font-bold text-white leading-tight">Centro de flota</h2>
                          <p className="text-[10px] text-slate-400 mt-1">Supervisión biomédica · Vista general de activos</p>
                        </div>
                      </div>

                      <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 lg:min-w-[480px]">
                        <button
                          type="button"
                          aria-label={`Filtrar equipos conectados: ${countOn}`}
                          aria-pressed={healthFilter === 'ONLINE'}
                          onClick={() => setHealthFilter((current) => current === 'ONLINE' ? 'ALL' : 'ONLINE')}
                          className={`fleet-overview-stat fleet-overview-stat-button scale-3d ${healthFilter === 'ONLINE' ? 'fleet-overview-stat--active' : ''}`}
                        >
                          <span className="fleet-overview-stat-label">Conectados</span>
                          <span className="fleet-overview-stat-value text-emerald-300">{countOn}</span>
                          <span className="fleet-overview-stat-foot">de {allowedDevices.length} activos</span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Filtrar equipos con latencia: ${countLat}`}
                          aria-pressed={healthFilter === 'LATENCY'}
                          onClick={() => setHealthFilter((current) => current === 'LATENCY' ? 'ALL' : 'LATENCY')}
                          className={`fleet-overview-stat fleet-overview-stat-button scale-3d ${healthFilter === 'LATENCY' ? 'fleet-overview-stat--active' : ''}`}
                        >
                          <span className="fleet-overview-stat-label">Con latencia</span>
                          <span className="fleet-overview-stat-value text-amber-300">{countLat}</span>
                          <span className="fleet-overview-stat-foot">requieren atención</span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Filtrar equipos desconectados: ${countOff}`}
                          aria-pressed={healthFilter === 'OFFLINE'}
                          onClick={() => setHealthFilter((current) => current === 'OFFLINE' ? 'ALL' : 'OFFLINE')}
                          className={`fleet-overview-stat fleet-overview-stat-button scale-3d ${healthFilter === 'OFFLINE' ? 'fleet-overview-stat--active' : ''}`}
                        >
                          <span className="fleet-overview-stat-label">Sin señal</span>
                          <span className="fleet-overview-stat-value text-rose-300">{countOff}</span>
                          <span className="fleet-overview-stat-foot">fuera de línea</span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Mostrar todos los equipos: ${allowedDevices.length}`}
                          aria-pressed={healthFilter === 'ALL'}
                          onClick={() => setHealthFilter('ALL')}
                          className={`fleet-overview-stat fleet-overview-stat-button scale-3d ${healthFilter === 'ALL' ? 'fleet-overview-stat--active' : ''}`}
                        >
                          <span className="fleet-overview-stat-label">Todos</span>
                          <span className="fleet-overview-stat-value">{allowedDevices.length}</span>
                          <span className="fleet-overview-stat-foot">equipos registrados</span>
                        </button>
                      </div>
                    </section>

                    <div className="fleet-controls flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                        <span>{filteredDevices.length} de {allowedDevices.length} equipos</span>
                        {healthFilter !== 'ALL' && (
                          <button type="button" onClick={() => setHealthFilter('ALL')} className="fleet-clear-filter">
                            Mostrar todos
                          </button>
                        )}
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        <label className="fleet-search-control flex items-center gap-2 px-3 py-2 rounded-lg w-full sm:w-72">
                          <Search className="w-4 h-4 shrink-0 text-slate-400" />
                          <input
                            type="search"
                            value={fleetSearch}
                            onChange={(event) => setFleetSearch(event.target.value)}
                            placeholder="Buscar alias, MAC o centro"
                            aria-label="Buscar dispositivos por alias, MAC, centro o estado"
                            className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-slate-500"
                          />
                          {fleetSearch && (
                            <button type="button" onClick={() => setFleetSearch('')} aria-label="Limpiar búsqueda" className="text-slate-400 hover:text-white">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </label>
                        <label className="fleet-sort-control flex items-center gap-2 px-3 py-2 rounded-lg sm:min-w-48">
                          <ArrowDownAZ className="w-4 h-4 shrink-0 text-slate-400" />
                          <select value={fleetSort} onChange={(event) => setFleetSort(event.target.value)} aria-label="Ordenar dispositivos" className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none">
                            <option value="STATUS">Por estado</option>
                            <option value="NAME">Nombre A-Z</option>
                            <option value="RECENT">Actividad reciente</option>
                          </select>
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredDevices.length === 0 ? (
                        <div className="col-span-full ultra-glass p-8 rounded-2xl text-center text-slate-400 font-mono text-xs">
                          {fleetSearch
                            ? `No hay equipos que coincidan con "${fleetSearch}".`
                            : healthFilter === 'ALL'
                              ? 'No hay equipos disponibles en la flota.'
                              : `No hay equipos registrados en el estado [${healthFilter}].`}
                        </div>
                      ) : (
                        filteredDevices.map((dev) => {
                          const dDev = dev.datos || {};
                          const health = getDeviceHealthData(dev);

                          const devTipo = (
                            dev.meta?.config_deseada?.tipo || 
                            dev.meta?.tipo || 
                            dev.datos?.tipo || 
                            'AUTOCLAVE'
                          ).toUpperCase();

                          const isVeh = devTipo === 'VEHICULO';
                          const isPlc = devTipo === 'UNIVERSAL_PLC' || devTipo === 'PLC_GENERICO';

                          const fase = String(dDev.fase || 'EN ESPERA').toUpperCase();
                          const faseActiva = !/^(EN[ _]?ESPERA|ESPERA|APAGADO|CANCELADO|FINALIZADO.*|LISTO|IDLE)$/.test(fase.trim());
                          const faseTone = /ALARM|ERROR|FALL|ABORT|CANCEL/.test(fase)
                            ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                            : /FINALIZ|EXITO|ÉXITO/.test(fase)
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                              : faseActiva
                                ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                                : 'border-slate-700 bg-slate-900/60 text-slate-300';
                          const segRest = Number(dDev.seg_restantes || 0);

                          const tempNum = parseFloat(dDev.temp_camara ?? 25.0);
                          const presNum = parseFloat(dDev.presion ?? 0.0);

                          return (
                            <div
                              key={dev.mac}
                              role="button"
                              tabIndex={0}
                              aria-label={`Abrir equipo ${dev.meta?.alias || dev.mac}`}
                              onClick={() => { setSelectedMac(dev.mac); setActiveSection('detalle'); }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  setSelectedMac(dev.mac);
                                  setActiveSection('detalle');
                                }
                              }}
                              onContextMenu={(e) => handleDeviceContextMenu(e, dev)}
                              className="fleet-device-card ultra-glass glow-border scale-3d p-5 rounded-2xl cursor-pointer flex flex-col justify-between"
                            >
                              <div>
                                <div className="flex justify-between items-start mb-3">
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <h3 className="font-bold text-sm text-white">{dev.meta?.alias || `EQUIPO [${dev.mac.slice(-4)}]`}</h3>
                                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold border flex items-center gap-1 ${
                                        isVeh 
                                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                                          : isPlc
                                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                                          : 'bg-cyan-500/20 text-cyan-300 border-cyan-400'
                                      }`}>
                                        {isVeh ? <Car className="w-2.5 h-2.5" /> : isPlc ? <Cpu className="w-2.5 h-2.5" /> : <Activity className="w-2.5 h-2.5" />}
                                        {devTipo}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">{dev.meta?.cliente || 'Cliente'} • {dev.mac}</p>
                                  </div>
                                  
                                  <div className="text-right">
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border font-bold ${health.colorClass} status-indicator`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${
                                        health.status === 'ONLINE' ? 'bg-emerald-400 pulse-organic' :
                                        health.status === 'LATENCY' ? 'bg-amber-400 pulse-organic' :
                                        'bg-rose-400'
                                      }`}></span>
                                      {health.text}
                                    </span>
                                    <span className="block text-[9px] text-slate-400 font-mono mt-0.5">
                                      {health.timeAgo}
                                    </span>
                                  </div>
                                </div>

                                {isVeh ? (
                                  <div className="grid grid-cols-2 gap-2 my-3">
                                    <div className="p-2.5 rounded-xl glass-cell hologram text-center w-full scale-3d">
                                      <span className="text-[10px] font-mono text-emerald-400 block">BATERÍA 12V</span>
                                      <span className="text-xl font-bold font-mono text-emerald-300">
                                        {(dDev.bateria_v || 12.6).toFixed(1)} V
                                      </span>
                                    </div>
                                    <div className="p-2.5 rounded-xl glass-cell hologram text-center w-full scale-3d">
                                      <span className="text-[10px] font-mono text-amber-400 block">ESTADO</span>
                                      <span className="text-sm font-bold font-mono text-white truncate block mt-1">
                                        {dDev.fase || 'APAGADO'}
                                      </span>
                                    </div>
                                  </div>
                                ) : isPlc ? (
                                  <div className="grid grid-cols-2 gap-2 my-3 font-mono">
                                    <div className="p-2.5 rounded-xl glass-cell hologram text-center w-full scale-3d">
                                      <span className="text-[10px] text-cyan-400 block">RELÉS</span>
                                      <span className="text-xl font-bold text-white">
                                        {Object.values(dDev.reles || {}).filter(Boolean).length} / 8
                                      </span>
                                    </div>
                                    <div className="p-2.5 rounded-xl glass-cell hologram text-center w-full scale-3d">
                                      <span className="text-[10px] text-emerald-400 block">ENTRADAS</span>
                                      <span className="text-xl font-bold text-white">
                                        {Object.values(dDev.entradas || {}).filter(Boolean).length} / 8
                                      </span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-2 gap-2 my-3">
                                    <div className="p-2.5 rounded-xl glass-cell hologram text-center w-full scale-3d">
                                      <span className="text-[10px] font-mono text-cyan-400 block">TEMPERATURA</span>
                                      <span className="text-xl font-bold font-mono text-white">
                                        {isNaN(tempNum) ? '25.0' : tempNum.toFixed(1)}°C
                                      </span>
                                    </div>
                                    <div className="p-2.5 rounded-xl glass-cell hologram text-center w-full scale-3d">
                                      <span className="text-[10px] font-mono text-pink-400 block">PRESIÓN</span>
                                      <span className="text-xl font-bold font-mono text-white">
                                        {isNaN(presNum) ? '0.00' : presNum.toFixed(2)}b
                                      </span>
                                    </div>
                                  </div>
                                )}

                                <div className={`flex items-center justify-between gap-2 mb-3 px-3 py-2 rounded-xl border ${faseTone}`}>
                                  <span className="flex items-center gap-2 min-w-0">
                                    <span className="relative flex w-2.5 h-2.5 shrink-0">
                                      {faseActiva && <span className="absolute inset-0 rounded-full bg-current opacity-60 animate-ping" />}
                                      <span className="relative w-2.5 h-2.5 rounded-full bg-current" />
                                    </span>
                                    <span className="text-[10px] font-mono uppercase tracking-wider opacity-70">Fase</span>
                                    <span className="text-xs font-bold font-mono truncate">{fase}</span>
                                  </span>
                                  {segRest > 0 && (
                                    <span className="text-[11px] font-mono font-bold tabular-nums shrink-0">
                                      {Math.floor(segRest / 60)}:{String(segRest % 60).padStart(2, '0')}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="fleet-device-cta pt-3 border-t border-white/10 flex items-center justify-between text-xs font-mono text-cyan-400 font-bold w-full rounded-b-xl">
                                <span>ENTRAR A CABINA DE CONTROL</span>
                                <ChevronRight className="w-4 h-4" />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}

              {(visitedSections.has('gestion') || activeSection === 'gestion') && (
                <div className="app-view-panel" hidden={activeSection !== 'gestion'}>
                  <Suspense fallback={<ViewLoader />}>
                  <FleetManagementView
                    fleet={fleet}
                    sendCommand={sendDeviceCommand}
                    onSelectDevice={(mac) => { setSelectedMac(mac); setActiveSection('detalle'); }}
                    onOpenReports={() => setActiveSection('servicio')}
                  />
                  </Suspense>
                </div>
              )}

              {(visitedSections.has('servicio') || activeSection === 'servicio') && (
                <div className="app-view-panel" hidden={activeSection !== 'servicio'}>
                  <Suspense fallback={<ViewLoader />}>
                  <ServiceReportsView
                    fleet={Object.fromEntries(allowedDevices.map((d) => [d.mac, d]))}
                    operatorName={displayName}
                    isAdmin={isAdmin}
                  />
                  </Suspense>
                </div>
              )}

              {(visitedSections.has('studio') || activeSection === 'studio') && (
                <div className="app-view-panel" hidden={activeSection !== 'studio'}>
                  <Suspense fallback={<ViewLoader />}>
                  <AiAutomationStudio
                    fleet={fleet}
                    sendCommand={sendDeviceCommand}
                    initialDeviceMac={selectedMac}
                  />
                  </Suspense>
                </div>
              )}

              {(visitedSections.has('usuarios') || activeSection === 'usuarios') && (
                <div className="app-view-panel" hidden={activeSection !== 'usuarios'}>
                  <Suspense fallback={<ViewLoader />}>
                  <UserManagementView
                    fleet={fleet}
                    onFleetUpdated={() => {}}
                  />
                  </Suspense>
                </div>
              )}

              {(visitedSections.has('fota') || activeSection === 'fota') && (
                <div className="app-view-panel" hidden={activeSection !== 'fota'}>
                  <Suspense fallback={<ViewLoader />}>
                  <FotaHubView fleet={fleet} sendCommand={sendDeviceCommand} />
                  </Suspense>
                </div>
              )}

              {(visitedSections.has('auditoria') || activeSection === 'auditoria') && (
                <div className="app-view-panel" hidden={activeSection !== 'auditoria'}>
                  <Suspense fallback={<ViewLoader />}>
                  <ClinicalAuditView />
                  </Suspense>
                </div>
              )}
            </>

          </main>
        )}

        {/* Barra Inferior Celular */}
        {user && !kioskMac && (
          <nav className="mobile-nav-shell lg:hidden fixed bottom-0 left-0 right-0 h-16 border-t border-cyan-500/30 backdrop-blur-xl flex items-center justify-around z-50">
            <span
              className="mobile-nav-indicator"
              style={{ transform: `translateX(${Math.max(navIndex, 0) * 100}%)`, opacity: navIndex === -1 ? 0 : 1 }}
            />
            <button
              onClick={() => goToSection('flota')}
              className={`flex-1 flex flex-col items-center gap-1 py-1 px-1 rounded-lg text-[10px] font-mono transition-all ${
                activeSection === 'flota' || activeSection === 'detalle' ? 'text-cyan-400 font-bold scale-110' : 'text-slate-400 hover:text-cyan-300'
              }`}
            >
              <Activity className={`w-5 h-5 ${activeSection === 'flota' || activeSection === 'detalle' ? 'icon-glow' : ''}`} />
              <span>Flota</span>
            </button>

            <button
              onClick={() => goToSection('gestion')}
              className={`flex-1 flex flex-col items-center gap-1 py-1 px-1 rounded-lg text-[10px] font-mono transition-all ${
                activeSection === 'gestion' ? 'text-cyan-400 font-bold scale-110' : 'text-slate-400 hover:text-cyan-300'
              }`}
            >
              <Building2 className={`w-5 h-5 ${activeSection === 'gestion' ? 'icon-glow' : ''}`} />
              <span>Gestión</span>
            </button>

            <button
              onClick={() => goToSection('studio')}
              className={`flex-1 flex flex-col items-center gap-1 py-1 px-1 rounded-lg text-[10px] font-mono transition-all ${
                activeSection === 'studio' ? 'text-amber-400 font-bold scale-110' : 'text-slate-400 hover:text-amber-300'
              }`}
            >
              <Sparkles className={`w-5 h-5 ${activeSection === 'studio' ? 'icon-glow' : ''}`} />
              <span>Studio</span>
            </button>

            <button
              onClick={() => goToSection('usuarios')}
              className={`flex-1 flex flex-col items-center gap-1 py-1 px-1 rounded-lg text-[10px] font-mono transition-all ${
                activeSection === 'usuarios' ? 'text-cyan-400 font-bold scale-110' : 'text-slate-400 hover:text-cyan-300'
              }`}
            >
              <Shield className={`w-5 h-5 ${activeSection === 'usuarios' ? 'icon-glow' : ''}`} />
              <span>Personal</span>
            </button>

            <button
              onClick={() => goToSection('fota')}
              className={`flex-1 flex flex-col items-center gap-1 py-1 px-1 rounded-lg text-[10px] font-mono transition-all ${
                activeSection === 'fota' ? 'text-cyan-400 font-bold scale-110' : 'text-slate-400 hover:text-cyan-300'
              }`}
            >
              <Rocket className={`w-5 h-5 ${activeSection === 'fota' ? 'icon-glow' : ''}`} />
              <span>FOTA</span>
            </button>
          </nav>
        )}

        {/* Modales */}
        {showTimeoutModal && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
            <div className="ultra-glass border-2 border-amber-500 p-6 rounded-2xl max-w-sm w-full text-center space-y-4 shadow-[0_0_30px_rgba(245,158,11,0.3)] font-mono text-xs">
              <div className="inline-flex p-3 rounded-full bg-amber-500/20 text-amber-300 animate-bounce">
                <Clock className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-white uppercase">Sesión por Expirar</h3>
              <p className="text-slate-300 leading-relaxed font-sans">
                Por protocolo, tu sesión se cerrará en <strong className="text-cyan-300 text-sm">{countdown}s</strong>.
              </p>
              <div className="flex gap-2 pt-2">
                <button onClick={logout} className="flex-1 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold">
                  Cerrar
                </button>
                <button onClick={() => { setShowTimeoutModal(false); resetIdleTimer(); }} className="flex-1 py-2 bg-cyan-600 text-white rounded-xl font-bold shadow-lg">
                  Continuar
                </button>
              </div>
            </div>
          </div>
        )}

        {Boolean(cloudDiagType) && (
          <CloudDiagnosticsModal
            isOpen={Boolean(cloudDiagType)}
            onClose={() => setCloudDiagType(null)}
            type={cloudDiagType || 'hivemq'}
            fleet={fleet}
            mqttConnected={mqttConnected}
            supabaseConnected={supabaseConnected}
          />
        )}

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

        {assignModal.isOpen && (
          <DeviceAssignmentModal
            isOpen={assignModal.isOpen}
            onClose={() => setAssignModal({ isOpen: false, device: null })}
            device={assignModal.device}
            sendCommand={sendDeviceCommand}
            onAssignmentUpdated={(updatedMeta) => {
              if (fleet[updatedMeta.mac]) {
                fleet[updatedMeta.mac].meta = Object.assign(fleet[updatedMeta.mac].meta || {}, updatedMeta);
                if (!fleet[updatedMeta.mac].datos) fleet[updatedMeta.mac].datos = {};
                fleet[updatedMeta.mac].datos.tipo = updatedMeta.config_deseada?.tipo || updatedMeta.tipo;
              }
            }}
          />
        )}

        {qrModalDevice !== null && (
          <SurgicalQRLabel
            isOpen={qrModalDevice !== null}
            onClose={() => setQrModalDevice(null)}
            deviceData={qrModalDevice}
            operatorName={displayName}
          />
        )}

        {showAdminModal && (
          <UserManagementModal
            isOpen={showAdminModal}
            onClose={() => setShowAdminModal(false)}
          />
        )}

        {/* Panel de Notificaciones */}
        <NotificationsPanel
          isOpen={showNotifications}
          onClose={() => setShowNotifications(false)}
          center={notificationCenter}
          isAdmin={isAdmin}
          sirenActive={sirenActive}
          onSilenceSiren={handleSilenceSiren}
          onOpenAdminModal={() => {
            setShowAdminModal(true);
          }}
          onNavigateToDetail={(mac) => {
            setSelectedMac(mac);
            setActiveSection('detalle');
          }}
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
