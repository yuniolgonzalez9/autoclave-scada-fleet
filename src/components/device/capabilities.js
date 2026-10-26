import { DATA_KEYS, normalizeWidget } from './widgetLibrary';

const AUTOCLAVE_RELAYS = {
  R1: 'Cierre sello', R2: 'Succión sello', R3: 'Alivio sello', R4: 'Bomba agua',
  R5: 'Resistencias', R6: 'Bomba vacío', R7: 'Purga / desfogue', R8: 'Esterilizar'
};

const TYPE_SENSORS = {
  AUTOCLAVE: ['temp_camara', 'presion', 'f0_score'],
  TERMODESINFECTADORA: ['temp_camara', 'f0_score'],
  VEHICULO: ['velocidad', 'rpm', 'bateria_v', 'combustible']
};

const asList = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.entries(v).map(([key, val]) => (typeof val === 'object' ? { key, ...val } : { key, label: val })) : []);
const countOf = (v) => (typeof v === 'number' ? v : Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0);

export function deriveCapabilities(device) {
  const datos = device?.datos || {};
  const meta = device?.meta || {};
  const cfg = meta.config_deseada || {};
  const esq = device?.esquema || {};
  const tipo = (meta.tipo || cfg.tipo || datos.tipo || 'AUTOCLAVE').toUpperCase();
  const nombres = { ...(tipo === 'AUTOCLAVE' ? AUTOCLAVE_RELAYS : {}), ...(cfg.nombres_reles || {}) };
  const roles = cfg.roles_reles || {};
  let source = 'tipo';

  const relayCount = Math.max(countOf(esq.reles || esq.salidas), Object.keys(datos.reles || {}).length, Object.keys(cfg.nombres_reles || {}).length);
  if (countOf(esq.reles || esq.salidas)) source = 'esquema';
  else if (Object.keys(datos.reles || {}).length) source = 'telemetría';
  const relayIds = relayCount ? Array.from({ length: relayCount }, (_, i) => `R${i + 1}`) : Object.keys(nombres);
  const relays = relayIds.map((id) => ({ id, canal: Number(id.slice(1)), label: nombres[id] || `Salida ${id}`, role: roles[id] || '' }));

  const inputCount = Math.max(countOf(esq.entradas), Object.keys(datos.entradas || {}).length);
  const inputNames = cfg.nombres_entradas || {};
  const inputs = Array.from({ length: inputCount }, (_, i) => ({ key: `entradas.IN${i + 1}`, label: inputNames[`IN${i + 1}`] || `Entrada IN${i + 1}` }));

  const announced = asList(esq.sensores);
  const sensorKeys = new Set(announced.map((s) => s.key));
  (TYPE_SENSORS[tipo] || []).forEach((k) => sensorKeys.add(k));
  DATA_KEYS.forEach((k) => { if (typeof datos[k.key] === 'number' || (typeof datos[k.key] === 'string' && datos[k.key] !== '' && !Number.isNaN(Number(datos[k.key])))) sensorKeys.add(k.key); });
  const sensors = [...sensorKeys]
    .filter((k) => !['seg_restantes', 'cfg.sp_temp', 'cfg.ciclos'].includes(k))
    .map((k) => {
      const info = DATA_KEYS.find((d) => d.key === k) || {};
      const a = announced.find((s) => s.key === k) || {};
      return { key: k, label: a.label || info.label || k, unit: a.unit ?? info.unit ?? '', min: a.min ?? info.min ?? 0, max: a.max ?? info.max ?? 100 };
    });

  const adc = { ...(datos.adc || {}) };
  const analogs = Object.keys(adc).map((k) => ({ key: `adc.${k}`, label: `Analógica ${k.toUpperCase()}` }));
  asList(esq.analogicas || esq.adc).forEach((a) => { if (!analogs.some((x) => x.key === `adc.${a.key}`)) analogs.push({ key: `adc.${a.key}`, label: a.label || `Analógica ${a.key}`, unit: a.unit }); });

  const commands = asList(esq.comandos).map((c) => ({ cmd: c.cmd || c.key, label: c.label || c.cmd || c.key, confirm: c.confirm ?? true, payload: c.payload }));
  if (!commands.length && ['AUTOCLAVE', 'TERMODESINFECTADORA'].includes(tipo)) commands.push({ cmd: 'RESET_ALARMA', label: 'Restablecer alarma', confirm: false });

  const params = asList(esq.parametros);
  if (!params.length && tipo === 'AUTOCLAVE') params.push({ key: 'sp_temp', label: 'Setpoint temperatura', min: 100, max: 140, step: 1, unit: '°C' });

  return {
    tipo,
    source,
    relays,
    inputs,
    sensors,
    analogs,
    commands,
    params,
    hasPhase: true,
    hasTimer: ['AUTOCLAVE', 'TERMODESINFECTADORA'].includes(tipo) || datos.seg_restantes !== undefined
  };
}

export function capabilitySummary(caps) {
  return [
    caps.sensors.length && `${caps.sensors.length} sensores`,
    caps.relays.length && `${caps.relays.length} salidas`,
    caps.inputs.length && `${caps.inputs.length} entradas`,
    caps.analogs.length && `${caps.analogs.length} analógicas`,
    caps.commands.length && `${caps.commands.length} comandos`
  ].filter(Boolean).join(' · ');
}

export function autoWidgetsFor(device) {
  const caps = deriveCapabilities(device);
  const colors = ['cyan', 'rose', 'emerald', 'sky', 'amber', 'violet'];
  const w = [];
  w.push({ widget_type: 'PHASE', id: 'auto_phase', size: 'md' });
  if (caps.hasTimer) w.push({ widget_type: 'TIMER', id: 'auto_timer' });
  const orderedSensors = [
    ...caps.sensors.filter((s) => s.key === 'f0_score'),
    ...caps.sensors.filter((s) => s.key !== 'f0_score')
  ];
  orderedSensors.forEach((s, i) => w.push({
    widget_type: i < 2 ? 'GAUGE' : 'VALUE', id: `auto_s_${s.key}`, key: s.key, label: s.label, unit: s.unit, min: s.min, max: s.max, color: colors[i % colors.length]
  }));
  if (caps.sensors.some((s) => s.key === 'temp_camara')) w.push({ widget_type: 'TREND', id: 'auto_trend', key: 'temperature', label: 'Curva de temperatura', size: 'lg', color: 'emerald' });
  caps.analogs.forEach((a) => w.push({ widget_type: 'VALUE', id: `auto_${a.key}`, key: a.key, label: a.label, unit: a.unit || '', color: 'sky', max: 4095 }));
  caps.params.forEach((p) => w.push({ widget_type: 'SLIDER', id: `auto_p_${p.key}`, key: p.key, label: p.label, min: p.min, max: p.max, step: p.step || 1, unit: p.unit || '', color: 'rose', size: 'md' }));
  caps.relays.forEach((r) => w.push({ widget_type: 'SWITCH_TOGGLE', id: `auto_${r.id}`, canal: r.canal, label: r.label, role: r.role, color: 'cyan', size: 'md' }));
  caps.inputs.forEach((inp) => w.push({ widget_type: 'STATUS_LED', id: `auto_${inp.key}`, key: inp.key, label: inp.label, color: 'emerald' }));
  caps.commands.forEach((c, i) => w.push({ widget_type: 'PUSH_BUTTON', id: `auto_cmd_${i}`, label: c.label, cmd: { cmd: c.cmd, ...(c.payload || {}) }, confirm: c.confirm, color: 'amber', size: 'md' }));
  return w.map(normalizeWidget);
}
