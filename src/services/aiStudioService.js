/**
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * SERVICIO COMPILADOR DE IA HÍBRIDO ULTRA-RESILIENTE (GEMINI / GEMMA / MOTOR INMEDIATO)
 * =========================================================================================
 */

const BIOFLEET_SYSTEM_PROMPT = `
Eres el Ingeniero de Control Industrial de BioFleet OS v2.0.
Hardware: HKL-EA8 (8 Relés R1..R8 en 0x24, 8 Entradas IN1..IN8 en 0x26, 4 ADC A0..A3 en 0x48).
Genera un objeto JSON válido con la siguiente estructura:
{
  "titulo_programa": "Nombre representativo",
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
 * Extractor seguro de JSON
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
    try {
      return JSON.parse(limpio.substring(inicio, fin + 1));
    } catch (_) {
      return null;
    }
  }
  return null;
}

/**
 * COMPILADOR DETERMINISTA LOCAL (Responde en <10ms sin fallos ni esperas)
 */
function compilarLocalmente(promptTexto) {
  const p = promptTexto.toLowerCase().trim();
  const widgets = [];
  const nombresReles = {};
  const rolesReles = {};

  for (let i = 1; i <= 8; i++) {
    nombresReles[`R${i}`] = `Salida Relé R${i}`;
    rolesReles[`R${i}`] = 'MANUAL';
  }

  // 1. CASO: Test de relés (R1 a R8)
  if (p.includes('test') || p.includes('teste') || (p.includes('r1') && p.includes('r8'))) {
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
      fuente: 'MOTOR_BIOFLEET_LOCAL',
      titulo: 'Banco de Prueba Relés R1-R8',
      descripcion: 'Generado para testeo completo de las 8 salidas físicas.',
      halPayload: { tipo: 'UNIVERSAL_PLC', roles_reles: rolesReles, nombres_reles: nombresReles },
      dashboardWidgets: widgets
    };
  }

  // 2. CASO: Relé específico individual (ej: "r1", "r2", etc.)
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
      fuente: 'MOTOR_BIOFLEET_LOCAL',
      titulo: `Control Canal R${canalNum}`,
      descripcion: `Comandos para salida R${canalNum}.`,
      halPayload: { tipo: 'UNIVERSAL_PLC', roles_reles: rolesReles, nombres_reles: nombresReles },
      dashboardWidgets: widgets
    };
  }

  // 3. CASO GENERAL: Parseo de actuadores y sensores en texto libre
  const actuadores = [
    { k: ['bomba', 'motobomba'], t: 'SWITCH_TOGGLE', n: 'Bomba de Agua', c: 'cyan' },
    { k: ['valvula', 'válvula'], t: 'SWITCH_TOGGLE', n: 'Electroválvula', c: 'cyan' },
    { k: ['calentador', 'resistencia', 'macerador'], t: 'SWITCH_TOGGLE', n: 'Calentador', c: 'amber' },
    { k: ['extractor', 'ventilador'], t: 'SWITCH_TOGGLE', n: 'Extractor', c: 'cyan' },
    { k: ['ignicion', 'ignición', 'contacto'], t: 'SWITCH_TOGGLE', n: 'Ignición', c: 'amber' },
    { k: ['starter', 'arranque'], t: 'ACTION_BUTTON', n: 'Starter Motor', c: 'emerald' },
    { k: ['temperatura', 'pt100'], t: 'VALUE_CARD', n: 'Sensor Temperatura', u: '°C', c: 'cyan' },
    { k: ['presion', 'presión', 'bar'], t: 'GAUGE_RADIAL', n: 'Presión', u: 'bar', c: 'pink' }
  ];

  let canalContador = 1;
  actuadores.forEach((act) => {
    if (act.k.some(kw => p.includes(kw))) {
      widgets.push({
        id: `w_act_${canalContador}`,
        tipo: act.t,
        titulo: act.n,
        canal: canalContador <= 8 ? canalContador : 1,
        unidad: act.u || '',
        color: act.c,
        w: 260,
        h: 170
      });
      if (canalContador <= 8) {
        nombresReles[`R${canalContador}`] = act.n;
        canalContador++;
      }
    }
  });

  if (widgets.length === 0) {
    widgets.push({
      id: 'w_cmd_1',
      tipo: 'ACTION_BUTTON',
      titulo: promptTexto.length > 25 ? promptTexto.substring(0, 22) + '...' : promptTexto,
      canal: 1,
      color: 'emerald',
      w: 280,
      h: 170
    });
    widgets.push({
      id: 'w_cmd_2',
      tipo: 'SWITCH_TOGGLE',
      titulo: 'Salida R1',
      canal: 1,
      color: 'cyan',
      w: 260,
      h: 170
    });
  }

  return {
    exito: true,
    fuente: 'MOTOR_BIOFLEET_LOCAL',
    titulo: promptTexto.length > 25 ? promptTexto.substring(0, 22) + '...' : promptTexto,
    descripcion: `Compilación generada para: "${promptTexto}"`,
    halPayload: { tipo: 'UNIVERSAL_PLC', roles_reles: rolesReles, nombres_reles: nombresReles },
    dashboardWidgets: widgets
  };
}

/**
 * CONSULTA A LA NUBE CON TIMEOUT DE 3.5 SEGUNDOS (ABORT CONTROLLER)
 */
async function consultarNubeConTimeout(apiKey, promptTexto, hardwareInfo) {
  const controlador = new AbortController();
  const idTimeout = setTimeout(() => controlador.abort(), 3500);

  const modelos = ['gemma-4-26b-a4b-it', 'gemini-2.0-flash', 'gemini-1.5-flash-latest'];

  for (const model of modelos) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const promptCompleto = `${BIOFLEET_SYSTEM_PROMPT}\nHardware: ${JSON.stringify(hardwareInfo || {})}\nOrden: "${promptTexto}"\nIMPORTANTE: Devuelve únicamente un JSON válido delimitado por { y }.`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptCompleto }] }],
          generationConfig: { temperature: 0.1 }
        }),
        signal: controlador.signal
      });

      if (response.ok) {
        clearTimeout(idTimeout);
        const data = await response.json();
        const textoRespuesta = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        const parseado = sanitizarJson(textoRespuesta);
        if (parseado && parseado.dashboard) {
          return parseado;
        }
      }
    } catch (_) {
      // Si falla un modelo o se agota el tiempo, continúa
    }
  }

  clearTimeout(idTimeout);
  return null;
}

/**
 * FUNCIÓN EXPORTADA PRINCIPAL (NUNCA LANZA ERROR, SIEMPRE GENERA WIDGETS)
 */
export async function compilarConIA({ prompt, device, hardwareInfo, apiKey = null }) {
  const p = prompt ? prompt.trim() : '';
  if (!p) throw new Error('El prompt no puede estar vacío.');

  const key = apiKey || localStorage.getItem('biofleet_ai_key') || null;

  // 1. Si hay clave, intenta obtener respuesta de la nube en menos de 3.5 segundos
  if (key) {
    try {
      const resultadoNube = await consultarNubeConTimeout(key, p, hardwareInfo);
      if (resultadoNube) {
        const dashboardWidgets = (resultadoNube.dashboard || []).map((w, idx) => ({
          ...w,
          id: w.id || `w_${idx + 1}`,
          x: w.x !== undefined ? w.x : (idx % 3) * 280 + 20,
          y: w.y !== undefined ? w.y : Math.floor(idx / 3) * 190 + 20,
          w: w.w || 260,
          h: w.h || 170
        }));

        return {
          exito: true,
          fuente: 'IA_NUBE_GEMINI',
          titulo: resultadoNube.titulo_programa || p,
          descripcion: resultadoNube.descripcion || p,
          halPayload: resultadoNube.hal_payload || {},
          dashboardWidgets
        };
      }
    } catch (_) {}
  }

  // 2. Respaldo local inmediato: genera los componentes sin latencia
  const local = compilarLocalmente(p);
  const widgetsConPosicion = local.dashboardWidgets.map((w, idx) => ({
    ...w,
    x: (idx % 3) * 280 + 20,
    y: Math.floor(idx / 3) * 190 + 20
  }));

  return {
    ...local,
    dashboardWidgets: widgetsConPosicion
  };
}
