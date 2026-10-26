export const WIDGET_COLORS = {
  cyan: { text: 'text-cyan-300', ring: 'border-cyan-500/40', stroke: '#22d3ee', bg: 'bg-cyan-500', soft: 'bg-cyan-500/15' },
  emerald: { text: 'text-emerald-300', ring: 'border-emerald-500/40', stroke: '#34d399', bg: 'bg-emerald-500', soft: 'bg-emerald-500/15' },
  amber: { text: 'text-amber-300', ring: 'border-amber-500/40', stroke: '#fbbf24', bg: 'bg-amber-500', soft: 'bg-amber-500/15' },
  rose: { text: 'text-rose-300', ring: 'border-rose-500/40', stroke: '#fb7185', bg: 'bg-rose-500', soft: 'bg-rose-500/15' },
  violet: { text: 'text-violet-300', ring: 'border-violet-500/40', stroke: '#a78bfa', bg: 'bg-violet-500', soft: 'bg-violet-500/15' },
  sky: { text: 'text-sky-300', ring: 'border-sky-500/40', stroke: '#38bdf8', bg: 'bg-sky-500', soft: 'bg-sky-500/15' }
};

export const DATA_KEYS = [
  { key: 'temp_camara', label: 'Temperatura de cámara', unit: '°C', min: 0, max: 150 },
  { key: 'presion', label: 'Presión de vapor', unit: 'bar', min: 0, max: 4 },
  { key: 'f0_score', label: 'Letalidad F0', unit: 'min', min: 0, max: 30 },
  { key: 'seg_restantes', label: 'Tiempo restante', unit: 's', min: 0, max: 3600 },
  { key: 'cfg.sp_temp', label: 'Setpoint de temperatura', unit: '°C', min: 100, max: 140 },
  { key: 'cfg.ciclos', label: 'Ciclos del equipo', unit: '', min: 0, max: 1000 },
  { key: 'bateria_v', label: 'Batería', unit: 'V', min: 0, max: 16 },
  { key: 'velocidad', label: 'Velocidad', unit: 'km/h', min: 0, max: 180 },
  { key: 'rpm', label: 'RPM motor', unit: 'rpm', min: 0, max: 7000 },
  { key: 'combustible', label: 'Combustible', unit: '%', min: 0, max: 100 }
];

export const WIDGET_LIBRARY = [
  { type: 'GAUGE', label: 'Medidor circular', category: 'Lectura', description: 'Aguja radial con rango mín./máx.', defaults: { key: 'temp_camara', size: 'md', color: 'cyan' } },
  { type: 'VALUE', label: 'Valor numérico', category: 'Lectura', description: 'Cifra grande con unidad', defaults: { key: 'presion', size: 'sm', color: 'sky' } },
  { type: 'TREND', label: 'Tendencia', category: 'Lectura', description: 'Mini gráfica de las últimas lecturas', defaults: { key: 'temperature', size: 'md', color: 'emerald' } },
  { type: 'TIMER', label: 'Cronómetro de ciclo', category: 'Lectura', description: 'Tiempo restante del ciclo', defaults: { key: 'seg_restantes', size: 'sm', color: 'amber' } },
  { type: 'PHASE', label: 'Fase del proceso', category: 'Lectura', description: 'Etapa actual informada por la placa', defaults: { size: 'sm', color: 'violet' } },
  { type: 'PROGRESS', label: 'Barra de odómetro', category: 'Lectura', description: 'Uso respecto al límite de mantenimiento', defaults: { size: 'md', color: 'emerald' } },
  { type: 'STATUS_LED', label: 'Indicador LED', category: 'Estado', description: 'Relé, entrada digital o señal booleana', defaults: { key: 'entradas.IN1', size: 'sm', color: 'emerald' } },
  { type: 'SWITCH_TOGGLE', label: 'Interruptor de relé', category: 'Control', description: 'Enciende o apaga una salida R1–R8', defaults: { canal: 1, size: 'sm', color: 'cyan' } },
  { type: 'PUSH_BUTTON', label: 'Botón de comando', category: 'Control', description: 'Envía un comando MQTT personalizado', defaults: { cmd: { cmd: 'RESET_ALARMA' }, size: 'sm', color: 'amber', confirm: true } },
  { type: 'SLIDER', label: 'Deslizador de ajuste', category: 'Control', description: 'Ajusta un parámetro de configuración', defaults: { key: 'sp_temp', min: 100, max: 140, step: 1, size: 'md', color: 'rose' } }
];

export const LIBRARY_BY_TYPE = Object.fromEntries(WIDGET_LIBRARY.map((w) => [w.type, w]));

