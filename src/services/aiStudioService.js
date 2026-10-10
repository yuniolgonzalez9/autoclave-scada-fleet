/**
 * =========================================================================
 * BIOFLEET OS™ v2.0 ENTERPRISE - AI STUDIO & COMPILER SERVICE
 * 
 * 1. Interpreta instrucciones en lenguaje natural.
 * 2. Compila la lógica física para el microcontrolador (LittleFS).
 * 3. Diseña la distribución visual de Widgets (Estilo Arduino IoT Cloud).
 * =========================================================================
 */

// Plantillas semánticas de respaldo para compilación instantánea sin internet
const PLANTILLAS_SEMANTICAS = {
  VEHICULO: {
    palabras: ['carro', 'coche', 'ambulancia', 'vehiculo', 'staria', 'arranque', 'motor', 'camion', 'ignicion', 'starter'],
    hal: {
      tipo: "VEHICULO",
      starter_ms: 1200,
      roles_reles: {
        R1: "IGNICION_ON", R2: "STARTER_MOTOR", R3: "INMOVILIZADOR", R4: "SIRENA_LUCES",
        R5: "MANUAL", R6: "MANUAL", R7: "MANUAL", R8: "MANUAL"
      },
      nombres_reles: {
        R1: "Contacto Ignición ACC", R2: "Motor de Arranque (Start)", R3: "Corte Bomba Inmovilizador", R4: "Sirena / Luces Perimetrales",
        R5: "Auxiliar 5", R6: "Auxiliar 6", R7: "Auxiliar 7", R8: "Auxiliar 8"
      },
      roles_entradas: {
        IN1: "SENSOR_FRENO", IN2: "ALTERNADOR_D", IN3: "PUERTA_CABINA", IN4: "PARO_EMERGENCIA",
        IN5: "LIBRE", IN6: "LIBRE", IN7: "LIBRE", IN8: "LIBRE"
      },
      nombres_entradas: {
        IN1: "Pedal de Freno", IN2: "Alternador D+ 14V", IN3: "Puerta Conductor", IN4: "Corte de Emergencia",
        IN5: "Sensor 5", IN6: "Sensor 6", IN7: "Sensor 7", IN8: "Sensor 8"
      }
    },
    dashboard: [
      { id: "w_start", tipo: "ACTION_BUTTON", titulo: "Arranque Remoto", accion: "START_VEHICLE", color: "emerald", icono: "Key", colSpan: 2 },
      { id: "w_ign", tipo: "SWITCH_TOGGLE", titulo: "Ignición ACC", canal: 1, color: "amber", icono: "Zap", colSpan: 1 },
      { id: "w_stop", tipo: "ACTION_BUTTON", titulo: "Corte Inmovilizador", accion: "STOP_VEHICLE", color: "rose", icono: "PowerOff", colSpan: 1 },
      { id: "w_bat", tipo: "GAUGE_RADIAL", titulo: "Batería 12V", variable: "bateria_v", unidad: "V", min: 10, max: 16, color: "emerald", colSpan: 1 },
      { id: "w_alt", tipo: "STATUS_LED", titulo: "Alternador D+", entrada: "IN2", labelOn: "CARGA 14V", labelOff: "PARADO", color: "cyan", colSpan: 1 },
      { id: "w_freno", tipo: "STATUS_LED", titulo: "Freno", entrada: "IN1", labelOn: "PISADO", labelOff: "LIBRE", color: "amber", colSpan: 1 },
      { id: "w_fase", tipo: "TEXT_STATUS", titulo: "Estado Motor", variable: "fase", color: "white", colSpan: 1 }
    ]
  },
  AUTOCLAVE: {
    palabras: ['autoclave', 'esteriliz', 'vapor', 'camara', 'calentador', 'presion', 'f0', 'meseta', 'purga'],
    hal: {
      tipo: "AUTOCLAVE",
      sp_temp: 134.0,
      t_ciclo: 4,
      p_max: 2.65,
      roles_reles: {
        R1: "CALENTADOR", R2: "BOMBA_VACIO", R3: "MOTOR_AGITADOR", R4: "PURGA_VAPOR",
        R5: "MANUAL", R6: "MANUAL", R7: "MANUAL", R8: "MANUAL"
      },
      nombres_reles: {
        R1: "Resistencias Calefactoras", R2: "Bomba de Vacío / Secado", R3: "Motor Agitador", R4: "Electroválvula de Purga",
        R5: "Válvula Agua", R6: "Salida 6", R7: "Salida 7", R8: "Salida 8"
      },
      roles_entradas: {
        IN1: "SENSOR_PUERTA", IN2: "PRESOSTATO", IN3: "NIVEL_AGUA", IN4: "PARO_EMERGENCIA",
        IN5: "LIBRE", IN6: "LIBRE", IN7: "LIBRE", IN8: "LIBRE"
      },
      nombres_entradas: {
        IN1: "Microswitch Puerta", IN2: "Presóstato de Seguridad", IN3: "Sensor Nivel Agua", IN4: "Seta Emergencia",
        IN5: "Sensor 5", IN6: "Sensor 6", IN7: "Sensor 7", IN8: "Sensor 8"
      }
    },
    dashboard: [
      { id: "w_temp", tipo: "VALUE_CARD", titulo: "Temperatura Cámara", variable: "temp_camara", unidad: "°C", color: "cyan", colSpan: 1 },
      { id: "w_pres", tipo: "GAUGE_RADIAL", titulo: "Presión Vapor", variable: "presion", unidad: "bar", min: 0, max: 3, color: "pink", colSpan: 1 },
      { id: "w_f0", tipo: "VALUE_CARD", titulo: "Letalidad (F0)", variable: "f0Score", unidad: "min", color: "emerald", colSpan: 1 },
      { id: "w_fase", tipo: "TEXT_STATUS", titulo: "Fase de Ciclo", variable: "fase", color: "amber", colSpan: 1 },
      { id: "w_start_cycle", tipo: "ACTION_BUTTON", titulo: "Iniciar Ciclo (134°C)", accion: "INICIAR_CICLO", color: "cyan", icono: "Play", colSpan: 2 },
      { id: "w_abort", tipo: "ACTION_BUTTON", titulo: "Paro Emergencia", accion: "ABORTAR_CICLO", color: "rose", icono: "Square", colSpan: 1 },
      { id: "w_chart", tipo: "CHART_HISTORY", titulo: "Curva Térmica en Vivo", color: "cyan", colSpan: 4 }
    ]
  },
  PLC_GENERICO: {
    palabras: ['bomba', 'tanque', 'llenado', 'rele', 'riego', 'luz', 'generador', 'industrial', 'plc'],
    hal: {
      tipo: "UNIVERSAL_PLC",
      roles_reles: {
        R1: "BOMBA_AGUA", R2: "ELECTROVALVULA_LLENADO", R3: "ELECTROVALVULA_DRENAJE", R4: "ALARMA_SIRENA",
        R5: "MANUAL", R6: "MANUAL", R7: "MANUAL", R8: "MANUAL"
      },
      nombres_reles: {
        R1: "Bomba Principal", R2: "Válvula de Llenado", R3: "Válvula de Drenaje", R4: "Sirena de Aviso",
        R5: "Salida 5", R6: "Salida 6", R7: "Salida 7", R8: "Salida 8"
      },
      roles_entradas: {
        IN1: "NIVEL_MINIMO", IN2: "NIVEL_MAXIMO", IN3: "CAUDALIMETRO", IN4: "PARO_EMERGENCIA",
        IN5: "LIBRE", IN6: "LIBRE", IN7: "LIBRE", IN8: "LIBRE"
      },
      nombres_entradas: {
        IN1: "Boya Nivel Mínimo", IN2: "Boya Nivel Máximo", IN3: "Sensor de Flujo", IN4: "Paro de Emergencia",
        IN5: "Entrada 5", IN6: "Entrada 6", IN7: "Entrada 7", IN8: "Entrada 8"
      }
    },
    dashboard: [
      { id: "w_bomba", tipo: "SWITCH_TOGGLE", titulo: "Bomba Principal", canal: 1, color: "emerald", icono: "Zap", colSpan: 1 },
      { id: "w_valvula", tipo: "SWITCH_TOGGLE", titulo: "Válvula Llenado", canal: 2, color: "cyan", icono: "Activity", colSpan: 1 },
      { id: "w_drenaje", tipo: "SWITCH_TOGGLE", titulo: "Válvula Drenaje", canal: 3, color: "amber", icono: "Activity", colSpan: 1 },
      { id: "w_sirena", tipo: "SWITCH_TOGGLE", titulo: "Sirena Alarma", canal: 4, color: "rose", icono: "Zap", colSpan: 1 },
      { id: "w_in1", tipo: "STATUS_LED", titulo: "Nivel Mínimo", entrada: "IN1", labelOn: "VACÍO", labelOff: "OK", color: "rose", colSpan: 1 },
      { id: "w_in2", tipo: "STATUS_LED", titulo: "Nivel Máximo", entrada: "IN2", labelOn: "LLENO", labelOff: "LLENANDO", color: "emerald", colSpan: 1 },
      { id: "w_in4", tipo: "STATUS_LED", titulo: "Paro Emergencia", entrada: "IN4", labelOn: "SETA ACTIVA", labelOff: "NORMAL", color: "rose", colSpan: 2 }
    ]
  }
};

