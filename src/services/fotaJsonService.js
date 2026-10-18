/**
 * fotaJsonService.js - Servicio de Distribución y Despliegue FOTA
 * Transmisión Over-The-Air de perfiles JSON, configuraciones y firmware hacia ESP32.
 */

// Perfiles de fábrica predeterminados
export const PERFILES_PREDETERMINADOS = [
  {
    id: 'fota_std_134',
    nombre: 'Ciclo Quirúrgico 134°C - Estándar',
    tipo: 'AUTOCLAVE',
    version: '2.1.0',
    descripcion: 'Meseta de 134.5°C por 5 minutos, secado al vacío de 10 min.',
    config: {
      sp_temp: 134.5,
      t_ciclo: 5,
      t_secado: 10,
      p_limite: 2.4,
      lim_mant: 200
    }
  },
  {
    id: 'fota_gentle_121',
    nombre: 'Ciclo Instrumental Delicado 121°C',
    tipo: 'AUTOCLAVE',
    version: '2.1.0',
    descripcion: 'Meseta de 121.0°C por 20 minutos para gomas y textiles.',
    config: {
      sp_temp: 121.0,
      t_ciclo: 20,
      t_secado: 12,
      p_limite: 1.3,
      lim_mant: 200
    }
  },
  {
    id: 'fota_vehiculo_uci',
    nombre: 'Perfil Telemetría Ambulancia UCI',
    tipo: 'VEHICULO',
    version: '1.4.0',
    descripcion: 'Monitoreo de batería 12V/24V, GPS y botón de pánico médico.',
    config: {
      intervalo_reporte_seg: 5,
      alarma_bateria_baja: 11.8,
      modo_emergencia: true
    }
  },
  {
    id: 'fota_plc_din',
    nombre: 'Perfil PLC Universal 8-Relés',
    tipo: 'UNIVERSAL_PLC',
    version: '3.0.1',
    descripcion: 'Mapeo I/O industrial Modbus RTU / MQTT DIN rail.',
    config: {
      reles_activos: 8,
      entradas_digitales: 8,
      baudrate: 115200
    }
  }
];

/**
 * Función requerida por FotaHubView:
 * Despliega un perfil de configuración o firmware hacia uno o todos los equipos.
 */
export async function desplegarPerfilJsonFota(targetMac, perfilData, sendCommand) {
  try {
    const cleanMac = (targetMac || '').toUpperCase().replace(/[:\-]/g, '');

    const payloadFota = {
      cmd: 'FOTA_DEPLOY',
      timestamp: Date.now(),
      target: cleanMac || 'ALL',
      perfil_id: perfilData?.id || 'fota_custom',
      version: perfilData?.version || '2.0.0',
      config: perfilData?.config || perfilData || {}
    };

    // Si viene la función sendCommand del hook MQTT, despacha de inmediato
    if (typeof sendCommand === 'function') {
      sendCommand(cleanMac || 'ALL', payloadFota, false);
    }

    return {
      success: true,
      mensaje: `Perfil FOTA "${perfilData?.nombre || 'Perfil JSON'}" despachado exitosamente a [${cleanMac || 'TODA LA FLOTA'}].`,
      payload: payloadFota
    };
  } catch (error) {
    console.error('[FOTA ERROR] Falló el despliegue del perfil JSON:', error);
    return {
      success: false,
      mensaje: error?.message || 'Error al compilar y transmitir el paquete FOTA.'
    };
  }
}

/**
 * Validador sintáctico de perfiles JSON antes de compilar
 */
export function validarPerfilJson(jsonString) {
  try {
    const parsed = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
    if (!parsed || typeof parsed !== 'object') {
      return { valido: false, error: 'El contenido debe ser un objeto JSON válido.' };
    }
    return { valido: true, data: parsed };
  } catch (e) {
    return { valido: false, error: `Error de sintaxis JSON: ${e.message}` };
  }
}

export default {
  desplegarPerfilJsonFota,
  validarPerfilJson,
  PERFILES_PREDETERMINADOS
};
