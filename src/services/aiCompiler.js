/**
 * aiCompiler.js - Motor de compilación heurística y asistida por IA
 * para reglas de automatización y telemetría SCADA / BioFleet.
 */

export async function compileNaturalLanguageToLogic(promptText, deviceContext = {}) {
  // Simulación de análisis sintáctico local y traducción a comandos SCADA
  const cleanPrompt = (promptText || '').toLowerCase().trim();

  // 1. Detección de disparadores térmicos
  if (cleanPrompt.includes('temperatura') && (cleanPrompt.includes('mayor') || cleanPrompt.includes('supera') || cleanPrompt.includes('>'))) {
    const match = cleanPrompt.match(/\d+(\.\d+)?/);
    const threshold = match ? parseFloat(match[0]) : 134.0;
    return {
      type: 'ALARM_RULE',
      condition: `temp_camara > ${threshold}`,
      action: 'TRIGGER_ALARM',
      code: 'ERR_OVERTEMP',
      targetMac: deviceContext.mac || 'ALL',
      description: `Disparar alarma si la temperatura de cámara supera los ${threshold}°C.`
    };
  }

  // 2. Detección de disparadores de presión
  if (cleanPrompt.includes('presion') || cleanPrompt.includes('presión')) {
    const match = cleanPrompt.match(/\d+(\.\d+)?/);
    const threshold = match ? parseFloat(match[0]) : 2.2;
    return {
      type: 'VALVE_RULE',
      condition: `presion >= ${threshold}`,
      action: 'OPEN_EXHAUST_VALVE',
      targetMac: deviceContext.mac || 'ALL',
      description: `Abrir electroválvula de alivio si la presión supera ${threshold} bar.`
    };
  }

  // 3. Reglas de mantenimiento por ciclo
  if (cleanPrompt.includes('mantenimiento') || cleanPrompt.includes('ciclos')) {
    const match = cleanPrompt.match(/\d+/);
    const limit = match ? parseInt(match[0], 10) : 200;
    return {
      type: 'MAINTENANCE_WARNING',
      condition: `ciclos >= ${limit}`,
      action: 'NOTIFY_TELEGRAM',
      targetMac: deviceContext.mac || 'ALL',
      description: `Notificar al equipo biomédico al alcanzar los ${limit} ciclos de esterilización.`
    };
  }

  // Regla por defecto generada
  return {
    type: 'CUSTOM_AUTOMATION',
    rawPrompt: promptText,
    action: 'LOG_EVENT',
    targetMac: deviceContext.mac || 'ALL',
    description: `Regla compilada automáticamente: "${promptText}"`
  };
}

export const aiCompiler = {
  compile: compileNaturalLanguageToLogic
};

export default compileNaturalLanguageToLogic;
