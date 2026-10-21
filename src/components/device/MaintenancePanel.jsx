import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, ClipboardCheck, Gauge, Pencil, Plus, Save, Timer, Trash2, Wrench, X } from 'lucide-react';
import {
  DEFAULT_PLANES, TIPOS_SERVICIO, cycleDurationMinutes, fetchMaintenanceLog, mergeDeviceConfig,
  planIdFromEntry, registerMaintenance, stripPlanTag, updateDeviceRow
} from '../../services/deviceService';

const DAY = 86400000;
const field = 'w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-cyan-400';

function OdometerDigits({ value, digits = 6 }) {
  const str = String(Math.max(0, Math.floor(value))).padStart(digits, '0');
  return (
    <div className="flex gap-1" aria-label={`${value} ciclos`}>
      {str.split('').map((d, i) => (
        <span key={i} className="w-7 h-10 sm:w-8 sm:h-11 rounded-md bg-gradient-to-b from-slate-800 via-slate-950 to-slate-800 border border-slate-600 flex items-center justify-center text-lg sm:text-xl font-bold font-mono text-white shadow-inner">
          {d}
        </span>
      ))}
    </div>
  );
}

function planStatus(plan, log, historicos) {
  const last = log.find((e) => planIdFromEntry(e) === plan.id);
  if (plan.modo === 'CICLOS') {
    const base = last ? Number(last.ciclos_al_momento || 0) : 0;
    const used = Math.max(0, historicos - base);
    const pct = Math.min(100, Math.round((used / Math.max(1, plan.intervalo)) * 100));
    return { last, pct, label: `${used} / ${plan.intervalo} ciclos`, due: used >= plan.intervalo, soon: pct >= 80 };
  }
  if (!last) return { last: null, pct: 100, label: 'Nunca registrado', due: true, soon: true };
  const next = new Date(new Date(last.created_at).getTime() + plan.intervalo * DAY);
  const daysLeft = Math.ceil((next - Date.now()) / DAY);
  const pct = Math.min(100, Math.round(((plan.intervalo - daysLeft) / Math.max(1, plan.intervalo)) * 100));
  return {
    last, pct, next,
    label: daysLeft < 0 ? `Vencido hace ${-daysLeft} d` : daysLeft === 0 ? 'Vence hoy' : `Faltan ${daysLeft} d (${next.toLocaleDateString()})`,
    due: daysLeft <= 0, soon: pct >= 80
  };
}

