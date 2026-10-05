import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function ClinicalTooltip({ 
  title, 
  description, 
  badge, 
  shortcut, 
  extraDetails, 
  children, 
  position = 'bottom' 
}) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const timerRef = useRef(null);

  // Calcula la posición exacta en pantalla sin importar scroll ni contenedores padres
  const updateCoords = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = 280;

    let top = rect.bottom + 8;
    if (position === 'top') {
      top = rect.top - 8;
    }

    // Centrar con respecto al botón y evitar que se salga por los bordes de la pantalla
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - tooltipWidth - 12));

    setCoords({ top, left });
  };

  const handleMouseEnter = () => {
    updateCoords();
    timerRef.current = setTimeout(() => {
      updateCoords();
      setVisible(true);
    }, 200);
  };

  const handleMouseLeave = () => {
    clearTimeout(timerRef.current);
    setVisible(false);
  };

  const handleTouchStart = () => {
    updateCoords();
    timerRef.current = setTimeout(() => {
      updateCoords();
      setVisible(true);
    }, 350);
  };

  const handleTouchEnd = () => {
    clearTimeout(timerRef.current);
    if (visible) {
      setTimeout(() => setVisible(false), 3000);
    }
  };

  // Mantener posición firme si el usuario hace scroll
  useEffect(() => {
    if (visible) {
      const handleReposition = () => updateCoords();
      window.addEventListener('scroll', handleReposition, true);
      window.addEventListener('resize', handleReposition);
      return () => {
        window.removeEventListener('scroll', handleReposition, true);
        window.removeEventListener('resize', handleReposition);
      };
    }
  }, [visible]);

  return (
    <div 
      ref={triggerRef}
      className="inline-flex items-center cursor-help"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {children}

      {/* Renderizado en la raíz del documento: NUNCA queda por debajo de nada */}
      {visible && typeof document !== 'undefined' && createPortal(
        <div 
          style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
          className="fixed z-[9999999] pointer-events-none w-[280px] p-3.5 rounded-2xl ultra-glass border-2 border-cyan-400 shadow-[0_20px_50px_rgba(0,0,0,0.95)] backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150 text-left select-none"
        >
          <div className="flex items-center justify-between gap-1.5 border-b border-cyan-500/30 pb-1.5 mb-2">
            <span className="font-mono text-xs font-bold text-white tracking-wide uppercase truncate">
              {title}
            </span>
            {badge && (
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 shrink-0">
                {badge}
              </span>
            )}
          </div>

          <p className="text-[11px] text-slate-200 font-sans leading-relaxed mb-1.5">
            {description}
          </p>

          {/* Detalles enriquecidos (Ficha del usuario, IP, hospital) */}
          {extraDetails && (
            <div className="my-2 py-1.5 border-t border-b border-white/10 text-[10px] font-mono space-y-1">
              {extraDetails}
            </div>
          )}

          {shortcut && (
            <div className="mt-1 pt-1 border-t border-white/10 flex items-center justify-between text-[9px] font-mono text-slate-400">
              <span>ESTADO:</span>
              <span className="text-cyan-300 font-bold">{shortcut}</span>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
