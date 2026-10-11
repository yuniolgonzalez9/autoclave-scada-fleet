/**
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * SERVICIO COMPILADOR DE IA RESILIENTE - GEMINI / GEMMA / FALLBACK INMEDIATO
 * =========================================================================================
 */

const BIOFLEET_SYSTEM_PROMPT = `
Eres el Ingeniero de Control Industrial de BioFleet OS v2.0.
Hardware disponible: HKL-EA8 (8 Relés R1..R8 en I2C 0x24, 8 Entradas IN1..IN8 en 0x26, 4 ADC A0..A3 en 0x48).
Genera un JSON con este formato exacto:
{
  "titulo_programa": "Nombre del sistema",
  "descripcion": "Descripción del sistema",
  "tipo": "UNIVERSAL_PLC",
  "hal_payload": {
    "roles_reles": { "R1": "SALIDA_1", "R2": "SALIDA_2", "R3": "SALIDA_3", "R4": "SALIDA_4", "R5": "SALIDA_5", "R6": "SALIDA_6", "R7": "SALIDA_7", "R8": "SALIDA_8" },
    "nombres_reles": { "R1": "Relé 1", "R2": "Relé 2", "R3": "Relé 3", "R4": "Relé 4", "R5": "Relé 5", "R6": "Relé 6", "R7": "Relé 7", "R8": "Relé 8" }
  },
  "dashboard": [
    { "id": "w_1", "tipo": "ACTION_BUTTON", "titulo": "Test R1-R8", "canal": 1, "color": "emerald", "w": 360, "h": 170 }
  ]
}
`;

export function detectarProveedorApiKey(key = '') {
  const k = key.trim();
  if (k.startsWith('AIza') || k.startsWith('AQ.')) return 'GEMINI';
  if (k.startsWith('gsk_')) return 'GROQ';
  if (k.startsWith('sk-')) return 'OPENAI';
  return 'GEMINI';
}

/**
 * Extractor seguro de JSON que ignora texto conversacional ("Automation...", markdown, etc.)
 */
function sanitizarJson(textoCrudo) {
  if (!textoCrudo) return null;
  let limpio = textoCrudo.trim();

  if (limpio.includes('```')) {
    limpio = limpio.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  }

  const inicio = limpio.indexOf('{');
  const fin = limpio.lastIndexOf('}');

  if (inicio !== -1 && fin !== -1 && fin > inicio) {
    const bloque = limpio.substring(inicio, fin + 1);
    try {
      return JSON.parse(bloque);
    } catch (_) {
      return null;
    }
  }
  return null;
}

/**
 * MOTOR DINÁMICO DE RESPALDO (Garantiza respuesta inmediata si el LLM falla)
 */
