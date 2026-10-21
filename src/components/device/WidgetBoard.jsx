import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, LayoutGrid, Pencil, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import {
  DATA_KEYS, LIBRARY_BY_TYPE, WIDGET_COLORS, WIDGET_LIBRARY,
  createWidget, normalizeWidget, readValue
} from './widgetLibrary';
import { autoWidgetsFor, capabilitySummary, deriveCapabilities } from './capabilities';
import { ActionTile, LedTile, ToggleTile, iconFor } from './controls';
import { Power, Zap } from 'lucide-react';
import { mergeDeviceConfig } from '../../services/deviceService';

const SIZE_CLASS = { sm: 'col-span-1', md: 'col-span-2', lg: 'col-span-2 sm:col-span-4' };


function Gauge({ value, min, max, color, unit }) {
  const pct = Math.max(0, Math.min(1, (Number(value) - min) / ((max - min) || 1)));
  const r = 40;
  const arc = (Math.PI * 1.5) * r;
  const stroke = WIDGET_COLORS[color].stroke;
  const gid = `g_${color}`;
  return (
    <div className="relative w-full max-w-[170px] mx-auto aspect-square">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-[225deg]">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
            <stop offset="100%" stopColor={stroke} />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(148,163,184,0.14)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${arc} 999`} />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke={`url(#${gid})`} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${arc * pct} 999`} style={{ transition: 'stroke-dasharray 0.7s cubic-bezier(.2,.8,.2,1)', filter: `drop-shadow(0 0 5px ${stroke})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[26px] leading-none font-bold font-mono text-white tabular-nums">
          {Number.isFinite(Number(value)) ? Number(value).toFixed(Math.abs(max) <= 10 ? 2 : 1) : '--'}
        </span>
        <span className="text-[10px] text-slate-400 font-mono mt-1">{unit}</span>
      </div>
      <span className="absolute bottom-[8%] left-[14%] text-[9px] text-slate-500 font-mono">{min}</span>
      <span className="absolute bottom-[8%] right-[14%] text-[9px] text-slate-500 font-mono">{max}</span>
    </div>
  );
}

function Sparkline({ points, color }) {
  if (points.length < 2) return <div className="h-20 flex items-center justify-center text-[11px] text-slate-500 font-sans">Esperando lecturas en vivo…</div>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points.map((p, i) => `${(i / (points.length - 1)) * 100},${38 - ((p - min) / span) * 34}`).join(' ');
  return (
    <div className="space-y-1">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-20">
        <polyline points={`0,40 ${d} 100,40`} fill={WIDGET_COLORS[color].stroke} opacity="0.14" />
        <polyline points={d} fill="none" stroke={WIDGET_COLORS[color].stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between text-[10px] font-mono text-slate-500"><span>mín {min.toFixed(1)}</span><span className="text-slate-300">actual {points[points.length - 1].toFixed(1)}</span><span>máx {max.toFixed(1)}</span></div>
    </div>
  );
}

const PHASE_STYLE = (fase, active) => {
  const f = String(fase || '').toUpperCase();
  if (/ALARM|ERROR|FALL|ABORT|CANCEL/.test(f)) return { tone: 'rose', text: 'text-rose-200', dot: 'bg-rose-400' };
  if (/FINALIZ|EXITO|ÉXITO|LISTO/.test(f)) return { tone: 'emerald', text: 'text-emerald-200', dot: 'bg-emerald-400' };
  if (active) return { tone: 'amber', text: 'text-amber-200', dot: 'bg-amber-400' };
  return { tone: 'slate', text: 'text-slate-200', dot: 'bg-slate-500' };
};

const CONTROL_TYPES = ['SWITCH_TOGGLE', 'PUSH_BUTTON', 'STATUS_LED'];

function WidgetBody({ w, device, sendCommand, onConfirm, enCicloActivo, odometer, editing }) {
  const c = WIDGET_COLORS[w.color];
  const value = readValue(device, w.key);
  const [slider, setSlider] = useState(Number(value ?? w.min));
  useEffect(() => { if (value !== undefined) setSlider(Number(value)); }, [value]);
  const sendSlider = () => sendCommand?.(device.mac, { cmd: 'SET_CONFIG', cfg: { [String(w.key).replace(/^cfg\./, '')]: slider } });

  switch (w.widget_type) {
    case 'GAUGE':
      return <Gauge value={value ?? 0} min={w.min} max={w.max} color={w.color} unit={w.unit} />;
    case 'VALUE': {
      const n = Number(value);
      const pct = Number.isFinite(n) ? Math.max(0, Math.min(100, ((n - w.min) / ((w.max - w.min) || 1)) * 100)) : 0;
      return (
        <div className="space-y-2">
          <p className={`text-[28px] leading-none font-bold font-mono tabular-nums ${c.text}`}>
            {Number.isFinite(n) ? n.toFixed(w.max <= 10 ? 2 : 1) : '--'}
            <span className="text-xs text-slate-400 ml-1 font-normal">{w.unit}</span>
          </p>
          <div className="h-1 rounded-full bg-slate-800 overflow-hidden"><div className={`h-full ${c.bg} transition-all duration-700`} style={{ width: `${pct}%` }} /></div>
        </div>
      );
    }
    case 'TREND': {
      const k = w.key === 'pressure' ? 'pressure' : 'temperature';
      return <Sparkline points={(device?.history || []).map((h) => Number(h[k])).filter(Number.isFinite)} color={w.color} />;
    }
    case 'TIMER': {
      const s = Number(device?.datos?.seg_restantes || 0);
      return (
        <div>
          <p className={`text-[28px] leading-none font-bold font-mono tabular-nums ${s > 0 ? c.text : 'text-slate-300'}`}>{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</p>
          <p className="text-[10px] text-slate-500 font-sans mt-1">{s > 0 ? 'restante del ciclo' : 'sin ciclo en curso'}</p>
        </div>
      );
    }
    case 'PHASE': {
      const fase = device?.datos?.fase || 'EN ESPERA';
      const st = PHASE_STYLE(fase, enCicloActivo);
      return (
        <div className="flex items-center gap-3">
          <span className="relative flex w-3 h-3 shrink-0">
            {enCicloActivo && <span className={`absolute inset-0 rounded-full ${st.dot} opacity-60 animate-ping`} />}
            <span className={`relative w-3 h-3 rounded-full ${st.dot}`} />
          </span>
          <span className={`text-base font-bold uppercase tracking-wide font-sans ${st.text}`}>{fase}</span>
        </div>
      );
    }
    case 'PROGRESS': {
      const pct = Math.min(100, Math.round((odometer.ciclos / Math.max(1, odometer.limite)) * 100));
      return (
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] font-mono"><span className="text-white font-bold">{odometer.ciclos} / {odometer.limite}</span><span className={pct >= 100 ? 'text-rose-300' : pct >= 80 ? 'text-amber-300' : 'text-emerald-300'}>{pct}%</span></div>
          <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden"><div className={`h-full transition-all ${pct >= 100 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-400' : c.bg}`} style={{ width: `${pct}%` }} /></div>
        </div>
      );
    }
    case 'STATUS_LED': {
      const on = Boolean(Number(value)) || value === true;
      return <LedTile label={w.label} on={on} tone={w.color} />;
    }
    case 'SWITCH_TOGGLE': {
      const on = Boolean(Number(device?.datos?.reles?.[`R${w.canal}`]));
      return (
        <ToggleTile
          label={w.label}
          sublabel={`R${w.canal} · ${on ? 'Encendido' : 'Apagado'}`}
          on={on}
          tone={w.color}
          icon={iconFor(w.role, w.label)}
          disabled={editing || enCicloActivo}
          onToggle={() => sendCommand?.(device.mac, { cmd: 'SET_RELAY', canal: w.canal, val: !on })}
        />
      );
    }
    case 'PUSH_BUTTON':
      return (
        <ActionTile
          label={w.label}
          hint={w.cmd?.cmd}
          tone={w.color}
          icon={iconFor(w.cmd?.cmd, w.label) === Power ? Zap : iconFor(w.cmd?.cmd, w.label)}
          disabled={editing}
          onClick={() => {
            const run = () => sendCommand?.(device.mac, w.cmd || { cmd: 'PING' });
            if (w.confirm && onConfirm) onConfirm({ title: w.label, description: `¿Enviar el comando ${w.cmd?.cmd || ''} al equipo?`, onConfirm: run });
            else run();
          }}
        />
      );
    case 'SLIDER': {
      const pct = ((slider - w.min) / ((w.max - w.min) || 1)) * 100;
      return (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className={`text-2xl font-bold font-mono tabular-nums ${c.text}`}>{slider}<span className="text-xs text-slate-400 ml-1 font-normal">{w.unit}</span></span>
            <span className="text-[10px] text-slate-500 font-mono">{w.min} – {w.max}</span>
          </div>
          <input
            type="range" min={w.min} max={w.max} step={w.step || 1} value={slider} disabled={editing}
            onChange={(e) => setSlider(Number(e.target.value))}
            onPointerUp={sendSlider}
            onKeyUp={sendSlider}
            className="control-range w-full"
            style={{ '--fill': `${pct}%`, '--accent': c.stroke }}
          />
        </div>
      );
    }
    default:
      return null;
  }
}

function WidgetEditor({ widget, onChange, onClose }) {
  const lib = LIBRARY_BY_TYPE[widget.widget_type];
  const set = (patch) => onChange({ ...widget, ...patch });
  const usesKey = ['GAUGE', 'VALUE', 'STATUS_LED', 'SLIDER'].includes(widget.widget_type);
  const usesRange = ['GAUGE', 'VALUE', 'SLIDER'].includes(widget.widget_type);
  const field = 'w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-cyan-400';
  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="ultra-glass w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-cyan-500/30 p-4 space-y-3 max-h-[85dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-white">{lib.label}</h4>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300"><X className="w-4 h-4" /></button>
        </div>
        <label className="block text-[11px] text-slate-400">Título<input className={field} value={widget.label} onChange={(e) => set({ label: e.target.value })} /></label>
        {usesKey && (
          <label className="block text-[11px] text-slate-400">Dato del equipo
            <input list="widget-keys" className={field} value={widget.key || ''} onChange={(e) => set({ key: e.target.value })} placeholder="temp_camara, reles.R1, entradas.IN2…" />
            <datalist id="widget-keys">
              {DATA_KEYS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={`in${n}`} value={`entradas.IN${n}`}>Entrada IN{n}</option>)}
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={`r${n}`} value={`reles.R${n}`}>Relé R{n}</option>)}
            </datalist>
          </label>
        )}
        {widget.widget_type === 'TREND' && (
          <label className="block text-[11px] text-slate-400">Serie
            <select className={field} value={widget.key} onChange={(e) => set({ key: e.target.value })}>
              <option value="temperature">Temperatura</option><option value="pressure">Presión</option>
            </select>
          </label>
        )}
        {widget.widget_type === 'SWITCH_TOGGLE' && (
          <label className="block text-[11px] text-slate-400">Salida
            <select className={field} value={widget.canal} onChange={(e) => set({ canal: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>R{n}</option>)}
            </select>
          </label>
        )}
        {widget.widget_type === 'PUSH_BUTTON' && (
          <>
            <label className="block text-[11px] text-slate-400">Comando MQTT (JSON)
              <textarea
                rows={3} className={`${field} font-mono`} defaultValue={JSON.stringify(widget.cmd || {}, null, 0)}
                onBlur={(e) => { try { set({ cmd: JSON.parse(e.target.value) }); } catch { e.target.classList.add('border-rose-500'); } }}
              />
            </label>
            <label className="flex items-center gap-2 text-[11px] text-slate-300"><input type="checkbox" checked={Boolean(widget.confirm)} onChange={(e) => set({ confirm: e.target.checked })} />Pedir confirmación antes de enviar</label>
          </>
        )}
        {usesRange && (
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[11px] text-slate-400">Mín.<input type="number" className={field} value={widget.min} onChange={(e) => set({ min: Number(e.target.value) })} /></label>
            <label className="text-[11px] text-slate-400">Máx.<input type="number" className={field} value={widget.max} onChange={(e) => set({ max: Number(e.target.value) })} /></label>
            <label className="text-[11px] text-slate-400">Unidad<input className={field} value={widget.unit} onChange={(e) => set({ unit: e.target.value })} /></label>
          </div>
        )}
        <div>
          <span className="text-[11px] text-slate-400">Color</span>
          <div className="flex gap-2 mt-1">
            {Object.entries(WIDGET_COLORS).map(([name, c]) => (
              <button key={name} type="button" aria-label={name} onClick={() => set({ color: name })} className={`w-7 h-7 rounded-full ${c.bg} ${widget.color === name ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900' : 'opacity-60'}`} />
            ))}
          </div>
        </div>
        <div>
          <span className="text-[11px] text-slate-400">Tamaño</span>
          <div className="grid grid-cols-3 gap-2 mt-1">
            {[['sm', 'Pequeño'], ['md', 'Mediano'], ['lg', 'Ancho']].map(([id, label]) => (
              <button key={id} type="button" onClick={() => set({ size: id })} className={`py-1.5 rounded-lg text-[11px] font-bold border ${widget.size === id ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200' : 'border-slate-700 text-slate-400'}`}>{label}</button>
            ))}
          </div>
        </div>
        <button type="button" onClick={onClose} className="w-full py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5"><Check className="w-4 h-4" />Listo</button>
      </div>
    </div>,
    document.body
  );
}

