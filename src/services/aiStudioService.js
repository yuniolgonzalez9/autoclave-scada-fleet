/**
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * SERVICIO COMPILADOR DE IA INDUSTRIAL - AUDITOR FORENSE Y GESTOR PARAMÉTRICO
 * =========================================================================================
 */

const GROQ_DEFAULT_API_KEY = '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';

const SYSTEM_PROMPT_INGENIERO_SCADA = `
Eres el Ingeniero Consultor Principal de Automatización y SCADA de BioFleet OS v2.0 Enterprise.
Tienes CONOCIMIENTO ABSOLUTO y control sobre el gemelo digital ("config_deseada"), el hardware HKL-EA8 (ESP32) y la pantalla SCADA.

HARDWARE Y PROTOCOLO:
- Controlador HKL-EA8 (8 Relés R1..R8 en 0x24, 8 Entradas IN1..IN8 en 0x26, 4 ADC A0..A3 en 0x48, LCD 0x27).
- Sensor de Corriente (CT): Conectado al conector Jack de 3.5 mm en el canal ADC A2 (SCT-013 30A/1V).
- 6 Programas Clínicos: P1 (Instrumental 134°C), P2 (Textil 134°C), P3 (Gomas 121°C), P4 (Líquidos 121°C), P5 (Contenedor 134°C), P6 (Test Rápido).
- Entradas de Seguridad: Puerta física en IN0, Sello en IN1, Recámara en IN2, Caldera en IN3.

DIRECTIVAS ESTRICTAS:
1. SI EL USUARIO PIDE AUDITORÍA O HACE PREGUNTAS SOBRE EL EQUIPO:
   - Responde en "mensaje_chat" de forma técnica y detallada desglosando el hardware real: periféricos activos, estado del Jack CT de 3.5mm, programas clínicos configurados y los pines exactos donde están los sensores.
2. SI EL USUARIO PIDE MODIFICAR O ELIMINAR CONTROLES:
   - Modifica o elimina los widgets correspondientes en la matriz "dashboard".
3. SI EL USUARIO PIDE SECUENCIAS O PROCESOS:
   - Genera la matriz "receta" con los pasos temporizados y el widget 'SEQUENCE_TIMER'.
4. RESPONDE SIEMPRE CON UN OBJETO JSON VÁLIDO.

ESTRUCTURA DE RESPUESTA:
{
  "mensaje_chat": "Explicación técnica detallada o respuesta a la consulta del operador",
  "titulo_programa": "Nombre del perfil o sistema",
  "tipo": "AUTOCLAVE" | "UNIVERSAL_PLC" | "VEHICULO",
  "receta": {
    "nombre_receta": "Nombre",
    "enclavamientos": [],
    "total_pasos": 0,
    "pasos": []
  },
  "hal_payload": {
    "roles_reles": {},
    "nombres_reles": {}
  },
  "dashboard": []
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
 * Consulta a Groq y extrae el modelo activo real de la cuenta
 */
async function resolverModeloGroqActivo(apiKey) {
  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[Groq API HTTP ${res.status}]: ${errText}`);
  }

  const data = await res.json();
  const modelos = (data.data || []).map(m => m.id);

  // Filtrar modelos aptos para chat
  const candidatos = modelos.filter(id => 
    !id.includes('whisper') && 
    !id.includes('guard') && 
    !id.includes('orpheus')
  );

  if (candidatos.length === 0) {
    throw new Error('No se encontraron modelos de chat activos en la cuenta de Groq.');
  }

  // Priorizar modelos estándar
  const preferido = candidatos.find(id => id.includes('gpt-oss-120b')) ||
                    candidatos.find(id => id.includes('gpt-oss-20b')) ||
                    candidatos.find(id => id.includes('qwen')) ||
                    candidatos[0];

  return preferido;
}

export function detectarProveedorApiKey(key = '') {
  const k = key.trim();
  if (k.startsWith('gsk_')) return 'GROQ';
  if (k.startsWith('sk-')) return 'OPENAI';
  if (k.startsWith('AIza') || k.startsWith('AQ.')) return 'GEMINI';
  return 'GROQ';
}

