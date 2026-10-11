/**
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * SERVICIO COMPILADOR DE IA - AUTO-DESCUBRIMIENTO DINÁMICO DE MODELOS GROQ
 * =========================================================================================
 */

const GROQ_DEFAULT_API_KEY = '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';

const SYSTEM_PROMPT_INGENIERO_SCADA = `
Eres el Ingeniero Principal de Automatización y SCADA de BioFleet OS v2.0 Enterprise.
Hardware: HKL-EA8 (8 Relés R1..R8 en I2C 0x24, 8 Entradas IN1..IN8 en 0x26, 4 Canales ADC A0..A3 en 0x48).

DIRECTIVAS:
1. Responde a preguntas técnicas del usuario en "mensaje_chat".
2. Si pide controles puntuales (ej: "r1", "controlar r5"), genera únicamente los widgets correspondientes.
3. Si pide secuencias (ej: "test r1 a r8"), genera la matriz "receta" con pasos temporizados y el botón "EJECUTAR_RECETA".
4. Devuelve ÚNICAMENTE un JSON válido con esta estructura:
{
  "mensaje_chat": "Explicación técnica para el operador",
  "titulo_programa": "Nombre del sistema",
  "tipo": "UNIVERSAL_PLC",
  "receta": {
    "nombre_receta": "Secuencia",
    "enclavamientos": [],
    "total_pasos": 0,
    "pasos": []
  },
  "hal_payload": {
    "roles_reles": { "R1": "SALIDA_1" },
    "nombres_reles": { "R1": "Salida R1" }
  },
  "dashboard": [
    {
      "id": "w_1",
      "tipo": "SWITCH_TOGGLE",
      "titulo": "Relé R1",
      "canal": 1,
      "color": "cyan",
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

/**
 * Consulta a Groq para obtener los modelos activos para esta API Key específica
 */
async function obtenerModeloGroqActivo(apiKey) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (res.ok) {
      const data = await res.json();
      const modelos = (data.data || [])
        .map(m => m.id)
        .filter(id => !id.includes('whisper') && !id.includes('vision') && !id.includes('tool'));

      // Priorizar los modelos estándar de Groq activos
      const preferidos = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b', 'llama-3.1-8b-instant'];
      for (const pref of preferidos) {
        if (modelos.includes(pref)) return pref;
      }

      if (modelos.length > 0) return modelos[0];
    }
  } catch (e) {
    console.warn('[GROQ] Auto-detección omitida:', e);
  }

  return 'openai/gpt-oss-120b';
}

/**
 * GENERADOR DE RESPALDO INDUSTRIAL LOCAL (Evita que el lienzo quede en blanco)
 */
function generarRespaldoSeguro(promptTexto) {
  const p = promptTexto.toLowerCase().trim();
  const widgets = [];
  const nombresReles = {};
  const rolesReles = {};

  for (let i = 1; i <= 8; i++) {
    nombresReles[`R${i}`] = `Salida Relé R${i}`;
    rolesReles[`R${i}`] = 'MANUAL';
  }

  // 1. Preguntas informativas
  if (p.includes('que podemos') || p.includes('qué podemos') || p.includes('controlar') && p.includes('dispositivo')) {
    widgets.push({
      id: 'w_test_master',
      tipo: 'ACTION_BUTTON',
      titulo: '⚡ Test Secuencial R1-R8',
      canal: 1,
      color: 'emerald',
      w: 360,
      h: 170
    });
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
      mensajeChat: 'En este controlador HKL-EA8 tienes control total de: 8 relés de potencia en I2C 0x24 (R1 a R8), 8 entradas optocopladas en 0x26 (IN1 a IN8) y 4 canales analógicos ADC en 0x48 (A0 a A3). He desplegado los 8 relés en el lienzo para que comiences a probar.',
      titulo: 'Panel de Control HKL-EA8',
      tipo: 'UNIVERSAL_PLC',
      halPayload: { roles_reles: rolesReles, nombres_reles: nombresReles },
      dashboardWidgets: widgets
    };
  }

  // 2. Relé individual (ej: "r1", "controlar r5", "r5")
  const matchR = p.match(/\b(?:r|rele|relé)\s*([1-8])\b/) || p.match(/^r([1-8])$/);
  if (matchR) {
    const num = parseInt(matchR[1], 10);
    nombresReles[`R${num}`] = `Salida Relé R${num}`;
    rolesReles[`R${num}`] = `CONTROL_R${num}`;

    widgets.push({
      id: `w_sw_r${num}`,
      tipo: 'SWITCH_TOGGLE',
      titulo: `Interruptor R${num}`,
      canal: num,
      color: 'cyan',
      w: 260,
      h: 170
    });
    widgets.push({
      id: `w_btn_r${num}`,
      tipo: 'ACTION_BUTTON',
      titulo: `Pulsar R${num}`,
      canal: num,
      color: 'emerald',
      w: 260,
      h: 170
    });

    return {
      exito: true,
      mensajeChat: `He configurado los controles en el lienzo para la salida física R${num} (un interruptor biestable ON/OFF y un botón pulsador).`,
      titulo: `Control Canal R${num}`,
      tipo: 'UNIVERSAL_PLC',
      halPayload: { roles_reles: rolesReles, nombres_reles: nombresReles },
      dashboardWidgets: widgets
    };
  }

  // 3. Test de relés (R1 a R8)
  if (p.includes('test') || p.includes('teste') || (p.includes('r1') && p.includes('r8'))) {
    const pasos = [];
    for (let i = 1; i <= 8; i++) pasos.push({ canal: i, val: 1, delay_ms: 600 });
    for (let i = 1; i <= 8; i++) pasos.push({ canal: i, val: 0, delay_ms: 600 });

    widgets.push({
      id: 'w_test_master',
      tipo: 'ACTION_BUTTON',
      titulo: '⚡ Test Secuencial R1-R8',
      accion: 'EJECUTAR_RECETA',
      color: 'emerald',
      w: 360,
      h: 170
    });

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
      mensajeChat: 'He generado la receta de test: al pulsar el botón se encenderán en cascada R1 hasta R8 y luego se apagarán en el mismo orden cada 600ms en el Core 1 del ESP32.',
      titulo: 'Test Secuencial R1-R8',
      tipo: 'UNIVERSAL_PLC',
      receta: {
        nombre_receta: 'Test R1-R8',
        enclavamientos: [],
        total_pasos: 16,
        pasos: pasos.map((p, idx) => ({
          nombre: `Paso ${idx + 1}`,
          tipo_transicion: 'TEMPORIZADO',
          tiempo_ms: p.delay_ms,
          acciones_encender: p.val === 1 ? [`R${p.canal}`] : [],
          acciones_apagar: p.val === 0 ? [`R${p.canal}`] : []
        }))
      },
      halPayload: { roles_reles: rolesReles, nombres_reles: nombresReles },
      dashboardWidgets: widgets
    };
  }

  // Fallback general
  widgets.push({
    id: 'w_cmd_auto',
    tipo: 'ACTION_BUTTON',
    titulo: promptTexto.length > 25 ? promptTexto.substring(0, 22) + '...' : promptTexto,
    canal: 1,
    color: 'emerald',
    w: 280,
    h: 170
  });

  return {
    exito: true,
    mensajeChat: `He configurado el sistema en el lienzo basado en tu requerimiento: "${promptTexto}".`,
    titulo: promptTexto.length > 30 ? promptTexto.substring(0, 27) + '...' : promptTexto,
    tipo: 'UNIVERSAL_PLC',
    halPayload: { roles_reles: rolesReles, nombres_reles: nombresReles },
    dashboardWidgets: widgets
  };
}

/**
 * FUNCIÓN EXPORTADA PRINCIPAL
 */
export async function conversarYCompilarConIA({ prompt, historial = [], hardwareInfo = {}, apiKey = null }) {
  const p = prompt ? prompt.trim() : '';
  if (!p) throw new Error('Por favor introduce tu requerimiento.');

  const key = apiKey || localStorage.getItem('biofleet_ai_key') || GROQ_DEFAULT_API_KEY;

  // 1. Obtener dinámicamente el modelo activo en Groq para tu clave
  const modelIdActivo = await obtenerModeloGroqActivo(key);
  console.log(`🤖 [GROQ INFERENCE] Consultando modelo activo: ${modelIdActivo}`);

  const messages = [
    { role: 'system', content: `${SYSTEM_PROMPT_INGENIERO_SCADA}\nHARDWARE DISPONIBLE: ${JSON.stringify(hardwareInfo)}` },
    ...historial.map(h => ({
      role: h.sender === 'user' ? 'user' : 'assistant',
      content: typeof h.contenido === 'string' ? h.contenido : JSON.stringify(h.contenido)
    })),
    { role: 'user', content: p }
  ];

  try {
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
      const jsonParseado = sanitizarJson(rawText);

      if (jsonParseado && jsonParseado.dashboard) {
        const dashboardWidgets = jsonParseado.dashboard.map((w, idx) => ({
          ...w,
          id: w.id || `w_${Date.now()}_${idx}`,
          x: (idx % 3) * 280 + 20,
          y: Math.floor(idx / 3) * 190 + 20,
          w: w.w || 260,
          h: w.h || 170
        }));

        return {
          exito: true,
          mensajeChat: jsonParseado.mensaje_chat || 'He diseñado la automatización solicitada.',
          titulo: jsonParseado.titulo_programa || 'Automatización Personalizada',
          descripcion: jsonParseado.descripcion || p,
          tipo: jsonParseado.tipo || 'UNIVERSAL_PLC',
          receta: jsonParseado.receta || null,
          halPayload: jsonParseado.hal_payload || {},
          dashboardWidgets
        };
      }
    }
  } catch (err) {
    console.warn('[GROQ API] Error en llamada cloud, activando respaldo local:', err.message);
  }

  // 2. Respaldo local inmediato: genera la respuesta técnica y los widgets correspondientes
  const local = generarRespaldoSeguro(p);
  const widgetsConCoordenadas = local.dashboardWidgets.map((w, idx) => ({
    ...w,
    x: (idx % 3) * 280 + 20,
    y: Math.floor(idx / 3) * 190 + 20
  }));

  return {
    ...local,
    dashboardWidgets: widgetsConCoordenadas
  };
}
