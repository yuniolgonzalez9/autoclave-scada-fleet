// Preferencias de movimiento por terminal: transparencia, efectos,
// láseres y transiciones de sección. Persisten en localStorage y se
// aplican vía atributos en <html> + playbackRate global por tipo.
const KEY = 'biofleet_motion_prefs';

export const MOTION_DEFAULTS = {
  glassOn: true,
  animOn: true,
  animSpeed: 100,
  laserOn: true,
  laserSpeed: 100,
  transOn: true,
  transSpeed: 100
};

export function readMotionPrefs() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...MOTION_DEFAULTS, ...JSON.parse(raw) } : { ...MOTION_DEFAULTS };
  } catch (_) {
    return { ...MOTION_DEFAULTS };
  }
}

let animRate = 1;
let transRate = 1;
let controllerInstalled = false;

const isSectionEnterAnim = (a) =>
  Boolean(a.animationName && /swipeEnter|appSectionReveal|androidViewEnter/i.test(a.animationName));

function applyRate(animations) {
  animations.forEach((a) => {
    try {
      const isTransition = a.transitionProperty !== undefined;
      const rate = (isTransition || isSectionEnterAnim(a)) ? transRate : animRate;
      if (a.playbackRate !== rate) a.playbackRate = rate;
    } catch (_) {}
  });
}

function applyRateToAll() {
  try { applyRate(document.getAnimations()); } catch (_) {}
}

// Solo se ajustan las animaciones del elemento que acaba de arrancar una
// (antes se recorrían TODAS las del documento en cada transición).
function installSpeedController() {
  if (controllerInstalled || typeof document === 'undefined') return;
  controllerInstalled = true;
  let rafId = 0;
  const pending = new Set();
  const schedule = (event) => {
    if (animRate === 1 && transRate === 1) return;
    if (event?.target instanceof Element) pending.add(event.target);
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      pending.forEach((el) => {
        try { applyRate(el.getAnimations({ subtree: true })); } catch (_) {}
      });
      pending.clear();
    });
  };
  document.addEventListener('animationstart', schedule, true);
  document.addEventListener('transitionrun', schedule, true);
}

export function applyMotionPrefs(prefs) {
  const p = { ...MOTION_DEFAULTS, ...prefs };
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (_) {}
  const el = document.documentElement;
  el.dataset.anim = p.animOn ? 'on' : 'off';
  el.dataset.laser = p.laserOn ? 'on' : 'off';
  el.dataset.glass = p.glassOn ? 'on' : 'off';
  el.dataset.trans = p.transOn ? 'on' : 'off';
  animRate = p.animOn ? Math.min(4, Math.max(0.1, (p.animSpeed || 100) / 100)) : 1;
  transRate = p.transOn ? Math.min(4, Math.max(0.1, (p.transSpeed || 100) / 100)) : 1;
  installSpeedController();
  applyRateToAll();
  window.dispatchEvent(new CustomEvent('bf:motion', { detail: p }));
}

export function saveMotionPrefs(prefs) {
  const p = { ...MOTION_DEFAULTS, ...prefs };
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (_) {}
  applyMotionPrefs(p);
  return p;
}
