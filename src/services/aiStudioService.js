/**
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * SERVICIO COMPILADOR DE IA - CON CONCIENCIA TOTAL DEL ENTORNO WEB Y DEL LIENZO
 * =========================================================================================
 */

const GROQ_DEFAULT_API_KEY = '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';

function construirPromptConContexto(hardwareInfo, widgetsActuales, recetaActual, telemetriaActual) {
  return `
Eres el Copilot e Ingeniero Principal de SCADA de BioFleet OS v2.0 Enterprise.
Tienes CONCIENCIA TOTAL y control directo sobre el entorno web, el lienzo y el hardware físico HKL-EA8.

ESTADO ACTUAL DEL ENTORNO EN TIEMPO REAL:
1. HARDWARE FÍSICO: ${JSON.stringify(hardwareInfo || {})}
2. WIDGETS QUE EL USUARIO TIENE ACTUALMENTE EN SU PANTALLA:
${JSON.stringify(widgetsActuales || [])}
3. RECETA FSM ACTIVA: ${JSON.stringify(recetaActual || null)}
4. TELEMETRÍA EN VIVO: ${JSON.stringify(telemetriaActual || {})}

CAPACIDADES DE MANIPULACIÓN SOBRE EL ENTORNO WEB:
1. ELIMINAR WIDGETS:
   - Si el usuario te pide eliminar, quitar o borrar un control (ej: "elimina el botón de R2", "quita los interruptores", "borra todo excepto la secuencia"):
     Devuelve en "dashboard" la lista de widgets SIN los elementos que pidió eliminar. Explícalo en "mensaje_chat".
2. MODIFICAR WIDGETS EXISTENTES:
   - Si el usuario te pide alterar un control existente (ej: "cambia el color a rojo", "sube el tiempo de la secuencia a 10s", "renombra R1 a Bomba"):
     Localiza el widget en la lista actual, aplica el cambio solicitado y conserva intactos todos los demás widgets.
3. AGREGAR WIDGETS:
   - Si el usuario te pide agregar algo nuevo sobre lo que ya tiene (ej: "agrega ahora un manómetro", "ponle una seta de paro"):
     Conserva los widgets que ya están en pantalla y agrega el nuevo elemento con coordenadas libres.
4. REEMPLAZAR O CREAR DE CERO:
   - Si el usuario pide un sistema completamente nuevo, genera una nueva lista de widgets desde cero.
5. RESPONDER CONSULTAS DEL ENTORNO:
   - Si el usuario te pregunta qué hay en pantalla o qué puede controlar, describe con exactitud los widgets que están en su pantalla y los canales físicos disponibles.

TIPOS DE WIDGETS:
- 'SEQUENCE_TIMER': Temporizador de secuencia con cuenta regresiva en segundos y fases.
- 'ACTION_BUTTON': Botón pulsador o disparo de receta.
- 'SWITCH_TOGGLE': Interruptor ON/OFF biestable.
- 'MOMENTARY_BUTTON': Pulsador jog (activo solo mientras se presiona).
- 'EMERGENCY_STOP': Seta de paro de emergencia con enclavamiento.
- 'ROTARY_SELECTOR': Selector rotativo (MAN - 0 - AUTO).
- 'GAUGE_RADIAL': Manómetro analógico de aguja.
- 'VALUE_CARD': Display digital numérico (°C, caudal, etc.).
- 'LEVEL_TANK': Tanque de nivel de fluido (0-100%).
- 'STATUS_LED': LED indicador luminoso de entrada o estado.

RESPONDE EXCLUSIVAMENTE CON UN OBJETO JSON VÁLIDO:
{
  "mensaje_chat": "Explicación clara de la acción ejecutada sobre el entorno web (eliminado, modificado o agregado) o respuesta a la pregunta",
  "titulo_programa": "Nombre del sistema",
  "tipo": "UNIVERSAL_PLC" | "AUTOCLAVE" | "VEHICULO",
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
    // La lista final y actualizada de widgets que deben quedar en el lienzo
  ]
}
`;
}

