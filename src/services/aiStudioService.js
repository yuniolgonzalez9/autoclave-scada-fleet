/**
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * SERVICIO COMPILADOR DE IA INDUSTRIAL - MOTOR GROQ (LLAMA 3.3 70B VERSATILE)
 * =========================================================================================
 */

// CLAVE GROQ POR DEFECTO DEL PROYECTO
const GROQ_DEFAULT_API_KEY = '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';

const SYSTEM_PROMPT_INGENIERO_AUTOMATIZACION = `
Eres un Ingeniero Principal de Automatización Industrial, SCADA y Sistemas Embebidos de BioFleet OS v2.0.
Tu objetivo es realizar un RAZONAMIENTO ABSOLUTO de cualquier requerimiento complejo, protocolo de esterilización, proceso industrial químico, máquina herramienta o secuencia vehicular que introduzca el usuario.

ESPECIFICACIONES DEL CONTROLADOR FÍSICO (HKL-EA8 Industrial PLC):
1. 8 SALIDAS A RELÉ (R1 a R8): Contactos secos gobernados vía I2C por expansor PCF8574 en dirección 0x24.
2. 8 ENTRADAS DIGITALES (IN1 a IN8): Optoacopladas NPN/PNP con aislamiento galvánico en dirección 0x26.
3. 4 CANALES ANALÓGICOS (A0 a A3): Convertidor ADC ADS1115 de 16 bits en dirección 0x48 (0-10V, 4-20mA, PT100 o transductores de presión).
4. DISPLAY LOCAL: Pantalla LCD alfanumérica I2C 16x2 o 20x4 en dirección 0x27.

CAPACIDADES DEL DASHBOARD SCADA (WIDGETS REACTIVOS):
- 'ACTION_BUTTON': Botón maestro para ejecutar secuencias completas, ciclos o rutinas de prueba.
- 'SWITCH_TOGGLE': Interruptor biestable ON/OFF para operar relés de potencia individuales de forma segura.
- 'GAUGE_RADIAL': Manómetro analógico de aguja para presión (bar/PSI), velocidad (RPM), nivel (%) o tensión (V).
- 'VALUE_CARD': Tarjeta digital de alta precisión para temperatura (°C), tiempo o caudal.
- 'STATUS_LED': Indicador luminoso (ON/OFF) vinculado a sensores fin de carrera, alternador o alarmas.
- 'CHART_HISTORY': Registrador gráfico continuo de telemetría de proceso.

DIRECTIVAS ESTRICTAS DE RAZONAMIENTO:
1. Analiza todas las condiciones lógicas, dependencias temporales (segundos, minutos), umbrales analógicos y enclavamientos de seguridad.
2. Si el usuario pide un vehículo, autoclave, planta de bombeo o máquina especializada, bautiza cada relé y entrada con su función técnica exacta.
3. Asigna colores lógicos a los widgets: 'emerald' para marcha/seguro, 'amber' para calentamiento/precaución, 'rose' para alarmas/cortes/paro, 'cyan' para válvulas/bombas/sensores.
4. Devuelve ÚNICAMENTE un objeto JSON estrictamente válido, sin introducciones conversacionales ni bloques markdown.

ESTRUCTURA DEL JSON REQUERIDA:
{
  "titulo_programa": "Nombre técnico de la máquina o proceso",
  "descripcion": "Memoria descriptiva de la secuencia, enclavamientos y lógica analizada",
  "tipo": "VEHICULO" | "AUTOCLAVE" | "UNIVERSAL_PLC",
  "hal_payload": {
    "roles_reles": {
      "R1": "ROL_TECNICO_1", "R2": "ROL_TECNICO_2", "R3": "ROL_TECNICO_3", "R4": "ROL_TECNICO_4",
      "R5": "ROL_TECNICO_5", "R6": "ROL_TECNICO_6", "R7": "ROL_TECNICO_7", "R8": "ROL_TECNICO_8"
    },
    "nombres_reles": {
      "R1": "Nombre Actuador 1", "R2": "Nombre Actuador 2", ...
    },
    "roles_entradas": {
      "IN1": "SENSOR_1", "IN2": "SENSOR_2", ...
    },
    "nombres_entradas": {
      "IN1": "Nombre Sensor 1", ...
    }
  },
  "dashboard": [
    {
      "id": "w_1",
      "tipo": "ACTION_BUTTON" | "SWITCH_TOGGLE" | "GAUGE_RADIAL" | "VALUE_CARD" | "STATUS_LED" | "CHART_HISTORY",
      "titulo": "Etiqueta en pantalla",
      "canal": 1,
      "color": "cyan" | "emerald" | "amber" | "rose" | "purple",
      "unidad": "bar" | "°C" | "V" | "RPM" | "%" | "L/min" | "s",
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
  if (k.startsWith('gsk_')) return 'GROQ';
  if (k.startsWith('sk-or-')) return 'OPENROUTER';
  if (k.startsWith('sk-')) return 'OPENAI';
  if (k.startsWith('AIza') || k.startsWith('AQ.')) return 'GEMINI';
  return 'GROQ';
}

/**
 * Extractor tolerante de JSON limpio
 */
function extraerJsonPuro(textoCrudo) {
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
    } catch (e) {
      console.warn('[JSON SANITIZER] Intento de recuperación fallido:', e);
    }
  }
  return null;
}

/**
 * INVOCACIÓN DE GROQ LLAMA 3.3 70B (300+ TOKENS/SEC EN LPU)
 */
async function invocarGroq(apiKey, userPrompt, hardwareInfo) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_INGENIERO_AUTOMATIZACION },
        {
          role: 'user',
          content: `HARDWARE DISPONIBLE: ${JSON.stringify(hardwareInfo || {})}\n\nREQUERIMIENTO INDUSTRIAL A RAZONAR:\n"${userPrompt}"`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`[Groq Llama 3.3] Error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const rawText = data?.choices?.[0]?.message?.content;
  return extraerJsonPuro(rawText);
}

