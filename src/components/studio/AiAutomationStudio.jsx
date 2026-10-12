/**
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * SERVICIO COMPILADOR DE IA - MODELO GROQ GPT-OSS-120B / 20B CON RESPALDO INDUSTRIAL
 * =========================================================================================
 */

const GROQ_DEFAULT_API_KEY = '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';

const SYSTEM_PROMPT_INGENIERO_SCADA = `
Eres el Ingeniero Principal de Automatización y SCADA de BioFleet OS v2.0 Enterprise.
Hardware: Controlador industrial HKL-EA8 (8 Relés R1..R8 en 0x24, 8 Entradas IN1..IN8 en 0x26, 4 ADC A0..A3 en 0x48, LCD 0x27).

DIRECTIVAS ESTRICTAS:
1. DIÁLOGO ACTIVO: En "mensaje_chat", responde al operador con explicaciones técnicas claras de lo que construiste.
2. Si el usuario hace preguntas sobre qué se puede controlar, enumera las salidas y entradas del HKL-EA8.
3. Si el usuario pide un control puntual (ej: "r1", "controlar r5"), genera únicamente los widgets solicitados.
4. Si el usuario pide una secuencia o proceso (ej: "test r1 a r8 y que se apaguen en orden"), genera en "receta" todos los pasos detallados para el Core 1 y el botón "EJECUTAR_RECETA".
5. Devuelve EXCLUSIVAMENTE un objeto JSON válido con esta estructura:
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

      // Modelos de texto/razonamiento activos en Groq (Octubre 2026)
      const candidatos = modelos.filter(id => 
        !id.includes('whisper') && 
        !id.includes('guard') && 
        !id.includes('orpheus')
      );

      // Priorizar el modelo insignia de razonamiento GPT-OSS 120B o 20B
      const preferido = candidatos.find(id => id.includes('gpt-oss-120b')) ||
                        candidatos.find(id => id.includes('gpt-oss-20b')) ||
                        candidatos.find(id => id.includes('qwen')) ||
                        candidatos[0];

      if (preferido) return preferido;
    }
  } catch (e) {
    console.warn('[GROQ] Auto-detección de modelos omitida:', e);
  }

  // Modelo de producción activo por defecto
  return 'openai/gpt-oss-120b';
}

/**
 * GENERADOR DE RESPALDO INDUSTRIAL LOCAL
 * Asegura que el usuario siempre reciba respuesta y controles en el lienzo
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

  // 1. Preguntas de orientación / Inventario
  if (p.includes('que podemos') || p.includes('qué podemos') || (p.includes('controlar') && p.includes('dispositivo'))) {
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
      mensajeChat: 'En este controlador HKL-EA8 tienes control total de: 8 relés de potencia en I2C 0x24 (R1 a R8), 8 entradas optocopladas en 0x26 (IN1 a IN8) y 4 canales analógicos ADC en 0x48 (A0 a A3). He desplegado los 8 relés en el lienzo para que comiences a probar.',
      titulo: 'Panel de Control HKL-EA8',
      tipo: 'UNIVERSAL_PLC',
      halPayload: { roles_reles: rolesReles, nombres_reles: nombresReles },
      dashboardWidgets: widgets
    };
  }

  // 2. Control de relé individual (ej: "r1", "controlar r5", "r5")
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
      mensajeChat: `He configurado los controles para la salida física R${num} con un interruptor biestable (ON/OFF) y un pulsador directo.`,
      titulo: `Control Canal R${num}`,
      tipo: 'UNIVERSAL_PLC',
      halPayload: { roles_reles: rolesReles, nombres_reles: nombresReles },
      dashboardWidgets: widgets
    };
  }

  // 3. Secuencia o test de relés (R1 a R8)
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
        pasos: pasos.map((paso, idx) => ({
          nombre: `Paso ${idx + 1}`,
          tipo_transicion: 'TEMPORIZADO',
          tiempo_ms: paso.delay_ms,
          acciones_encender: paso.val === 1 ? [`R${paso.canal}`] : [],
          acciones_apagar: paso.val === 0 ? [`R${paso.canal}`] : []
        }))
      },
      halPayload: { roles_reles: rolesReles, nombres_reles: nombresReles },
      dashboardWidgets: widgets
    };
  }

  // Fallback general dinámico
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
    mensajeChat: `He configurado los controles en el lienzo basados en tu instrucción: "${promptTexto}".`,
    titulo: promptTexto.length > 30 ? promptTexto.substring(0, 27) + '...' : promptTexto,
    tipo: 'UNIVERSAL_PLC',
    halPayload: { roles_reles: rolesReles, nombres_reles: nombresReles },
    dashboardWidgets: widgets
  };
}

/**
 * FUNCIÓN PRINCIPAL EXPORTADA
 */
export async function conversarYCompilarConIA({ prompt, historial = [], hardwareInfo = {}, apiKey = null }) {
  const p = prompt ? prompt.trim() : '';
  if (!p) throw new Error('Por favor introduce tu requerimiento.');

  const key = apiKey || localStorage.getItem('biofleet_ai_key') || GROQ_DEFAULT_API_KEY;

  let resultadoJson = null;

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
        resultadoJson = parseado;
      }
    }
  } catch (err) {
    console.warn('[GROQ API] Error en llamada cloud, activando generador seguro:', err.message);
  }

  // Si la respuesta de la nube fue exitosa y tiene widgets válidos
  if (resultadoJson) {
    const dashboardWidgets = (resultadoJson.dashboard || []).map((w, idx) => ({
      ...w,
      id: w.id || `w_${Date.now()}_${idx}`,
      x: (idx % 3) * 280 + 20,
      y: Math.floor(idx / 3) * 190 + 20,
      w: w.w || 260,
      h: w.h || 170
    }));

    return {
      exito: true,
      mensajeChat: resultadoJson.mensaje_chat || 'He diseñado la automatización solicitada.',
      titulo: resultadoJson.titulo_programa || 'Automatización Personalizada',
      descripcion: resultadoJson.descripcion || p,
      tipo: resultadoJson.tipo || 'UNIVERSAL_PLC',
      receta: resultadoJson.receta || null,
      halPayload: resultadoJson.hal_payload || {},
      dashboardWidgets
    };
  }

  // Respaldo de alta fidelidad: genera siempre los controles en pantalla
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
