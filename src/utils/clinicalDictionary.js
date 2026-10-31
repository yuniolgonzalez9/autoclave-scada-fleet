// =========================================================================
// DICCIONARIO CLÍNICO, VEHICULAR Y TÉCNICO UNIVERSAL (BIOFLEET SCADA)
// Normativas: ISO 17665 / RUMED / UNE-EN 13060 / SAE J1939
// =========================================================================

export const CLINICAL_HELP = Object.freeze({
  // 1. NAVEGACIÓN Y SECCIONES
  nav_flota: {
    title: 'Monitor de Flota en Vivo',
    badge: 'TELEMETRÍA REALTIME',
    desc: 'Supervisión en tiempo real de todos los activos conectados (autoclaves, ambulancias y PLCs), con lecturas térmicas, presiones y estado de enlace.',
    action: 'Click para ver la flota completa.'
  },
  nav_gestion: {
    title: 'Directorio & Gestión de Flota',
    badge: 'ADMINISTRACIÓN FÍSICA',
    desc: 'Panel para dar de alta nuevas placas microcontroladoras por su dirección MAC, asignarles cliente/hospital y configurar periféricos.',
    action: 'Requiere permisos de Administrador o Técnico.'
  },
  nav_usuarios: {
    title: 'Centro Maestro de Usuarios & Permisos',
    badge: 'CONTROL JERÁRQUICO RBAC',
    desc: 'Administración de cuentas de operadores, contraseñas, roles de acceso y asignación exclusiva de autoclaves por clínica.',
    action: 'Acceso reservado a Superadministrador.'
  },
  nav_fota: {
    title: 'FOTA Cloud Hub Enterprise',
    badge: 'FIRMWARE OVER-THE-AIR',
    desc: 'Servidor de despliegue inalámbrico de binarios compilados C++ (.bin) y manifiestos de hardware (.json para LittleFS) por WiFi.',
    action: 'Permite actualización masiva o selectiva.'
  },
  nav_auditoria: {
    title: 'Centro de Auditoría Clínica',
    badge: 'TRAZABILIDAD ISO 17665',
    desc: 'Base de datos inmutable de todos los ciclos ejecutados, desgloses cronométricos de 5 etapas, certificados médicos PDF y copias de seguridad.',
    action: 'Click para consultar el historial en la nube.'
  },

  // 2. FILTROS DE ESTADO DE ENLACE
  filter_online: {
    title: 'Filtro: Equipos en Línea',
    badge: '0 A 5 SEGUNDOS',
    desc: 'Muestra únicamente los equipos que están transmitiendo paquetes de telemetría activa en este preciso segundo sin interrupción.',
    action: 'Click para aislar equipos activos.'
  },
  filter_latency: {
    title: 'Filtro: Con Retraso / Latencia',
    badge: '5 A 10 SEGUNDOS',
    desc: 'Identifica autoclaves cuyos paquetes están tardando más de lo normal, síntoma típico de congestión en la red WiFi hospitalaria.',
    action: 'Monitoreo de estabilidad de señal.'
  },
  filter_offline: {
    title: 'Filtro: Desconectados / Apagados',
    badge: 'MÁS DE 10 SEGUNDOS',
    desc: 'Agrupa equipos sin señal de radio, apagados de la corriente o fuera del rango de cobertura.',
    action: 'Alerta de equipos fuera de servicio.'
  },
  filter_all: {
    title: 'Filtro: Toda la Flota',
    badge: 'VISTA GLOBAL',
    desc: 'Despliega la totalidad de los equipos registrados en la base de datos sin importar su estado de conexión.',
    action: 'Restablece todos los filtros.'
  },

  // 3. TARJETAS DE DISPOSITIVO EN FLOTA
  card_control_total: {
    title: 'Consola de Control Total',
    badge: 'ACCESO AL EQUIPO',
    desc: 'Entra a la cabina detallada de la máquina con su gráfica térmica segundo a segundo, accionamiento de salidas y trazabilidad.',
    action: 'Click izquierdo para entrar / Clic derecho para menú rápido.'
  },
  card_odometro: {
    title: 'Vida Útil del Odómetro',
    badge: 'DESGASTE FÍSICO',
    desc: 'Indica el porcentaje de ciclos consumidos respecto al límite de mantenimiento preventivo (sellos de puerta, válvulas y resistencias).',
    action: 'Alerta ámbar al 80% y bloqueo al 100%.'
  },

  // 4. SENSORES Y MAGNITUDES FÍSICAS
  temp_camara: {
    title: 'Temperatura en Cámara',
    badge: 'SENSOR PT100 / A0',
    desc: 'Temperatura térmica interna de la cámara quirúrgica. Indispensable para alcanzar la desnaturalización de proteínas en patógenos.',
    action: 'Meseta estéril normativa: 121.1°C a 138.0°C.'
  },
  presion_camara: {
    title: 'Presión Absoluta de Vapor',
    badge: 'TRANSDUCTOR PIEZORESISTIVO / A1',
    desc: 'Presión del vapor saturado dentro de la cámara. Garantiza la penetración homogénea del calor en paquetes textiles e instrumental.',
    action: 'Presión de trabajo: 2.10 a 2.50 bar.'
  },
  letalidad_f0: {
    title: 'Letalidad Térmica (F0)',
    badge: 'NORMA ISO 17665',
    desc: 'Cálculo biológico en minutos equivalentes a 121.1°C para esporas Geobacillus stearothermophilus. F0 ≥ 15 min garantiza esterilidad.',
    action: 'Fórmula: dt * 10^((T-121.11)/10).'
  },
  fase_ciclo: {
    title: 'Etapa del Ciclo',
    badge: 'ESTADO CLÍNICO',
    desc: 'Indica si el autoclave está en Pre-vacío, Calentamiento, Meseta Estéril, Despresurización o Secado activo.',
    action: 'Controlado por la máquina de estados del ESP32.'
  },

  // 5. ACTUADORES FÍSICOS (HKL-EA8)
  actuador_motor: {
    title: 'Motor Agitador / Salida 1',
    badge: 'RELÉ R1 (0x24)',
    desc: 'Acciona el relevador del motor o extractor de aire en cámara para homogeneización del vapor.',
    action: 'Click para alternar estado físico.'
  },
  actuador_calentador: {
    title: 'Resistencias Calefactoras',
    badge: 'RELÉ R5 (0x24)',
    desc: 'Contactores de potencia de las resistencias generadoras de vapor saturado.',
    action: 'Regulado automáticamente por el control térmico.'
  },
  actuador_vacio: {
    title: 'Bomba de Vacío / Secado',
    badge: 'RELÉ R6 (0x24)',
    desc: 'Acciona la bomba mecánica de diafragma para extracción de bolsas de aire frío y secado del instrumental.',
    action: 'Click para activar o detener la bomba.'
  },
  actuador_purga: {
    title: 'Válvula de Purga / Alivio',
    badge: 'RELÉ R7 (0x24)',
    desc: 'Válvula solenoide que evacúa el condensado y aire residual durante la presurización.',
    action: 'Conmutación manual o por algoritmo de ciclo.'
  },

  // 6. COMANDOS Y BOTONES OPERATIVOS
  btn_iniciar_ciclo: {
    title: 'Iniciar Ciclo de Esterilización',
    badge: 'ORDEN MQTT',
    desc: 'Dispara el arranque del protocolo de esterilización en el microcontrolador (vacío, calentamiento y meseta).',
    action: 'Requiere puerta hermética y seguro habilitado.'
  },
  btn_paro_emergencia: {
    title: 'Paro de Emergencia en Cámara',
    badge: 'CORTE CRÍTICO',
    desc: 'Desenergiza de inmediato los calentadores y abre el escape para despresurizar la cámara de forma segura.',
    action: 'Dispara sirena de cabina y alerta prioritaria a Telegram.'
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
    action: 'Abre ventana de impresión térmica.'
  },
  btn_anclar_terminal: {
    title: 'Modo Terminal Dedicada (Kiosk)',
    badge: 'BLOQUEO DE VISTA',
    desc: 'Fija esta pantalla exclusivamente a este autoclave, ocultando las demás secciones. Ideal para tablets fijas en pared de quirófano.',
    action: 'Click para fijar o desanclar la pantalla.'
  },
  btn_reset_odometro: {
    title: 'Reiniciar Odómetro Físico',
    badge: 'SERVICIO TÉCNICO',
    desc: 'Pone en 0 el contador de ciclos en la memoria Flash NVS tras cambiar empacaduras o realizar mantenimiento.',
    action: 'Requiere confirmación técnica.'
  },

  // 7. AUDITORÍA Y RESPALDOS
  btn_export_excel: {
    title: 'Exportar a Microsoft Excel',
    badge: 'FORMATO CSV UTF-8',
    desc: 'Genera y descarga una hoja de cálculo con todos los ciclos registrados, picos térmicos, presiones y diagnósticos.',
    action: 'Descarga inmediata al disco local.'
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
    desc: 'Permite subir un archivo JSON previo para reinyectar paquetes clínicos masivos en Supabase.',
    action: 'Abre el explorador de archivos.'
  },
  btn_fota_trigger: {
    title: 'Transmitir Firmware FOTA',
    badge: 'ACTUALIZACIÓN WIFI',
    desc: 'Envía la orden a las placas ESP32 seleccionadas para que descarguen el binario .bin e instalen la nueva versión.',
    action: 'Requiere que los equipos estén en reposo.'
  }
});

/**
 * Función de consulta segura con respaldo por defecto
 */
export const getClinicalHelp = (key) => {
  return CLINICAL_HELP[key] || {
    title: String(key).replace(/_/g, ' ').toUpperCase(),
    badge: 'SISTEMA',
    desc: 'Parámetro operativo de telemetría industrial y clínica.',
    action: 'Información del sistema.'
  };
};
