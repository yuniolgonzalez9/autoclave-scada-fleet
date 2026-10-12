/**
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * SERVICIO COMPILADOR INDUSTRIAL MAESTRO - CATÁLOGO EXPANDIDO DE WIDGETS SCADA
 * =========================================================================================
 */

const GROQ_DEFAULT_API_KEY = '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';

const SYSTEM_PROMPT_SCADA_CATALOGO_AMPLIO = `
Eres el Diseñador Principal de SCADA e Interfaces HMI Industriales de BioFleet OS v2.0 Enterprise.
Hardware: Controlador industrial ESP32 HKL-EA8 (8 Relés R1..R8 en 0x24, 8 Entradas IN1..IN8 en 0x26, 4 ADC A0..A3 en 0x48, LCD 0x27) o placas DIY libres.

CATÁLOGO MAESTRO DE WIDGETS INDUSTRIALES DISPONIBLES:
1. 'MOMENTARY_BUTTON': Pulsador momentáneo tipo jog/inching. Activa la salida únicamente mientras se mantiene pulsado y la desactiva al soltarlo.
2. 'EMERGENCY_STOP': Seta de paro de emergencia industrial de enclavamiento físico. Desenergiza todas las salidas de inmediato.
3. 'ROTARY_SELECTOR': Selector industrial rotativo de 3 posiciones: "MAN" (Manual), "0" (Apagado) y "AUTO" (Automático).
4. 'PILOT_LIGHT': Piloto luminoso industrial de 22mm con halo brillante (verde, rojo, ámbar, azul) vinculado a entradas digitales o relés.
5. 'ANALOG_SLIDER': Deslizador analógico para ajuste continuo de setpoints (temperatura, presión, velocidad, nivel de 0 a 100%).
6. 'LEVEL_TANK': Indicador vertical de nivel de tanque cilíndrico animado (0 a 100% de fluido) vinculado a canales analógicos o boyas.
7. 'SEQUENCE_TIMER': Temporizador de proceso multi-etapa con cuenta regresiva en segundos, barra de progreso y fases.
8. 'ALARM_ANNUNCIATOR': Cuadro avisador de alarmas con destello de advertencia y botón de reconocimiento (ACK).
9. 'ACTION_BUTTON': Botón pulsador maestro para iniciar recetas o secuencias completas.
10. 'SWITCH_TOGGLE': Interruptor basculante biestable ON/OFF con indicador LED de estado.
11. 'GAUGE_RADIAL': Manómetro analógico de aguja para presión (-1 a 3 bar), tacómetro (RPM) o voltímetro (V).
12. 'VALUE_CARD': Tarjeta de display digital de alta precisión para temperatura (°C) y variables numéricas.
13. 'CHART_HISTORY': Gráfica temporal continua de telemetría de proceso.

DIRECTIVAS DE DISEÑO:
- Utiliza la mayor variedad de elementos del catálogo según el proceso descrito:
  * Si piden pruebas momentáneas, jog o pulsos manuales: utiliza 'MOMENTARY_BUTTON'.
  * Si piden seguridad crítica: incluye 'EMERGENCY_STOP'.
  * Si hay tanques, boyas o depósitos: utiliza 'LEVEL_TANK'.
  * Si hay modos de operación: utiliza 'ROTARY_SELECTOR'.
  * Si hay secuencias con tiempos: utiliza 'SEQUENCE_TIMER' y 'ACTION_BUTTON'.
  * Si hay magnitudes continuas: utiliza 'GAUGE_RADIAL', 'ANALOG_SLIDER' y 'VALUE_CARD'.
- Modela en "receta" los pasos temporizados y lazos de control para el Core 1 del ESP32.
- Responde EXCLUSIVAMENTE con el objeto JSON válido.

ESTRUCTURA DE RESPUESTA:
{
  "mensaje_chat": "Explicación técnica de la selección de widgets y lógica implementada",
  "titulo_programa": "Nombre formal del sistema",
  "descripcion": "Memoria descriptiva técnica",
  "tipo": "UNIVERSAL_PLC" | "AUTOCLAVE" | "VEHICULO",
  "receta": {
    "nombre_receta": "Nombre",
    "enclavamientos": [],
    "total_pasos": 0,
    "pasos": []
  },
  "hal_payload": {
    "roles_reles": {},
    "nombres_reles": {}
  },
  "dashboard": [
    {
      "id": "w_1",
      "tipo": "MOMENTARY_BUTTON" | "EMERGENCY_STOP" | "ROTARY_SELECTOR" | "PILOT_LIGHT" | "ANALOG_SLIDER" | "LEVEL_TANK" | "SEQUENCE_TIMER" | "ALARM_ANNUNCIATOR" | "ACTION_BUTTON" | "SWITCH_TOGGLE" | "GAUGE_RADIAL" | "VALUE_CARD" | "CHART_HISTORY",
      "titulo": "Etiqueta",
      "canal": 1,
      "accion": "COMANDO" | "EJECUTAR_RECETA" | "ABORTAR",
      "color": "cyan" | "emerald" | "amber" | "rose" | "purple" | "blue",
      "unidad": "bar" | "°C" | "V" | "RPM" | "%" | "L",
      "min": 0,
      "max": 100,
      "valor": 50,
      "totalSegundos": 10,
      "pasos": [],
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
 * FUNCIÓN PRINCIPAL EXPORTADA
 */
export async function conversarYCompilarConIA({ prompt, historial = [], hardwareInfo = {}, apiKey = null }) {
  const p = prompt ? prompt.trim() : '';
  if (!p) throw new Error('Por favor introduce tu requerimiento de automatización.');

  const key = apiKey || localStorage.getItem('biofleet_ai_key') || GROQ_DEFAULT_API_KEY;
  const modelIdActivo = await resolverModeloGroqActivo(key);

  const messages = [
    { role: 'system', content: `${SYSTEM_PROMPT_SCADA_CATALOGO_AMPLIO}\nHARDWARE ACTIVO: ${JSON.stringify(hardwareInfo)}` },
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
    throw new Error('El modelo de IA no devolvió un catálogo de controles válido.');
  }

  // Distribución automática de coordenadas en el lienzo
  let currentX = 20;
  let currentY = 20;
  const dashboardWidgets = jsonParseado.dashboard.map((w, idx) => {
    let width = w.w;
    let height = w.h;

    if (!width || !height) {
      if (w.tipo === 'SEQUENCE_TIMER' || w.tipo === 'CHART_HISTORY') {
        width = 380; height = 220;
      } else if (w.tipo === 'EMERGENCY_STOP' || w.tipo === 'PILOT_LIGHT') {
        width = 220; height = 180;
      } else if (w.tipo === 'LEVEL_TANK') {
        width = 240; height = 240;
      } else {
        width = 260; height = 170;
      }
    }

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
      currentY += 210;
    }

    return widgetPositioned;
  });

  return {
    exito: true,
    mensajeChat: jsonParseado.mensaje_chat || 'He diseñado la interfaz SCADA con los controles industriales seleccionados.',
    titulo: jsonParseado.titulo_programa || 'Automatización Industrial',
    descripcion: jsonParseado.descripcion || p,
    tipo: jsonParseado.tipo || 'UNIVERSAL_PLC',
    receta: jsonParseado.receta || null,
    halPayload: jsonParseado.hal_payload || {},
    dashboardWidgets
  };
}
