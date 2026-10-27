# BioFleet HKL-EA8 — Firmware v10.1

Motor clínico de autoclave con contrato completo contra la web SCADA.

## Compilación

- **Placa**: ESP32 con Ethernet LAN8720 (Arduino core ESP32 2.x/3.x)
- **Librerías**: PubSubClient, ArduinoJson 6.x, LiquidCrystal_I2C (además de las nativas: ETH, WiFiClientSecure, Preferences, LittleFS, HTTPClient, Update)
- **Partición**: cualquier esquema OTA (la app ocupa ~1.4 MB con OTA habilitado)

## Credenciales (OBLIGATORIO)

```bash
cp secrets.example.h secrets.h
```

Editar `secrets.h` con el broker, usuario y contraseña de HiveMQ Cloud.
`secrets.h` está en `.gitignore` — nunca entra al repositorio.

> ⚠️ La contraseña MQTT anterior quedó expuesta en el código v10.0 — **rotarla
> en la consola de HiveMQ** antes de poner esta versión en producción.
> Para producción real, pegar la CA `ISRG Root X1` en `HIVEMQ_ROOT_CA`;
> si se deja vacía el firmware compila con `setInsecure()` (solo banco).

## Contrato MQTT (prefijo `autoclave_med_2026/<MAC>/`)

| Topic | Dirección | Contenido |
|---|---|---|
| `config` | web → placa | Todos los comandos `{cmd:...}` |
| `telemetria` | placa → web | Estado a 800 ms (temp, presión, F0, fase, relés, entradas, bypasses, ciclos, versión) |
| `esquema` | placa → web | Descriptor de capacidades + comandos (retained, en cada conexión) |
| `meta` | placa → web | Identidad provisionada: alias, cliente, modelo, tipo (retained) |
| `hw_profile` | placa → web | Perfil hardware: mapa I2C, nº de programas (retained) |
| `i2c_report` / `hardware_scan` | placa → web | Resultado de `SCAN_HARDWARE` |
| `logica/ack` | placa → web | ACK de `APPLY_*`, `SET_CONFIG`, `RESET_ODOMETRO` |
| `alerta_critica` | placa → web | Publicación inmediata ante nueva alarma |
| `reporte_paquete` | placa → web | Reporte médico de fin de ciclo (con bitácora de eventos) |
| `fota_status` | placa → web | Estado de actualización OTA |

## Comandos aceptados

`INICIAR_CICLO {programa:1-6}` · `ABORTAR_PROCESO`/`ABORTAR_CICLO` ·
`RESET_ALARMA` · `SET_RELAY {canal,val,duracion_ms?}` · `SET_BYPASS` ·
`SCAN_HARDWARE` · `APPLY_HAL_MAP` · `APPLY_LOGICA_SECUENCIA` ·
`APPLY_HARDWARE_PROVISION` · `SET_CONFIG`/`SET_ALERTA_MANT` ·
`RESET_ODOMETRO` · `CMD_ABRIR_PUERTA` (enclavado) · `CMD_CIERRE_PUERTA` ·
`PING` · `TRIGGER_FOTA`/`FOTA_DEPLOY {url}` (solo en reposo) ·
claves legadas sueltas `{sp_temp, vacio_ok, mot_ok}`

## Seguridad funcional

- `CMD_ABRIR_PUERTA` se rechaza con alarma si hay ciclo activo o presión > 0.1 bar
- `TRIGGER_FOTA` se rechaza fuera de estado REPOSO
- Watchdog de 8 s en Core 1: ante un cuelgue del PLC, el ESP32 se reinicia y
  los relés arrancan desenergizados
- Contadores (ciclos, límite de mantenimiento, bypasses, identidad) persisten
  en NVS — sobreviven cortes de energía
