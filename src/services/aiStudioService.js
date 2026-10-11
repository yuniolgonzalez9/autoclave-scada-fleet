/**
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * SERVICIO COMPILADOR DE IA INDUSTRIAL - ALINEADO AL CORE 1 DEL FIRMWARE v8.0
 * =========================================================================================
 */

const GROQ_DEFAULT_API_KEY = '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';
const GROQ_MODEL_ID = 'llama-3.1-8b-instant';

const SYSTEM_PROMPT_FIRMWARE_V8 = `
Eres el Ingeniero de Control y Automatización de BioFleet OS v2.0 Enterprise.
Tu función es razonar y generar arquitecturas industriales exactas para el firmware v8.0 que corre en un ESP32 con placa HKL-EA8.

ESPECIFICACIÓN EXACTA DEL FIRMWARE (main.cpp Core 1):
1. CONTROL DIRECTO DE RELÉS:
   - Soporta comando 'SET_RELAY' con {"canal": 1..8, "val": true/false}.
2. MOTOR DE SECUENCIAS AUTOMÁTICO (Core 1):
   - Soporta comando 'APPLY_LOGICA_SECUENCIA' con un objeto "receta".
   - Estructura obligatoria de la "receta":
     {
       "nombre_receta": "Nombre",
       "enclavamiento_paro": "IN4",
       "total_pasos": N,
       "pasos": [
         {
           "nombre": "Paso 1",
           "tipo_transicion": "TEMPORIZADO",
           "tiempo_ms": 600,
           "acciones_encender": ["R1"],
           "acciones_apagar": []
         }
       ]
     }
3. HARDWARE HKL-EA8:
   - Relés R1 a R8 (I2C 0x24 PCF8574).
   - Entradas IN1 a IN8 (I2C 0x26).
   - Entradas ADC A0 a A3 (I2C 0x48 ADS1115).
   - Display LCD (I2C 0x27).

REGLAS DE GENERACIÓN:
1. Si el usuario pide una secuencia o prueba de relés (como encender de R1 a R8 y apagarlos en orden):
   - Genera en "receta" los pasos exactos: primero 8 pasos temporizados encendiendo R1 hasta R8 secuencialmente, y luego 8 pasos temporizados apagando R1 hasta R8 secuencialmente.
   - Crea un widget 'ACTION_BUTTON' con "accion": "EJECUTAR_RECETA" que contenga esa receta.
   - Agrega también widgets 'SWITCH_TOGGLE' para los relés involucrados para que el usuario pueda operarlos manualmente.
2. Si el usuario pide controlar una salida específica (como R5):
   - Genera únicamente los controles de ese relé (un 'SWITCH_TOGGLE' y un 'ACTION_BUTTON' asociados a ese canal).
3. En "mensaje_chat", explica al usuario la lógica que construiste.

RESPONDE EXCLUSIVAMENTE CON UN OBJETO JSON VÁLIDO:
{
  "mensaje_chat": "Explicación técnica para el operador",
  "titulo_programa": "Nombre del sistema",
  "descripcion": "Memoria descriptiva",
  "tipo": "UNIVERSAL_PLC",
  "receta": {
    "nombre_receta": "Secuencia R1-R8",
    "enclavamiento_paro": "IN4",
    "total_pasos": 16,
    "pasos": []
  },
  "hal_payload": {
    "roles_reles": { "R1": "...", "R2": "...", ... },
    "nombres_reles": { "R1": "...", "R2": "...", ... }
  },
  "dashboard": [
    {
      "id": "w_1",
      "tipo": "ACTION_BUTTON" | "SWITCH_TOGGLE" | "GAUGE_RADIAL" | "VALUE_CARD",
      "titulo": "Etiqueta",
      "canal": 1,
      "accion": "COMANDO" | "EJECUTAR_RECETA",
      "color": "cyan" | "emerald" | "amber" | "rose",
      "unidad": "",
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

export async function conversarYCompilarConIA({ prompt, historial = [], hardwareInfo = {}, apiKey = null }) {
  const p = prompt ? prompt.trim() : '';
  if (!p) throw new Error('Por favor introduce tu instrucción de automatización.');

  const key = apiKey || localStorage.getItem('biofleet_ai_key') || GROQ_DEFAULT_API_KEY;

  const messages = [
    { role: 'system', content: `${SYSTEM_PROMPT_FIRMWARE_V8}\nHARDWARE DETECTADO: ${JSON.stringify(hardwareInfo)}` },
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
      model: GROQ_MODEL_ID,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`[Groq Error ${response.status}]: ${errorText}`);
  }

  const data = await response.json();
  const rawText = data?.choices?.[0]?.message?.content;
  const jsonParseado = sanitizarJson(rawText);

  if (!jsonParseado || !jsonParseado.dashboard) {
    throw new Error('El modelo de IA no devolvió un JSON válido.');
  }

  const dashboardWidgets = jsonParseado.dashboard.map((w, idx) => ({
    ...w,
    id: w.id || `w_${Date.now()}_${idx}`,
    x: (idx % 3) * 280 + 20,
    y: Math.floor(idx / 3) * 190 + 20,
    w: w.w || 260,
    h: w.h || 170
  }));

  return {
    exito: true,
    mensajeChat: jsonParseado.mensaje_chat || 'He diseñado la arquitectura de control.',
    titulo: jsonParseado.titulo_programa || 'Automatización Personalizada',
    descripcion: jsonParseado.descripcion || p,
    tipo: jsonParseado.tipo || 'UNIVERSAL_PLC',
    receta: jsonParseado.receta || null,
    halPayload: jsonParseado.hal_payload || {},
    dashboardWidgets
  };
}
