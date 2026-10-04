import React, { useState, useRef } from 'react';

export default function ClinicalTooltip({ title, description, badge, shortcut, children, position = 'top' }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  // Manejador para computadora (Hover con retardo elegante de 350ms)
  const handleMouseEnter = () => {
    timerRef.current = setTimeout(() => {
      setVisible(true);
    }, 350);
  };

  const handleMouseLeave = () => {
    clearTimeout(timerRef.current);
    setVisible(false);
  };

  // Manejador para Celulares (Pulsación Larga / Long Press de 450ms)
  const handleTouchStart = () => {
    timerRef.current = setTimeout(() => {
      setVisible(true);
    }, 450);
  };

  const handleTouchEnd = () => {
    clearTimeout(timerRef.current);
    // Si se activó en celular, se cierra tras 2.5 segundos para no estorbar
    if (visible) {
      setTimeout(() => setVisible(false), 2500);
    }
  };

  const getPositionClass = () => {
    switch (position) {
      case 'bottom':
        return 'top-[calc(100%+8px)] left-1/2 -translate-x-1/2';
      case 'left':
        return 'right-[calc(100%+8px)] top-1/2 -translate-y-1/2';
      case 'right':
        return 'left-[calc(100%+8px)] top-1/2 -translate-y-1/2';
      default: // top
        return 'bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2';
    }
  };

  return (
    <div 
      className="relative inline-flex items-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {children}

      {visible && (
        <div 
          className={`absolute z-[999999] pointer-events-none w-64 p-3 rounded-xl ultra-glass border border-cyan-400/50 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-200 ${getPositionClass()}`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-cyan-500/20 pb-1.5 mb-1.5">
            <span className="font-mono text-xs font-bold text-white tracking-wide uppercase">
              {title}
            </span>
            {badge && (
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-300">
                {badge}
              </span>
            )}
          </div>

          <p className="text-[11px] text-slate-300 font-sans leading-relaxed">
            {description}
          </p>

          {shortcut && (
            <div className="mt-2 pt-1 border-t border-white/5 flex items-center justify-between text-[9px] font-mono text-slate-400">
              <span>ACCIÓN:</span>
              <span className="text-cyan-400 font-bold">{shortcut}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
