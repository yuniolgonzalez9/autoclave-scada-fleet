/**
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * SERVICIO COMPILADOR CONVERSACIONAL DE IA - GROQ LLAMA 3.3 70B CON MEMORIA TOTAL
 * =========================================================================================
 */

const GROQ_DEFAULT_API_KEY = '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';

const SYSTEM_PROMPT_CONVERSACIONAL = `
Eres el Copilot e Ingeniero Senior de Automatización y Control Industrial de BioFleet OS v2.0 Enterprise.
Estás dialogando directamente con el operador/ingeniero de planta para diseñar un sistema a la medida exacta en el hardware HKL-EA8.

REGLAS FUNDAMENTALES DE LIBERTAD Y RAZONAMIENTO:
1. CERO PLANTILLAS: NO agregues relés, botones, sensores ni componentes que el usuario NO haya solicitado explícitamente o que no sean estrictamente necesarios para su requerimiento.
2. DIÁLOGO ACTIVO: En el campo "mensaje_chat", responde al usuario como un ingeniero colega. Explica brevemente lo que construiste. Si la instrucción es incompleta, ambigua o requiere precisiones críticas (tiempos exactos, tipo de sensor analógico o umbrales de seguridad), pregúntaselo con claridad para que el usuario te responda en el siguiente mensaje.
3. CONTEXTO DE HARDWARE (HKL-EA8):
   - Salidas: R1 a R8 (Relés en I2C 0x24). Asigna únicamente los relés necesarios.
   - Entradas Digitales: IN1 a IN8 (Optocopladas en I2C 0x26).
   - Entradas Analógicas: A0 a A3 (ADC ADS1115 en 0x48).
4. TIPOS DE WIDGETS DISPONIBLES:
   - 'ACTION_BUTTON': Botón pulsador de comando o secuencia.
   - 'SWITCH_TOGGLE': Interruptor ON/OFF para conmutar un relé.
   - 'GAUGE_RADIAL': Manómetro/indicador analógico (presión, RPM, batería, nivel).
   - 'VALUE_CARD': Tarjeta de valor numérico (°C, caudal, contador).
   - 'STATUS_LED': LED indicador (ON/OFF) para sensor digital.
   - 'CHART_HISTORY': Gráfica temporal continua.

FORMATO OBLIGATORIO DE RESPUESTA (JSON PURO):
{
  "mensaje_chat": "Tu respuesta conversacional técnica para el usuario (explicación o preguntas de aclaración)",
  "titulo_programa": "Nombre representativo del sistema",
  "descripcion": "Resumen técnico de la arquitectura",
  "tipo": "UNIVERSAL_PLC" | "VEHICULO" | "AUTOCLAVE",
  "hal_payload": {
    "roles_reles": { "R1": "...", ... },
    "nombres_reles": { "R1": "...", ... },
    "roles_entradas": { "IN1": "...", ... },
    "nombres_entradas": { "IN1": "...", ... }
  },
  "dashboard": [
    {
      "id": "w_1",
      "tipo": "ACTION_BUTTON" | "SWITCH_TOGGLE" | "GAUGE_RADIAL" | "VALUE_CARD" | "STATUS_LED" | "CHART_HISTORY",
      "titulo": "Etiqueta",
      "canal": 1,
      "color": "cyan" | "emerald" | "amber" | "rose" | "purple",
      "unidad": "bar" | "°C" | "V" | "RPM" | "%" | "",
      "min": 0,
      "max": 100,
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
    try {
      return JSON.parse(limpio.substring(inicio, fin + 1));
    } catch (_) {
      return null;
    }
  }
  return null;
}

/**
 * CONSULTA A GROQ CON HISTORIAL CONVERSACIONAL COMPLETO
 */
export async function conversarYCompilarConIA({ prompt, historial = [], hardwareInfo = {}, apiKey = null }) {
  const key = apiKey || localStorage.getItem('biofleet_ai_key') || GROQ_DEFAULT_API_KEY;

  // Formatear historial previo para que el modelo tenga memoria
  const messages = [
    { role: 'system', content: `${SYSTEM_PROMPT_CONVERSACIONAL}\nHARDWARE ACTUAL DETECTADO: ${JSON.stringify(hardwareInfo)}` },
    ...historial.map(h => ({
      role: h.sender === 'user' ? 'user' : 'assistant',
      content: typeof h.contenido === 'string' ? h.contenido : JSON.stringify(h.contenido)
    })),
    { role: 'user', content: prompt }
  ];

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`[Groq Error ${response.status}]: ${errorText}`);
  }

  const data = await response.json();
  const rawText = data?.choices?.[0]?.message?.content;
  const jsonParseado = sanitizarJson(rawText);

  if (!jsonParseado) {
    throw new Error('La IA respondió pero no devolvió una estructura JSON válida.');
  }

  // Asignar coordenadas libres a los widgets generados
  const dashboardWidgets = (jsonParseado.dashboard || []).map((w, idx) => ({
    ...w,
    id: w.id || `w_${Date.now()}_${idx}`,
    x: (idx % 3) * 280 + 20,
    y: Math.floor(idx / 3) * 190 + 20,
    w: w.w || 260,
    h: w.h || 170
  }));

  return {
    exito: true,
    mensajeChat: jsonParseado.mensaje_chat || 'He diseñado la automatización solicitada.',
    titulo: jsonParseado.titulo_programa || 'Automatización Personalizada',
    descripcion: jsonParseado.descripcion || prompt,
    tipo: jsonParseado.tipo || 'UNIVERSAL_PLC',
    halPayload: jsonParseado.hal_payload || {},
    dashboardWidgets
  };
}
