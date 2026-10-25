import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, RotateCcw, Save, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { WALLPAPERS_LIST } from '../common/GearMenu';
import { adminAccountRequest } from '../../services/adminAccounts';

const DEFAULT_APPEARANCE = { theme: 'tactical', background: 'circuit-pcb', opacity: 82 };
const ROLES = ['OPERADOR', 'CLIENTE', 'TECNICO', 'AUDITOR_CALIDAD', 'ADMIN', 'DIRECTOR', 'SUPERADMIN'];
const STATUSES = ['PENDIENTE', 'ACTIVO', 'INACTIVO', 'SUSPENDIDO'];

function appearanceFor(profile) {
  return { ...DEFAULT_APPEARANCE, ...(profile.appearance_override || {}) };
}

export default function AuthUserManagementView({ profile }) {
  const [profiles, setProfiles] = useState([]);
  const [appearanceDrafts, setAppearanceDrafts] = useState({});
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [contactEmail, setContactEmail] = useState(profile?.email || '');
  const [authEmail, setAuthEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [role, setRole] = useState('OPERADOR');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingUserId, setSavingUserId] = useState('');
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const { profiles: loadedProfiles } = await adminAccountRequest({ action: 'list_profiles' });
      setProfiles(loadedProfiles);
      setAppearanceDrafts(Object.fromEntries(loadedProfiles.map((item) => [item.user_id, appearanceFor(item)])));
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const handleInvite = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    setErrorMessage('');
    try {
      await adminAccountRequest({
        action: 'invite_profile',
        username,
        displayName,
        contactEmail,
        authEmail: authEmail || undefined,
        department,
        role,
        authorizedDevices: []
      });
      setMessage('Invitación enviada. La cuenta queda pendiente hasta que complete el acceso.');
      setUsername('');
      setDisplayName('');
      setAuthEmail('');
      setDepartment('');
      setRole('OPERADOR');
      await loadProfiles();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const updateProfile = async (target, changes) => {
    setSavingUserId(target.user_id);
    setErrorMessage('');
    setMessage('');
    try {
      await adminAccountRequest({ action: 'update_profile', userId: target.user_id, ...changes });
      setMessage(`Cuenta ${target.username} actualizada.`);
      await loadProfiles();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setSavingUserId('');
    }
  };

  const setAppearanceField = (userId, key, value) => {
    setAppearanceDrafts((current) => ({
      ...current,
      [userId]: { ...(current[userId] || DEFAULT_APPEARANCE), [key]: value }
    }));
  };

  const saveAppearance = async (target, overrides) => {
    setSavingUserId(target.user_id);
    setErrorMessage('');
    setMessage('');
    try {
      await adminAccountRequest({
        action: 'set_appearance_override',
        userId: target.user_id,
        overrides
      });
      setMessage(overrides.theme || overrides.background || overrides.opacity !== undefined
        ? `Personalización guardada para ${target.username}.`
        : `Se retiró la personalización de ${target.username}.`);
      await loadProfiles();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setSavingUserId('');
    }
  };

  return (
    <div className="auth-user-management space-y-4 font-mono text-xs">
      <header className="ultra-glass p-4 sm:p-5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-cyan-400" />
            Cuentas y preferencias
          </h2>
          <p className="mt-1 text-[11px] text-slate-400 font-sans">
            El contacto puede ser compartido; Auth usa un alias único por cuenta.
          </p>
        </div>
        <button type="button" onClick={loadProfiles} className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/70 text-slate-300 hover:text-white">
          Actualizar lista
        </button>
      </header>

      {message && <div role="status" className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">{message}</div>}
      {errorMessage && <div role="alert" className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300">{errorMessage}</div>}

      <form onSubmit={handleInvite} className="ultra-glass p-4 sm:p-5 rounded-xl space-y-4">
        <h3 className="font-bold text-white flex items-center gap-2"><UserPlus className="w-4 h-4 text-cyan-400" /> Invitar usuario</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          <label className="space-y-1 text-slate-300">Nombre de usuario
            <input required minLength={3} maxLength={40} value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} className="auth-admin-input" autoComplete="off" />
          </label>
          <label className="space-y-1 text-slate-300">Nombre visible
            <input required value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="auth-admin-input" autoComplete="name" />
          </label>
          <label className="space-y-1 text-slate-300">Correo de contacto
            <input required type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} className="auth-admin-input" autoComplete="email" />
          </label>
          <label className="space-y-1 text-slate-300">Email de acceso único (opcional para Gmail)
            <input type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} className="auth-admin-input" autoComplete="off" placeholder="Vacío: alias en el buzón de contacto" />
          </label>
          <label className="space-y-1 text-slate-300">Departamento
            <input value={department} onChange={(event) => setDepartment(event.target.value)} className="auth-admin-input" />
          </label>
          <label className="space-y-1 text-slate-300">Rol inicial
            <select value={role} onChange={(event) => setRole(event.target.value)} className="auth-admin-input">
              {ROLES.filter((item) => item !== 'SUPERADMIN').map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <p className="text-[10px] leading-relaxed text-slate-500 font-sans">
          La persona recibirá una invitación para establecer su propia contraseña. No se guarda ni se envía una contraseña temporal.
        </p>
        <button type="submit" disabled={submitting} className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-cyan-500 text-slate-950 font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          Enviar invitación
        </button>
      </form>

      <section className="ultra-glass p-4 sm:p-5 rounded-xl space-y-4">
        <h3 className="font-bold text-white flex items-center gap-2"><Users className="w-4 h-4 text-cyan-400" /> Directorio Auth ({profiles.length})</h3>
        {loading ? (
          <div className="py-8 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Cargando cuentas</div>
        ) : profiles.length === 0 ? (
          <div className="py-8 text-center text-slate-400">Aún no hay cuentas Auth. La primera debe crearse en Supabase y activarse como superadministrador.</div>
        ) : (
          <div className="space-y-3">
            {profiles.map((item) => {
              const draft = appearanceDrafts[item.user_id] || appearanceFor(item);
              const isSaving = savingUserId === item.user_id;
              return (
                <article key={item.user_id} className="auth-admin-user rounded-xl border border-slate-700/70 bg-slate-950/30 p-3 sm:p-4 space-y-4">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-white truncate">{item.display_name} <span className="text-slate-500">@{item.username}</span></p>
                      <p className="mt-1 break-all text-slate-400">Acceso: {item.auth_email}</p>
                      <p className="break-all text-slate-400">Contacto: {item.contact_email}</p>
                      <p className="mt-1 text-[10px] text-slate-500">{item.department || 'Sin departamento'} · {item.authorized_devices?.length || 0} equipos</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full lg:w-auto">
                      <select value={item.role} onChange={(event) => updateProfile(item, { role: event.target.value })} className="auth-admin-input" aria-label={`Rol de ${item.username}`}>
                        {ROLES.map((itemRole) => <option key={itemRole} value={itemRole}>{itemRole}</option>)}
                      </select>
                      <select value={item.status} onChange={(event) => updateProfile(item, { status: event.target.value })} className="auth-admin-input" aria-label={`Estado de ${item.username}`}>
                        {STATUSES.map((itemStatus) => <option key={itemStatus} value={itemStatus}>{itemStatus}</option>)}
                      </select>
                      <button type="button" disabled={isSaving} onClick={() => updateProfile(item, { contactEmail: item.contact_email })} className="px-3 py-2 rounded-lg border border-slate-700 text-slate-300 hover:text-white disabled:opacity-50 inline-flex justify-center items-center gap-2">
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                        Guardar perfil
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-slate-800 pt-3 space-y-3">
                    <div>
                      <p className="text-[11px] font-bold text-white">Personalización administrada</p>
                      <p className="text-[10px] text-slate-500">Este override prevalece sobre las preferencias propias del usuario.</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <label className="space-y-1 text-slate-400">Tema
                        <select value={draft.theme} onChange={(event) => setAppearanceField(item.user_id, 'theme', event.target.value)} className="auth-admin-input">
                          <option value="tactical">Tactical</option><option value="cyber">Cyber</option><option value="hybrid">Hybrid</option>
                        </select>
                      </label>
                      <label className="space-y-1 text-slate-400">Fondo
                        <select value={draft.background} onChange={(event) => setAppearanceField(item.user_id, 'background', event.target.value)} className="auth-admin-input">
                          {WALLPAPERS_LIST.map((wallpaper) => <option key={wallpaper.id} value={wallpaper.id}>{wallpaper.name}</option>)}
                        </select>
                      </label>
                      <label className="space-y-1 text-slate-400">Transparencia: {draft.opacity}%
                        <input type="range" min="0" max="100" value={draft.opacity} onChange={(event) => setAppearanceField(item.user_id, 'opacity', Number(event.target.value))} className="w-full accent-cyan-400" />
                      </label>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button type="button" disabled={isSaving} onClick={() => saveAppearance(item, draft)} className="px-3 py-2 rounded-lg bg-cyan-500 text-slate-950 font-bold disabled:opacity-50 inline-flex justify-center items-center gap-2">
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Guardar personalización
                      </button>
                      <button type="button" disabled={isSaving} onClick={() => saveAppearance(item, {})} className="px-3 py-2 rounded-lg border border-slate-700 text-slate-300 hover:text-white disabled:opacity-50 inline-flex justify-center items-center gap-2">
                        <RotateCcw className="w-4 h-4" /> Usar preferencias del usuario
                      </button>
                      <span className="self-center text-[10px] text-slate-500">{item.appearance_override_updated_at ? 'Override activo' : 'Sin override'}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
