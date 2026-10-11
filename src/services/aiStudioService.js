/**
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * SERVICIO COMPILADOR DE IA INDUSTRIAL - MOTOR DETERMINISTA LOCAL + SOPORTE CLOUD
 * =========================================================================================
 */

export function detectarProveedorApiKey(key = '') {
  const k = key.trim();
  if (k.startsWith('gsk_')) return 'GROQ';
  if (k.startsWith('sk-')) return 'OPENAI';
  if (k.startsWith('AIza') || k.startsWith('AQ.')) return 'GEMINI';
  return 'LOCAL';
}

/**
 * MOTOR SEMÁNTICO LOCAL DETERMINISTA
 * Procesa instantáneamente cualquier instrucción sin depender de servidores externos.
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

  // CASO 1: Test de relés (R1 a R8)
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
        w: 260,
        h: 170
      });
    }

    return {
      exito: true,
      fuente: 'MOTOR_BIOFLEET_DETERMINISTA',
      titulo: 'Banco de Prueba Relés R1-R8',
      descripcion: 'Control maestro de testeo secuencial para las 8 salidas físicas.',
      tipo: 'UNIVERSAL_PLC',
      halPayload: { tipo: 'UNIVERSAL_PLC', roles_reles: rolesReles, nombres_reles: nombresReles },
      dashboardWidgets: widgets
    };
  }

  // CASO 2: Relé específico individual (ej: "r1", "r2", etc.)
  const matchRele = p.match(/\b(?:r|rele|relé)\s*([1-8])\b/) || p.match(/^r([1-8])$/);
  if (matchRele) {
    const canalNum = parseInt(matchRele[1], 10);
    nombresReles[`R${canalNum}`] = `Salida R${canalNum} Activa`;
    
    widgets.push({
      id: `w_sw_r${canalNum}`,
      tipo: 'SWITCH_TOGGLE',
      titulo: `Estado Relé R${canalNum}`,
      canal: canalNum,
      color: 'cyan',
      w: 280,
      h: 170
    });
    widgets.push({
      id: `w_btn_r${canalNum}`,
      tipo: 'ACTION_BUTTON',
      titulo: `Pulsar Relé R${canalNum}`,
      canal: canalNum,
      color: 'emerald',
      w: 280,
      h: 170
    });

    return {
      exito: true,
      fuente: 'MOTOR_BIOFLEET_DETERMINISTA',
      titulo: `Control Canal R${canalNum}`,
      descripcion: `Mando y conmutación directa para la salida física R${canalNum}.`,
      tipo: 'UNIVERSAL_PLC',
      halPayload: { tipo: 'UNIVERSAL_PLC', roles_reles: rolesReles, nombres_reles: nombresReles },
      dashboardWidgets: widgets
    };
  }

  // CASO 3: Detección semántica de actuadores, motores y sensores
  const DICCIONARIO = [
    { k: ['bomba', 'motobomba', 'recirculado'], t: 'SWITCH_TOGGLE', n: 'Bomba Principal', c: 'cyan', rol: 'BOMBA' },
    { k: ['valvula', 'válvula', 'solenoide'], t: 'SWITCH_TOGGLE', n: 'Electroválvula', c: 'cyan', rol: 'VALVULA' },
    { k: ['calentador', 'resistencia', 'macerador', 'quemador'], t: 'SWITCH_TOGGLE', n: 'Calentador / Resistencia', c: 'amber', rol: 'CALENTADOR' },
    { k: ['extractor', 'ventilador', 'fan'], t: 'SWITCH_TOGGLE', n: 'Extractor de Aire', c: 'cyan', rol: 'EXTRACTOR' },
    { k: ['ignicion', 'ignición', 'contacto', 'acc'], t: 'SWITCH_TOGGLE', n: 'Contacto Ignición', c: 'amber', rol: 'IGNICION_ON' },
    { k: ['starter', 'arranque', 'marcha'], t: 'ACTION_BUTTON', n: 'Motor de Arranque', c: 'emerald', rol: 'STARTER_MOTOR' },
    { k: ['corte', 'inmovilizador', 'paro', 'stop'], t: 'ACTION_BUTTON', n: 'Corte Inmovilizador', c: 'rose', rol: 'INMOVILIZADOR' },
    { k: ['temperatura', 'pt100', 'termometro', 'termómetro'], t: 'VALUE_CARD', n: 'Temperatura', u: '°C', c: 'cyan', rol: 'ADC_TEMP' },
    { k: ['presion', 'presión', 'bar', 'psi'], t: 'GAUGE_RADIAL', n: 'Presión de Trabajo', u: 'bar', c: 'pink', rol: 'ADC_PRESION' },
    { k: ['bateria', 'batería', 'voltaje', '12v'], t: 'GAUGE_RADIAL', n: 'Batería 12V', u: 'V', c: 'emerald', rol: 'ADC_BAT' }
  ];

  let canalContador = 1;
  DICCIONARIO.forEach(item => {
    if (item.k.some(palabra => p.includes(palabra))) {
      widgets.push({
        id: `w_cmp_${canalContador}`,
        tipo: item.t,
        titulo: item.n,
        canal: canalContador <= 8 ? canalContador : 1,
        unidad: item.u || '',
        color: item.c,
        min: 0,
        max: item.u === 'bar' ? 10 : item.u === 'V' ? 16 : 100,
        w: 260,
        h: 170
      });
      if (canalContador <= 8) {
        nombresReles[`R${canalContador}`] = item.n;
        rolesReles[`R${canalContador}`] = item.rol;
        canalContador++;
      }
    }
  });

  // Si no se reconoció ningún componente clave, generar controles genéricos basados en el texto
  if (widgets.length === 0) {
    widgets.push({
      id: 'w_cmd_auto',
      tipo: 'ACTION_BUTTON',
      titulo: promptTexto.length > 25 ? promptTexto.substring(0, 22) + '...' : promptTexto,
      canal: 1,
      color: 'emerald',
      w: 300,
      h: 170
    });
    widgets.push({
      id: 'w_sw_auto',
      tipo: 'SWITCH_TOGGLE',
      titulo: 'Salida R1 Activa',
      canal: 1,
      color: 'cyan',
      w: 260,
      h: 170
    });
  }

  let tipoDetectado = 'UNIVERSAL_PLC';
  if (p.includes('carro') || p.includes('ambulancia') || p.includes('vehiculo') || p.includes('motor')) {
    tipoDetectado = 'VEHICULO';
  } else if (p.includes('autoclave') || p.includes('esteriliz')) {
    tipoDetectado = 'AUTOCLAVE';
  }

  return {
    exito: true,
    fuente: 'MOTOR_BIOFLEET_DETERMINISTA',
    titulo: promptTexto.length > 30 ? promptTexto.substring(0, 27) + '...' : promptTexto,
    descripcion: `Compilación generada para: "${promptTexto}"`,
    tipo: tipoDetectado,
    halPayload: { tipo: tipoDetectado, roles_reles: rolesReles, nombres_reles: nombresReles },
    dashboardWidgets: widgets
  };
}

/**
 * FUNCIÓN PRINCIPAL EXPORTADA
 * Procesa la orden sin bloqueos, garantizando siempre la entrega de los widgets.
 */
