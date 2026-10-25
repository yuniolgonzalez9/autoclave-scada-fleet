import { supabase } from './supabase';

export const DEFAULT_APPEARANCE = {
  theme: 'tactical',
  background: 'circuit-pcb',
  opacity: 82
};

function normalizeAppearance(value = {}) {
  return {
    theme: ['tactical', 'cyber', 'hybrid'].includes(value.theme) ? value.theme : DEFAULT_APPEARANCE.theme,
    background: [
      'circuit-pcb',
      'planet-nodes',
      'cyber-matrix',
      'motherboard-gold',
      'quantum-connections',
      'server-datacenter',
      'oled'
    ].includes(value.background) ? value.background : DEFAULT_APPEARANCE.background,
    opacity: Number.isFinite(Number(value.opacity))
      ? Math.min(100, Math.max(0, Math.round(Number(value.opacity))))
      : DEFAULT_APPEARANCE.opacity
  };
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