/*
 * =============================================================================
 * secrets.example.h — PLANTILLA DE CREDENCIALES (NO CONTIENE SECRETOS REALES)
 *
 * INSTRUCCIONES:
 *   1. Copia este archivo como  secrets.h  en esta misma carpeta.
 *   2. Rellena con tus credenciales reales de HiveMQ Cloud.
 *   3. secrets.h está en .gitignore — NUNCA se subirá al repositorio.
 *
 * NOTA DE SEGURIDAD: la contraseña anterior quedó expuesta y debe rotarse
 * en la consola de HiveMQ Cloud antes de compilar esta versión.
 * =============================================================================
 */
#pragma once

// Broker MQTT (HiveMQ Cloud)
#define MQTT_SERVER "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.s1.eu.hivemq.cloud"
#define MQTT_PORT   8883
#define MQTT_USER   "usuario_aqui"
#define MQTT_PASS   "password_aqui"

/*
 * CA raíz para validar el certificado TLS del broker.
 * HiveMQ Cloud usa Let's Encrypt: descarga "ISRG Root X1" (PEM) desde
 * https://letsencrypt.org/certificates/ y pégala aquí línea por línea.
 *
 * Si la dejas vacía (""), el firmware compila con setInsecure() — solo
 * aceptable en banco de pruebas, NUNCA en producción.
 */
#define HIVEMQ_ROOT_CA ""