/**
 * MOTOR DE PARSEO LOCAL DE RESPALDO (Por si se pierde la conexión a internet)
 */
function compilarRespaldoLocal(promptTexto) {
  const p = promptTexto.toLowerCase().trim();
  const widgets = [];
  const nombresReles = {};
  const rolesReles = {};

  for (let i = 1; i <= 8; i++) {
    nombresReles[`R${i}`] = `Salida Relé R${i}`;
    rolesReles[`R${i}`] = 'MANUAL';
  }

  if (p.includes('test') || p.includes('teste') || (p.includes('r1') && p.includes('r8'))) {
    widgets.push({
      id: 'w_test_master',
      tipo: 'ACTION_BUTTON',
      titulo: '⚡ Test Secuencial R1-R8',
      canal: 1,
      color: 'emerald',
      w: 360,
      h: 170
    });
    for (let i = 1; i <= 8; i++) {
      widgets.push({
        id: `w_relay_${i}`,
        tipo: 'SWITCH_TOGGLE',
        titulo: `Relé R${i}`,
        canal: i,
        color: 'cyan',
        w: 240,
        h: 170
      });
    }
    return {
      exito: true,
      fuente: 'MOTOR_LOCAL',
      titulo: 'Banco de Prueba Relés R1-R8',
      descripcion: 'Secuencia de testeo para las 8 salidas.',
      tipo: 'UNIVERSAL_PLC',
      halPayload: { tipo: 'UNIVERSAL_PLC', roles_reles: rolesReles, nombres_reles: nombresReles },
      dashboardWidgets: widgets
    };
  }

  widgets.push({
    id: 'w_cmd_auto',
    tipo: 'ACTION_BUTTON',
    titulo: promptTexto.length > 25 ? promptTexto.substring(0, 22) + '...' : promptTexto,
    canal: 1,
    color: 'emerald',
    w: 280,
    h: 170
  });
  widgets.push({
    id: 'w_sw_auto',
    tipo: 'SWITCH_TOGGLE',
    titulo: 'Salida R1 Activa',
    canal: 1,
    color: 'cyan',
    w: 260,
    h: 170
  });

  return {
    exito: true,
    fuente: 'MOTOR_LOCAL',
    titulo: promptTexto.length > 30 ? promptTexto.substring(0, 27) + '...' : promptTexto,
    descripcion: `Compilación generada para: "${promptTexto}"`,
    tipo: 'UNIVERSAL_PLC',
    halPayload: { tipo: 'UNIVERSAL_PLC', roles_reles: rolesReles, nombres_reles: nombresReles },
    dashboardWidgets: widgets
  };
}

/**
 * FUNCIÓN EXPORTADA PRINCIPAL (EJECUTA GROQ LLAMA 3.3 70B)
 */
export async function compilarConIA({ prompt, device, hardwareInfo, apiKey = null }) {
  const p = prompt ? prompt.trim() : '';
  if (!p) throw new Error('Por favor introduce las especificaciones de tu máquina.');

  const key = apiKey || localStorage.getItem('biofleet_ai_key') || GROQ_DEFAULT_API_KEY;

  let resultadoJson = null;
  console.log('🧠 [BIOFLEET AI] Razonando requerimiento con Groq Llama-3.3-70B...');

  try {
    resultadoJson = await invocarGroq(key, p, hardwareInfo);
  } catch (errApi) {
    console.error('❌ [BIOFLEET AI ERROR EN GROQ]:', errApi);
  }

  // Si la IA generó la arquitectura completa
  if (resultadoJson && resultadoJson.dashboard && resultadoJson.dashboard.length > 0) {
    const dashboardWidgets = resultadoJson.dashboard.map((w, idx) => ({
      ...w,
      id: w.id || `w_ai_${idx + 1}`,
      x: (idx % 3) * 280 + 20,
      y: Math.floor(idx / 3) * 190 + 20,
      w: w.w || 260,
      h: w.h || 170
    }));

    return {
      exito: true,
      fuente: 'GROQ_LLAMA_3.3_70B',
      titulo: resultadoJson.titulo_programa || p,
      descripcion: resultadoJson.descripcion || p,
      tipo: resultadoJson.tipo || 'UNIVERSAL_PLC',
      halPayload: resultadoJson.hal_payload || {},
      dashboardWidgets
    };
  }

  // Respaldo local por si no hay red
  const respaldo = compilarRespaldoLocal(p);
  const widgetsConCoordenadas = respaldo.dashboardWidgets.map((w, idx) => ({
    ...w,
    x: (idx % 3) * 280 + 20,
    y: Math.floor(idx / 3) * 190 + 20
  }));

  return {
    ...respaldo,
    dashboardWidgets: widgetsConCoordenadas
  };
}
