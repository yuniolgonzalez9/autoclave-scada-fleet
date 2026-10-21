import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2, ClipboardList, Clock, FileDown, Pencil, Play, Plus, RefreshCw, Search, Sparkles, Trash2, Wand2, Wrench, X
} from 'lucide-react';
import {
  TIPOS_SERVICIO, cleanMac, deleteServiceReport, fetchServiceReports, folioFromNumero, registerMaintenance, saveServiceReport
} from '../../services/deviceService';
import { computeReportHash, generateServiceReportPdf, serviceDurationText } from '../../services/serviceReportPdf';
import { correctTechnicalText } from '../../utils/textCorrector';
import { mejorarTextoConIA } from '../../services/aiStudioService';

const ESTADOS = [
  { id: 'ALL', label: 'Todos' },
  { id: 'ABIERTO', label: 'Abiertos' },
  { id: 'EN_PROCESO', label: 'En proceso' },
  { id: 'CERRADO', label: 'Cerrados' }
];
const ESTADO_STYLE = {
  ABIERTO: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
  EN_PROCESO: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  CERRADO: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
};
const PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'];
const PRIORIDAD_STYLE = { BAJA: 'text-slate-300', MEDIA: 'text-sky-300', ALTA: 'text-amber-300', CRITICA: 'text-rose-300' };
const ESTADOS_FINALES = ['Operativo', 'Operativo con observaciones', 'Fuera de servicio', 'Requiere repuesto'];
const field = 'w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-cyan-400';