export default function MaintenancePanel({ device, odometer, stats, canEdit, operatorName, sendCommand, onDeviceUpdated }) {
  const meta = device?.meta || {};
  const tipo = (meta.tipo || 'AUTOCLAVE').toUpperCase();
  const { ciclos, historicos, limite, alertaPct } = odometer;
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [limits, setLimits] = useState(null);
  const [planEdit, setPlanEdit] = useState(null);
  const [busy, setBusy] = useState(false);

  const plans = useMemo(() => (Array.isArray(meta.plan_mantenimiento) && meta.plan_mantenimiento.length ? meta.plan_mantenimiento : DEFAULT_PLANES[tipo] || []), [meta.plan_mantenimiento, tipo]);

  const load = useCallback(async () => {
    setLoading(true);
    try { setLog(await fetchMaintenanceLog(device.mac)); setError(''); } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [device.mac]);
  useEffect(() => { load(); }, [load]);

  const insights = useMemo(() => {
    const since = Date.now() - 30 * DAY;
    const recent = stats.filter((r) => new Date(r.created_at).getTime() >= since).length;
    const perDay = recent / 30;
    const remaining = Math.max(0, limite - ciclos);
    const minutes = stats.map(cycleDurationMinutes).filter((v) => v !== null).reduce((a, b) => a + b, 0);
    return {
      perDay,
      remaining,
      eta: perDay > 0 ? new Date(Date.now() + (remaining / perDay) * DAY) : null,
      hours: minutes / 60,
      lastService: log[0]?.created_at || meta.ultimo_mantenimiento || null
    };
  }, [stats, limite, ciclos, log, meta.ultimo_mantenimiento]);

  const pct = Math.min(100, Math.round((ciclos / Math.max(1, limite)) * 100));
  const tone = pct >= 100 ? 'rose' : pct >= alertaPct ? 'amber' : 'emerald';
  const toneBar = { rose: 'bg-rose-500', amber: 'bg-amber-400', emerald: 'bg-emerald-400' }[tone];
  const toneText = { rose: 'text-rose-300', amber: 'text-amber-300', emerald: 'text-emerald-300' }[tone];

  const openForm = (plan = null) => setForm({
    tipo_servicio: plan?.tipo_servicio || 'PREVENTIVO',
    tecnico_responsable: operatorName || '',
    descripcion: plan ? plan.nombre : '',
    plan_id: plan?.id || '',
    reiniciarOdometro: !plan
  });

  const submitMaintenance = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { row } = await registerMaintenance({ mac: device.mac, ...form, plan_id: form.plan_id || null, ciclos_al_momento: historicos });
      if (form.reiniciarOdometro) sendCommand?.(device.mac, { cmd: 'RESET_ODOMETRO' });
      if (row) onDeviceUpdated?.(row);
      setForm(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const saveLimits = async () => {
    setBusy(true);
    try {
      const row = await updateDeviceRow(device.mac, { limite_mantenimiento: Number(limits.limite), alerta_porcentaje: Number(limits.alerta) });
      await mergeDeviceConfig(device.mac, { lim_mant: Number(limits.limite), alerta_pct: Number(limits.alerta) });
      sendCommand?.(device.mac, { cmd: 'SET_CONFIG', cfg: { lim_mant: Number(limits.limite), alerta_pct: Number(limits.alerta) } });
      if (row) onDeviceUpdated?.(row);
      setLimits(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const savePlans = async (next) => {
    setBusy(true);
    try {
      const row = await updateDeviceRow(device.mac, { plan_mantenimiento: next });
      if (row) onDeviceUpdated?.(row);
      setPlanEdit(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-[11px] text-rose-300">Error: {error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <div className="lg:col-span-3 rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-950 to-slate-900 p-4 space-y-4">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Odómetro total del equipo</span>
              <div className="mt-1.5"><OdometerDigits value={historicos} /></div>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Horas de operación</span>
              <p className="text-xl font-bold font-mono text-cyan-300">{insights.hours.toFixed(1)} h</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-300 font-sans">Ciclos desde el último servicio</span>
              <span className={`font-bold font-mono ${toneText}`}>{ciclos} / {limite} · {pct}%</span>
            </div>
            <div className="relative h-3 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
              <div className={`h-full ${toneBar} transition-all`} style={{ width: `${pct}%` }} />
              <span className="absolute top-0 bottom-0 w-0.5 bg-white/60" style={{ left: `${alertaPct}%` }} title={`Aviso al ${alertaPct}%`} />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-2"><span className="block text-slate-500">Restantes</span><span className="font-bold text-white font-mono">{insights.remaining}</span></div>
            <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-2"><span className="block text-slate-500">Ritmo (30 d)</span><span className="font-bold text-white font-mono">{insights.perDay.toFixed(1)}/día</span></div>
            <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-2"><span className="block text-slate-500">Servicio estimado</span><span className="font-bold text-white font-mono">{insights.eta ? insights.eta.toLocaleDateString() : '—'}</span></div>
            <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-2"><span className="block text-slate-500">Último servicio</span><span className="font-bold text-white font-mono">{insights.lastService ? new Date(insights.lastService).toLocaleDateString() : '—'}</span></div>
          </div>

          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => openForm()} className="px-3 py-2 rounded-xl bg-cyan-500 text-slate-950 text-[11px] font-bold flex items-center gap-1.5"><Wrench className="w-3.5 h-3.5" />Registrar servicio</button>
              <button type="button" onClick={() => setLimits({ limite, alerta: alertaPct })} className="px-3 py-2 rounded-xl border border-slate-700 text-slate-300 text-[11px] font-bold flex items-center gap-1.5"><Gauge className="w-3.5 h-3.5" />Límite y aviso</button>
            </div>
          )}

          {limits && (
            <div className="rounded-xl border border-cyan-500/30 bg-slate-950/70 p-3 grid grid-cols-2 gap-2 items-end">
              <label className="text-[11px] text-slate-400">Límite de ciclos<input type="number" min="1" className={field} value={limits.limite} onChange={(e) => setLimits({ ...limits, limite: e.target.value })} /></label>
              <label className="text-[11px] text-slate-400">Aviso al (%)<input type="number" min="10" max="99" className={field} value={limits.alerta} onChange={(e) => setLimits({ ...limits, alerta: e.target.value })} /></label>
              <button type="button" onClick={() => setLimits(null)} className="py-2 rounded-lg border border-slate-700 text-slate-300 text-[11px] font-bold">Cancelar</button>
              <button type="button" disabled={busy} onClick={saveLimits} className="py-2 rounded-lg bg-emerald-500 text-slate-950 text-[11px] font-bold flex items-center justify-center gap-1"><Save className="w-3.5 h-3.5" />Guardar</button>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-slate-700 bg-slate-950/50 p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5"><CalendarClock className="w-4 h-4 text-cyan-400" />Planes de mantenimiento</span>
            {canEdit && <button type="button" onClick={() => setPlanEdit({ id: '', nombre: '', modo: 'DIAS', intervalo: 30, tipo_servicio: 'PREVENTIVO' })} className="p-1.5 rounded-lg border border-slate-700 text-cyan-300" aria-label="Nuevo plan"><Plus className="w-3.5 h-3.5" /></button>}
          </div>
          {!plans.length && <p className="text-[11px] text-slate-500 font-sans">Sin planes adicionales. Añade uno con el botón +.</p>}
          {plans.map((plan) => {
            const st = planStatus(plan, log, historicos);
            return (
              <div key={plan.id} className={`rounded-xl border p-2.5 space-y-1.5 ${st.due ? 'border-rose-500/40 bg-rose-500/5' : st.soon ? 'border-amber-500/40' : 'border-slate-800'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="block text-[11px] font-bold text-white truncate">{plan.nombre}</span>
                    <span className={`block text-[10px] ${st.due ? 'text-rose-300' : st.soon ? 'text-amber-300' : 'text-slate-400'}`}>
                      Cada {plan.intervalo} {plan.modo === 'CICLOS' ? 'ciclos' : 'días'} · {st.label}
                    </span>
                  </div>
                  <div className="flex gap-0.5 shrink-0">
                    {canEdit && <button type="button" onClick={() => openForm(plan)} className="p-1 rounded hover:bg-white/10 text-emerald-300" aria-label="Registrar"><ClipboardCheck className="w-3.5 h-3.5" /></button>}
                    {canEdit && <button type="button" onClick={() => setPlanEdit(plan)} className="p-1 rounded hover:bg-white/10 text-slate-300" aria-label="Editar plan"><Pencil className="w-3.5 h-3.5" /></button>}
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden"><div className={`h-full ${st.due ? 'bg-rose-500' : st.soon ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${st.pct}%` }} /></div>
              </div>
            );
          })}
        </div>
      </div>

      {planEdit && (
        <div className="rounded-2xl border border-cyan-500/30 bg-slate-950/70 p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
          <label className="col-span-2 text-[11px] text-slate-400">Nombre del plan<input className={field} value={planEdit.nombre} onChange={(e) => setPlanEdit({ ...planEdit, nombre: e.target.value })} placeholder="Ej: Cambio de empaque de puerta" /></label>
          <label className="text-[11px] text-slate-400">Medido por<select className={field} value={planEdit.modo} onChange={(e) => setPlanEdit({ ...planEdit, modo: e.target.value })}><option value="DIAS">Días</option><option value="CICLOS">Ciclos</option></select></label>
          <label className="text-[11px] text-slate-400">Intervalo<input type="number" min="1" className={field} value={planEdit.intervalo} onChange={(e) => setPlanEdit({ ...planEdit, intervalo: Number(e.target.value) })} /></label>
          <label className="col-span-2 text-[11px] text-slate-400">Tipo de servicio<select className={field} value={planEdit.tipo_servicio} onChange={(e) => setPlanEdit({ ...planEdit, tipo_servicio: e.target.value })}>{TIPOS_SERVICIO.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
          <div className="col-span-2 flex gap-2">
            {planEdit.id && <button type="button" onClick={() => savePlans(plans.filter((p) => p.id !== planEdit.id))} className="p-2 rounded-lg border border-rose-500/40 text-rose-300" aria-label="Eliminar plan"><Trash2 className="w-4 h-4" /></button>}
            <button type="button" onClick={() => setPlanEdit(null)} className="flex-1 py-2 rounded-lg border border-slate-700 text-slate-300 text-[11px] font-bold">Cancelar</button>
            <button
              type="button" disabled={busy || !planEdit.nombre.trim()}
              onClick={() => {
                const plan = { ...planEdit, nombre: planEdit.nombre.trim(), id: planEdit.id || `plan_${Date.now().toString(36)}` };
                savePlans(planEdit.id ? plans.map((p) => (p.id === plan.id ? plan : p)) : [...plans, plan]);
              }}
              className="flex-1 py-2 rounded-lg bg-emerald-500 text-slate-950 text-[11px] font-bold disabled:opacity-50"
            >Guardar plan</button>
          </div>
        </div>
      )}

      {form && (
        <form onSubmit={submitMaintenance} className="rounded-2xl border border-emerald-500/30 bg-slate-950/70 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5"><Wrench className="w-4 h-4 text-emerald-400" />Registrar servicio</span>
            <button type="button" onClick={() => setForm(null)} className="p-1 rounded hover:bg-white/10 text-slate-300"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="text-[11px] text-slate-400">Tipo<select className={field} value={form.tipo_servicio} onChange={(e) => setForm({ ...form, tipo_servicio: e.target.value })}>{TIPOS_SERVICIO.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
            <label className="text-[11px] text-slate-400">Plan asociado<select className={field} value={form.plan_id} onChange={(e) => setForm({ ...form, plan_id: e.target.value })}><option value="">Ninguno</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
            <label className="text-[11px] text-slate-400">Técnico<input required className={field} value={form.tecnico_responsable} onChange={(e) => setForm({ ...form, tecnico_responsable: e.target.value })} /></label>
          </div>
          <label className="block text-[11px] text-slate-400">Descripción<textarea rows={3} required className={field} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Qué se revisó, cambió o ajustó" /></label>
          <label className="flex items-center gap-2 text-[11px] text-slate-300"><input type="checkbox" checked={form.reiniciarOdometro} onChange={(e) => setForm({ ...form, reiniciarOdometro: e.target.checked })} />Reiniciar el contador de ciclos de servicio ({ciclos} → 0)</label>
          <button type="submit" disabled={busy} className="w-full py-2.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"><CheckCircle2 className="w-4 h-4" />{busy ? 'Guardando…' : 'Guardar servicio'}</button>
        </form>
      )}

      <div className="space-y-2">
        <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold flex items-center gap-1.5"><Timer className="w-3.5 h-3.5" />Historial de servicios {loading ? '· cargando…' : `(${log.length})`}</span>
        {!loading && !log.length && <div className="p-6 text-center text-slate-500 rounded-xl border border-dashed border-slate-800 font-sans">Aún no hay servicios registrados para este equipo.</div>}
        <ol className="relative border-l border-slate-800 ml-2 space-y-3">
          {log.map((e) => {
            const plan = plans.find((p) => p.id === planIdFromEntry(e));
            return (
              <li key={e.id} className="ml-4">
                <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee]" />
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-[10px]">
                    <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-bold">{e.tipo_servicio}</span>
                    {plan && <span className="px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 font-bold">{plan.nombre}</span>}
                    <span className="text-slate-400">{new Date(e.created_at).toLocaleString()}</span>
                    <span className="text-slate-500">· ciclo {e.ciclos_al_momento ?? '—'}</span>
                  </div>
                  <p className="text-[11px] text-slate-200 mt-1 font-sans whitespace-pre-line">{stripPlanTag(e.descripcion) || 'Sin descripción'}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Técnico: {e.tecnico_responsable || '—'}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
