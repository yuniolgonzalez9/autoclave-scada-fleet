import React, { useState, useRef, useEffect, useCallback, useId } from 'react';
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
  const tooltipId = useId();

  // Cálculo de coordenadas adaptativo con auto-flip
  const updateCoords = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    
    const tooltipWidth = 290;
    // Estimación calibrada según presencia de detalles enriquecidos
    const estimatedHeight = extraDetails ? 180 : 120;

    let actualPos = position;
    let top = rect.bottom + 8;

    // Volteo automático si se sale por el margen inferior del monitor
    if (position === 'bottom' && (top + estimatedHeight > window.innerHeight - 12)) {
      actualPos = 'top';
      top = Math.max(12, rect.top - estimatedHeight - 8);
    } else if (position === 'top') {
      top = rect.top - estimatedHeight - 8;
      if (top < 12) {
        actualPos = 'bottom';
        top = rect.bottom + 8;
      }
    }

    // Centrado horizontal con márgenes de seguridad en el viewport
    let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
    left = Math.max(12, Math.min(left, window.innerWidth - tooltipWidth - 12));

    setCoords({ top: Math.round(top), left: Math.round(left), actualPos });
  }, [position, extraDetails]);

  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      updateCoords();
      setVisible(true);
    }, 150);
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
    }, 250);
  };

  const handleTouchEnd = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (visible) {
      timerRef.current = setTimeout(() => setVisible(false), 3000);
    }
  };

  // Ocultar de inmediato ante desplazamiento de pantalla
  useEffect(() => {
    if (!visible) return undefined;

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

  // Limpieza total de temporizadores al desmontar
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div 
      ref={triggerRef}
      className="inline-flex items-center cursor-help select-none"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      aria-describedby={visible ? tooltipId : undefined}
    >
      {children}

      {/* Renderizado mediante portal en document.body */}
      {visible && typeof document !== 'undefined' && createPortal(
        <div 
          id={tooltipId}
          role="tooltip"
          style={{ 
            top: `${coords.top}px`, 
            left: `${coords.left}px` 
          }}
          className="fixed z-[999999] pointer-events-none w-[290px] p-3.5 rounded-2xl ultra-glass border-2 border-cyan-400 shadow-[0_20px_50px_rgba(0,0,0,0.95)] backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-100 text-left select-none font-mono"
        >
          {/* Cabecera del tooltip */}
          <div className="flex items-center justify-between gap-1.5 border-b border-cyan-500/30 pb-1.5 mb-2">
            <span className="text-xs font-bold text-white tracking-wide uppercase truncate">
              {title}
            </span>
            {badge && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 shrink-0">
                {badge}
              </span>
            )}
          </div>

          {/* Descripción clínica */}
          {description && (
            <p className="text-[11px] text-slate-200 font-sans leading-relaxed mb-1.5">
              {description}
            </p>
          )}

          {/* Ficha enriquecida */}
          {extraDetails && (
            <div className="my-2 py-1.5 border-t border-b border-white/10 text-[10px] space-y-1">
              {extraDetails}
            </div>
          )}

          {/* Pie con atajo o estado */}
          {shortcut && (
            <div className="mt-1 pt-1 border-t border-white/10 flex items-center justify-between text-[9px] text-slate-400">
              <span>ESTADO / ACCIÓN:</span>
              <strong className="text-cyan-300">{shortcut}</strong>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
