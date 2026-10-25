import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  ChevronRight, 
  Clock, 
  RefreshCw, 
  Thermometer,
  Layers,
  Calendar
} from 'lucide-react';
import { 
  cycleDurationMinutes, 
  fetchCycles, 
  isCycleConforme,
  cleanMac
} from '../../services/deviceService';

const PERIODS = [
  { id: '7', label: '7 días' },
  { id: '30', label: '30 días' },
  { id: '90', label: '90 días' },
  { id: 'ALL', label: 'Histórico Completo' }
];

const PAGE_SIZE = 20;

export default function CycleHistoryPanel({ mac, stats = [], onInspect }) {
  const [period, setPeriod] = useState('30');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const normalizedMac = useMemo(() => {
    return cleanMac(mac || '');
  }, [mac]);

  const desde = useMemo(() => {
    if (period === 'ALL') return null;
    const days = Number(period) || 30;
    return new Date(Date.now() - days * 86400000).toISOString();
  }, [period]);

  const load = useCallback(async (offset = 0) => {
    if (!normalizedMac) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetchCycles(normalizedMac, { limit: PAGE_SIZE, offset, desde });
      const newRows = res && Array.isArray(res.rows) ? res.rows : [];
      const newTotal = res && typeof res.total === 'number' ? res.total : newRows.length;

      setRows((prev) => (offset > 0 ? [...prev, ...newRows] : newRows));
      setTotal(newTotal);
    } catch (e) {
      setError(e.message || 'Error cargando historial de ciclos.');
    } finally {
      setLoading(false);
    }
  }, [normalizedMac, desde]);

  useEffect(() => { 
    load(0); 
  }, [load]);

  // Métricas estadísticas del periodo seleccionado
  const periodStats = useMemo(() => {
    const safeStats = Array.isArray(stats) ? stats : [];
    const inRange = desde ? safeStats.filter((r) => r.created_at >= desde) : safeStats;
    const conformes = inRange.filter(isCycleConforme).length;
    
    const durations = inRange
      .map(cycleDurationMinutes)
      .filter((v) => typeof v === 'number' && !isNaN(v) && v > 0);

    const totalAlarmas = inRange.reduce((sum, r) => sum + (Number(r.conteo_alarmas) || 0), 0);

    return {
      total: inRange.length,
      pct: inRange.length > 0 ? Math.round((conformes / inRange.length) * 100) : null,
      alarmas: totalAlarmas,
      promedio: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null
    };
  }, [stats, desde]);

  // Agrupación de ciclos por fecha
  const groups = useMemo(() => {
    const map = new Map();

    rows.forEach((r) => {
      const dateVal = new Date(r.created_at || r.fecha || Date.now());
      const dayLabel = isNaN(dateVal.getTime()) 
        ? 'Fecha no especificada' 
        : dateVal.toLocaleDateString('es-ES', { 
            weekday: 'long', 
            day: 'numeric', 
            month: 'long', 
            year: 'numeric' 
          });

      if (!map.has(dayLabel)) {
        map.set(dayLabel, []);
      }
      map.get(dayLabel).push(r);
    });

    return [...map.entries()];
  }, [rows]);

  return (
    <div className="space-y-3 font-mono text-xs select-none">
      
      {/* Controles de Periodo y Refresco */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1 p-1 rounded-xl bg-slate-950/70 border border-slate-800">
          {PERIODS.map((p) => {
            const active = period === p.id;
            return (
              <button 
                key={p.id} 
                type="button" 
                onClick={() => setPeriod(p.id)} 
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                  active 
                    ? 'bg-cyan-500 text-slate-950 shadow' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <button 
          type="button" 
          onClick={() => load(0)} 
          disabled={loading}
          className="px-3 py-1.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white text-[11px] font-bold flex items-center gap-1.5 transition-all disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* Tarjetas KPI de Conformidad */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          ['Ciclos Ejecutados', periodStats.total, 'text-white'],
          [
            'Conformidad ISO', 
            periodStats.pct === null ? '—' : `${periodStats.pct}%`, 
            periodStats.pct === null || periodStats.pct >= 95 ? 'text-emerald-300' : 'text-amber-300'
          ],
          ['Alarmas Registradas', periodStats.alarmas, periodStats.alarmas > 0 ? 'text-rose-300' : 'text-emerald-300'],
          ['Duración Media', periodStats.promedio === null ? '—' : `${periodStats.promedio} min`, 'text-cyan-300']
        ].map(([label, val, cls]) => (
          <div key={label} className="rounded-xl bg-slate-950/60 border border-slate-800 p-2.5">
            <span className="block text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
            <span className={`text-lg font-bold font-mono ${cls}`}>{val}</span>
          </div>
        ))}
      </div>

      {error && (
        <div className="p-3 bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs rounded-xl flex items-center gap-2 font-sans">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !rows.length && !error && (
        <div className="p-8 text-center text-slate-500 rounded-xl border border-dashed border-slate-800 font-sans">
          No existen expedientes de esterilización registrados para este equipo en el periodo seleccionado.
        </div>
      )}

      {/* Lista de Ciclos Agrupados por Jornada */}
      <div className="space-y-4">
        {groups.map(([day, list]) => (
          <div key={day} className="space-y-1.5">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-400 font-bold sticky top-0 bg-[#030712]/90 py-1 backdrop-blur-md z-10">
              <Calendar className="w-3.5 h-3.5 text-cyan-400" />
              <span>{day} ({list.length} ciclos)</span>
            </div>

            {list.map((r) => {
              const ok = isCycleConforme(r);
              const dur = cycleDurationMinutes(r);
              const tMax = parseFloat(r.temp_max || 0);
              const pMax = parseFloat(r.pres_max || 0);
              const numAlarmas = Number(r.conteo_alarmas) || 0;

              return (
                <button
                  key={r.session_id || r.id} 
                  type="button" 
                  onClick={() => onInspect && onInspect(r)}
                  className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border bg-slate-950/50 hover:bg-slate-900/80 transition-all ${
                    ok ? 'border-emerald-500/25 hover:border-emerald-500/50' : 'border-rose-500/40 hover:border-rose-500/70'
                  }`}
                >
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
                  }`}>
                    {ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  </span>

                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-bold text-white truncate">
                      {(r.diagnostico_principal || 'Ciclo de Esterilización').replace(/^[^\p{L}\p{N}]+/u, '')}
                    </span>

                    <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-400 mt-0.5 font-mono">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>
                          {r.hora_encendido || new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {r.hora_apagado ? ` ➔ ${r.hora_apagado}` : ''}
                          {dur ? ` · ${Math.round(dur)} min` : ''}
                        </span>
                      </span>

                      <span className="flex items-center gap-1">
                        <Thermometer className="w-3 h-3 text-cyan-400" />
                        <span>{tMax.toFixed(1)}°C · {pMax.toFixed(2)} bar</span>
                      </span>

                      <span>Ciclo #{r.ciclos_acumulados ?? '—'}</span>

                      {numAlarmas > 0 && (
                        <span className="text-rose-300 font-bold">
                          {numAlarmas} alarma{numAlarmas === 1 ? '' : 's'}
                        </span>
                      )}
                    </span>
                  </span>

                  <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Botón de Paginación */}
      {rows.length < total && (
        <button 
          type="button" 
          onClick={() => load(rows.length)} 
          disabled={loading} 
          className="w-full py-2.5 rounded-xl border border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-300 text-[11px] font-bold disabled:opacity-40 transition-all"
        >
          {loading ? 'Consultando más registros...' : `Cargar más expedientes (${total - rows.length} pendientes)`}
        </button>
      )}
    </div>
  );
}
