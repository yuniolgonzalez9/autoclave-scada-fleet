import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginModal from './components/auth/LoginModal';
import UserManagementModal from './components/admin/UserManagementModal';
import SterilizationChart from './components/graphics/SterilizationChart';
import { accumulateF0, evaluateCycleStatus } from './utils/f0Formulas';
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
  RotateCcw,
  Zap,
  Gauge,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

// 5 WALLPAPERS 4K DE ALTA DEFINICIÓN SELECCIONADOS
const WALLPAPERS = [
  {
    id: 'pcb-blue',
    name: '1. PCB Neón Azul (Oficial)',
    url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=2070&auto=format&fit=crop'
  },
  {
    id: 'server-datacenter',
    name: '2. Datacenter & Servidores',
    url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=2068&auto=format&fit=crop'
  },
  {
    id: 'fiber-matrix',
    name: '3. Red Nodos & Fibra Óptica',
    url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop'
  },
  {
    id: 'blueprint-grid',
    name: '4. Malla Técnica Láser',
    url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=2070&auto=format&fit=crop'
  },
  {
    id: 'cyber-hardware',
    name: '5. Silicio & Procesador',
    url: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=2070&auto=format&fit=crop'
  }
];

function ScadaAppContent() {
  const { user, profile, loading, pendingRequests, logout } = useAuth();
  const [opacity, setOpacity] = useState(82);
  const [currentBgIndex, setCurrentBgIndex] = useState(0);
  const [showAdminModal, setShowAdminModal] = useState(false);

  // ESTADO DE TELEMETRÍA DEL PRIMER DISPOSITIVO (AUTOCLAVE CEYE-01)
  const [isSimulating, setIsSimulating] = useState(false);
  const [cyclePhase, setCyclePhase] = useState('ESPERA'); // ESPERA, PREVACIO, CALENTANDO, ESTERILIZACION, SECADO, TERMINADO
  const [temp, setTemp] = useState(24.5);
  const [pressure, setPressure] = useState(0.02);
  const [f0Score, setF0Score] = useState(0.0);
  const [selectedProgram, setSelectedProgram] = useState('134_QUIRURGICO');
  const [chartHistory, setChartHistory] = useState([
    { time: '00:00', temperature: 24.5, pressure: 0.02 }
  ]);

  // Válvulas y Actuadores
  const [valves, setValves] = useState({
    steamInlet: false,
    exhaustVent: false,
    vacuumPump: false,
    heaters: false
  });

  const toggleWallpaper = () => {
    setCurrentBgIndex((prev) => (prev + 1) % WALLPAPERS.length);
  };

  const isAdmin = profile?.rol?.toLowerCase().includes('director') || profile?.rol?.toLowerCase().includes('admin');

  // MOTOR DE SIMULACIÓN CLÍNICA EN TIEMPO REAL
  useEffect(() => {
    let interval = null;

    if (isSimulating) {
      interval = setInterval(() => {
        setTemp((prevT) => {
          let targetT = 25.0;
          let targetP = 0.02;

          if (cyclePhase === 'PREVACIO') {
            targetT = 65.0;
            targetP = 0.3;
            setValves({ steamInlet: false, exhaustVent: false, vacuumPump: true, heaters: false });
          } else if (cyclePhase === 'CALENTANDO') {
            targetT = selectedProgram === '134_QUIRURGICO' ? 134.5 : 121.5;
            targetP = selectedProgram === '134_QUIRURGICO' ? 2.15 : 1.15;
            setValves({ steamInlet: true, exhaustVent: false, vacuumPump: false, heaters: true });
          } else if (cyclePhase === 'ESTERILIZACION') {
            targetT = selectedProgram === '134_QUIRURGICO' ? 134.8 : 121.3;
            targetP = selectedProgram === '134_QUIRURGICO' ? 2.18 : 1.18;
            setValves({ steamInlet: true, exhaustVent: false, vacuumPump: false, heaters: true });
          } else if (cyclePhase === 'SECADO') {
            targetT = 85.0;
            targetP = 0.15;
            setValves({ steamInlet: false, exhaustVent: true, vacuumPump: true, heaters: false });
          } else if (cyclePhase === 'TERMINADO') {
            targetT = 35.0;
            targetP = 0.02;
            setValves({ steamInlet: false, exhaustVent: false, vacuumPump: false, heaters: false });
          }

          // Variación térmica suave y realista
          const newT = Number((prevT + (targetT - prevT) * 0.15 + (Math.random() * 0.4 - 0.2)).toFixed(1));
          
          setPressure((prevP) => {
            const newP = Number((prevP + (targetP - prevP) * 0.15 + (Math.random() * 0.02 - 0.01)).toFixed(2));
            return Math.max(0, newP);
          });

          // Integración matemática de F0 en tiempo real
          setF0Score((prevF0) => accumulateF0(prevF0, newT, 1));

          // Actualizar historial de gráfica
          const nowStr = new Date().toTimeString().slice(3, 8);
          setChartHistory((prev) => {
            const next = [...prev, { time: nowStr, temperature: newT, pressure: Math.max(0, targetP) }];
            if (next.length > 25) next.shift();
            return next;
          });

          return newT;
        });
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [isSimulating, cyclePhase, selectedProgram]);

  // Manejador de Fases del Ciclo
  const startCycle = () => {
    setF0Score(0.0);
    setCyclePhase('CALENTANDO');
    setIsSimulating(true);
    // Transición automática a esterilización tras 6 segundos de calentamiento simulado
    setTimeout(() => setCyclePhase('ESTERILIZACION'), 7000);
  };

  const stopCycle = () => {
    setCyclePhase('SECADO');
    setTimeout(() => {
      setCyclePhase('ESPERA');
      setIsSimulating(false);
    }, 5000);
  };

  const resetCycle = () => {
    setIsSimulating(false);
    setCyclePhase('ESPERA');
    setTemp(24.5);
    setPressure(0.02);
    setF0Score(0.0);
    setChartHistory([{ time: '00:00', temperature: 24.5, pressure: 0.02 }]);
    setValves({ steamInlet: false, exhaustVent: false, vacuumPump: false, heaters: false });
  };

  const cycleEvaluation = evaluateCycleStatus(f0Score, temp, pressure, cyclePhase);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070913] flex flex-col items-center justify-center">
        <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 animate-pulse mb-3">
          <Activity className="w-8 h-8 animate-spin" />
        </div>
        <p className="text-xs font-mono text-cyan-400 tracking-wider">
          SINCRONIZANDO SESIÓN BIOMÉDICA CENTRAL...
        </p>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen text-slate-100 flex flex-col relative transition-all duration-700 bg-cover bg-center bg-fixed"
      style={{
        backgroundImage: `linear-gradient(to bottom, rgba(7, 9, 19, 0.80), rgba(7, 9, 19, 0.92)), url('${WALLPAPERS[currentBgIndex].url}')`
      }}
    >
      {/* Header Institucional con rayita láser Speedtest */}
      <header className="speedtest-laser-header border-b border-cyan-500/20 bg-slate-950/80 backdrop-blur-md px-6 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3.5">
          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-[0_0_12px_rgba(0,243,255,0.2)]">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base md:text-lg font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-emerald-400">
                BIOFLEET OS™
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
                v2.0 ENTERPRISE
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono tracking-tight">
              Supervisión de Flota Biomédica & Validación Térmica F0
            </p>
          </div>
        </div>

        {/* Acciones y estado del usuario */}
        <div className="flex items-center gap-3">
          {user && isAdmin && (
            <button
              onClick={() => setShowAdminModal(true)}
              className="relative p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-amber-500/40 text-amber-300 transition-all flex items-center gap-1.5"
              title="Solicitudes Pendientes"
            >
              <Bell className="w-4 h-4 animate-bounce" />
              {pendingRequests.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold">
                  {pendingRequests.length}
                </span>
              )}
            </button>
          )}

          {/* Selector de los 5 Wallpapers */}
          <button
            onClick={toggleWallpaper}
            title="Cambiar fondo 4K"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-cyan-500/30 text-cyan-300 text-xs font-mono transition-all"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{WALLPAPERS[currentBgIndex].name}</span>
          </button>

          {user ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2.5 bg-slate-900/85 px-3 py-1.5 rounded-lg border border-slate-700/80">
                <User className="w-4 h-4 text-cyan-400" />
                <div className="text-left">
                  <p className="text-xs font-semibold text-white leading-tight">{profile?.nombre || profile?.usuario}</p>
                  <p className="text-[10px] text-emerald-400 font-mono leading-none">
                    {profile?.rol || 'Personal Autorizado'}
                  </p>
                </div>
              </div>
              <button
                onClick={logout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-medium transition-all"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Salir</span>
              </button>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              <ShieldCheck className="w-3.5 h-3.5" />
              Acceso Autorizado Requerido
            </span>
          )}
        </div>
      </header>

      {/* Si no está autenticado, muestra el Login */}
      {!user ? (
        <main className="flex-1 flex items-center justify-center p-6 relative z-10">
          <LoginModal />
        </main>
      ) : (
        /* CONSOLA SCADA: PRIMER DISPOSITIVO EN VIVO */
        <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full flex flex-col gap-5 relative z-10">
          
          {/* Barra Superior del Dispositivo Activo */}
          <div 
            className="ultra-glass p-5 rounded-2xl shadow-2xl border border-cyan-500/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
            style={{ '--glass-opacity': `${opacity / 100}` }}
          >
            <div className="flex items-center gap-3.5">
              <div className="p-3 rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-300">
                <Flame className="w-7 h-7" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white tracking-wide">
                    AUTOCLAVE QUIRÚRGICO MATRIZ [CEYE-01]
                  </h2>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                    EN LÍNEA
                  </span>
                </div>
                <p className="text-xs text-slate-300 font-mono mt-0.5">
                  Ubicación: Quirófano Central / RUMED • Protocolo Vapor Saturado ISO 17665
                </p>
              </div>
            </div>

            {/* Selector de Programa y Controles */}
            <div className="flex flex-wrap items-center gap-2.5">
              <select
                value={selectedProgram}
                disabled={isSimulating}
                onChange={(e) => setSelectedProgram(e.target.value)}
                className="bg-slate-900 border border-cyan-500/40 text-cyan-300 text-xs font-mono rounded-lg px-3 py-2 focus:outline-none"
              >
                <option value="134_QUIRURGICO">134°C Instrumental (3.5 min / F0≥30)</option>
                <option value="121_GOMAS">121°C Gomas y Plásticos (15 min / F0≥15)</option>
              </select>

              {!isSimulating ? (
                <button
                  onClick={startCycle}
                  className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold rounded-lg text-xs shadow-lg shadow-cyan-500/20 flex items-center gap-1.5"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Iniciar Ciclo</span>
                </button>
              ) : (
                <button
                  onClick={stopCycle}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs shadow-lg shadow-rose-600/20 flex items-center gap-1.5"
                >
                  <span>Abortar Ciclo</span>
                </button>
              )}

              <button
                onClick={resetCycle}
                className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-xs"
                title="Reiniciar Sensores"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tarjetas de Telemetría Numérica y Letalidad F0 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            
            {/* Temperatura */}
            <div className="ultra-glass p-4 rounded-xl border border-cyan-500/30">
              <div className="flex justify-between items-center text-xs font-mono text-cyan-400 mb-1">
                <span>TEMPERATURA CÁMARA</span>
                <Thermometer className="w-4 h-4" />
              </div>
              <div className="text-3xl font-extrabold font-mono text-white">
                {temp.toFixed(1)} <span className="text-sm font-normal text-cyan-300">°C</span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono mt-1">Set Point: {selectedProgram === '134_QUIRURGICO' ? '134.0 °C' : '121.0 °C'}</p>
            </div>

            {/* Presión */}
            <div className="ultra-glass p-4 rounded-xl border border-pink-500/30">
              <div className="flex justify-between items-center text-xs font-mono text-pink-400 mb-1">
                <span>PRESIÓN VAPOR</span>
                <Gauge className="w-4 h-4" />
              </div>
              <div className="text-3xl font-extrabold font-mono text-white">
                {pressure.toFixed(2)} <span className="text-sm font-normal text-pink-300">bar</span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono mt-1">Equivalente: {(pressure * 14.504).toFixed(1)} PSI</p>
            </div>

            {/* Letalidad F0 */}
            <div className="ultra-glass p-4 rounded-xl border border-emerald-500/30">
              <div className="flex justify-between items-center text-xs font-mono text-emerald-400 mb-1">
                <span>LETALIDAD TÉRMICA (F0)</span>
                <Zap className="w-4 h-4" />
              </div>
              <div className="text-3xl font-extrabold font-mono text-emerald-300">
                {f0Score.toFixed(1)} <span className="text-sm font-normal text-emerald-400">min</span>
              </div>
              <p className="text-[10px] text-emerald-400/80 font-mono mt-1">
                {f0Score >= 15.0 ? '✓ ESTERILIDAD LOGRADA' : 'F0 Objetivo: ≥ 15.0 min'}
              </p>
            </div>

            {/* Estado del Ciclo */}
            <div className="ultra-glass p-4 rounded-xl border border-amber-500/30">
              <div className="flex justify-between items-center text-xs font-mono text-amber-400 mb-1">
                <span>FASE DEL PROCESO</span>
                <Activity className="w-4 h-4" />
              </div>
              <div className="text-xl font-bold font-mono text-white tracking-wider uppercase mt-1">
                {cyclePhase}
              </div>
              <p className="text-[10px] text-slate-300 font-mono mt-1 truncate">
                {cycleEvaluation.label}
              </p>
            </div>

          </div>

          {/* Gráfica en Tiempo Real y Estado de Válvulas */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            
            {/* Gráfica Chart.js (2 Columnas) */}
            <div 
              className="lg:col-span-2 ultra-glass p-5 rounded-2xl border border-cyan-500/30 flex flex-col justify-between"
              style={{ '--glass-opacity': `${opacity / 100}` }}
            >
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  Curvas Termodinámicas de Esterilización en Tiempo Real
                </h3>
                <span className="text-[10px] font-mono text-cyan-400 px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30">
                  Escala Dual T° vs P
                </span>
              </div>

              <SterilizationChart telemetryData={chartHistory} />
            </div>

            {/* Actuadores y Válvulas Digitales (1 Columna) */}
            <div 
              className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 flex flex-col justify-between gap-4"
              style={{ '--glass-opacity': `${opacity / 100}` }}
            >
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-1">
                  <Server className="w-4 h-4 text-cyan-400" />
                  Estado de Válvulas & Actuadores
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  Telemetría digital de hardware del autoclave
                </p>
              </div>

              <div className="space-y-2.5">
                <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-300">Válvula Entrada Vapor (EV-1)</span>
                  <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded ${valves.steamInlet ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-slate-800 text-slate-500'}`}>
                    {valves.steamInlet ? 'ABIERTA' : 'CERRADA'}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-300">Válvula Purga y Escape (EV-2)</span>
                  <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded ${valves.exhaustVent ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-slate-800 text-slate-500'}`}>
                    {valves.exhaustVent ? 'ABIERTA' : 'CERRADA'}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-300">Bomba de Pre-Vacío (P-01)</span>
                  <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded ${valves.vacuumPump ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40' : 'bg-slate-800 text-slate-500'}`}>
                    {valves.vacuumPump ? 'ACTIVA' : 'STANDBY'}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-300">Resistencias Calefactoras (R-1)</span>
                  <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded ${valves.heaters ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-slate-800 text-slate-500'}`}>
                    {valves.heaters ? 'CALENTANDO' : 'APAGADAS'}
                  </span>
                </div>
              </div>

              {/* Slider de Opacidad Ultra-Glass */}
              <div className="bg-slate-900/80 p-3 rounded-xl border border-white/5 space-y-1.5">
                <div className="flex justify-between text-[11px] font-mono text-cyan-300">
                  <span className="flex items-center gap-1"><Waves className="w-3 h-3" /> Transparencia Ultra-Glass:</span>
                  <span className="font-bold">{opacity}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={opacity} 
                  onChange={(e) => setOpacity(e.target.value)} 
                  className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
              </div>

            </div>

          </div>

        </main>
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