export async function compilarConIA({ prompt, device, hardwareInfo, apiKey = null }) {
  const p = prompt ? prompt.trim() : '';
  if (!p) throw new Error('Por favor escribe qué automatización deseas compilar.');

  const key = apiKey || localStorage.getItem('biofleet_ai_key') || null;
  const proveedor = key ? detectarProveedorApiKey(key) : 'LOCAL';

  // Si se utiliza Groq u OpenAI con credenciales estándar, consultar el endpoint
  if (key && (proveedor === 'GROQ' || proveedor === 'OPENAI')) {
    const endpoint = proveedor === 'GROQ' 
      ? 'https://api.groq.com/openai/v1/chat/completions' 
      : 'https://api.openai.com/v1/chat/completions';
    const model = proveedor === 'GROQ' ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'Genera un JSON con {"titulo_programa":"","tipo":"UNIVERSAL_PLC","hal_payload":{},"dashboard":[]}' },
            { role: 'user', content: p }
          ],
          response_format: { type: 'json_object' }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (resp.ok) {
        const data = await resp.json();
        const json = JSON.parse(data.choices[0].message.content);
        if (json && json.dashboard && json.dashboard.length > 0) {
          return {
            exito: true,
            fuente: `LLM_${proveedor}`,
            titulo: json.titulo_programa || p,
            descripcion: json.descripcion || p,
            halPayload: json.hal_payload || {},
            dashboardWidgets: json.dashboard.map((w, idx) => ({
              ...w,
              id: w.id || `w_${idx + 1}`,
              x: (idx % 3) * 280 + 20,
              y: Math.floor(idx / 3) * 190 + 20,
              w: w.w || 260,
              h: w.h || 170
            }))
          };
        }
      }
    } catch (_) {}
  }

  // Generación local inmediata: procesa la instrucción y posiciona los widgets
  const compilado = compilarLocalmente(p);
  const widgetsConCoordenadas = compilado.dashboardWidgets.map((w, idx) => ({
    ...w,
    x: (idx % 3) * 280 + 20,
    y: Math.floor(idx / 3) * 190 + 20
  }));

  return {
    ...compilado,
    dashboardWidgets: widgetsConCoordenadas
  };
}
