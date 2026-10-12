/**
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * SERVICIO COMPILADOR DE IA - CON NORMALIZADOR INDUSTRIAL DE ESQUEMA TOLERANTE A VARIACIONES
 * =========================================================================================
 */

const GROQ_DEFAULT_API_KEY = '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';

function construirPromptConContexto(hardwareInfo, widgetsActuales, recetaActual, telemetriaActual) {
  return `
Eres el Copilot e Ingeniero Principal de SCADA de BioFleet OS v2.0 Enterprise.
Hardware: HKL-EA8 (8 Relés R1..R8 en 0x24, 8 Entradas IN1..IN8 en 0x26, 4 ADC A0..A3 en 0x48, LCD 0x27).

ESTADO ACTUAL DEL ENTORNO:
1. HARDWARE: ${JSON.stringify(hardwareInfo || {})}
2. WIDGETS EN PANTALLA: ${JSON.stringify(widgetsActuales || [])}
3. RECETA FSM: ${JSON.stringify(recetaActual || null)}

REGLAS DE FORMATO ESTRICTAS:
1. NOMBRES DE PROPIEDADES EXACTOS:
   - Para títulos usa SIEMPRE "titulo" (NO "label", NO "nombre").
   - Para el canal del relé usa SIEMPRE "canal": 1..8 como NÚMERO ENTERO (NO uses "relé": "R5", usa "canal": 5).
   - Para tamaños de widgets: usa ancho "w": 260 y alto "h": 170 como mínimo para interruptores. Para secuencias usa "w": 380 y "h": 220.
2. SECUENCIAS:
   - Si creas una secuencia, debes incluir los pasos TANTO en "receta.pasos" como en "dashboard[].pasos".
   - Cada paso debe tener: { "nombre": "Paso 1", "canal": 1, "tiempo_ms": 3000, "acciones_encender": ["R1"], "acciones_apagar": [] }
3. DIÁLOGO Y MINIMALISMO:
   - En "mensaje_chat", explica claramente lo que construiste.
   - Crea ÚNICAMENTE los widgets solicitados. Si el usuario pide R1, R2 y un interruptor para R5, crea exactamente esos elementos.

RESPONDE EXCLUSIVAMENTE CON UN OBJETO JSON VÁLIDO:
{
  "mensaje_chat": "Explicación técnica para el usuario",
  "titulo_programa": "Nombre del programa",
  "tipo": "UNIVERSAL_PLC",
  "receta": {
    "nombre_receta": "Secuencia R1-R2",
    "enclavamientos": [],
    "total_pasos": 2,
    "pasos": [
      {
        "nombre": "Paso 1",
        "canal": 1,
        "tipo_transicion": "TEMPORIZADO",
        "tiempo_ms": 3000,
        "acciones_encender": ["R1"],
        "acciones_apagar": []
      },
      {
        "nombre": "Paso 2",
        "canal": 2,
        "tipo_transicion": "TEMPORIZADO",
        "tiempo_ms": 3000,
        "acciones_encender": ["R2"],
        "acciones_apagar": ["R1"]
      }
    ]
  },
  "hal_payload": {
    "roles_reles": { "R1": "SECUENCIA", "R2": "SECUENCIA", "R5": "LUZ" },
    "nombres_reles": { "R1": "Relé R1", "R2": "Relé R2", "R5": "Luz R5" }
  },
  "dashboard": [
    {
      "id": "w_seq",
      "tipo": "SEQUENCE_TIMER",
      "titulo": "Secuencia R1→R2",
      "accion": "EJECUTAR_RECETA",
      "totalSegundos": 6,
      "pasos": [
        { "nombre": "Paso 1: R1", "canal": 1, "tiempo_ms": 3000 },
        { "nombre": "Paso 2: R2", "canal": 2, "tiempo_ms": 3000 }
      ],
      "color": "emerald",
      "w": 380,
      "h": 220
    },
    {
      "id": "w_sw_r5",
      "tipo": "SWITCH_TOGGLE",
      "titulo": "Luz R5",
      "canal": 5,
      "color": "amber",
      "w": 260,
      "h": 170
    }
  ]
}
`;
}

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
 * NORMALIZADOR INDUSTRIAL: Blinda los datos y elimina NaNs, claves en español o canales erróneos
 */
