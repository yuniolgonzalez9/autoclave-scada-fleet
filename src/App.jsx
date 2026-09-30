import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginModal from './components/auth/LoginModal';
import { Activity, ShieldCheck, LogOut, User, Cpu, Waves } from 'lucide-react';

function ScadaAppContent() {
  const { user, profile, loading, logout } = useAuth();
  const [opacity, setOpacity] = useState(85);

  // Si está verificando sesión en milisegundos, pantalla de carga limpia (CERO PARPADEO)
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a14] flex flex-col items-center justify-center">
        <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 animate-pulse mb-3">
          <Activity className="w-8 h-8 animate-spin" />
        </div>
        <p className="text-xs font-mono text-cyan-400">SINCRONIZANDO SESIÓN BIOMÉDICA...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a14] text-slate-100 flex flex-col">
      {/* Header con rayita láser Speedtest */}
      <header className="speedtest-laser-header border-b border-cyan-500/20 bg-slate-950/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-emerald-400">
              SCADA BIOMÉDICO FLEET v2.0
            </h1>
            <p className="text-xs text-slate-400 font-mono">ENTERPRISE CORE • SUPABASE AUTH</p>
          </div>
        </div>

        {/* Estado del Usuario autenticado */}
        {user ? (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-700">
              <User className="w-4 h-4 text-cyan-400" />
              <div className="text-left">
                <p className="text-xs font-semibold text-white leading-tight">{profile?.nombre || user.email}</p>
                <p className="text-[10px] text-cyan-400 font-mono leading-none">{profile?.rol || 'Operador'}</p>
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
            Acceso Requerido
          </span>
        )}
      </header>

      {/* Si no está autenticado, muestra el Login Ultra-Glass */}
      {!user ? (
        <main className="flex-1 flex items-center justify-center p-6">
          <LoginModal />
        </main>
      ) : (
        /* Panel del SCADA cuando ya inició sesión */
        <main className="flex-1 p-6 max-w-5xl mx-auto w-full flex flex-col items-center justify-center gap-6">
          <div 
            className="ultra-glass p-8 rounded-2xl shadow-2xl max-w-xl w-full border border-emerald-500/30 transition-all duration-300"
            style={{ '--glass-opacity': `${opacity / 100}` }}
          >
            <div className="flex items-center gap-3 mb-4 text-emerald-400">
              <ShieldCheck className="w-8 h-8" />
              <div>
                <h2 className="text-xl font-bold text-white">Sesión Biomédica Autenticada</h2>
                <p className="text-xs text-emerald-300 font-mono">Persistencia activa con Supabase Cloud</p>
              </div>
            </div>
            
            <p className="text-slate-300 text-sm leading-relaxed mb-6">
              Has ingresado como <strong className="text-cyan-400">{user.email}</strong>. La sesión permanecerá activa incluso si refrescas la pestaña, eliminando el parpadeo de carga por completo.
            </p>

            <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-2">
              <div className="flex justify-between text-xs font-mono text-cyan-300">
                <span className="flex items-center gap-1"><Waves className="w-3.5 h-3.5" /> Opacidad Ultra-Glass:</span>
                <span className="font-bold">{opacity}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={opacity} 
                onChange={(e) => setOpacity(e.target.value)} 
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
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
