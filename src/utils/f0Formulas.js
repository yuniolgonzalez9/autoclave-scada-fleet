/**
 * =========================================================================
 * MOTOR BIOMÉDICO DE CÁLCULO DE LETALIDAD TÉRMICA (F0)
 * Normativa: ISO 17665 / Farmacopea Europea / USP (United States Pharmacopeia)
 * =========================================================================
 * - Temperatura de Referencia (Tref): 121.1 °C
 * - Valor Z: 10.0 °C (Específico para esporas de Geobacillus stearothermophilus)
 * - Umbral mínimo de activación: 100.0 °C
 * - Meta hospitalaria estándar (Clase B): F0 >= 15.0 minutos
 */

export const T_REF = 121.11;
export const Z_VALUE = 10.0;
export const F0_TARGET_MIN = 15.0; // Minutos equivalentes mínimos requeridos
export const T_MIN_LETHALITY = 100.0; // Por debajo de 100°C la letalidad es microbiológicamente despreciable

/**
 * Calcula la tasa de letalidad instantánea L(T)
 * Fórmula: L = 10^((T - 121.11) / 10)
 * 
 * @param {number} temperature Temperatura en grados Celsius (°C)
 * @returns {number} Tasa de letalidad por minuto
 */
export const calculateInstantLethality = (temperature) => {
  const tempNum = parseFloat(temperature);
  if (isNaN(tempNum) || tempNum < T_MIN_LETHALITY) {
    return 0.0;
  }
  // Límite físico de seguridad para evitar infinitos en cálculo
  const clampedTemp = Math.min(150.0, tempNum);
  return Math.pow(10, (clampedTemp - T_REF) / Z_VALUE);
};

/**
 * Acumula el valor de F0 por método trapezoidal / rectangular
 * 
 * @param {number} currentF0 Valor acumulado actual de F0 (en minutos)
 * @param {number} temperature Temperatura actual de la cámara (°C)
 * @param {number} dtSeconds Diferencial de tiempo transcurrido en segundos (por defecto 1s)
 * @returns {number} Nuevo valor acumulado de F0 redondeado a 2 decimales
 */
export const accumulateF0 = (currentF0, temperature, dtSeconds = 1) => {
  const baseF0 = (typeof currentF0 === 'number' && !isNaN(currentF0)) ? currentF0 : 0.0;
  const dt = (typeof dtSeconds === 'number' && dtSeconds > 0) ? dtSeconds : 1;

  const L = calculateInstantLethality(temperature);
  if (L <= 0) return baseF0;

  const deltaF0 = L * (dt / 60.0);
  return Number((baseF0 + deltaF0).toFixed(2));
};

/**
 * Calcula el porcentaje de avance hacia la meta estéril (0% a 100%)
 * 
 * @param {number} f0Score Valor F0 actual
 * @param {number} target F0 objetivo (por defecto 15.0 min)
 * @returns {number} Porcentaje entero de 0 a 100
 */
export const getLethalityProgress = (f0Score = 0.0, target = F0_TARGET_MIN) => {
  const current = Math.max(0, parseFloat(f0Score) || 0);
  const goal = Math.max(1, parseFloat(target) || F0_TARGET_MIN);
  return Math.min(100, Math.round((current / goal) * 100));
};

/**
 * Evalúa el estado del ciclo según letalidad, presión, temperatura y fase
 * 
 * @param {number} f0 Valor F0 acumulado
 * @param {number} temp Temperatura de cámara (°C)
 * @param {number} pressure Presión absoluta (bar)
 * @param {string} phase Fase actual informada por el ESP32
 * @returns {object} Diagnóstico con estado, clase visual y etiqueta informativa
 */
export const evaluateCycleStatus = (f0 = 0, temp = 25, pressure = 0, phase = 'ESPERA') => {
  const f0Num = parseFloat(f0) || 0;
  const tempNum = parseFloat(temp) || 25;
  const presNum = parseFloat(pressure) || 0;
  const cleanPhase = String(phase).toUpperCase();

  // 1. Alarmas críticas de sobrepresión o exceso térmico
  if (tempNum > 138.5 || presNum > 2.65) {
    return {
      status: 'ALARMA_CRITICA',
      color: 'rose',
      colorClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      label: 'ALARMA: LÍMITES CRÍTICOS EXCEDIDOS'
    };
  }

  // 2. Validación de esterilidad cumplida
  if (f0Num >= F0_TARGET_MIN && (cleanPhase === 'SECADO' || cleanPhase === 'FINALIZADO CON EXITO')) {
    return {
      status: 'VALIDADO_EXITOSO',
      color: 'emerald',
      colorClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      label: `ESTERILIZACIÓN CONFORME (F0 = ${f0Num.toFixed(1)} min)`
    };
  }

  // 3. Meseta activa (acumulando F0)
  if (cleanPhase.includes('ESTERILIZ') || cleanPhase.includes('MESETA')) {
    return {
      status: 'EN_MESETA_TERMICA',
      color: 'cyan',
      colorClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-400',
      label: `ESTERILIZANDO (F0: ${f0Num.toFixed(1)} / ${F0_TARGET_MIN} min)`
    };
  }

  // 4. Prevacío o calentamiento
  if (cleanPhase.includes('VACIO') || cleanPhase.includes('CALENT')) {
    return {
      status: 'RAMPA_TERMICA',
      color: 'amber',
      colorClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      label: `EN CURSO: ${cleanPhase}`
    };
  }

  // 5. Reposo o espera
  return {
    status: 'OPERACION_NORMAL',
    color: 'blue',
    colorClass: 'bg-slate-800 text-slate-300 border-slate-700',
    label: cleanPhase || 'EN ESPERA'
  };
};
