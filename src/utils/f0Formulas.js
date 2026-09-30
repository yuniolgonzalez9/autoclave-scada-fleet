/**
 * MOTOR BIOMÉDICO DE CÁLCULO DE LETALIDAD TÉRMICA (F0)
 * Norma: ISO 17665 / Farmacopea Europea / USP
 * Temperatura de Referencia (Tref): 121.1 °C
 * Valor Z: 10.0 °C (Clostridium botulinum / Geobacillus stearothermophilus)
 */

export const T_REF = 121.1;
export const Z_VALUE = 10.0;
export const F0_TARGET_MIN = 15.0; // Mínimo para esterilización hospitalaria clase B

/**
 * Calcula la tasa de letalidad instantánea L(T)
 * L = 10^((T - 121.1) / 10)
 */
export const calculateInstantLethality = (temperature) => {
  if (temperature < 100.0) return 0; // Por debajo de 100°C la letalidad microbiológica es despreciable
  return Math.pow(10, (temperature - T_REF) / Z_VALUE);
};

/**
 * Acumula el F0 en base al diferencial de tiempo dt en segundos
 * dt_minutes = dt_seconds / 60
 */
export const accumulateF0 = (currentF0, temperature, dtSeconds = 1) => {
  const L = calculateInstantLethality(temperature);
  const deltaF0 = L * (dtSeconds / 60.0);
  return Number((currentF0 + deltaF0).toFixed(2));
};

/**
 * Evalúa si el ciclo ha alcanzado esterilidad matemática segura
 */
export const evaluateCycleStatus = (f0, temp, pressure, phase) => {
  if (f0 >= F0_TARGET_MIN && phase === 'SECADO') {
    return { status: 'VALIDADO_EXITOSO', color: 'emerald', label: 'ESTERILIZACIÓN VÁLIDA (F0 ≥ 15)' };
  }
  if (temp > 138.0 || pressure > 2.6) {
    return { status: 'ALARMA_SOBREPRESION', color: 'rose', label: 'ALARMA: PARÁMETROS CRÍTICOS EXCEDIDOS' };
  }
  if (phase === 'ESTERILIZACION') {
    return { status: 'EN_MESETA_TERMICA', color: 'cyan', label: 'ESTERILIZANDO (INTEGRANDO F0)' };
  }
  return { status: 'OPERACION_NORMAL', color: 'blue', label: 'CICLO EN CURSO' };
};
