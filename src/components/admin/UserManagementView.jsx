import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../services/supabase';
import { 
  Users, 
  UserPlus, 
  Shield, 
  Key, 
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

export default function UserManagementView({ fleet = {}, onFleetUpdated }) {
  const [activeTab, setActiveTab] = useState('directorio');
  const [usersList, setUsersList] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Formulario de nuevo usuario
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

  const macList = useMemo(() => Object.keys(fleet || {}), [fleet]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('usuarios_scada')
        .select('*');
      if (!error && data) setUsersList(data);
    } catch (e) {
      console.warn('[USER MGMT] Error cargando usuarios:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('auditoria_accesos')
        .select('*')
        .limit(35);
      if (data) setAuditLogs(data);
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchLogs();
  }, [fetchUsers, fetchLogs]);

  const generateRandomPass = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let pass = 'BIO-';
    for (let i = 0; i < 5; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
    setUPass(pass);
  };

  // Creación Resiliente de Usuario
  const handleCreateUser = async (e) => {
    e.preventDefault();
    setMsg('');
    setErrorMsg('');

    const cleanUser = uUser.trim().toLowerCase();
    const cleanPass = uPass.trim();
    const cleanEmail = uEmail.trim() ? uEmail.trim().toLowerCase() : null;
    const cleanHospital = uHospital.trim() || null;
    const assignedMacs = Object.keys(selectedDevices).filter((m) => selectedDevices[m]);

    if (cleanUser.length < 3) return setErrorMsg('El nombre de usuario debe tener mínimo 3 caracteres.');
    if (cleanPass.length < 4) return setErrorMsg('La contraseña debe tener mínimo 4 caracteres.');

    try {
      const fullPayload = {
        user: cleanUser,
        pass: cleanPass,
        usuario: cleanUser,
        password: cleanPass,
        nombre: uNombre.trim() || cleanUser,
        email: cleanEmail,
        rol: uRol,
        departamento: cleanHospital,
        equipos_autorizados: assignedMacs.length > 0 ? assignedMacs.join(',') : null,
        estado: 'ACTIVO'
      };

      let { error: insertError } = await supabase
        .from('usuarios_scada')
        .upsert(fullPayload, { onConflict: 'user' });

      // Plan de contingencia si la tabla Postgres tiene columnas antiguas
      if (insertError && insertError.message && insertError.message.includes('schema cache')) {
        const safePayload = {
          user: cleanUser,
          pass: cleanPass,
          rol: uRol,
          email: cleanEmail,
          estado: 'ACTIVO'
        };

        const { error: safeError } = await supabase
          .from('usuarios_scada')
          .upsert(safePayload, { onConflict: 'user' });

        if (safeError) throw safeError;
      } else if (insertError) {
        throw insertError;
      }

      // Vincular autoclaves en asignaciones_equipos
      for (const mac of assignedMacs) {
        try {
          await supabase
            .from('asignaciones_equipos')
            .upsert({
              mac,
              cliente: cleanHospital || 'Clínica Asignada',
              departamento: cleanHospital,
              usuario_asignado: cleanUser,
              updated_at: new Date().toISOString()
            }, { onConflict: 'mac' });
        } catch (_) {}
      }

      setMsg(`¡Usuario [${cleanUser.toUpperCase()}] creado con ${assignedMacs.length} equipo(s) asignado(s)!`);
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
      setErrorMsg('Error al registrar usuario: ' + (err.message || 'Error en Supabase'));
    }
  };

  // Alternar Estado Activo / Suspendido
  const handleToggleStatus = async (userObj) => {
    const username = userObj.user || userObj.usuario;
    if (username === 'superadmin' || username === 'admin') {
      return alert('No puedes suspender la cuenta del Superadministrador.');
    }

    const newStatus = userObj.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    try {
      const matchCol = userObj.user ? 'user' : 'usuario';
      await supabase
        .from('usuarios_scada')
        .update({ estado: newStatus })
        .eq(matchCol, username);

      fetchUsers();
    } catch (_) {
      alert('Error cambiando estado del usuario');
    }
  };

  // Guardar Nueva Contraseña
  const handleSavePassword = async () => {
    if (!resetUser || tempPassword.trim().length < 4) return alert('Mínimo 4 caracteres.');
    const username = resetUser.user || resetUser.usuario;
    const matchCol = resetUser.user ? 'user' : 'usuario';

    try {
      const updateData = {
        pass: tempPassword.trim(),
        password: tempPassword.trim()
      };

      await supabase
        .from('usuarios_scada')
        .update(updateData)
        .eq(matchCol, username);

      alert(`Contraseña de [${username}] actualizada a: ${tempPassword}`);
      setResetUser(null);
      setTempPassword('');
      fetchUsers();
    } catch (_) {
      alert('Error actualizando contraseña');
    }
  };

  // Guardar Asignación Corregida (Vincula y desvincula equipos)
  const handleSaveAssignedDevices = async () => {
    if (!editAssignUser) return;
    const username = (editAssignUser.user || editAssignUser.usuario || '').toLowerCase();
    const newAssignedMacs = Object.keys(editUserDevices).filter((m) => editUserDevices[m]);

    try {
      const matchCol = editAssignUser.user ? 'user' : 'usuario';
      try {
        await supabase
          .from('usuarios_scada')
          .update({ equipos_autorizados: newAssignedMacs.join(',') || null })
          .eq(matchCol, username);
      } catch (_) {}

      // Actualizar asignaciones en cada máquina
      for (const mac of macList) {
        const isNowAssigned = newAssignedMacs.includes(mac);
        const currentAssigned = (fleet[mac]?.meta?.usuario_asignado || '').toLowerCase();

        if (isNowAssigned) {
          await supabase
            .from('asignaciones_equipos')
            .upsert({
              mac,
              usuario_asignado: username,
              updated_at: new Date().toISOString()
            }, { onConflict: 'mac' });
        } else if (currentAssigned === username) {
          // Desvincular si estaba asignado y ahora fue desmarcado
          await supabase
            .from('asignaciones_equipos')
            .update({ usuario_asignado: null, updated_at: new Date().toISOString() })
            .eq('mac', mac);
        }
      }

      alert(`Equipos asignados a [${username}] actualizados.`);
      setEditAssignUser(null);
      fetchUsers();
      if (onFleetUpdated) onFleetUpdated();
    } catch (_) {
      alert('Error guardando asignación');
    }
  };

  const openEditAssignModal = (usr) => {
    setEditAssignUser(usr);
    const username = (usr.user || usr.usuario || '').toLowerCase();
    const authList = (usr.equipos_autorizados || '').toUpperCase().split(',').map((x) => x.trim());
    const initialMap = {};
    macList.forEach((m) => {
      initialMap[m] = authList.includes(m) || (fleet[m]?.meta?.usuario_asignado || '').toLowerCase() === username;
    });
    setEditUserDevices(initialMap);
  };

  const handleDeleteUser = async (userObj) => {
    const username = userObj.user || userObj.usuario;
    if (username === 'superadmin' || username === 'admin') {
      return alert('No puedes eliminar la cuenta raíz de Superadmin.');
    }
    if (!confirm(`¿Eliminar definitivamente al usuario [${username.toUpperCase()}]?`)) return;

    try {
      const matchCol = userObj.user ? 'user' : 'usuario';
      await supabase.from('usuarios_scada').delete().eq(matchCol, username);
      fetchUsers();
    } catch (_) {
      alert('Error eliminando usuario');
    }
  };

  const handleApproveRequest = async (reqUser, roleToAssign = 'OPERADOR') => {
    const username = reqUser.user || reqUser.usuario;
    const matchCol = reqUser.user ? 'user' : 'usuario';
    try {
      await supabase
        .from('usuarios_scada')
        .update({ estado: 'ACTIVO', rol: roleToAssign })
        .eq(matchCol, username);
      fetchUsers();
    } catch (_) {
      alert('Error aprobando solicitud');
    }
  };

  const pendingList = useMemo(() => usersList.filter((u) => u.estado === 'PENDIENTE'), [usersList]);
  const activeList = useMemo(() => usersList.filter((u) => u.estado !== 'PENDIENTE'), [usersList]);

  return (
    <div className="space-y-4 font-mono text-xs select-none">
      
      {/* Cabecera */}
      <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-cyan-400" />
            Centro Maestro de Personal, Roles & Asignación de Flota
          </h2>
          <p className="text-xs text-slate-300 font-sans mt-0.5">
            Gestión de credenciales, roles jerárquicos y aislamiento multi-clínica en Supabase Cloud
          </p>
        </div>

        <div className="flex gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveTab('directorio')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              activeTab === 'directorio' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'bg-slate-900 border border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            👥 Personal ({activeList.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('crear')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              activeTab === 'crear' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'bg-slate-900 border border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            + Crear Usuario & Asignar
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('solicitudes')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              activeTab === 'solicitudes' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'bg-slate-900 border border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Solicitudes ({pendingList.length})</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('bitacora')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              activeTab === 'bitacora' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'bg-slate-900 border border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            🛡️ Bitácora Forense
          </button>
        </div>
      </div>

      {msg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{msg}</span>
          </div>
          <button onClick={() => setMsg('')} className="text-emerald-400 font-bold">X</button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg('')} className="text-rose-400 font-bold">X</button>
        </div>
      )}

      {/* TAB 1: DIRECTORIO */}
      {activeTab === 'directorio' && (
        <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-cyan-400" />
              Directorio de Cuentas y Equipos Vinculados
            </h3>
            <button 
              type="button"
              onClick={fetchUsers} 
              className="px-2.5 py-1 bg-slate-900 border border-slate-700 text-slate-300 rounded-lg hover:text-white"
            >
              🔄 Recargar
            </button>
          </div>

          <div className="rounded-xl border border-slate-800 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/90 text-cyan-400 border-b border-slate-800">
                <tr>
                  <th className="p-3">USUARIO / ID</th>
                  <th className="p-3">NOMBRE</th>
                  <th className="p-3">CORREO</th>
                  <th className="p-3">ROL</th>
                  <th className="p-3">CLÍNICA / HOSPITAL</th>
                  <th className="p-3">AUTOCLAVES ASIGNADOS</th>
                  <th className="p-3">ESTADO</th>
                  <th className="p-3 text-center">ACCIONES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {activeList.map((u) => {
                  const username = u.user || u.usuario;
                  const isActive = u.estado === 'ACTIVO';
                  const isRoot = username === 'superadmin' || username === 'admin';
                  
                  const authMacs = (u.equipos_autorizados || '').toUpperCase().split(',').map((x) => x.trim()).filter(Boolean);
                  const userMacs = macList.filter(m => authMacs.includes(m) || (fleet[m]?.meta?.usuario_asignado || '').toLowerCase() === username.toLowerCase());

                  return (
                    <tr key={username} className="hover:bg-slate-800/40">
                      <td className="p-3 font-bold text-white">
                        <span className="text-cyan-300">{username}</span>
                        {isRoot && <span className="text-[9px] px-1 ml-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">ROOT</span>}
                      </td>
                      <td className="p-3 text-white font-sans">{u.nombre || username}</td>
                      <td className="p-3 text-slate-400">{u.email ? u.email : <span className="italic text-slate-600">Sin correo</span>}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold border border-cyan-500/30 text-cyan-300 bg-cyan-500/10">
                          {u.rol || 'OPERADOR'}
                        </span>
                      </td>
                      <td className="p-3 text-slate-300 font-sans">{u.departamento || <span className="italic text-slate-600">General</span>}</td>
                      
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
                            type="button"
                            onClick={() => { setResetUser(u); setTempPassword(''); }}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg text-xs"
                            title="Cambiar Contraseña"
                          >
                            <Key className="w-3.5 h-3.5" />
                          </button>

                          {!isRoot && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditAssignModal(u)}
                                className="p-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 rounded-lg text-xs"
                                title="Editar Autoclaves Asignados"
                              >
                                <Cpu className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleToggleStatus(u)}
                                className={`p-1.5 rounded-lg border text-xs ${
                                  isActive ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                }`}
                                title={isActive ? 'Suspender Acceso' : 'Activar Acceso'}
                              >
                                <Power className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
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

      {/* TAB 2: ALTA DE USUARIO */}
      {activeTab === 'crear' && (
        <form onSubmit={handleCreateUser} className="ultra-glass p-6 rounded-2xl border border-cyan-500/30 space-y-5">
          <div className="border-b border-cyan-500/20 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-cyan-400" />
              Alta de Usuario & Asignación de Autoclaves
            </h3>
            <p className="text-xs text-slate-300 font-sans mt-0.5">
              Crea la cuenta del operador. El correo es opcional.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-slate-300 mb-1">Nombre de Usuario (ID Único) *</label>
              <input
                type="text"
                required
                value={uUser}
                onChange={(e) => setUUser(e.target.value)}
                placeholder="ej: carlos_ceye"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Nombre Completo del Personal</label>
              <input
                type="text"
                value={uNombre}
                onChange={(e) => setUNombre(e.target.value)}
                placeholder="ej: Lic. Carlos Pérez"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-400 font-sans"
              />
            </div>

            <div>
              <label className="block text-slate-300 mb-1 flex justify-between">
                <span>Correo Electrónico</span>
                <span className="text-[10px] text-cyan-400 font-bold">(Opcional)</span>
              </label>
              <input
                type="email"
                value={uEmail}
                onChange={(e) => setUEmail(e.target.value)}
                placeholder="carlos@hospital.com"
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
                placeholder="ej: BIO-8291"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Jerarquía / Rol en la Plataforma</label>
              <select
                value={uRol}
                onChange={(e) => setURol(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-cyan-300 focus:outline-none focus:border-cyan-400 font-bold"
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
                placeholder="ej: Hospital Central Universitario"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-400 font-sans"
              />
            </div>
          </div>

          {/* ASIGNACIÓN DE AUTOCLAVES */}
          <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-xs font-bold text-cyan-400 block uppercase">
                  Autoclaves Permitidos para este Usuario:
                </span>
                <p className="text-[11px] text-slate-400 font-sans">
                  Marca las casillas de los equipos que podrá ver y operar.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  const allMap = {};
                  macList.forEach((m) => { allMap[m] = true; });
                  setSelectedDevices(allMap);
                }}
                className="px-2 py-1 bg-slate-900 border border-slate-700 text-[10px] text-slate-300 rounded hover:text-white"
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
                        <p className="text-[10px] text-slate-400">{mac}</p>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25"
          >
            <UserPlus className="w-4 h-4" />
            <span>Crear Usuario & Vincular Equipos en la Nube</span>
          </button>
        </form>
      )}

      {/* TAB 3: SOLICITUDES */}
      {activeTab === 'solicitudes' && (
        <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-4">
          <div className="flex justify-between items-center border-b border-cyan-500/20 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              Solicitudes Pendientes ({pendingList.length})
            </h3>
            <button 
              type="button"
              onClick={fetchUsers} 
              className="px-2.5 py-1 bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded-lg hover:text-white"
            >
              🔄 Actualizar
            </button>
          </div>

          {pendingList.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No hay solicitudes pendientes en este momento.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingList.map((req) => (
                <div key={req.user || req.usuario} className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                  <div>
                    <p className="text-sm font-bold text-white">{req.nombre || req.user}</p>
                    <p className="text-xs text-cyan-400">
                      Usuario: <strong>{req.user || req.usuario}</strong> | Correo: {req.email || 'Sin correo'}
                    </p>
                    <p className="text-[11px] text-slate-300 font-sans mt-0.5">Área: {req.departamento || 'General'}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleApproveRequest(req, 'OPERADOR')}
                      className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500 text-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1"
                    >
                      <Check className="w-4 h-4" />
                      <span>Aprobar como Operador</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteUser(req)}
                      className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500 text-rose-300 rounded-lg text-xs"
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

      {/* TAB 4: BITÁCORA */}
      {activeTab === 'bitacora' && (
        <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-4">
          <div className="flex justify-between items-center border-b border-cyan-500/20 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              Auditoría Forense de Accesos
            </h3>
            <button 
              type="button"
              onClick={fetchLogs} 
              className="px-2.5 py-1 bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded-lg hover:text-white"
            >
              🔄 Actualizar
            </button>
          </div>

          <div className="rounded-xl border border-slate-800 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/90 text-cyan-400 border-b border-slate-800">
                <tr>
                  <th className="p-3">FECHA / HORA</th>
                  <th className="p-3">USUARIO</th>
                  <th className="p-3">EVENTO DE SEGURIDAD</th>
                  <th className="p-3">TERMINAL / DISPOSITIVO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {auditLogs.length === 0 ? (
                  <tr><td colSpan="4" className="p-6 text-center text-slate-500">Sin registros forenses recientes.</td></tr>
                ) : (
                  auditLogs.map((l, i) => (
                    <tr key={i} className="hover:bg-slate-800/30">
                      <td className="p-3 text-slate-400">{new Date(l.fecha_hora || l.created_at || Date.now()).toLocaleString()}</td>
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: CAMBIAR CONTRASEÑA (createPortal) */}
      {resetUser && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setResetUser(null)}
        >
          <div 
            className="ultra-glass border-2 border-cyan-500 p-5 rounded-2xl max-w-sm w-full space-y-3 font-mono text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="font-bold text-white text-sm">Cambiar Clave: {resetUser.user || resetUser.usuario}</h4>
            <input
              type="text"
              value={tempPassword}
              onChange={(e) => setTempPassword(e.target.value)}
              placeholder="Nueva contraseña..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-400"
            />
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setResetUser(null)}
                className="flex-1 py-2 bg-slate-800 text-slate-300 rounded-lg hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSavePassword}
                className="flex-1 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-lg shadow-md"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL: EDITAR EQUIPOS ASIGNADOS (createPortal) */}
      {editAssignUser && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setEditAssignUser(null)}
        >
          <div 
            className="ultra-glass border-2 border-purple-500/60 p-6 rounded-2xl max-w-lg w-full space-y-4 font-mono text-xs max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-purple-500/30 pb-2">
              <h4 className="font-bold text-white text-sm">
                Autoclaves Autorizados para [{editAssignUser.user || editAssignUser.usuario}]
              </h4>
              <button onClick={() => setEditAssignUser(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-slate-300 font-sans">
              Marca o desmarca los autoclaves autorizados para este operador:
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {macList.map((mac) => {
                const dev = fleet[mac];
                const checked = Boolean(editUserDevices[mac]);

                return (
                  <label
                    key={mac}
                    className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
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
                        <p className="text-[10px] text-slate-400 font-mono">{mac} • {dev?.meta?.cliente || 'Hospital'}</p>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditAssignUser(null)}
                className="flex-1 py-2.5 bg-slate-800 text-slate-300 rounded-xl font-bold hover:text-white"
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
        </div>,
        document.body
      )}
    </div>
  );
}
