/**
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * SERVICIO COMPILADOR DE IA REAL - TEXT/JSON MULTI-ENGINE (GEMINI / GROQ / OPENAI)
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
- 'ACTION_BUTTON': Botón para ejecutar acciones o secuencias (Arranque, Test de Relés, Purga, Ciclo, Paro).
- 'SWITCH_TOGGLE': Interruptor ON/OFF para conmutar un relé directo (Bomba, Válvula, Calentador, Relé individual).
- 'GAUGE_RADIAL': Manómetro/indicador radial para presiones, RPM, humedad o nivel.
- 'VALUE_CARD': Tarjeta de lectura digital numérica para temperatura (°C), tiempos o voltaje.
- 'STATUS_LED': Luz indicadora de estado (ON/OFF) vinculada a una entrada física o relé.
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

export function detectarProveedorApiKey(key = '') {
  const k = key.trim();
  if (k.startsWith('AIza')) return 'GEMINI';
  if (k.startsWith('gsk_')) return 'GROQ';
  if (k.startsWith('sk-')) return 'OPENAI';
  return 'GEMINI';
}

/**
 * INVOCADOR DE GOOGLE GEMINI (FILTRA MODELOS DE TEXTO EXCLUSIVOS, ELIMINA TTS/AUDIO)
 */
async function invocarGemini(apiKey, userPrompt, hardwareInfo) {
  // Lista fija de modelos oficiales probados de TEXTO en orden de prioridad
  const modelosTextoFijos = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash-8b',
    'gemini-1.5-pro'
  ];

  let listaFinalModelos = [...modelosTextoFijos];

  // Consultar lista viva de Google descartando explícitamente modelos de audio/tts
  try {
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (listRes.ok) {
      const listData = await listRes.json();
      const validosTexto = (listData.models || [])
        .filter(m => 
          m.supportedGenerationMethods?.includes('generateContent') &&
          !m.name.includes('-tts') &&
          !m.name.includes('-audio') &&
          !m.name.includes('embedding')
        )
        .map(m => m.name.replace(/^models\//, ''));

      if (validosTexto.length > 0) {
        // Priorizar gemini-2.0-flash y los oficiales
        listaFinalModelos = [
          ...modelosTextoFijos.filter(m => validosTexto.includes(m)),
          ...validosTexto
        ];
      }
    }
  } catch (e) {
    console.warn('[GEMINI] Consulta dinámica omitida, usando modelos oficiales:', e);
  }

  const candidatosFinales = [...new Set(listaFinalModelos)];
  let errorAcumulado = null;

  for (const model of candidatosFinales) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          console.log(`✅ [GEMINI] Compilación exitosa usando modelo: ${model}`);
          return JSON.parse(rawText);
        }
      } else {
        const errJson = await response.json().catch(() => null);
        errorAcumulado = errJson?.error?.message || `HTTP ${response.status}`;
        console.warn(`[GEMINI] Modelo ${model} no compatible (${response.status}), rotando al siguiente...`);
        continue; // Continúa al siguiente modelo de texto
      }
    } catch (err) {
      errorAcumulado = err.message;
      console.warn(`[GEMINI] Error en modelo ${model}:`, err.message);
      continue; // Continúa al siguiente modelo
    }
  }

  throw new Error(`Google Gemini no pudo completar la solicitud: ${errorAcumulado}`);
}

/**
 * INVOCADOR OPENAI / GROQ
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

  console.log(`🤖 [BIOFLEET AI] Conectando con IA real vía proveedor: ${proveedor}`);

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
    resultadoJson = await invocarOpenAiCompatible(
      keyActiva,
      'https://api.openai.com/v1/chat/completions',
      'gpt-4o-mini',
      prompt,
      hardwareInfo
    );
  }

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
