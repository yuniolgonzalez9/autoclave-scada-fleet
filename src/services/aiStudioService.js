/**
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * SERVICIO COMPILADOR DE IA INDUSTRIAL - POOL DINÁMICO DE CLAVES EN SUPABASE
 * CERO API KEYS EN CÓDIGO/GITHUB • ROTACIÓN AUTOMÁTICA • AUTO-DESCUBRIMIENTO DE MODELOS
 * =========================================================================================
 */

import { supabase } from './supabase';

const SYSTEM_PROMPT_INGENIERO_SCADA = `
Eres el Ingeniero Consultor Principal de Automatización y SCADA de BioFleet OS v2.0 Enterprise.
Tienes CONOCIMIENTO ABSOLUTO y control sobre el gemelo digital ("config_deseada"), el hardware HKL-EA8 (ESP32) y la pantalla SCADA.

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
   - En "dashboard", incluye el widget 'SEQUENCE_TIMER' con "totalSegundos" y los "pasos".
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

export function detectarProveedorApiKey(key = '') {
  const k = key.trim();
  if (k.startsWith('gsk_')) return 'GROQ';
  if (k.startsWith('sk-or-')) return 'OPENROUTER';
  if (k.startsWith('sk-')) return 'OPENAI';
  if (k.startsWith('AIza') || k.startsWith('AQ.')) return 'GEMINI';
  return 'GROQ';
}

/**
 * Consulta a Supabase para obtener las claves de IA activas ordenadas por prioridad
 */
async function obtenerPoolDeClavesSupabase() {
  try {
    const { data, error } = await supabase
      .from('config_ai_keys')
      .select('*')
      .eq('activo', true)
      .order('prioridad', { ascending: true });

    if (!error && data && data.length > 0) {
      return data;
    }
  } catch (e) {
    console.warn('[AI POOL] No se pudo consultar la tabla config_ai_keys:', e);
  }

  // Si el usuario guardó una clave temporalmente en el navegador (localStorage)
  const localKey = localStorage.getItem('biofleet_ai_key');
  if (localKey && localKey.trim()) {
    return [{
      id: 'local_override',
      proveedor: detectarProveedorApiKey(localKey),
      api_key: localKey.trim(),
      prioridad: 1
    }];
  }

  return [];
}

/**
 * Descubre dinámicamente qué modelo de chat está activo para una clave específica
 */
async function descubrirModeloActivo(proveedor, apiKey) {
  if (proveedor === 'GROQ') {
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

  if (proveedor === 'OPENAI') return 'gpt-4o-mini';
  if (proveedor === 'OPENROUTER') return 'deepseek/deepseek-r1';
  return 'gemini-2.0-flash';
}

/**
 * Ejecuta la consulta HTTP hacia el proveedor correspondiente
 */
async function invocarProveedorCloud(proveedor, apiKey, modelId, messages) {
  let endpoint = 'https://api.groq.com/openai/v1/chat/completions';

  if (proveedor === 'OPENAI') {
    endpoint = 'https://api.openai.com/v1/chat/completions';
  } else if (proveedor === 'OPENROUTER') {
    endpoint = 'https://openrouter.ai/api/v1/chat/completions';
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`[${proveedor} HTTP ${response.status}]: ${errText}`);
  }

  const data = await response.json();
  const rawText = data?.choices?.[0]?.message?.content;
  return sanitizarJson(rawText);
}

/**
 * Normalizador seguro para asegurar que nunca existan errores de estructura
 */
function normalizarSalidaIA(parseado, userPrompt, hardwareInfo, widgetsActuales, recetaActual) {
  let curX = 20;
  let curY = 20;

  const dashboardWidgets = (parseado.dashboard || widgetsActuales).map((w, idx) => {
    const width = Math.max(260, w.w || (w.tipo === 'SEQUENCE_TIMER' ? 380 : 260));
    const height = Math.max(170, w.h || (w.tipo === 'SEQUENCE_TIMER' ? 220 : 170));
    const posX = w.x !== undefined ? w.x : curX;
    const posY = w.y !== undefined ? w.y : curY;

    curX += width + 20;
    if (curX > 860) { curX = 20; curY += 210; }

    // Normalizar pasos si es un temporizador
    let pasosNorm = w.pasos || [];
    if (Array.isArray(pasosNorm)) {
      pasosNorm = pasosNorm.map((p, pIdx) => ({
        nombre: p.nombre || `Fase ${pIdx + 1}`,
        canal: Number(p.canal || 1),
        tiempoMs: Number(p.tiempoMs || p.tiempo_ms || 3000),
        tiempo_ms: Number(p.tiempo_ms || p.tiempoMs || 3000),
        acciones_encender: p.acciones_encender || [`R${p.canal || 1}`],
        acciones_apagar: p.acciones_apagar || []
      }));
    }

    return {
      ...w,
      id: w.id || `w_${Date.now()}_${idx}`,
      x: posX,
      y: posY,
      w: width,
      h: height,
      canal: w.canal ? Number(w.canal) : (w['relé'] ? parseInt(String(w['relé']).replace(/\D/g, ''), 10) : 1),
      totalSegundos: w.totalSegundos || (pasosNorm.length > 0 ? Math.round(pasosNorm.reduce((a, b) => a + (b.tiempoMs || 0), 0) / 1000) : 5),
      pasos: pasosNorm
    };
  });

  return {
    exito: true,
    mensajeChat: parseado.mensaje_chat || 'He actualizado la configuración.',
    titulo: parseado.titulo_programa || 'Control SCADA',
    tipo: parseado.tipo || hardwareInfo.tipo || 'AUTOCLAVE',
    receta: parseado.receta || recetaActual,
    halPayload: parseado.hal_payload || hardwareInfo,
    dashboardWidgets
  };
}

/**
 * FUNCIÓN PRINCIPAL EXPORTADA CON ROTACIÓN AUTOMÁTICA DE CLAVES DESDE SUPABASE
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

  // 1. Obtener la lista de claves activas desde Supabase
  let poolClaves = [];
  if (apiKey) {
    poolClaves = [{ id: 'manual', proveedor: detectarProveedorApiKey(apiKey), api_key: apiKey.trim(), prioridad: 1 }];
  } else {
    poolClaves = await obtenerPoolDeClavesSupabase();
  }

  if (poolClaves.length === 0) {
    throw new Error('No hay API Keys activas en la base de datos Supabase (tabla config_ai_keys).');
  }

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

  let ultimoError = null;

  // 2. Iterar sobre las claves en orden de prioridad hasta que una funcione
  for (const itemClave of poolClaves) {
    try {
      const prov = itemClave.proveedor || detectarProveedorApiKey(itemClave.api_key);
      const modelo = await descubrirModeloActivo(prov, itemClave.api_key);

      console.log(`🔑 [AI POOL] Probando clave (${prov} - Prioridad ${itemClave.prioridad}) con modelo ${modelo}...`);

      const parseado = await invocarProveedorCloud(prov, itemClave.api_key, modelo, messages);

      if (parseado) {
        // Registrar éxito en Supabase de forma asíncrona
        if (itemClave.id && itemClave.id !== 'local_override' && itemClave.id !== 'manual') {
          supabase.from('config_ai_keys').update({
            ultimo_uso: new Date().toISOString(),
            fallos_consecutivos: 0,
            ultimo_error: null
          }).eq('id', itemClave.id).then(() => {});
        }

        console.log(`✅ [AI POOL] Clave exitosa (${prov}). Despachando arquitectura.`);
        return normalizarSalidaIA(parseado, p, hardwareInfo, widgetsActuales, recetaActual);
      }
    } catch (err) {
      ultimoError = err.message;
      console.warn(`⚠️ [AI POOL] Falló clave (Prioridad ${itemClave.prioridad}):`, err.message);

      // Registrar fallo en Supabase
      if (itemClave.id && itemClave.id !== 'local_override' && itemClave.id !== 'manual') {
        supabase.from('config_ai_keys').update({
          fallos_consecutivos: (itemClave.fallos_consecutivos || 0) + 1,
          ultimo_error: err.message
        }).eq('id', itemClave.id).then(() => {});
      }
    }
  }

  throw new Error(`Todas las claves del pool de Supabase fallaron. Último error: ${ultimoError}`);
}
