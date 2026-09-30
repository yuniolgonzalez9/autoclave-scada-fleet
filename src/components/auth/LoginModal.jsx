import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  ShieldCheck, 
  User, 
  Lock, 
  AlertCircle, 
  Loader2, 
  KeyRound, 
  UserPlus, 
  CheckCircle2,
  Clock,
  Ban,
  Mail,
  HelpCircle,
  ArrowLeft
} from 'lucide-react';

export default function LoginModal() {
  const { loginWithCredentials, requestUserAccess, requestPasswordRecovery } = useAuth();
  
  // Vista activa: 'login' | 'solicitud' | 'recovery'
  const [mode, setMode] = useState('login');

  // Estados de login
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  
  // Estados para solicitud de nuevo acceso
  const [reqNombre, setReqNombre] = useState('');
  const [reqUsuario, setReqUsuario] = useState('');
  const [reqEmail, setReqEmail] = useState('');
  const [reqDepto, setReqDepto] = useState('Central de Esterilización (CEYE/RUMED)');
  const [reqPassword, setReqPassword] = useState('');

  // Estados para recuperación
  const [recoveryEmail, setRecoveryEmail] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [statusType, setStatusType] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const resetMessages = () => {
    setErrorMsg('');
    setSuccessMsg('');
    setStatusType(null);
  };

  // Iniciar Sesión Real
  const handleLogin = async (e) => {
    e.preventDefault();
    resetMessages();
    setSubmitting(true);

    try {
      await loginWithCredentials(identifier, password);
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('ESTADO_PENDIENTE')) {
        setStatusType('PENDIENTE');
        setErrorMsg('Su solicitud de acceso está en revisión. El Administrador debe aprobar su cuenta antes de ingresar.');
      } else if (msg.includes('ESTADO_INACTIVO')) {
        setStatusType('INACTIVO');
        setErrorMsg('Acceso Desactivado / No Autorizado. Su usuario ha sido inhabilitado.');
      } else {
        setStatusType('GENERIC');
        setErrorMsg(msg || 'Credenciales no válidas.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Solicitar Nuevo Acceso
  const handleRegisterRequest = async (e) => {
    e.preventDefault();
    resetMessages();
    setSubmitting(true);

    try {
      await requestUserAccess({
        usuario: reqUsuario,
        nombre_completo: reqNombre,
        email: reqEmail,
        departamento: reqDepto,
        password: reqPassword
      });
      setSuccessMsg('¡Solicitud enviada con éxito! Su cuenta está en revisión. La Dirección Biomédica ha sido notificada.');
      setReqNombre('');
      setReqUsuario('');
      setReqEmail('');
      setReqPassword('');
    } catch (err) {
      setErrorMsg(err.message || 'Error al procesar la solicitud.');
    } finally {
      setSubmitting(false);
    }
  };

  // Recuperar Contraseña / Datos
  const handleRecovery = async (e) => {
    e.preventDefault();
    resetMessages();
    setSubmitting(true);

    try {
      const result = await requestPasswordRecovery(recoveryEmail);
      setSuccessMsg(result.message);
      setRecoveryEmail('');
    } catch (err) {
      setErrorMsg(err.message || 'Error al procesar la solicitud de recuperación.');
    } finally {
      setSubmitting(false);
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

        {/* Notificaciones */}
        {errorMsg && (
          <div className={`mb-5 p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
            statusType === 'PENDIENTE'
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              : statusType === 'INACTIVO'
              ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
              : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
          }`}>
            {statusType === 'PENDIENTE' ? (
              <Clock className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
            ) : statusType === 'INACTIVO' ? (
              <Ban className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
            )}
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-5 p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
            <span className="leading-relaxed">{successMsg}</span>
          </div>
        )}

        {/* VISTA 1: INICIO DE SESIÓN */}
        {mode === 'login' && (
          <div>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1.5 flex justify-between">
                  <span>Usuario o Correo Registrado</span>
                  <span className="text-[10px] text-cyan-400 font-semibold">Acceso Autorizado</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Ej: superadmin o usuario@hospital.com"
                    className="w-full pl-9 pr-3 py-2 bg-slate-900/80 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-mono text-slate-300">Contraseña de Seguridad</label>
                  <button
                    type="button"
                    onClick={() => { setMode('recovery'); resetMessages(); }}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 font-mono transition-colors"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
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
                    <span>Verificando Credenciales...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>Ingresar a Supervisión Biomédica</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-slate-800 text-center">
              <button
                type="button"
                onClick={() => { setMode('solicitud'); resetMessages(); }}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-medium flex items-center justify-center gap-1.5 mx-auto transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>¿Eres nuevo operador? Solicitar nuevo acceso</span>
              </button>
            </div>
          </div>
        )}

        {/* VISTA 2: RECUPERACIÓN DE CREDENCIALES */}
        {mode === 'recovery' && (
          <div>
            <div className="mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-1">
                <HelpCircle className="w-4 h-4 text-cyan-400" />
                Recuperación Oficial de Acceso
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Ingresa tu correo electrónico registrado. Por protocolo hospitalario, se enviará una alerta de seguridad inmediata al Administrador para validar tu identidad.
              </p>
            </div>

            <form onSubmit={handleRecovery} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1.5">Correo Electrónico del Usuario</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    required
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    placeholder="usuario@hospital.com"
                    className="w-full pl-9 pr-3 py-2 bg-slate-900/80 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-90 text-white font-semibold rounded-lg text-sm shadow-lg shadow-orange-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Solicitar Asistencia de Recuperación</span>
                )}
              </button>
            </form>

            <div className="mt-4 pt-3 border-t border-slate-800 text-center">
              <button
                type="button"
                onClick={() => { setMode('login'); resetMessages(); }}
                className="text-xs text-slate-400 hover:text-white flex items-center justify-center gap-1 mx-auto transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Volver al Inicio de Sesión</span>
              </button>
            </div>
          </div>
        )}

        {/* VISTA 3: SOLICITAR NUEVO ACCESO */}
        {mode === 'solicitud' && (
          <div>
            <form onSubmit={handleRegisterRequest} className="space-y-3">
              <div>
                <label className="block text-[11px] font-mono text-slate-300 mb-1">Nombre Completo</label>
                <input
                  type="text"
                  required
                  value={reqNombre}
                  onChange={(e) => setReqNombre(e.target.value)}
                  placeholder="Ej: Lic. Carlos Pérez"
                  className="w-full px-3 py-1.5 bg-slate-900/80 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-mono text-slate-300 mb-1">Usuario Deseado</label>
                  <input
                    type="text"
                    required
                    value={reqUsuario}
                    onChange={(e) => setReqUsuario(e.target.value)}
                    placeholder="carlos_rumed"
                    className="w-full px-3 py-1.5 bg-slate-900/80 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-slate-300 mb-1">Correo de Contacto</label>
                  <input
                    type="email"
                    required
                    value={reqEmail}
                    onChange={(e) => setReqEmail(e.target.value)}
                    placeholder="carlos@hospital.com"
                    className="w-full px-3 py-1.5 bg-slate-900/80 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-300 mb-1">Departamento / Área</label>
                <select
                  value={reqDepto}
                  onChange={(e) => setReqDepto(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900/80 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400"
                >
                  <option value="Central de Esterilización (CEYE/RUMED)">Central de Esterilización (CEYE/RUMED)</option>
                  <option value="Quirófanos & Cirugía">Quirófanos & Cirugía</option>
                  <option value="Ingeniería Biomédica & Mantenimiento">Ingeniería Biomédica & Mantenimiento</option>
                  <option value="Control de Calidad & Epidemiología">Control de Calidad & Epidemiología</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-300 mb-1">Contraseña Propuesta</label>
                <input
                  type="password"
                  required
                  value={reqPassword}
                  onChange={(e) => setReqPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full px-3 py-1.5 bg-slate-900/80 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-90 text-white font-semibold rounded-lg text-xs shadow-md transition-all flex items-center justify-center gap-2 mt-2"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>Enviar Solicitud a la Administración</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-4 pt-3 border-t border-slate-800 text-center">
              <button
                type="button"
                onClick={() => { setMode('login'); resetMessages(); }}
                className="text-xs text-slate-400 hover:text-white transition-colors"
              >
                ← Volver al Inicio de Sesión
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
