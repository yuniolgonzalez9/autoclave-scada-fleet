import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginModal from './components/auth/LoginModal';
import UserManagementModal from './components/admin/UserManagementModal';
import SterilizationChart from './components/graphics/SterilizationChart';
import { useMqttFleet } from './hooks/useMqttFleet';
import { 
  Activity, 
  ShieldCheck, 
  LogOut, 
  User, 
  Waves, 
  Flame, 
  Thermometer, 
  Server, 
  QrCode, 
  BellRing, 
  Image as ImageIcon,
  Users,
  Bell,
  Play,
  Square,
  RotateCcw,
  Zap,
  Gauge,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Radio,
  FileText,
  Smartphone
} from 'lucide-react';

const WALLPAPERS = [
  { id: 'pcb-blue', name: '1. PCB Neón Azul', url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=2070&auto=format&fit=crop' },
  { id: 'server-datacenter', name: '2. Datacenter Hospitalario', url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=2068&auto=format&fit=crop' },
  { id: 'fiber-matrix', name: '3. Red Nodos & Fibra', url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop' },
  { id: 'blueprint-grid', name: '4. Blueprint Clínico', url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=2070&auto=format&fit=crop' },
  { id: 'cyber-hardware', name: '5. Hardware & Silicio', url: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=2070&auto=format&fit=crop' }
];

function ScadaAppContent() {
  const { user, profile, loading, pendingRequests, logout } = useAuth();
  const { fleet, mqttConnected, sendDeviceCommand } = useMqttFleet();

  const [opacity, setOpacity] = useState(82);
  const [currentBgIndex, setCurrentBgIndex] = useState(0);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [activeTabMobile, setActiveTabMobile] = useState('telemetria'); // 'telemetria' | 'reportes' | 'admin'

  const toggleWallpaper = () => setCurrentBgIndex((prev) => (prev + 1) % WALLPAPERS.length);
  const isAdmin = profile?.rol?.toLowerCase().includes('admin') || profile?.rol?.toLowerCase().includes('director');

  // Seleccionar el primer dispositivo real que esté transmitiendo, o un dispositivo base
  const deviceList = Object.keys(fleet);
  const activeMac = deviceList.length > 0 ? deviceList[0] : 'ESP32_DEMO_CEYE';
  const activeDevice = fleet[activeMac] || {
    mac: activeMac,
    lastSeen: Date.now(),
    datos: {
      temp_camara: 25.0,
      presion: 0.0,
      fase: 'ESPERA',
      seg_restantes: 120,
      motor: false,
      calentador: false,
      vacio: false,
      alarma_cod: 0,
      alarma_msg: 'SISTEMA NORMAL',
      cfg: { ciclos: 0, lim_mant: 200, sp_temp: 121.0, t_ciclo: 2 }
    },
    f0Score: 0.0,
    history: [{ time: '00:00', temperature: 25.0, pressure: 0.0 }]
  };

  const d = activeDevice.datos;
  const isOnline = Date.now() - (activeDevice.lastSeen || 0) < 15000;
  const ciclos = d?.cfg?.ciclos || 0;
  const limite = d?.cfg?.lim_mant || 200;
  const odometroPct = Math.min(100, Math.round((ciclos / limite) * 100));

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070913] flex flex-col items-center justify-center">
        <Activity className="w-8 h-8 text-cyan-400 animate-spin mb-3" />
        <p className="text-xs font-mono text-cyan-400">SINCRONIZANDO SESIÓN BIOMÉDICA CENTRAL...</p>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen text-slate-100 flex flex-col relative transition-all duration-700 bg-cover bg-center bg-fixed pb-20 md:pb-6"
      style={{
        backgroundImage: `linear-gradient(to bottom, rgba(7, 9, 19, 0.82), rgba(7, 9, 19, 0.94)), url('${WALLPAPERS[currentBgIndex].url}')`
      }}
    >
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

        {/* Indicador MQTT & Acciones */}
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
            >
              <Bell className="w-4 h-4" />
              {pendingRequests.length > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 text-[9px] font-bold">
                  {pendingRequests.length}
                </span>
              )}
            </button>
          )}

          <button
            onClick={toggleWallpaper}
            className="p-2 rounded-lg bg-slate-900 border border-cyan-500/30 text-cyan-300 text-xs font-mono"
            title="Cambiar fondo"
          >
            <ImageIcon className="w-4 h-4" />
          </button>

          {user ? (
            <button
              onClick={logout}
              className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      </header>

      {/* Si no está autenticado, Login */}
      {!user ? (
        <main className="flex-1 flex items-center justify-center p-4">
          <LoginModal />
        </main>
      ) : (
        /* CONSOLA SCADA: TELEMETRÍA DINÁMICA DEL ESP32 FÍSICO */
        <main className="flex-1 p-3 md:p-6 max-w-7xl mx-auto w-full flex flex-col gap-4 relative z-10">
          
          {/* Tarjeta del Equipo Activo (Detección de Hardware) */}
          <div 
            className="ultra-glass p-4 md:p-6 rounded-2xl border border-cyan-500/30 shadow-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
            style={{ '--glass-opacity': `${opacity / 100}` }}
          >
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-300">
                <Flame className="w-6 h-6 md:w-7 md:h-7" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base md:text-lg font-bold text-white tracking-wide">
                    AUTOCLAVE [{activeMac}]
                  </h2>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono border flex items-center gap-1 ${
                    isOnline 
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-ping' : 'bg-rose-400'}`}></span>
                    {isOnline ? 'TRANSMITIENDO EN VIVO' : 'SIN TRANSMISIÓN'}
                  </span>
                </div>
                <p className="text-xs text-slate-300 font-mono mt-0.5">
                  Firmware: {activeDevice.esquema?.fw || 'v3.5'} • Modelo: {activeDevice.esquema?.modelo || 'ESP32 Quirúrgico'}
                </p>
              </div>
            </div>

            {/* Botones de Control Remoto que envían comandos MQTT al ESP32 */}
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <button
                onClick={() => sendDeviceCommand(activeMac, { cmd: 'INICIAR_CICLO' })}
                className="flex-1 md:flex-none px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Iniciar Ciclo</span>
              </button>

              <button
                onClick={() => sendDeviceCommand(activeMac, { cmd: 'ABORTAR_CICLO' })}
                className="flex-1 md:flex-none px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg"
              >
                <Square className="w-4 h-4 fill-white" />
                <span>Paro Emergencia</span>
              </button>

              <button
                onClick={() => sendDeviceCommand(activeMac, { cmd: 'RESET_ALARMA' })}
                className="p-2.5 bg-slate-900 border border-slate-700 text-slate-300 rounded-xl text-xs"
                title="Reset Alarma"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tarjetas de Sensores en Vivo (Lectura real del ESP32) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            
            {/* Temperatura de Cámara */}
            <div className="ultra-glass p-3 md:p-4 rounded-xl border border-cyan-500/30">
              <div className="flex justify-between items-center text-[10px] md:text-xs font-mono text-cyan-400 mb-1">
                <span>TEMPERATURA</span>
                <Thermometer className="w-4 h-4" />
              </div>
              <div className="text-2xl md:text-3xl font-extrabold font-mono text-white">
                {(d?.temp_camara || 25.0).toFixed(1)} <span className="text-sm font-normal text-cyan-300">°C</span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono mt-1">Setpoint: {d?.cfg?.sp_temp || 121.0}°C</p>
            </div>

            {/* Presión de Vapor */}
            <div className="ultra-glass p-3 md:p-4 rounded-xl border border-pink-500/30">
              <div className="flex justify-between items-center text-[10px] md:text-xs font-mono text-pink-400 mb-1">
                <span>PRESIÓN</span>
                <Gauge className="w-4 h-4" />
              </div>
              <div className="text-2xl md:text-3xl font-extrabold font-mono text-white">
                {(d?.presion || 0.0).toFixed(2)} <span className="text-sm font-normal text-pink-300">bar</span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono mt-1">{((d?.presion || 0) * 14.504).toFixed(1)} PSI</p>
            </div>

            {/* Letalidad F0 Integrada */}
            <div className="ultra-glass p-3 md:p-4 rounded-xl border border-emerald-500/30">
              <div className="flex justify-between items-center text-[10px] md:text-xs font-mono text-emerald-400 mb-1">
                <span>LETALIDAD (F0)</span>
                <Zap className="w-4 h-4" />
              </div>
              <div className="text-2xl md:text-3xl font-extrabold font-mono text-emerald-300">
                {(activeDevice.f0Score || 0.0).toFixed(1)} <span className="text-sm font-normal text-emerald-400">min</span>
              </div>
              <p className="text-[10px] text-emerald-400/80 font-mono mt-1">
                {(activeDevice.f0Score || 0) >= 15.0 ? '✓ ESTÉRIL VÁLIDO' : 'Meta: ≥ 15 min'}
              </p>
            </div>

            {/* Fase y Odómetro */}
            <div className="ultra-glass p-3 md:p-4 rounded-xl border border-amber-500/30">
              <div className="flex justify-between items-center text-[10px] md:text-xs font-mono text-amber-400 mb-1">
                <span>FASE DE CICLO</span>
                <Activity className="w-4 h-4" />
              </div>
              <div className="text-lg md:text-xl font-bold font-mono text-white truncate">
                {d?.fase || 'ESPERA'}
              </div>
              <p className="text-[10px] text-slate-300 font-mono mt-1">
                Tiempo rest: {Math.floor((d?.seg_restantes || 0) / 60)}:{(d?.seg_restantes || 0) % 60}
              </p>
            </div>

          </div>

          {/* Gráfica en Tiempo Real + Relés y Actuadores Hardware (GPIOs 2, 4 y 5) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            
            {/* Curva Gráfica Chart.js */}
            <div className="lg:col-span-2 ultra-glass p-4 md:p-5 rounded-2xl border border-cyan-500/30 flex flex-col justify-between">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xs md:text-sm font-bold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  Curva Térmica en Vivo de la Cámara (ESP32)
                </h3>
                <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
                  T° vs P
                </span>
              </div>
              <SterilizationChart telemetryData={activeDevice.history || []} />
            </div>

            {/* Estado de Actuadores y Relés Hardware del ESP32 */}
            <div className="ultra-glass p-4 md:p-5 rounded-2xl border border-cyan-500/30 flex flex-col justify-between gap-4">
              <div>
                <h3 className="text-xs md:text-sm font-bold text-white flex items-center gap-2 mb-1">
                  <Server className="w-4 h-4 text-cyan-400" />
                  Actuadores y Relés Físicos
                </h3>
                <p className="text-[11px] text-slate-400 font-mono">
                  Salidas digitales activas en placa ESP32
                </p>
              </div>

              <div className="space-y-2">
                {/* Motor / LED 1 (GPIO 2) */}
                <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-mono text-white">Motor Agitador (GPIO 2)</p>
                    <p className="text-[10px] text-slate-400">LED 1</p>
                  </div>
                  <button
                    onClick={() => sendDeviceCommand(activeMac, { mot_ok: !d?.motor })}
                    className={`px-3 py-1 text-xs font-mono font-bold rounded-lg border transition-all ${
                      d?.motor 
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' 
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {d?.motor ? 'ENCENDIDO' : 'APAGADO'}
                  </button>
                </div>

                {/* Calentador (GPIO 4) */}
                <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-mono text-white">Calentador / Resistencias (GPIO 4)</p>
                    <p className="text-[10px] text-slate-400">LED 2</p>
                  </div>
                  <span className={`px-2.5 py-1 text-xs font-mono font-bold rounded-lg border ${
                    d?.calentador 
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' 
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                    {d?.calentador ? 'CALENTANDO' : 'APAGADO'}
                  </span>
                </div>

                {/* Bomba Vacío (GPIO 5) */}
                <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-mono text-white">Bomba de Vacío (GPIO 5)</p>
                    <p className="text-[10px] text-slate-400">LED 3</p>
                  </div>
                  <button
                    onClick={() => sendDeviceCommand(activeMac, { vacio_ok: !d?.vacio })}
                    className={`px-3 py-1 text-xs font-mono font-bold rounded-lg border transition-all ${
                      d?.vacio 
                        ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40' 
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {d?.vacio ? 'ACTIVA' : 'APAGADA'}
                  </button>
                </div>
              </div>

              {/* Odómetro de Vida Útil de Mantenimiento */}
              <div className="bg-slate-900/80 p-3 rounded-xl border border-white/5 space-y-1.5">
                <div className="flex justify-between text-[11px] font-mono text-slate-300">
                  <span>Odómetro de Ciclos:</span>
                  <span className="font-bold text-cyan-300">{ciclos} / {limite}</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
                  <div 
                    className={`h-full transition-all ${odometroPct > 90 ? 'bg-rose-500' : odometroPct > 75 ? 'bg-amber-500' : 'bg-emerald-400'}`}
                    style={{ width: `${odometroPct}%` }}
                  ></div>
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono pt-1">
                  <span>Vida Restante: {limite - ciclos} ciclos</span>
                  {isAdmin && (
                    <button
                      onClick={() => sendDeviceCommand(activeMac, { cmd: 'RESET_ODOMETRO' })}
                      className="text-amber-400 hover:underline"
                    >
                      Reset Odómetro
                    </button>
                  )}
                </div>
              </div>

            </div>

          </div>

        </main>
      )}

      {/* BARRA DE NAVEGACIÓN INFERIOR PARA TELÉFONOS MÓVILES (Estilo App Nativa) */}
      {user && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-slate-950/95 border-t border-cyan-500/30 backdrop-blur-xl flex items-center justify-around z-50 px-2">
          <button
            onClick={() => setActiveTabMobile('telemetria')}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-xs font-mono ${
              activeTabMobile === 'telemetria' ? 'text-cyan-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Activity className="w-5 h-5" />
            <span>Telemetría</span>
          </button>

          <button
            onClick={() => setActiveTabMobile('reportes')}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-xs font-mono ${
              activeTabMobile === 'reportes' ? 'text-cyan-400 font-bold' : 'text-slate-400'
            }`}
          >
            <FileText className="w-5 h-5" />
            <span>Reportes</span>
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

          <button
            onClick={toggleWallpaper}
            className="flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-xs font-mono text-slate-400"
          >
            <ImageIcon className="w-5 h-5" />
            <span>Fondos</span>
          </button>
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