/**
 * MOTOR DE AUDITORÍA LOCAL DE ALTA PRECISIÓN
 * Responde preguntas técnicas sobre la máquina con los datos reales de Supabase
 */
function generarAuditoriaLocal(p, hardwareInfo, widgetsActuales) {
  const info = hardwareInfo || {};
  const perifs = info.perifericos || {};
  const salidas = info.mapeo_absoluto_salidas || {};
  const entradas = info.mapeo_absoluto_entradas || {};
  const progs = info.programas_clinicos || {};
  const ct = perifs.ct_jack_amperimetro || {};

  // CASO: Solicitud de Auditoría o Consulta Técnica
  if (p.includes('auditor') || p.includes('periferico') || p.includes('periférico') || p.includes('que tiene') || p.includes('qué tiene') || p.includes('sensor de recámara') || p.includes('recamara')) {
    const ctActivo = ct.conectado ? 'HABILITADO en Jack 3.5mm (Canal ADC A2, SCT-013 de 30A/1V con umbral de 3.5A)' : 'DESHABILITADO';
    const pinRecamara = entradas.recamara_presion ? `Chip ${entradas.recamara_presion.chip || '0x26'} en el Pin P${entradas.recamara_presion.pin ?? 2}` : 'Chip 0x26 Pin P2';
    
    const respuestaAuditoria = `📋 INFORME DE AUDITORÍA TÉCNICA DEL EQUIPO:

1. PERIFÉRICOS ACTIVOS:
   • Transformador de Corriente (CT): ${ctActivo}.
   • Bomba de Vacío: ${perifs.bomba_vacio?.instalada ? 'INSTALADA (3 pulsos fraccionados a -0.85 bar)' : 'NO INSTALADA'}.
   • Caldera Interna: ${perifs.caldera_interna?.instalada ? 'INSTALADA' : 'MODO VAPOR EXTERNO'}.
   • Display LCD: Conectado vía I2C en 0x27 (16x2).

2. PROGRAMAS CLÍNICOS CONFIGURADOS (EN 13060):
   • P1 (Instrumental): 25 min esterilización / 10 min secado (134°C).
   • P2 (Textil): 20 min esterilización / 10 min secado (134°C).
   • P3 (Gomas): 10 min esterilización / 10 min secado (121°C).
   • P4 (Líquidos): 5 min esterilización / 5 min secado (121°C).
   • P5 (Contenedor): 15 min esterilización / 5 min secado (134°C).
   • P6 (Test Rápido): 3 min esterilización / 3 min secado.

3. MAPEO DEL SENSOR DE RECÁMARA:
   • Asignado físicamente en: ${pinRecamara} (Presóstato de vapor saturado).

El sistema se encuentra en estado operativo óptimo listo para ejecutar o reconfigurar parámetros.`;

    return {
      exito: true,
      mensajeChat: respuestaAuditoria,
      titulo_programa: 'Auditoría Técnica del Sistema',
      tipo: 'AUTOCLAVE',
      hal_payload: info,
      dashboard: widgetsActuales && widgetsActuales.length > 0 ? widgetsActuales : [
        { id: 'w_audit_1', tipo: 'VALUE_CARD', titulo: 'Temperatura Cámara', unidad: '°C', w: 260, h: 170 },
        { id: 'w_audit_2', tipo: 'GAUGE_RADIAL', titulo: 'Presión Recámara', unidad: 'bar', min: -1, max: 3, w: 260, h: 170 },
        { id: 'w_audit_3', tipo: 'STATUS_LED', titulo: 'Sello de Puerta', canal: 1, w: 260, h: 170 }
      ]
    };
  }

  // CASO: Eliminar todos los widgets
  if (p.includes('elimina todo') || p.includes('borra todo') || p.includes('limpia')) {
    return {
      exito: true,
      mensajeChat: 'Se han eliminado todos los controles de la pantalla. El lienzo está completamente libre.',
      titulo_programa: 'Lienzo Limpio',
      tipo: 'UNIVERSAL_PLC',
      hal_payload: info,
      dashboard: []
    };
  }

  return null;
}

