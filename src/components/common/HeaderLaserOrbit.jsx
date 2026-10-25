import React, { useEffect, useRef, useState, useCallback } from 'react';

const LOOP_MS = 6400;
const DASH_RATIO = 0.15;

/**
 * Genera el trazado SVG SVGPath de un rectángulo redondeado canónico.
 */
function roundedRectPath(w, h, inset, r) {
  const x0 = inset;
  const y0 = inset;
  const x1 = w - inset;
  const y1 = h - inset;
  return `M${x0 + r} ${y0} H${x1 - r} Q${x1} ${y0} ${x1} ${y0 + r} V${y1 - r} Q${x1} ${y1} ${x1 - r} ${y1} H${x0 + r} Q${x0} ${y1} ${x0} ${y1 - r} V${y0 + r} Q${x0} ${y0} ${x0 + r} ${y0} Z`;
}

export default function HeaderLaserOrbit() {
  const svgRef = useRef(null);
  const glowRef = useRef(null);
  const coreRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Detección reactiva de dimensiones del contenedor padre
  useEffect(() => {
    const host = svgRef.current?.parentElement;
    if (!host) return undefined;

    const measure = () => {
      const w = Math.round(host.clientWidth);
      const h = Math.round(host.clientHeight);
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };

    measure();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    const ro = new ResizeObserver(measure);
    ro.observe(host);

    return () => ro.disconnect();
  }, []);

  const { w, h } = size;
  const ready = w > 40 && h > 20;
  const inset = 2;
  const r = ready ? Math.min(12, (h - inset * 2) / 2) : 0;
  
  const perimeter = ready
    ? 2 * (w - 2 * inset - 2 * r) + 2 * (h - 2 * inset - 2 * r) + 2 * Math.PI * r
    : 0;

  // Animación del pulso láser orbital con pausa en segundo plano
  useEffect(() => {
    if (!ready || perimeter <= 0) return undefined;

    // Respeto de accesibilidad: si el usuario prefiere movimiento reducido, detener animación continua
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    
    const dash = perimeter * DASH_RATIO;
    const paths = [glowRef.current, coreRef.current].filter(Boolean);

    if (prefersReducedMotion) {
      paths.forEach((el) => {
        el.setAttribute('stroke-dasharray', 'none');
        el.setAttribute('stroke-dashoffset', '0');
        el.style.opacity = '0.35';
      });
      return undefined;
    }

    paths.forEach((el) => {
      el.setAttribute('stroke-dasharray', `${dash} ${perimeter - dash}`);
      el.setAttribute('stroke-dashoffset', '0');
      el.style.opacity = '';
    });

    let frameId = 0;
    let isPaused = document.hidden;
    const start = performance.now();

    const tick = (now) => {
      if (!isPaused) {
        const offset = -(((now - start) % LOOP_MS) / LOOP_MS) * perimeter;
        paths.forEach((el) => el.setAttribute('stroke-dashoffset', offset.toFixed(2)));
      }
      frameId = requestAnimationFrame(tick);
    };

    const handleVisibilityChange = () => {
      isPaused = document.hidden;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [ready, perimeter]);

  const d = ready ? roundedRectPath(w, h, inset, r) : '';

  return (
    <svg
      ref={svgRef}
      className="header-laser-orbit pointer-events-none select-none"
      viewBox={ready ? `0 0 ${w} ${h}` : '0 0 1 1'}
      aria-hidden="true"
      focusable="false"
    >
      {ready && (
        <>
          <path ref={glowRef} className="header-laser-orbit-glow" d={d} />
          <path ref={coreRef} className="header-laser-orbit-core" d={d} />
        </>
      )}
    </svg>
  );
}
