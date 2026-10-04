// DICCIONARIO CLÍNICO Y TÉCNICO DE AYUDA EN PANTALLA (HOVER / LONG-PRESS)
export const CLINICAL_HELP = {
  // MEDIDORES Y SENSORES
  temp_camara: {
    title: 'Temperatura en Cámara',
    badge: 'SENSOR PT100 / TERMOPAR',
    desc: 'Indica la temperatura térmica dentro de la cámara de esterilización en tiempo real. Crucial para alcanzar la desnaturalización de proteínas en microorganismos patógenos.',
    action: 'Auditoría continua de meseta (121.1°C a 138.0°C).'
  },
  presion_camara: {
    title: 'Presión Absoluta de Vapor',
    badge: 'TRANSDUCTOR BAR/PSI',
    desc: 'Monitorea la presión interna del vapor saturado. Una presión adecuada garantiza la penetración del vapor en paquetes de instrumental envueltos.',
    action: 'Límite de seguridad operativo fijado hasta 2.65 bar.'
  },
  letalidad_f0: {
    title: 'Letalidad Térmica Acumulada (F0)',
    badge: 'NORMA ISO 17665',
    desc: 'Cálculo biológico en minutos equivalentes a 121.1°C que mide la destrucción de esporas Geobacillus stearothermophilus. Un valor F0 ≥ 15 min valida esterilidad absoluta.',
    action: 'Integración matemática por segundo: dt * 10^((T-121.1)/10).'
  },
  fase_ciclo: {
    title: 'Fase de Esterilización',
    badge: 'ESTADO DEL PROCESO',
    desc: 'Indica la etapa actual del ciclo: Pre-Vacío (extracción de aire), Calentamiento, Meseta Estéril, Despresurización o Secado activo.',
    action: 'Gestionado automáticamente por el firmware del microcontrolador.'
  },
  odometro: {
    title: 'Odómetro de Ciclos',
    badge: 'MANTENIMIENTO PREVENTIVO',
    desc: 'Contador físico en memoria no volátil del total de ciclos realizados. Calcula el desgaste de sellos, válvulas y resistencias calefactoras.',
    action: 'Alerta cuando resta menos del 10% para el límite de servicio.'
  },

  // ACTUADORES FÍSICOS (GPIOS DEL ESP32)
  actuador_motor: {
    title: 'Motor Agitador / Salida 1',
    badge: 'GPIO 2 (ESP32)',
    desc: 'Controla el relevador del motor o ventilador de homogeneización térmica dentro de la cámara.',
    action: 'Click para alternar estado manual Encendido / Apagado.'
  },
  actuador_calentador: {
    title: 'Resistencias Calefactoras',
    badge: 'GPIO 4 (ESP32)',
    desc: 'Salida de potencia hacia los contactores de las resistencias sumergidas generadoras de vapor.',
    action: 'Regulado automáticamente por el control PID del firmware.'
  },
  actuador_vacio: {
    title: 'Bomba de Pre-Vacío / Secado',
    badge: 'GPIO 5 (ESP32)',
    desc: 'Acciona la bomba mecánica de vacío para la extracción de bolsas de aire frío y extracción de humedad final.',
    action: 'Click para prueba de pulso de vacío o conmutación.'
  },

  // BOTONES DE COMANDO
  btn_iniciar_ciclo: {
    title: 'Iniciar Ciclo de Esterilización',
    badge: 'ORDEN MQTT',
    desc: 'Envía el comando INICIAR_CICLO hacia la placa para arrancar el protocolo programado (Pre-vacío, calentamiento y meseta).',
    action: 'Requiere que la puerta esté cerrada y el sistema habilitado.'
  },
  btn_paro_emergencia: {
    title: 'Paro de Emergencia en Cámara',
    badge: 'SEGURIDAD CRÍTICA',
    desc: 'Corta de inmediato la alimentación de resistencias calefactoras y abre la válvula de purga para aliviar presión.',
    action: 'Detiene el ciclo y dispara alerta sonora y a Telegram.'
  },
  btn_reset_alarma: {
    title: 'Restablecer Alarma de Cámara',
    badge: 'RESET DEL SISTEMA',
    desc: 'Borra el código de error actual en la memoria del equipo para permitir una nueva operación tras resolver la anomalía.',
    action: 'Envía comando RESET_ALARMA al ESP32.'
  },
  btn_etiqueta_qr: {
    title: 'Generador de Trazabilidad QR',
    badge: 'INSTRUMENTAL QUIRÚRGICO',
    desc: 'Genera una etiqueta hospitalaria imprimible con código QR con los datos del ciclo, F0 obtenido, fecha y operador para pegar en paquetes.',
    action: 'Abre ventana de previsualización e impresión.'
  },
  btn_anclar_terminal: {
    title: 'Modo Terminal Dedicada',
    badge: 'BLOQUEO DE VISTA',
    desc: 'Fija la pantalla exclusivamente a este equipo, ocultando menús globales. Ideal para tablets o pantallas dedicadas junto al autoclave.',
    action: 'Click para fijar o desanclar la pantalla.'
  },
  btn_reset_odometro: {
    title: 'Reiniciar Odómetro a Cero',
    badge: 'SOLO SERVICIO TÉCNICO',
    desc: 'Pone en 0 el contador de ciclos en la memoria física del equipo tras realizar un servicio de mantenimiento o cambio de sellos.',
    action: 'Requiere confirmación de supervisor técnico.'
  }
};
