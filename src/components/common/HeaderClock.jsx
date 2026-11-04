import { useEffect, useState } from 'react';

// Reloj del header: su tick de 1s vive aquí para no re-renderizar toda
// la app cada segundo (antes el estado del reloj estaba en App.jsx).
export default function HeaderClock() {
  const [now, setNow] = useState(() => new Date());
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative group hidden md:block shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="header-clock ultra-glass flex items-center justify-center px-6 h-11 sm:h-12 rounded-xl border border-cyan-500/30 leading-none select-none"
        aria-expanded={open}
        aria-label="Ver fecha completa"
      >
        <span className="font-mono text-2xl font-bold tracking-[0.14em] text-cyan-300">
          {now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </button>
      <div
        className={`clock-dropdown absolute right-0 top-full mt-2 z-[9999] ultra-glass rounded-2xl border border-cyan-500/30 px-5 py-4 text-center transition-all duration-300 ${
          open ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible -translate-y-1'
        } group-hover:opacity-100 group-hover:visible group-hover:translate-y-0`}
      >
        <p className="font-mono text-3xl font-bold text-cyan-300 tracking-[0.1em] leading-none">
          {now.toLocaleDateString('es-ES', { day: '2-digit' })}
          <span className="text-slate-500 text-xl mx-1">/</span>
          {now.toLocaleDateString('es-ES', { month: '2-digit' })}
        </p>
        <p className="font-mono text-[11px] text-white font-bold tracking-[0.28em] uppercase mt-2">
          {now.toLocaleDateString('es-ES', { weekday: 'long' })}
        </p>
        <p className="font-mono text-[10px] text-slate-400 tracking-[0.2em] uppercase mt-1">
          {now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
        </p>
      </div>
    </div>
  );
}
