import { supabase } from './supabase';

export const DEFAULT_APPEARANCE = {
  theme: 'aurum',
  background: 'planet-nodes',
  opacity: 100,
  glassOn: true,
  animOn: true,
  animSpeed: 100,
  laserOn: true,
  laserSpeed: 100,
  transOn: true,
  transSpeed: 100
};

const MOTION_BOOL_KEYS = ['glassOn', 'animOn', 'laserOn', 'transOn'];
const MOTION_SPEED_LIMITS = { animSpeed: 300, laserSpeed: 600, transSpeed: 300 };

function normalizeAppearance(value = {}) {
  const base = {
    theme: ['industrial', 'aurum', 'gold', 'tactical', 'cyber', 'hybrid', 'platinum', 'onyx', 'obsidian'].includes(value.theme) ? value.theme : DEFAULT_APPEARANCE.theme,
    background: [
      'solid', 'navy-solid', 'carbon-solid', 'forest-solid', 'wine-solid',
      'aurum-gradient', 'ice-gradient', 'violet-gradient', 'mint-gradient', 'champagne-gradient',
      'oled',
      'server-datacenter', 'hospital-corridor', 'medical-lab',
      'circuit-pcb', 'motherboard-gold', 'chip-macro', 'server-racks',
      'planet-nodes', 'cyber-matrix', 'quantum-connections',
      'circuit-city', 'aerial-highways', 'city-lights-grid', 'neon-skyline', 'night-aerial'
    ].includes(value.background) ? value.background : DEFAULT_APPEARANCE.background,
    opacity: Number.isFinite(Number(value.opacity))
      ? Math.min(100, Math.max(0, Math.round(Number(value.opacity))))
      : DEFAULT_APPEARANCE.opacity
  };
  MOTION_BOOL_KEYS.forEach((k) => {
    base[k] = typeof value[k] === 'boolean' ? value[k] : DEFAULT_APPEARANCE[k];
  });
  Object.entries(MOTION_SPEED_LIMITS).forEach(([k, max]) => {
    base[k] = Number.isFinite(Number(value[k]))
      ? Math.min(max, Math.max(10, Math.round(Number(value[k]))))
      : DEFAULT_APPEARANCE[k];
  });
  return base;
}

function localKey(userId) {
  return `biofleet_appearance_${userId}`;
}

export function loadLocalAppearance(userId) {
  if (!userId) return { ...DEFAULT_APPEARANCE };
  try {
    const stored = localStorage.getItem(localKey(userId));
    if (stored) return normalizeAppearance(JSON.parse(stored));

    const legacy = normalizeAppearance({
      theme: localStorage.getItem('scada_theme'),
      background: localStorage.getItem('scada_bg'),
      opacity: localStorage.getItem('scada_transparency')
    });
    saveLocalAppearance(userId, legacy);
    return legacy;
  } catch (_) {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function saveLocalAppearance(userId, preferences) {
  if (!userId) return;
  localStorage.setItem(localKey(userId), JSON.stringify(normalizeAppearance(preferences)));
}

export async function loadAccountAppearance(userId) {
  const fallback = loadLocalAppearance(userId);
  if (!userId) return { preferences: fallback, synchronized: false };

  const { data, error } = await supabase.rpc('get_my_appearance_preferences');
  if (error) return { preferences: fallback, synchronized: false };

  const preferences = normalizeAppearance(data || fallback);
  saveLocalAppearance(userId, preferences);
  return { preferences, synchronized: true };
}

export async function saveAccountAppearance(userId, preferences) {
  const safePreferences = normalizeAppearance(preferences);
  saveLocalAppearance(userId, safePreferences);
  if (!userId) return { synchronized: false };

  const { error } = await supabase.rpc('save_my_appearance_preferences', {
    p_preferences: safePreferences
  });

  return { synchronized: !error, error: error || null };
}