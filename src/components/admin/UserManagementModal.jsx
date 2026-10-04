import React, { useEffect, useState } from 'react';
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
  Smartphone,
  ShieldAlert
} from 'lucide-react';

export default function UserManagementModal({ isOpen, onClose }) {
  const { updateUserStatus, resetUserPassword } = useAuth();
  const [usersList, setUsersList] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [selectedRole, setSelectedRole] = useState({});
  const [resetPromptUser, setResetPromptUser] = useState(null);
  const [tempPass, setTempPass] = useState('');
  const [successInfo, setSuccessInfo] = useState('');
  const [adminTab, setAdminTab] = useState('usuarios'); // 'usuarios' | 'bitacora'

  const fetchAllUsers = async () => {
    try {
      const { data } = await supabase
        .from('usuarios_scada')
        .select('*')
        .order('fecha_solicitud', { ascending: false });
      if (data) setUsersList(data);
    } catch (e) {}
  };

  const fetchAuditLogs = async () => {
    try {
      const { data } = await supabase
        .from('auditoria_accesos')
        .select('*')
        .order('fecha_hora', { ascending: false })
        .limit(30);
      if (data) setAuditLogs(data);
    } catch (e) {}
  };

  useEffect(() => {
    if (isOpen) {
      fetchAllUsers();
      fetchAuditLogs();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleApprove = async (user) => {
    const roleToAssign = selectedRole[user.id] || 'Operador de Esterilización';
    await updateUserStatus(user.id, 'ACTIVO', roleToAssign);
    await fetchAllUsers();
  };

  const handleReject = async (user) => {
    await updateUserStatus(user.id, 'RECHAZADO');
    await fetchAllUsers();
  };

  const handleToggleActive = async (user) => {
    const newStatus = (user.estado === 'ACTIVO') ? 'INACTIVO' : 'ACTIVO';
    await updateUserStatus(user.id, newStatus);
    await fetchAllUsers();
  };

  const handleConfirmPasswordReset = async () => {
    if (!resetPromptUser || !tempPass.trim()) return;
    try {
      await resetUserPassword(resetPromptUser.id, tempPass);
      setSuccessInfo(`Contraseña de ${resetPromptUser.usuario} actualizada a: ${tempPass}`);
      setResetPromptUser(null);
      setTempPass('');
      await fetchAllUsers();
    } catch (e) {
      alert('Error actualizando contraseña');
    }
  };

  const pendingList = usersList.filter(u => u.estado === 'PENDIENTE');
  const activeList = usersList.filter(u => u.estado !== 'PENDIENTE');

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="ultra-glass border border-cyan-500/40 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Cabecera y Selector de Pestañas */}
        <div className="px-6 py-4 border-b border-cyan-500/20 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">
                Control de Personal & Seguridad Forense
              </h3>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => setAdminTab('usuarios')}
                  className={`text-xs font-mono px-2 py-0.5 rounded ${adminTab === 'usuarios' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400'}`}
                >
                  Personal ({usersList.length})
                </button>
                <button
                  onClick={() => setAdminTab('bitacora')}
                  className={`text-xs font-mono px-2 py-0.5 rounded ${adminTab === 'bitacora' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400'}`}
                >
                  Bitácora Forense
                </button>
              </div>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          
          {successInfo && (
            <div className="p-3 bg-emerald-500/20 border border-emerald-500 text-emerald-300 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successInfo}</span>
            </div>
          )}

          {adminTab === 'usuarios' ? (
            <>
              {/* Prompt de cambio de clave */}
              {resetPromptUser && (
                <div className="p-4 bg-slate-900 border border-amber-500/50 rounded-xl space-y-3">
                  <p className="text-xs text-amber-300 font-mono font-bold">
                    Asignar Nueva Contraseña a: {resetPromptUser.nombre} ({resetPromptUser.usuario})
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
                      onClick={handleConfirmPasswordReset}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg flex items-center gap-1"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Guardar</span>
                    </button>
                    <button
                      onClick={() => setResetPromptUser(null)}
                      className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg"
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
                  <h4 className="text-sm font-bold text-amber-300 font-mono uppercase tracking-wider">
                    Solicitudes de Registro Pendientes ({pendingList.length})
                  </h4>
                </div>

                {pendingList.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 text-center text-xs text-slate-400 font-mono">
                    No hay solicitudes pendientes en este momento.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingList.map((req) => (
                      <div key={req.id} className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-bold text-white">{req.nombre}</p>
                          <p className="text-xs font-mono text-cyan-400">
                            Usuario: <strong>{req.usuario}</strong> | Correo: {req.email}
                          </p>
                          <p className="text-[11px] text-slate-300 mt-0.5">Área: {req.departamento}</p>
                        </div>

                        <div className="flex items-center gap-2 w-full md:w-auto">
                          <select
                            defaultValue="Operador de Esterilización"
                            onChange={(e) => setSelectedRole({ ...selectedRole, [req.id]: e.target.value })}
                            className="bg-slate-900 border border-cyan-500/40 text-xs text-cyan-300 rounded-lg px-2.5 py-1.5 focus:outline-none"
                          >
                            <option value="Operador de Esterilización">Operador de Esterilización</option>
                            <option value="Ingeniero de Mantenimiento">Ingeniero de Mantenimiento</option>
                            <option value="Director Biomédico">Director Biomédico</option>
                          </select>

                          <button
                            onClick={() => handleApprove(req)}
                            className="p-1.5 bg-emerald-500/20 hover:bg-emerald-500/40 border border-emerald-500 text-emerald-300 rounded-lg text-xs font-medium flex items-center gap-1"
                          >
                            <Check className="w-4 h-4" />
                            <span>Aprobar</span>
                          </button>

                          <button
                            onClick={() => handleReject(req)}
                            className="p-1.5 bg-rose-500/20 hover:bg-rose-500/40 border border-rose-500 text-rose-300 rounded-lg text-xs font-medium"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Personal Activo */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="w-4 h-4 text-cyan-400" />
                  <h4 className="text-sm font-bold text-cyan-300 font-mono uppercase tracking-wider">
                    Personal Registrado & Control de Acceso
                  </h4>
                </div>

                <div className="space-y-2">
                  {activeList.map((usr) => {
                    const isActive = usr.estado === 'ACTIVO';
                    return (
                      <div key={usr.id} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white">{usr.nombre || usr.usuario}</span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                              {usr.rol || 'Personal'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 font-mono mt-0.5">
                            Usuario: <strong className="text-slate-200">{usr.usuario}</strong> | Clave: <span className="text-slate-500 font-mono">{usr.password || '••••••'}</span>
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setResetPromptUser(usr); setTempPass('BIO-' + Math.floor(1000 + Math.random() * 9000)); }}
                            className="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-lg text-xs flex items-center gap-1 font-mono"
                          >
                            <Key className="w-3.5 h-3.5" />
                            <span>Nueva Clave</span>
                          </button>

                          <button
                            onClick={() => handleToggleActive(usr)}
                            className={`p-1.5 rounded-lg border transition-all ${
                              isActive
                                ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20'
                                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                            }`}
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
            /* PESTAÑA: BITÁCORA FORENSE DE CONEXIONES (AUDITORÍA EN VIVO) */
            <div className="space-y-3">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-xs font-bold text-cyan-400 font-mono uppercase tracking-wider flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" />
                  Registro Forense de Accesos & Eventos de Seguridad
                </h4>
                <button
                  onClick={fetchAuditLogs}
                  className="px-2.5 py-1 bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded-lg"
                >
                  🔄 Actualizar
                </button>
              </div>

              <div className="rounded-xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
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
                          <td className="p-2.5 text-slate-400">{new Date(log.fecha_hora || log.created_at).toLocaleString()}</td>
                          <td className="p-2.5 font-bold text-white">{log.usuario_email || log.usuario}</td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              (log.evento || '').includes('EXITOSO') || (log.evento || '').includes('ACK') ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                              (log.evento || '').includes('CLAVE') || (log.evento || '').includes('FALLO') ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30' :
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
    </div>
  );
}
