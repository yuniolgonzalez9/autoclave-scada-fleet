import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Save, Search } from 'lucide-react';
import { TIPOS_EQUIPO, fetchCatalog, fetchUsersLite, mergeDeviceConfig, updateDeviceRow } from '../../services/deviceService';

const BOARDS = ['HKL-EA8', 'KC868-A8', 'OLIMEX-EVB', 'LILYGO-TRELAY', 'GENERIC-DIY'];
const field = 'w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-cyan-400 disabled:opacity-60';

function initialState(meta) {
  return {
    alias: meta.alias || '',
    cliente: meta.cliente || '',
    departamento: meta.departamento || '',
    usuario_asignado: meta.usuario_asignado || '',
    tipo: (meta.tipo || meta.config_deseada?.tipo || 'AUTOCLAVE').toUpperCase(),
    marca: meta.marca || meta.config_deseada?.marca || '',
    modelo: meta.modelo || '',
    hardware_rev: meta.hardware_rev || meta.config_deseada?.hardware_rev || 'HKL-EA8'
  };
}

export default function DeviceConfigPanel({ device, canEdit, sendCommand, onDeviceUpdated }) {
  const meta = device?.meta || {};
  const [form, setForm] = useState(() => initialState(meta));
  const [catalog, setCatalog] = useState([]);
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setForm(initialState(device?.meta || {})), 0);
    return () => clearTimeout(t);
  }, [device?.mac]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchCatalog().then(setCatalog).catch(() => {});
    fetchUsersLite().then(setUsers).catch(() => {});
  }, []);

  const set = (patch) => { setMsg(''); setForm((f) => ({ ...f, ...patch })); };
  const ofType = useMemo(() => catalog.filter((c) => c.tipo === form.tipo), [catalog, form.tipo]);
  const marcas = useMemo(() => [...new Set(ofType.map((c) => c.marca))], [ofType]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ofType.filter((c) => (!form.marca || c.marca === form.marca) && (!q || `${c.marca} ${c.modelo}`.toLowerCase().includes(q)));
  }, [ofType, form.marca, query]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const fields = { ...form, alias: form.alias.trim() || `EQUIPO [${device.mac.slice(-4)}]` };
      const row = await updateDeviceRow(device.mac, fields);
      if (!row) throw new Error('El equipo no está registrado en asignaciones_equipos. Regístralo primero en Gestión.');
      const config_deseada = await mergeDeviceConfig(device.mac, { tipo: fields.tipo, marca: fields.marca, modelo: fields.modelo, hardware_rev: fields.hardware_rev });
      sendCommand?.(device.mac, { cmd: 'APPLY_HARDWARE_PROVISION', mac: device.mac, alias: fields.alias, cliente: fields.cliente, tipo: fields.tipo, hardware_rev: fields.hardware_rev, modelo: fields.modelo });
      onDeviceUpdated?.({ ...row, config_deseada });
      setMsg('Configuración guardada y enviada al equipo.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <fieldset disabled={!canEdit} className="space-y-4 min-w-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-[11px] text-slate-400">Nombre / alias<input className={field} value={form.alias} onChange={(e) => set({ alias: e.target.value })} /></label>
          <label className="text-[11px] text-slate-400">Clínica / hospital<input className={field} value={form.cliente} onChange={(e) => set({ cliente: e.target.value })} /></label>
          <label className="text-[11px] text-slate-400">Departamento / área<input className={field} value={form.departamento} onChange={(e) => set({ departamento: e.target.value })} placeholder="Ej: CEYE, Quirófano 2" /></label>
          <label className="text-[11px] text-slate-400">Responsable asignado
            <select className={field} value={form.usuario_asignado} onChange={(e) => set({ usuario_asignado: e.target.value })}>
              <option value="">Sin asignar</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.nombre} · {u.rol}</option>)}
            </select>
          </label>
        </div>

        <div className="space-y-2">
          <span className="text-[11px] text-slate-400">Tipo de equipo</span>
          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar" data-no-swipe>
            {TIPOS_EQUIPO.map((t) => (
              <button key={t.id} type="button" onClick={() => set({ tipo: t.id, marca: '', modelo: '' })} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap border ${form.tipo === t.id ? 'bg-cyan-500 text-slate-950 border-cyan-400' : 'border-slate-700 text-slate-300'}`}>{t.label}</button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-white">Catálogo de modelos ({ofType.length})</span>
            <span className="text-[10px] text-slate-500">Seleccionado: <span className="text-cyan-300 font-bold">{form.modelo || '—'}</span></span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select className={field} value={form.marca} onChange={(e) => set({ marca: e.target.value })}>
              <option value="">Todas las marcas</option>
              {marcas.map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
            </select>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              <input className={`${field} pl-8`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar modelo" />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 pr-1">
            {matches.map((c) => {
              const active = form.modelo === c.modelo && form.marca === c.marca;
              return (
                <button key={c.id} type="button" onClick={() => set({ marca: c.marca, modelo: c.modelo })} className={`text-left px-2.5 py-2 rounded-lg border text-[11px] ${active ? 'border-cyan-400 bg-cyan-500/15 text-cyan-100' : 'border-slate-800 text-slate-300 hover:border-slate-600'}`}>
                  <span className="block font-bold truncate">{c.modelo}</span>
                  <span className="block text-[10px] text-slate-500">{c.marca.replace(/_/g, ' ')}</span>
                </button>
              );
            })}
            {!matches.length && <p className="text-[11px] text-slate-500 col-span-full font-sans">No hay modelos en el catálogo para este filtro. Puedes escribirlo abajo.</p>}
          </div>
          <label className="block text-[11px] text-slate-400">Modelo (manual)<input className={field} value={form.modelo} onChange={(e) => set({ modelo: e.target.value })} /></label>
        </div>

        <label className="block text-[11px] text-slate-400">Placa controladora
          <select className={field} value={form.hardware_rev} onChange={(e) => set({ hardware_rev: e.target.value })}>
            {BOARDS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
      </fieldset>

      {error && <p className="text-[11px] text-rose-300">{error}</p>}
      {msg && <p className="text-[11px] text-emerald-300 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />{msg}</p>}
      {canEdit ? (
        <button type="submit" disabled={saving} className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"><Save className="w-4 h-4" />{saving ? 'Guardando…' : 'Guardar configuración'}</button>
      ) : (
        <p className="text-[11px] text-slate-500 font-sans">Solo técnicos y administradores pueden cambiar la configuración.</p>
      )}
    </form>
  );
}
