import { supabase } from './supabase';

const SYSTEM_PROMPT_AUTORIDAD_TOTAL = `
Eres BIOFLEET AI, el Ingeniero Director de Automatización, SCADA y Sistemas Físicos de BioFleet OS v2.0 Enterprise.
Tienes AUTORIDAD Y CONTROL TOTAL sobre toda la plataforma: toda la flota de dispositivos físicos (ESP32 HKL-EA8), parámetros de base de datos (config_deseada), secuencias del Core 1, actuadores I2C, sensores y el lienzo visual SCADA.

COMPORTAMIENTO EJECUTIVO:
- Actúas con decisión total: nunca respondas con evasivas, disclaimers ni "no puedo". Si el usuario lo pide, lo ejecutas o lo propones.
- Puedes responder CUALQUIER consulta técnica: diagnóstico de fallas y alarmas, estado de la flota, mantenimiento de autoclaves y PLC, interpretación de telemetría (temperatura, presión, F0/letalidad, fases de ciclo), guías paso a paso para técnicos.
- Recibes el estado COMPLETO de la flota en vivo. Cuando te pregunten por un equipo, analiza sus datos reales y responde con números concretos.
- Cuando el usuario pida una acción sobre hardware, propón accion_propuesta con el tipo correcto y requiere_confirmacion=true (el sistema siempre pide confirmación humana antes de tocar el hardware).
- NUNCA reveles claves API, tokens ni secretos internos. Nunca inventes datos de telemetría: si un equipo está desconectado, dilo.

ACCIONES DISPONIBLES en "accion_propuesta":
- "CONMUTAR_RELE": payload {"canal": 1-8, "mac": "OPCIONAL"}
- "COMANDO_MQTT": payload {"mac": "OPCIONAL", "comando": {cualquier objeto JSON válido para el firmware}} — úsalo para cualquier comando que no encaje en los demás tipos
- "RESET_ALARMA": payload {"mac": "OPCIONAL"}
- "INICIAR_CICLO": payload {"mac": "OPCIONAL"}
- "SCAN_I2C": payload {"mac": "OPCIONAL"} — ordena a la placa escanear su bus I2C y reportar chips/expansores detectados
- "PARO_EMERGENCIA": payload {"mac": "OPCIONAL"} — aborta TODO proceso en el equipo
- "DESPLEGAR_HARDWARE": graba el dashboard/receta/HAL actual en la placa seleccionada
- "NINGUNA": para consultas que no requieren acción física
Si "mac" se omite, la acción aplica al equipo seleccionado en la consola.

PUEDES CREAR CUALQUIER TIPO DE WIDGET en el campo "dashboard" según los requerimientos del usuario. Cada widget en "dashboard" debe tener un objeto JSON con las siguientes propiedades:
- "id": string único (ej. "w_relay_1", "w_temp_1", "w_valve_2")
- "titulo": string descriptivo (ej. "Válvula de Admisión", "Resistencia Calefactora", "Bomba de Vacío")
- "tipo": "SWITCH_TOGGLE" (para conmutar relés/salidas ON/OFF) | "ACTION_BUTTON" (para disparar comandos o pulsos) | "SEQUENCE_TIMER" (para secuencias FSM con etapas) | "SENSOR_GAUGE" (para mostrar telemetría analógica/temperatura/presión)
- "canal": número del 1 al 8 (asociado al relé R1 a R8 si es un actuador o relé)
- "color": "cyan" | "emerald" | "amber" | "rose" | "indigo"
- "x": coordenada X en píxeles en el lienzo (ej. 20, 300, 580...)
- "y": coordenada Y en píxeles en el lienzo (ej. 20, 220, 420...)
- "w": ancho en píxeles (por defecto 260)
- "h": alto en píxeles (por defecto 170)

ESTRUCTURA DE RESPUESTA OBLIGATORIA (JSON PURO):
{
  "mensaje_chat": "Explicación clara de lo que comprendiste y la acción que estás ejecutando o proponiendo",
  "titulo_programa": "Nombre del perfil o sistema",
  "tipo": "AUTOCLAVE" | "UNIVERSAL_PLC" | "VEHICULO",
  "accion_propuesta": {
    "tipo": "NINGUNA" | "DESPLEGAR_HARDWARE" | "INICIAR_CICLO" | "PARO_EMERGENCIA" | "CONMUTAR_RELE" | "COMANDO_MQTT" | "RESET_ALARMA" | "SCAN_I2C",
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
  "dashboard": [
    {
      "id": "w_r1",
      "titulo": "Relé 1 - Bomba",
      "tipo": "SWITCH_TOGGLE",
      "canal": 1,
      "color": "cyan",
      "x": 20,
      "y": 20,
      "w": 260,
      "h": 170
    }
  ]
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

export async function conversarYCompilarConIA({
  prompt,
  historial = [],
  hardwareInfo = {},
  widgetsActuales = [],
  recetaActual = null,
  telemetriaActual = {},
  flota = {},
  rolUsuario = 'SUPERADMIN',
  proveedorPreferido = 'AUTO',
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

  const pref = (proveedorPreferido || 'AUTO').toUpperCase();
  if (pref !== 'AUTO') {
    poolClaves = [...poolClaves].sort((a, b) => {
      const provA = (a.proveedor || detectarProveedorApiKey(a.api_key)).toUpperCase() === pref ? 0 : 1;
      const provB = (b.proveedor || detectarProveedorApiKey(b.api_key)).toUpperCase() === pref ? 0 : 1;
      return provA - provB;
    });
  }

  const contexto = {
    rol_usuario: rolUsuario,
    hardwareInfo,
    widgetsActuales,
    recetaActual,
    telemetriaActual,
    flota: resumirFlota(flota)
  };

  const messages = [
    { role: 'system', content: `${SYSTEM_PROMPT_AUTORIDAD_TOTAL}\n\nCONTEXTO:\n${JSON.stringify(contexto)}` },
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
      let endpoint = '';
      let model = '';
      let bodyData = {};
      let headers = { 'Content-Type': 'application/json' };

            if (prov === 'GEMINI') {
              const geminiModels = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];
              let successResult = null;

              for (const m of geminiModels) {
                model = m;
                endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${item.api_key.trim()}`;

                const contents = [];
                contents.push({
                  role: 'user',
                  parts: [{ text: `${SYSTEM_PROMPT_AUTORIDAD_TOTAL}\n\nCONTEXTO ACTUAL:\n${JSON.stringify(contexto)}` }]
                });

                for (const h of historial) {
                  contents.push({
                    role: h.sender === 'user' ? 'user' : 'model',
                    parts: [{ text: typeof h.contenido === 'string' ? h.contenido : JSON.stringify(h.contenido) }]
                  });
                }

                contents.push({
                  role: 'user',
                  parts: [{ text: p }]
                });

                bodyData = {
                  contents,
                  generationConfig: {
                    temperature: 0.1,
                    responseMimeType: 'application/json'
                  }
                };

                try {
                  const res = await fetch(endpoint, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(bodyData)
                  });

                  if (res.ok) {
                    const json = await res.json();
                    const textoRespuesta = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    const parseado = sanitizarJson(textoRespuesta);
                    if (parseado) {
                      successResult = {
                        exito: true,
                        mensajeChat: parseado.mensaje_chat || 'Orden procesada con éxito.',
                        titulo: parseado.titulo_programa || 'Control BioFleet',
                        tipo: parseado.tipo || hardwareInfo.tipo || 'AUTOCLAVE',
                        accionPropuesta: parseado.accion_propuesta || null,
                        receta: parseado.receta || recetaActual,
                        halPayload: parseado.hal_payload || hardwareInfo,
                        dashboardWidgets: parseado.dashboard || widgetsActuales
                      };
                      break;
                    }
                  } else {
                    const errText = await res.text();
                    ultimoError = `${model} -> HTTP ${res.status}: ${errText}`;
                  }
                } catch (err) {
                  ultimoError = `${model} -> ${err.message}`;
                }
              }

              if (successResult) return successResult;
              continue;
            } else {
        // OpenAI / Groq / OpenRouter OpenAI-compatible
        endpoint = 'https://api.groq.com/openai/v1/chat/completions';
        model = 'llama-3.3-70b-versatile';

        if (prov === 'OPENAI') {
          endpoint = 'https://api.openai.com/v1/chat/completions';
          model = 'gpt-4o-mini';
        } else if (prov === 'OPENROUTER') {
          endpoint = 'https://openrouter.ai/api/v1/chat/completions';
          model = 'meta-llama/llama-3.3-70b-instruct';
        }

        headers['Authorization'] = `Bearer ${item.api_key}`;
        bodyData = {
          model,
          messages,
          response_format: { type: 'json_object' },
          temperature: 0.1
        };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyData)
      });

      if (res.ok) {
        const json = await res.json();
        let textoRespuesta = '';
        if (prov === 'GEMINI') {
          textoRespuesta = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } else {
          textoRespuesta = json?.choices?.[0]?.message?.content || '';
        }

        const parseado = sanitizarJson(textoRespuesta);
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
      } else {
        const errText = await res.text();
        ultimoError = `HTTP ${res.status}: ${errText}`;
      }
    } catch (err) {
      ultimoError = err.message;
    }
  }

  throw new Error(`Error procesando orden con IA: ${ultimoError}`);
}

