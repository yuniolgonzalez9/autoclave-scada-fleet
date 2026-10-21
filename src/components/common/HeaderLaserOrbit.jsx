import React, { useEffect, useRef, useState } from 'react';

const LOOP_MS = 6400;
const DASH_RATIO = 0.15;

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

  useEffect(() => {
    if (!ready) return undefined;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const loopMs = reduceMotion ? LOOP_MS * 2 : LOOP_MS;
    const dash = perimeter * DASH_RATIO;
    const paths = [glowRef.current, coreRef.current].filter(Boolean);
    paths.forEach((el) => {
      el.setAttribute('stroke-dasharray', `${dash} ${perimeter - dash}`);
      el.setAttribute('stroke-dashoffset', '0');
    });

    let frame = 0;
    const start = performance.now();
    const tick = (now) => {
      const offset = -(((now - start) % loopMs) / loopMs) * perimeter;
      paths.forEach((el) => el.setAttribute('stroke-dashoffset', offset.toFixed(2)));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ready, perimeter]);

  const d = ready ? roundedRectPath(w, h, inset, r) : '';

  return (
    <svg
      ref={svgRef}
      className="header-laser-orbit"
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
