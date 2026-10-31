import { useEffect, useRef } from 'react';

const KEY = 'biofleet_xmas';
export const XMAS_DEFAULTS = { on: false, flakes: 120, speed: 100, lights: true };

export function readXmasPrefs() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...XMAS_DEFAULTS, ...JSON.parse(raw) } : { ...XMAS_DEFAULTS };
  } catch (_) {
    return { ...XMAS_DEFAULTS };
  }
}

export function applyXmasPrefs(prefs) {
  const p = { ...XMAS_DEFAULTS, ...prefs };
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (_) {}
  document.documentElement.dataset.xmas = p.on ? 'on' : 'off';
  document.documentElement.dataset.xmasLights = p.on && p.lights ? 'on' : 'off';
  window.dispatchEvent(new CustomEvent('bf:xmas', { detail: p }));
  return p;
}

export function saveXmasPrefs(prefs) {
  return applyXmasPrefs(prefs);
}

// Capa de nieve en canvas: ajustable en cantidad y velocidad.
export default function SnowfallLayer() {
  const canvasRef = useRef(null);

  useEffect(() => {
    let prefs = readXmasPrefs();
    document.documentElement.dataset.xmas = prefs.on ? 'on' : 'off';
    document.documentElement.dataset.xmasLights = prefs.on && prefs.lights ? 'on' : 'off';

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let flakes = [];
    let raf = 0;
    let running = false;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();

    const seed = () => {
      const n = Math.min(400, Math.max(10, prefs.flakes));
      flakes = Array.from({ length: n }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: 0.8 + Math.random() * 2.4,
        vy: 0.4 + Math.random() * 1.1,
        vx: -0.3 + Math.random() * 0.6,
        wobble: Math.random() * Math.PI * 2
      }));
    };

    const draw = () => {
      if (!running) return;
      const v = Math.min(4, Math.max(0.1, prefs.speed / 100));
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      flakes.forEach((f) => {
        ctx.moveTo(f.x, f.y);
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      });
      ctx.fill();
      flakes.forEach((f) => {
        f.wobble += 0.02;
        f.y += f.vy * v;
        f.x += (f.vx + Math.sin(f.wobble) * 0.4) * v;
        if (f.y > canvas.height + 6) { f.y = -6; f.x = Math.random() * canvas.width; }
        if (f.x > canvas.width + 6) f.x = -6;
        if (f.x < -6) f.x = canvas.width + 6;
      });
      raf = requestAnimationFrame(draw);
    };

    const start = () => {
      if (running || !prefs.on) return;
      seed();
      running = true;
      raf = requestAnimationFrame(draw);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    const onPrefs = (e) => {
      prefs = { ...XMAS_DEFAULTS, ...(e.detail || readXmasPrefs()) };
      document.documentElement.dataset.xmas = prefs.on ? 'on' : 'off';
      document.documentElement.dataset.xmasLights = prefs.on && prefs.lights ? 'on' : 'off';
      stop();
      start();
    };

    start();
    window.addEventListener('resize', resize);
    window.addEventListener('bf:xmas', onPrefs);
    return () => {
      stop();
      window.removeEventListener('resize', resize);
      window.removeEventListener('bf:xmas', onPrefs);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="snowfall-layer pointer-events-none fixed inset-0 z-[60]"
      aria-hidden="true"
    />
  );
}
