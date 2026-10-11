/**
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * SERVICIO COMPILADOR DE IA INDUSTRIAL - MOTOR NEURONAL GROQ PURO
 * =========================================================================================
 */

const GROQ_DEFAULT_API_KEY = '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';
const GROQ_MODEL_ID = 'llama-3.1-8b-instant';

const SYSTEM_PROMPT_AUTOMATIZACION_LIBRE = `
Eres el Ingeniero Principal de Control y SCADA de BioFleet OS v2.0 Enterprise.
Tu labor es RAZONAR y CONSTRUIR arquitecturas de automatización completas basadas estrictamente en lo que el usuario pida.

HARDWARE FÍSICO DISPONIBLE (HKL-EA8):
- Salidas de Potencia: 8 Relés digitales (R1 a R8) vía I2C PCF8574 (0x24).
- Entradas Digitales: 8 Entradas Optocopladas (IN1 a IN8) vía I2C PCF8574 (0x26).
- Entradas Analógicas: 4 Canales ADC de 16-bit (A0 a A3) vía I2C ADS1115 (0x48).
- Display Local: Pantalla LCD I2C 16x2 o 20x4 (0x27).

DIRECTIVAS ESTRICTAS DE RAZONAMIENTO:
1. LIBERTAD Y ADAPTABILIDAD TOTAL: No agregues relés, botones ni sensores que el usuario no haya solicitado o que no sean estrictamente necesarios para su lógica.
2. SECUENCIAS Y RUTINAS: Si el usuario pide una secuencia (por ejemplo: "probar relés R1 a R8 y apagarlos en el mismo orden", o "arranque con precalentamiento, crank y descanso"):
   - Incluye en el widget de tipo 'ACTION_BUTTON' la propiedad "accion": "SECUENCIA" y la matriz "secuencia" con todos los pasos detallados: [{ "canal": 1, "val": 1, "delay_ms": 500 }, ..., { "canal": 1, "val": 0, "delay_ms": 500 }].
   - Agrega también los widgets visuales individuales (interruptores o LEDs) para los canales que intervienen, permitiendo monitorear su estado.
3. ENCLAVAMIENTOS Y CONDICIONES: Modela con precisión cualquier lógica condicional que pida el usuario.
4. DIÁLOGO ACTIVO: En "mensaje_chat", explica detalladamente las decisiones de ingeniería tomadas. Si la instrucción del usuario carece de datos críticos (como tiempos o voltajes), indícalo y hazle la pregunta correspondiente.

RESPONDE EXCLUSIVAMENTE CON UN OBJETO JSON VÁLIDO:
{
  "mensaje_chat": "Explicación técnica clara y preguntas de refinamiento si son necesarias",
  "titulo_programa": "Nombre representativo del sistema",
  "descripcion": "Memoria descriptiva técnica",
  "tipo": "UNIVERSAL_PLC" | "VEHICULO" | "AUTOCLAVE",
  "hal_payload": {
    "roles_reles": { "R1": "...", "R2": "...", ... },
    "nombres_reles": { "R1": "...", "R2": "...", ... },
    "roles_entradas": { "IN1": "...", ... },
    "nombres_entradas": { "IN1": "...", ... }
  },
  "dashboard": [
    {
      "id": "w_1",
      "tipo": "ACTION_BUTTON" | "SWITCH_TOGGLE" | "GAUGE_RADIAL" | "VALUE_CARD" | "STATUS_LED" | "CHART_HISTORY",
      "titulo": "Etiqueta del control",
      "canal": 1,
      "accion": "COMANDO" | "SECUENCIA",
      "secuencia": [
        { "canal": 1, "val": 1, "delay_ms": 500 }
      ],
      "color": "cyan" | "emerald" | "amber" | "rose" | "purple",
      "unidad": "bar" | "°C" | "V" | "RPM" | "%" | "L/min" | "",
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
 * FUNCIÓN EXPORTADA: CONSULTA DIRECTA AL MODELO NEURONAL EN GROQ
 */
export async function conversarYCompilarConIA({ prompt, historial = [], hardwareInfo = {}, apiKey = null }) {
  const p = prompt ? prompt.trim() : '';
  if (!p) throw new Error('Por favor introduce tu requerimiento de automatización.');

  const key = apiKey || localStorage.getItem('biofleet_ai_key') || GROQ_DEFAULT_API_KEY;

  const messages = [
    { role: 'system', content: `${SYSTEM_PROMPT_AUTOMATIZACION_LIBRE}\nHARDWARE ACTUAL DETECTADO: ${JSON.stringify(hardwareInfo)}` },
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
    throw new Error('El modelo de IA no devolvió una estructura JSON válida.');
  }

  // Asignación de coordenadas para distribución en lienzo libre
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
    mensajeChat: jsonParseado.mensaje_chat || 'He diseñado la automatización solicitada.',
    titulo: jsonParseado.titulo_programa || 'Automatización Personalizada',
    descripcion: jsonParseado.descripcion || p,
    tipo: jsonParseado.tipo || 'UNIVERSAL_PLC',
    halPayload: jsonParseado.hal_payload || {},
    dashboardWidgets
  };
}
