import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, Clock, RefreshCw, Thermometer } from 'lucide-react';
import { cycleDurationMinutes, fetchCycles, isCycleConforme } from '../../services/deviceService';

const PERIODS = [
  { id: '7', label: '7 días' },
  { id: '30', label: '30 días' },
  { id: '90', label: '90 días' },
  { id: 'ALL', label: 'Todo' }
];
const PAGE = 20;

export default function CycleHistoryPanel({ mac, stats, onInspect }) {
  const [period, setPeriod] = useState('30');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const desde = useMemo(() => (period === 'ALL' ? null : new Date(Date.now() - Number(period) * 86400000).toISOString()), [period]);

  const load = useCallback(async (offset = 0) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchCycles(mac, { limit: PAGE, offset, desde });
      setRows((prev) => (offset ? [...prev, ...res.rows] : res.rows));
      setTotal(res.total);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [mac, desde]);

  useEffect(() => { load(0); }, [load]);

  const periodStats = useMemo(() => {
    const inRange = desde ? stats.filter((r) => r.created_at >= desde) : stats;
    const conformes = inRange.filter(isCycleConforme).length;
    const durations = inRange.map(cycleDurationMinutes).filter((v) => v !== null);
    return {
      total: inRange.length,
      pct: inRange.length ? Math.round((conformes / inRange.length) * 100) : null,
      alarmas: inRange.reduce((s, r) => s + Number(r.conteo_alarmas || 0), 0),
      promedio: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null
    };
  }, [stats, desde]);

  const groups = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => {
      const day = new Date(r.created_at).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      if (!map.has(day)) map.set(day, []);
      map.get(day).push(r);
    });
    return [...map.entries()];
  }, [rows]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1 p-1 rounded-xl bg-slate-950/70 border border-slate-800">
          {PERIODS.map((p) => (
            <button key={p.id} type="button" onClick={() => setPeriod(p.id)} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${period === p.id ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}>{p.label}</button>
          ))}
        </div>
        <button type="button" onClick={() => load(0)} className="px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-[11px] font-bold flex items-center gap-1"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />Actualizar</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          ['Ciclos', periodStats.total, 'text-white'],
          ['Conformidad', periodStats.pct === null ? '—' : `${periodStats.pct}%`, periodStats.pct === null || periodStats.pct >= 95 ? 'text-emerald-300' : 'text-amber-300'],
          ['Alarmas', periodStats.alarmas, periodStats.alarmas ? 'text-rose-300' : 'text-emerald-300'],
          ['Duración media', periodStats.promedio === null ? '—' : `${periodStats.promedio} min`, 'text-cyan-300']
        ].map(([label, val, cls]) => (
          <div key={label} className="rounded-xl bg-slate-950/60 border border-slate-800 p-2.5">
            <span className="block text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
            <span className={`text-lg font-bold font-mono ${cls}`}>{val}</span>
          </div>
        ))}
      </div>

      {error && <p className="text-[11px] text-rose-300">No se pudo cargar el historial: {error}</p>}
      {!loading && !rows.length && !error && (
        <div className="p-8 text-center text-slate-500 rounded-xl border border-dashed border-slate-800 font-sans">Sin ciclos registrados en este periodo.</div>
      )}

      <div className="space-y-4">
        {groups.map(([day, list]) => (
          <div key={day} className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold sticky top-0">{day}</p>
            {list.map((r) => {
              const ok = isCycleConforme(r);
              const dur = cycleDurationMinutes(r);
              return (
                <button
                  key={r.session_id || r.id} type="button" onClick={() => onInspect(r)}
                  className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border bg-slate-950/50 hover:bg-slate-900/80 transition ${ok ? 'border-emerald-500/25' : 'border-rose-500/40'}`}
                >
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                    {ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-bold text-white truncate">{(r.diagnostico_principal || 'Ciclo registrado').replace(/^[^\p{L}\p{N}]+/u, '')}</span>
                    <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-400 mt-0.5">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{r.hora_encendido || new Date(r.created_at).toLocaleTimeString()}{r.hora_apagado ? ` → ${r.hora_apagado}` : ''}{dur ? ` · ${Math.round(dur)} min` : ''}</span>
                      <span className="flex items-center gap-1"><Thermometer className="w-3 h-3" />{Number(r.temp_max || 0).toFixed(1)}°C · {Number(r.pres_max || 0).toFixed(2)} bar</span>
                      <span>Ciclo #{r.ciclos_acumulados ?? '—'}</span>
                      {Number(r.conteo_alarmas) > 0 && <span className="text-rose-300">{r.conteo_alarmas} alarmas</span>}
                    </span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {rows.length < total && (
        <button type="button" onClick={() => load(rows.length)} disabled={loading} className="w-full py-2 rounded-xl border border-slate-700 text-slate-300 text-[11px] font-bold disabled:opacity-50">
          {loading ? 'Cargando…' : `Ver más (${total - rows.length} restantes)`}
        </button>
      )}
    </div>
  );
}
