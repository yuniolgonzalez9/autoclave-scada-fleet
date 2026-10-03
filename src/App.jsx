import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginModal from './components/auth/LoginModal';
import UserManagementModal from './components/admin/UserManagementModal';
import DeviceDetailView from './components/dashboard/DeviceDetailView';
import ClinicalAuditView from './components/reports/ClinicalAuditView';
import FotaHubView from './components/fota/FotaHubView';
import GearMenu, { WALLPAPERS_LIST } from './components/common/GearMenu';
import { useMqttFleet } from './hooks/useMqttFleet';
import { startIndustrialSiren, stopIndustrialSiren } from './services/audioAlarm';
import { 
  Activity, 
  Flame, 
  FileText, 
  Rocket, 
  ChevronRight, 
  Volume2, 
  VolumeX,
  Bell,
  Users
} from 'lucide-react';

function ScadaAppContent() {
  const { user, profile, loading, pendingRequests, logout } = useAuth();
  const { fleet, mqttConnected, sendDeviceCommand } = useMqttFleet();

  // Estados visuales del Menú Engranaje con persistencia en memoria
  const [currentTheme, setCurrentTheme] = useState(() => localStorage.getItem('scada_theme') || 'tactical');
  const [currentBg, setCurrentBg] = useState(() => localStorage.getItem('scada_bg') || 'circuit-pcb');
  const [opacity, setOpacity] = useState(() => Number(localStorage.getItem('scada_transparency')) || 82);

  // Navegación
  const [activeSection, setActiveSection] = useState('flota'); // 'flota' | 'fota' | 'auditoria' | 'detalle'
  const [selectedMac, setSelectedMac] = useState(null);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [sirenActive, setSirenActive] = useState(false);

  const isAdmin = profile?.rol?.toLowerCase().includes('admin') || profile?.rol?.toLowerCase().includes('director');

  // 1. INYECCIÓN ACTIVA DEL TEMA EN TIEMPO REAL
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('scada_theme', currentTheme);
  }, [currentTheme]);

  // 2. INYECCIÓN ACTIVA DE LA TRANSPARENCIA ULTRA-GLASS EN TIEMPO REAL (0% A 100%)
  useEffect(() => {
    const alpha = (opacity / 100).toFixed(2);
    document.documentElement.style.setProperty('--glass-opacity', alpha);
    localStorage.setItem('scada_transparency', opacity);
  }, [opacity]);

  // 3. PERSISTENCIA DEL FONDO SELECCIONADO
  useEffect(() => {
    localStorage.setItem('scada_bg', currentBg);
  }, [currentBg]);

  // 4. VIGILANTE DE ALARMAS CRÍTICAS (SIRENA INDUSTRIAL)
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

  // Obtener Fondo Fotográfico o Estilo Especial
  const bgObj = WALLPAPERS_LIST.find((b) => b.id === currentBg) || WALLPAPERS_LIST[0];
  
  const getBackgroundStyle = () => {
    if (currentTheme === 'clinical' && currentBg === 'clean') {
      return {
        backgroundColor: '#f0f4f9',
        backgroundImage: 'linear-gradient(to right, rgba(2, 132, 199, 0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(2, 132, 199, 0.08) 1px, transparent 1px)',
        backgroundSize: '24px 24px'
      };
    }
    if (currentBg === 'oled') {
      return {
        backgroundColor: '#000000',
        backgroundImage: 'radial-gradient(circle at 50% -5%, rgba(139, 92, 246, 0.22) 0%, transparent 55%), radial-gradient(circle at 100% 100%, rgba(0, 243, 255, 0.15) 0%, transparent 50%)'
      };
    }
    if (bgObj.url) {
      return {
        backgroundImage: `linear-gradient(to bottom, rgba(7, 9, 19, 0.80), rgba(7, 9, 19, 0.94)), url('${bgObj.url}')`
      };
    }
    return { backgroundColor: '#030712' };
  };

  const macKeys = Object.keys(fleet);
  const defaultDevice = {
    mac: 'ESP32_CEYE_01',
    lastSeen: Date.now(),
    meta: { alias: 'Autoclave Quirófano Matriz', cliente: 'Hospital Central', modelo: 'DevKit Clase B' },
    datos: { temp_camara: 25.0, presion: 0.0, fase: 'ESPERA', seg_restantes: 120, cfg: { ciclos: 14, lim_mant: 200 } },
    f0Score: 0.0,
    history: []
  };

  const devicesToRender = macKeys.length > 0 ? macKeys.map((k) => fleet[k]) : [defaultDevice];
  const inspectingDevice = selectedMac ? (fleet[selectedMac] || defaultDevice) : defaultDevice;

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
      style={getBackgroundStyle()}
    >
      {/* Banner de Emergencia con Botón para Silenciar Sirena */}
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

          {/* Menú Engranaje */}
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

      {/* Dock Superior en PC para alternar Secciones */}
      {user && (
        <div className="hidden md:flex items-center gap-2 px-6 py-2 bg-slate-950/60 border-b border-cyan-500/10">
          <button
            onClick={() => { setActiveSection('flota'); setSelectedMac(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
              activeSection === 'flota' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            ⚡ Flota de Autoclaves ({devicesToRender.length})
          </button>
          <button
            onClick={() => { setActiveSection('fota'); setSelectedMac(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
              activeSection === 'fota' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            🚀 FOTA Cloud Hub
          </button>
          <button
            onClick={() => { setActiveSection('auditoria'); setSelectedMac(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
              activeSection === 'auditoria' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            📋 Auditoría & Paquetes Supabase
          </button>
        </div>
      )}

      {/* Contenido Dinámico */}
      {!user ? (
        <main className="flex-1 flex items-center justify-center p-4">
          <LoginModal />
        </main>
      ) : (
        <main className="flex-1 p-3 md:p-6 max-w-7xl mx-auto w-full flex flex-col gap-4">
          
          {/* SECCIÓN 1: FLOTA COMPLETA */}
          {activeSection === 'flota' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-base md:text-lg font-bold font-mono flex items-center gap-2">
                  <Flame className="w-5 h-5 text-cyan-400" />
                  Flota de Autoclaves Conectados ({devicesToRender.length})
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {devicesToRender.map((dev) => {
                  const dDev = dev.datos || {};
                  const isDevOnline = Date.now() - (dev.lastSeen || 0) < 18000;
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
                            isDevOnline ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                          }`}>
                            {isDevOnline ? 'ONLINE' : 'OFFLINE'}
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
                })}
              </div>
            </div>
          )}

          {/* SECCIÓN 2: CONTROL TOTAL DEL EQUIPO */}
          {activeSection === 'detalle' && (
            <DeviceDetailView
              device={inspectingDevice}
              onBack={() => { setActiveSection('flota'); setSelectedMac(null); }}
              sendCommand={sendDeviceCommand}
              operatorName={profile?.nombre || user?.email}
            />
          )}

          {/* SECCIÓN 3: FOTA CLOUD HUB */}
          {activeSection === 'fota' && (
            <FotaHubView fleet={fleet} sendCommand={sendDeviceCommand} />
          )}

          {/* SECCIÓN 4: AUDITORÍA CLÍNICA DE SUPABASE */}
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
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-xs font-mono ${
              activeSection === 'flota' || activeSection === 'detalle' ? 'text-cyan-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Activity className="w-5 h-5" />
            <span>Flota</span>
          </button>

          <button
            onClick={() => { setActiveSection('fota'); setSelectedMac(null); }}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-xs font-mono ${
              activeSection === 'fota' ? 'text-cyan-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Rocket className="w-5 h-5" />
            <span>FOTA</span>
          </button>

          <button
            onClick={() => { setActiveSection('auditoria'); setSelectedMac(null); }}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-xs font-mono ${
              activeSection === 'auditoria' ? 'text-cyan-400 font-bold' : 'text-slate-400'
            }`}
          >
            <FileText className="w-5 h-5" />
            <span>Auditoría</span>
          </button>

          {isAdmin && (
            <button
              onClick={() => setShowAdminModal(true)}
              className="flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-xs font-mono text-amber-300"
            >
              <Users className="w-5 h-5" />
              <span>Personal</span>
            </button>
          )}
        </nav>
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
