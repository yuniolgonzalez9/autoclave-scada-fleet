import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../services/supabase';
import { useSwipe, stepThrough } from '../../hooks/useSwipe';
import SwipeDots from '../common/SwipeDots';

const TAB_ORDER = ['directorio', 'crear', 'solicitudes', 'bitacora'];
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
  Cpu,
  Search,
  RefreshCw,
  Mail,
  Building2,
  Fingerprint,
  LogIn,
  LogOut,
  Timer,
  Lock,
  KeyRound,
  BellRing,
  UserCheck,
  UserX,
  ShieldAlert,
  Activity,
  Monitor,
  Smartphone,
  Tablet,
  ChevronDown
} from 'lucide-react';

const ROLE_STYLES = {
  SUPERADMIN: { label: 'Superadmin', badge: 'text-amber-300 border-amber-500/40 bg-amber-500/10', avatar: 'bg-amber-500/15 border-amber-400/40 text-amber-200' },
  DIRECTOR: { label: 'Director', badge: 'text-purple-300 border-purple-500/40 bg-purple-500/10', avatar: 'bg-purple-500/15 border-purple-400/40 text-purple-200' },
  ADMIN: { label: 'Administrador', badge: 'text-purple-300 border-purple-500/40 bg-purple-500/10', avatar: 'bg-purple-500/15 border-purple-400/40 text-purple-200' },
  TECNICO: { label: 'Técnico biomédico', badge: 'text-sky-300 border-sky-500/40 bg-sky-500/10', avatar: 'bg-sky-500/15 border-sky-400/40 text-sky-200' },
  AUDITOR_CALIDAD: { label: 'Auditor de calidad', badge: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10', avatar: 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200' },
  OPERADOR: { label: 'Operador', badge: 'text-cyan-300 border-cyan-500/40 bg-cyan-500/10', avatar: 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200' },
  CLIENTE: { label: 'Cliente / Enfermería', badge: 'text-slate-300 border-slate-500/40 bg-slate-500/10', avatar: 'bg-slate-500/15 border-slate-400/40 text-slate-200' }
};

const TONES = {
  emerald: { dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]', icon: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30', text: 'text-emerald-300' },
  rose: { dot: 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.7)]', icon: 'text-rose-300 bg-rose-500/10 border-rose-500/30', text: 'text-rose-300' },
  amber: { dot: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]', icon: 'text-amber-300 bg-amber-500/10 border-amber-500/30', text: 'text-amber-300' },
  cyan: { dot: 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.7)]', icon: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30', text: 'text-cyan-300' },
  slate: { dot: 'bg-slate-500', icon: 'text-slate-300 bg-slate-500/10 border-slate-600/40', text: 'text-slate-300' }
};

const EVENT_META = {
  LOGIN_EXITOSO: { label: 'Inicio de sesión', icon: LogIn, tone: 'emerald', cat: 'ACCESO' },
  INICIO_SESION_EXITOSO: { label: 'Inicio de sesión', icon: LogIn, tone: 'emerald', cat: 'ACCESO' },
  CIERRE_SESION: { label: 'Cierre de sesión', icon: LogOut, tone: 'slate', cat: 'ACCESO' },
  TIMEOUT_INACTIVIDAD: { label: 'Cierre por inactividad', icon: Timer, tone: 'amber', cat: 'ACCESO' },
  CLAVE_INCORRECTA: { label: 'Contraseña incorrecta', icon: Lock, tone: 'rose', cat: 'SEGURIDAD' },
  CUENTA_SUSPENDIDA: { label: 'Acceso bloqueado (cuenta suspendida)', icon: UserX, tone: 'rose', cat: 'SEGURIDAD' },
  CAMBIO_ESTADO: { label: 'Cambio de estado de cuenta', icon: UserCheck, tone: 'cyan', cat: 'CUENTAS' },
  SOLICITUD_RECUPERACION_PENDIENTE: { label: 'Solicitud de recuperación de clave', icon: KeyRound, tone: 'amber', cat: 'CUENTAS' },
  ACK_TELEGRAM: { label: 'Alarma silenciada desde Telegram', icon: BellRing, tone: 'emerald', cat: 'ALARMAS' },
  PARO_TELEGRAM: { label: 'Paro de emergencia desde Telegram', icon: ShieldAlert, tone: 'rose', cat: 'ALARMAS' },
  PARO_EMERGENCIA: { label: 'Paro de emergencia', icon: ShieldAlert, tone: 'rose', cat: 'ALARMAS' }
};

