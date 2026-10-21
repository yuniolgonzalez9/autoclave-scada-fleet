const WORD_FIXES = {
  q: 'que', xq: 'porque', pq: 'porque', porq: 'porque', tb: 'también', tmb: 'también', tambien: 'también',
  mantenimeinto: 'mantenimiento', mantenimineto: 'mantenimiento', mantenimento: 'mantenimiento', manteniemiento: 'mantenimiento',
  valvula: 'válvula', valvulas: 'válvulas', electrovalvula: 'electroválvula', electrovalvulas: 'electroválvulas',
  presion: 'presión', camara: 'cámara', calibracion: 'calibración', revision: 'revisión', reparacion: 'reparación',
  tecnico: 'técnico', tecnica: 'técnica', sustitucion: 'sustitución', funcion: 'función', conexion: 'conexión',
  diagnostico: 'diagnóstico', termico: 'térmico', electrico: 'eléctrico', electrica: 'eléctrica', electronica: 'electrónica',
  modulo: 'módulo', codigo: 'código', parametros: 'parámetros', parametro: 'parámetro', vacio: 'vacío', bateria: 'batería',
  esterilizacion: 'esterilización', validacion: 'validación', inspeccion: 'inspección', limpieza: 'limpieza', tuberia: 'tubería',
  despues: 'después', ademas: 'además', tambein: 'también', aun: 'aún', resistecia: 'resistencia', resitencia: 'resistencia',
  temperatuta: 'temperatura', tempreatura: 'temperatura', sensores: 'sensores', sellos: 'sellos', empaque: 'empaque',
  fallo: 'fallo', ok: 'OK', mqtt: 'MQTT', esp32: 'ESP32', pt100: 'PT100', plc: 'PLC'
};

const PAST_FIXES = ['cambio', 'reviso', 'limpio', 'ajusto', 'reemplazo', 'verifico', 'calibro', 'reparo', 'sustituyo', 'instalo', 'probo', 'lubrico', 'apreto', 'soldo', 'configuro', 'actualizo', 'desmonto', 'monto', 'midio', 'detecto', 'encontro', 'realizo', 'reinicio', 'conecto', 'desconecto'];
const PAST_ACCENT = { probo: 'probó', midio: 'midió', sustituyo: 'sustituyó', reinicio: 'reinició' };

const matchCase = (src, out) => (src[0] === src[0].toUpperCase() ? out[0].toUpperCase() + out.slice(1) : out);

function fixWords(line) {
  let out = line.replace(/[A-Za-zÁÉÍÓÚáéíóúÑñüÜ0-9]+/g, (w) => {
    const fix = WORD_FIXES[w.toLowerCase()];
    return fix ? (fix === fix.toUpperCase() ? fix : matchCase(w, fix)) : w;
  });
  out = out.replace(/\bse\s+([a-záéíóúñ]+)\b/gi, (all, verb) => {
    const v = verb.toLowerCase();
    if (!PAST_FIXES.includes(v)) return all;
    const accented = PAST_ACCENT[v] || `${v.slice(0, -1)}ó`;
    return `${all.slice(0, all.length - verb.length)}${accented}`;
  });
  return out;
}

function tidy(line) {
  let s = line.replace(/\s+/g, ' ').trim();
  s = s.replace(/\s+([,.;:!?])/g, '$1').replace(/([,;:])(?=\S)/g, '$1 ').replace(/\.{2,}/g, '.');
  s = s.replace(/([.!?])\s*([a-záéíóúñ])/g, (_, p, c) => `${p} ${c.toUpperCase()}`);
  if (s) s = s[0].toUpperCase() + s.slice(1);
  if (s && !/[.!?:]$/.test(s)) s += '.';
  return s;
}

export function correctTechnicalText(text) {
  if (!text) return '';
  const lines = String(text).replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  const bulletRe = /^([-*•·]|\d+[.)-])\s*/;
  const isList = lines.length > 1 && lines.filter((l) => bulletRe.test(l)).length >= Math.ceil(lines.length / 2);
  return lines
    .map((l) => {
      const body = tidy(fixWords(l.replace(bulletRe, '')));
      return isList ? `• ${body}` : body;
    })
    .join('\n');
}
