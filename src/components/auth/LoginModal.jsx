import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  ShieldCheck, 
  Mail, 
  Lock, 
  AlertCircle, 
  Loader2, 
  KeyRound, 
  Building2, 
  Sparkles,
  Users
} from 'lucide-react';

export default function LoginModal() {
  const { login, loginWithOAuth, loginQuickAccess } = useAuth();
  
  // Pestaña activa: 'staff' (Correo/Contraseña) o 'corporate' (Google/GitHub/Director)
  const [activeTab, setActiveTab] = useState('staff');
  
  // Estados para credenciales de personal
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState(null);

  // Iniciar sesión con correo y contraseña institucional
  const handleStaffLogin = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);
    try {
      if (typeof login === 'function') {
        await login(email, password);
      } else {
        throw new Error('Función de autenticación institucional no disponible');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Credencial de personal no válida o cuenta inactiva.');
    } finally {
      setSubmitting(false);
    }
  };

  // Iniciar sesión con OAuth (Google/GitHub)
  const handleOAuth = async (provider) => {
    setErrorMsg('');
    setLoadingProvider(provider);
    try {
      await loginWithOAuth(provider);
    } catch (err) {
      setErrorMsg(`Error al conectar con ${provider}: ` + (err.message || 'Revisa Supabase'));
      setLoadingProvider(null);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[75vh] px-4 w-full">
      <div className="ultra-glass p-8 md:p-10 rounded-2xl shadow-2xl max-w-md w-full border border-cyan-500/40 relative backdrop-blur-xl">
        
        {/* Cabecera */}
        <div className="text-center mb-6">
          <div className="inline-flex p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 mb-3 shadow-[0_0_20px_rgba(0,243,255,0.25)]">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-wide uppercase">
            Plataforma Central de Telemetría
          </h2>
          <p className="text-xs text-cyan-300/80 mt-1 font-mono">
            Control de Activos Biomédicos & Supervisión Clínica
          </p>
        </div>

        {/* Selector de Pestañas de Acceso */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950/60 rounded-xl border border-slate-800 mb-6">
          <button
            type="button"
            onClick={() => { setActiveTab('staff'); setErrorMsg(''); }}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'staff'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Personal & Operadores</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('corporate'); setErrorMsg(''); }}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'corporate'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Dirección & SSO</span>
          </button>
        </div>

        {/* Mensaje de Alerta */}
        {errorMsg && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* PESTAÑA 1: Login de Personal Jerárquico (Correo + Contraseña) */}
        {activeTab === 'staff' && (
          <form onSubmit={handleStaffLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1.5 flex justify-between">
                <span>ID de Operador / Correo Institucional</span>
                <span className="text-[10px] text-cyan-400">Jerarquía RBAC</span>
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operador@hospital.com"
                  className="w-full pl-9 pr-3 py-2 bg-slate-900/80 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1.5 flex justify-between">
                <span>Firma Digital / Clave de Acceso</span>
                <span className="text-[10px] text-cyan-400">Encriptada</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-3 py-2 bg-slate-900/80 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold rounded-lg text-sm shadow-lg shadow-cyan-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-1"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Validando Jerarquía...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>Ingresar a Turno Operativo</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* PESTAÑA 2: Acceso Corporativo (Google, GitHub, Director Rápido) */}
        {activeTab === 'corporate' && (
          <div className="space-y-3">
            <button
              onClick={() => handleOAuth('google')}
              disabled={loadingProvider !== null}
              className="w-full py-2.5 px-4 bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 hover:border-cyan-400/50 text-white font-medium rounded-xl text-sm shadow-md transition-all flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {loadingProvider === 'google' ? (
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
              )}
              <span>Ingresar con Google Workspace</span>
            </button>

            <button
              onClick={() => handleOAuth('github')}
              disabled={loadingProvider !== null}
              className="w-full py-2.5 px-4 bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 hover:border-fuchsia-400/50 text-white font-medium rounded-xl text-sm shadow-md transition-all flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {loadingProvider === 'github' ? (
                <Loader2 className="w-4 h-4 animate-spin text-fuchsia-400" />
              ) : (
                <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                </svg>
              )}
              <span>Ingresar con GitHub Dev</span>
            </button>

            <div className="relative py-2 flex items-center justify-center">
              <div className="border-t border-slate-700/80 w-full"></div>
              <span className="bg-slate-950 px-2 text-[10px] font-mono text-slate-400 absolute">MODO SUPERVISOR</span>
            </div>

            <button
              type="button"
              onClick={loginQuickAccess}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-cyan-500 via-blue-600 to-emerald-500 hover:opacity-90 text-white font-semibold rounded-xl text-sm shadow-lg shadow-cyan-500/25 transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Acceso Maestro (Director Biomédico)</span>
            </button>
          </div>
        )}

        {/* Pie de Módulos */}
        <div className="mt-6 pt-4 border-t border-slate-800/80 text-center">
          <p className="text-[11px] text-slate-400 font-mono">
            Control de Acceso Basado en Roles (ISO 13485 / FDA 21 CFR Part 11)
          </p>
        </div>
      </div>
    </div>
  );
}