/**
 * Función Principal de Compilación con Inteligencia Artificial
 */
export async function compilarConIA({ prompt, device, hardwareInfo, apiKey }) {
  const pLower = (prompt || '').toLowerCase();

  // 1. Si el usuario configuró una clave API en Vercel o localmente (.env)
  const realKey = apiKey || import.meta.env.VITE_OPENAI_API_KEY || null;

  if (realKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${realKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `Eres el Compilador de Lógica e Interfaces de BioFleet OS.
Tu tarea es convertir la descripción del usuario en dos cosas:
1. "hal_payload": Configuración de hardware para el microcontrolador (tipo, roles_reles, nombres_reles, roles_entradas, nombres_entradas, starter_ms, sp_temp, etc.).
2. "dashboard": Lista de widgets visuales para el panel web (tipo: 'ACTION_BUTTON'|'SWITCH_TOGGLE'|'GAUGE_RADIAL'|'VALUE_CARD'|'STATUS_LED'|'TEXT_STATUS', titulo, color, colSpan de 1 a 4).
Hardware disponible en placa: ${JSON.stringify(hardwareInfo || {})}
Responde EXCLUSIVAMENTE con un JSON válido con este formato:
{
  "titulo_programa": "...",
  "descripcion": "...",
  "hal_payload": { ... },
  "dashboard": [ ... ]
}`
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.2
        })
      });

      if (response.ok) {
        const jsonRes = await response.json();
        const content = JSON.parse(jsonRes.choices[0].message.content);
        return {
          exito: true,
          fuente: 'IA_NUBE',
          titulo: content.titulo_programa || 'Automatización Generada con IA',
          descripcion: content.descripcion || prompt,
          halPayload: content.hal_payload,
          dashboardWidgets: content.dashboard
        };
      }
    } catch (e) {
      console.warn('[AI STUDIO] Error consultando API en la nube, usando compilador semántico local:', e);
    }
  }

  // 2. Compilador Semántico Local Integrado (Cero dependencias externas, respuesta en 100ms)
  let plantillaSeleccionada = PLANTILLAS_SEMANTICAS.PLC_GENERICO;
  let tipoDetectado = 'UNIVERSAL_PLC';

  if (PLANTILLAS_SEMANTICAS.VEHICULO.palabras.some(palabra => pLower.includes(palabra))) {
    plantillaSeleccionada = PLANTILLAS_SEMANTICAS.VEHICULO;
    tipoDetectado = 'VEHICULO';
  } else if (PLANTILLAS_SEMANTICAS.AUTOCLAVE.palabras.some(palabra => pLower.includes(palabra))) {
    plantillaSeleccionada = PLANTILLAS_SEMANTICAS.AUTOCLAVE;
    tipoDetectado = 'AUTOCLAVE';
  }

  return {
    exito: true,
    fuente: 'COMPILADOR_SEMANTICO_LOCAL',
    titulo: `Programa Inteligente: ${tipoDetectado}`,
    descripcion: `Automatización compilada basada en: "${prompt}"`,
    halPayload: {
      ...plantillaSeleccionada.hal,
      nombre: `HAL_${tipoDetectado}_${(device?.mac || 'DEV').slice(-4)}`
    },
    dashboardWidgets: plantillaSeleccionada.dashboard
  };
}
