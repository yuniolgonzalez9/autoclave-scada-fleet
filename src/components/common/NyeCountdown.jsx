import { useState, useEffect } from 'react';

// Cuenta regresiva a fin de año — global por global_fx_settings.countdown
const NYE_KEY = 'biofleet_nye_localoff';
const isNyeOff = () => { try { return localStorage.getItem(NYE_KEY) === '1'; } catch (_) { return false; } };
export const markNyeLocalOff = (off) => { try { off ? localStorage.setItem(NYE_KEY, '1') : localStorage.removeItem(NYE_KEY); } catch (_) {} };

export default function NyeCountdown({ globalOn }) {
  const [now, setNow] = useState(Date.now());
  const [on, setOn] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { setOn(globalOn && !isNyeOff()); }, [globalOn]);

  if (!on) return null;

  const end = new Date(new Date().getFullYear() + 1, 0, 1).getTime();
  const diff = Math.max(0, end - now);
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const pad = (n) => String(n).padStart(2, '0');

  return (
    <div
      className="nye-countdown hidden md:flex flex-col items-center justify-center px-6 h-11 sm:h-12 rounded-xl border border-cyan-500/30 ultra-glass select-none shrink-0"
      title="Cuenta regresiva a fin de año"
      role="timer"
      aria-label={`Faltan ${d} días ${pad(h)} horas ${pad(m)} minutos ${pad(s)} segundos para fin de año`}
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
    </div>
  );
}
