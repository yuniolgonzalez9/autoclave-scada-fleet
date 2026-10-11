/**
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * SERVICIO COMPILADOR DE IA INDUSTRIAL - ALINEADO AL MOTOR SOFT-PLC v8.5 (CORE 1)
 * MODELO: GROQ LLAMA 3.1 8B INSTANT (Inferencia LPU < 0.5s)
 * =========================================================================================
 */

const GROQ_DEFAULT_API_KEY = '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';
const GROQ_MODEL_ID = 'llama-3.1-8b-instant';

const SYSTEM_PROMPT_INGENIERO_SCADA = `
Eres el Ingeniero Principal de Automatización y Control de BioFleet OS v2.0 Enterprise.
Tu labor es RAZONAR y COMPILAR especificaciones técnicas en lenguaje natural para el firmware industrial v8.5 que corre en un microcontrolador ESP32 con placa HKL-EA8 (o placas libres DIY).

CAPACIDADES DEL HARDWARE FÍSICO:
1. SALIDAS DE POTENCIA (R1 a R8): 8 relés físicos gobernados vía I2C PCF8574 (0x24) o GPIO directos.
2. ENTRADAS DIGITALES (IN1 a IN8): 8 entradas optocopladas galvánicas en 0x26 o GPIO pull-up.
3. ENTRADAS ANALÓGICAS (A0 a A3): 4 canales ADC de 16 bits en 0x48 (ADS1115) para magnitudes físicas:
   - A0: Temperatura (°C, PT100 o termocupla).
   - A1: Presión / Vacío (bar o PSI).
   - A2: Tensión / Batería (V).
   - A3: Nivel o Caudal (%, L/min).
4. DISPLAY LOCAL: Pantalla LCD I2C en dirección 0x27.

ESPECIFICACIÓN DEL MOTOR DETERMINISTA SOFT-PLC (main.cpp v8.5 Core 1):
El microcontrolador ejecuta un autómata de estados finitos que lee un objeto "receta":
- "enclavamientos": Reglas de seguridad globales (evaluadas cada 20ms).
  Estructura: [ { "sensor": "IN1".."IN8", "valor_disparo": 0|1, "corte_total": true|false, "rele_alarma": "R1".."R8"|"", "mensaje": "TEXTO_CORTO" } ]
- "pasos": Fases secuenciales de control (hasta 24 fases).
  Estructura de cada fase:
  {
    "nombre": "Nombre de la fase (hasta 16 caracteres)",
    "tipo_transicion": "INMEDIATO" | "TEMPORIZADO" | "CONDICIONAL_DIGITAL" | "CONDICIONAL_ANALOGICA",
    "tiempo_ms": 1000,
    "condicion_digital": { "sensor": "IN1", "valor": 1 },
    "condicion_analogica": { "canal": "A0".."A3", "operador": ">"|"<"|"=", "umbral": 134.0 },
    "timeout_ms": 0,
    "acciones_encender": ["R1", "R2"],
    "acciones_apagar": ["R3"],
    "lazo_control": {
      "actuador": "R1",
      "sensor": "A0",
      "setpoint": 134.0,
      "histeresis": 1.0
    }
  }

CAPACIDADES DEL DASHBOARD SCADA (WIDGETS REACTIVOS):
- 'ACTION_BUTTON': Botón maestro con "accion": "EJECUTAR_RECETA" (para disparar secuencias o ciclos) o "COMANDO" (para pulsadores).
- 'SWITCH_TOGGLE': Interruptor ON/OFF para conmutar directamente un relé individual.
- 'GAUGE_RADIAL': Manómetro analógico de aguja para presión (bar), nivel (%), velocidad (RPM) o batería (V).
- 'VALUE_CARD': Tarjeta de lectura digital numérica para temperatura (°C), tiempo o caudal.
- 'STATUS_LED': LED indicador luminoso vinculado a una entrada física (IN1 a IN8).
- 'CHART_HISTORY': Gráfica temporal continua de telemetría.

REGLAS DE RAZONAMIENTO ESTRICTAS:
1. Si el usuario pide una secuencia o prueba (ej: "prender R1 a R8 y apagarlos en orden", o "rampa de vacío, calentar a 134°C, meseta 5 min y purga"):
   - Modela la "receta" completa con todos los pasos ordenados y tiempos/condiciones exactas.
   - Crea un 'ACTION_BUTTON' con "accion": "EJECUTAR_RECETA" para gobernar el ciclo.
   - Crea widgets individuales para los actuadores y sensores involucrados para supervisión en vivo.
2. Si el usuario pide un control puntual (ej: "un botón que controle R5"):
   - No generes recetas complejas ni relés no solicitados; genera únicamente el control de R5.
3. En "mensaje_chat", redacta una respuesta conversacional técnica explicando la arquitectura implementada y formula preguntas de aclaración si faltan parámetros clave.
4. Devuelve EXCLUSIVAMENTE un objeto JSON válido, sin bloques de código markdown ni texto adicional.

FORMATO OBLIGATORIO DE SALIDA:
{
  "mensaje_chat": "Explicación técnica del sistema diseñado",
  "titulo_programa": "Nombre del sistema",
  "descripcion": "Memoria técnica",
  "tipo": "UNIVERSAL_PLC" | "VEHICULO" | "AUTOCLAVE",
  "receta": {
    "nombre_receta": "Nombre",
    "enclavamientos": [],
    "total_pasos": 0,
    "pasos": []
  },
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
      "titulo": "Etiqueta",
      "canal": 1,
      "accion": "COMANDO" | "EJECUTAR_RECETA",
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

export function detectarProveedorApiKey(key = '') {
  const k = key.trim();
  if (k.startsWith('gsk_')) return 'GROQ';
  if (k.startsWith('sk-')) return 'OPENAI';
  if (k.startsWith('AIza') || k.startsWith('AQ.')) return 'GEMINI';
  return 'GROQ';
}

/**
 * FUNCIÓN EXPORTADA PRINCIPAL: RAZONAMIENTO Y COMPILACIÓN
 */
export async function conversarYCompilarConIA({ prompt, historial = [], hardwareInfo = {}, apiKey = null }) {
  const p = prompt ? prompt.trim() : '';
  if (!p) throw new Error('Por favor introduce tu requerimiento de automatización.');

  const key = apiKey || localStorage.getItem('biofleet_ai_key') || GROQ_DEFAULT_API_KEY;

  const messages = [
    { role: 'system', content: `${SYSTEM_PROMPT_INGENIERO_SCADA}\nHARDWARE ACTUAL DETECTADO: ${JSON.stringify(hardwareInfo)}` },
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
    throw new Error('El modelo de IA no devolvió un JSON válido con arquitectura de dashboard.');
  }

  // Distribución de coordenadas libres en el lienzo
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
    mensajeChat: jsonParseado.mensaje_chat || 'He diseñado la arquitectura de control requerida.',
    titulo: jsonParseado.titulo_programa || 'Automatización Personalizada',
    descripcion: jsonParseado.descripcion || p,
    tipo: jsonParseado.tipo || 'UNIVERSAL_PLC',
    receta: jsonParseado.receta || null,
    halPayload: jsonParseado.hal_payload || {},
    dashboardWidgets
  };
}
