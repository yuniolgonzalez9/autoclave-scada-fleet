// =========================================================================
// DICCIONARIO CLÍNICO Y TÉCNICO UNIVERSAL DE LA PLATAFORMA SCADA
// =========================================================================
export const CLINICAL_HELP = {
  // NAVEGACIÓN Y SECCIONES
  nav_flota: {
    title: 'Monitor de Flota en Vivo',
    badge: 'TELEMETRÍA REALTIME',
    desc: 'Visualización general de todos los autoclaves conectados a la red en tiempo real, con sus lecturas de temperatura, presión y estado de salud.',
    action: 'Click para ver la flota completa.'
  },
  nav_gestion: {
    title: 'Directorio & Gestión de Flota',
    badge: 'ADMINISTRACIÓN FÍSICA',
    desc: 'Panel para dar de alta nuevas máquinas por su dirección MAC, asignarles clínica y probar actuadores directamente en la placa.',
    action: 'Requiere permisos de Administrador o Técnico.'
  },
  nav_usuarios: {
    title: 'Centro Maestro de Usuarios & Permisos',
    badge: 'CONTROL JERÁRQUICO RBAC',
    desc: 'Administración de cuentas de operadores, contraseñas, roles de acceso y asignación exclusiva de autoclaves por cliente.',
    action: 'Acceso reservado a Superadministrador.'
  },
  nav_fota: {
    title: 'FOTA Cloud Hub',
    badge: 'FIRMWARE OVER-THE-AIR',
    desc: 'Servidor de despliegue inalámbrico de binarios compilados (.bin) para actualizar el software de los ESP32 por WiFi.',
    action: 'Permite actualización masiva o selectiva.'
  },
  nav_auditoria: {
    title: 'Centro de Auditoría Clínica',
    badge: 'TRAZABILIDAD ISO 17665',
    desc: 'Base de datos inmutable de todos los ciclos ejecutados, desgloses cronométricos de etapas, certificados médicos PDF y backups.',
    action: 'Click para consultar el historial en la nube.'
  },

  // FILTROS DE SALUD
  filter_online: {
    title: 'Filtro: Autoclaves en Línea',
    badge: '0 A 4 SEGUNDOS',
    desc: 'Muestra únicamente los equipos que están transmitiendo paquetes de telemetría activa en este preciso segundo sin interrupción.',
    action: 'Click para aislar equipos activos.'
  },
  filter_latency: {
    title: 'Filtro: Con Retraso / Latencia',
    badge: '4 A 8 SEGUNDOS',
    desc: 'Identifica autoclaves cuyos paquetes están tardando más de lo normal, síntoma típico de congestión en la red WiFi del hospital.',
    action: 'Monitoreo de estabilidad de señal.'
  },
  filter_offline: {
    title: 'Filtro: Desconectados / Apagados',
    badge: 'MÁS DE 8 SEGUNDOS',
    desc: 'Agrupa autoclaves sin señal de radio, apagados de la corriente o sin conexión a internet.',
    action: 'Alerta de equipos fuera de servicio.'
  },
  filter_all: {
    title: 'Filtro: Toda la Flota',
    badge: 'VISTA GLOBAL',
    desc: 'Despliega la totalidad de los equipos registrados en la base de datos sin importar su estado de conexión.',
    action: 'Restablece todos los filtros.'
  },

  // TARJETA DE AUTOCLAVE EN FLOTA
  card_control_total: {
    title: 'Consola de Control Total',
    badge: 'ACCESO AL EQUIPO',
    desc: 'Entra a la cabina detallada del autoclave con su gráfica térmica segundo a segundo, accionamiento de válvulas y trazabilidad.',
    action: 'Click izquierdo para entrar / Clic derecho para menú rápido.'
  },
  card_odometro: {
    title: 'Vida Útil del Odómetro',
    badge: 'DESGASTE FÍSICO',
    desc: 'Indica el porcentaje de ciclos consumidos respecto al límite de mantenimiento preventivo (sellos de puerta, válvulas y resistencias).',
    action: 'Se torna ámbar al 75% y rojo al 90%.'
  },

  // SENSORES Y MEDIDORES
  temp_camara: {
    title: 'Temperatura en Cámara',
    badge: 'SENSOR PT100 / TERMOPAR',
    desc: 'Temperatura térmica interna de la cámara quirúrgica. Indispensable para alcanzar la desnaturalización de proteínas en patógenos.',
    action: 'Meseta estéril: 121.1°C a 138.0°C.'
  },
  presion_camara: {
    title: 'Presión Absoluta de Vapor',
    badge: 'TRANSDUCTOR PIEZORESISTIVO',
    desc: 'Presión del vapor saturado dentro del recipiente a presión. Garantiza la penetración del calor en paquetes envueltos.',
    action: 'Presión de trabajo: 2.10 a 2.50 bar.'
  },
  letalidad_f0: {
    title: 'Letalidad Térmica (F0)',
    badge: 'NORMA ISO 17665',
    desc: 'Cálculo biológico en minutos equivalentes a 121.1°C para esporas Geobacillus stearothermophilus. F0 ≥ 15 min garantiza esterilidad.',
    action: 'Fórmula: dt * 10^((T-121.1)/10).'
  },
  fase_ciclo: {
    title: 'Etapa del Ciclo',
    badge: 'ESTADO CLÍNICO',
    desc: 'Indica si el autoclave está en Pre-vacío, Calentamiento, Meseta Estéril, Despresurización o Secado activo.',
    action: 'Controlado por el firmware del ESP32.'
  },

  // ACTUADORES FÍSICOS
  actuador_motor: {
    title: 'Motor Agitador / Salida 1',
    badge: 'GPIO 2 (ESP32)',
    desc: 'Acciona el relevador del motor o extractor de aire en cámara para homogeneización del vapor.',
    action: 'Click para encender o apagar manualmente.'
  },
  actuador_calentador: {
    title: 'Resistencias Calefactoras',
    badge: 'GPIO 4 (ESP32)',
    desc: 'Contactores de potencia de las resistencias generadoras de vapor saturado.',
    action: 'Regulado automáticamente por el control térmico.'
  },
  actuador_vacio: {
    title: 'Bomba de Pre-Vacío / Secado',
    badge: 'GPIO 5 (ESP32)',
    desc: 'Acciona la bomba mecánica de vacío para extracción de bolsas de aire frío y secado del instrumental.',
    action: 'Click para activar o detener la bomba.'
  },
  actuador_purga: {
    title: 'Válvula de Purga Automática',
    badge: 'ELECTROVÁLVULA DE ALIVIO',
    desc: 'Válvula solenoide que evacúa el condensado y aire residual durante la presurización.',
    action: 'Click para conmutar entre automático y manual.'
  },

  // COMANDOS Y BOTONES
  btn_iniciar_ciclo: {
    title: 'Iniciar Ciclo de Esterilización',
    badge: 'ORDEN MQTT',
    desc: 'Dispara el arranque del protocolo de esterilización en el microcontrolador (vacío, calentamiento y meseta).',
    action: 'Requiere puerta cerrada y seguro habilitado.'
  },
  btn_paro_emergencia: {
    title: 'Paro de Emergencia en Cámara',
    badge: 'CORTE CRÍTICO',
    desc: 'Apaga de inmediato los calentadores y abre el escape para despresurizar la cámara de forma segura.',
    action: 'Dispara sirena de cabina y alerta a Telegram.'
  },
  btn_reset_alarma: {
    title: 'Restablecer Alarma de Cámara',
    badge: 'RESET DEL SISTEMA',
    desc: 'Limpia el código de error en la memoria del equipo tras corregir la anomalía para permitir un nuevo ciclo.',
    action: 'Envía comando RESET_ALARMA al ESP32.'
  },
  btn_etiqueta_qr: {
    title: 'Generador de Trazabilidad QR',
    badge: 'INSTRUMENTAL QUIRÚRGICO',
    desc: 'Genera e imprime la etiqueta hospitalaria oficial con código QR que contiene el lote, fecha, operador y F0 obtenido.',
    action: 'Abre ventana de impresión de etiqueta.'
  },
  btn_anclar_terminal: {
    title: 'Modo Terminal Dedicada (Kiosk)',
    badge: 'BLOQUEO DE VISTA',
    desc: 'Fija esta pantalla exclusivamente a este autoclave, ocultando las demás secciones. Ideal para tablets fijas en quirófano.',
    action: 'Click para fijar o desanclar la pantalla.'
  },
  btn_reset_odometro: {
    title: 'Reiniciar Odómetro Físico',
    badge: 'SOLO SERVICIO TÉCNICO',
    desc: 'Pone en 0 el contador de ciclos en la memoria Flash NVS tras cambiar empacaduras o realizar mantenimiento.',
    action: 'Requiere confirmación técnica.'
  },

  // AUDITORÍA Y RESPALDOS
  btn_export_excel: {
    title: 'Exportar a Microsoft Excel',
    badge: 'FORMATO CSV UTF-8',
    desc: 'Genera y descarga una hoja de cálculo con todos los ciclos registrados, picos térmicos, presiones y diagnósticos.',
    action: 'Descarga inmediata al disco duro.'
  },
  btn_backup_json: {
    title: 'Descargar Backup Integral JSON',
    badge: 'RESPALDO CLÍNICO',
    desc: 'Guarda una copia de seguridad exacta en formato JSON de todas las sesiones registradas en Supabase Cloud.',
    action: 'Permite archivar auditorías de años anteriores.'
  },
  btn_restore_json: {
    title: 'Restaurar Copia de Seguridad',
    badge: 'SINCRONIZACIÓN NUBE',
    desc: 'Permite subir un archivo JSON previo para reinyectar los paquetes clínicos en Supabase si cambias de base de datos.',
    action: 'Abre el explorador de archivos.'
  },
  btn_print_audit: {
    title: 'Imprimir Informe de Auditoría',
    badge: 'DOCUMENTO OFICIAL',
    desc: 'Genera el informe impreso de la tabla de auditoría con cabecera hospitalaria, resumen de conformidad y firmas.',
    action: 'Abre el diálogo de impresión.'
  },

  // GESTIÓN Y FOTA
  btn_fota_trigger: {
    title: 'Transmitir Firmware FOTA',
    badge: 'ACTUALIZACIÓN WIFI',
    desc: 'Envía la orden a las placas ESP32 seleccionadas para que descarguen el binario .bin e instalen la nueva versión.',
    action: 'Requiere que los equipos estén en reposo.'
  },
  btn_test_motor_hw: {
    title: 'Prueba de Hardware: Motor',
    badge: 'PULSO GPIO 2',
    desc: 'Envía un comando rápido de conmutación al relevador del motor para comprobar que el cableado físico funciona.',
    action: 'Alterna el estado del pin en la placa.'
  },
  btn_test_reset_hw: {
    title: 'Prueba de Hardware: Reset',
    badge: 'RESTABLECIMIENTO',
    desc: 'Verifica la recepción de comandos en el ESP32 forzando una limpieza de errores remota.',
    action: 'Comprobación de enlace bidireccional.'
  }
};
