import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { 
  CalendarClock, 
  CheckCircle2, 
  ClipboardCheck, 
  Gauge, 
  Pencil, 
  Plus, 
  Save, 
  Timer, 
  Trash2, 
  Wrench, 
  X,
  AlertTriangle,
  Clock
} from 'lucide-react';
import {
  DEFAULT_PLANES, 
  TIPOS_SERVICIO, 
  cycleDurationMinutes, 
  fetchMaintenanceLog, 
  mergeDeviceConfig,
  planIdFromEntry, 
  registerMaintenance, 
  stripPlanTag, 
  updateDeviceRow
} from '../../services/deviceService';

const DAY = 86400000;
const field = 'w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-cyan-400 font-mono';

function OdometerDigits({ value, digits = 6 }) {
  const safeNumber = Math.max(0, Math.floor(Number(value) || 0));
  const str = String(safeNumber).padStart(digits, '0');
  
  return (
    <div className="flex gap-1 select-none" aria-label={`${safeNumber} ciclos registrados`}>
      {str.split('').map((d, i) => (
        <span 
          key={i} 
          className="w-7 h-10 sm:w-8 sm:h-11 rounded-md bg-gradient-to-b from-slate-800 via-slate-950 to-slate-800 border border-slate-600 flex items-center justify-center text-lg sm:text-xl font-bold font-mono text-white shadow-inner"
        >
          {d}
        </span>
      ))}
    </div>
  );
}

function planStatus(plan, log, historicos) {
  const last = log.find((e) => planIdFromEntry(e) === plan.id);
  
  if (plan.modo === 'CICLOS') {
    const base = last ? Math.max(0, Number(last.ciclos_al_momento) || 0) : 0;
    const intervalSafe = Math.max(1, Number(plan.intervalo) || 100);
    const used = Math.max(0, historicos - base);
    const pct = Math.min(100, Math.round((used / intervalSafe) * 100));
    
    return { 
      last, 
      pct, 
      label: `${used} / ${intervalSafe} ciclos`, 
      due: used >= intervalSafe, 
      soon: pct >= 80 
    };
  }

  // Modo DÍAS
  if (!last || !last.created_at) {
    return { 
      last: null, 
      pct: 100, 
      label: 'Sin registro previo', 
      due: true, 
      soon: true 
    };
  }

  const lastTime = new Date(last.created_at).getTime();
  if (isNaN(lastTime)) {
    return { 
      last: null, 
      pct: 100, 
      label: 'Fecha previa no válida', 
      due: true, 
      soon: true 
    };
  }

  const intervalDays = Math.max(1, Number(plan.intervalo) || 30);
  const next = new Date(lastTime + intervalDays * DAY);
  const daysLeft = Math.ceil((next.getTime() - Date.now()) / DAY);
  const pct = Math.max(0, Math.min(100, Math.round(((intervalDays - daysLeft) / intervalDays) * 100)));

  return {
    last, 
    pct, 
    next,
    label: daysLeft < 0 ? `Vencido hace ${-daysLeft} d` : daysLeft === 0 ? 'Vence hoy' : `Faltan ${daysLeft} d (${next.toLocaleDateString()})`,
    due: daysLeft <= 0, 
    soon: pct >= 80
  };
}

