/**
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * SERVICIO DE IA NEURONAL PURA (GROQ CLOUD API - CERO SCRIPTS PREGRABADOS)
 * =========================================================================================
 */

const GROQ_DEFAULT_API_KEY = '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';

const SYSTEM_PROMPT_INGENIERO_SCADA = `
Eres el Ingeniero Consultor Principal de Automatización y SCADA de BioFleet OS v2.0 Enterprise.
Tienes CONOCIMIENTO TOTAL sobre el gemelo digital ("config_deseada"), el hardware HKL-EA8 (ESP32) y la pantalla SCADA.

HARDWARE Y PROTOCOLO:
- Controlador HKL-EA8 (8 Relés R1..R8 en 0x24, 8 Entradas IN1..IN8 en 0x26, 4 ADC A0..A3 en 0x48, LCD 0x27).
- Sensor de Corriente (CT): Conectado al conector Jack de 3.5 mm en el canal ADC A2 (SCT-013 30A/1V).
- 6 Programas Clínicos: P1 (Instrumental 134°C), P2 (Textil 134°C), P3 (Gomas 121°C), P4 (Líquidos 121°C), P5 (Contenedor 134°C), P6 (Test Rápido).
- Entradas de Seguridad: Puerta física en IN0, Sello en IN1, Recámara en IN2, Caldera en IN3.

DIRECTIVAS ESTRICTAS DE RESPUESTA:
1. SI EL USUARIO PIDE AUDITORÍA O HACE PREGUNTAS SOBRE EL EQUIPO:
   - Lee el CONTEXTO COMPLETO DEL EQUIPO que se te proporciona y responde en "mensaje_chat" con los datos reales: periféricos activos, estado del Jack CT de 3.5mm, programas clínicos configurados y los pines exactos donde están los sensores.
2. SI EL USUARIO PIDE CREAR, MODIFICAR O ELIMINAR CONTROLES:
   - Realiza la acción sobre la matriz "dashboard" con los tipos de widgets correspondientes: 'SEQUENCE_TIMER', 'ACTION_BUTTON', 'SWITCH_TOGGLE', 'GAUGE_RADIAL', 'VALUE_CARD', 'LEVEL_TANK', 'EMERGENCY_STOP'.
3. SI EL USUARIO PIDE SECUENCIAS O PROCESOS:
   - Genera la matriz "receta" con los pasos temporizados y las máscaras de relés para el Core 1 del ESP32.
4. FORMATO: Devuelve ÚNICAMENTE un objeto JSON válido con la siguiente estructura (sin texto antes ni después):
{
  "mensaje_chat": "Tu respuesta técnica detallada para el operador",
  "titulo_programa": "Nombre del perfil o sistema",
  "tipo": "AUTOCLAVE" | "UNIVERSAL_PLC" | "VEHICULO",
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
  "dashboard": []
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
 * Consulta a Groq y extrae el modelo activo real disponible para la clave
 */
async function resolverModeloGroqActivo(apiKey) {
  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error en API Groq (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const modelos = (data.data || []).map(m => m.id);

  // Filtrar modelos aptos para chat y razonamiento
  const candidatos = modelos.filter(id => 
    !id.includes('whisper') && 
    !id.includes('guard') && 
    !id.includes('orpheus')
  );

  if (candidatos.length === 0) {
    throw new Error('No se encontraron modelos de chat activos en la cuenta de Groq.');
  }

  // Priorizar modelos estándar
  const preferido = candidatos.find(id => id.includes('gpt-oss-120b')) ||
                    candidatos.find(id => id.includes('gpt-oss-20b')) ||
                    candidatos.find(id => id.includes('qwen')) ||
                    candidatos[0];

  return preferido;
}

export function detectarProveedorApiKey(key = '') {
  const k = key.trim();
  if (k.startsWith('gsk_')) return 'GROQ';
  if (k.startsWith('sk-')) return 'OPENAI';
  if (k.startsWith('AIza') || k.startsWith('AQ.')) return 'GEMINI';
  return 'GROQ';
}

/**
 * FUNCIÓN PRINCIPAL EXPORTADA: 100% IA NEURONAL REAL
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
  if (!p) throw new Error('Por favor introduce tu instrucción.');

  const key = apiKey || localStorage.getItem('biofleet_ai_key') || GROQ_DEFAULT_API_KEY;

  // 1. Obtener el modelo activo real desde la API de Groq
  const modelIdActivo = await resolverModeloGroqActivo(key);
  console.log(`🧠 [GROQ REAL AI] Procesando con modelo: ${modelIdActivo}`);

  // 2. Empaquetar el contexto completo del hardware y del SCADA
  const contextPayload = {
    config_deseada: hardwareInfo,
    widgets_actuales: widgetsActuales,
    receta_actual: recetaActual,
    telemetria: telemetriaActual
  };

  const messages = [
    { role: 'system', content: `${SYSTEM_PROMPT_INGENIERO_SCADA}\n\nCONTEXTO COMPLETO DEL EQUIPO:\n${JSON.stringify(contextPayload)}` },
    ...historial.map(h => ({
      role: h.sender === 'user' ? 'user' : 'assistant',
      content: typeof h.contenido === 'string' ? h.contenido : JSON.stringify(h.contenido)
    })),
    { role: 'user', content: p }
  ];

  // 3. Enviar la consulta a la red neuronal de Groq
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      model: modelIdActivo,
      messages,
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const errDetail = await response.text();
    throw new Error(`[Groq Error HTTP ${response.status}]: ${errDetail}`);
  }

  const data = await response.json();
  const rawText = data?.choices?.[0]?.message?.content;
  const parseado = sanitizarJson(rawText);

  if (!parseado) {
    throw new Error(`La IA respondió pero no entregó un JSON válido. Respuesta cruda: ${rawText?.substring(0, 100)}...`);
  }

  // 4. Normalizar coordenadas de los widgets devueltos por la IA
  let curX = 20;
  let curY = 20;
  const dashboardWidgets = (parseado.dashboard || widgetsActuales).map((w, idx) => {
    const width = Math.max(260, w.w || (w.tipo === 'SEQUENCE_TIMER' ? 380 : 260));
    const height = Math.max(170, w.h || (w.tipo === 'SEQUENCE_TIMER' ? 220 : 170));
    const posX = w.x !== undefined ? w.x : curX;
    const posY = w.y !== undefined ? w.y : curY;

    curX += width + 20;
    if (curX > 860) { curX = 20; curY += 210; }

    return {
      ...w,
      id: w.id || `w_${Date.now()}_${idx}`,
      x: posX,
      y: posY,
      w: width,
      h: height,
      canal: w.canal ? Number(w.canal) : (w['relé'] ? parseInt(String(w['relé']).replace(/\D/g, ''), 10) : 1)
    };
  });

  return {
    exito: true,
    mensajeChat: parseado.mensaje_chat || 'He procesado tu requerimiento.',
    titulo: parseado.titulo_programa || 'Control SCADA',
    tipo: parseado.tipo || hardwareInfo.tipo || 'AUTOCLAVE',
    receta: parseado.receta || recetaActual,
    halPayload: parseado.hal_payload || hardwareInfo,
    dashboardWidgets
  };
}
