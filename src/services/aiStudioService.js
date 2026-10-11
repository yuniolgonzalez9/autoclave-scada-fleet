/**
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * SERVICIO COMPILADOR DE INTELIGENCIA ARTIFICIAL & ANALIZADOR SEMÁNTICO UNIVERSAL
 * 
 * Capacidad:
 * 1. Interpreta libremente cualquier máquina industrial o vehicular (sin plantillas fijas).
 * 2. Extrae actuadores (relés R1..R8), sensores (IN1..IN8, ADC A0..A3) y tiempos en segundos/ms.
 * 3. Si hay API Key (OpenAI / Groq), consulta el LLM. Si no hay key, corre el Motor de
 *    Procesamiento Semántico Dinámico (DSP) que construye widgets según las palabras reales.
 * =========================================================================================
 */

const BIOFLEET_SYSTEM_PROMPT = `
Eres el Compilador de Ingeniería y Copilot de Automatización Industrial de BioFleet OS v2.0.
Hardware disponible:
- 8 Relés de Salida: R1 a R8 (Chip I2C 0x24)
- 8 Entradas Optocopladas: IN1 a IN8 (Chip I2C 0x26)
- 4 Canales ADC: A0 a A3 (Chip I2C 0x48)
- Tipos de Widgets: 'ACTION_BUTTON', 'SWITCH_TOGGLE', 'GAUGE_RADIAL', 'VALUE_CARD', 'STATUS_LED', 'TEXT_STATUS', 'CHART_HISTORY'

Instrucción obligatoria:
Analiza el texto del usuario y genera un sistema de automatización único que refleje exactamente lo que pidió.
Responde ÚNICAMENTE con un JSON con la siguiente estructura:
{
  "titulo_programa": "Nombre representativo del sistema",
  "descripcion": "Resumen técnico de la lógica configurada",
  "tipo": "VEHICULO" | "AUTOCLAVE" | "UNIVERSAL_PLC",
  "hal_payload": {
    "roles_reles": { "R1": "...", "R2": "...", ... },
    "nombres_reles": { "R1": "...", "R2": "...", ... },
    "roles_entradas": { "IN1": "...", ... },
    "nombres_entradas": { "IN1": "...", ... }
  },
  "dashboard": [
    {
      "id": "w_1",
      "tipo": "ACTION_BUTTON" | "SWITCH_TOGGLE" | "GAUGE_RADIAL" | "VALUE_CARD" | "STATUS_LED" | "TEXT_STATUS" | "CHART_HISTORY",
      "titulo": "Nombre del control",
      "canal": 1,
      "color": "cyan" | "emerald" | "amber" | "rose" | "purple",
      "unidad": "bar" | "°C" | "V" | "RPM" | "%",
      "min": 0,
      "max": 100,
      "colSpan": 1
    }
  ]
}
`;

/**
 * MOTOR SEMÁNTICO DINÁMICO (DSP) EN JAVASCRIPT PURO
 * No usa plantillas fijas. Lee los sustantivos, verbos, componentes y números del usuario.
 */