export async function mejorarTextoConIA(texto, contexto = '') {
  const t = (texto || '').trim();
  if (!t) return '';
  let pool = [];
  try {
    const { data } = await supabase.from('config_ai_keys').select('*').eq('activo', true).order('prioridad', { ascending: true });
    if (data?.length) pool = data;
  } catch (_) {}
  const local = localStorage.getItem('biofleet_ai_key');
  if (!pool.length && local) pool = [{ proveedor: detectarProveedorApiKey(local), api_key: local.trim() }];
  if (!pool.length) throw new Error('No hay claves de IA activas.');

  const system = 'Eres un editor técnico de mantenimiento biomédico. Corrige ortografía, acentos y redacción en español neutro, ordena el contenido en frases claras o viñetas (•) y usa terminología técnica correcta. No inventes datos, valores ni acciones que no estén en el texto. Devuelve solo el texto corregido.';
    const endpoints = {
    OPENAI: ['https://api.openai.com/v1/chat/completions', 'gpt-4o-mini'],
    OPENROUTER: ['https://openrouter.ai/api/v1/chat/completions', 'meta-llama/llama-3.3-70b-instruct'],
    GROQ: ['https://api.groq.com/openai/v1/chat/completions', 'llama-3.3-70b-versatile'],
    GEMINI: ['', 'gemini-3.5-flash']
  };
  let lastError = null;
  for (const item of pool) {
    const prov = (item.proveedor || detectarProveedorApiKey(item.api_key)).toUpperCase();
    try {
      let res;
                        if (prov === 'GEMINI') {
        const geminiModels = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];
        let successOut = null;

        for (const m of geminiModels) {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${item.api_key.trim()}`;
          try {
            const res = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [
                  { role: 'user', parts: [{ text: `${system}\n\n${contexto ? `Campo: ${contexto}\n` : ''}Texto:\n${t}` }] }
                ],
                generationConfig: { temperature: 0.2 }
              })
            });
            if (res.ok) {
              const json = await res.json();
              const out = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
              if (out) {
                successOut = out;
                break;
              }
            } else {
              lastError = `${m} -> HTTP ${res.status}`;
            }
          } catch (e) {
            lastError = `${m} -> ${e.message}`;
          }
        }

        if (successOut) return successOut;
        continue;
      } else {
        const [endpoint, model] = endpoints[prov] || endpoints.GROQ;
        res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${item.api_key}` },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: `${contexto ? `Campo: ${contexto}\n` : ''}Texto:\n${t}` }
            ]
          })
        });
        if (res.ok) {
          const json = await res.json();
          const out = json?.choices?.[0]?.message?.content?.trim();
          if (out) return out;
        } else {
          lastError = `HTTP ${res.status}`;
        }
      }
    } catch (e) {
      lastError = e.message;
    }
  }
  throw new Error(`La IA no respondió (${lastError || 'sin detalle'}).`);
}
