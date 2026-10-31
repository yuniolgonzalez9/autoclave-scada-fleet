import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, GripVertical, LayoutGrid, Move, Pencil, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import {
  DATA_KEYS, LIBRARY_BY_TYPE, WIDGET_COLORS, WIDGET_LIBRARY,
  createWidget, normalizeWidget, readValue
} from './widgetLibrary';
import { autoWidgetsFor, capabilitySummary, deriveCapabilities } from './capabilities';
import { ActionTile, LedTile, ToggleTile, iconFor } from './controls';
import { Power, Zap } from 'lucide-react';
import { mergeDeviceConfig } from '../../services/deviceService';

// Asigna posiciones libres (fx/fy en %, fw en %, fh en px) a widgets que aún no las tienen
function autoLayout(list) {
  let x = 2;
  let y = 0;
  let rowH = 0;
  // Los widgets ya posicionados reservan su espacio: los nuevos se apilan debajo
  const maxY = list.reduce((m, w) => (w.fx != null ? Math.max(m, (w.fy || 0) + (w.fh || 110)) : m), 0);
  if (maxY > 0) {
    y = maxY + 10;
  }
  return list.map((w) => {
    if (w.fx != null) return w;
    const fw = w.span >= 3 || w.widget_type === 'TREND' ? 96 : 47;
    const fh = ['GAUGE', 'TREND'].includes(w.widget_type) ? 170 : 118;
    if (x + fw > 99) {
      x = 2;
      y += rowH + 10;
      rowH = 0;
    }
    const item = { ...w, fx: x, fy: y, fw, fh };
    x += fw + 2;
    rowH = Math.max(rowH, fh);
    return item;
  });
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Compacta el tablero: respeta el orden visual actual (arriba->abajo, izq->der)
// y empaqueta sin huecos con distancias uniformes.
const PACK_GAP_X = 2;  // % del ancho
const PACK_GAP_Y = 10; // px
function packWidgets(list) {
  const ordered = [...list].sort((a, b) => ((a.fy || 0) - (b.fy || 0)) || ((a.fx || 0) - (b.fx || 0)));
  let x = PACK_GAP_X;
  let y = PACK_GAP_Y;
  let rowH = 0;
  return ordered.map((w) => {
    const fw = Math.min(w.fw || 47, 100 - PACK_GAP_X * 2);
    const fh = w.fh || 118;
    if (x + fw > 100 - PACK_GAP_X + 0.5) {
      x = PACK_GAP_X;
      y += rowH + PACK_GAP_Y;
      rowH = 0;
    }
    const item = { ...w, fx: x, fy: y, fw, fh };
    x += fw + PACK_GAP_X;
    rowH = Math.max(rowH, fh);
    return item;
  });
}


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
  useEffect(() => {
    if (value === undefined) return undefined;
    const t = setTimeout(() => setSlider(Number(value)), 0);
    return () => clearTimeout(t);
  }, [value]);
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

function WidgetEditor({ widget, onChange, onApplySize, onClose }) {
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
          <span className="text-[11px] text-slate-400">Ancho en la cuadrícula</span>
          <div className="grid grid-cols-4 gap-2 mt-1">
            {[[1, '¼'], [2, '½'], [3, '¾'], [4, 'Todo']].map(([n, label]) => (
              <button key={n} type="button" onClick={() => set({ span: n })} className={`py-1.5 rounded-lg text-[11px] font-bold border ${widget.span === n ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200' : 'border-slate-700 text-slate-400'}`}>{label}</button>
            ))}
          </div>
        </div>
        <div>
          <span className="text-[11px] text-slate-400">Escala del contenido <span className="text-cyan-300 font-mono">{Math.round((widget.scale || 1) * 100)}%</span></span>
          <input
            type="range" min="0.6" max="1.6" step="0.05" value={widget.scale || 1}
            onChange={(e) => set({ scale: Number(e.target.value) })}
            className="control-range w-full mt-1" style={{ '--fill': `${((widget.scale || 1) - 0.6) * 100}%`, '--accent': '#22d3ee' }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-slate-400">Ancho exacto (%)
            <input type="number" min="10" max="100" className={field} value={Math.round(widget.fw ?? 47)} onChange={(e) => set({ fw: Math.min(100, Math.max(10, Number(e.target.value))) })} />
          </label>
          <label className="text-[11px] text-slate-400">Alto exacto (px)
            <input type="number" min="60" max="800" className={field} value={Math.round(widget.fh ?? 118)} onChange={(e) => set({ fh: Math.min(800, Math.max(60, Number(e.target.value))) })} />
          </label>
        </div>
        {onApplySize && (
          <button
            type="button"
            onClick={() => onApplySize(widget.fw ?? 47, widget.fh ?? 118)}
            className="w-full py-2 rounded-xl border border-cyan-500/40 text-cyan-200 text-[11px] font-bold hover:bg-cyan-500/10"
          >
            Aplicar este tamaño a todos los widgets
          </button>
        )}
        <button type="button" onClick={onClose} className="w-full py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5"><Check className="w-4 h-4" />Listo</button>
      </div>
    </div>,
    document.body
  );
}

export default function WidgetBoard({ device, canEdit, sendCommand, onConfirm, enCicloActivo, odometer, onSaved }) {
  const config = device?.meta?.config_deseada || {};
  const tipo = device?.meta?.tipo || config.tipo;
  const relesCount = Object.keys(device?.datos?.reles || {}).length;
  const entradasCount = Object.keys(device?.datos?.entradas || {}).length;
  const stored = useMemo(() => {
    const list = config.custom_dashboard?.widgets;
    return Array.isArray(list) && list.length ? list.map(normalizeWidget) : autoWidgetsFor(device);
  }, [config.custom_dashboard, device?.esquema, device?.meta, relesCount, entradasCount]); // eslint-disable-line react-hooks/exhaustive-deps
  const caps = useMemo(() => deriveCapabilities(device), [device?.esquema, device?.meta, device?.datos]); // eslint-disable-line react-hooks/exhaustive-deps

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(stored);
  const [editingId, setEditingId] = useState(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const boardRef = useRef(null);
  const dragRef = useRef(null);
  const draftRef = useRef(draft);
  const [guides, setGuides] = useState([]);

  useEffect(() => { draftRef.current = draft; }, [draft]);

  useEffect(() => {
    if (editing) return undefined;
    const t = setTimeout(() => setDraft(autoLayout(stored)), 0);
    return () => clearTimeout(t);
  }, [stored, editing]);

  const widgets = autoLayout(editing ? draft : stored);
  const canvasH = Math.max(140, ...widgets.map((w) => (w.fy || 0) + (w.fh || 110))) + 12;

  // Drag libre (mover) y resize libre (esquina inferior derecha) — puntero y táctil
  const startDrag = (e, widget, mode) => {
    if (!editing) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { id: widget.id, mode, startX: e.clientX, startY: e.clientY, w0: widget, bw: rect.width };

    const onMove = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = ((ev.clientX - d.startX) / d.bw) * 100;
      const dy = ev.clientY - d.startY;
      const list = draftRef.current;
      const it = list.find((x) => x.id === d.id);
      if (!it) return;
      const others = list.filter((x) => x.id !== d.id);
      const gs = [];
      const SNAP_X = 1.6; // % del ancho
      const SNAP_Y = 9;   // px
      const snapX = (edge) => {
        for (const o of others) {
          for (const v of [o.fx, o.fx + o.fw, 0, 50, 98]) {
            if (Math.abs(edge - v) < SNAP_X) { gs.push({ v }); return v; }
          }
        }
        return null;
      };
      const snapY = (edge) => {
        for (const o of others) {
          for (const v of [o.fy, o.fy + o.fh, 0]) {
            if (Math.abs(edge - v) < SNAP_Y) { gs.push({ h: v }); return v; }
          }
        }
        return null;
      };

      if (d.mode === 'move') {
        let nfx = clamp(d.w0.fx + dx, 0, 100 - it.fw);
        let nfy = Math.max(0, d.w0.fy + dy);
        const sL = snapX(nfx);
        const sR = snapX(nfx + it.fw);
        const sT = snapY(nfy);
        const sB = snapY(nfy + it.fh);
        if (sL != null) nfx = sL;
        else if (sR != null) nfx = sR - it.fw;
        if (sT != null) nfy = sT;
        else if (sB != null) nfy = sB - it.fh;
        setGuides(gs);
        setDraft((l) => l.map((x) => (x.id === d.id ? { ...x, fx: nfx, fy: nfy } : x)));
      } else {
        let nfw = clamp(d.w0.fw + dx, 15, 100 - it.fx);
        let nfh = Math.max(64, d.w0.fh + dy);
        const sR = snapX(it.fx + nfw);
        const sB = snapY(it.fy + nfh);
        // imán también a tamaños iguales de otros widgets
        if (sR == null) for (const o of others) { if (Math.abs(nfw - o.fw) < SNAP_X) { nfw = o.fw; gs.push({ v: it.fx + o.fw }); break; } }
        else nfw = sR - it.fx;
        if (sB == null) for (const o of others) { if (Math.abs(nfh - o.fh) < SNAP_Y) { nfh = o.fh; gs.push({ h: it.fy + o.fh }); break; } }
        else nfh = sB - it.fy;
        setGuides(gs);
        setDraft((l) => l.map((x) => (x.id === d.id ? { ...x, fw: nfw, fh: nfh } : x)));
      }
    };
    const onUp = () => {
      dragRef.current = null;
      setGuides([]);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
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
          {editing ? 'Arrastra para mover libremente · estira la esquina ◢ para dimensionar · Guardar conserva tu diseño en la nube.' : `${config.custom_dashboard?.widgets?.length ? 'Panel personalizado' : 'Diseñado automáticamente'} · ${capabilitySummary(caps)} (fuente: ${caps.source})`}
        </p>
        {canEdit && (
          <div className="flex gap-1.5">
            {editing ? (
              <>
                <button type="button" onClick={() => setDraft((l) => packWidgets(l))} className="px-2.5 py-1.5 rounded-lg border border-cyan-500/50 bg-cyan-500/10 text-cyan-200 text-[11px] font-bold flex items-center gap-1"><LayoutGrid className="w-3.5 h-3.5" />Ordenar</button>
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

      <div ref={boardRef} className="relative" style={{ height: canvasH }}>
        {guides.map((g, i) => (
          g.v != null
            ? <div key={`gv${i}`} className="absolute top-0 bottom-0 w-px bg-cyan-400/80 z-50 pointer-events-none" style={{ left: `${g.v}%`, boxShadow: '0 0 6px rgba(34,211,238,0.8)' }} />
            : <div key={`gh${i}`} className="absolute left-0 right-0 h-px bg-cyan-400/80 z-50 pointer-events-none" style={{ top: g.h, boxShadow: '0 0 6px rgba(34,211,238,0.8)' }} />
        ))}
        {widgets.map((w) => {
          const c = WIDGET_COLORS[w.color];
          const isControl = CONTROL_TYPES.includes(w.widget_type);
          return (
            <div
              key={w.id}
              className={`absolute flex flex-col gap-2 ${isControl ? '' : `widget-card rounded-2xl border ${c.ring} bg-gradient-to-br from-slate-900/70 to-slate-950/80 p-3.5`} ${editing ? 'outline outline-1 outline-dashed outline-cyan-500/50 rounded-2xl' : ''}`}
              style={{ left: `${w.fx}%`, top: w.fy, width: `${w.fw}%`, height: w.fh, overflow: 'hidden' }}
            >
              <div className={`flex items-center justify-between gap-1 ${isControl && !editing ? 'hidden' : ''}`}>
                {editing ? (
                  <button
                    type="button" aria-label="Arrastrar para mover"
                    onPointerDown={(e) => startDrag(e, w, 'move')}
                    className="flex items-center gap-1 -ml-1 px-1 py-0.5 rounded text-cyan-300/80 hover:text-cyan-200 cursor-grab active:cursor-grabbing touch-none"
                  >
                    <Move className="w-3.5 h-3.5" />
                  </button>
                ) : null}
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate flex-1">{isControl ? '' : w.label}</span>
                {editing && (
                  <div className="flex gap-0.5 shrink-0">
                    <button type="button" aria-label="Editar" onClick={() => setEditingId(w.id)} className="p-1 rounded hover:bg-white/10 text-cyan-300"><Pencil className="w-3.5 h-3.5" /></button>
                    <button type="button" aria-label="Eliminar" onClick={() => setDraft((list) => list.filter((x) => x.id !== w.id))} className="p-1 rounded hover:bg-rose-500/20 text-rose-300"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
              <div className="flex-1 flex flex-col justify-center min-h-0" style={{ zoom: w.scale || 1 }}>
                <WidgetBody w={w} device={device} sendCommand={sendCommand} onConfirm={onConfirm} enCicloActivo={enCicloActivo} odometer={odometer} editing={editing} />
              </div>
              {editing && (
                <button
                  type="button" aria-label="Estirar para dimensionar"
                  onPointerDown={(e) => startDrag(e, w, 'resize')}
                  className="absolute bottom-0.5 right-0.5 p-1.5 text-cyan-300/80 hover:text-cyan-200 cursor-nwse-resize touch-none"
                >
                  <GripVertical className="w-3.5 h-3.5 rotate-45" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {editing && (
        <button type="button" onClick={() => setShowLibrary(true)} className="mt-2 w-full min-h-[64px] rounded-2xl border-2 border-dashed border-cyan-500/40 text-cyan-300 flex flex-col items-center justify-center gap-1 text-[11px] font-bold hover:bg-cyan-500/10">
          <Plus className="w-5 h-5" />Añadir widget
        </button>
      )}

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
          onApplySize={(fw, fh) => setDraft((list) => list.map((w) => ({ ...w, fw, fh })))}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}
