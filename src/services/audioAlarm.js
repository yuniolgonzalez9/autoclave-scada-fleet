// =========================================================================
// MOTOR DE SIRENA INDUSTRIAL BIOMÉDICA CON DESBLOQUEO AUTOMÁTICO
// =========================================================================
let audioCtx = null;
let sirenaInterval = null;
let sirenaActiva = false;

// Desbloquear audio en el primer toque del usuario en la pantalla
export const initAudioUnlock = () => {
  const unlock = () => {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    window.removeEventListener('click', unlock);
    window.removeEventListener('touchstart', unlock);
  };
  window.addEventListener('click', unlock);
  window.addEventListener('touchstart', unlock);
};

function sonarRafagaAlarma() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(850, t);
    osc.frequency.exponentialRampToValueAtTime(1250, t + 0.25);
    osc.frequency.exponentialRampToValueAtTime(850, t + 0.5);
    osc.frequency.exponentialRampToValueAtTime(1250, t + 0.75);
    osc.frequency.exponentialRampToValueAtTime(850, t + 1.0);

    gain.gain.setValueAtTime(0.75, t);
    gain.gain.setValueAtTime(0.75, t + 1.0);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 1.25);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 1.25);
  } catch (e) {
    console.warn('[AUDIO] Restricción de reproducción:', e);
  }
}

export const startIndustrialSiren = () => {
  if (sirenaActiva) return;
  sirenaActiva = true;
  sonarRafagaAlarma();
  sirenaInterval = setInterval(() => {
    if (sirenaActiva) {
      sonarRafagaAlarma();
    } else {
      clearInterval(sirenaInterval);
    }
  }, 1400);
};

export const stopIndustrialSiren = () => {
  sirenaActiva = false;
  if (sirenaInterval) clearInterval(sirenaInterval);
};

export const isSirenPlaying = () => sirenaActiva;
