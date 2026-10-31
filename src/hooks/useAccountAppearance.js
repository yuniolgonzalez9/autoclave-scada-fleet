import { useEffect, useState } from 'react';
import {
  DEFAULT_APPEARANCE,
  loadAccountAppearance,
  loadLocalAppearance,
  saveAccountAppearance,
  saveLocalAppearance
} from '../services/appearancePreferences';

export function useAccountAppearance(profile, authMode) {
  const userId = profile?.id || profile?.user_id || null;
  const [appearance, setAppearance] = useState({ ...DEFAULT_APPEARANCE });
  const [loadedUserId, setLoadedUserId] = useState(null);
  const [syncStatus, setSyncStatus] = useState('idle');

  useEffect(() => {
    let cancelled = false;
    const init = setTimeout(() => {
      setLoadedUserId(null);
      setSyncStatus('idle');

    if (!userId) {
      setAppearance({ ...DEFAULT_APPEARANCE });
      return undefined;
    }

    const load = async () => {
      if (!authMode) {
        setAppearance(loadLocalAppearance(userId));
        setSyncStatus('local');
        setLoadedUserId(userId);
        return;
      }

      setSyncStatus('loading');
      const result = await loadAccountAppearance(userId);
      if (cancelled) return;
      setAppearance(result.preferences);
      setSyncStatus(result.synchronized ? 'synced' : 'local');
      setLoadedUserId(userId);
    };

    load().catch((error) => {
      console.error('[APPEARANCE] No se pudieron cargar las preferencias:', error);
      if (!cancelled) {
        setAppearance(loadLocalAppearance(userId));
        setSyncStatus('local');
        setLoadedUserId(userId);
      }
    });
    }, 0);

    return () => { cancelled = true; clearTimeout(init); };
  }, [userId, authMode]);

  useEffect(() => {
    if (!userId || loadedUserId !== userId) return undefined;
    const timer = window.setTimeout(async () => {
      setSyncStatus(authMode ? 'saving' : 'local');
      if (!authMode) {
        saveLocalAppearance(userId, appearance);
        setSyncStatus('local');
        return;
      }

      const result = await saveAccountAppearance(userId, appearance);
      setSyncStatus(result.synchronized ? 'synced' : 'local');
    }, authMode ? 500 : 0);

    return () => window.clearTimeout(timer);
  }, [userId, loadedUserId, authMode, appearance]);

  return { appearance, setAppearance, syncStatus };
}