function sanitizarJson(textoCrudo) {
  if (!textoCrudo) return null;
  let limpio = textoCrudo.trim();

  if (limpio.includes('```')) {
    limpio = limpio.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  }

  const inicio = limpio.indexOf('{');
  const fin = limpio.lastIndexOf('}');

  if (inicio !== -1 && fin !== -1 && fin > inicio) {
    try {
      return JSON.parse(limpio.substring(inicio, fin + 1));
    } catch (_) {
      return null;
    }
  }
  return null;
}

async function resolverModeloGroqActivo(apiKey) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (res.ok) {
      const data = await res.json();
      const modelos = (data.data || []).map(m => m.id);
      const candidatos = modelos.filter(id => !id.includes('whisper') && !id.includes('guard'));

      const preferido = candidatos.find(id => id.includes('gpt-oss-120b')) ||
                        candidatos.find(id => id.includes('gpt-oss-20b')) ||
                        candidatos.find(id => id.includes('qwen')) ||
                        candidatos[0];

      if (preferido) return preferido;
    }
  } catch (_) {}
  return 'openai/gpt-oss-120b';
}

export function detectarProveedorApiKey(key = '') {
  const k = key.trim();
  if (k.startsWith('gsk_')) return 'GROQ';
  if (k.startsWith('sk-')) return 'OPENAI';
  if (k.startsWith('AIza') || k.startsWith('AQ.')) return 'GEMINI';
  return 'GROQ';
}

/**
 * FUNCIÓN PRINCIPAL EXPORTADA CON CONCIENCIA TOTAL DEL LIENZO
 */
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
  if (!p) throw new Error('Por favor introduce tu requerimiento.');

  const key = apiKey || localStorage.getItem('biofleet_ai_key') || GROQ_DEFAULT_API_KEY;

  try {
    const modelIdActivo = await resolverModeloGroqActivo(key);
    const systemPromptConContexto = construirPromptConContexto(hardwareInfo, widgetsActuales, recetaActual, telemetriaActual);

    const messages = [
      { role: 'system', content: systemPromptConContexto },
      ...historial.map(h => ({
        role: h.sender === 'user' ? 'user' : 'assistant',
        content: typeof h.contenido === 'string' ? h.contenido : JSON.stringify(h.contenido)
      })),
      { role: 'user', content: p }
    ];

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model: modelIdActivo,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.1
      })
    });

    if (response.ok) {
      const data = await response.json();
      const rawText = data?.choices?.[0]?.message?.content;
      const parseado = sanitizarJson(rawText);

      if (parseado) {
        // Asegurar coordenadas a los widgets resultantes
        let curX = 20;
        let curY = 20;
        const dashboardWidgets = (parseado.dashboard || []).map((w, idx) => {
          const posX = w.x !== undefined ? w.x : curX;
          const posY = w.y !== undefined ? w.y : currentY;
          curX += (w.w || 260) + 20;
          if (curX > 860) { curX = 20; curY += 210; }

          return {
            ...w,
            id: w.id || `w_${Date.now()}_${idx}`,
            x: posX,
            y: posY,
            w: w.w || (w.tipo === 'SEQUENCE_TIMER' ? 380 : 260),
            h: w.h || (w.tipo === 'SEQUENCE_TIMER' ? 220 : 170)
          };
        });

        return {
          exito: true,
          mensajeChat: parseado.mensaje_chat || 'He actualizado el entorno según tu solicitud.',
          titulo: parseado.titulo_programa || 'Control SCADA',
          descripcion: parseado.descripcion || p,
          tipo: parseado.tipo || 'UNIVERSAL_PLC',
          receta: parseado.receta || null,
          halPayload: parseado.hal_payload || {},
          dashboardWidgets
        };
      }
    }
  } catch (err) {
    console.warn('[GROQ API] Error consultando IA:', err.message);
  }

  // Fallback simple si no hay conexión
  return {
    exito: true,
    mensajeChat: `He recibido tu instrucción: "${p}".`,
    titulo: 'Control SCADA',
    tipo: 'UNIVERSAL_PLC',
    receta: null,
    halPayload: {},
    dashboardWidgets: widgetsActuales // Conservar los que ya estaban en pantalla
  };
}
