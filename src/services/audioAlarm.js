/**
 * =========================================================================
 * MOTOR DE SIRENA INDUSTRIAL BIOMÉDICA & SÍNTESIS DE AUDIO PURO
 * =========================================================================
 * No requiere archivos MP3/WAV externos (100% sintetizado por Web Audio API).
 * Cumple con normativas de alarmas de emergencia y bypass de autoplay.
 */

let audioCtx = null;
let masterGain = null;
let sirenaInterval = null;
let sirenaActiva = false;
let audioUnlocked = false;

// Obtiene o inicializa de forma segura el contexto de audio.
// El contexto solo se crea tras un gesto del usuario (política de autoplay).
function getAudioContext() {
  if (typeof window === 'undefined' || !audioUnlocked) return null;

  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
      masterGain = audioCtx.createGain();
      masterGain.connect(audioCtx.destination);
    }
  }

  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }

  return audioCtx;
}

/**
 * Desbloquea el motor de audio en la primera interacción física del usuario
 */
export const initAudioUnlock = () => {
  if (typeof window === 'undefined') return;

  const unlock = () => {
    audioUnlocked = true;
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    window.removeEventListener('click', unlock);
    window.removeEventListener('touchstart', unlock);
    window.removeEventListener('keydown', unlock);
  };

  window.addEventListener('click', unlock, { passive: true });
  window.addEventListener('touchstart', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
};

/**
 * Emite una ráfaga modulada en diente de sierra (850 Hz <-> 1250 Hz)
 */
function sonarRafagaAlarma() {
  try {
    const ctx = getAudioContext();
    if (!ctx || !masterGain || !sirenaActiva) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const burstGain = ctx.createGain();

    // Rampa de frecuencia agresiva de sirena industrial
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(850, t);
    osc.frequency.exponentialRampToValueAtTime(1250, t + 0.25);
    osc.frequency.exponentialRampToValueAtTime(850, t + 0.50);
    osc.frequency.exponentialRampToValueAtTime(1250, t + 0.75);
    osc.frequency.exponentialRampToValueAtTime(850, t + 1.00);

    // Envolvente de volumen (Attack / Decay)
    burstGain.gain.setValueAtTime(0.70, t);
    burstGain.gain.setValueAtTime(0.70, t + 1.00);
    burstGain.gain.exponentialRampToValueAtTime(0.001, t + 1.25);

    osc.connect(burstGain);
    burstGain.connect(masterGain);

    osc.start(t);
    osc.stop(t + 1.25);
  } catch (e) {
    console.warn('[AUDIO] Restricción de síntesis:', e);
  }
}

/**
 * Inicia el bucle de sirena de emergencia
 */
export const startIndustrialSiren = () => {
  if (sirenaActiva) return;
  sirenaActiva = true;

  const ctx = getAudioContext();
  if (ctx && masterGain) {
    masterGain.gain.setValueAtTime(1.0, ctx.currentTime);
  }

  sonarRafagaAlarma();

  if (sirenaInterval) clearInterval(sirenaInterval);
  sirenaInterval = setInterval(() => {
    if (sirenaActiva) {
      sonarRafagaAlarma();
    } else {
      clearInterval(sirenaInterval);
      sirenaInterval = null;
    }
  }, 1350);
};

/**
 * Silencia la sirena de inmediato (Corte instantáneo en 0ms)
 */
export const stopIndustrialSiren = () => {
  sirenaActiva = false;
  if (sirenaInterval) {
    clearInterval(sirenaInterval);
    sirenaInterval = null;
  }

  // Corta el audio en el milisegundo exacto
  if (audioCtx && masterGain) {
    try {
      masterGain.gain.setValueAtTime(0.0, audioCtx.currentTime);
    } catch (_) {}
  }
};

/**
 * Verifica si la sirena está sonando actualmente
 */
export const isSirenPlaying = () => sirenaActiva;

/**
 * Timbre de campana suave — dos tonos con decaimiento natural.
 * Acompaña el sacudir visual de la campanita mientras haya alertas.
 */
export const playBellChime = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    // Timbre: golpe agudo + armónico, decaimiento tipo campanilla
    [[1760, 0, 0.20], [1318, 0.02, 0.10], [2349, 0.14, 0.12]].forEach(([freq, dt, vol]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + dt);

      gain.gain.setValueAtTime(0.0001, t + dt);
      gain.gain.exponentialRampToValueAtTime(vol, t + dt + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + dt + 0.55);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t + dt);
      osc.stop(t + dt + 0.6);
    });
  } catch (_) {}
};

/**
 * Beep corto de confirmación para acciones exitosas (QR, conmutación de relé)
 */
export const playConfirmBeep = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(1800, t + 0.08);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.12);
  } catch (_) {}
};
