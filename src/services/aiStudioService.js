/**
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * SERVICIO COMPILADOR DE IA REAL - TEXT/JSON MULTI-ENGINE BLINDADO
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
- Responde ÚNICAMENTE con un objeto JSON válido.
- No agregues texto introductorio, ni saludos, ni explicaciones, ni etiquetas de código.
- Estructura obligatoria:
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
      "R1": "Nombre salida 1", "R2": "Nombre salida 2", "R3": "Nombre salida 3", "R4": "Nombre salida 4",
      "R5": "Nombre salida 5", "R6": "Nombre salida 6", "R7": "Nombre salida 7", "R8": "Nombre salida 8"
    },
    "roles_entradas": {
      "IN1": "ROL_IN1", "IN2": "ROL_IN2"
    },
    "nombres_entradas": {
      "IN1": "Nombre sensor 1"
    }
  },
  "dashboard": [
    {
      "id": "w_1",
      "tipo": "ACTION_BUTTON",
      "titulo": "Test Secuencial R1-R8",
      "canal": 1,
      "color": "emerald",
      "unidad": "",
      "min": 0,
      "max": 100,
      "w": 360,
      "h": 170
    }
  ]
}
`;

export function detectarProveedorApiKey(key = '') {
  const k = key.trim();
  if (k.startsWith('AIza') || k.startsWith('AQ.')) return 'GEMINI';
  if (k.startsWith('gsk_')) return 'GROQ';
  if (k.startsWith('sk-')) return 'OPENAI';
  return 'GEMINI';
}

/**
 * Función extractora tolerante a texto conversacional y markdown
 */
function extraerJsonPuro(textoCrudo) {
  if (!textoCrudo) throw new Error('Respuesta vacía del modelo.');

  let limpio = textoCrudo.trim();

  // 1. Si viene envuelto en markdown ```json ... ```
  if (limpio.includes('```')) {
    limpio = limpio.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  }

  // 2. Extraer el bloque delimitado por el primer '{' y el último '}'
  const primerBrace = limpio.indexOf('{');
  const ultimoBrace = limpio.lastIndexOf('}');

  if (primerBrace !== -1 && ultimoBrace !== -1 && ultimoBrace > primerBrace) {
    limpio = limpio.substring(primerBrace, ultimoBrace + 1);
  }

  return JSON.parse(limpio);
}

/**
 * INVOCADOR DE GOOGLE GEMINI / GEMMA
 */
async function invocarGemini(apiKey, userPrompt, hardwareInfo) {
  let listaModelos = [
    'gemini-2.0-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-pro-latest',
    'gemma-2-27b-it',
    'gemma-2-9b-it'
  ];

  try {
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (listRes.ok) {
      const listData = await listRes.json();
      const validos = (listData.models || [])
        .filter(m => 
          m.supportedGenerationMethods?.includes('generateContent') &&
          !m.name.includes('-tts') &&
          !m.name.includes('-audio') &&
          !m.name.includes('embedding')
        )
        .map(m => m.name.replace(/^models\//, ''));

      if (validos.length > 0) {
        listaModelos = [...validos];
      }
    }
  } catch (e) {
    console.warn('[GEMINI] Consulta dinámica omitida:', e);
  }

  const modelosUnicos = [...new Set(listaModelos)];
  let ultimoError = null;

  for (const model of modelosUnicos) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const esGemma = model.toLowerCase().includes('gemma');

    // Construcción del payload respetando la compatibilidad con Gemma
    const promptCompleto = `${BIOFLEET_SYSTEM_PROMPT}\n\nHARDWARE DISPONIBLE: ${JSON.stringify(hardwareInfo || {})}\n\nSOLICITUD:\n"${userPrompt}"\n\nIMPORTANTE: DEVUELVE EXCLUSIVAMENTE EL OBJETO JSON ENTRE LLAVES {}. NO ESCRIBAS TEXTO ADICIONAL.`;

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: promptCompleto }]
        }
      ],
      generationConfig: {
        temperature: 0.1
      }
    };

    // Añadir response_mime_type solo para modelos Gemini compatibles
    if (!esGemma) {
      payload.generationConfig.response_mime_type = 'application/json';
    }

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
          try {
            const parsed = extraerJsonPuro(rawText);
            console.log(`✅ [GEMINI] Compilación exitosa usando modelo: ${model}`);
            return parsed;
          } catch (jsonErr) {
            console.warn(`[GEMINI] ${model} respondió pero el texto no era JSON limpio:`, rawText);
            ultimoError = `El modelo devolvió texto en vez de JSON: ${jsonErr.message}`;
            continue;
          }
        }
      } else {
        const errJson = await response.json().catch(() => null);
        ultimoError = errJson?.error?.message || `HTTP ${response.status}`;
        console.warn(`[GEMINI] Modelo ${model} no compatible (${response.status}), rotando...`);
        continue;
      }
    } catch (err) {
      ultimoError = err.message;
      console.warn(`[GEMINI] Error en modelo ${model}:`, err.message);
      continue;
    }
  }

  throw new Error(`Google Gemini no pudo completar la solicitud: ${ultimoError}`);
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
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Error API (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const rawText = data?.choices?.[0]?.message?.content;
  if (!rawText) throw new Error('El modelo no devolvió contenido.');
  return extraerJsonPuro(rawText);
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
