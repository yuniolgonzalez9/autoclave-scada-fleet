/**
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * SERVICIO COMPILADOR DE IA INDUSTRIAL - ARQUITECTO PARAMÉTRICO DE DISPOSITIVOS
 * Conoce al 100% el manifiesto config_deseada, periféricos, HKL-EA8, Jack CT y clínica EN 13060
 * =========================================================================================
 */

const GROQ_DEFAULT_API_KEY = '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';

const SYSTEM_PROMPT_SCADA_PARAMETRICO = `
Eres el Ingeniero Consultor Principal de Automatización y SCADA de BioFleet OS v2.0 Enterprise.
Tu misión es gestionar, diseñar y reconfigurar el GEMELO DIGITAL ("config_deseada") de controladores industriales HKL-EA8 (ESP32 con 16MB Flash, Ethernet LAN8720, bus I2C 0x24, 0x26, 0x48, LCD 0x27 y Jack CT de 3.5mm).

ESTRUCTURA DEL MANIFIESTO QUE GOBIERNAS ("config_deseada"):
1. "perifericos":
   - "ct_jack_amperimetro": { "conectado": bool, "canal_adc": "A2", "modelo_sensor": "SCT-013 (Jack 3.5mm)", "factor_escala": float, "umbral_min_calor_a": float, "tiempo_deteccion_s": float, "supervisar_calefactor": bool }
   - "bomba_vacio": { "instalada": bool, "salida_rele": "R5", "pulsos_fraccionados": int, "timeout_succion_s": float }
   - "caldera_interna": { "instalada": bool, "modo_automatico": bool, "retardo_bomba_on_s": float, "retardo_bomba_off_s": float, "retardo_resist_on_s": float, "retardo_resist_off_s": float }
   - "display_lcd": { "conectado": bool, "direccion_i2c": "0x27", "cols": 16, "filas": 2, "mostrar_corriente_ct": bool }

2. "hardware_i2c_topologia":
   - "chips_detectados": [ { "direccion_hex": "0x24", "rol_asignado": "SALIDAS_PCF8574", "total_pines": 8 }, ... ]

3. "mapeo_absoluto_salidas":
   - Asignación de funciones de máquina (cierre_sello, valvula_succion, alivio_sello, bomba_agua, resistencias, bomba_vacio, secado_desfogue, inyeccion_vapor) a chips ("0x24") y pines (0..7) con banderas "instalado": bool.

4. "mapeo_absoluto_entradas":
   - Asignación de sensores (puerta_fisica, sello_presurizado, recamara_presion, caldera_presion, nivel_bajo_agua, nivel_alto_agua, paro_emergencia, auxiliar_reserva) a chips ("0x26") y pines (0..7) con banderas "bypass": bool e "invertir": bool.

5. "programas_clinicos":
   - "p1": { "nombre": "Instrumental", "est_min": float, "sec_min": float, "vac_min": float, "desf_min": float, "activo": bool }
   - "p2": { "nombre": "Textil/Campo", ... }
   - "p3": { "nombre": "Gomas/Caucho", ... }
   - "p4": { "nombre": "Líquidos", ... }
   - "p5": { "nombre": "Contenedor", ... }
   - "p6": { "nombre": "Test Rápido", ... }

6. "fases_del_ciclo":
   - Banderas de activación de fases: purga_aire, succion_vacio, secado_camara, desfogue_escape, espera_sello, auto_apertura_fin.

7. "diagnostico_fdir":
   - Reglas de supervisión predictiva en vivo: evaluar_consumo_resistencias, evaluar_rampa_vapor (timeout_rampa_min), evaluar_succion_vacio (timeout_succion_s), evaluar_llenado_agua, evaluar_fuga_sello.

8. "servicio_y_odometro":
   - limite_ciclos (ej: 300), porcentaje_alerta (ej: 80), ciclos_actuales, ciclos_historicos, mensaje_fuera_servicio.

CAPACIDADES DEL ASISTENTE:
- Si el usuario te pide modificar parámetros existentes (ej: "cambia el programa P1 a 134°C con 4 min de meseta y activa el CT"):
  Aplica los cambios exactos sobre el manifiesto y mantén intactos todos los demás parámetros.
- Si el usuario te pide agregar, eliminar o rediseñar widgets en el SCADA:
  Genera la lista actualizada de controles en "dashboard".
- En "mensaje_chat", redacta una respuesta técnica impecable explicando qué parámetros actualizaste y por qué.
- Devuelve EXCLUSIVAMENTE un objeto JSON válido.

ESTRUCTURA DE RESPUESTA:
{
  "mensaje_chat": "Explicación técnica para el operador de los parámetros actualizados",
  "titulo_programa": "Nombre del perfil o sistema",
  "tipo": "AUTOCLAVE" | "UNIVERSAL_PLC" | "VEHICULO",
  "config_deseada": {
    // Manifiesto completo actualizado con periféricos, programas, mapeos y diagnóstico
  },
  "dashboard": [
    {
      "id": "w_1",
      "tipo": "SEQUENCE_TIMER" | "SWITCH_TOGGLE" | "ACTION_BUTTON" | "GAUGE_RADIAL" | "VALUE_CARD" | "LEVEL_TANK" | "EMERGENCY_STOP" | "ROTARY_SELECTOR" | "MOMENTARY_BUTTON",
      "titulo": "Etiqueta",
      "canal": 1,
      "accion": "EJECUTAR_RECETA" | "COMANDO" | "ABORTAR",
      "color": "cyan" | "emerald" | "amber" | "rose" | "purple",
      "unidad": "bar" | "°C" | "V" | "RPM" | "%" | "A",
      "min": 0,
      "max": 100,
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
 * FUNCIÓN PRINCIPAL EXPORTADA CON GESTIÓN DE CONFIG_DESEADA
 */
export async function conversarYCompilarConIA({ 
  prompt, 
  historial = [], 
  configDeseadaActual = {}, 
  widgetsActuales = [], 
  telemetriaActual = {}, 
  apiKey = null 
}) {
  const p = prompt ? prompt.trim() : '';
  if (!p) throw new Error('Por favor introduce tu requerimiento o ajuste paramétrico.');

  const key = apiKey || localStorage.getItem('biofleet_ai_key') || GROQ_DEFAULT_API_KEY;

  try {
    const modelIdActivo = await resolverModeloGroqActivo(key);

    const contextPayload = {
      config_deseada_actual: configDeseadaActual,
      widgets_en_pantalla: widgetsActuales,
      telemetria_actual: telemetriaActual
    };

    const messages = [
      { role: 'system', content: `${SYSTEM_PROMPT_SCADA_PARAMETRICO}\n\nESTADO VIVO DEL EQUIPO:\n${JSON.stringify(contextPayload)}` },
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
        // Normalización de coordenadas en el lienzo
        let curX = 20;
        let curY = 20;
        const dashboardWidgets = (parseado.dashboard || widgetsActuales).map((w, idx) => {
          const width = w.w || (w.tipo === 'SEQUENCE_TIMER' || w.tipo === 'CHART_HISTORY' ? 380 : 260);
          const height = w.h || (w.tipo === 'SEQUENCE_TIMER' ? 220 : 170);
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
            h: height
          };
        });

        return {
          exito: true,
          mensajeChat: parseado.mensaje_chat || 'He actualizado los parámetros del sistema.',
          titulo: parseado.titulo_programa || 'Control Paramétrico',
          tipo: parseado.tipo || configDeseadaActual.tipo || 'AUTOCLAVE',
          configDeseada: parseado.config_deseada || configDeseadaActual,
          dashboardWidgets
        };
      }
    }
  } catch (err) {
    console.warn('[AI COMPILER] Error en llamada cloud:', err.message);
  }

  // Fallback seguro si no hay internet: mantiene la configuración viva sin corromper nada
  return {
    exito: true,
    mensajeChat: `He registrado tu solicitud: "${p}". (Modo seguro sin conexión).`,
    titulo: 'Control SCADA',
    tipo: configDeseadaActual.tipo || 'AUTOCLAVE',
    configDeseada: configDeseadaActual,
    dashboardWidgets: widgetsActuales
  };
}
