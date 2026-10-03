import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginModal from './components/auth/LoginModal';
import UserManagementModal from './components/admin/UserManagementModal';
import DeviceDetailView from './components/dashboard/DeviceDetailView';
import ClinicalAuditView from './components/reports/ClinicalAuditView';
import FotaHubView from './components/fota/FotaHubView';
import FleetManagementView from './components/fleet/FleetManagementView';
import GearMenu, { WALLPAPERS_LIST } from './components/common/GearMenu';
import { useMqttFleet } from './hooks/useMqttFleet';
import { startIndustrialSiren, stopIndustrialSiren } from './services/audioAlarm';
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
  Users
} from 'lucide-react';

function ScadaAppContent() {
  const { user, profile, loading, pendingRequests, logout } = useAuth();
  const { fleet, mqttConnected, sendDeviceCommand } = useMqttFleet();

  // Estados visuales del Menú Engranaje
  const [currentTheme, setCurrentTheme] = useState(() => localStorage.getItem('scada_theme') || 'tactical');
  const [currentBg, setCurrentBg] = useState(() => localStorage.getItem('scada_bg') || 'circuit-pcb');
  const [opacity, setOpacity] = useState(() => Number(localStorage.getItem('scada_transparency')) || 82);

  // Navegación: 'flota' | 'gestion' | 'fota' | 'auditoria' | 'detalle'
  const [activeSection, setActiveSection] = useState('flota');
  const [selectedMac, setSelectedMac] = useState(null);
  const [healthFilter, setHealthFilter] = useState('ALL'); // 'ONLINE' | 'LATENCY' | 'OFFLINE' | 'ALL'
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [sirenActive, setSirenActive] = useState(false);

  // Temporizador de Inactividad (14 min + 1 min de advertencia = 15 min)
  const [showTimeoutModal, setShowTimeoutModal] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const idleTimerRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  const isAdmin = profile?.rol?.toLowerCase().includes('admin') || profile?.rol?.toLowerCase().includes('director');

  // Aplicar tema en tiempo real
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('scada_theme', currentTheme);
  }, [currentTheme]);

  // Aplicar opacidad Ultra-Glass en tiempo real
  useEffect(() => {
    const alpha = (opacity / 100).toFixed(2);
    document.documentElement.style.setProperty('--glass-opacity', alpha);
    localStorage.setItem('scada_transparency', opacity);
  }, [opacity]);

  useEffect(() => {
    localStorage.setItem('scada_bg', currentBg);
  }, [currentBg]);

  // Control de Inactividad Hospitalaria
  const resetIdleTimer = () => {
    if (!user) return;
    clearTimeout(idleTimerRef.current);
    if (!showTimeoutModal) {
      idleTimerRef.current = setTimeout(() => {
        setShowTimeoutModal(true);
        setCountdown(60);
      }, 14 * 60 * 1000); // 14 minutos
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

  const bgObj = WALLPAPERS_LIST.find((b) => b.id === currentBg) || WALLPAPERS_LIST[0];

  // Cálculo de Estados de Conexión de Flota
  const macKeys = Object.keys(fleet);
  let countOn = 0, countLat = 0, countOff = 0;

  macKeys.forEach((mac) => {
    const diff = Date.now() - (fleet[mac]?.lastSeen || 0);
    if (diff < 6000) countOn++;
    else if (diff < 18000) countLat++;
    else countOff++;
  });

  const getDeviceHealth = (dev) => {
    if (!dev?.lastSeen) return 'OFFLINE';
    const diff = Date.now() - dev.lastSeen;
    if (diff < 6000) return 'ONLINE';
    if (diff < 18000) return 'LATENCY';
    return 'OFFLINE';
  };

  // Filtrado de equipos
  const filteredDevices = macKeys
    .map((k) => fleet[k])
    .filter((dev) => {
      const status = getDeviceHealth(dev);
      if (healthFilter === 'ONLINE') return status === 'ONLINE';
      if (healthFilter === 'LATENCY') return status === 'LATENCY';
      if (healthFilter === 'OFFLINE') return status === 'OFFLINE';
      return true;
    });

  const inspectingDevice = selectedMac ? fleet[selectedMac] : (filteredDevices[0] || null);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070913] flex flex-col items-center justify-center">
        <Activity className="w-8 h-8 text-cyan-400 animate-spin mb-3" />
        <p className="text-xs font-mono text-cyan-400 tracking-wider">SINCRONIZANDO SESIÓN BIOMÉDICA CENTRAL...</p>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen flex flex-col relative transition-all duration-700 bg-cover bg-center bg-fixed pb-20 md:pb-6"
      style={{
        backgroundImage: bgObj.url 
          ? `linear-gradient(to bottom, rgba(7, 9, 19, 0.80), rgba(7, 9, 19, 0.94)), url('${bgObj.url}')`
          : 'linear-gradient(to bottom, #030712, #0a1120)'
      }}
    >
      {/* Banner de Emergencia / Sirena Industrial */}
      {sirenActive && (
        <div className="bg-rose-600 px-4 py-2.5 flex items-center justify-between text-white font-bold text-xs shadow-2xl animate-pulse sticky top-0 z-50">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 animate-bounce" />
            <span>🚨 ALARMA CRÍTICA ACTIVA EN AUTOCLAVE // SIRENA INDUSTRIAL EN BUCLE</span>
          </div>
          <button
            onClick={handleSilenceSiren}
            className="px-3 py-1 bg-white text-rose-700 hover:bg-slate-100 rounded-lg text-xs font-black flex items-center gap-1 shadow-lg"
          >
            <VolumeX className="w-3.5 h-3.5" />
            <span>SILENCIAR SIRENA (ACK)</span>
          </button>
        </div>
      )}

      {/* Header Institucional con rayita láser Speedtest */}
      <header className="speedtest-laser-header border-b border-cyan-500/20 bg-slate-950/85 backdrop-blur-md px-4 md:px-6 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Activity className="w-5 h-5 md:w-6 md:h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base md:text-lg font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-emerald-400">
                BIOFLEET OS™
              </h1>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
                ENTERPRISE
              </span>
            </div>
            <p className="text-[10px] md:text-[11px] text-slate-400 font-mono hidden sm:block">
              Supervisión de Flota Biomédica & Trama Dinámica ESP32
            </p>
          </div>
        </div>

        {/* Acciones de Cabecera */}
        <div className="flex items-center gap-2 md:gap-3">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border ${
            mqttConnected 
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
          }`}>
            <span className={`w-2 h-2 rounded-full ${mqttConnected ? 'bg-emerald-400 animate-ping' : 'bg-rose-400'}`}></span>
            {mqttConnected ? 'HIVEMQ 8884' : 'OFFLINE'}
          </span>

          {user && isAdmin && (
            <button
              onClick={() => setShowAdminModal(true)}
              className="relative p-2 rounded-lg bg-slate-900 border border-amber-500/40 text-amber-300"
              title="Aprobaciones y Personal"
            >
              <Bell className="w-4 h-4" />
              {pendingRequests.length > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 text-[9px] font-bold">
                  {pendingRequests.length}
                </span>
              )}
            </button>
          )}

          {user && (
            <GearMenu
              currentTheme={currentTheme}
              setTheme={setCurrentTheme}
              currentBg={currentBg}
              setBg={setCurrentBg}
              opacity={opacity}
              setOpacity={setOpacity}
              onLogout={logout}
            />
          )}
        </div>
      </header>

      {/* Dock Superior en PC */}
      {user && (
        <div className="hidden md:flex items-center gap-2 px-6 py-2 bg-slate-950/60 border-b border-cyan-500/10">
          <button
            onClick={() => { setActiveSection('flota'); setSelectedMac(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
              activeSection === 'flota' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            ⚡ Flota en Vivo ({macKeys.length})
          </button>
          <button
            onClick={() => { setActiveSection('gestion'); setSelectedMac(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
              activeSection === 'gestion' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            🏢 Gestión Flota
          </button>
          <button
            onClick={() => { setActiveSection('fota'); setSelectedMac(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
              activeSection === 'fota' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            🚀 FOTA Hub
          </button>
          <button
            onClick={() => { setActiveSection('auditoria'); setSelectedMac(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
              activeSection === 'auditoria' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            📋 Auditoría Supabase
          </button>
        </div>
      )}

      {/* Contenido Principal */}
      {!user ? (
        <main className="flex-1 flex items-center justify-center p-4">
          <LoginModal />
        </main>
      ) : (
        <main className="flex-1 p-3 md:p-6 max-w-7xl mx-auto w-full flex flex-col gap-4">
          
          {/* SECCIÓN 1: FLOTA CON FILTROS DE SALUD */}
          {activeSection === 'flota' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <h2 className="text-base md:text-lg font-bold font-mono flex items-center gap-2">
                  <Flame className="w-5 h-5 text-cyan-400" />
                  Monitor de Flota Activa
                </h2>

                {/* Filtros de Salud Clínicos */}
                <div className="flex gap-2 overflow-x-auto w-full sm:w-auto pb-1">
                  <button
                    onClick={() => setHealthFilter('ONLINE')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                      healthFilter === 'ONLINE' ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md' : 'bg-slate-900/80 border-slate-700 text-emerald-400'
                    }`}
                  >
                    🟢 ONLINE ({countOn})
                  </button>
                  <button
                    onClick={() => setHealthFilter('LATENCY')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                      healthFilter === 'LATENCY' ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md' : 'bg-slate-900/80 border-slate-700 text-amber-300'
                    }`}
                  >
                    🟡 LATENCIA ({countLat})
                  </button>
                  <button
                    onClick={() => setHealthFilter('OFFLINE')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                      healthFilter === 'OFFLINE' ? 'bg-rose-500 text-white border-rose-400 shadow-md' : 'bg-slate-900/80 border-slate-700 text-rose-400'
                    }`}
                  >
                    🔴 OFFLINE ({countOff})
                  </button>
                  <button
                    onClick={() => setHealthFilter('ALL')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                      healthFilter === 'ALL' ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-md' : 'bg-slate-900/80 border-slate-700 text-slate-300'
                    }`}
                  >
                    🌐 TODOS ({macKeys.length})
                  </button>
                </div>
              </div>

              {/* Grid de Tarjetas */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDevices.length === 0 ? (
                  <div className="col-span-full ultra-glass p-8 rounded-2xl text-center text-slate-400 font-mono text-xs">
                    No hay autoclaves transmitiendo en el filtro [{healthFilter}].
                  </div>
                ) : (
                  filteredDevices.map((dev) => {
                    const dDev = dev.datos || {};
                    const health = getDeviceHealth(dev);
                    const cCount = dDev?.cfg?.ciclos || dev?.meta?.ciclosCompletados || 0;
                    const cLim = dDev?.cfg?.lim_mant || dev?.meta?.limiteMantenimiento || 200;

                    return (
                      <div
                        key={dev.mac}
                        onClick={() => { setSelectedMac(dev.mac); setActiveSection('detalle'); }}
                        className="ultra-glass p-5 rounded-2xl cursor-pointer transition-all duration-200 hover:-translate-y-1 shadow-xl flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <h3 className="font-bold text-sm">{dev.meta?.alias || `AUTOCLAVE [${dev.mac.slice(-4)}]`}</h3>
                              <p className="text-[11px] text-slate-400 font-mono">{dev.meta?.cliente || 'Hospital Central'} • {dev.mac}</p>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                              health === 'ONLINE' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' :
                              health === 'LATENCY' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                              'bg-rose-500/20 text-rose-400 border-rose-500/40'
                            }`}>
                              {health}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 my-3">
                            <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                              <span className="text-[10px] font-mono text-cyan-400 block">TEMPERATURA</span>
                              <span className="text-xl font-bold font-mono">{(dDev.temp_camara || 25).toFixed(1)}°C</span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                              <span className="text-[10px] font-mono text-pink-400 block">PRESIÓN</span>
                              <span className="text-xl font-bold font-mono">{(dDev.presion || 0).toFixed(2)}b</span>
                            </div>
                          </div>

                          <div className="space-y-1 mb-3">
                            <div className="flex justify-between text-[10px] font-mono text-slate-400">
                              <span>Odómetro: {cCount}/{cLim} ciclos</span>
                              <span>{Math.round((cCount / cLim) * 100)}%</span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                              <div className="bg-emerald-400 h-full" style={{ width: `${Math.min(100, (cCount / cLim) * 100)}%` }}></div>
                            </div>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono text-cyan-400 font-bold">
                          <span>ENTRAR A CONTROL TOTAL</span>
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* SECCIÓN 2: CONTROL TOTAL DEL EQUIPO */}
          {activeSection === 'detalle' && inspectingDevice && (
            <DeviceDetailView
              device={inspectingDevice}
              onBack={() => { setActiveSection('flota'); setSelectedMac(null); }}
              sendCommand={sendDeviceCommand}
              operatorName={profile?.nombre || user?.email}
            />
          )}

          {/* SECCIÓN 3: GESTIÓN DE FLOTA (CRUD & PRUEBAS DE HARDWARE) */}
          {activeSection === 'gestion' && (
            <FleetManagementView
              fleet={fleet}
              sendCommand={sendDeviceCommand}
              onSelectDevice={(mac) => { setSelectedMac(mac); setActiveSection('detalle'); }}
            />
          )}

          {/* SECCIÓN 4: FOTA CLOUD HUB */}
          {activeSection === 'fota' && (
            <FotaHubView fleet={fleet} sendCommand={sendDeviceCommand} />
          )}

          {/* SECCIÓN 5: AUDITORÍA CLÍNICA */}
          {activeSection === 'auditoria' && (
            <ClinicalAuditView />
          )}

        </main>
      )}

      {/* BARRA INFERIOR PARA TELÉFONOS CELULARES (Mobile Bottom Bar) */}
      {user && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-slate-950/95 border-t border-cyan-500/30 backdrop-blur-xl flex items-center justify-around z-50 px-2">
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

      {/* Modal de Advertencia por Inactividad (15 Minutos) */}
      {showTimeoutModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="ultra-glass border-2 border-amber-500 p-6 rounded-2xl max-w-sm w-full text-center space-y-4 shadow-[0_0_30px_rgba(245,158,11,0.3)]">
            <div className="inline-flex p-3 rounded-full bg-amber-500/20 text-amber-300 animate-bounce">
              <Clock className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-white font-mono uppercase">Sesión por Expirar</h3>
            <p className="text-xs text-slate-300 leading-relaxed font-mono">
              Por protocolo de seguridad hospitalaria, tu turno se cerrará en <strong className="text-cyan-300 text-sm">{countdown}s</strong> debido a inactividad en la estación.
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

      {/* Modal de Personal & Aprobaciones */}
      <UserManagementModal 
        isOpen={showAdminModal} 
        onClose={() => setShowAdminModal(false)} 
      />
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
