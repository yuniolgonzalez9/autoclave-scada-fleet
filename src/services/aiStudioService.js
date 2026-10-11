/**
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * SERVICIO COMPILADOR DE IA REAL (GOOGLE GEMINI / GROQ / OPENAI MULTI-ENGINE)
 * =========================================================================================
 */

const BIOFLEET_SYSTEM_PROMPT = `
Eres el Ingeniero de Automatización y Compilador de Control Industrial de BioFleet OS v2.0 Enterprise.
Tu trabajo es interpretar la solicitud del usuario y diseñar una arquitectura de automatización 100% personalizada para la placa HKL-EA8.

ESPECIFICACIONES DEL HARDWARE FÍSICO:
1. Salidas de Potencia: 8 Relés digitales (R1 a R8) vía I2C PCF8574 (0x24).
2. Entradas Digitales: 8 Entradas Optocopladas (IN1 a IN8) vía I2C PCF8574 (0x26).
3. Entradas Analógicas: 4 Canales ADC 16-bit (A0 a A3) vía I2C ADS1115 (0x48).
4. Pantalla: LCD Alfanumérica I2C (16x2 o 20x4, dirección 0x27).

TIPOS DE WIDGETS SOPORTADOS PARA EL DASHBOARD:
- 'ACTION_BUTTON': Botón para ejecutar acciones o secuencias (Arranque, Purga, Ciclo, Paro).
- 'SWITCH_TOGGLE': Interruptor ON/OFF para conmutar un relé directo (Bomba, Válvula, Calentador).
- 'GAUGE_RADIAL': Manómetro/indicador radial para presiones, RPM, humedad o nivel.
- 'VALUE_CARD': Tarjeta de lectura digital numérica para temperatura (°C), tiempos o voltaje.
- 'STATUS_LED': Luz indicadora de estado (ON/OFF) vinculada a una entrada física.
- 'CHART_HISTORY': Gráfica temporal continua de telemetría.

REGLAS DE SALIDA ESTRICTAS:
- Devuelve EXCLUSIVAMENTE un objeto JSON válido (sin markdown, sin bloques de texto explicativo).
- Estructura obligatoria del JSON:
{
  "titulo_programa": "Nombre del sistema diseñado",
  "descripcion": "Explicación técnica detallada de la lógica implementada",
  "tipo": "VEHICULO" | "AUTOCLAVE" | "UNIVERSAL_PLC",
  "hal_payload": {
    "roles_reles": {
      "R1": "ROL_R1", "R2": "ROL_R2", "R3": "ROL_R3", "R4": "ROL_R4",
      "R5": "ROL_R5", "R6": "ROL_R6", "R7": "ROL_R7", "R8": "ROL_R8"
    },
    "nombres_reles": {
      "R1": "Nombre salida 1", "R2": "Nombre salida 2", ...
    },
    "roles_entradas": {
      "IN1": "ROL_IN1", "IN2": "ROL_IN2", ...
    },
    "nombres_entradas": {
      "IN1": "Nombre sensor 1", ...
    }
  },
  "dashboard": [
    {
      "id": "w_1",
      "tipo": "ACTION_BUTTON" | "SWITCH_TOGGLE" | "GAUGE_RADIAL" | "VALUE_CARD" | "STATUS_LED" | "CHART_HISTORY",
      "titulo": "Etiqueta del Widget",
      "canal": 1,
      "color": "cyan" | "emerald" | "amber" | "rose" | "purple",
      "unidad": "bar" | "°C" | "V" | "RPM" | "%" | "L/min",
      "min": 0,
      "max": 100,
      "w": 260,
      "h": 170
    }
  ]
}
`;

/**
 * Detecta automáticamente el proveedor según el formato de la API Key:
 * - AIza... -> Google Gemini
 * - gsk_...  -> Groq
 * - sk-...   -> OpenAI
 */
