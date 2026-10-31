import { useEffect } from 'react';

// Spotlight + micro-tilt premium en las tarjetas de flota:
// un solo listener delegado + CSS vars — coste casi nulo.
export function usePremiumHover() {
  useEffect(() => {
    let raf = 0;
    let pending = null;

    const flush = () => {
      raf = 0;
      if (!pending) return;
      const { el, x, y, w, h } = pending;
      pending = null;
      el.style.setProperty('--mx', `${x}px`);
      el.style.setProperty('--my', `${y}px`);
      el.style.setProperty('--rx', `${((y / h) - 0.5) * -4}deg`);
      el.style.setProperty('--ry', `${((x / w) - 0.5) * 4}deg`);
    };

    const onMove = (e) => {
      const el = e.target.closest?.('.fleet-device-card');
      if (!el) return;
      const r = el.getBoundingClientRect();
      pending = { el, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
      if (!raf) raf = requestAnimationFrame(flush);
    };

    const onOut = (e) => {
      const el = e.target.closest?.('.fleet-device-card');
      if (!el || el.contains(e.relatedTarget)) return;
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
      el.style.setProperty('--mx', '-999px');
      el.style.setProperty('--my', '-999px');
    };

    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerout', onOut, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerout', onOut);
    };
  }, []);
}
