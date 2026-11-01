import { useEffect, useRef } from 'react';

const KEY = 'biofleet_xmas';
const LOCAL_OFF_KEY = 'biofleet_xmas_localoff';
export const XMAS_DEFAULTS = { on: false, flakes: 120, speed: 100, lights: true, garland: true, frost: true, caps: true };

export function readXmasPrefs() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...XMAS_DEFAULTS, ...JSON.parse(raw) } : { ...XMAS_DEFAULTS };
  } catch (_) {
    return { ...XMAS_DEFAULTS };
  }
}

// El usuario normal puede optar por NO ver los efectos navideños aunque el
// superadmin los tenga activados globalmente (opt-out por dispositivo).
export function markLocalXmasOff(off) {
  try {
    if (off) localStorage.setItem(LOCAL_OFF_KEY, '1');
    else localStorage.removeItem(LOCAL_OFF_KEY);
  } catch (_) {}
}

export function isLocalXmasOff() {
  try { return localStorage.getItem(LOCAL_OFF_KEY) === '1'; } catch (_) { return false; }
}

// Llamado por App cuando llega el switch global desde la nube:
// si el usuario no hizo opt-out local, el valor global manda.
export function applyGlobalXmas(globalPrefs) {
  const g = { ...XMAS_DEFAULTS, ...(globalPrefs || {}) };
  const effective = isLocalXmasOff() ? { ...g, on: false } : g;
  try { localStorage.setItem(KEY, JSON.stringify(effective)); } catch (_) {}
  document.documentElement.dataset.xmas = effective.on ? 'on' : 'off';
  document.documentElement.dataset.xmasLights = effective.on && effective.lights ? 'on' : 'off';
  document.documentElement.dataset.xmasGarland = effective.on && effective.garland ? 'on' : 'off';
  window.dispatchEvent(new CustomEvent('bf:xmas', { detail: effective }));
}

export function applyXmasPrefs(prefs) {
  const p = { ...XMAS_DEFAULTS, ...prefs };
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (_) {}
  document.documentElement.dataset.xmas = p.on ? 'on' : 'off';
  document.documentElement.dataset.xmasLights = p.on && p.lights ? 'on' : 'off';
  document.documentElement.dataset.xmasGarland = p.on && p.garland ? 'on' : 'off';
  window.dispatchEvent(new CustomEvent('bf:xmas', { detail: p }));
  return p;
}

export function saveXmasPrefs(prefs, { localOnly = false } = {}) {
  // Opt-out local: si un usuario normal apaga la nieve mientras el switch
  // global está ON, recordamos su decisión para no reactivarla.
  // Encenderla explícitamente SIEMPRE limpia el opt-out (usuario o admin).
  if (prefs.on === true) markLocalXmasOff(false);
  else if (localOnly && prefs.on === false) markLocalXmasOff(true);
  return applyXmasPrefs(prefs);
}

// Capa de nieve en canvas: ajustable en cantidad y velocidad.
export default function SnowfallLayer() {
  const canvasRef = useRef(null);

  useEffect(() => {
    let prefs = readXmasPrefs();
    document.documentElement.dataset.xmas = prefs.on ? 'on' : 'off';
    document.documentElement.dataset.xmasLights = prefs.on && prefs.lights ? 'on' : 'off';
    document.documentElement.dataset.xmasGarland = prefs.on && prefs.garland ? 'on' : 'off';

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
        wobble: Math.random() * Math.PI * 2,
        // ~30% son copos tipo dendrita (❄ con puntas), el resto puntos
        dendrite: Math.random() < 0.3,
        arms: 6,
        spin: Math.random() * Math.PI * 2,
        spinV: (Math.random() - 0.5) * 0.03
      }));
    };

    const draw = () => {
      if (!running) return;
      const v = Math.min(4, Math.max(0.1, prefs.speed / 100));
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      flakes.forEach((f) => {
        if (f.dendrite) return;
        ctx.moveTo(f.x, f.y);
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      });
      ctx.fill();
      // Copos tipo dendrita: 6 brazos con ramitas — la forma clásica ❄
      flakes.forEach((f) => {
        if (!f.dendrite) return;
        const R = f.r * 2.6;
        ctx.beginPath();
        for (let a = 0; a < f.arms; a++) {
          const ang = f.spin + (a * Math.PI * 2) / f.arms;
          const cos = Math.cos(ang), sin = Math.sin(ang);
          ctx.moveTo(f.x, f.y);
          ctx.lineTo(f.x + cos * R, f.y + sin * R);
          // ramitas laterales a medio brazo
          const mx = f.x + cos * R * 0.55, my = f.y + sin * R * 0.55;
          const b1 = ang + 0.55, b2 = ang - 0.55, bs = R * 0.28;
          ctx.moveTo(mx, my);
          ctx.lineTo(mx + Math.cos(b1) * bs, my + Math.sin(b1) * bs);
          ctx.moveTo(mx, my);
          ctx.lineTo(mx + Math.cos(b2) * bs, my + Math.sin(b2) * bs);
        }
        ctx.stroke();
        f.spin += f.spinV;
      });
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
      document.documentElement.dataset.xmasGarland = prefs.on && prefs.garland ? 'on' : 'off';
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
