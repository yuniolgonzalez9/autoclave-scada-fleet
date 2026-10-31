import { supabase } from './supabase';

function sanitizarJson(textoCrudo) {
  if (!textoCrudo) return null;
  let limpio = textoCrudo.trim();

  if (limpio.includes('```')) {
    limpio = limpio.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  }

  const inicio = limpio.indexOf('{');
  const fin = limpio.lastIndexOf('}');

  if (inicio !== -1 && fin !== -1 && fin > inicio) {
    const fragmento = limpio.substring(inicio, fin + 1).replace(/,\s*([}\]])/g, '$1');
    try {
      return JSON.parse(fragmento);
    } catch (_) {
      try {
        return JSON.parse(limpio.substring(inicio, fin + 1));
      } catch (e) {
        return null;
      }
    }
  }
  return null;
}

export function detectarProveedorApiKey(key = '') {
  const k = (key || '').trim();
  if (k.startsWith('AIza')) return 'GEMINI';
  if (k.startsWith('gsk_')) return 'GROQ';
  if (k.startsWith('sk-or-')) return 'OPENROUTER';
  if (k.startsWith('sk-')) return 'OPENAI';
  return 'GEMINI';
}

function resumirFlota(flota = {}) {
  const ahora = Date.now();
  return Object.values(flota || {}).map((d) => ({
    mac: d.mac,
    alias: d.meta?.alias || d.mac,
    tipo: d.meta?.tipo || d.datos?.tipo,
    cliente: d.meta?.cliente,
    online: d.lastSeen ? ahora - d.lastSeen < 15000 : false,
    datos: d.datos || {}
  }));
}

// Las claves de los proveedores viven en el servidor (/api/ai). El cliente
// solo manda conversación y contexto — ninguna API key toca el navegador.
async function llamarApiAi(payload) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Inicia sesión para usar el asistente de IA.');

  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `La IA no respondió (HTTP ${res.status}).`);
  return body.text || '';
}

export async function conversarYCompilarConIA({
  prompt,
  historial = [],
  hardwareInfo = {},
  widgetsActuales = [],
  recetaActual = null,
  telemetriaActual = {},
  flota = {},
  rolUsuario = 'SUPERADMIN',
  proveedorPreferido = 'AUTO'
}) {
  const p = prompt ? prompt.trim() : '';
  if (!p) throw new Error('Por favor introduce tu requerimiento u orden.');

  const resumenFlota = resumirFlota(flota);
  const contexto = {
    rol_usuario: rolUsuario,
    hardwareInfo,
    widgetsActuales,
    recetaActual,
    telemetriaActual,
    flota: resumenFlota,
    stats_flota: {
      total_equipos: resumenFlota.length,
      en_linea: resumenFlota.filter((d) => d.online).length,
      fuera_linea: resumenFlota.filter((d) => !d.online).length,
      tipos: resumenFlota.reduce((acc, d) => {
        const t = (d.tipo || 'DESCONOCIDO').toUpperCase();
        acc[t] = (acc[t] || 0) + 1;
        return acc;
      }, {})
    }
  };

  const textoRespuesta = await llamarApiAi({
    task: 'studio',
    prompt: p,
    historial: historial.map((h) => ({
      role: h.sender === 'user' ? 'user' : 'assistant',
      content: typeof h.contenido === 'string' ? h.contenido : JSON.stringify(h.contenido)
    })),
    contexto,
    proveedor: proveedorPreferido
  });

  const parseado = sanitizarJson(textoRespuesta);
  if (!parseado) throw new Error('La IA respondió con un formato inválido. Reintenta la orden.');

  return {
    exito: true,
    mensajeChat: parseado.mensaje_chat || 'Orden procesada con éxito.',
    titulo: parseado.titulo_programa || 'Control BioFleet',
    tipo: parseado.tipo || hardwareInfo.tipo || 'AUTOCLAVE',
    accionPropuesta: parseado.accion_propuesta || null,
    receta: parseado.receta || recetaActual,
    halPayload: parseado.hal_payload || hardwareInfo,
    dashboardWidgets: parseado.dashboard || widgetsActuales
  };
}

export async function mejorarTextoConIA(texto, contexto = '') {
  const t = (texto || '').trim();
  if (!t) return '';
  return llamarApiAi({ task: 'text', prompt: t, contexto });
}