const LEGACY_TYPES = { SWITCH: 'SWITCH_TOGGLE', TOGGLE: 'SWITCH_TOGGLE', BUTTON: 'PUSH_BUTTON', BOTON: 'PUSH_BUTTON', INDICADOR: 'STATUS_LED', LED: 'STATUS_LED', NUMERO: 'VALUE', GRAFICA: 'TREND', CHART: 'TREND' };

export function dataKeyInfo(key) {
  return DATA_KEYS.find((k) => k.key === key) || null;
}

export function normalizeWidget(raw, index = 0) {
  const rawType = String(raw?.widget_type || raw?.tipo || raw?.type || 'VALUE').toUpperCase();
  const type = LIBRARY_BY_TYPE[rawType] ? rawType : (LEGACY_TYPES[rawType] || 'VALUE');
  const base = LIBRARY_BY_TYPE[type].defaults;
  const canal = Number(raw?.canal || raw?.action?.payload?.rele?.replace?.('R', '') || base.canal || 1);
  const info = dataKeyInfo(raw?.key || base.key);
  return {
    ...base,
    ...raw,
    id: raw?.id || `w_${Date.now().toString(36)}_${index}`,
    widget_type: type,
    label: raw?.label || raw?.titulo || (type === 'SWITCH_TOGGLE' ? `Relé R${canal}` : info?.label) || LIBRARY_BY_TYPE[type].label,
    color: WIDGET_COLORS[raw?.color] ? raw.color : base.color,
    size: ['sm', 'md', 'lg'].includes(raw?.size) ? raw.size : base.size,
    canal,
    unit: raw?.unit ?? info?.unit ?? '',
    min: Number(raw?.min ?? info?.min ?? base.min ?? 0),
    max: Number(raw?.max ?? info?.max ?? base.max ?? 100),
    span: [1, 2, 3, 4].includes(Number(raw?.span))
      ? Number(raw.span)
      : ({ sm: 1, md: 2, lg: 4 })[['sm', 'md', 'lg'].includes(raw?.size) ? raw.size : base.size] || 1,
    scale: Number.isFinite(Number(raw?.scale)) ? Math.min(2.5, Math.max(0.5, Number(raw.scale))) : 1
  };
}

export function createWidget(type) {
  return normalizeWidget({ widget_type: type, id: `w_${Date.now().toString(36)}` });
}

export function defaultWidgetsFor(tipo, nombresReles = {}) {
  const t = (tipo || 'AUTOCLAVE').toUpperCase();
  const relays = Object.keys(nombresReles).length ? Object.keys(nombresReles) : ['R1', 'R2', 'R5', 'R6'];
  const relayWidgets = relays.slice(0, 4).map((r, i) => ({ widget_type: 'SWITCH_TOGGLE', canal: Number(r.replace('R', '')), label: nombresReles[r] || `Relé ${r}`, color: 'cyan', id: `def_relay_${i}` }));
  if (t === 'VEHICULO') {
    return [
      { widget_type: 'GAUGE', key: 'velocidad', color: 'cyan', id: 'def_vel' },
      { widget_type: 'GAUGE', key: 'rpm', color: 'amber', id: 'def_rpm' },
      { widget_type: 'VALUE', key: 'bateria_v', color: 'emerald', id: 'def_bat' },
      { widget_type: 'VALUE', key: 'combustible', color: 'sky', id: 'def_fuel' },
      { widget_type: 'PHASE', id: 'def_phase' },
      ...relayWidgets
    ].map(normalizeWidget);
  }
  return [
    { widget_type: 'GAUGE', key: 'temp_camara', color: 'cyan', id: 'def_temp' },
    { widget_type: 'GAUGE', key: 'presion', color: 'rose', id: 'def_pres' },
    { widget_type: 'VALUE', key: 'f0_score', color: 'emerald', id: 'def_f0' },
    { widget_type: 'TIMER', id: 'def_timer' },
    { widget_type: 'TREND', key: 'temperature', label: 'Curva de temperatura', color: 'emerald', size: 'lg', id: 'def_trend' },
    { widget_type: 'PHASE', id: 'def_phase' },
    { widget_type: 'PROGRESS', label: 'Odómetro de servicio', id: 'def_odo' },
    ...relayWidgets
  ].map(normalizeWidget);
}

export function readValue(device, key) {
  if (!key) return undefined;
  const datos = device?.datos || {};
  if (key === 'f0_score' && datos.f0_score === undefined) return device?.f0Score;
  return key.split('.').reduce((acc, part) => (acc == null ? undefined : acc[part]), datos);
}
