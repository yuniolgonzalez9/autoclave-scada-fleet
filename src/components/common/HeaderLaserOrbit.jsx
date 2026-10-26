import React, { useEffect, useRef, useState } from 'react';

const LOOP_MS = 6400;

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

/**
 * Línea láser larga y fina orbitando el perímetro del header (SMIL nativo).
 */
export default function HeaderLaserOrbit() {
  const svgRef = useRef(null);
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

  const d = ready ? roundedRectPath(w, h, inset, r) : '';
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Línea larga: ~32% del perímetro
  const dash = perimeter * 0.32;
  const dasharray = `${dash} ${perimeter - dash}`;
  const laserAnim = (
    <animate
      attributeName="stroke-dashoffset"
      from="0"
      to={-perimeter}
      dur={`${LOOP_MS}ms`}
      repeatCount="indefinite"
    />
  );

  return (
    <svg
      ref={svgRef}
      className="header-laser-orbit pointer-events-none select-none"
      viewBox={ready ? `0 0 ${w} ${h}` : '0 0 1 1'}
      aria-hidden="true"
      focusable="false"
    >
      {ready && prefersReducedMotion && (
        <path className="header-laser-orbit-rail" d={d} opacity={0.2} />
      )}
      {ready && !prefersReducedMotion && (
        <>
          {/* halo cyan difuso bajo el núcleo */}
          <path
            className="header-laser-orbit-tail"
            d={d}
            strokeDasharray={dasharray}
          >
            {laserAnim}
          </path>
          {/* núcleo fino y luminoso */}
          <path
            className="header-laser-orbit-comet"
            d={d}
            strokeDasharray={dasharray}
          >
            {laserAnim}
          </path>
        </>
      )}
    </svg>
  );
}
