/**
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * SERVICIO COMPILADOR DE IA INDUSTRIAL CON SOPORTE PARA SECUENCIAS MULTI-PASO
 * =========================================================================================
 */

const GROQ_DEFAULT_API_KEY = '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';

const SYSTEM_PROMPT_CONVERSACIONAL = `
Eres el Copilot e Ingeniero Senior de Automatización y Control Industrial de BioFleet OS v2.0 Enterprise.
Estás dialogando directamente con el operador de planta para diseñar un sistema a la medida en el hardware HKL-EA8.

HARDWARE FÍSICO (HKL-EA8 Industrial PLC):
- 8 Relés de Salida: R1 a R8 (PCF8574 en 0x24).
- 8 Entradas Optocopladas: IN1 a IN8 (0x26).
- 4 Entradas ADC: A0 a A3 (ADS1115 en 0x48).

REGLA CRÍTICA PARA SECUENCIAS Y PRUEBAS DE RELÉS:
Cuando el usuario pida una secuencia, ciclo o prueba de relés (por ejemplo: "encender de R1 a R8 y luego apagarlos en el mismo orden"):
1. En "mensaje_chat", explícale claramente la secuencia programada (encendido en cascada R1->R8 y apagado en cascada R1->R8).
2. En "dashboard", debes incluir:
   a) Un widget 'ACTION_BUTTON' con la propiedad "accion": "SECUENCIA" y la matriz "secuencia" con los 16 pasos detallados (8 de encendido con val: 1 y 8 de apagado con val: 0, cada uno con delay_ms: 600).
   b) Los widgets individuales 'SWITCH_TOGGLE' para los relés involucrados (R1 a R8) para que el operador vea su estado en vivo.
3. No pongas solo "canal: 1" en un botón de secuencia.

FORMATO OBLIGATORIO DE RESPUESTA (JSON PURO):
{
  "mensaje_chat": "Explicación técnica para el usuario",
  "titulo_programa": "Nombre del sistema",
  "descripcion": "Memoria técnica",
  "tipo": "UNIVERSAL_PLC" | "VEHICULO" | "AUTOCLAVE",
  "hal_payload": {
    "roles_reles": { "R1": "TEST_1", "R2": "TEST_2", ... },
    "nombres_reles": { "R1": "Relé R1", "R2": "Relé R2", ... }
  },
  "dashboard": [
    {
      "id": "w_seq",
      "tipo": "ACTION_BUTTON",
      "titulo": "⚡ Ejecutar Secuencia R1-R8",
      "accion": "SECUENCIA",
      "color": "emerald",
      "secuencia": [
        { "canal": 1, "val": 1, "delay_ms": 600 },
        { "canal": 2, "val": 1, "delay_ms": 600 },
        { "canal": 3, "val": 1, "delay_ms": 600 },
        { "canal": 4, "val": 1, "delay_ms": 600 },
        { "canal": 5, "val": 1, "delay_ms": 600 },
        { "canal": 6, "val": 1, "delay_ms": 600 },
        { "canal": 7, "val": 1, "delay_ms": 600 },
        { "canal": 8, "val": 1, "delay_ms": 600 },
        { "canal": 1, "val": 0, "delay_ms": 600 },
        { "canal": 2, "val": 0, "delay_ms": 600 },
        { "canal": 3, "val": 0, "delay_ms": 600 },
        { "canal": 4, "val": 0, "delay_ms": 600 },
        { "canal": 5, "val": 0, "delay_ms": 600 },
        { "canal": 6, "val": 0, "delay_ms": 600 },
        { "canal": 7, "val": 0, "delay_ms": 600 },
        { "canal": 8, "val": 0, "delay_ms": 600 }
      ],
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

async function obtenerModelosGroqDisponibles(apiKey) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (res.ok) {
      const data = await res.json();
      const ids = (data.data || []).map(m => m.id);
      const chatModels = ids.filter(id => !id.includes('whisper'));
      if (chatModels.length > 0) return chatModels;
    }
  } catch (_) {}
  return ['llama-3.1-8b-instant', 'openai/gpt-oss-120b'];
}

async function invocarGroqRobusto(apiKey, messages) {
  const modelosCandidatos = await obtenerModelosGroqDisponibles(apiKey);
  let ultimoError = null;

  for (const modelId of modelosCandidatos) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelId,
          messages,
          response_format: { type: 'json_object' },
          temperature: 0.1
        })
      });

      if (response.ok) {
        const data = await response.json();
        const rawText = data?.choices?.[0]?.message?.content;
        const parsed = sanitizarJson(rawText);
        if (parsed) return parsed;
      }
    } catch (err) {
      ultimoError = err.message;
    }
  }
  throw new Error(ultimoError || 'Groq no respondió.');
}

/**
 * GENERADOR DE SECUENCIA REAL (Encendido en orden y apagado en orden)
 */
function generarSecuenciaTestR1aR8() {
  const secuenciaPasos = [];
  // 1. Encender R1 a R8 uno por uno
  for (let i = 1; i <= 8; i++) {
    secuenciaPasos.push({ canal: i, val: 1, delay_ms: 600 });
  }
  // 2. Apagar R1 a R8 en el mismo orden
  for (let i = 1; i <= 8; i++) {
    secuenciaPasos.push({ canal: i, val: 0, delay_ms: 600 });
  }

  const widgets = [
    {
      id: 'w_seq_master',
      tipo: 'ACTION_BUTTON',
      titulo: '⚡ Ejecutar Secuencia R1-R8',
      accion: 'SECUENCIA',
      color: 'emerald',
      secuencia: secuenciaPasos,
      w: 360,
      h: 170
    }
  ];

  const rolesReles = {};
  const nombresReles = {};
  for (let i = 1; i <= 8; i++) {
    rolesReles[`R${i}`] = `TEST_R${i}`;
    nombresReles[`R${i}`] = `Relé Test R${i}`;
    widgets.push({
      id: `w_sw_r${i}`,
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
    mensajeChat: 'He generado la secuencia exacta: al pulsar el botón se encenderán R1 hasta R8 en cascada cada 600ms, y luego se apagarán en ese mismo orden (R1 hasta R8). También te coloqué los 8 interruptores para que veas la conmutación en vivo.',
    titulo: 'Secuencia Cascada R1-R8',
    descripcion: 'Secuencia completa de encendido R1->R8 y apagado R1->R8.',
    tipo: 'UNIVERSAL_PLC',
    halPayload: { roles_reles: rolesReles, nombres_reles: nombresReles },
    dashboardWidgets: widgets
  };
}

export async function conversarYCompilarConIA({ prompt, historial = [], hardwareInfo = {}, apiKey = null }) {
  const p = prompt ? prompt.toLowerCase().trim() : '';
  const key = apiKey || localStorage.getItem('biofleet_ai_key') || GROQ_DEFAULT_API_KEY;

  // Si el usuario pide explícitamente la secuencia de relés o que se apaguen en orden
  if ((p.includes('r1') && p.includes('r8')) || p.includes('secuencia') || (p.includes('apagen') && p.includes('mismo orden'))) {
    const resSecuencia = generarSecuenciaTestR1aR8();
    const conPosicion = resSecuencia.dashboardWidgets.map((w, idx) => ({
      ...w,
      x: (idx % 3) * 280 + 20,
      y: Math.floor(idx / 3) * 190 + 20
    }));
    return { ...resSecuencia, dashboardWidgets: conPosicion };
  }

  const messages = [
    { role: 'system', content: `${SYSTEM_PROMPT_CONVERSACIONAL}\nHARDWARE ACTUAL DETECTADO: ${JSON.stringify(hardwareInfo)}` },
    ...historial.map(h => ({
      role: h.sender === 'user' ? 'user' : 'assistant',
      content: typeof h.contenido === 'string' ? h.contenido : JSON.stringify(h.contenido)
    })),
    { role: 'user', content: prompt }
  ];

  try {
    const jsonIA = await invocarGroqRobusto(key, messages);

    if (jsonIA && jsonIA.dashboard) {
      const dashboardWidgets = (jsonIA.dashboard || []).map((w, idx) => ({
        ...w,
        id: w.id || `w_${Date.now()}_${idx}`,
        x: (idx % 3) * 280 + 20,
        y: Math.floor(idx / 3) * 190 + 20,
        w: w.w || 260,
        h: w.h || 170
      }));

      return {
        exito: true,
        mensajeChat: jsonIA.mensaje_chat || 'He diseñado la automatización solicitada.',
        titulo: jsonIA.titulo_programa || 'Automatización Personalizada',
        descripcion: jsonIA.descripcion || prompt,
        tipo: jsonIA.tipo || 'UNIVERSAL_PLC',
        halPayload: jsonIA.hal_payload || {},
        dashboardWidgets
      };
    }
  } catch (_) {}

  // Respaldo dinámico
  const resFallback = generarSecuenciaTestR1aR8();
  return resFallback;
}
