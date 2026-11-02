import { useState, useSyncExternalStore } from 'react';
import { useNow } from '../../hooks/useNow';

// Cuenta regresiva a fin de año — global por global_fx_settings.countdown
const NYE_KEY = 'biofleet_nye_localoff';
const NYE_EVT = 'biofleet:nye';
const isNyeOff = () => { try { return localStorage.getItem(NYE_KEY) === '1'; } catch (_) { return false; } };
export const markNyeLocalOff = (off) => {
  try { off ? localStorage.setItem(NYE_KEY, '1') : localStorage.removeItem(NYE_KEY); } catch (_) {}
  window.dispatchEvent(new Event(NYE_EVT));
};
const subscribeNye = (cb) => {
  window.addEventListener('storage', cb);
  window.addEventListener(NYE_EVT, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(NYE_EVT, cb);
  };
};

export default function NyeCountdown({ globalOn }) {
  const now = useNow(1000);
  const localOff = useSyncExternalStore(subscribeNye, isNyeOff);
  const [open, setOpen] = useState(false);

  if (!globalOn || localOff) return null;

  const end = new Date(new Date().getFullYear() + 1, 0, 1).getTime();
  const diff = Math.max(0, end - now);
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const pad = (n) => String(n).padStart(2, '0');

  return (
    <div className="relative group hidden md:block shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="nye-countdown flex flex-col items-center justify-center px-6 h-11 sm:h-12 rounded-xl border border-cyan-500/30 ultra-glass select-none"
        title="Cuenta regresiva a fin de año — click para detalle"
        aria-expanded={open}
      >
        <span className="font-mono text-2xl font-bold tracking-[0.1em] text-cyan-300 leading-none">
          {d}<span className="text-[11px] text-slate-400 mx-0.5">d</span>
          {pad(h)}<span className="text-[11px] text-slate-400 mx-0.5">:</span>
          {pad(m)}<span className="text-[11px] text-slate-400 mx-0.5">:</span>
          {pad(s)}
        </span>
        <span className="font-mono text-[8px] text-slate-400 tracking-[0.3em] uppercase leading-none mt-0.5">
          PARA AÑO NUEVO
        </span>
      </button>
      <div
        className={`absolute right-0 top-full mt-2 z-[9999] ultra-glass rounded-2xl border border-cyan-500/30 px-5 py-4 text-center transition-all duration-300 min-w-[260px] ${
          open ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible -translate-y-1'
        } group-hover:opacity-100 group-hover:visible group-hover:translate-y-0`}
      >
        <p className="font-mono text-3xl font-bold text-cyan-300 tracking-[0.08em] leading-none">
          {d}<span className="text-sm text-slate-400 mx-1">días</span>{pad(h)}<span className="text-sm text-slate-400">:</span>{pad(m)}<span className="text-sm text-slate-400">:</span>{pad(s)}
        </p>
        <p className="font-mono text-[9px] text-slate-400 tracking-[0.25em] uppercase mt-2">
          TIEMPO RESTANTE PARA EL AÑO NUEVO
        </p>
        <div className="mt-3 pt-2.5 border-t border-cyan-500/20 font-mono text-[10px] text-slate-300 space-y-1">
          <p>📅 Fin del año: <span className="text-cyan-300 font-bold">{new Date(end).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span></p>
          <p>⏱️ Total: <span className="text-cyan-300 font-bold">{Math.floor(diff / 3600000)} horas</span> · <span className="text-cyan-300 font-bold">{Math.floor(diff / 60000)} min</span></p>
        </div>
      </div>
    </div>
  );
}