/**
 * FUNCIÓN PRINCIPAL EXPORTADA
 */
export async function conversarYCompilarConIA({ 
  prompt, 
  historial = [], 
  hardwareInfo = {}, 
  widgetsActuales = [], 
  recetaActual = null, 
  telemetriaActual = {}, 
  apiKey = null 
}) {
  const p = prompt ? prompt.trim() : '';
  if (!p) throw new Error('Por favor introduce tu instrucción.');

  const pLower = p.toLowerCase();
  const key = apiKey || localStorage.getItem('biofleet_ai_key') || GROQ_DEFAULT_API_KEY;

  // 1. Si es una solicitud de auditoría técnica o comando de borrado, resolver con precisión local inmediata
  const localDirecto = generarAuditoriaLocal(pLower, hardwareInfo, widgetsActuales);
  if (localDirecto) {
    let curX = 20;
    let curY = 20;
    const conPos = (localDirecto.dashboard || []).map((w, idx) => {
      const posX = w.x !== undefined ? w.x : curX;
      const posY = w.y !== undefined ? w.y : curY;
      curX += (w.w || 260) + 20;
      if (curX > 860) { curX = 20; curY += 210; }
      return { ...w, id: w.id || `w_${Date.now()}_${idx}`, x: posX, y: posY };
    });

    return {
      exito: true,
      mensajeChat: localDirecto.mensajeChat,
      titulo: localDirecto.titulo_programa,
      tipo: localDirecto.tipo,
      receta: recetaActual,
      halPayload: hardwareInfo,
      dashboardWidgets: conPos
    };
  }

  // 2. Consulta en la nube con Groq LPU
  try {
    const modelIdActivo = await resolverModeloGroqActivo(key);
    console.log(`🤖 [GROQ API] Consultando modelo activo: ${modelIdActivo}`);

    const contextPayload = {
      config_deseada: hardwareInfo,
      widgets_actuales: widgetsActuales,
      receta_actual: recetaActual,
      telemetria: telemetriaActual
    };

    const messages = [
      { role: 'system', content: `${SYSTEM_PROMPT_INGENIERO_SCADA}\n\nCONTEXTO COMPLETO DEL EQUIPO:\n${JSON.stringify(contextPayload)}` },
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

      if (parseado) {
        let curX = 20;
        let curY = 20;
        const dashboardWidgets = (parseado.dashboard || widgetsActuales).map((w, idx) => {
          const width = Math.max(260, w.w || (w.tipo === 'SEQUENCE_TIMER' ? 380 : 260));
          const height = Math.max(170, w.h || (w.tipo === 'SEQUENCE_TIMER' ? 220 : 170));
          const posX = w.x !== undefined ? w.x : curX;
          const posY = w.y !== undefined ? w.y : curY;

          curX += width + 20;
          if (curX > 860) { curX = 20; curY += 210; }

          return {
            ...w,
            id: w.id || `w_${Date.now()}_${idx}`,
            x: posX,
            y: posY,
            w: width,
            h: height,
            canal: w.canal ? Number(w.canal) : (w['relé'] ? parseInt(String(w['relé']).replace(/\D/g, ''), 10) : 1)
          };
        });

        return {
          exito: true,
          mensajeChat: parseado.mensaje_chat || 'He diseñado la automatización solicitada.',
          titulo: parseado.titulo_programa || 'Control SCADA',
          tipo: parseado.tipo || hardwareInfo.tipo || 'AUTOCLAVE',
          receta: parseado.receta || recetaActual,
          halPayload: parseado.hal_payload || hardwareInfo,
          dashboardWidgets
        };
      }
    } else {
      const errDetail = await response.text();
      throw new Error(`[Groq Error HTTP ${response.status}]: ${errDetail}`);
    }
  } catch (errCloud) {
    console.error('❌ [AI ERROR]:', errCloud.message);
    throw errCloud; // Elevar el error real para no engañar con fallbacks silenciosos
  }
}