export function detectarProveedorApiKey(key = '') {
  const k = key.trim();
  if (k.startsWith('AIza')) return 'GEMINI';
  if (k.startsWith('gsk_')) return 'GROQ';
  if (k.startsWith('sk-')) return 'OPENAI';
  return 'GEMINI'; // Por defecto Gemini
}

/**
 * LLAMADA A GOOGLE GEMINI (GEMINI 1.5 FLASH / 2.0 FLASH)
 */
async function invocarGemini(apiKey, userPrompt, hardwareInfo) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `${BIOFLEET_SYSTEM_PROMPT}\n\nHARDWARE DISPONIBLE: ${JSON.stringify(hardwareInfo || {})}\n\nSOLICITUD DEL USUARIO:\n"${userPrompt}"`
          }
        ]
      }
    ],
    generationConfig: {
      response_mime_type: 'application/json',
      temperature: 0.2
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Error Google Gemini (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Gemini no devolvió texto en su respuesta.');
  return JSON.parse(rawText);
}

/**
 * LLAMADA A OPENAI O GROQ (COMPATIBLE OPENAI API)
 */
async function invocarOpenAiCompatible(apiKey, endpoint, modelName, userPrompt, hardwareInfo) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: BIOFLEET_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `HARDWARE DISPONIBLE: ${JSON.stringify(hardwareInfo || {})}\n\nSOLICITUD:\n"${userPrompt}"`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Error API (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const rawText = data?.choices?.[0]?.message?.content;
  if (!rawText) throw new Error('El modelo no devolvió contenido.');
  return JSON.parse(rawText);
}

/**
 * COMPILADOR MAESTRO EXPORTADO
 */
export async function compilarConIA({ prompt, device, hardwareInfo, apiKey = null }) {
  if (!prompt || !prompt.trim()) {
    throw new Error('Por favor escribe qué automatización deseas compilar.');
  }

  // 1. Obtener la API key de múltiples fuentes
  const keyActiva =
    apiKey ||
    localStorage.getItem('biofleet_ai_key') ||
    import.meta.env.VITE_AI_API_KEY ||
    import.meta.env.VITE_GEMINI_API_KEY ||
    import.meta.env.VITE_OPENAI_API_KEY ||
    null;

  if (!keyActiva) {
    throw new Error('NO_API_KEY');
  }

  const proveedor = detectarProveedorApiKey(keyActiva);
  let resultadoJson = null;

  console.log(`🤖 [BIOFLEET AI] Consultando modelo real vía proveedor: ${proveedor}`);

  if (proveedor === 'GEMINI') {
    resultadoJson = await invocarGemini(keyActiva, prompt, hardwareInfo);
  } else if (proveedor === 'GROQ') {
    resultadoJson = await invocarOpenAiCompatible(
      keyActiva,
      'https://api.groq.com/openai/v1/chat/completions',
      'llama-3.3-70b-versatile',
      prompt,
      hardwareInfo
    );
  } else {
    // OPENAI
    resultadoJson = await invocarOpenAiCompatible(
      keyActiva,
      'https://api.openai.com/v1/chat/completions',
      'gpt-4o-mini',
      prompt,
      hardwareInfo
    );
  }

  // Adaptar coordenadas libres si no vienen definidas
  const dashboardWidgets = (resultadoJson.dashboard || []).map((w, idx) => ({
    ...w,
    id: w.id || `w_ai_${idx + 1}`,
    x: w.x !== undefined ? w.x : (idx % 3) * 280 + 20,
    y: w.y !== undefined ? w.y : Math.floor(idx / 3) * 190 + 20,
    w: w.w || 260,
    h: w.h || 170
  }));

  return {
    exito: true,
    fuente: `LLM_REAL_${proveedor}`,
    titulo: resultadoJson.titulo_programa || 'Automatización Compilada',
    descripcion: resultadoJson.descripcion || prompt,
    halPayload: resultadoJson.hal_payload || {},
    dashboardWidgets
  };
}
