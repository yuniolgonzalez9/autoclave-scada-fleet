import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginModal from './components/auth/LoginModal';
import { 
  Activity, 
  ShieldCheck, 
  LogOut, 
  User, 
  Waves, 
  Cpu, 
  Layers, 
  Flame, 
  Thermometer, 
  Server,
  QrCode,
  BellRing
} from 'lucide-react';

function ScadaAppContent() {
  const { user, profile, loading, logout } = useAuth();
  const [opacity, setOpacity] = useState(85);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a14] flex flex-col items-center justify-center">
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
    <div className="min-h-screen bg-[#0a0a14] text-slate-100 flex flex-col">
      {/* Header Institucional con rayita láser Speedtest */}
      <header className="speedtest-laser-header border-b border-cyan-500/20 bg-slate-950/80 backdrop-blur-md px-6 py-3.5 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3.5">
          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
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
              Plataforma Centralizada de Telemetría Biomédica & Trazabilidad
            </p>
          </div>
        </div>

        {/* Estado del Usuario autenticado */}
        {user ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-700/80">
              <User className="w-4 h-4 text-cyan-400" />
              <div className="text-left">
                <p className="text-xs font-semibold text-white leading-tight">{profile?.nombre || user.email}</p>
                <p className="text-[10px] text-emerald-400 font-mono leading-none">
                  {profile?.rol || 'Ingeniero Biomédico'}
                </p>
              </div>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-medium transition-all"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            <ShieldCheck className="w-3.5 h-3.5" />
            Acceso Autorizado Requerido
          </span>
        )}
      </header>

      {/* Si no está autenticado, muestra el Login Institucional */}
      {!user ? (
        <main className="flex-1 flex items-center justify-center p-6">
          <LoginModal />
        </main>
      ) : (
        /* Panel del Sistema cuando ya inició sesión */
        <main className="flex-1 p-6 max-w-6xl mx-auto w-full flex flex-col gap-6">
          
          {/* Bienvenida y resumen de activos */}
          <div 
            className="ultra-glass p-6 rounded-2xl shadow-2xl border border-cyan-500/30 transition-all duration-300"
            style={{ '--glass-opacity': `${opacity / 100}` }}
          >
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Server className="w-5 h-5 text-cyan-400" />
                  Consola de Supervisión & Telemetría Multidispositivo
                </h2>
                <p className="text-xs text-slate-400 font-mono mt-1">
                  Monitoreo de equipos críticos, validación térmica y control de procesos en tiempo real.
                </p>
              </div>

              {/* Slider de Opacidad Ultra-Glass */}
              <div className="bg-slate-900/70 px-4 py-2 rounded-xl border border-white/10 flex items-center gap-3">
                <span className="text-xs font-mono text-cyan-300 flex items-center gap-1.5 whitespace-nowrap">
                  <Waves className="w-3.5 h-3.5" /> Ultra-Glass: <strong>{opacity}%</strong>
                </span>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={opacity} 
                  onChange={(e) => setOpacity(e.target.value)} 
                  className="w-24 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
              </div>
            </div>

            {/* Clasificación de familias de dispositivos preparados */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-cyan-950/20 border border-cyan-500/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-cyan-300">Esterilización a Vapor</span>
                  <Flame className="w-4 h-4 text-cyan-400" />
                </div>
                <p className="text-2xl font-bold text-white font-mono">Flota Activa</p>
                <p className="text-[11px] text-cyan-400/80 font-mono mt-1">Algoritmo Letalidad F0</p>
              </div>

              <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-purple-300">Termodesinfección</span>
                  <Thermometer className="w-4 h-4 text-purple-400" />
                </div>
                <p className="text-2xl font-bold text-white font-mono">Integrable</p>
                <p className="text-[11px] text-purple-400/80 font-mono mt-1">Lavadoras & Cámaras</p>
              </div>

              <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-emerald-300">Trazabilidad QR</span>
                  <QrCode className="w-4 h-4 text-emerald-400" />
                </div>
                <p className="text-2xl font-bold text-white font-mono">Instrumental</p>
                <p className="text-[11px] text-emerald-400/80 font-mono mt-1">Etiquetado Hospitalario</p>
              </div>

              <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-amber-300">Alertas Telegram</span>
                  <BellRing className="w-4 h-4 text-amber-400" />
                </div>
                <p className="text-2xl font-bold text-white font-mono">Broker MQTT</p>
                <p className="text-[11px] text-amber-400/80 font-mono mt-1">Notificación Inmediata</p>
              </div>
            </div>
          </div>

        </main>
      )}
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
