/**
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * SERVICIO COMPILADOR DE IA - CONTROL TOTAL DE PLATAFORMA & ACCIONES EJECUTIVAS
 * =========================================================================================
 */

import { supabase } from './supabase';

const SYSTEM_PROMPT_AUTORIDAD_TOTAL = `
Eres el Ingeniero Director de Automatización, SCADA y Sistemas Físicos de BioFleet OS v2.0 Enterprise.
Tienes AUTORIDAD Y CONTROL TOTAL sobre toda la plataforma: dispositivos físicos (ESP32 HKL-EA8), parámetros de base de datos (config_deseada), secuencias del Core 1, actuadores I2C, sensores y el lienzo visual SCADA.

PUEDES OPERAR, MODIFICAR O RECONFIGURAR CUALQUIER COSA:
1. HARDWARE Y PERIFÉRICOS (HKL-EA8):
   - Relés R1 a R8 en I2C 0x24 (Actuadores de potencia).
   - Entradas IN1 a IN8 en 0x26 (Sensores y enclavamientos).
   - Canales ADC A0 a A3 en 0x48 (ADS1115 con Jack CT 3.5mm para medición de corriente y sensores analógicos).
   - Pantalla LCD 0x27 (Mensajes locales en tiempo real).
2. RECONFIGURACIÓN DE PARÁMETROS ("config_deseada"):
   - Puedes modificar tiempos de esterilización, secado, pulsos de vacío, límites de mantenimiento, calibraciones del sensor CT y nombres de funciones.
3. ACCIONES EJECUTIVAS SOBRE LA PLACA FÍSICA:
   - Si el usuario te pide una acción operativa directa (ej: "inicia el ciclo P1", "haz un paro de emergencia", "despliega esta configuración a la placa", "activa el relé 3"), genera en "accion_propuesta" el comando exacto.
   - Si la acción implica movimiento físico, encendido de calor o cambios de memoria, marca "requiere_confirmacion": true y describe en "mensaje_confirmacion" qué sucederá físicamente para que el usuario confirme.
4. CONTROL DEL LIENZO SCADA:
   - Puedes agregar, quitar o remodelar cualquier widget ('SEQUENCE_TIMER', 'ACTION_BUTTON', 'SWITCH_TOGGLE', 'MOMENTARY_BUTTON', 'EMERGENCY_STOP', 'ROTARY_SELECTOR', 'GAUGE_RADIAL', 'VALUE_CARD', 'LEVEL_TANK', 'STATUS_LED').

ESTRUCTURA DE RESPUESTA OBLIGATORIA (JSON PURO):
{
  "mensaje_chat": "Explicación clara de lo que comprendiste y la acción que estás ejecutando o proponiendo",
  "titulo_programa": "Nombre del perfil o sistema",
  "tipo": "AUTOCLAVE" | "UNIVERSAL_PLC" | "VEHICULO",
  "accion_propuesta": {
    "tipo": "NINGUNA" | "DESPLEGAR_HARDWARE" | "INICIAR_CICLO" | "PARO_EMERGENCIA" | "CONMUTAR_RELE",
    "requiere_confirmacion": true | false,
    "mensaje_confirmacion": "¿Confirmas encender las resistencias y arrancar el ciclo en la placa física?",
    "payload": {}
  },
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

async function resolverModeloGroqActivo(apiKey) {
  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[Groq API HTTP ${res.status}]: ${errText}`);
  }

  const data = await res.json();
  const modelos = (data.data || []).map(m => m.id);

  const candidatos = modelos.filter(id => 
    !id.includes('whisper') && 
    !id.includes('guard') && 
    !id.includes('orpheus')
  );

  if (candidatos.length === 0) {
    throw new Error('No se encontraron modelos de chat activos en Groq.');
  }

  const preferido = candidatos.find(id => id.includes('gpt-oss-120b')) ||
                    candidatos.find(id => id.includes('gpt-oss-20b')) ||
                    candidatos.find(id => id.includes('qwen')) ||
                    candidatos[0];

  return preferido;
}

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
    console.warn('[AI POOL] Error consultando config_ai_keys:', e);
  }

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
 * FUNCIÓN PRINCIPAL EXPORTADA CON CONTROL TOTAL
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
  if (!p) throw new Error('Por favor introduce tu requerimiento u orden.');

  let poolClaves = [];
  if (apiKey) {
    poolClaves = [{ id: 'manual', proveedor: detectarProveedorApiKey(apiKey), api_key: apiKey.trim(), prioridad: 1 }];
  } else {
    poolClaves = await obtenerPoolDeClavesSupabase();
  }

  if (poolClaves.length === 0) {
    throw new Error('No hay API Keys activas en Supabase (tabla config_ai_keys).');
  }

  const contextPayload = {
    config_deseada: hardwareInfo,
    widgets_actuales: widgetsActuales,
    receta_actual: recetaActual,
    telemetria_viva: telemetriaActual
  };

  const messages = [
    { role: 'system', content: `${SYSTEM_PROMPT_AUTORIDAD_TOTAL}\n\nCONTEXTO COMPLETO EN VIVO:\n${JSON.stringify(contextPayload)}` },
    ...historial.map(h => ({
      role: h.sender === 'user' ? 'user' : 'assistant',
      content: typeof h.contenido === 'string' ? h.contenido : JSON.stringify(h.contenido)
    })),
    { role: 'user', content: p }
  ];

  let ultimoError = null;

  for (const itemClave of poolClaves) {
    try {
      const modelo = await resolverModeloGroqActivo(itemClave.api_key);

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${itemClave.api_key}`
        },
        body: JSON.stringify({
          model: modelo,
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
          // Registrar éxito en Supabase
          if (itemClave.id && itemClave.id !== 'local_override' && itemClave.id !== 'manual') {
            supabase.from('config_ai_keys').update({
              ultimo_uso: new Date().toISOString(),
              fallos_consecutivos: 0,
              ultimo_error: null
            }).eq('id', itemClave.id).then(() => {});
          }

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
            mensajeChat: parseado.mensaje_chat || 'Orden procesada con éxito.',
            titulo: parseado.titulo_programa || 'Control BioFleet',
            tipo: parseado.tipo || hardwareInfo.tipo || 'AUTOCLAVE',
            accionPropuesta: parseado.accion_propuesta || null,
            receta: parseado.receta || recetaActual,
            halPayload: parseado.hal_payload || hardwareInfo,
            dashboardWidgets
          };
        }
      } else {
        const errDetail = await response.text();
        throw new Error(`HTTP ${response.status}: ${errDetail}`);
      }
    } catch (err) {
      ultimoError = err.message;
      if (itemClave.id && itemClave.id !== 'local_override' && itemClave.id !== 'manual') {
        supabase.from('config_ai_keys').update({
          fallos_consecutivos: (itemClave.fallos_consecutivos || 0) + 1,
          ultimo_error: err.message
        }).eq('id', itemClave.id).then(() => {});
      }
    }
  }

  throw new Error(`No se pudo procesar la orden con ninguna clave del pool: ${ultimoError}`);
}