export default function WidgetBoard({ device, canEdit, sendCommand, onConfirm, enCicloActivo, odometer, onSaved }) {
  const config = device?.meta?.config_deseada || {};
  const tipo = device?.meta?.tipo || config.tipo;
  const stored = useMemo(() => {
    const list = config.custom_dashboard?.widgets;
    return Array.isArray(list) && list.length ? list.map(normalizeWidget) : autoWidgetsFor(device);
  }, [config.custom_dashboard, device?.esquema, device?.meta, Object.keys(device?.datos?.reles || {}).length, Object.keys(device?.datos?.entradas || {}).length]); // eslint-disable-line react-hooks/exhaustive-deps
  const caps = useMemo(() => deriveCapabilities(device), [device?.esquema, device?.meta, device?.datos]); // eslint-disable-line react-hooks/exhaustive-deps

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(stored);
  const [editingId, setEditingId] = useState(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (!editing) setDraft(stored); }, [stored, editing]);

  const widgets = editing ? draft : stored;
  const move = (i, delta) => setDraft((list) => {
    const next = [...list];
    const j = i + delta;
    if (j < 0 || j >= next.length) return list;
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const custom_dashboard = { ...(config.custom_dashboard || {}), titulo: config.custom_dashboard?.titulo || device?.meta?.alias || 'Panel', widgets: draft };
      const merged = await mergeDeviceConfig(device.mac, { custom_dashboard });
      onSaved?.({ config_deseada: merged });
      setEditing(false);
    } catch (e) {
      setError(`No se pudo guardar: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const editingWidget = draft.find((w) => w.id === editingId);
  const categories = [...new Set(WIDGET_LIBRARY.map((w) => w.category))];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-slate-400 font-sans">
          {editing ? 'Ordena, edita o elimina widgets. Los cambios se guardan en la nube para este equipo.' : `${config.custom_dashboard?.widgets?.length ? 'Panel personalizado' : 'Diseñado automáticamente'} · ${capabilitySummary(caps)} (fuente: ${caps.source})`}
        </p>
        {canEdit && (
          <div className="flex gap-1.5">
            {editing ? (
              <>
                <button type="button" onClick={() => setDraft(autoWidgetsFor(device))} className="px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-[11px] font-bold flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" />Auto-diseñar</button>
                <button type="button" onClick={() => { setEditing(false); setDraft(stored); }} className="px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-[11px] font-bold">Cancelar</button>
                <button type="button" onClick={save} disabled={saving} className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 text-[11px] font-bold flex items-center gap-1 disabled:opacity-50"><Save className="w-3.5 h-3.5" />{saving ? 'Guardando…' : 'Guardar'}</button>
              </>
            ) : (
              <button type="button" onClick={() => setEditing(true)} className="px-3 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-200 text-[11px] font-bold flex items-center gap-1"><LayoutGrid className="w-3.5 h-3.5" />Personalizar</button>
            )}
          </div>
        )}
      </div>
      {error && <p className="text-[11px] text-rose-300">{error}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {widgets.map((w, i) => {
          const c = WIDGET_COLORS[w.color];
          const isControl = CONTROL_TYPES.includes(w.widget_type);
          return (
            <div key={w.id} className={`${SIZE_CLASS[w.size]} relative flex flex-col gap-2 ${isControl ? '' : `widget-card rounded-2xl border ${c.ring} bg-gradient-to-br from-slate-900/70 to-slate-950/80 p-3.5 min-h-[104px]`} ${editing ? 'outline outline-1 outline-dashed outline-slate-600 rounded-2xl' : ''}`}>
              <div className={`flex items-center justify-between gap-1 ${isControl && !editing ? 'hidden' : ''}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">{isControl ? '' : w.label}</span>
                {editing && (
                  <div className="flex gap-0.5 shrink-0">
                    <button type="button" aria-label="Mover antes" onClick={() => move(i, -1)} className="p-1 rounded hover:bg-white/10 text-slate-300"><ArrowLeft className="w-3.5 h-3.5" /></button>
                    <button type="button" aria-label="Mover después" onClick={() => move(i, 1)} className="p-1 rounded hover:bg-white/10 text-slate-300"><ArrowRight className="w-3.5 h-3.5" /></button>
                    <button type="button" aria-label="Editar" onClick={() => setEditingId(w.id)} className="p-1 rounded hover:bg-white/10 text-cyan-300"><Pencil className="w-3.5 h-3.5" /></button>
                    <button type="button" aria-label="Eliminar" onClick={() => setDraft((list) => list.filter((x) => x.id !== w.id))} className="p-1 rounded hover:bg-rose-500/20 text-rose-300"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
              <div className="flex-1 flex flex-col justify-center">
                <WidgetBody w={w} device={device} sendCommand={sendCommand} onConfirm={onConfirm} enCicloActivo={enCicloActivo} odometer={odometer} editing={editing} />
              </div>
            </div>
          );
        })}
        {editing && (
          <button type="button" onClick={() => setShowLibrary(true)} className="col-span-1 min-h-[96px] rounded-2xl border-2 border-dashed border-cyan-500/40 text-cyan-300 flex flex-col items-center justify-center gap-1 text-[11px] font-bold hover:bg-cyan-500/10">
            <Plus className="w-5 h-5" />Añadir widget
          </button>
        )}
      </div>

      {showLibrary && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={() => setShowLibrary(false)}>
          <div className="ultra-glass w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl border border-cyan-500/30 p-4 max-h-[85dvh] overflow-y-auto space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">Biblioteca de widgets</h4>
              <button type="button" onClick={() => setShowLibrary(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300"><X className="w-4 h-4" /></button>
            </div>
            {categories.map((cat) => (
              <div key={cat} className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">{cat}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {WIDGET_LIBRARY.filter((w) => w.category === cat).map((lib) => (
                    <button
                      key={lib.type} type="button"
                      onClick={() => { const w = createWidget(lib.type); setDraft((list) => [...list, w]); setShowLibrary(false); setEditingId(w.id); }}
                      className="text-left p-3 rounded-xl border border-slate-700 bg-slate-950/60 hover:border-cyan-400 transition"
                    >
                      <span className="block text-xs font-bold text-white">{lib.label}</span>
                      <span className="block text-[11px] text-slate-400 font-sans">{lib.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}

      {editingWidget && (
        <WidgetEditor
          widget={editingWidget}
          onChange={(next) => setDraft((list) => list.map((w) => (w.id === next.id ? next : w)))}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}
