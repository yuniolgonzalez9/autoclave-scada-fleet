/**
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * SERVICIO COMPILADOR DE IA INDUSTRIAL - SECUENCIAS MULTI-RELÉ Y MULTI-ETAPA
 * =========================================================================================
 */

const GROQ_DEFAULT_API_KEY = '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';

const SYSTEM_PROMPT_INGENIERO_SCADA = `
Eres el Ingeniero Principal de Automatización y SCADA de BioFleet OS v2.0 Enterprise.
Hardware: Controlador industrial ESP32 HKL-EA8 (8 Relés R1..R8 en 0x24, 8 Entradas IN1..IN8 en 0x26, 4 ADC A0..A3 en 0x48, LCD 0x27).

REGLA CRÍTICA PARA SECUENCIAS DE MÚLTIPLES RELÉS CON TIEMPOS:
Cuando el usuario pida una secuencia con varios relés y tiempos (ej: "encienda R1 por 2s, luego R2 por 2s y luego R3 por 2s"):
1. En "receta":
   - "total_pasos": Número exacto de etapas.
   - "pasos": Array ordenado donde CADA etapa tiene su tiempo_ms (ej: 2s = 2000) y las máscaras exactas de encendido y apagado:
     * Paso 1: { "nombre": "Fase 1: R1", "tipo_transicion": "TEMPORIZADO", "tiempo_ms": 2000, "acciones_encender": ["R1"], "acciones_apagar": [] }
     * Paso 2: { "nombre": "Fase 2: R2", "tipo_transicion": "TEMPORIZADO", "tiempo_ms": 2000, "acciones_encender": ["R2"], "acciones_apagar": ["R1"] }
     * Paso 3: { "nombre": "Fase 3: R3", "tipo_transicion": "TEMPORIZADO", "tiempo_ms": 2000, "acciones_encender": ["R3"], "acciones_apagar": ["R2"] }
     * Paso 4: { "nombre": "Fin: Apagar Todo", "tipo_transicion": "INMEDIATO", "tiempo_ms": 0, "acciones_encender": [], "acciones_apagar": ["R3"] }
2. En "dashboard":
   - Genera un widget 'SEQUENCE_TIMER' con:
     * "titulo": "Secuencia R1 ➔ R2 ➔ R3"
     * "totalSegundos": Suma de todos los tiempos (ej: 2 + 2 + 2 = 6s)
     * "pasos": [
         { "nombre": "R1 ON", "tiempoMs": 2000, "canal": 1 },
         { "nombre": "R2 ON", "tiempoMs": 2000, "canal": 2 },
         { "nombre": "R3 ON", "tiempoMs": 2000, "canal": 3 }
       ]
   - Genera los widgets 'SWITCH_TOGGLE' individuales para CADA uno de los relés que intervienen (R1, R2 y R3) para que el operador supervise su conmutación física.

3. En "mensaje_chat":
   Explica claramente que la secuencia ejecutará los 3 relés en orden (R1 por 2s, R2 por 2s, R3 por 2s) sumando un total de 6 segundos.

RESPONDE EXCLUSIVAMENTE CON UN OBJETO JSON VÁLIDO:
{
  "mensaje_chat": "Explicación técnica de la secuencia de 3 etapas",
  "titulo_programa": "Secuencia R1-R2-R3 (6s)",
  "tipo": "UNIVERSAL_PLC",
  "receta": {
    "nombre_receta": "Secuencia R1-R2-R3",
    "enclavamientos": [],
    "total_pasos": 4,
    "pasos": []
  },
  "hal_payload": {
    "roles_reles": { "R1": "SECUENCIA_1", "R2": "SECUENCIA_2", "R3": "SECUENCIA_3" },
    "nombres_reles": { "R1": "Relé R1", "R2": "Relé R2", "R3": "Relé R3" }
  },
  "dashboard": [
    {
      "id": "w_seq_timer",
      "tipo": "SEQUENCE_TIMER",
      "titulo": "Secuencia R1 ➔ R2 ➔ R3",
      "accion": "EJECUTAR_RECETA",
      "totalSegundos": 6,
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
 * PARSER MULTI-ETAPA DE RESPALDO (Por si falla la conexión externa)
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

  if (etapas.length > 0) {
    const pasosReceta = [];
    const pasosWidget = [];
    let totalSegs = 0;
    const widgets = [];
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

    // Paso final para apagar el último relé
    const ultimoRelay = `R${etapas[etapas.length - 1].canal}`;
    pasosReceta.push({
      nombre: 'Fin de Secuencia',
      tipo_transicion: 'INMEDIATO',
      tiempo_ms: 0,
      acciones_encender: [],
      acciones_apagar: [ultimoRelay]
    });

    // Widget de Temporizador Secuencial
    widgets.push({
      id: 'w_seq_timer',
      tipo: 'SEQUENCE_TIMER',
      titulo: `Secuencia Multi-Relé (${totalSegs}s)`,
      accion: 'EJECUTAR_RECETA',
      totalSegundos: totalSegs,
      pasos: pasosWidget,
      color: 'emerald',
      w: 380,
      h: 220
    });

    // Interruptores de supervisión para CADA relé involucrado
    etapas.forEach((etapa) => {
      widgets.push({
        id: `w_sw_r${etapa.canal}`,
        tipo: 'SWITCH_TOGGLE',
        titulo: `Supervisión R${etapa.canal}`,
        canal: etapa.canal,
        color: 'cyan',
        w: 260,
        h: 170
      });
    });

    return {
      exito: true,
      mensajeChat: `He configurado la secuencia exacta de ${etapas.length} etapas: se activará cada relé en orden por sus respectivos segundos (duración total: ${totalSegs}s). Puedes supervisar cada canal con los interruptores creados en el lienzo.`,
      titulo: `Secuencia Multi-Relé (${totalSegs}s)`,
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

  return null;
}

/**
 * FUNCIÓN PRINCIPAL EXPORTADA
 */
export async function conversarYCompilarConIA({ prompt, historial = [], hardwareInfo = {}, apiKey = null }) {
  const p = prompt ? prompt.trim() : '';
  if (!p) throw new Error('Por favor introduce tu requerimiento.');

  const key = apiKey || localStorage.getItem('biofleet_ai_key') || GROQ_DEFAULT_API_KEY;

  // 1. CONSULTAR SIEMPRE PRIMERO A GROQ LLM (Sin interceptar prematuramente)
  try {
    const modelIdActivo = await resolverModeloGroqActivo(key);
    console.log(`🧠 [GROQ INFERENCE] Razonando secuencia con modelo: ${modelIdActivo}`);

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
          mensajeChat: parseado.mensaje_chat || 'He diseñado la secuencia solicitada.',
          titulo: parseado.titulo_programa || 'Secuencia Programada',
          descripcion: parseado.descripcion || p,
          tipo: parseado.tipo || 'UNIVERSAL_PLC',
          receta: parseado.receta || null,
          halPayload: parseado.hal_payload || {},
          dashboardWidgets
        };
      }
    }
  } catch (err) {
    console.warn('[GROQ API] Error en llamada cloud, activando parser multi-etapa local:', err.message);
  }

  // 2. Si la nube falla, el parser multi-etapa local extrae todos los relés y tiempos
  const local = compilarMultiEtapaLocal(p);
  if (local) {
    let curX = 20;
    let curY = 20;
    const conCoords = local.dashboardWidgets.map((w) => {
      const wPos = { ...w, x: curX, y: curY };
      curX += (w.w || 260) + 20;
      if (curX > 860) { curX = 20; curY += 210; }
      return wPos;
    });
    return { ...local, dashboardWidgets: conCoords };
  }

  // Fallback simple
  return {
    exito: true,
    mensajeChat: `He configurado los controles en el lienzo basados en tu instrucción: "${p}".`,
    titulo: p.length > 30 ? p.substring(0, 27) + '...' : p,
    tipo: 'UNIVERSAL_PLC',
    halPayload: {},
    dashboardWidgets: [
      { id: `w_${Date.now()}`, tipo: 'SWITCH_TOGGLE', titulo: p, canal: 1, color: 'cyan', w: 260, h: 170, x: 20, y: 20 }
    ]
  };
}
