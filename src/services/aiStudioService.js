/**
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * SERVICIO COMPILADOR DE IA INDUSTRIAL - GENERADOR MINIMALISTA (CERO WIDGETS REDUNDANTES)
 * MODELO: GROQ CLOUD + RESOLUCIÓN DINÁMICA DE MODELOS ACTIVOS
 * =========================================================================================
 */

const GROQ_DEFAULT_API_KEY = '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';

const SYSTEM_PROMPT_INGENIERO_SCADA = `
Eres el Ingeniero Principal de Automatización y SCADA de BioFleet OS v2.0 Enterprise.
Hardware: Controlador industrial ESP32 HKL-EA8 (8 Relés R1..R8 en 0x24, 8 Entradas IN1..IN8 en 0x26, 4 ADC A0..A3 en 0x48, LCD 0x27).

REGLA DE ORO DE MINIMALISMO ABSOLUTO (CERO WIDGETS REDUNDANTES):
Genera ÚNICAMENTE los widgets que el usuario haya solicitado explícitamente:
1. Si el usuario pide una secuencia o temporización (ej: "secuencia R1 a R8", "enciende R1 2s luego R2 2s"):
   - Genera OBLIGATORIAMENTE UN SOLO WIDGET: el widget de secuencia 'SEQUENCE_TIMER' o 'ACTION_BUTTON'.
   - NUNCA agregues interruptores adicionales (SWITCH_TOGGLE) para cada relé de la secuencia. Son innecesarios y saturan el lienzo.
2. Si el usuario pide controlar un relé puntual (ej: "r5", "interruptor para r2"):
   - Genera únicamente el interruptor de ese relé.
3. Si el usuario pide un manómetro, termómetro o nivel:
   - Genera únicamente ese medidor.

ESTRUCTURA DE SECUENCIAS PARA EL CORE 1 DEL ESP32:
- "receta":
  * "total_pasos": Número de etapas.
  * "pasos": Array con { "nombre": "Fase", "tipo_transicion": "TEMPORIZADO", "tiempo_ms": N, "acciones_encender": ["R1"], "acciones_apagar": ["R1"] }.
- "dashboard":
  * [ { "id": "w_seq", "tipo": "SEQUENCE_TIMER", "titulo": "Nombre Secuencia", "accion": "EJECUTAR_RECETA", "totalSegundos": N, "pasos": [...], "w": 380, "h": 220 } ]

RESPONDE EXCLUSIVAMENTE CON UN OBJETO JSON VÁLIDO:
{
  "mensaje_chat": "Explicación técnica concisa para el operador",
  "titulo_programa": "Nombre del programa",
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
      "tipo": "SEQUENCE_TIMER",
      "titulo": "Secuencia",
      "accion": "EJECUTAR_RECETA",
      "totalSegundos": 10,
      "pasos": [],
      "color": "emerald",
      "w": 380,
      "h": 220
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
 * PARSER MULTI-ETAPA LOCAL LIMPIO (CERO WIDGETS REDUNDANTES)
 */
function compilarMultiEtapaLocal(promptTexto) {
  const p = promptTexto.toLowerCase().trim();

  // Buscar todos los patrones "R<numero> ... <tiempo> seg"
  const regexEtapa = /(?:r|rele|relé)\s*([1-8])[^\d]*?(\d+)\s*(?:segundo|segundos|seg|s)/gi;
  const etapas = [];
  let m;

  while ((m = regexEtapa.exec(p)) !== null) {
    etapas.push({
      canal: parseInt(m[1], 10),
      segundos: parseInt(m[2], 10)
    });
  }

  // Si detectó una secuencia con pasos
  if (etapas.length > 0) {
    const pasosReceta = [];
    const pasosWidget = [];
    let totalSegs = 0;
    const rolesReles = {};
    const nombresReles = {};

    etapas.forEach((etapa, idx) => {
      totalSegs += etapa.segundos;
      const rAnterior = idx > 0 ? `R${etapas[idx - 1].canal}` : null;
      
      pasosReceta.push({
        nombre: `Paso ${idx + 1}: R${etapa.canal} (${etapa.segundos}s)`,
        tipo_transicion: 'TEMPORIZADO',
        tiempo_ms: etapa.segundos * 1000,
        acciones_encender: [`R${etapa.canal}`],
        acciones_apagar: rAnterior ? [rAnterior] : []
      });

      pasosWidget.push({
        nombre: `R${etapa.canal} (${etapa.segundos}s)`,
        tiempoMs: etapa.segundos * 1000,
        canal: etapa.canal
      });

      rolesReles[`R${etapa.canal}`] = `SECUENCIA_${idx + 1}`;
      nombresReles[`R${etapa.canal}`] = `Relé R${etapa.canal}`;
    });

    const ultimoRelay = `R${etapas[etapas.length - 1].canal}`;
    pasosReceta.push({
      nombre: 'Fin de Secuencia',
      tipo_transicion: 'INMEDIATO',
      tiempo_ms: 0,
      acciones_encender: [],
      acciones_apagar: [ultimoRelay]
    });

    // ÚNICO WIDGET: El control maestro de la secuencia (Sin interruptores redundantes)
    const widgets = [
      {
        id: 'w_seq_timer',
        tipo: 'SEQUENCE_TIMER',
        titulo: `Secuencia (${totalSegs}s)`,
        accion: 'EJECUTAR_RECETA',
        totalSegundos: totalSegs,
        pasos: pasosWidget,
        color: 'emerald',
        w: 380,
        h: 220,
        x: 20,
        y: 20
      }
    ];

    return {
      exito: true,
      mensajeChat: `He generado la secuencia de ${etapas.length} etapas con un tiempo total de ${totalSegs} segundos. El control único está listo en el lienzo.`,
      titulo: `Secuencia (${totalSegs}s)`,
      tipo: 'UNIVERSAL_PLC',
      receta: {
        nombre_receta: `Secuencia ${totalSegs}s`,
        enclavamientos: [],
        total_pasos: pasosReceta.length,
        pasos: pasosReceta
      },
      halPayload: { roles_reles: rolesReles, nombres_reles: nombresReles },
      dashboardWidgets: widgets
    };
  }

  // Caso: Secuencia R1 a R8 completa (16 pasos en cascada)
  if (p.includes('r1') && p.includes('r8') && (p.includes('secuencia') || p.includes('cascada') || p.includes('test'))) {
    const pasos = [];
    for (let i = 1; i <= 8; i++) pasos.push({ canal: i, val: 1, delay_ms: 600 });
    for (let i = 1; i <= 8; i++) pasos.push({ canal: i, val: 0, delay_ms: 600 });

    const pasosWidget = [
      { nombre: 'Encendido R1-R8', tiempoMs: 4800, canal: 1 },
      { nombre: 'Apagado R1-R8', tiempoMs: 4800, canal: 1 }
    ];

    const widgets = [
      {
        id: 'w_seq_timer',
        tipo: 'SEQUENCE_TIMER',
        titulo: 'Secuencia Cascada R1-R8',
        accion: 'EJECUTAR_RECETA',
        totalSegundos: 10,
        pasos: pasosWidget,
        color: 'emerald',
        w: 380,
        h: 220,
        x: 20,
        y: 20
      }
    ];

    return {
      exito: true,
      mensajeChat: 'He generado el control único de la secuencia en cascada para R1 a R8 (sin interruptores adicionales).',
      titulo: 'Secuencia Cascada R1-R8',
      tipo: 'UNIVERSAL_PLC',
      receta: {
        nombre_receta: 'Cascada R1-R8',
        enclavamientos: [],
        total_pasos: 16,
        pasos: pasos.map((pso, idx) => ({
          nombre: `Paso ${idx + 1}`,
          tipo_transicion: 'TEMPORIZADO',
          tiempo_ms: pso.delay_ms,
          acciones_encender: pso.val === 1 ? [`R${pso.canal}`] : [],
          acciones_apagar: pso.val === 0 ? [`R${pso.canal}`] : []
        }))
      },
      halPayload: {},
      dashboardWidgets: widgets
    };
  }

  return null;
}

/**
 * FUNCIÓN PRINCIPAL EXPORTADA
 */
export async function conversarYCompilarConIA({ prompt, historial = [], hardwareInfo = {}, apiKey = null }) {
  const p = prompt ? prompt.trim() : '';
  if (!p) throw new Error('Por favor introduce tu requerimiento.');

  const key = apiKey || localStorage.getItem('biofleet_ai_key') || GROQ_DEFAULT_API_KEY;

  // 1. Consultar a Groq con directiva estricta de minimalismo
  try {
    const modelIdActivo = await resolverModeloGroqActivo(key);

    const messages = [
      { role: 'system', content: `${SYSTEM_PROMPT_INGENIERO_SCADA}\nHARDWARE DISPONIBLE: ${JSON.stringify(hardwareInfo)}` },
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

      if (parseado && parseado.dashboard && parseado.dashboard.length > 0) {
        let curX = 20;
        let curY = 20;
        const dashboardWidgets = parseado.dashboard.map((w, idx) => {
          const width = w.w || (w.tipo === 'SEQUENCE_TIMER' ? 380 : 260);
          const height = w.h || (w.tipo === 'SEQUENCE_TIMER' ? 220 : 170);
          const wPos = { ...w, id: w.id || `w_${Date.now()}_${idx}`, x: curX, y: curY, w: width, h: height };
          curX += width + 20;
          if (curX > 860) { curX = 20; curY += 210; }
          return wPos;
        });

        return {
          exito: true,
          mensajeChat: parseado.mensaje_chat || 'He diseñado los controles solicitados.',
          titulo: parseado.titulo_programa || 'Control Industrial',
          descripcion: parseado.descripcion || p,
          tipo: parseado.tipo || 'UNIVERSAL_PLC',
          receta: parseado.receta || null,
          halPayload: parseado.hal_payload || {},
          dashboardWidgets
        };
      }
    }
  } catch (err) {
    console.warn('[GROQ API] Error en llamada cloud, activando parser local limpio:', err.message);
  }

  // 2. Respaldo local limpio (Genera únicamente lo pedido)
  const local = compilarMultiEtapaLocal(p);
  if (local) {
    return local;
  }

  // Fallback simple para relé puntual
  const matchR = p.match(/\b(?:r|rele|relé)\s*([1-8])\b/) || p.match(/^r([1-8])$/);
  const canal = matchR ? parseInt(matchR[1], 10) : 1;

  return {
    exito: true,
    mensajeChat: `He colocado el interruptor único para R${canal}.`,
    titulo: `Control R${canal}`,
    tipo: 'UNIVERSAL_PLC',
    halPayload: {},
    dashboardWidgets: [
      { id: `w_sw_r${canal}`, tipo: 'SWITCH_TOGGLE', titulo: `Interruptor R${canal}`, canal, color: 'cyan', w: 260, h: 170, x: 20, y: 20 }
    ]
  };
}