function generarRespaldoInmediato(promptTexto) {
  const p = promptTexto.toLowerCase().trim();
  const widgets = [];
  const nombresReles = {};
  const rolesReles = {};

  for (let i = 1; i <= 8; i++) {
    nombresReles[`R${i}`] = `Salida R${i}`;
    rolesReles[`R${i}`] = 'MANUAL';
  }

  // CASO: Test de relés (R1 a R8)
  if (p.includes('test') || p.includes('teste') || (p.includes('r1') && p.includes('r8'))) {
    widgets.push({
      id: 'w_test_master',
      tipo: 'ACTION_BUTTON',
      titulo: '⚡ Test Secuencial (R1 a R8)',
      canal: 1,
      color: 'emerald',
      w: 360,
      h: 170
    });

    for (let i = 1; i <= 8; i++) {
      nombresReles[`R${i}`] = `Relé Test R${i}`;
      widgets.push({
        id: `w_relay_${i}`,
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
      fuente: 'MOTOR_DINAMICO',
      titulo: 'Banco de Prueba Relés R1-R8',
      descripcion: 'Control y test secuencial para los 8 canales de relé.',
      halPayload: { tipo: 'UNIVERSAL_PLC', roles_reles: rolesReles, nombres_reles: nombresReles },
      dashboardWidgets: widgets
    };
  }

  // CASO: Relé específico individual (ej: "r1", "r2", etc.)
  const matchRele = p.match(/r([1-8])/);
  if (matchRele) {
    const canalNum = parseInt(matchRele[1], 10);
    nombresReles[`R${canalNum}`] = `Salida R${canalNum} Activa`;
    
    widgets.push({
      id: `w_btn_r${canalNum}`,
      tipo: 'ACTION_BUTTON',
      titulo: `Pulsar Relé R${canalNum}`,
      canal: canalNum,
      color: 'emerald',
      w: 280,
      h: 170
    });
    widgets.push({
      id: `w_sw_r${canalNum}`,
      tipo: 'SWITCH_TOGGLE',
      titulo: `Estado Relé R${canalNum}`,
      canal: canalNum,
      color: 'cyan',
      w: 280,
      h: 170
    });

    return {
      exito: true,
      fuente: 'MOTOR_DINAMICO',
      titulo: `Control Específico Relé R${canalNum}`,
      descripcion: `Comandos y switch para el canal R${canalNum}.`,
      halPayload: { tipo: 'UNIVERSAL_PLC', roles_reles: rolesReles, nombres_reles: nombresReles },
      dashboardWidgets: widgets
    };
  }

  // CASO GENERAL: Parseo dinámico de cualquier otra orden
  const partes = promptTexto.split(/[,;\n]+/).filter(Boolean);
  partes.slice(0, 4).forEach((txt, idx) => {
    const canal = idx + 1;
    nombresReles[`R${canal}`] = txt.trim();
    widgets.push({
      id: `w_dyn_${canal}`,
      tipo: canal === 1 ? 'ACTION_BUTTON' : 'SWITCH_TOGGLE',
      titulo: txt.trim(),
      canal,
      color: idx === 0 ? 'emerald' : 'cyan',
      w: 260,
      h: 170
    });
  });

  if (widgets.length === 0) {
    widgets.push({
      id: 'w_default_1',
      tipo: 'ACTION_BUTTON',
      titulo: promptTexto.length > 25 ? promptTexto.substring(0, 22) + '...' : promptTexto,
      canal: 1,
      color: 'cyan',
      w: 280,
      h: 170
    });
  }

  return {
    exito: true,
    fuente: 'MOTOR_DINAMICO',
    titulo: promptTexto.length > 30 ? promptTexto.substring(0, 27) + '...' : promptTexto,
    descripcion: `Sistema generado a partir de: "${promptTexto}"`,
    halPayload: { tipo: 'UNIVERSAL_PLC', roles_reles: rolesReles, nombres_reles: nombresReles },
    dashboardWidgets: widgets
  };
}

/**
 * CONSULTA A LA API DE GOOGLE CON MANEJO DE GEMMA Y GEMINI
 */
async function invocarGeminiSeguro(apiKey, promptTexto, hardwareInfo) {
  // Lista de modelos detectados en tu proyecto (incluyendo Gemma)
  const modelosAProbar = [
    'gemma-4-26b-a4b-it',
    'gemma-2-27b-it',
    'gemini-2.0-flash',
    'gemini-1.5-flash-latest'
  ];

  for (const model of modelosAProbar) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const promptCompleto = `${BIOFLEET_SYSTEM_PROMPT}\nHardware: ${JSON.stringify(hardwareInfo || {})}\nOrden del usuario: "${promptTexto}"\nDevuelve únicamente el objeto JSON iniciando con { y terminando con }.`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptCompleto }] }],
          generationConfig: { temperature: 0.1 }
        })
      });

      if (response.ok) {
        const data = await response.json();
        const textoRespuesta = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        const jsonParseado = sanitizarJson(textoRespuesta);

        if (jsonParseado && jsonParseado.dashboard) {
          console.log(`✅ [BIOFLEET AI] Compilación completada con el modelo: ${model}`);
          return jsonParseado;
        }
      }
    } catch (_) {
      // Si el modelo específico falla, continúa con el siguiente candidato
    }
  }

  return null;
}

/**
 * FUNCIÓN EXPORTADA PRINCIPAL
 */
export async function compilarConIA({ prompt, device, hardwareInfo, apiKey = null }) {
  const p = prompt ? prompt.trim() : '';
  if (!p) throw new Error('El prompt no puede estar vacío.');

  const key = apiKey || localStorage.getItem('biofleet_ai_key') || null;

  // 1. Intentar con la API de Google si la key existe
  if (key) {
    try {
      const resultadoLLM = await invocarGeminiSeguro(key, p, hardwareInfo);
      if (resultadoLLM) {
        const dashboardWidgets = (resultadoLLM.dashboard || []).map((w, idx) => ({
          ...w,
          id: w.id || `w_${idx + 1}`,
          x: w.x !== undefined ? w.x : (idx % 3) * 280 + 20,
          y: w.y !== undefined ? w.y : Math.floor(idx / 3) * 190 + 20,
          w: w.w || 260,
          h: w.h || 170
        }));

        return {
          exito: true,
          fuente: 'IA_NUBE',
          titulo: resultadoLLM.titulo_programa || p,
          descripcion: resultadoLLM.descripcion || p,
          halPayload: resultadoLLM.hal_payload || {},
          dashboardWidgets
        };
      }
    } catch (e) {
      console.warn('[BIOFLEET AI] Consulta en la nube no concluyente, ejecutando respaldo dinámico:', e);
    }
  }

  // 2. Si la nube no entrega un JSON válido, el motor de respaldo procesa la orden de inmediato
  const respaldo = generarRespaldoInmediato(p);
  const widgetsConPosicion = respaldo.dashboardWidgets.map((w, idx) => ({
    ...w,
    x: (idx % 3) * 280 + 20,
    y: Math.floor(idx / 3) * 190 + 20
  }));

  return {
    ...respaldo,
    dashboardWidgets: widgetsConPosicion
  };
}
