/**
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * SERVICIO COMPILADOR DE IA INDUSTRIAL - ALINEADO AL FIRMWARE ESP32 v8.6 ROCK-SOLID
 * MOTOR NEURONAL: GROQ CLOUD + AUTO-RESOLUCIÓN EN VIVO DE MODELOS ACTIVOS
 * =========================================================================================
 */

const GROQ_DEFAULT_API_KEY = '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';

const SYSTEM_PROMPT_INGENIERO_SCADA = `
Eres el Ingeniero Principal de Automatización y Control de BioFleet OS v2.0 Enterprise.
Tu función es razonar y generar arquitecturas industriales para el firmware v8.6 que corre en un microcontrolador ESP32 (Core 1 a 50Hz) sobre placa HKL-EA8 (o placas libres DIY).

HARDWARE FÍSICO (HKL-EA8 Industrial):
- 8 Relés de Potencia: R1 a R8 (I2C 0x24 PCF8574).
- 8 Entradas Optocopladas: IN1 a IN8 (I2C 0x26 PCF8574).
- 4 Entradas Analógicas ADC 16-bit: A0 a A3 (I2C 0x48 ADS1115).
- Display LCD: I2C 0x27 (16x2 o 20x4).

CATÁLOGO DE WIDGETS SCADA:
- 'SEQUENCE_TIMER': Temporizador de proceso con cuenta regresiva en segundos, barra de progreso y fases.
- 'ACTION_BUTTON': Botón pulsador directo ("accion": "COMANDO", "canal": N) o disparo de receta FSM ("accion": "EJECUTAR_RECETA").
- 'SWITCH_TOGGLE': Interruptor ON/OFF para conmutar un relé directo.
- 'MOMENTARY_BUTTON': Pulsador tipo jog (activo solo mientras se mantiene presionado).
- 'EMERGENCY_STOP': Seta de paro de emergencia con enclavamiento ("accion": "ABORTAR").
- 'ROTARY_SELECTOR': Selector rotativo de 3 posiciones (MAN - 0 - AUTO).
- 'GAUGE_RADIAL': Manómetro radial para presión (-1 a 3 bar), RPM o voltímetro.
- 'VALUE_CARD': Tarjeta de lectura digital numérica (°C, caudal, tiempo).
- 'LEVEL_TANK': Indicador vertical de nivel de tanque animado (0 a 100%).
- 'STATUS_LED': LED indicador luminoso de entrada digital o estado.

REGLAS DE TEMPORIZACIÓN Y CONTROL:
1. SI EL USUARIO MENCIONA TIEMPOS O TEMPORIZADORES (ej: "prende R1 por 5 segundos", "secuencia R1 a R8 con 600ms", "autoclave con meseta 5 min"):
   - Define la "receta" con los pasos temporizados en "tiempo_ms" (milisegundos).
   - Genera en el dashboard un widget 'SEQUENCE_TIMER' con "totalSegundos" (suma total de segundos) y la lista de "pasos".
   - Agrega también los widgets 'SWITCH_TOGGLE' de los relés que intervienen para supervisar su estado físico.
2. SI EL USUARIO PIDE UN CONTROL PUNTUAL (ej: "r5", "controlar r2"):
   - Genera únicamente los controles solicitados (interruptor y botón de ese relé).
3. En "mensaje_chat", redacta una respuesta conversacional técnica explicando la arquitectura implementada.

RESPONDE EXCLUSIVAMENTE CON UN OBJETO JSON VÁLIDO:
{
  "mensaje_chat": "Explicación técnica de la arquitectura configurada",
  "titulo_programa": "Nombre representativo del sistema",
  "descripcion": "Memoria técnica descriptiva",
  "tipo": "UNIVERSAL_PLC" | "AUTOCLAVE" | "VEHICULO",
  "receta": {
    "nombre_receta": "Nombre",
    "enclavamientos": [],
    "total_pasos": 1,
    "pasos": [
      {
        "nombre": "Fase 1",
        "tipo_transicion": "TEMPORIZADO",
        "tiempo_ms": 5000,
        "acciones_encender": ["R1"],
        "acciones_apagar": []
      }
    ]
  },
  "hal_payload": {
    "roles_reles": { "R1": "CONTROL_R1" },
    "nombres_reles": { "R1": "Relé R1" }
  },
  "dashboard": [
    {
      "id": "w_1",
      "tipo": "SEQUENCE_TIMER" | "SWITCH_TOGGLE" | "ACTION_BUTTON" | "GAUGE_RADIAL" | "VALUE_CARD" | "LEVEL_TANK" | "EMERGENCY_STOP",
      "titulo": "Etiqueta",
      "canal": 1,
      "accion": "COMANDO" | "EJECUTAR_RECETA" | "ABORTAR",
      "totalSegundos": 5,
      "pasos": [],
      "color": "cyan" | "emerald" | "amber" | "rose",
      "unidad": "",
      "min": 0,
      "max": 100,
      "w": 360,
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

/**
 * Consulta en vivo a Groq para obtener el modelo activo de texto
 */
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
 * COMPILADOR DIRECTO LOCAL (0 ms de latencia para órdenes con tiempos o relés)
 */
function compilarInstruccionInmediata(promptTexto) {
  const p = promptTexto.toLowerCase().trim();

  // 1. Detección de tiempos numéricos
  const regexTiempos = /(\d+)\s*(segundo|segundos|seg|s|minuto|minutos|min)/g;
  const tiempos = [];
  let m;
  while ((m = regexTiempos.exec(p)) !== null) {
    const val = parseInt(m[1], 10);
    const u = m[2].toLowerCase();
    tiempos.push(u.startsWith('min') ? val * 60 : val);
  }

  // 2. Detección de relés mencionados
  const matchR = p.match(/\b(?:r|rele|relé)\s*([1-8])\b/) || p.match(/r([1-8])/);
  const canal = matchR ? parseInt(matchR[1], 10) : 1;

  // CASO A: Temporizador simple explícito (ej: "prende R1 por 5 segundos")
  if (tiempos.length > 0) {
    const totalSegs = tiempos[0];
    const pasosReceta = [
      {
        nombre: `Encendido R${canal}`,
        tipo_transicion: 'TEMPORIZADO',
        tiempo_ms: totalSegs * 1000,
        acciones_encender: [`R${canal}`],
        acciones_apagar: []
      },
      {
        nombre: `Apagado R${canal}`,
        tipo_transicion: 'INMEDIATO',
        tiempo_ms: 0,
        acciones_encender: [],
        acciones_apagar: [`R${canal}`]
      }
    ];

    return {
      exito: true,
      mensajeChat: `He programado la temporización para el Relé R${canal} durante ${totalSegs} segundos. El temporizador activará la salida física y la apagará automáticamente al cumplirse el tiempo.`,
      titulo: `Temporizador R${canal} (${totalSegs}s)`,
      tipo: 'UNIVERSAL_PLC',
      receta: {
        nombre_receta: `Temporizador R${canal} ${totalSegs}s`,
        enclavamientos: [],
        total_pasos: 2,
        pasos: pasosReceta
      },
      halPayload: {
        roles_reles: { [`R${canal}`]: 'TEMPORIZADO' },
        nombres_reles: { [`R${canal}`]: `Salida R${canal}` }
      },
      dashboardWidgets: [
        {
          id: `w_timer_r${canal}`,
          tipo: 'SEQUENCE_TIMER',
          titulo: `Temporizador R${canal}`,
          canal: canal,
          accion: 'EJECUTAR_RECETA',
          totalSegundos: totalSegs,
          pasos: [{ nombre: `Marcha R${canal}`, tiempoMs: totalSegs * 1000, canal: canal }],
          color: 'amber',
          w: 360,
          h: 220
        },
        {
          id: `w_sw_r${canal}`,
          tipo: 'SWITCH_TOGGLE',
          titulo: `Supervisión R${canal}`,
          canal: canal,
          color: 'cyan',
          w: 260,
          h: 170
        }
      ]
    };
  }

  // CASO B: Secuencia en cascada R1 a R8 con apagado en orden
  if (p.includes('test') || p.includes('secuencia') || (p.includes('r1') && p.includes('r8'))) {
    const pasos = [];
    for (let i = 1; i <= 8; i++) pasos.push({ canal: i, val: 1, delay_ms: 600 });
    for (let i = 1; i <= 8; i++) pasos.push({ canal: i, val: 0, delay_ms: 600 });

    const widgets = [
      {
        id: 'w_test_master',
        tipo: 'SEQUENCE_TIMER',
        titulo: '⚡ Secuencia Cascada R1-R8',
        accion: 'EJECUTAR_RECETA',
        totalSegundos: 10,
        pasos: [
          { nombre: 'Cascada ON', tiempoMs: 4800, canal: 1 },
          { nombre: 'Cascada OFF', tiempoMs: 4800, canal: 1 }
        ],
        color: 'emerald',
        w: 360,
        h: 220
      }
    ];

    for (let i = 1; i <= 8; i++) {
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
      mensajeChat: 'He generado la receta de cascada completa: encendido secuencial de R1 a R8 (600ms c/u) y posterior apagado en el mismo orden.',
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

  // CASO C: Control individual directo (ej: "r5", "enciende r2")
  if (matchR) {
    return {
      exito: true,
      mensajeChat: `He colocado el control para el Relé R${canal}. Para temporizarlo, indica los segundos (ejemplo: "prende R${canal} por 10 segundos").`,
      titulo: `Control Canal R${canal}`,
      tipo: 'UNIVERSAL_PLC',
      halPayload: {
        roles_reles: { [`R${canal}`]: `CONTROL_R${canal}` },
        nombres_reles: { [`R${canal}`]: `Salida Relé R${canal}` }
      },
      dashboardWidgets: [
        {
          id: `w_sw_r${canal}`,
          tipo: 'SWITCH_TOGGLE',
          titulo: `Interruptor R${canal}`,
          canal: canal,
          color: 'cyan',
          w: 260,
          h: 170
        }
      ]
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

  // 1. Evaluar si es comando directo para resolución en 0 ms
  const directo = compilarInstruccionInmediata(p);
  if (directo) {
    let curX = 20;
    let curY = 20;
    const conCoords = directo.dashboardWidgets.map((w) => {
      const wPos = { ...w, x: curX, y: curY };
      curX += (w.w || 260) + 20;
      if (curX > 860) { curX = 20; curY += 210; }
      return wPos;
    });
    return { ...directo, dashboardWidgets: conCoords };
  }

  // 2. Consulta a Groq con el modelo activo descubierto
  const key = apiKey || localStorage.getItem('biofleet_ai_key') || GROQ_DEFAULT_API_KEY;

  try {
    const modelIdActivo = await resolverModeloGroqActivo(key);
    console.log(`🤖 [GROQ INFERENCE] Consultando modelo activo: ${modelIdActivo}`);

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
          const width = w.w || (w.tipo === 'SEQUENCE_TIMER' ? 360 : 260);
          const height = w.h || (w.tipo === 'SEQUENCE_TIMER' ? 220 : 170);
          const wPos = { ...w, id: w.id || `w_${Date.now()}_${idx}`, x: curX, y: curY, w: width, h: height };
          curX += width + 20;
          if (curX > 860) { curX = 20; curY += 210; }
          return wPos;
        });

        return {
          exito: true,
          mensajeChat: parseado.mensaje_chat || 'He diseñado la arquitectura de control solicitada.',
          titulo: parseado.titulo_programa || 'Automatización Personalizada',
          descripcion: parseado.descripcion || p,
          tipo: parseado.tipo || 'UNIVERSAL_PLC',
          receta: parseado.receta || null,
          halPayload: parseado.hal_payload || {},
          dashboardWidgets
        };
      }
    }
  } catch (err) {
    console.warn('[GROQ API] Error en llamada cloud:', err.message);
  }

  // 3. Fallback seguro en caso de corte de red
  return {
    exito: true,
    mensajeChat: `He colocado los controles en el lienzo basados en: "${p}".`,
    titulo: p.length > 30 ? p.substring(0, 27) + '...' : p,
    tipo: 'UNIVERSAL_PLC',
    halPayload: {},
    dashboardWidgets: [
      { id: `w_${Date.now()}`, tipo: 'SWITCH_TOGGLE', titulo: p, canal: 1, color: 'cyan', w: 260, h: 170, x: 20, y: 20 }
    ]
  };
}