const toLocalInput = (iso) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
const fmt = (iso) => (iso ? new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—');

function deviceSnapshot(dev) {
  const meta = dev?.meta || {};
  return {
    mac: dev.mac,
    equipo_alias: meta.alias || `EQUIPO [${dev.mac.slice(-4)}]`,
    equipo_modelo: meta.modelo || '',
    equipo_tipo: (meta.tipo || 'AUTOCLAVE').toUpperCase(),
    cliente: meta.cliente || '',
    departamento: meta.departamento || '',
    ciclos_al_momento: Number(meta.ciclos_historicos || dev.datos?.cfg?.ciclos || 0)
  };
}

function SmartTextarea({ label, value, onChange, rows = 4, placeholder, contexto }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const runAI = async () => {
    setBusy(true);
    setNote('');
    try {
      onChange(await mejorarTextoConIA(value, contexto));
      setNote('Redactado con IA');
    } catch (e) {
      onChange(correctTechnicalText(value));
      setNote('IA no disponible: se aplicó el corrector local');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400">{label}</span>
        <div className="flex gap-1">
          <button type="button" disabled={!value?.trim()} onClick={() => { onChange(correctTechnicalText(value)); setNote('Texto ordenado'); }} className="px-2 py-1 rounded-md border border-slate-700 text-[10px] font-bold text-slate-300 flex items-center gap-1 disabled:opacity-40"><Wand2 className="w-3 h-3" />Ordenar</button>
          <button type="button" disabled={busy || !value?.trim()} onClick={runAI} className="px-2 py-1 rounded-md border border-violet-500/40 text-[10px] font-bold text-violet-300 flex items-center gap-1 disabled:opacity-40"><Sparkles className={`w-3 h-3 ${busy ? 'animate-spin' : ''}`} />IA</button>
        </div>
      </div>
      <textarea rows={rows} className={`${field} font-sans leading-relaxed`} value={value || ''} onChange={(e) => { setNote(''); onChange(e.target.value); }} placeholder={placeholder} />
      {note && <span className="text-[10px] text-emerald-300">{note}</span>}
    </div>
  );
}

function ReportEditor({ report, devices, fixedMac, operatorName, onClose, onSaved }) {
  const isNew = !report.id;
  const [r, setR] = useState(report);
  const [registrarServicio, setRegistrarServicio] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setR((prev) => ({ ...prev, ...patch }));
  const repuestos = Array.isArray(r.repuestos) ? r.repuestos : [];

  const persist = async (patch = {}, { close = false } = {}) => {
    setBusy(true);
    setError('');
    try {
      let next = { ...r, ...patch };
      if (!next.mac) throw new Error('Selecciona un equipo.');
      if (!next.falla_reportada?.trim()) throw new Error('Describe la falla reportada.');
      if (next.estado === 'CERRADO') {
        if (!next.diagnostico?.trim() || !next.trabajo_realizado?.trim()) throw new Error('Para cerrar, completa el diagnóstico y el trabajo realizado.');
        next = { ...next, repuestos: repuestos.filter((p) => p.descripcion?.trim()) };
      }
      let saved = await saveServiceReport(next);
      if (saved.estado === 'CERRADO') {
        const hash = await computeReportHash(saved);
        if (hash !== saved.hash_certificado) saved = await saveServiceReport({ id: saved.id, hash_certificado: hash });
        if (patch.estado === 'CERRADO' && registrarServicio) {
          await registerMaintenance({
            mac: saved.mac,
            tipo_servicio: saved.tipo_servicio || 'CORRECTIVO',
            tecnico_responsable: saved.tecnico || operatorName,
            descripcion: `${folioFromNumero(saved.numero)} · ${saved.trabajo_realizado}`.slice(0, 1000),
            ciclos_al_momento: saved.ciclos_al_momento
          }).catch(() => {});
        }
      }
      setR(saved);
      onSaved(saved, close);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const startAttention = () => persist({ estado: 'EN_PROCESO', tecnico: r.tecnico || operatorName, inicio_atencion: r.inicio_atencion || new Date().toISOString() });
  const tidyText = () => Object.fromEntries(['falla_reportada', 'diagnostico', 'trabajo_realizado', 'recomendaciones'].map((k) => [k, correctTechnicalText(r[k] || '') || null]));
  const closeReport = () => persist({ ...tidyText(), estado: 'CERRADO', fin_atencion: r.fin_atencion || new Date().toISOString(), cerrado_en: new Date().toISOString(), inicio_atencion: r.inicio_atencion || new Date().toISOString(), tecnico: r.tecnico || operatorName });

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="ultra-glass w-full sm:max-w-3xl h-[92dvh] sm:h-auto sm:max-h-[90dvh] rounded-t-2xl sm:rounded-2xl border border-cyan-500/30 flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-800 shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white truncate">{isNew ? 'Nuevo reporte de servicio' : `${folioFromNumero(r.numero)} · ${r.equipo_alias || r.mac}`}</h3>
            {!isNew && <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded border text-[10px] font-bold ${ESTADO_STYLE[r.estado]}`}>{r.estado.replace('_', ' ')}</span>}
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 overscroll-contain">
          <section className="space-y-3">
            <p className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold">Reporte</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="sm:col-span-3 text-[11px] text-slate-400">Equipo
                <select className={field} disabled={Boolean(fixedMac) || !isNew} value={r.mac || ''} onChange={(e) => { const dev = devices.find((d) => d.mac === e.target.value); set(dev ? deviceSnapshot(dev) : { mac: '' }); }}>
                  <option value="">Selecciona…</option>
                  {devices.map((d) => <option key={d.mac} value={d.mac}>{d.meta?.alias || d.mac} · {d.meta?.cliente || ''}</option>)}
                </select>
              </label>
              <label className="text-[11px] text-slate-400">Prioridad<select className={field} value={r.prioridad} onChange={(e) => set({ prioridad: e.target.value })}>{PRIORIDADES.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
              <label className="text-[11px] text-slate-400">Tipo de servicio<select className={field} value={r.tipo_servicio} onChange={(e) => set({ tipo_servicio: e.target.value })}>{TIPOS_SERVICIO.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
              <label className="text-[11px] text-slate-400">Reportado por<input className={field} value={r.reportado_por || ''} onChange={(e) => set({ reportado_por: e.target.value })} /></label>
            </div>
            <SmartTextarea label="Falla reportada" contexto="Falla reportada por el usuario" value={r.falla_reportada} onChange={(v) => set({ falla_reportada: v })} rows={3} placeholder="Qué síntoma presenta el equipo, desde cuándo, códigos de alarma…" />
          </section>

          {!isNew && (
            <section className="space-y-3">
              <p className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold">Atención técnica</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label className="text-[11px] text-slate-400">Técnico<input className={field} value={r.tecnico || ''} onChange={(e) => set({ tecnico: e.target.value })} /></label>
                <label className="text-[11px] text-slate-400">Inicio<input type="datetime-local" className={field} value={toLocalInput(r.inicio_atencion)} onChange={(e) => set({ inicio_atencion: fromLocalInput(e.target.value) })} /></label>
                <label className="text-[11px] text-slate-400">Fin<input type="datetime-local" className={field} value={toLocalInput(r.fin_atencion)} onChange={(e) => set({ fin_atencion: fromLocalInput(e.target.value) })} /></label>
              </div>
              <SmartTextarea label="Diagnóstico" contexto="Diagnóstico técnico" value={r.diagnostico} onChange={(v) => set({ diagnostico: v })} placeholder="Causa encontrada, mediciones, pruebas realizadas…" />
              <SmartTextarea label="Trabajo realizado" contexto="Trabajo realizado por el técnico" value={r.trabajo_realizado} onChange={(v) => set({ trabajo_realizado: v })} placeholder="- Se cambió…&#10;- Se calibró…" />

              <div className="space-y-1.5">
                <div className="flex items-center justify-between"><span className="text-[11px] text-slate-400">Repuestos / materiales</span><button type="button" onClick={() => set({ repuestos: [...repuestos, { descripcion: '', referencia: '', cantidad: 1 }] })} className="px-2 py-1 rounded-md border border-slate-700 text-[10px] font-bold text-cyan-300 flex items-center gap-1"><Plus className="w-3 h-3" />Añadir</button></div>
                {repuestos.map((p, i) => (
                  <div key={i} className="grid grid-cols-[1fr_90px_56px_32px] gap-1.5">
                    <input className={field} placeholder="Descripción" value={p.descripcion} onChange={(e) => set({ repuestos: repuestos.map((x, j) => (j === i ? { ...x, descripcion: e.target.value } : x)) })} />
                    <input className={field} placeholder="Ref." value={p.referencia} onChange={(e) => set({ repuestos: repuestos.map((x, j) => (j === i ? { ...x, referencia: e.target.value } : x)) })} />
                    <input type="number" min="1" className={field} value={p.cantidad} onChange={(e) => set({ repuestos: repuestos.map((x, j) => (j === i ? { ...x, cantidad: Number(e.target.value) } : x)) })} />
                    <button type="button" aria-label="Quitar" onClick={() => set({ repuestos: repuestos.filter((_, j) => j !== i) })} className="rounded-lg border border-slate-700 text-rose-300 flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>

              <SmartTextarea label="Recomendaciones" contexto="Recomendaciones al cliente" value={r.recomendaciones} onChange={(v) => set({ recomendaciones: v })} rows={2} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="text-[11px] text-slate-400">Estado final del equipo<select className={field} value={r.estado_equipo_final || ''} onChange={(e) => set({ estado_equipo_final: e.target.value })}><option value="">—</option>{ESTADOS_FINALES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
                <label className="text-[11px] text-slate-400">Recibido por (cliente)<input className={field} value={r.recibido_por || ''} onChange={(e) => set({ recibido_por: e.target.value })} /></label>
              </div>
              {r.estado !== 'CERRADO' && <label className="flex items-center gap-2 text-[11px] text-slate-300"><input type="checkbox" checked={registrarServicio} onChange={(e) => setRegistrarServicio(e.target.checked)} />Al cerrar, registrar en el historial de mantenimiento del equipo</label>}
            </section>
          )}
          {error && <p className="text-[11px] text-rose-300">{error}</p>}
        </div>

        <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-slate-800 shrink-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          {isNew ? (
            <button type="button" disabled={busy} onClick={() => persist({}, { close: true })} className="flex-1 py-2.5 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold disabled:opacity-50">{busy ? 'Guardando…' : 'Crear reporte'}</button>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={() => persist()} className="flex-1 min-w-[120px] py-2.5 rounded-xl border border-slate-700 text-slate-200 text-xs font-bold disabled:opacity-50">Guardar</button>
              {r.estado === 'ABIERTO' && <button type="button" disabled={busy} onClick={startAttention} className="flex-1 min-w-[120px] py-2.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50"><Play className="w-3.5 h-3.5" />Iniciar atención</button>}
              {r.estado !== 'CERRADO' && <button type="button" disabled={busy} onClick={closeReport} className="flex-1 min-w-[120px] py-2.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50"><CheckCircle2 className="w-3.5 h-3.5" />Cerrar reporte</button>}
              {r.estado === 'CERRADO' && <button type="button" onClick={() => generateServiceReportPdf(r, { emitidoPor: operatorName })} className="flex-1 min-w-[120px] py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-bold flex items-center justify-center gap-1"><FileDown className="w-3.5 h-3.5" />Certificado PDF</button>}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function ServiceReportsView({ fleet = {}, operatorName = '', isAdmin = false, fixedMac = null, embedded = false }) {
  const devices = useMemo(() => Object.values(fleet || {}).filter((d) => d?.mac).sort((a, b) => (a.meta?.alias || a.mac).localeCompare(b.meta?.alias || b.mac)), [fleet]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [estado, setEstado] = useState('ALL');
  const [macFilter, setMacFilter] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await fetchServiceReports({ mac: fixedMac })); setError(''); } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [fixedMac]);
  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => (estado === 'ALL' || r.estado === estado)
      && (!macFilter || r.mac === macFilter)
      && (!q || [folioFromNumero(r.numero), r.equipo_alias, r.falla_reportada, r.tecnico, r.cliente].some((v) => (v || '').toLowerCase().includes(q))));
  }, [rows, estado, macFilter, query]);

  const stats = useMemo(() => {
    const closed = rows.filter((r) => r.estado === 'CERRADO' && r.inicio_atencion && r.fin_atencion);
    const avg = closed.length ? closed.reduce((s, r) => s + (new Date(r.fin_atencion) - new Date(r.inicio_atencion)), 0) / closed.length / 60000 : null;
    return {
      ABIERTO: rows.filter((r) => r.estado === 'ABIERTO').length,
      EN_PROCESO: rows.filter((r) => r.estado === 'EN_PROCESO').length,
      CERRADO: rows.filter((r) => r.estado === 'CERRADO').length,
      avg
    };
  }, [rows]);

  const newReport = () => {
    const dev = devices.find((d) => d.mac === (fixedMac && cleanMac(fixedMac)));
    setEditing({ ...(dev ? deviceSnapshot(dev) : { mac: '' }), prioridad: 'MEDIA', estado: 'ABIERTO', tipo_servicio: 'CORRECTIVO', reportado_por: operatorName, falla_reportada: '', repuestos: [] });
  };

  const onSaved = (saved, close) => {
    setRows((prev) => (prev.some((r) => r.id === saved.id) ? prev.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...prev]));
    setEditing(close ? null : saved);
  };

  const remove = async (r) => {
    if (!window.confirm(`¿Eliminar el reporte ${folioFromNumero(r.numero)}? Esta acción no se puede deshacer.`)) return;
    try { await deleteServiceReport(r.id); setRows((prev) => prev.filter((x) => x.id !== r.id)); } catch (e) { setError(e.message); }
  };

  return (
    <div className="space-y-3 font-mono text-xs">
      {!embedded && (
        <div className="ultra-glass p-4 sm:p-5 rounded-2xl border border-cyan-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2"><ClipboardList className="w-5 h-5 text-cyan-400" />Reportes de servicio técnico</h2>
            <p className="text-[11px] text-slate-400 font-sans mt-0.5">Fallas reportadas, atención de técnicos y certificados PDF</p>
          </div>
          <button type="button" onClick={newReport} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold flex items-center justify-center gap-1.5"><Plus className="w-4 h-4" />Nuevo reporte</button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[['Abiertos', stats.ABIERTO, 'text-rose-300'], ['En proceso', stats.EN_PROCESO, 'text-amber-300'], ['Cerrados', stats.CERRADO, 'text-emerald-300'], ['Tiempo medio', stats.avg === null ? '—' : `${Math.floor(stats.avg / 60)}h ${Math.round(stats.avg % 60)}m`, 'text-cyan-300']].map(([l, v, c]) => (
          <div key={l} className="rounded-xl bg-slate-950/60 border border-slate-800 p-2.5"><span className="block text-[10px] uppercase tracking-wider text-slate-500">{l}</span><span className={`text-lg font-bold ${c}`}>{v}</span></div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex gap-1 p-1 rounded-xl bg-slate-950/70 border border-slate-800 overflow-x-auto" data-no-swipe>
          {ESTADOS.map((e) => <button key={e.id} type="button" onClick={() => setEstado(e.id)} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap ${estado === e.id ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}>{e.label}</button>)}
        </div>
        {!fixedMac && (
          <select className={`${field} sm:w-56`} value={macFilter} onChange={(e) => setMacFilter(e.target.value)}>
            <option value="">Todos los equipos</option>
            {devices.map((d) => <option key={d.mac} value={d.mac}>{d.meta?.alias || d.mac}</option>)}
          </select>
        )}
        <div className="relative flex-1"><Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" /><input className={`${field} pl-8`} placeholder="Buscar folio, falla, técnico…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        <div className="flex gap-2">
          <button type="button" onClick={load} className="px-3 rounded-lg border border-slate-700 text-slate-300" aria-label="Actualizar"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /></button>
          {embedded && <button type="button" onClick={newReport} className="flex-1 px-3 py-2 rounded-lg bg-cyan-500 text-slate-950 font-bold flex items-center justify-center gap-1"><Plus className="w-3.5 h-3.5" />Reportar falla</button>}
        </div>
      </div>

      {error && <p className="text-[11px] text-rose-300">Error: {error}</p>}
      {!loading && !visible.length && <div className="p-8 text-center text-slate-500 rounded-xl border border-dashed border-slate-800 font-sans">No hay reportes {estado !== 'ALL' ? 'con este estado' : 'todavía'}.</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
        {visible.map((r) => (
          <div key={r.id} className="rounded-2xl border border-slate-800 bg-slate-950/55 p-3 space-y-2 hover:border-slate-600 transition">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-cyan-300">{folioFromNumero(r.numero)}</span>
                <span className="block text-xs font-bold text-white truncate">{r.equipo_alias || r.mac}</span>
                <span className="block text-[10px] text-slate-500 truncate">{[r.cliente, r.departamento].filter(Boolean).join(' · ')}</span>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${ESTADO_STYLE[r.estado]}`}>{r.estado.replace('_', ' ')}</span>
                <span className={`text-[10px] font-bold ${PRIORIDAD_STYLE[r.prioridad]}`}>{r.prioridad}</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-300 font-sans line-clamp-2">{r.falla_reportada}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{fmt(r.created_at)}</span>
              {r.tecnico && <span className="flex items-center gap-1"><Wrench className="w-3 h-3" />{r.tecnico}</span>}
              {r.estado === 'CERRADO' && <span>Atención: {serviceDurationText(r)}</span>}
            </div>
            <div className="flex gap-1.5 pt-1">
              <button type="button" onClick={() => setEditing(r)} className="flex-1 py-1.5 rounded-lg border border-slate-700 text-slate-200 text-[11px] font-bold flex items-center justify-center gap-1"><Pencil className="w-3.5 h-3.5" />{r.estado === 'CERRADO' ? 'Ver' : 'Atender'}</button>
              {r.estado === 'CERRADO' && <button type="button" onClick={() => generateServiceReportPdf(r, { emitidoPor: operatorName })} className="flex-1 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/40 text-cyan-200 text-[11px] font-bold flex items-center justify-center gap-1"><FileDown className="w-3.5 h-3.5" />PDF</button>}
              {isAdmin && <button type="button" onClick={() => remove(r)} className="px-2 rounded-lg border border-slate-700 text-rose-300" aria-label="Eliminar"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          </div>
        ))}
      </div>

      {editing && <ReportEditor report={editing} devices={devices} fixedMac={fixedMac} operatorName={operatorName} onClose={() => setEditing(null)} onSaved={onSaved} />}
    </div>
  );
}
