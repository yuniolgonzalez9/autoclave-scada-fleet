import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { 
  Users, 
  UserPlus, 
  Shield, 
  Key, 
  Building2, 
  Check, 
  X, 
  Power, 
  Trash2, 
  Clock, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle,
  Cpu
} from 'lucide-react';

export default function UserManagementView({ fleet, onFleetUpdated }) {
  const [activeTab, setActiveTab] = useState('directorio'); // 'directorio' | 'crear' | 'solicitudes' | 'bitacora'
  const [usersList, setUsersList] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Formulario de Nuevo Usuario (Correo Opcional)
  const [uUser, setUUser] = useState('');
  const [uNombre, setUNombre] = useState('');
  const [uEmail, setUEmail] = useState('');
  const [uPass, setUPass] = useState('');
  const [uRol, setURol] = useState('OPERADOR');
  const [uHospital, setUHospital] = useState('');
  const [selectedDevices, setSelectedDevices] = useState({});

  // Modales
  const [resetUser, setResetUser] = useState(null);
  const [tempPassword, setTempPassword] = useState('');
  const [editAssignUser, setEditAssignUser] = useState(null);
  const [editUserDevices, setEditUserDevices] = useState({});

  const macList = Object.keys(fleet || {});

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('usuarios_scada')
        .select('*');
      if (data) setUsersList(data);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      const { data } = await supabase
        .from('auditoria_accesos')
        .select('*')
        .order('fecha_hora', { ascending: false })
        .limit(35);
      if (data) setAuditLogs(data);
    } catch (e) {}
  };

  useEffect(() => {
    fetchUsers();
    fetchLogs();
  }, []);

  const generateRandomPass = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let pass = 'BIO-';
    for (let i = 0; i < 5; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
    setUPass(pass);
  };

  // =========================================================================
  // CREACIÓN FLEXIBLE (CORREO OPCIONAL Y SIN COLUMNAS INEXISTENTES)
  // =========================================================================
  const handleCreateUser = async (e) => {
    e.preventDefault();
    setMsg('');
    setErrorMsg('');

    const cleanUser = uUser.trim().toLowerCase();
    const assignedMacs = Object.keys(selectedDevices).filter((m) => selectedDevices[m]);

    if (cleanUser.length < 3) {
      return setErrorMsg('El nombre de usuario debe tener mínimo 3 caracteres.');
    }
    if (uPass.trim().length < 4) {
      return setErrorMsg('La contraseña debe tener mínimo 4 caracteres.');
    }

    // Correo opcional: si lo dejas vacío, se genera un alias interno transparente
    const finalEmail = uEmail.trim() ? uEmail.trim().toLowerCase() : `${cleanUser}@hospital.local`;

    try {
      // 1. Guardar en usuarios_scada solo columnas universales probadas
      const userPayload = {
        usuario: cleanUser,
        nombre: uNombre.trim() || cleanUser,
        email: finalEmail,
        password: uPass.trim(),
        rol: uRol,
        estado: 'ACTIVO'
      };

      const { error: userError } = await supabase
        .from('usuarios_scada')
        .upsert(userPayload, { onConflict: 'usuario' });

      if (userError) throw userError;

      // 2. Vincular los autoclaves en asignaciones_equipos
      for (const mac of assignedMacs) {
        await supabase
          .from('asignaciones_equipos')
          .upsert({
            mac: mac,
            cliente: uHospital.trim() || 'Clínica Asignada',
            usuario_asignado: cleanUser,
            updated_at: new Date().toISOString()
          }, { onConflict: 'mac' });
      }

      setMsg(`¡Usuario [${cleanUser.toUpperCase()}] creado exitosamente con ${assignedMacs.length} equipo(s) vinculado(s)!`);
      
      // Limpiar formulario
      setUUser('');
      setUNombre('');
      setUEmail('');
      setUPass('');
      setUHospital('');
      setSelectedDevices({});
      fetchUsers();
      if (onFleetUpdated) onFleetUpdated();
      setActiveTab('directorio');
    } catch (err) {
      setErrorMsg('Error al registrar usuario: ' + err.message);
    }
  };

  const handleToggleStatus = async (user) => {
    const username = user.usuario || user.user;
    if (username === 'superadmin' || username === 'admin') {
      return alert('No puedes suspender la cuenta del Superadministrador.');
    }

    const newStatus = user.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    try {
      await supabase
        .from('usuarios_scada')
        .update({ estado: newStatus })
        .eq('usuario', username);

      fetchUsers();
    } catch (e) {
      alert('Error cambiando estado');
    }
  };

  const handleSavePassword = async () => {
    if (!resetUser || tempPassword.trim().length < 4) return alert('Mínimo 4 caracteres.');
    const username = resetUser.usuario || resetUser.user;

    try {
      await supabase
        .from('usuarios_scada')
        .update({ password: tempPassword.trim() })
        .eq('usuario', username);

      alert(`Contraseña de ${username} actualizada a: ${tempPassword}`);
      setResetUser(null);
      setTempPassword('');
      fetchUsers();
    } catch (e) {
      alert('Error actualizando contraseña');
    }
  };

  const handleSaveAssignedDevices = async () => {
    if (!editAssignUser) return;
    const username = editAssignUser.usuario || editAssignUser.user;
    const newAssignedMacs = Object.keys(editUserDevices).filter((m) => editUserDevices[m]);

    try {
      for (const mac of newAssignedMacs) {
        await supabase
          .from('asignaciones_equipos')
          .upsert({
            mac: mac,
            usuario_asignado: username,
            updated_at: new Date().toISOString()
          }, { onConflict: 'mac' });
      }

      alert(`Equipos asignados a [${username}] actualizados en la nube.`);
      setEditAssignUser(null);
      fetchUsers();
      if (onFleetUpdated) onFleetUpdated();
    } catch (e) {
      alert('Error guardando asignación');
    }
  };

  const openEditAssignModal = (usr) => {
    setEditAssignUser(usr);
    const username = (usr.usuario || usr.user || '').toLowerCase();
    const initialMap = {};
    macList.forEach((m) => {
      initialMap[m] = (fleet[m]?.meta?.usuario_asignado || '').toLowerCase() === username;
    });
    setEditUserDevices(initialMap);
  };

  const handleDeleteUser = async (user) => {
    const username = user.usuario || user.user;
    if (username === 'superadmin' || username === 'admin') {
      return alert('No puedes eliminar la cuenta raíz de Superadmin.');
    }
    if (!confirm(`¿Eliminar definitivamente al usuario [${username.toUpperCase()}]?`)) return;

    try {
      await supabase.from('usuarios_scada').delete().eq('usuario', username);
      fetchUsers();
    } catch (e) {
      alert('Error eliminando usuario');
    }
  };

  const handleApproveRequest = async (reqUser, roleToAssign = 'OPERADOR') => {
    const username = reqUser.usuario || reqUser.user;
    try {
      await supabase
        .from('usuarios_scada')
        .update({ estado: 'ACTIVO', rol: roleToAssign })
        .eq('usuario', username);
      fetchUsers();
    } catch (e) {
      alert('Error aprobando');
    }
  };

  const pendingList = usersList.filter((u) => u.estado === 'PENDIENTE');
  const activeList = usersList.filter((u) => u.estado !== 'PENDIENTE');

  return (
    <div className="space-y-4">
      {/* Cabecera del Centro Maestro */}
      <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-cyan-400" />
            Centro Maestro de Personal, Roles & Asignación de Flota
          </h2>
          <p className="text-xs text-slate-300 font-mono mt-0.5">
            Gestión jerárquica de cuentas y vinculación de autoclaves por cliente
          </p>
        </div>

        {/* Sub-Pestañas */}
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setActiveTab('directorio')}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
              activeTab === 'directorio' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'bg-slate-900 border border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            👥 Personal ({activeList.length})
          </button>

          <button
            onClick={() => setActiveTab('crear')}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
              activeTab === 'crear' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'bg-slate-900 border border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            + Crear Usuario & Asignar
          </button>

          <button
            onClick={() => setActiveTab('solicitudes')}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
              activeTab === 'solicitudes' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'bg-slate-900 border border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Solicitudes ({pendingList.length})</span>
            </span>
          </button>

          <button
            onClick={() => setActiveTab('bitacora')}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
              activeTab === 'bitacora' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'bg-slate-900 border border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            🛡️ Bitácora Forense
          </button>
        </div>
      </div>

      {msg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{msg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-mono flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* PESTAÑA 1: DIRECTORIO */}
      {activeTab === 'directorio' && (
        <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
              <Users className="w-4 h-4 text-cyan-400" />
              Directorio de Cuentas y Equipos Vinculados
            </h3>
            <button onClick={fetchUsers} className="px-2.5 py-1 bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded-lg hover:text-white">
              🔄 Recargar
            </button>
          </div>

          <div className="rounded-xl border border-slate-800 overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900/90 text-cyan-400 border-b border-slate-800">
                <tr>
                  <th className="p-3">USUARIO / ID</th>
                  <th className="p-3">NOMBRE</th>
                  <th className="p-3">CORREO REGISTRADO</th>
                  <th className="p-3">ROL</th>
                  <th className="p-3">EQUIPOS ASIGNADOS</th>
                  <th className="p-3">ESTADO</th>
                  <th className="p-3 text-center">ACCIONES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {activeList.map((u) => {
                  const username = u.usuario || u.user;
                  const isActive = u.estado === 'ACTIVO';
                  const isRoot = username === 'superadmin' || username === 'admin';
                  
                  // Autoclaves asignados a este usuario en fleet
                  const userMacs = macList.filter(m => (fleet[m]?.meta?.usuario_asignado || '').toLowerCase() === username.toLowerCase());

                  return (
                    <tr key={username} className="hover:bg-slate-800/40">
                      <td className="p-3 font-bold text-white">
                        <span className="text-cyan-300">{username}</span>
                        {isRoot && <span className="text-[9px] px-1 ml-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">ROOT</span>}
                      </td>
                      <td className="p-3 text-white">{u.nombre || username}</td>
                      <td className="p-3 text-slate-400">{u.email ? (u.email.includes('@hospital.local') ? 'Sin correo' : u.email) : 'Sin correo'}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold border border-cyan-500/30 text-cyan-300 bg-cyan-500/10">
                          {u.rol || 'OPERADOR'}
                        </span>
                      </td>
                      
                      <td className="p-3">
                        {isRoot ? (
                          <span className="text-[10px] text-amber-300 font-bold">🌐 TODA LA FLOTA</span>
                        ) : userMacs.length === 0 ? (
                          <span className="text-[10px] text-slate-500 italic">Sin equipos</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {userMacs.map((m) => (
                              <span key={m} className="px-1.5 py-0.2 rounded text-[9px] bg-cyan-950/80 border border-cyan-500/40 text-cyan-300">
                                {fleet[m]?.meta?.alias || m.slice(-4)}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          isActive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        }`}>
                          {isActive ? 'ACTIVO' : 'SUSPENDIDO'}
                        </span>
                      </td>

                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => { setResetUser(u); setTempPassword(''); }}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg text-xs"
                            title="Cambiar Contraseña"
                          >
                            <Key className="w-3.5 h-3.5" />
                          </button>

                          {!isRoot && (
                            <>
                              <button
                                onClick={() => openEditAssignModal(u)}
                                className="p-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 rounded-lg text-xs"
                                title="Editar Autoclaves Asignados"
                              >
                                <Cpu className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => handleToggleStatus(u)}
                                className={`p-1.5 rounded-lg border text-xs ${
                                  isActive ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                }`}
                                title={isActive ? 'Suspender Acceso' : 'Activar Acceso'}
                              >
                                <Power className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => handleDeleteUser(u)}
                                className="p-1.5 bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 rounded-lg text-xs"
                                title="Eliminar Usuario"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PESTAÑA 2: FORMULARIO DE ALTA (CORREO OPCIONAL) */}
      {activeTab === 'crear' && (
        <form onSubmit={handleCreateUser} className="ultra-glass p-6 rounded-2xl border border-cyan-500/30 space-y-5">
          <div className="border-b border-cyan-500/20 pb-3">
            <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-cyan-400" />
              Alta de Usuario & Asignación de Autoclaves
            </h3>
            <p className="text-xs text-slate-300 font-mono mt-0.5">
              Crea el usuario directamente. El correo es opcional para mayor rapidez.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 text-xs font-mono">
            <div>
              <label className="block text-slate-300 mb-1">Nombre de Usuario (ID de Acceso) *</label>
              <input
                type="text"
                required
                value={uUser}
                onChange={(e) => setUUser(e.target.value)}
                placeholder="ej: fary"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Nombre Completo del Personal</label>
              <input
                type="text"
                value={uNombre}
                onChange={(e) => setUNombre(e.target.value)}
                placeholder="ej: Fary Bonilla"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-400 font-sans"
              />
            </div>

            <div>
              <label className="block text-slate-300 mb-1 flex justify-between">
                <span>Correo Electrónico</span>
                <span className="text-[10px] text-cyan-400">(Opcional)</span>
              </label>
              <input
                type="email"
                value={uEmail}
                onChange={(e) => setUEmail(e.target.value)}
                placeholder="Dejar vacío si no aplica"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-slate-300">Contraseña de Acceso *</label>
                <button
                  type="button"
                  onClick={generateRandomPass}
                  className="text-[10px] text-cyan-400 hover:underline"
                >
                  ⚡ Generar
                </button>
              </div>
              <input
                type="text"
                required
                value={uPass}
                onChange={(e) => setUPass(e.target.value)}
                placeholder="ej: 1234"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Jerarquía / Rol en la Plataforma</label>
              <select
                value={uRol}
                onChange={(e) => setURol(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-cyan-300 focus:outline-none focus:border-cyan-400"
              >
                <option value="OPERADOR">OPERADOR (Solo opera sus autoclaves y reportes)</option>
                <option value="CLIENTE">CLIENTE / ENFERMERÍA (Solo lectura y ciclos)</option>
                <option value="TECNICO">TÉCNICO BIOMÉDICO (NVS, Calibración y FOTA)</option>
                <option value="AUDITOR_CALIDAD">AUDITOR DE CALIDAD (Descarga de certificados)</option>
                <option value="SUPERADMIN">SUPERADMINISTRADOR (Control total)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Hospital / Clínica Asignada</label>
              <input
                type="text"
                value={uHospital}
                onChange={(e) => setUHospital(e.target.value)}
                placeholder="ej: Clínica Dr. Bonilla"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-400 font-sans"
              />
            </div>
          </div>

          {/* ASIGNACIÓN DE AUTOCLAVES */}
          <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-xs font-mono font-bold text-cyan-400 block uppercase">
                  Autoclaves Permitidos para este Usuario:
                </span>
                <p className="text-[11px] text-slate-400 font-mono">
                  Marca las casillas de los equipos a los que tendrá acceso exclusivo.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  const allMap = {};
                  macList.forEach((m) => { allMap[m] = true; });
                  setSelectedDevices(allMap);
                }}
                className="px-2 py-1 bg-slate-900 border border-slate-700 text-[10px] font-mono text-slate-300 rounded hover:text-white"
              >
                Marcar Todos
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {macList.map((mac) => {
                const dev = fleet[mac];
                const checked = Boolean(selectedDevices[mac]);

                return (
                  <label
                    key={mac}
                    className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between transition-all ${
                      checked ? 'bg-cyan-950/50 border-cyan-400 shadow-md' : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setSelectedDevices({ ...selectedDevices, [mac]: e.target.checked })}
                        className="w-4 h-4 accent-cyan-400"
                      />
                      <div>
                        <p className="font-bold text-xs text-white">{dev?.meta?.alias || `AUTOCLAVE [${mac.slice(-4)}]`}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{mac}</p>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90 text-white font-bold rounded-xl text-xs font-mono flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25"
          >
            <UserPlus className="w-4 h-4" />
            <span>Crear Usuario & Vincular Equipos en la Nube</span>
          </button>
        </form>
      )}

      {/* PESTAÑA 3: SOLICITUDES PENDIENTES */}
      {activeTab === 'solicitudes' && (
        <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-4">
          <div className="flex justify-between items-center border-b border-cyan-500/20 pb-3">
            <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              Solicitudes Pendientes ({pendingList.length})
            </h3>
            <button onClick={fetchUsers} className="px-2.5 py-1 bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded-lg">
              🔄 Actualizar
            </button>
          </div>

          {pendingList.length === 0 ? (
            <div className="p-8 text-center text-xs font-mono text-slate-400">
              No hay solicitudes pendientes en este momento.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingList.map((req) => (
                <div key={req.usuario || req.user} className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                  <div>
                    <p className="text-sm font-bold text-white">{req.nombre || req.usuario}</p>
                    <p className="text-xs font-mono text-cyan-400">
                      Usuario: <strong>{req.usuario || req.user}</strong> | Correo: {req.email}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleApproveRequest(req, 'OPERADOR')}
                      className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500 text-emerald-300 rounded-lg text-xs font-mono font-bold flex items-center gap-1"
                    >
                      <Check className="w-4 h-4" />
                      <span>Aprobar como Operador</span>
                    </button>
                    <button
                      onClick={() => handleDeleteUser(req)}
                      className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500 text-rose-300 rounded-lg text-xs font-mono"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PESTAÑA 4: BITÁCORA FORENSE */}
      {activeTab === 'bitacora' && (
        <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-4">
          <div className="flex justify-between items-center border-b border-cyan-500/20 pb-3">
            <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              Auditoría Forense de Conexiones
            </h3>
            <button onClick={fetchLogs} className="px-2.5 py-1 bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded-lg">
              🔄 Actualizar
            </button>
          </div>

          <div className="rounded-xl border border-slate-800 overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900/90 text-cyan-400 border-b border-slate-800">
                <tr>
                  <th className="p-3">FECHA / HORA</th>
                  <th className="p-3">USUARIO</th>
                  <th className="p-3">EVENTO DE SEGURIDAD</th>
                  <th className="p-3">DISPOSITIVO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {auditLogs.map((l, i) => (
                  <tr key={i} className="hover:bg-slate-800/30">
                    <td className="p-3 text-slate-400">{new Date(l.fecha_hora || l.created_at).toLocaleString()}</td>
                    <td className="p-3 font-bold text-white">{l.usuario_email || l.usuario}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        (l.evento || '').includes('EXITOSO') || (l.evento || '').includes('ACK') ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                        (l.evento || '').includes('FALLO') || (l.evento || '').includes('SUSPEND') ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' :
                        'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
                      }`}>
                        {l.evento}
                      </span>
                    </td>
                    <td className="p-3 text-slate-400">{l.dispositivo || 'Navegador Web'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: CAMBIAR CONTRASEÑA */}
      {resetUser && (
        <div className="fixed inset-0 z-[999999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="ultra-glass border-2 border-cyan-500 p-5 rounded-2xl max-w-sm w-full space-y-3 font-mono text-xs">
            <h4 className="font-bold text-white text-sm">Cambiar Clave: {resetUser.usuario || resetUser.user}</h4>
            <input
              type="text"
              value={tempPassword}
              onChange={(e) => setTempPassword(e.target.value)}
              placeholder="Nueva contraseña..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-400"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setResetUser(null)}
                className="flex-1 py-2 bg-slate-800 text-slate-300 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSavePassword}
                className="flex-1 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-lg"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR EQUIPOS ASIGNADOS A UN USUARIO */}
      {editAssignUser && (
        <div className="fixed inset-0 z-[999999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="ultra-glass border-2 border-purple-500/60 p-6 rounded-2xl max-w-lg w-full space-y-4 font-mono text-xs max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-purple-500/30 pb-2">
              <h4 className="font-bold text-white text-sm">
                Autoclaves Autorizados para [{editAssignUser.usuario || editAssignUser.user}]
              </h4>
              <button onClick={() => setEditAssignUser(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-slate-300">
              Marca o desmarca los autoclaves a los que tendrá acceso este operador:
            </p>

            <div className="space-y-2">
              {macList.map((mac) => {
                const dev = fleet[mac];
                const checked = Boolean(editUserDevices[mac]);

                return (
                  <label
                    key={mac}
                    className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer ${
                      checked ? 'bg-purple-950/40 border-purple-400' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setEditUserDevices({ ...editUserDevices, [mac]: e.target.checked })}
                        className="w-4 h-4 accent-purple-400"
                      />
                      <div>
                        <p className="font-bold text-white text-xs">{dev?.meta?.alias || `AUTOCLAVE [${mac.slice(-4)}]`}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{mac}</p>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditAssignUser(null)}
                className="flex-1 py-2.5 bg-slate-800 text-slate-300 rounded-xl font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveAssignedDevices}
                className="flex-1 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-bold rounded-xl shadow-lg"
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
