/**
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * SERVICIO COMPILADOR DE IA INDUSTRIAL - ESPECIALISTA EN TEMPORIZADORES Y SECUENCIAS
 * =========================================================================================
 */

const GROQ_DEFAULT_API_KEY = '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';

const SYSTEM_PROMPT_INGENIERO_SCADA = `
Eres el Ingeniero Principal de Automatización y SCADA de BioFleet OS v2.0 Enterprise.
Hardware: Controlador industrial HKL-EA8 (8 Relés R1..R8 en 0x24, 8 Entradas IN1..IN8 en 0x26, 4 ADC A0..A3 en 0x48, LCD 0x27).

TIPOS DE WIDGETS DISPONIBLES:
- 'SEQUENCE_TIMER': Temporizador de secuencia con cuenta regresiva en segundos, barra de progreso y desglose de tiempos.
- 'ACTION_BUTTON': Botón pulsador directo o disparo de receta.
- 'SWITCH_TOGGLE': Interruptor ON/OFF para conmutar un relé manual.
- 'GAUGE_RADIAL': Manómetro analógico de aguja (presión, RPM, nivel, batería).
- 'VALUE_CARD': Tarjeta de lectura digital numérica (temperatura, tiempo).
- 'STATUS_LED': LED indicador luminoso de entrada digital o estado.
- 'CHART_HISTORY': Gráfica temporal continua de telemetría.

REGLA FUNDAMENTAL PARA TEMPORIZACIONES Y RETARDOS:
Si el usuario menciona CUALQUIER tiempo ("10 segundos", "5s", "1 minuto", "temporizador", "retardo", "precalentamiento 7s y arranque 2s", "cíclico"):
1. En "receta":
   Define cada fase en "pasos" con:
   - "nombre": Nombre de la etapa (ej: "Precalentamiento", "Arranque", "Descanso", "Temporizado").
   - "tipo_transicion": "TEMPORIZADO".
   - "tiempo_ms": El valor en milisegundos (ej: 7 segundos = 7000, 10s = 10000).
   - "acciones_encender": Array de relés a activar en ese paso (ej: ["R1"]).
   - "acciones_apagar": Array de relés a desactivar en ese paso (ej: ["R1"]).
2. En "dashboard":
   - Genera OBLIGATORIAMENTE un widget de tipo 'SEQUENCE_TIMER' con:
     * "titulo": Nombre del temporizador o secuencia.
     * "accion": "EJECUTAR_RECETA".
     * "color": "amber" o "emerald".
     * "totalSegundos": Suma total de los segundos de la secuencia.
     * "pasos": Array de objetos con { "nombre": "Etapa", "tiempoMs": 7000, "canal": 1 }.
     * "w": 360, "h": 220.
   - Genera también los widgets 'SWITCH_TOGGLE' de los relés que intervienen para que el operador supervise su estado físico.

RESPONDE EXCLUSIVAMENTE CON UN OBJETO JSON VÁLIDO CON ESTA ESTRUCTURA:
{
  "mensaje_chat": "Explicación técnica de la temporización configurada",
  "titulo_programa": "Nombre del sistema",
  "tipo": "UNIVERSAL_PLC",
  "receta": {
    "nombre_receta": "Secuencia Temporizada",
    "enclavamientos": [],
    "total_pasos": 2,
    "pasos": [
      {
        "nombre": "Paso 1",
        "tipo_transicion": "TEMPORIZADO",
        "tiempo_ms": 7000,
        "acciones_encender": ["R1"],
        "acciones_apagar": []
      }
    ]
  },
  "hal_payload": {
    "roles_reles": { "R1": "TEMPORIZADO" },
    "nombres_reles": { "R1": "Relé R1" }
  },
  "dashboard": [
    {
      "id": "w_timer_1",
      "tipo": "SEQUENCE_TIMER",
      "titulo": "Temporizador R1",
      "accion": "EJECUTAR_RECETA",
      "color": "emerald",
      "totalSegundos": 7,
      "pasos": [
        { "nombre": "Fase 1", "tiempoMs": 7000, "canal": 1 }
      ],
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

/**
 * GENERADOR DE RESPALDO INDUSTRIAL ESPECIALIZADO EN TEMPORIZADORES
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

  // Extracción de tiempos numéricos (segundos o minutos)
  const regexTiempos = /(\d+)\s*(segundo|segundos|seg|s|minuto|minutos|min)/g;
  const tiemposEncontrados = [];
  let m;
  while ((m = regexTiempos.exec(p)) !== null) {
    const val = parseInt(m[1], 10);
    const u = m[2].toLowerCase();
    const segs = u.startsWith('min') ? val * 60 : val;
    tiemposEncontrados.push(segs);
  }

  // CASO A: Temporizador o Secuencia con tiempos especificados
  if (tiemposEncontrados.length > 0 || p.includes('temporizador') || p.includes('temporiza') || p.includes('secuencia')) {
    const t1 = tiemposEncontrados[0] || 7;
    const t2 = tiemposEncontrados[1] || 2;
    const t3 = tiemposEncontrados[2] || 5;

    // Detectar qué relé se mencionó
    const matchR = p.match(/\b(?:r|rele|relé)\s*([1-8])\b/) || p.match(/r([1-8])/);
    const canalBase = matchR ? parseInt(matchR[1], 10) : 1;

    let pasosReceta = [];
    let pasosWidget = [];
    let totalSegs = 0;

    if (tiemposEncontrados.length === 1) {
      // Temporizador simple: encender por t1 segundos y apagar
      totalSegs = t1;
      pasosReceta = [
        { nombre: `Activar R${canalBase}`, tipo_transicion: 'TEMPORIZADO', tiempo_ms: t1 * 1000, acciones_encender: [`R${canalBase}`], acciones_apagar: [] },
        { nombre: `Desactivar R${canalBase}`, tipo_transicion: 'INMEDIATO', tiempo_ms: 0, acciones_encender: [], acciones_apagar: [`R${canalBase}`] }
      ];
      pasosWidget = [
        { nombre: `Encendido R${canalBase}`, tiempoMs: t1 * 1000, canal: canalBase }
      ];
    } else {
      // Secuencia multi-etapa (ej: precalentamiento, crank, descanso)
      totalSegs = t1 + t2 + (tiemposEncontrados.length > 2 ? t3 : 0);
      pasosReceta = [
        { nombre: 'Fase 1 (Precalent.)', tipo_transicion: 'TEMPORIZADO', tiempo_ms: t1 * 1000, acciones_encender: ['R1'], acciones_apagar: [] },
        { nombre: 'Fase 2 (Arranque)', tipo_transicion: 'TEMPORIZADO', tiempo_ms: t2 * 1000, acciones_encender: ['R2'], acciones_apagar: ['R1'] },
        { nombre: 'Fase 3 (Descanso/Fin)', tipo_transicion: 'TEMPORIZADO', tiempo_ms: t3 * 1000, acciones_encender: [], acciones_apagar: ['R2'] }
      ];
      pasosWidget = [
        { nombre: 'Fase 1', tiempoMs: t1 * 1000, canal: 1 },
        { nombre: 'Fase 2', tiempoMs: t2 * 1000, canal: 2 },
        { nombre: 'Fase 3', tiempoMs: t3 * 1000, canal: 2 }
      ];
    }

    widgets.push({
      id: 'w_seq_timer',
      tipo: 'SEQUENCE_TIMER',
      titulo: `Temporizador ${canalBase ? 'R' + canalBase : 'Industrial'} (${totalSegs}s)`,
      accion: 'EJECUTAR_RECETA',
      color: 'amber',
      totalSegundos: totalSegs,
      pasos: pasosWidget,
      w: 360,
      h: 220
    });

    // Agregar interruptores de supervisión
    widgets.push({
      id: `w_sw_supervision_${canalBase}`,
      tipo: 'SWITCH_TOGGLE',
      titulo: `Supervisión Relé R${canalBase}`,
      canal: canalBase,
      color: 'cyan',
      w: 260,
      h: 170
    });

    return {
      exito: true,
      mensajeChat: `He configurado el Temporizador Industrial con una duración programada de ${totalSegs} segundos. Puedes ver la cuenta regresiva y la barra de progreso en el nuevo widget del lienzo.`,
      titulo: `Temporizador Secuencial (${totalSegs}s)`,
      tipo: 'UNIVERSAL_PLC',
      receta: {
        nombre_receta: `Temporizador ${totalSegs}s`,
        enclavamientos: [],
        total_pasos: pasosReceta.length,
        pasos: pasosReceta
      },
      halPayload: { roles_reles: rolesReles, nombres_reles: nombresReles },
      dashboardWidgets: widgets
    };
  }

  // CASO B: Relé individual simple
  const matchSimple = p.match(/\b(?:r|rele|relé)\s*([1-8])\b/) || p.match(/^r([1-8])$/);
  if (matchSimple) {
    const num = parseInt(matchSimple[1], 10);
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

    return {
      exito: true,
      mensajeChat: `He colocado el interruptor manual para R${num}. Si deseas que se apague automáticamente, especifícame el tiempo (ejemplo: "prende R${num} por 10 segundos").`,
      titulo: `Control Canal R${num}`,
      tipo: 'UNIVERSAL_PLC',
      halPayload: { roles_reles: rolesReles, nombres_reles: nombresReles },
      dashboardWidgets: widgets
    };
  }

  // Fallback estándar
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
    mensajeChat: `He configurado los controles para "${promptTexto}". Puedes pedirme secuencias temporizadas indicándome los segundos o minutos deseados.`,
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
    console.warn('[GROQ API] Error en llamada cloud, activando generador local:', err.message);
  }

  // Si Groq entregó la arquitectura temporizada
  if (resultadoJson) {
    const dashboardWidgets = (resultadoJson.dashboard || []).map((w, idx) => ({
      ...w,
      id: w.id || `w_${Date.now()}_${idx}`,
      x: (idx % 3) * 280 + 20,
      y: Math.floor(idx / 3) * 190 + 20,
      w: w.w || (w.tipo === 'SEQUENCE_TIMER' ? 360 : 260),
      h: w.h || (w.tipo === 'SEQUENCE_TIMER' ? 220 : 170)
    }));

    return {
      exito: true,
      mensajeChat: resultadoJson.mensaje_chat || 'He diseñado la temporización solicitada.',
      titulo: resultadoJson.titulo_programa || 'Automatización Temporizada',
      descripcion: resultadoJson.descripcion || p,
      tipo: resultadoJson.tipo || 'UNIVERSAL_PLC',
      receta: resultadoJson.receta || null,
      halPayload: resultadoJson.hal_payload || {},
      dashboardWidgets
    };
  }

  // Respaldo de alta fidelidad
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
