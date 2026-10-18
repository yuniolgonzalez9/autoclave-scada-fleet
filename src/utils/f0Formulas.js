export const T_REF = 121.11;
export const Z_VALUE = 10.0;
export const F0_TARGET_MIN = 15.0;
export const T_MIN_LETHALITY = 100.0;

export const calculateInstantLethality = (temperature) => {
  const tempNum = parseFloat(temperature);
  if (isNaN(tempNum) || tempNum < T_MIN_LETHALITY) {
    return 0.0;
  }
  const clampedTemp = Math.min(150.0, tempNum);
  return Math.pow(10, (clampedTemp - T_REF) / Z_VALUE);
};

export const accumulateF0 = (currentF0, temperature, dtSeconds = 1) => {
  const baseF0 = (typeof currentF0 === 'number' && !isNaN(currentF0)) ? currentF0 : 0.0;
  const dt = (typeof dtSeconds === 'number' && dtSeconds > 0) ? dtSeconds : 1;

  const L = calculateInstantLethality(temperature);
  if (L <= 0) return baseF0;

  const deltaF0 = L * (dt / 60.0);
  return Number((baseF0 + deltaF0).toFixed(2));
};

export const evaluateCycleStatus = (f0 = 0, temp = 25, pressure = 0, phase = 'ESPERA') => {
  const f0Num = parseFloat(f0) || 0;
  const tempNum = parseFloat(temp) || 25;
  const presNum = parseFloat(pressure) || 0;
  const cleanPhase = String(phase).toUpperCase();

  if (tempNum > 138.5 || presNum > 2.65) {
    return { status: 'ALARMA_CRITICA', label: 'ALARMA: LÍMITES CRÍTICOS EXCEDIDOS' };
  }
  if (f0Num >= F0_TARGET_MIN && (cleanPhase === 'SECADO' || cleanPhase === 'FINALIZADO CON EXITO')) {
    return { status: 'VALIDADO_EXITOSO', label: `ESTERILIZACIÓN CONFORME (F0 ≥ 15 min)` };
  }
  if (cleanPhase.includes('ESTERILIZ') || cleanPhase.includes('MESETA')) {
    return { status: 'EN_MESETA_TERMICA', label: 'ESTERILIZANDO (F0 EN CURSO)' };
  }
  return { status: 'OPERACION_NORMAL', label: cleanPhase || 'EN ESPERA' };
};
