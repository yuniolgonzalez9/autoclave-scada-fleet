import { supabase } from './supabase';

const SYSTEM_PROMPT_AUTORIDAD_TOTAL = `
Eres el Ingeniero Director de Automatización, SCADA y Sistemas Físicos de BioFleet OS v2.0 Enterprise.
Tienes AUTORIDAD Y CONTROL TOTAL sobre toda la plataforma: dispositivos físicos (ESP32 HKL-EA8), parámetros de base de datos (config_deseada), secuencias del Core 1, actuadores I2C, sensores y el lienzo visual SCADA.

ESTRUCTURA DE RESPUESTA OBLIGATORIA (JSON PURO):
{
  "mensaje_chat": "Explicación clara de lo que comprendiste y la acción que estás ejecutando o proponiendo",
  "titulo_programa": "Nombre del perfil o sistema",
  "tipo": "AUTOCLAVE" | "UNIVERSAL_PLC" | "VEHICULO",
  "accion_propuesta": {
    "tipo": "NINGUNA" | "DESPLEGAR_HARDWARE" | "INICIAR_CICLO" | "PARO_EMERGENCIA" | "CONMUTAR_RELE",
    "requiere_confirmacion": true | false,
    "mensaje_confirmacion": "¿Confirmas la operación en la placa física?",
    "payload": {}
  },
  "receta": {
    "nombre_receta": "Nombre",
    "enclavamientos": [],
    "total_pasos": 0,
    "pasos": []
  },
  "hal_payload": {
    "roles_reles": {},
    "nombres_reles": {}
  },
  "dashboard": []
}
`;

function sanitizarJson(textoCrudo) {
  if (!textoCrudo) return null;
  let limpio = textoCrudo.trim();

  if (limpio.includes('```')) {
    limpio = limpio.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  }

  const inicio = limpio.indexOf('{');
  const fin = limpio.lastIndexOf('}');

  if (inicio !== -1 && fin !== -1 && fin > inicio) {
    let fragmento = limpio.substring(inicio, fin + 1);
    fragmento = fragmento.replace(/,\s*([}\]])/g, '$1');
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
  if (k.startsWith('gsk_')) return 'GROQ';
  if (k.startsWith('sk-or-')) return 'OPENROUTER';
  if (k.startsWith('sk-')) return 'OPENAI';
  return 'GROQ';
}

export async function conversarYCompilarConIA({ 
  prompt, 
  historial = [], 
  hardwareInfo = {}, 
  widgetsActuales = [], 
  recetaActual = null, 
  telemetriaActual = {}, 
  apiKey = null 
}) {
  const p = prompt ? prompt.trim() : '';
  if (!p) throw new Error('Por favor introduce tu requerimiento u orden.');

  let poolClaves = [];
  if (apiKey) {
    poolClaves = [{ id: 'manual', proveedor: detectarProveedorApiKey(apiKey), api_key: apiKey.trim(), prioridad: 1 }];
  } else {
    try {
      const { data } = await supabase.from('config_ai_keys').select('*').eq('activo', true).order('prioridad', { ascending: true });
      if (data && data.length > 0) poolClaves = data;
    } catch (_) {}
  }

  if (poolClaves.length === 0) {
    const local = localStorage.getItem('biofleet_ai_key');
    if (local) {
      poolClaves = [{ id: 'local', proveedor: detectarProveedorApiKey(local), api_key: local.trim(), prioridad: 1 }];
    } else {
      throw new Error('No hay API Keys activas en Supabase (config_ai_keys) ni en local.');
    }
  }

  const messages = [
    { role: 'system', content: `${SYSTEM_PROMPT_AUTORIDAD_TOTAL}\n\nCONTEXTO:\n${JSON.stringify({ hardwareInfo, widgetsActuales, recetaActual, telemetriaActual })}` },
    ...historial.map(h => ({
      role: h.sender === 'user' ? 'user' : 'assistant',
      content: typeof h.contenido === 'string' ? h.contenido : JSON.stringify(h.contenido)
    })),
    { role: 'user', content: p }
  ];

  let ultimoError = null;

  for (const item of poolClaves) {
    try {
      const prov = (item.proveedor || detectarProveedorApiKey(item.api_key)).toUpperCase();
      let endpoint = 'https://api.groq.com/openai/v1/chat/completions';
      let model = 'llama-3.3-70b-versatile';

      if (prov === 'OPENAI') {
        endpoint = 'https://api.openai.com/v1/chat/completions';
        model = 'gpt-4o-mini';
      } else if (prov === 'OPENROUTER') {
        endpoint = 'https://openrouter.ai/api/v1/chat/completions';
        model = 'meta-llama/llama-3.3-70b-instruct';
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${item.api_key}`
        },
        body: JSON.stringify({
          model,
          messages,
          response_format: { type: 'json_object' },
          temperature: 0.1
        })
      });

      if (res.ok) {
        const json = await res.json();
        const parseado = sanitizarJson(json?.choices?.[0]?.message?.content);
        if (parseado) {
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
      }
    } catch (err) {
      ultimoError = err.message;
    }
  }

  throw new Error(`Error procesando orden con IA: ${ultimoError}`);
}
