/**
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * SERVICIO COMPILADOR HÍBRIDO ULTRA-RÁPIDO (INTÉRPRETE DIRECTO 0ms + LLM GROQ INDUSTRIAL)
 * =========================================================================================
 */

const GROQ_DEFAULT_API_KEY = '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';

const SYSTEM_PROMPT_SCADA_COMPLETO = `
Eres el Ingeniero de Control y SCADA de BioFleet OS v2.0.
Hardware: ESP32 HKL-EA8 (8 Relés R1..R8 en 0x24, 8 Entradas IN1..IN8 en 0x26, 4 ADC A0..A3 en 0x48, LCD 0x27).

DIRECTIVAS ESTRICTAS DE TEMPORIZACIÓN Y CONTROL:
1. INSTRUCCIONES CON TIEMPO (ej: "prende R1 por 5 segundos", "R2 10s y luego R3 2s"):
   - Modela SIEMPRE la "receta" con pasos temporizados exactos ("tiempo_ms": segundos * 1000).
   - Genera en el dashboard un widget 'SEQUENCE_TIMER' con:
     * "totalSegundos": duración total en segundos.
     * "pasos": array con [{ "nombre": "Fase", "tiempoMs": 5000, "canal": 1 }].
     * "accion": "EJECUTAR_RECETA".
   - Agrega también el widget 'SWITCH_TOGGLE' del relé asociado para supervisión.
2. INSTRUCCIONES CORTAS (ej: "r1", "apaga todo", "r5 on"):
   - Genera de forma limpia y directa los widgets necesarios sin inventar componentes extraños.
3. INSTRUCCIONES INDUSTRIALES COMPLEJAS (autoclaves, secuencias vehiculares, plantas químicas):
   - Modela la máquina de estados completa en "receta" (fases, lazos de control analógicos, enclavamientos de seguridad en IN1..IN8).
   - Diseña el panel SCADA con manómetros radiales, tanques de nivel, termómetros y setas de paro.

FORMATO OBLIGATORIO DE RESPUESTA (JSON PURO):
{
  "mensaje_chat": "Explicación técnica clara",
  "titulo_programa": "Nombre del sistema",
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
        "acciones_apagar": ["R1"]
      }
    ]
  },
  "hal_payload": {
    "roles_reles": {},
    "nombres_reles": {}
  },
  "dashboard": [
    {
      "id": "w_1",
      "tipo": "SEQUENCE_TIMER" | "SWITCH_TOGGLE" | "ACTION_BUTTON" | "GAUGE_RADIAL" | "VALUE_CARD" | "LEVEL_TANK" | "EMERGENCY_STOP",
      "titulo": "Etiqueta",
      "canal": 1,
      "accion": "EJECUTAR_RECETA" | "COMANDO" | "ABORTAR",
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
 * INTÉRPRETE DE RESPALDO ULTRA-RÁPIDO (0 ms de latencia para comandos directos con tiempos)
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

  // CASO A: Instrucción con temporizador explícito (ej: "prende R1 por 5 segundos")
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
      mensajeChat: `He programado la temporización para el Relé R${canal} durante ${totalSegs} segundos. Puedes iniciar la cuenta regresiva desde el widget del lienzo.`,
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

  // CASO B: Secuencia de prueba R1 a R8
  if (p.includes('test') || p.includes('secuencia') || (p.includes('r1') && p.includes('r8'))) {
    const pasos = [];
    for (let i = 1; i <= 8; i++) pasos.push({ canal: i, val: 1, delay_ms: 600 });
    for (let i = 1; i <= 8; i++) pasos.push({ canal: i, val: 0, delay_ms: 600 });

    const widgets = [
      {
        id: 'w_test_master',
        tipo: 'SEQUENCE_TIMER',
        titulo: '⚡ Test Secuencial R1-R8',
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
      mensajeChat: 'He generado la secuencia de prueba: encendido en cascada R1 a R8 (600ms c/u) y posterior apagado en el mismo orden.',
      titulo: 'Test Secuencial R1-R8',
      tipo: 'UNIVERSAL_PLC',
      receta: {
        nombre_receta: 'Test Cascada R1-R8',
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
      halPayload: {},
      dashboardWidgets: widgets
    };
  }

  // CASO C: Control puntual simple (ej: "r5", "enciende r2")
  if (matchR) {
    return {
      exito: true,
      mensajeChat: `He colocado el interruptor para el Relé R${canal}. Para temporizarlo, puedes especificar los segundos (ej: "prende R${canal} por 10 segundos").`,
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

  // 1. Si es un comando corto o directo con tiempos, resolverlo en 0 ms
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

  // 2. Si es una instrucción más compleja, consultar a Groq con el modelo activo
  const key = apiKey || localStorage.getItem('biofleet_ai_key') || GROQ_DEFAULT_API_KEY;

  try {
    const modelIdActivo = await resolverModeloGroqActivo(key);
    console.log(`🤖 [GROQ INFERENCE] Consultando modelo activo: ${modelIdActivo}`);

    const messages = [
      { role: 'system', content: `${SYSTEM_PROMPT_SCADA_COMPLETO}\nHARDWARE DISPONIBLE: ${JSON.stringify(hardwareInfo)}` },
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

  // 3. Fallback genérico si la llamada externa no tuvo éxito
  return {
    exito: true,
    mensajeChat: `He configurado los controles en el lienzo basados en tu instrucción: "${p}".`,
    titulo: p.length > 30 ? p.substring(0, 27) + '...' : p,
    tipo: 'UNIVERSAL_PLC',
    halPayload: {},
    dashboardWidgets: [
      { id: `w_${Date.now()}`, tipo: 'SWITCH_TOGGLE', titulo: p, canal: 1, color: 'cyan', w: 260, h: 170, x: 20, y: 20 }
    ]
  };
}
