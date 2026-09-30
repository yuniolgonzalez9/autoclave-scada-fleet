import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ShieldCheck, Mail, Lock, AlertCircle, Loader2, Cpu, Activity, Database } from 'lucide-react';

export default function LoginModal() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setErrorMsg(err.message || 'Credenciales no autorizadas en el registro central de telemetría.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[75vh] px-4 w-full">
      <div className="ultra-glass p-8 md:p-10 rounded-2xl shadow-2xl max-w-md w-full border border-cyan-500/30 relative">
        
        {/* Cabecera del Portal Institucional */}
        <div className="text-center mb-7">
          <div className="inline-flex p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 mb-3 shadow-[0_0_15px_rgba(0,243,255,0.2)]">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-wide uppercase">
            Plataforma Central de Telemetría
          </h2>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            Control de Activos Biomédicos & Supervisión Clínica
          </p>
        </div>

        {/* Mensaje de error dinámico */}
        {errorMsg && (
          <div className="mb-5 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1.5 flex justify-between">
              <span>ID Profesional / Correo Corporativo</span>
              <span className="text-[10px] text-cyan-400/80">ISO 13485</span>
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ingenieria@hospital.com"
                className="w-full pl-9 pr-3 py-2 bg-slate-900/80 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1.5 flex justify-between">
              <span>Firma Digital / Clave de Acceso</span>
              <span className="text-[10px] text-cyan-400/80">Encriptada</span>
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
            className="w-full py-2.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold rounded-lg text-sm shadow-lg shadow-cyan-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Autenticando en Servidor Central...</span>
              </>
            ) : (
              'Ingresar a Supervisión Biomédica'
            )}
          </button>
        </form>

        {/* Indicadores de Módulos Activos de la Flota */}
        <div className="mt-6 pt-4 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded bg-slate-950/40 border border-white/5">
            <Activity className="w-3.5 h-3.5 text-cyan-400 mx-auto mb-1" />
            <span className="text-[10px] font-mono text-slate-400 block leading-tight">Esterilización</span>
          </div>
          <div className="p-2 rounded bg-slate-950/40 border border-white/5">
            <Cpu className="w-3.5 h-3.5 text-fuchsia-400 mx-auto mb-1" />
            <span className="text-[10px] font-mono text-slate-400 block leading-tight">Telemetría IoT</span>
          </div>
          <div className="p-2 rounded bg-slate-950/40 border border-white/5">
            <Database className="w-3.5 h-3.5 text-emerald-400 mx-auto mb-1" />
            <span className="text-[10px] font-mono text-slate-400 block leading-tight">Trazabilidad F0</span>
          </div>
        </div>
      </div>

      <div className="mt-4 text-center">
        <p className="text-[11px] text-slate-500 font-mono">
          Sistema Multi-Dispositivo de Supervisión Hospitalaria e Industrial
        </p>
      </div>
    </div>
  );
}
