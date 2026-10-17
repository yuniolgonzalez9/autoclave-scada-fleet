import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  const [coords, setCoords] = useState({ top: 0, left: 0, actualPos: position });
  const triggerRef = useRef(null);
  const timerRef = useRef(null);
  const rafRef = useRef(null);

  // Calcula posición sin forzar reflow continuo
  const updateCoords = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = 280;
    const tooltipHeight = 120; // Estimación segura de altura

    let actualPos = position;
    let top = rect.bottom + 8;

    // Auto-Flip si se sale por la parte inferior de la pantalla
    if (position === 'bottom' && (top + tooltipHeight > window.innerHeight - 10)) {
      actualPos = 'top';
      top = rect.top - tooltipHeight - 8;
    } else if (position === 'top') {
      top = rect.top - tooltipHeight - 8;
      if (top < 10) {
        actualPos = 'bottom';
        top = rect.bottom + 8;
      }
    }

    // Centrado horizontal con márgenes de seguridad en pantalla
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - tooltipWidth - 12));

    setCoords({ top, left, actualPos });
  }, [position]);

  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      updateCoords();
      setVisible(true);
    }, 180);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  };

  const handleTouchStart = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      updateCoords();
      setVisible(true);
    }, 300);
  };

  const handleTouchEnd = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (visible) {
      timerRef.current = setTimeout(() => setVisible(false), 2500);
    }
  };

  // Ocultar suavemente al hacer scroll para no recalcular la pantalla
  useEffect(() => {
    if (!visible) return;

    const handleScrollOrResize = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setVisible(false);
      });
    };

    window.addEventListener('scroll', handleScrollOrResize, { passive: true, capture: true });
    window.addEventListener('resize', handleScrollOrResize, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, { capture: true });
      window.removeEventListener('resize', handleScrollOrResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [visible]);

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

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

      {/* Montado en raíz de documento con portal */}
      {visible && typeof document !== 'undefined' && createPortal(
        <div 
          style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
          className="fixed z-[99999] pointer-events-none w-[280px] p-3.5 rounded-2xl ultra-glass border-2 border-cyan-400 shadow-[0_20px_50px_rgba(0,0,0,0.95)] backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-100 text-left select-none"
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

          {/* Ficha enriquecida */}
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