const LOG_FILTERS = [
  { id: 'TODOS', label: 'Todos' },
  { id: 'ACCESO', label: 'Accesos' },
  { id: 'SEGURIDAD', label: 'Seguridad' },
  { id: 'CUENTAS', label: 'Cuentas' },
  { id: 'ALARMAS', label: 'Alarmas' }
];

const LOGS_PAGE = 40;
const DAY_MS = 86400000;

function eventMeta(evento) {
  if (EVENT_META[evento]) return EVENT_META[evento];
  const text = (evento || 'EVENTO').replace(/_/g, ' ').toLowerCase();
  return { label: text.charAt(0).toUpperCase() + text.slice(1), icon: Activity, tone: 'cyan', cat: 'OTROS' };
}

function roleStyle(rol) {
  return ROLE_STYLES[rol] || ROLE_STYLES.OPERADOR;
}

function initialsOf(text) {
  const parts = String(text || '?').trim().split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

function relativeTime(ts) {
  if (!ts) return null;
  const diff = Date.now() - new Date(ts).getTime();
  if (!Number.isFinite(diff)) return null;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `hace ${d} d`;
  return new Date(ts).toLocaleDateString();
}

function dayLabel(ts) {
  const date = new Date(ts);
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (date.getTime() >= startToday) return 'Hoy';
  if (date.getTime() >= startToday - DAY_MS) return 'Ayer';
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

function DeviceIcon({ name, className }) {
  const text = (name || '').toLowerCase();
  const Icon = /ipad|tablet/.test(text) ? Tablet : /android|iphone|móvil|movil|mobile|telegram/.test(text) ? Smartphone : Monitor;
  return <Icon className={className} />;
}

export default function UserManagementView({ fleet = {}, onFleetUpdated }) {
  const [activeTab, setActiveTab] = useState('directorio');
  const rootRef = useRef(null);
  useSwipe(rootRef, {
    onSwipeLeft: () => stepThrough(TAB_ORDER, activeTab, 1, setActiveTab),
    onSwipeRight: () => stepThrough(TAB_ORDER, activeTab, -1, setActiveTab)
  });
  const tabStripRef = useRef(null);
  useEffect(() => {
    const strip = tabStripRef.current;
    const btn = strip?.querySelector(`[data-tab="${activeTab}"]`);
    if (btn) strip.scrollTo({ left: btn.offsetLeft - (strip.clientWidth - btn.offsetWidth) / 2, behavior: 'smooth' });
  }, [activeTab]);
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
        .order('created_at', { ascending: false })
        .limit(300);
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

  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('TODOS');
  const [logFilter, setLogFilter] = useState('TODOS');
  const [logSearch, setLogSearch] = useState('');
  const [logsVisible, setLogsVisible] = useState(LOGS_PAGE);

  const activeCount = useMemo(() => activeList.filter((u) => u.estado === 'ACTIVO').length, [activeList]);
  const suspendedCount = activeList.length - activeCount;
  const rolesPresent = useMemo(() => Array.from(new Set(activeList.map((u) => u.rol || 'OPERADOR'))), [activeList]);

  const lastLoginByUser = useMemo(() => {
    const map = {};
    auditLogs.forEach((l) => {
      if (eventMeta(l.evento).label !== 'Inicio de sesión') return;
      const key = (l.usuario || '').toLowerCase();
      if (key && !map[key]) map[key] = l;
    });
    return map;
  }, [auditLogs]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return activeList
      .filter((u) => roleFilter === 'TODOS' || (u.rol || 'OPERADOR') === roleFilter)
      .filter((u) => !q || [u.user, u.usuario, u.nombre, u.email, u.departamento].some((v) => (v || '').toLowerCase().includes(q)))
      .sort((a, b) => (a.estado === b.estado ? 0 : a.estado === 'ACTIVO' ? -1 : 1));
  }, [activeList, roleFilter, userSearch]);

  const logStats = useMemo(() => {
    const now = Date.now();
    const stats = { logins24: 0, failed7: 0, timeouts7: 0, security: 0, alarms7: 0 };
    auditLogs.forEach((l) => {
      const age = now - new Date(l.created_at).getTime();
      const meta = eventMeta(l.evento);
      if (age <= DAY_MS && meta.label === 'Inicio de sesión') stats.logins24 += 1;
      if (age > 7 * DAY_MS) return;
      if (meta.cat === 'SEGURIDAD') { stats.failed7 += 1; stats.security += 1; }
      if (l.evento === 'TIMEOUT_INACTIVIDAD') stats.timeouts7 += 1;
      if (meta.cat === 'ALARMAS') stats.alarms7 += 1;
    });
    return stats;
  }, [auditLogs]);

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return auditLogs
      .filter((l) => logFilter === 'TODOS' || eventMeta(l.evento).cat === logFilter)
      .filter((l) => !q || [l.usuario, l.detalles, l.dispositivo, l.evento, eventMeta(l.evento).label].some((v) => (v || '').toLowerCase().includes(q)));
  }, [auditLogs, logFilter, logSearch]);

  const logGroups = useMemo(() => {
    const groups = [];
    filteredLogs.slice(0, logsVisible).forEach((l) => {
      const label = dayLabel(l.created_at);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(l);
      else groups.push({ label, items: [l] });
    });
    return groups;
  }, [filteredLogs, logsVisible]);

  useEffect(() => { setLogsVisible(LOGS_PAGE); }, [logFilter, logSearch]);


  return (
    <div ref={rootRef} className="user-management-view space-y-4 font-mono text-xs select-none">
      
      {/* Cabecera */}
      <div className="ultra-glass rounded-2xl border border-cyan-500/30 overflow-hidden">
        <div className="p-4 sm:p-5 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-gradient-to-r from-cyan-500/10 via-transparent to-purple-500/10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 shrink-0 rounded-xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center shadow-[0_0_18px_rgba(34,211,238,0.25)]">
              <Fingerprint className="w-6 h-6 text-cyan-300" />
            </div>
            <div>
              <p className="text-[10px] tracking-[0.25em] text-cyan-400/80 uppercase">Control de personal</p>
              <h2 className="text-base sm:text-lg font-bold text-white font-sans">Personal y seguridad forense</h2>
              <p className="text-[11px] text-slate-400 font-sans">Cuentas, roles, equipos asignados y trazabilidad de accesos</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full lg:w-auto">
            {[
              { label: 'Activos', value: activeCount, tone: 'text-emerald-300', onClick: () => setActiveTab('directorio') },
              { label: 'Suspendidos', value: suspendedCount, tone: suspendedCount ? 'text-rose-300' : 'text-slate-400', onClick: () => setActiveTab('directorio') },
              { label: 'Solicitudes', value: pendingList.length, tone: pendingList.length ? 'text-amber-300' : 'text-slate-400', onClick: () => setActiveTab('solicitudes') },
              { label: 'Alertas 7 días', value: logStats.security, tone: logStats.security ? 'text-rose-300' : 'text-slate-400', onClick: () => setActiveTab('bitacora') }
            ].map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={s.onClick}
                className="min-w-[96px] px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-cyan-500/40 text-left transition-colors"
              >
                <span className={`block text-lg font-bold leading-tight ${s.tone}`}>{s.value}</span>
                <span className="block text-[10px] text-slate-400 font-sans">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div ref={tabStripRef} className="px-2 sm:px-3 border-t border-slate-800/80 relative flex gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {[
            { id: 'directorio', label: 'Personal', icon: Users, count: activeList.length },
            { id: 'crear', label: 'Nuevo usuario', icon: UserPlus },
            { id: 'solicitudes', label: 'Solicitudes', icon: Clock, count: pendingList.length, alert: pendingList.length > 0 },
            { id: 'bitacora', label: 'Bitácora forense', icon: ShieldCheck }
          ].map((tab) => {
            const TabIcon = tab.icon;
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                data-tab={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative shrink-0 px-3 py-3 flex items-center gap-2 font-sans text-xs font-semibold transition-colors ${
                  selected ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <TabIcon className={`w-4 h-4 ${selected ? 'text-cyan-300' : ''}`} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className={`min-w-[18px] px-1.5 rounded-full text-[10px] font-bold leading-[18px] text-center ${
                    tab.alert ? 'bg-amber-400 text-slate-950' : selected ? 'bg-cyan-500/20 text-cyan-200' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {tab.count}
                  </span>
                )}
                {selected && <span className="absolute left-2 right-2 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 shadow-[0_0_10px_rgba(34,211,238,0.8)]" />}
              </button>
            );
          })}
        </div>
        <SwipeDots count={TAB_ORDER.length} index={TAB_ORDER.indexOf(activeTab)} className="py-2 sm:hidden" />
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
        <div className="space-y-3">
          <div className="ultra-glass p-3 rounded-2xl border border-slate-800 flex flex-col md:flex-row gap-2 md:items-center">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Buscar por usuario, nombre, correo o clínica"
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl py-2.5 pl-9 pr-3 text-white font-sans text-xs focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {['TODOS', ...rolesPresent].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoleFilter(r)}
                  className={`shrink-0 px-3 py-2 rounded-xl border font-sans text-[11px] font-semibold transition-colors ${
                    roleFilter === r ? 'bg-cyan-500/15 border-cyan-400/60 text-cyan-200' : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {r === 'TODOS' ? 'Todos los roles' : roleStyle(r).label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => { fetchUsers(); fetchLogs(); }}
              className="shrink-0 px-3 py-2 rounded-xl bg-slate-950/50 border border-slate-800 text-slate-300 hover:text-white flex items-center justify-center gap-1.5 font-sans text-[11px]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Recargar
            </button>
          </div>

          {filteredUsers.length === 0 ? (
            <div className="ultra-glass p-10 rounded-2xl border border-slate-800 text-center font-sans">
              <Users className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-300">{loading ? 'Cargando personal…' : 'No hay cuentas que coincidan.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
              {filteredUsers.map((u) => {
                const username = u.user || u.usuario;
                const isActive = u.estado === 'ACTIVO';
                const isRoot = username === 'superadmin' || username === 'admin';
                const role = roleStyle(u.rol);
                const authMacs = (u.equipos_autorizados || '').toUpperCase().split(',').map((x) => x.trim()).filter(Boolean);
                const userMacs = macList.filter((m) => authMacs.includes(m) || (fleet[m]?.meta?.usuario_asignado || '').toLowerCase() === username.toLowerCase());
                const lastLogin = lastLoginByUser[username.toLowerCase()];

                return (
                  <div
                    key={username}
                    className={`ultra-glass rounded-2xl border p-4 flex flex-col gap-3 transition-colors ${
                      isActive ? 'border-slate-800 hover:border-cyan-500/40' : 'border-rose-500/30'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-11 h-11 shrink-0 rounded-xl border flex items-center justify-center font-bold text-sm font-sans ${role.avatar} ${isActive ? '' : 'grayscale opacity-60'}`}>
                        {initialsOf(u.nombre || username)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-bold text-white font-sans truncate">{u.nombre || username}</p>
                          {isRoot && <span className="text-[9px] px-1.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">ROOT</span>}
                        </div>
                        <p className="text-[11px] text-cyan-300 truncate">@{username}</p>
                        <p className="text-[11px] text-slate-500 font-sans truncate flex items-center gap-1">
                          <Mail className="w-3 h-3 shrink-0" />
                          {u.email || 'Sin correo'}
                        </p>
                      </div>
                      <span className={`shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold border ${
                        isActive ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                        {isActive ? 'Activo' : 'Suspendido'}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 font-sans">
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold border ${role.badge}`}>{role.label}</span>
                      <span className="px-2 py-0.5 rounded-lg text-[10px] border border-slate-700 bg-slate-900/60 text-slate-300 flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        {u.departamento || 'General'}
                      </span>
                    </div>

                    <div className="rounded-xl bg-slate-950/50 border border-slate-800/80 p-3 space-y-2.5 font-sans">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Equipos asignados</p>
                        {isRoot ? (
                          <span className="text-[11px] text-amber-300 font-semibold">Toda la flota</span>
                        ) : userMacs.length === 0 ? (
                          <span className="text-[11px] text-slate-500 italic">Sin equipos asignados</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {userMacs.map((m) => (
                              <span key={m} className="px-2 py-0.5 rounded-md text-[10px] bg-cyan-950/70 border border-cyan-500/30 text-cyan-200">
                                {fleet[m]?.meta?.alias || m.slice(-4)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Último acceso</p>
                        {lastLogin ? (
                          <p className="text-[11px] text-slate-300 flex items-center gap-1.5">
                            <DeviceIcon name={lastLogin.dispositivo} className="w-3.5 h-3.5 text-slate-400" />
                            <span>{relativeTime(lastLogin.created_at)}</span>
                            <span className="text-slate-500 truncate">· {lastLogin.dispositivo || 'Navegador web'}</span>
                          </p>
                        ) : (
                          <p className="text-[11px] text-slate-500 italic">Sin accesos recientes registrados</p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1 font-sans">
                      <button
                        type="button"
                        onClick={() => { setResetUser(u); setTempPassword(''); }}
                        className="flex-1 min-w-[90px] px-2.5 py-2 rounded-xl bg-slate-900/70 border border-slate-700 text-cyan-200 hover:border-cyan-400/60 text-[11px] font-semibold flex items-center justify-center gap-1.5"
                      >
                        <Key className="w-3.5 h-3.5" />
                        Clave
                      </button>
                      {!isRoot && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditAssignModal(u)}
                            className="flex-1 min-w-[90px] px-2.5 py-2 rounded-xl bg-purple-500/10 border border-purple-500/40 text-purple-200 hover:bg-purple-500/20 text-[11px] font-semibold flex items-center justify-center gap-1.5"
                          >
                            <Cpu className="w-3.5 h-3.5" />
                            Equipos
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(u)}
                            className={`flex-1 min-w-[90px] px-2.5 py-2 rounded-xl border text-[11px] font-semibold flex items-center justify-center gap-1.5 ${
                              isActive ? 'bg-rose-500/10 border-rose-500/40 text-rose-200 hover:bg-rose-500/20' : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/20'
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                            {isActive ? 'Suspender' : 'Activar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u)}
                            className="px-2.5 py-2 rounded-xl bg-slate-900/70 border border-slate-700 text-slate-400 hover:text-rose-300 hover:border-rose-500/50"
                            title="Eliminar usuario"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 font-sans">
            {[
              { label: 'Inicios de sesión (24 h)', value: logStats.logins24, icon: LogIn, tone: 'emerald' },
              { label: 'Accesos fallidos o bloqueados (7 d)', value: logStats.failed7, icon: ShieldAlert, tone: logStats.failed7 ? 'rose' : 'slate' },
              { label: 'Cierres por inactividad (7 d)', value: logStats.timeouts7, icon: Timer, tone: logStats.timeouts7 ? 'amber' : 'slate' },
              { label: 'Acciones de alarma (7 d)', value: logStats.alarms7, icon: BellRing, tone: logStats.alarms7 ? 'cyan' : 'slate' }
            ].map((k) => {
              const KIcon = k.icon;
              return (
                <div key={k.label} className="ultra-glass rounded-2xl border border-slate-800 p-3 flex items-center gap-3">
                  <div className={`w-9 h-9 shrink-0 rounded-xl border flex items-center justify-center ${TONES[k.tone].icon}`}>
                    <KIcon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-white leading-tight">{k.value}</p>
                    <p className="text-[10px] text-slate-400 leading-tight">{k.label}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="ultra-glass p-3 rounded-2xl border border-slate-800 flex flex-col md:flex-row gap-2 md:items-center">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder="Buscar por usuario, equipo, dispositivo o detalle"
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl py-2.5 pl-9 pr-3 text-white font-sans text-xs focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {LOG_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setLogFilter(f.id)}
                  className={`shrink-0 px-3 py-2 rounded-xl border font-sans text-[11px] font-semibold transition-colors ${
                    logFilter === f.id ? 'bg-cyan-500/15 border-cyan-400/60 text-cyan-200' : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={fetchLogs}
              className="shrink-0 px-3 py-2 rounded-xl bg-slate-950/50 border border-slate-800 text-slate-300 hover:text-white flex items-center justify-center gap-1.5 font-sans text-[11px]"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Actualizar
            </button>
          </div>

          <div className="ultra-glass rounded-2xl border border-slate-800 p-3 sm:p-4">
            {logGroups.length === 0 ? (
              <div className="p-8 text-center font-sans">
                <ShieldCheck className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-300">Sin eventos para este filtro.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {logGroups.map((group) => (
                  <div key={group.label}>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-sans mb-2 flex items-center gap-2">
                      <span className="capitalize">{group.label}</span>
                      <span className="h-px flex-1 bg-slate-800" />
                      <span>{group.items.length}</span>
                    </p>
                    <div className="relative ml-2 pl-5 border-l border-slate-800 space-y-2">
                      {group.items.map((l) => {
                        const meta = eventMeta(l.evento);
                        const tone = TONES[meta.tone];
                        const EIcon = meta.icon;
                        return (
                          <div key={l.id ?? `${l.created_at}-${l.evento}`} className="relative">
                            <span className={`absolute -left-[25px] top-4 w-2.5 h-2.5 rounded-full ring-4 ring-slate-950 ${tone.dot}`} />
                            <div className="rounded-xl bg-slate-950/50 border border-slate-800/80 hover:border-slate-700 p-3 flex gap-3 transition-colors">
                              <div className={`w-8 h-8 shrink-0 rounded-lg border flex items-center justify-center ${tone.icon}`}>
                                <EIcon className="w-4 h-4" />
                              </div>
                              <div className="min-w-0 flex-1 font-sans">
                                <div className="flex items-start justify-between gap-2">
                                  <p className={`text-xs font-semibold ${tone.text}`}>{meta.label}</p>
                                  <span className="shrink-0 text-[10px] text-slate-500 font-mono" title={new Date(l.created_at).toLocaleString()}>
                                    {new Date(l.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                                <p className="text-[11px] text-white mt-0.5">
                                  <span className="font-semibold">{l.usuario || 'Desconocido'}</span>
                                  {l.rol && <span className={`ml-1.5 px-1.5 rounded text-[9px] border ${roleStyle(l.rol).badge}`}>{roleStyle(l.rol).label}</span>}
                                </p>
                                {l.detalles && <p className="text-[11px] text-slate-400 mt-0.5 break-words">{l.detalles}</p>}
                                <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                                  <DeviceIcon name={l.dispositivo} className="w-3 h-3" />
                                  {l.dispositivo || 'Navegador web'}
                                  <span>· {relativeTime(l.created_at)}</span>
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {filteredLogs.length > logsVisible && (
                  <button
                    type="button"
                    onClick={() => setLogsVisible((n) => n + LOGS_PAGE)}
                    className="w-full py-2.5 rounded-xl border border-slate-800 bg-slate-950/50 text-slate-300 hover:text-white font-sans text-xs flex items-center justify-center gap-1.5"
                  >
                    <ChevronDown className="w-4 h-4" />
                    Ver más ({filteredLogs.length - logsVisible} restantes)
                  </button>
                )}
              </div>
            )}
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
