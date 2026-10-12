/**
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * SERVICIO COMPILADOR INDUSTRIAL MAESTRO - GENERADOR DE AUTÓMATAS FSM PARA ESP32 (v8.5)
 * MODELO: GROQ OPENAI GPT-OSS-120B / LLAMA 3.1
 * =========================================================================================
 */

const GROQ_DEFAULT_API_KEY = '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';

const SYSTEM_PROMPT_INGENIERO_SENIOR_C_PLUS_PLUS = `
Eres el Arquitecto Principal de Sistemas Embebidos y Control Industrial de BioFleet OS v2.0 Enterprise.
Tu misión es COMPILAR cualquier requerimiento humano en un MANIFIESTO INDUSTRIAL COMPLETO Y COMPLEJO en formato JSON, diseñado para ejecutarse de forma determinista y autónoma en el Core 1 (Soft-PLC) de un microcontrolador ESP32 (Firmware v8.5 en C++/FreeRTOS) sobre una placa HKL-EA8 o placa DIY libre.

CONOCIMIENTO ABSOLUTO DEL HARDWARE Y DE LAS ESTRUCTURAS EN C++:

1. MAPEO FÍSICO (HKL-EA8 Industrial PLC):
   - 8 Relés de Potencia (R1 a R8): I2C 0x24 (PCF8574) o GPIO directos.
   - 8 Entradas Optocopladas (IN1 a IN8): I2C 0x26 (PCF8574) o GPIO con pull-up.
   - 4 Canales ADC de 16-bit (A0 a A3): I2C 0x48 (ADS1115):
     * A0: Temperatura (°C, rango 0..150°C o PT100).
     * A1: Presión / Vacío (bar, rango -1..3 bar o PSI).
     * A2: Tensión / Batería / Alternador (V, rango 0..16V o 0..24V).
     * A3: Nivel de Tanque o Humedad (%, rango 0..100%).
   - Display LCD: I2C 0x27 (16x2 o 20x4).

2. ESTRUCTURA EXACTA DEL MOTOR DE RECETA EN C++ (Core 1 a 50Hz):
   - "enclavamientos": Matriz de hasta 4 reglas de seguridad que evalúan entradas en <20ms.
     Estructura: [ { "sensor": "IN1".."IN8", "valor_disparo": 0|1, "corte_total": true, "rele_alarma": "R1".."R8"|"", "mensaje": "TEXTO_CORTO" } ]
   - "pasos": Matriz secuencial de fases (hasta 24 fases).
     Estructura de cada fase:
     {
       "nombre": "Nombre de la fase (hasta 20 caracteres)",
       "tipo_transicion": "INMEDIATO" | "TEMPORIZADO" | "CONDICIONAL_DIGITAL" | "CONDICIONAL_ANALOGICA",
       "tiempo_ms": uint32 (milisegundos si es TEMPORIZADO),
       "condicion_digital": { "sensor": "IN1".."IN8", "valor": 0|1 },
       "condicion_analogica": { "canal": "A0".."A3", "operador": ">"|"<"|"=", "umbral": float },
       "timeout_ms": uint32 (tiempo límite de seguridad para abortar si no se cumple la condición),
       "acciones_encender": ["R1", "R2", ...],
       "acciones_apagar": ["R3", ...],
       "lazo_control": {
         "actuador": "R1".."R8",
         "sensor": "A0".."A3",
         "setpoint": float,
         "histeresis": float
       }
     }

3. DASHBOARD SCADA COMPLETO (WIDGETS REACTIVOS):
   - 'SEQUENCE_TIMER': Muestra el progreso de la receta, cuenta regresiva en segundos y desglose de fases.
   - 'ACTION_BUTTON': Botón maestro ("accion": "EJECUTAR_RECETA" o "ABORTAR").
   - 'SWITCH_TOGGLE': Interruptores para los relés involucrados.
   - 'GAUGE_RADIAL': Manómetros o relojes analógicos para presión (A1), nivel (A3) o batería (A2).
   - 'VALUE_CARD': Tarjetas digitales para temperatura (A0).
   - 'STATUS_LED': Indicadores luminosos para entradas de seguridad (IN1..IN8).
   - 'CHART_HISTORY': Gráfica temporal continua de telemetría.

DIRECTIVAS OBLIGATORIAS:
- NUNCA generes respuestas a medias o simplistas. Genera el programa COMPLETO, con todos los relés necesarios, las calibraciones de sensores, las fases de la máquina de estados y las reglas de seguridad.
- Si es un autoclave, modela vacío inicial, rampas térmicas con lazo bang-bang en R1 con A0 a 134°C, meseta de esterilización, purga y secado, más enclavamiento de puerta IN1.
- Si es un vehículo o generador, modela precalentamiento, crank, comprobación de alternador o RPM en A2/IN2, lazo de marcha y corte total.
- Si es un proceso industrial químico o de bombeo, modela llenado, agitación, dosificación, vaciado y niveles de seguridad.
- Responde EXCLUSIVAMENTE con el objeto JSON válido.

ESTRUCTURA DE RESPUESTA:
{
  "mensaje_chat": "Explicación técnica detallada de la arquitectura, fases, lazos de control y enclavamientos implementados",
  "titulo_programa": "Nombre formal de la máquina o proceso",
  "descripcion": "Memoria descriptiva de ingeniería",
  "tipo": "UNIVERSAL_PLC" | "AUTOCLAVE" | "VEHICULO",
  "receta": {
    "nombre_receta": "Nombre",
    "enclavamientos": [],
    "total_pasos": N,
    "pasos": []
  },
  "hal_payload": {
    "roles_reles": {},
    "nombres_reles": {},
    "roles_entradas": {},
    "nombres_entradas": {},
    "calibracion_adc": {
      "A0": { "unidad": "°C", "min": 0, "max": 150 },
      "A1": { "unidad": "bar", "min": -1, "max": 3 },
      "A2": { "unidad": "V", "min": 0, "max": 16 },
      "A3": { "unidad": "%", "min": 0, "max": 100 }
    }
  },
  "dashboard": [
    {
      "id": "w_1",
      "tipo": "SEQUENCE_TIMER" | "ACTION_BUTTON" | "SWITCH_TOGGLE" | "GAUGE_RADIAL" | "VALUE_CARD" | "STATUS_LED" | "CHART_HISTORY",
      "titulo": "Etiqueta",
      "canal": 1,
      "accion": "EJECUTAR_RECETA" | "ABORTAR" | "COMANDO",
      "color": "cyan" | "emerald" | "amber" | "rose" | "purple",
      "unidad": "bar" | "°C" | "V" | "RPM" | "%" | "",
      "min": 0,
      "max": 100,
      "totalSegundos": 10,
      "pasos": [],
      "w": 360,
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
 * FUNCIÓN PRINCIPAL EXPORTADA: COMPILADOR INDUSTRIAL
 */
export async function conversarYCompilarConIA({ prompt, historial = [], hardwareInfo = {}, apiKey = null }) {
  const p = prompt ? prompt.trim() : '';
  if (!p) throw new Error('Por favor introduce tu requerimiento de automatización.');

  const key = apiKey || localStorage.getItem('biofleet_ai_key') || GROQ_DEFAULT_API_KEY;

  const modelIdActivo = await resolverModeloGroqActivo(key);
  console.log(`🧠 [BIOFLEET COMPILER] Compilando con modelo de razonamiento: ${modelIdActivo}`);

  const messages = [
    { role: 'system', content: `${SYSTEM_PROMPT_INGENIERO_SENIOR_C_PLUS_PLUS}\nHARDWARE ACTIVO: ${JSON.stringify(hardwareInfo)}` },
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

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`[Groq Error ${response.status}]: ${errorText}`);
  }

  const data = await response.json();
  const rawText = data?.choices?.[0]?.message?.content;
  const jsonParseado = sanitizarJson(rawText);

  if (!jsonParseado || !jsonParseado.dashboard || jsonParseado.dashboard.length === 0) {
    throw new Error('El modelo no devolvió una estructura de control válida.');
  }

  // Distribución automática de coordenadas en el lienzo para que no queden superpuestos
  let currentX = 20;
  let currentY = 20;
  const dashboardWidgets = jsonParseado.dashboard.map((w, idx) => {
    const width = w.w || (w.tipo === 'SEQUENCE_TIMER' || w.tipo === 'CHART_HISTORY' ? 380 : 260);
    const height = w.h || (w.tipo === 'SEQUENCE_TIMER' ? 220 : 170);

    const widgetPositioned = {
      ...w,
      id: w.id || `w_${Date.now()}_${idx}`,
      x: currentX,
      y: currentY,
      w: width,
      h: height
    };

    currentX += width + 20;
    if (currentX > 860) {
      currentX = 20;
      currentY += 190;
    }

    return widgetPositioned;
  });

  return {
    exito: true,
    mensajeChat: jsonParseado.mensaje_chat || 'He compilado la arquitectura de control completa.',
    titulo: jsonParseado.titulo_programa || 'Automatización Industrial',
    descripcion: jsonParseado.descripcion || p,
    tipo: jsonParseado.tipo || 'UNIVERSAL_PLC',
    receta: jsonParseado.receta || null,
    halPayload: jsonParseado.hal_payload || {},
    dashboardWidgets
  };
}
