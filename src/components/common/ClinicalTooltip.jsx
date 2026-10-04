import React, { useState, useRef } from 'react';

export default function ClinicalTooltip({ title, description, badge, shortcut, children, position = 'top' }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  // Computadora: Hover con retardo elegante
  const handleMouseEnter = () => {
    timerRef.current = setTimeout(() => {
      setVisible(true);
    }, 280);
  };

  const handleMouseLeave = () => {
    clearTimeout(timerRef.current);
    setVisible(false);
  };

  // Celular: Long press de 400ms
  const handleTouchStart = () => {
    timerRef.current = setTimeout(() => {
      setVisible(true);
    }, 400);
  };

  const handleTouchEnd = () => {
    clearTimeout(timerRef.current);
    if (visible) {
      setTimeout(() => setVisible(false), 2200);
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
          className={`absolute z-[999999] pointer-events-none w-64 p-3 rounded-xl ultra-glass border-2 border-cyan-400 shadow-[0_10px_35px_rgba(0,0,0,0.9)] backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150 ${getPositionClass()}`}
        >
          <div className="flex items-center justify-between gap-1.5 border-b border-cyan-500/30 pb-1 mb-1.5">
            <span className="font-mono text-[11px] font-bold text-white tracking-wide uppercase truncate">
              {title}
            </span>
            {badge && (
              <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 shrink-0">
                {badge}
              </span>
            )}
          </div>

          <p className="text-[10px] text-slate-200 font-sans leading-relaxed">
            {description}
          </p>

          {shortcut && (
            <div className="mt-1.5 pt-1 border-t border-white/10 flex items-center justify-between text-[8px] font-mono text-slate-400">
              <span>ACCIÓN:</span>
              <span className="text-cyan-300 font-bold">{shortcut}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