export default function MaintenancePanel({ 
  device, 
  odometer, 
  stats = [], 
  canEdit, 
  operatorName, 
  sendCommand, 
  onDeviceUpdated 
}) {
  const meta = device?.meta || {};
  const tipo = (meta.tipo || 'AUTOCLAVE').toUpperCase();
  const { ciclos = 0, historicos = 0, limite = 200, alertaPct = 80 } = odometer || {};

  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [limits, setLimits] = useState(null);
  const [planEdit, setPlanEdit] = useState(null);
  const [busy, setBusy] = useState(false);

  const cleanMac = useMemo(() => {
    return (device?.mac || '').toUpperCase().replace(/[:\-]/g, '');
  }, [device?.mac]);

  const plans = useMemo(() => {
    if (Array.isArray(meta.plan_mantenimiento) && meta.plan_mantenimiento.length > 0) {
      return meta.plan_mantenimiento;
    }
    return DEFAULT_PLANES[tipo] || DEFAULT_PLANES.AUTOCLAVE || [];
  }, [meta.plan_mantenimiento, tipo]);

  const load = useCallback(async () => {
    if (!cleanMac) return;
    setLoading(true);
    try { 
      const entries = await fetchMaintenanceLog(cleanMac);
      setLog(Array.isArray(entries) ? entries : []); 
      setError(''); 
    } catch (e) { 
      setError(e.message || 'Error cargando bitácora de mantenimiento.'); 
    } finally { 
      setLoading(false); 
    }
  }, [cleanMac]);

  useEffect(() => { 
    load(); 
  }, [load]);

  const insights = useMemo(() => {
    const safeStats = Array.isArray(stats) ? stats : [];
    const since = Date.now() - 30 * DAY;
    
    const recent = safeStats.filter((r) => {
      const t = new Date(r.created_at).getTime();
      return !isNaN(t) && t >= since;
    }).length;

    const perDay = recent / 30;
    const remaining = Math.max(0, limite - ciclos);
    
    const minutes = safeStats
      .map(cycleDurationMinutes)
      .filter((v) => typeof v === 'number' && !isNaN(v))
      .reduce((a, b) => a + b, 0);

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

  const openForm = (plan = null) => {
    setForm({
      tipo_servicio: plan?.tipo_servicio || 'PREVENTIVO',
      tecnico_responsable: operatorName || '',
      descripcion: plan ? `Ejecución de plan: ${plan.nombre}` : '',
      plan_id: plan?.id || '',
      reiniciarOdometro: !plan
    });
  };

  const submitMaintenance = async (e) => {
    e.preventDefault();
    if (!cleanMac) return;

    setBusy(true);
    setError('');

    try {
      const { row } = await registerMaintenance({ 
        mac: cleanMac, 
        ...form, 
        plan_id: form.plan_id || null, 
        ciclos_al_momento: historicos 
      });

      if (form.reiniciarOdometro && sendCommand) {
        sendCommand(cleanMac, { cmd: 'RESET_ODOMETRO' });
      }

      if (row) {
        onDeviceUpdated?.(row);
      }

      setForm(null);
      await load();
    } catch (err) {
      setError(err.message || 'Error registrando el servicio.');
    } finally {
      setBusy(false);
    }
  };

  const saveLimits = async () => {
    if (!cleanMac) return;

    const parsedLimite = Math.max(10, parseInt(limits.limite, 10) || 300);
    const parsedAlerta = Math.max(10, Math.min(99, parseInt(limits.alerta, 10) || 80));

    setBusy(true);
    setError('');

    try {
      const row = await updateDeviceRow(cleanMac, { 
        limite_mantenimiento: parsedLimite, 
        alerta_porcentaje: parsedAlerta 
      });

      await mergeDeviceConfig(cleanMac, { 
        lim_mant: parsedLimite, 
        alerta_pct: parsedAlerta 
      });

      if (sendCommand) {
        sendCommand(cleanMac, { 
          cmd: 'SET_CONFIG', 
          cfg: { lim_mant: parsedLimite, alerta_pct: parsedAlerta } 
        });
      }

      if (row) {
        onDeviceUpdated?.(row);
      }

      setLimits(null);
    } catch (err) {
      setError(err.message || 'Error actualizando límites de mantenimiento.');
    } finally {
      setBusy(false);
    }
  };

  const savePlans = async (nextPlans) => {
    if (!cleanMac) return;

    setBusy(true);
    setError('');

    try {
      const row = await updateDeviceRow(cleanMac, { plan_mantenimiento: nextPlans });
      if (row) {
        onDeviceUpdated?.(row);
      }
      setPlanEdit(null);
    } catch (err) {
      setError(err.message || 'Error actualizando planes de mantenimiento.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 font-mono text-xs select-none">
      {error && (
        <div className="p-3 bg-rose-500/15 border border-rose-500/40 text-rose-300 rounded-xl flex items-center gap-2 font-sans">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        {/* Odómetro Principal */}
        <div className="lg:col-span-3 rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-950 to-slate-900 p-4 sm:p-5 space-y-4 shadow-xl">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block">
                Odómetro Acumulado Total (Vida Útil)
              </span>
              <div className="mt-2">
                <OdometerDigits value={historicos} />
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block">
                Tiempo de Operación
              </span>
              <p className="text-xl sm:text-2xl font-bold font-mono text-cyan-300 mt-1">
                {insights.hours.toFixed(1)} <span className="text-xs font-normal text-slate-400">horas</span>
              </p>
            </div>
          </div>

          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-300 font-sans">Ciclos desde la última intervención técnica:</span>
              <span className={`font-bold font-mono ${toneText}`}>
                {ciclos} / {limite} ({pct}%)
              </span>
            </div>
            <div className="relative h-3 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
              <div 
                className={`h-full ${toneBar} transition-all duration-500`} 
                style={{ width: `${pct}%` }} 
              />
              <span 
                className="absolute top-0 bottom-0 w-0.5 bg-white/70 shadow-[0_0_6px_#fff]" 
                style={{ left: `${alertaPct}%` }} 
                title={`Umbral de alerta temprana: ${alertaPct}%`} 
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-2.5">
              <span className="block text-slate-500 text-[10px]">Restantes</span>
              <span className="font-bold text-white font-mono text-sm">{insights.remaining}</span>
            </div>
            <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-2.5">
              <span className="block text-slate-500 text-[10px]">Tasa de Uso</span>
              <span className="font-bold text-white font-mono text-sm">{insights.perDay.toFixed(1)} / día</span>
            </div>
            <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-2.5">
              <span className="block text-slate-500 text-[10px]">Próximo Servicio</span>
              <span className="font-bold text-white font-mono text-sm">
                {insights.eta ? insights.eta.toLocaleDateString() : '—'}
              </span>
            </div>
            <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-2.5">
              <span className="block text-slate-500 text-[10px]">Último Mantenimiento</span>
              <span className="font-bold text-white font-mono text-sm">
                {insights.lastService ? new Date(insights.lastService).toLocaleDateString() : 'Sin registros'}
              </span>
            </div>
          </div>

          {canEdit && (
            <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-800">
              <button 
                type="button" 
                onClick={() => openForm()} 
                className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-[11px] font-bold flex items-center gap-1.5 shadow transition-all"
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>Registrar Intervención Técnica</span>
              </button>
              <button 
                type="button" 
                onClick={() => setLimits({ limite, alerta: alertaPct })} 
                className="px-3.5 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-[11px] font-bold flex items-center gap-1.5 transition-all"
              >
                <Gauge className="w-3.5 h-3.5" />
                <span>Ajustar Límites & Umbral</span>
              </button>
            </div>
          )}

          {/* Formulario de Umbrales */}
          {limits && (
            <div className="rounded-xl border border-cyan-500/30 bg-slate-950 p-3.5 grid grid-cols-2 gap-2.5 items-end">
              <label className="text-[11px] text-slate-400">
                Límite de Ciclos Preventivo
                <input 
                  type="number" 
                  min="10" 
                  className={field} 
                  value={limits.limite} 
                  onChange={(e) => setLimits({ ...limits, limite: e.target.value })} 
                />
              </label>
              <label className="text-[11px] text-slate-400">
                Aviso Temprano (%)
                <input 
                  type="number" 
                  min="10" 
                  max="99" 
                  className={field} 
                  value={limits.alerta} 
                  onChange={(e) => setLimits({ ...limits, alerta: e.target.value })} 
                />
              </label>
              <button 
                type="button" 
                onClick={() => setLimits(null)} 
                className="py-2 rounded-lg border border-slate-700 text-slate-300 text-[11px] font-bold hover:text-white"
              >
                Cancelar
              </button>
              <button 
                type="button" 
                disabled={busy} 
                onClick={saveLimits} 
                className="py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] font-bold flex items-center justify-center gap-1 shadow disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Guardar Umbrales</span>
              </button>
            </div>
          )}
        </div>

        {/* Planes de Mantenimiento Específicos */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-700 bg-slate-950/50 p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <CalendarClock className="w-4 h-4 text-cyan-400" />
              <span>Protocolos Preventivos</span>
            </span>
            {canEdit && (
              <button 
                type="button" 
                onClick={() => setPlanEdit({ id: '', nombre: '', modo: 'DIAS', intervalo: 30, tipo_servicio: 'PREVENTIVO' })} 
                className="p-1 rounded-lg border border-slate-700 text-cyan-300 hover:bg-slate-800" 
                aria-label="Agregar nuevo plan preventivo"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {!plans.length && (
            <p className="text-[11px] text-slate-500 font-sans p-4 text-center">
              No existen planes secundarios configurados.
            </p>
          )}

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {plans.map((plan) => {
              const st = planStatus(plan, log, historicos);
              return (
                <div 
                  key={plan.id} 
                  className={`rounded-xl border p-2.5 space-y-1.5 transition-colors ${
                    st.due 
                      ? 'border-rose-500/40 bg-rose-500/10' 
                      : st.soon 
                      ? 'border-amber-500/40 bg-amber-500/5' 
                      : 'border-slate-800 bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="block text-[11px] font-bold text-white truncate">{plan.nombre}</span>
                      <span className={`block text-[10px] ${st.due ? 'text-rose-300' : st.soon ? 'text-amber-300' : 'text-slate-400'}`}>
                        Intervalo: {plan.intervalo} {plan.modo === 'CICLOS' ? 'ciclos' : 'días'} · {st.label}
                      </span>
                    </div>
                    <div className="flex gap-0.5 shrink-0">
                      {canEdit && (
                        <button 
                          type="button" 
                          onClick={() => openForm(plan)} 
                          className="p-1 rounded hover:bg-white/10 text-emerald-300" 
                          title="Registrar ejecución de este plan"
                        >
                          <ClipboardCheck className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canEdit && (
                        <button 
                          type="button" 
                          onClick={() => setPlanEdit(plan)} 
                          className="p-1 rounded hover:bg-white/10 text-slate-300" 
                          title="Editar parámetros del plan"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div 
                      className={`h-full transition-all ${st.due ? 'bg-rose-500' : st.soon ? 'bg-amber-400' : 'bg-emerald-400'}`} 
                      style={{ width: `${st.pct}%` }} 
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Editor de Planes */}
      {planEdit && (
        <div className="rounded-2xl border border-cyan-500/30 bg-slate-950 p-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5 items-end">
          <label className="col-span-2 text-[11px] text-slate-400">
            Nombre del Procedimiento
            <input 
              className={field} 
              value={planEdit.nombre} 
              onChange={(e) => setPlanEdit({ ...planEdit, nombre: e.target.value })} 
              placeholder="Ej: Sustitución de empaque y válvula de retención" 
            />
          </label>
          <label className="text-[11px] text-slate-400">
            Unidad de Medida
            <select 
              className={field} 
              value={planEdit.modo} 
              onChange={(e) => setPlanEdit({ ...planEdit, modo: e.target.value })}
            >
              <option value="DIAS">Días Calendario</option>
              <option value="CICLOS">Ciclos de Cámara</option>
            </select>
          </label>
          <label className="text-[11px] text-slate-400">
            Frecuencia
            <input 
              type="number" 
              min="1" 
              className={field} 
              value={planEdit.intervalo} 
              onChange={(e) => setPlanEdit({ ...planEdit, intervalo: Math.max(1, parseInt(e.target.value, 10) || 1) })} 
            />
          </label>
          <label className="col-span-2 text-[11px] text-slate-400">
            Tipo de Servicio
            <select 
              className={field} 
              value={planEdit.tipo_servicio} 
              onChange={(e) => setPlanEdit({ ...planEdit, tipo_servicio: e.target.value })}
            >
              {TIPOS_SERVICIO.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
          <div className="col-span-2 flex gap-2">
            {planEdit.id && (
              <button 
                type="button" 
                onClick={() => savePlans(plans.filter((p) => p.id !== planEdit.id))} 
                className="p-2 rounded-lg border border-rose-500/40 text-rose-300 hover:bg-rose-500/10" 
                title="Eliminar este protocolo"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button 
              type="button" 
              onClick={() => setPlanEdit(null)} 
              className="flex-1 py-2 rounded-lg border border-slate-700 text-slate-300 text-[11px] font-bold hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="button" 
              disabled={busy || !planEdit.nombre.trim()}
              onClick={() => {
                const cleanName = planEdit.nombre.trim();
                const planId = planEdit.id || `plan_${Date.now().toString(36)}`;
                const planClean = { ...planEdit, nombre: cleanName, id: planId };
                savePlans(planEdit.id ? plans.map((p) => (p.id === planId ? planClean : p)) : [...plans, planClean]);
              }}
              className="flex-1 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] font-bold disabled:opacity-50 shadow"
            >
              Guardar Protocolo
            </button>
          </div>
        </div>
      )}

      {/* Formulario de Registro de Servicio */}
      {form && (
        <form onSubmit={submitMaintenance} className="rounded-2xl border border-emerald-500/30 bg-slate-950 p-4 sm:p-5 space-y-3 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Wrench className="w-4 h-4 text-emerald-400" />
              <span>Registrar Certificación de Servicio</span>
            </span>
            <button type="button" onClick={() => setForm(null)} className="p-1 rounded hover:bg-white/10 text-slate-300">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <label className="text-[11px] text-slate-400">
              Tipo de Servicio
              <select className={field} value={form.tipo_servicio} onChange={(e) => setForm({ ...form, tipo_servicio: e.target.value })}>
                {TIPOS_SERVICIO.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
            <label className="text-[11px] text-slate-400">
              Protocolo Vinculado
              <select className={field} value={form.plan_id} onChange={(e) => setForm({ ...form, plan_id: e.target.value })}>
                <option value="">General / Fuera de plan</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </label>
            <label className="text-[11px] text-slate-400">
              Técnico Responsable
              <input required className={field} value={form.tecnico_responsable} onChange={(e) => setForm({ ...form, tecnico_responsable: e.target.value })} />
            </label>
          </div>

          <label className="block text-[11px] text-slate-400">
            Descripción de Acciones Ejecutadas
            <textarea 
              rows={3} 
              required 
              className={`${field} font-sans leading-relaxed`} 
              value={form.descripcion} 
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })} 
              placeholder="Detalle de mediciones de presión, sustitución de sellos, comprobación de termocuplas..." 
            />
          </label>

          <label className="flex items-center gap-2 text-[11px] text-slate-300 font-sans cursor-pointer pt-1">
            <input 
              type="checkbox" 
              checked={form.reiniciarOdometro} 
              onChange={(e) => setForm({ ...form, reiniciarOdometro: e.target.checked })} 
              className="w-4 h-4 accent-emerald-400"
            />
            <span>Reiniciar odómetro de servicio de la máquina ({ciclos} ciclos ➔ 0 ciclos)</span>
          </label>

          <button 
            type="submit" 
            disabled={busy} 
            className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 shadow transition-all"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{busy ? 'Registrando en Base de Datos...' : 'Validar y Asentar Servicio'}</span>
          </button>
        </form>
      )}

      {/* Bitácora Histórica de Servicios */}
      <div className="space-y-2 pt-2">
        <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold flex items-center gap-1.5">
          <Timer className="w-3.5 h-3.5" />
          <span>Historial de Intervenciones {loading ? '· consultando...' : `(${log.length} registros)`}</span>
        </span>

        {!loading && !log.length && (
          <div className="p-6 text-center text-slate-500 rounded-xl border border-dashed border-slate-800 font-sans">
            No existen intervenciones previas registradas para este equipo.
          </div>
        )}

        <ol className="relative border-l border-slate-800 ml-2 space-y-3">
          {log.map((e) => {
            const plan = plans.find((p) => p.id === planIdFromEntry(e));
            return (
              <li key={e.id} className="ml-4">
                <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee]" />
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-[10px]">
                    <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-bold">
                      {e.tipo_servicio}
                    </span>
                    {plan && (
                      <span className="px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 font-bold">
                        {plan.nombre}
                      </span>
                    )}
                    <span className="text-slate-400">
                      {new Date(e.created_at).toLocaleString()}
                    </span>
                    <span className="text-slate-500">
                      · Odómetro: {e.ciclos_al_momento ?? '—'} ciclos
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-200 font-sans whitespace-pre-line leading-relaxed">
                    {stripPlanTag(e.descripcion) || 'Sin descripción'}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Técnico: <strong className="text-slate-300">{e.tecnico_responsable || '—'}</strong>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