function compilarSemanticaDinamicaUniversal(promptTexto) {
  const p = promptTexto.toLowerCase();

  // 1. Detección de Actuadores y Elementos de Salida (Relés R1..R8)
  const DICCIONARIO_ACTUADORES = [
    { claves: ['ignicion', 'ignición', 'contacto', 'acc', 'servicio'], rol: 'IGNICION_ON', defaultName: 'Contacto Ignición', color: 'amber' },
    { claves: ['starter', 'arranque', 'marcha', 'start'], rol: 'STARTER_MOTOR', defaultName: 'Motor de Arranque', color: 'emerald' },
    { claves: ['corte', 'inmovilizador', 'bloqueo', 'paro', 'stop', 'apagado'], rol: 'INMOVILIZADOR', defaultName: 'Corte Inmovilizador', color: 'rose' },
    { claves: ['bomba', 'motobomba', 'bombeo', 'recirculado'], rol: 'BOMBA', defaultName: 'Bomba Principal', color: 'cyan' },
    { claves: ['valvula', 'válvula', 'electroválvula', 'solenoide'], rol: 'VALVULA', defaultName: 'Electroválvula', color: 'cyan' },
    { claves: ['calentador', 'resistencia', 'calor', 'macerador', 'quemador'], rol: 'CALENTADOR', defaultName: 'Resistencia Calefactora', color: 'amber' },
    { claves: ['purga', 'escape', 'alivio', 'despresuriz'], rol: 'PURGA_VAPOR', defaultName: 'Válvula de Purga', color: 'rose' },
    { claves: ['extractor', 'ventilador', 'fan', 'soplador'], rol: 'EXTRACTOR', defaultName: 'Extractor de Aire', color: 'cyan' },
    { claves: ['sirena', 'alarma', 'luz', 'luces', 'baliza'], rol: 'SIRENA_LUCES', defaultName: 'Alarma / Luces', color: 'amber' },
    { claves: ['agitador', 'mezclador', 'motor'], rol: 'MOTOR_AGITADOR', defaultName: 'Motor Agitador', color: 'purple' },
    { claves: ['vacio', 'vacío'], rol: 'BOMBA_VACIO', defaultName: 'Bomba de Vacío', color: 'cyan' }
  ];

  // 2. Detección de Sensores y Variables
  const DICCIONARIO_SENSORES = [
    { claves: ['temperatura', 'termometro', 'termómetro', 'calor', 'pt100', '°c'], tipo: 'VALUE_CARD', unidad: '°C', defaultName: 'Sensor Temperatura', variable: 'temp' },
    { claves: ['presion', 'presión', 'manometro', 'manómetro', 'bar', 'psi'], tipo: 'GAUGE_RADIAL', unidad: 'bar', defaultName: 'Presión de Trabajo', min: 0, max: 10, variable: 'presion' },
    { claves: ['bateria', 'batería', 'voltaje', 'voltios', '12v', '24v', 'v'], tipo: 'GAUGE_RADIAL', unidad: 'V', defaultName: 'Voltaje Batería', min: 9, max: 16, variable: 'bateria_v' },
    { claves: ['humedad', '%'], tipo: 'GAUGE_RADIAL', unidad: '%', defaultName: 'Sensor Humedad', min: 0, max: 100, variable: 'humedad' },
    { claves: ['nivel', 'boya', 'tanque'], tipo: 'STATUS_LED', defaultName: 'Sensor de Nivel', entrada: 'IN1' },
    { claves: ['alternador', 'd+'], tipo: 'STATUS_LED', defaultName: 'Alternador D+ 14V', entrada: 'IN2' },
    { claves: ['freno', 'pedal'], tipo: 'STATUS_LED', defaultName: 'Pedal de Freno', entrada: 'IN1' },
    { claves: ['puerta', 'fin de carrera', 'switch'], tipo: 'STATUS_LED', defaultName: 'Sensor Fin de Carrera', entrada: 'IN3' },
    { claves: ['emergencia', 'seta'], tipo: 'STATUS_LED', defaultName: 'Paro de Emergencia', entrada: 'IN4' }
  ];

  // 3. Extracción de tiempos numéricos
  const regexTiempos = /(\d+)\s*(segundo|segundos|seg|s|ms|minuto|minutos|min)/g;
  const tiemposExtraidos = [];
  let mTiempo;
  while ((mTiempo = regexTiempos.exec(p)) !== null) {
    const valor = parseInt(mTiempo[1], 10);
    const unidad = mTiempo[2].toLowerCase();
    const ms = unidad.startsWith('min') ? valor * 60000 : unidad.startsWith('ms') ? valor : valor * 1000;
    tiemposExtraidos.push({ valor, unidad, ms });
  }

  // 4. Identificar qué actuadores están presentes en el texto del usuario
  const actuadoresDetectados = [];
  DICCIONARIO_ACTUADORES.forEach(act => {
    const coincide = act.claves.some(k => p.includes(k));
    if (coincide) {
      actuadoresDetectados.push(act);
    }
  });

  // Si no se encontró ningún actuador conocido por palabras clave, extraer genéricamente según canales
  if (actuadoresDetectados.length === 0) {
    const palabras = promptTexto.split(/[,.;\n]+/).map(s => s.trim()).filter(Boolean);
    palabras.slice(0, 4).forEach((palabra, idx) => {
      actuadoresDetectados.push({
        rol: `SALIDA_CANAL_${idx + 1}`,
        defaultName: palabra.length > 25 ? `Control ${idx + 1}` : palabra,
        color: idx === 0 ? 'cyan' : idx === 1 ? 'emerald' : idx === 2 ? 'amber' : 'purple'
      });
    });
  }

  // 5. Identificar qué sensores están presentes
  const sensoresDetectados = [];
  DICCIONARIO_SENSORES.forEach(sens => {
    const coincide = sens.claves.some(k => p.includes(k));
    if (coincide && !sensoresDetectados.some(s => s.defaultName === sens.defaultName)) {
      sensoresDetectados.push(sens);
    }
  });

  // 6. Construir roles y nombres de relés dinámicamente
  const rolesReles = {};
  const nombresReles = {};
  for (let i = 1; i <= 8; i++) {
    const act = actuadoresDetectados[i - 1];
    if (act) {
      rolesReles[`R${i}`] = act.rol;
      nombresReles[`R${i}`] = act.defaultName;
    } else {
      rolesReles[`R${i}`] = 'MANUAL';
      nombresReles[`R${i}`] = `Salida R${i} Libre`;
    }
  }

  // 7. Construir Widgets dinámicos basados estrictamente en lo detectado
  const widgetsConstruidos = [];
  let widgetIdx = 1;

  // Si hay tiempos detectados y es una secuencia o ciclo, añadir botón maestro de ejecución
  if (tiemposExtraidos.length > 0 || p.includes('secuencia') || p.includes('ciclo') || p.includes('arranque')) {
    const desgloseTiempos = tiemposExtraidos.map(t => `${t.valor}${t.unidad.startsWith('min') ? 'm' : 's'}`).join(' ➔ ');
    widgetsConstruidos.push({
      id: `w_${widgetIdx++}`,
      tipo: 'ACTION_BUTTON',
      titulo: desgloseTiempos ? `⚡ Iniciar Secuencia (${desgloseTiempos})` : '⚡ Iniciar Secuencia Automática',
      canal: 1,
      color: 'emerald',
      icono: 'Play',
      w: 360,
      h: 170
    });
  }

  // Añadir un widget por cada actuador detectado
  actuadoresDetectados.forEach((act, idx) => {
    const canalNum = idx + 1;
    if (canalNum <= 8) {
      widgetsConstruidos.push({
        id: `w_${widgetIdx++}`,
        tipo: 'SWITCH_TOGGLE',
        titulo: act.defaultName,
        canal: canalNum,
        color: act.color || 'cyan',
        w: 260,
        h: 170
      });
    }
  });

  // Añadir un widget por cada sensor detectado
  sensoresDetectados.forEach((sens) => {
    widgetsConstruidos.push({
      id: `w_${widgetIdx++}`,
      tipo: sens.tipo,
      titulo: sens.defaultName,
      variable: sens.variable || 'valor',
      unidad: sens.unidad || '',
      min: sens.min ?? 0,
      max: sens.max ?? 100,
      color: sens.tipo === 'VALUE_CARD' ? 'cyan' : 'emerald',
      w: 260,
      h: 170
    });
  });

  // Si se pidió gráfica o histórico explícitamente
  if (p.includes('grafica') || p.includes('gráfica') || p.includes('curva') || p.includes('historial')) {
    widgetsConstruidos.push({
      id: `w_${widgetIdx++}`,
      tipo: 'CHART_HISTORY',
      titulo: 'Curva de Telemetría en Vivo',
      color: 'cyan',
      w: 540,
      h: 170
    });
  }

  // Determinar Tipo de Máquina según el contexto del texto
  let tipoFinal = 'UNIVERSAL_PLC';
  if (p.includes('vehiculo') || p.includes('vehículo') || p.includes('carro') || p.includes('ambulancia') || p.includes('motor') || p.includes('staria')) {
    tipoFinal = 'VEHICULO';
  } else if (p.includes('autoclave') || p.includes('esteriliz') || p.includes('clinico') || p.includes('clínico')) {
    tipoFinal = 'AUTOCLAVE';
  }

  // Título derivado del propio texto del usuario (hasta 40 caracteres)
  const tituloDerivado = promptTexto.length > 40
    ? promptTexto.slice(0, 37).trim() + '...'
    : promptTexto;

  return {
    exito: true,
    fuente: 'MOTOR_SEMANTICO_DINAMICO',
    titulo: tituloDerivado.charAt(0).toUpperCase() + tituloDerivado.slice(1),
    descripcion: `Compilación dinámica: ${actuadoresDetectados.length} salidas asignadas, ${sensoresDetectados.length} sensores vinculados.`,
    halPayload: {
      tipo: tipoFinal,
      roles_reles: rolesReles,
      nombres_reles: nombresReles,
      tiempos: tiemposExtraidos
    },
    dashboardWidgets: widgetsConstruidos
  };
}