function normalizarRespuestaIA(parseado, userPrompt) {
  if (!parseado) return null;

  const resultado = { ...parseado };
  resultado.titulo = resultado.titulo_programa || resultado.titulo || 'Control SCADA';
  resultado.descripcion = resultado.descripcion || userPrompt;
  resultado.tipo = resultado.tipo || 'UNIVERSAL_PLC';
  resultado.mensajeChat = resultado.mensaje_chat || resultado.mensajeChat || 'He configurado los controles en el lienzo.';

  // 1. Normalizar los Widgets del Dashboard
  const rawWidgets = resultado.dashboard || resultado.dashboardWidgets || [];
  let curX = 20;
  let curY = 20;

  resultado.dashboardWidgets = rawWidgets.map((w, idx) => {
    // Normalizar título
    const titulo = w.titulo || w.label || w.nombre || `Control ${idx + 1}`;

    // Normalizar Canal de Relé (convierte "R5", "rele 5", etc. en el entero 5)
    let canal = w.canal;
    if (!canal) {
      const canalStr = String(w['relé'] || w.rele || w.relay || w.id || '');
      const match = canalStr.match(/(\d+)/);
      canal = match ? parseInt(match[1], 10) : 1;
    }
    canal = Number(canal);

    // Dimensiones mínimas para que nunca se aplasten
    const anchoMin = w.tipo === 'SEQUENCE_TIMER' || w.tipo === 'CHART_HISTORY' ? 380 : 260;
    const altoMin = w.tipo === 'SEQUENCE_TIMER' ? 220 : 170;
    const width = Math.max(anchoMin, w.w || anchoMin);
    const height = Math.max(altoMin, w.h || altoMin);

    // Normalizar los Pasos del Temporizador (elimina el 'NaNs')
    let pasosNormalizados = [];
    let totalSegundos = w.totalSegundos || 0;

    if (w.pasos && Array.isArray(w.pasos)) {
      pasosNormalizados = w.pasos.map((p, pIdx) => {
        // Soporta tanto tiempo_ms como tiempoMs o segundos
        let ms = p.tiempo_ms || p.tiempoMs || (p.tiempo ? p.tiempo * 1000 : 0);
        if (!ms && p.segundos) ms = p.segundos * 1000;
        if (!ms) ms = 3000; // 3s por defecto

        // Detectar canal del paso
        let pCanal = p.canal;
        if (!pCanal) {
          const enc = (p.encender && p.encender[0]) || (p.acciones_encender && p.acciones_encender[0]) || '';
          const m = String(enc).match(/(\d+)/);
          pCanal = m ? parseInt(m[1], 10) : (pIdx + 1);
        }

        return {
          nombre: p.nombre || `Paso ${pIdx + 1}`,
          canal: Number(pCanal),
          tiempoMs: Number(ms),
          tiempo_ms: Number(ms),
          acciones_encender: p.acciones_encender || p.encender || [`R${pCanal}`],
          acciones_apagar: p.acciones_apagar || p.apagar || []
        };
      });

      if (!totalSegundos) {
        totalSegundos = pasosNormalizados.reduce((acc, p) => acc + Math.round(p.tiempoMs / 1000), 0);
      }
    }

    const posX = w.x !== undefined && w.x > 0 ? w.x : curX;
    const posY = w.y !== undefined && w.y > 0 ? w.y : curY;

    curX += width + 20;
    if (curX > 860) { curX = 20; curY += 210; }

    return {
      ...w,
      id: w.id || `w_${Date.now()}_${idx}`,
      tipo: w.tipo || 'SWITCH_TOGGLE',
      titulo,
      canal,
      color: w.color || (canal === 5 ? 'amber' : 'cyan'),
      w: width,
      h: height,
      x: posX,
      y: posY,
      totalSegundos,
      pasos: pasosNormalizados
    };
  });

  // 2. Normalizar la Receta para el ESP32 (evita que viaje vacía)
  let receta = resultado.receta || {};
  if (!receta.pasos || receta.pasos.length === 0) {
    // Si la receta vino vacía pero hay un widget SEQUENCE_TIMER, heredar los pasos del widget
    const timerWidget = resultado.dashboardWidgets.find(w => w.tipo === 'SEQUENCE_TIMER' && w.pasos.length > 0);
    if (timerWidget) {
      receta = {
        nombre_receta: timerWidget.titulo,
        enclavamientos: receta.enclavamientos || [],
        total_pasos: timerWidget.pasos.length,
        pasos: timerWidget.pasos.map(p => ({
          nombre: p.nombre,
          tipo_transicion: 'TEMPORIZADO',
          tiempo_ms: p.tiempoMs,
          acciones_encender: p.acciones_encender,
          acciones_apagar: p.acciones_apagar
        }))
      };
    }
  }
  resultado.receta = receta;

  // 3. Normalizar HalPayload para registrar todos los relés utilizados
  const hal = resultado.hal_payload || resultado.halPayload || {};
  const rolesReles = hal.roles_reles || {};
  const nombresReles = hal.nombres_reles || {};

  resultado.dashboardWidgets.forEach(w => {
    if (w.canal && w.canal >= 1 && w.canal <= 8) {
      const rKey = `R${w.canal}`;
      if (!rolesReles[rKey]) rolesReles[rKey] = w.tipo;
      if (!nombresReles[rKey]) nombresReles[rKey] = w.titulo;
    }
  });

  resultado.halPayload = {
    roles_reles: rolesReles,
    nombres_reles: nombresReles
  };

  return resultado;
}

/**
 * FUNCIÓN PRINCIPAL EXPORTADA
 */
export async function conversarYCompilarConIA({ 
  prompt, 
  historial = [], 
  hardwareInfo = {}, 
  widgetsActuales = [], 
  recetaActual = null, 
  telemetriaActual = {}, 
  apiKey = null 
}) {
  const p = prompt ? prompt.trim() : '';
  if (!p) throw new Error('Por favor introduce tu requerimiento.');

  const key = apiKey || localStorage.getItem('biofleet_ai_key') || GROQ_DEFAULT_API_KEY;

  try {
    const modelIdActivo = await resolverModeloGroqActivo(key);
    const systemPromptConContexto = construirPromptConContexto(hardwareInfo, widgetsActuales, recetaActual, telemetriaActual);

    const messages = [
      { role: 'system', content: systemPromptConContexto },
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

    if (response.ok) {
      const data = await response.json();
      const rawText = data?.choices?.[0]?.message?.content;
      const parseado = sanitizarJson(rawText);

      if (parseado) {
        // Blindar mediante el Normalizador Industrial
        const normalizado = normalizarRespuestaIA(parseado, p);
        return {
          exito: true,
          ...normalizado
        };
      }
    }
  } catch (err) {
    console.warn('[GROQ API] Error consultando IA:', err.message);
  }

  // Fallback simple seguro
  return {
    exito: true,
    mensajeChat: `He recibido tu instrucción: "${p}".`,
    titulo: 'Control SCADA',
    tipo: 'UNIVERSAL_PLC',
    receta: null,
    halPayload: {},
    dashboardWidgets: widgetsActuales
  };
}
