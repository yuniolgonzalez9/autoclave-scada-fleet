import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import { 
  Users, 
  Check, 
  X, 
  Shield, 
  Clock, 
  Power, 
  Key, 
  CheckCircle2, 
  Send, 
  ShieldAlert 
} from 'lucide-react';

export default function UserManagementModal({ isOpen, onClose }) {
  const { updateUserStatus, resetUserPassword, listUserProfiles, listAccessRequests, approveAccessRequest, rejectAccessRequest } = useAuth();
  const [usersList, setUsersList] = useState([]);
  const [requestsList, setRequestsList] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [selectedRole, setSelectedRole] = useState({});
  const [resetPromptUser, setResetPromptUser] = useState(null);
  const [tempPass, setTempPass] = useState('');
  const [successInfo, setSuccessInfo] = useState('');
  const [adminTab, setAdminTab] = useState('usuarios'); // 'usuarios' | 'bitacora'

  // Cierre con tecla Escape
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  const fetchAllUsers = useCallback(async () => {
    try {
      const profiles = await listUserProfiles();
      setUsersList(profiles);
    } catch (_) {}
    try {
      const requests = await listAccessRequests();
      setRequestsList(requests);
    } catch (_) {}
  }, [listUserProfiles, listAccessRequests]);

  const fetchAuditLogs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('auditoria_accesos')
        .select('*')
        .limit(30);
      if (!error && data) setAuditLogs(data);
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchAllUsers();
      fetchAuditLogs();
    }
  }, [isOpen, fetchAllUsers, fetchAuditLogs]);

  // HOOKS REUBICADOS ARRIBA: Se ejecutan siempre de forma incondicional
  const pendingList = useMemo(() => requestsList.filter(u => u.estado === 'PENDIENTE'), [requestsList]);
  const activeList = useMemo(() => usersList, [usersList]);

  // Manejadores de aprobación / rechazo / claves
  const handleApprove = async (u) => {
    const reqKey = u.user || u.usuario || u.id;
    const roleToAssign = selectedRole[reqKey] || 'OPERADOR';
    try {
      await approveAccessRequest(u.request_id, roleToAssign);
      await fetchAllUsers();
    } catch (e) {
      alert('Error aprobando solicitud: ' + (e.message || ''));
    }
  };

  const handleReject = async (u) => {
    try {
      await rejectAccessRequest(u.request_id);
      await fetchAllUsers();
    } catch (e) {
      alert('Error rechazando solicitud: ' + (e.message || ''));
    }
  };

  const handleToggleActive = async (u) => {
    const newStatus = (u.estado === 'ACTIVO') ? 'INACTIVO' : 'ACTIVO';
    try {
      await updateUserStatus(u.user_id, newStatus);
      await fetchAllUsers();
    } catch (e) {
      alert('Error cambiando estado: ' + (e.message || ''));
    }
  };

  const handleConfirmPasswordReset = async () => {
    if (!resetPromptUser || tempPass.trim().length < 6) return;
    try {
      await resetUserPassword(resetPromptUser.user_id, tempPass);
      setSuccessInfo(`Contraseña de [${resetPromptUser.usuario || resetPromptUser.user}] actualizada.`);
      setResetPromptUser(null);
      setTempPass('');
      await fetchAllUsers();
    } catch (e) {
      alert('Error actualizando contraseña: ' + e.message);
    }
  };

  // Salida condicional segura (SOLO DESPUÉS DE TODOS LOS HOOKS)
  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[99999] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 select-none"
      onClick={onClose}
    >
      <div 
        className="ultra-glass border-2 border-cyan-500/40 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-mono text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Cabecera y Selector de Pestañas */}
        <div className="px-5 sm:px-6 py-4 border-b border-cyan-500/20 bg-slate-950/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white tracking-wide">
                Control de Personal & Seguridad Forense
              </h3>
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setAdminTab('usuarios')}
                  className={`text-xs px-2.5 py-0.5 rounded-lg font-bold transition-all ${
                    adminTab === 'usuarios' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Personal ({usersList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab('bitacora')}
                  className={`text-xs px-2.5 py-0.5 rounded-lg font-bold transition-all ${
                    adminTab === 'bitacora' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Bitácora Forense
                </button>
              </div>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido con Scroll */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
          
          {successInfo && (
            <div className="p-3 bg-emerald-500/20 border border-emerald-500 text-emerald-300 text-xs rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successInfo}</span>
              </div>
              <button onClick={() => setSuccessInfo('')} className="text-emerald-400 font-bold">X</button>
            </div>
          )}

          {adminTab === 'usuarios' ? (
            <>
              {/* Prompt de cambio de clave */}
              {resetPromptUser && (
                <div className="p-4 bg-slate-900 border border-amber-500/50 rounded-xl space-y-3">
                  <p className="text-xs text-amber-300 font-bold">
                    Asignar Nueva Contraseña a: {resetPromptUser.nombre || resetPromptUser.usuario || resetPromptUser.user} ({resetPromptUser.usuario || resetPromptUser.user})
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tempPass}
                      onChange={(e) => setTempPass(e.target.value)}
                      placeholder="Nueva contraseña..."
                      className="flex-1 bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-white rounded-lg focus:outline-none focus:border-amber-400"
                    />
                    <button
                      type="button"
                      onClick={handleConfirmPasswordReset}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg flex items-center gap-1 shadow"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Guardar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setResetPromptUser(null)}
                      className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg hover:text-white"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* Solicitudes Pendientes */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <h4 className="text-sm font-bold text-amber-300 uppercase tracking-wider">
                    Solicitudes de Registro Pendientes ({pendingList.length})
                  </h4>
                </div>

                {pendingList.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 text-center text-xs text-slate-400">
                    No hay solicitudes pendientes en este momento.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingList.map((req) => {
                      const reqKey = req.user || req.usuario || req.id;
                      return (
                        <div key={reqKey} className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-bold text-white">{req.nombre || req.user}</p>
                            <p className="text-xs text-cyan-400">
                              Usuario: <strong>{req.usuario || req.user}</strong> | Correo: {req.email || 'Sin correo'}
                            </p>
                            <p className="text-[11px] text-slate-300 font-sans mt-0.5">Área: {req.departamento || 'General'}</p>
                          </div>

                          <div className="flex items-center gap-2 w-full md:w-auto">
                            <select
                              defaultValue="OPERADOR"
                              onChange={(e) => setSelectedRole({ ...selectedRole, [reqKey]: e.target.value })}
                              className="bg-slate-900 border border-cyan-500/40 text-xs text-cyan-300 rounded-lg px-2.5 py-1.5 focus:outline-none font-bold"
                            >
                              <option value="OPERADOR">Operador de Esterilización</option>
                              <option value="TECNICO">Ingeniero de Mantenimiento</option>
                              <option value="DIRECTOR">Director Biomédico</option>
                            </select>

                            <button
                              type="button"
                              onClick={() => handleApprove(req)}
                              className="p-1.5 bg-emerald-500/20 hover:bg-emerald-500/40 border border-emerald-500 text-emerald-300 rounded-lg text-xs font-medium flex items-center gap-1 shadow"
                            >
                              <Check className="w-4 h-4" />
                              <span>Aprobar</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleReject(req)}
                              className="p-1.5 bg-rose-500/20 hover:bg-rose-500/40 border border-rose-500 text-rose-300 rounded-lg text-xs font-medium"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Personal Activo */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="w-4 h-4 text-cyan-400" />
                  <h4 className="text-sm font-bold text-cyan-300 uppercase tracking-wider">
                    Personal Registrado & Control de Acceso ({activeList.length})
                  </h4>
                </div>

                <div className="space-y-2">
                  {activeList.map((usr) => {
                    const isActive = usr.estado === 'ACTIVO';
                    const usrKey = usr.user || usr.usuario || usr.id;
                    return (
                      <div key={usrKey} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white">{usr.nombre || usr.usuario || usr.user}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold">
                              {usr.rol || 'Personal'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Usuario: <strong className="text-slate-200">{usr.usuario || usr.user}</strong> | Departamento: <span className="text-slate-300 font-sans">{usr.departamento || 'Central'}</span>
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => { setResetPromptUser(usr); setTempPass('BIO-' + Math.floor(1000 + Math.random() * 9000)); }}
                            className="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-lg text-xs flex items-center gap-1"
                          >
                            <Key className="w-3.5 h-3.5" />
                            <span>Nueva Clave</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleActive(usr)}
                            className={`p-1.5 rounded-lg border transition-all ${
                              isActive
                                ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20'
                                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                            }`}
                            title={isActive ? 'Suspender Acceso' : 'Activar Acceso'}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            /* TAB: BITÁCORA FORENSE */
            <div className="space-y-3">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" />
                  Registro Forense de Accesos & Eventos de Seguridad
                </h4>
                <button
                  type="button"
                  onClick={fetchAuditLogs}
                  className="px-2.5 py-1 bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded-lg hover:text-white"
                >
                  🔄 Actualizar
                </button>
              </div>

              <div className="rounded-xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/90 text-cyan-400 border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">FECHA / HORA</th>
                      <th className="p-2.5">USUARIO</th>
                      <th className="p-2.5">EVENTO</th>
                      <th className="p-2.5">DISPOSITIVO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="p-4 text-center text-slate-500">Sin registros forenses recientes.</td>
                      </tr>
                    ) : (
                      auditLogs.map((log, i) => (
                        <tr key={i} className="hover:bg-slate-800/30">
                          <td className="p-2.5 text-slate-400">{new Date(log.fecha_hora || log.created_at || Date.now()).toLocaleString()}</td>
                          <td className="p-2.5 font-bold text-white">{log.usuario_email || log.usuario}</td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              (log.evento || '').includes('EXITOSO') || (log.evento || '').includes('ACK') ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                              (log.evento || '').includes('CLAVE') || (log.evento || '').includes('FALLO') ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' :
                              'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
                            }`}>
                              {log.evento}
                            </span>
                          </td>
                          <td className="p-2.5 text-slate-400">{log.dispositivo || 'Navegador Web'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>,
    document.body
  );
}