/**
 * FUNCIÓN PRINCIPAL EXPORTADA
 * Prioridad 1: LLM Cloud (OpenAI / Groq) si hay clave configurada.
 * Prioridad 2: Motor Semántico Dinámico (interpreta libremente en JS sin keys ni costo).
 */
export async function compilarConIA({ prompt, device, hardwareInfo, apiKey }) {
  if (!prompt || !prompt.trim()) {
    throw new Error('El prompt de automatización no puede estar vacío.');
  }

  const realKey = apiKey || import.meta.env.VITE_OPENAI_API_KEY || import.meta.env.VITE_GROQ_API_KEY || null;

  // Si hay API Key en las variables de entorno, consulta al modelo de lenguaje en la nube
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
            { role: 'system', content: BIOFLEET_SYSTEM_PROMPT },
            {
              role: 'user',
              content: `Instrucción del usuario: "${prompt}". Hardware disponible: ${JSON.stringify(hardwareInfo || {})}. Genera el JSON completo.`
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3
        })
      });

      if (response.ok) {
        const jsonRes = await response.json();
        const content = JSON.parse(jsonRes.choices[0].message.content);
        return {
          exito: true,
          fuente: 'IA_NUBE_LLM',
          titulo: content.titulo_programa || 'Automatización Compilada',
          descripcion: content.descripcion || prompt,
          halPayload: content.hal_payload,
          dashboardWidgets: content.dashboard || []
        };
      }
    } catch (e) {
      console.warn('[AI COMPILER] Fallo en la llamada cloud, activando Motor Semántico Dinámico:', e);
    }
  }

  // Si no hay API Key configurada o falla la red, ejecuta el Motor Semántico Dinámico en JavaScript
  return compilarSemanticaDinamicaUniversal(prompt);
}
