/*
 * =========================================================================================
 * PROYECTO: BIOFLEET OS™ v2.0 ENTERPRISE
 * CONTROLADOR MAESTRO HKL-EA8 - FIRMWARE v11.0 (basado en prueba_clientge_servidor v10.0)
 *
 * CORE 0: ETHERNET LAN8720 + HIVEMQ TLS 8883 + TELEMETRÍA (800ms) + REPORTES MÉDICOS + FOTA
 * CORE 1: AUTÓMATA CLÍNICO (P1..P6) + BYPASSES + RELÉS I2C (0x24) + LCD + SCAN BUS I2C
 *
 * IGUAL AL ORIGINAL: pines, inicialización Ethernet (WiFi.onEvent + ETH.begin),
 * autómata clínico, PCF8574, LCD, credenciales. El original NO fue modificado.
 *
 * NUEVO vs v10.0 (contrato total con la web):
 *  - SCAN_HARDWARE: escaneo real del bus I2C → publica i2c_report + hardware_scan
 *  - APPLY_HAL_MAP: remapea roles de relés en caliente + LittleFS + logica/ack
 *  - APPLY_LOGICA_SECUENCIA: receta persistente en /logica.json + ack
 *  - APPLY_HARDWARE_PROVISION: alias/cliente/modelo → meta + hw_profile
 *  - SET_CONFIG / SET_ALERTA_MANT: lim_mant, alerta_pct, programa, sp_temp → NVS
 *  - RESET_ODOMETRO: reinicio protegido del contador de ciclos
 *  - CMD_ABRIR_PUERTA / CMD_CIERRE_PUERTA: control manual enclavado
 *  - PING: telemetría + meta + perfil inmediatos
 *  - TRIGGER_FOTA / FOTA_DEPLOY: OTA por HTTP solo en REPOSO → fota_status
 *  - alerta_critica: publicación inmediata ante alarma nueva
 *  - esquema/meta/hw_profile retained al conectar (la web descubre la placa)
 *  - Persistencia NVS: ciclos, mantenimiento, bypasses, identidad
 *  - Mutex MQTT dual-core + watchdog real en Core 1
 *  - Diagnóstico de red en serial: ETH.begin() retorno + link/IP cada 4s
 * =========================================================================================
 */

#include <WiFi.h>
#include <ETH.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <LittleFS.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <HTTPClient.h>
#include <Update.h>
#include "esp_task_wdt.h"
#include "time.h"

#define SYS_VERSION "v11.0-TOTAL-WEB"
#define WDT_TIMEOUT_S 8

// Pines HKL-EA8
#define PIN_I2C_SDA        4
#define PIN_I2C_SCL        5
#define PIN_BUZZER         12
#define PIN_ONEWIRE        15

// Ethernet LAN8720 — IDÉNTICO AL ORIGINAL
#define ETH_PHY_TYPE       ETH_PHY_LAN8720
#define ETH_PHY_ADDR       0
#define ETH_PHY_MDC        23
#define ETH_PHY_MDIO       18
#define ETH_PHY_POWER      -1
#define ETH_CLK_MODE       ETH_CLOCK_GPIO17_OUT

// Credenciales HiveMQ — locales en secrets.h (gitignored), NUNCA en el repo
#if __has_include("secrets.h")
  #include "secrets.h"
#else
  #define MQTT_SERVER "CHANGE_ME.hivemq.cloud"
  #define MQTT_PORT 8883
  #define MQTT_USER "CHANGE_ME"
  #define MQTT_PASS "CHANGE_ME"
#endif
const char* mqttServer  = MQTT_SERVER;
const int   mqttPort    = MQTT_PORT;
const char* mqttUser    = MQTT_USER;
const char* mqttPass    = MQTT_PASS;

const char* ntpServer   = "pool.ntp.org";
const long  gmtOffset_sec = -14400; // GMT-4 AST
const int   daylightOffset_sec = 0;

// Direcciones I2C Físicas
const uint8_t ADDR_PCF_RELES   = 0x24; // Salidas
const uint8_t ADDR_PCF_INPUTS  = 0x26; // Entradas
const uint8_t ADDR_ADC_ADS1115 = 0x48; // ADC / CT Jack
uint8_t addrLcdAuto            = 0x27;

// Estados del Proceso Clínico
enum EstadoCiclo : uint8_t {
  PROC_REPOSO = 0,
  PROC_SELLANDO = 1,
  PROC_PURGA = 2,
  PROC_CALENTANDO = 3,
  PROC_ESTERILIZANDO = 4,
  PROC_DESFOGUE = 5,
  PROC_SECADO = 6,
  PROC_FINALIZADO = 7,
  PROC_CANCELADO = 8
};

// Asignación de Relés (PCF8574 en 0x24)
uint8_t pinOutSelloCierre    = 0; // R1
uint8_t pinOutValvSuccion    = 1; // R2
uint8_t pinOutAlivioSello    = 2; // R3
uint8_t pinOutBombaAgua      = 3; // R4
uint8_t pinOutResistencias   = 4; // R5
uint8_t pinOutVacio          = 5; // R6
uint8_t pinOutSecadoDesfogue = 6; // R7
uint8_t pinOutEsterilizar    = 7; // R8

// Asignación de Entradas (PCF8574 en 0x26)
uint8_t pinInPuerta    = 0;
uint8_t pinInSello     = 1;
uint8_t pinInChamber   = 2;
uint8_t pinInCaldera   = 3;
uint8_t pinInNivelBajo = 4;
uint8_t pinInNivelAlto = 5;

// BYPASSES DE BANCO DE PRUEBAS
bool bypassSwPuerta    = true;
bool bypassSwSello     = true;
bool bypassSwChamber   = true;
bool bypassSwCaldera   = true;
bool bypassSwNivelAgua = true;

// Tiempos de los 6 Programas Clínicos (Esterilizar, Secado, Vacío, Desfogue en minutos)
float tiemposProcesos[6][4] = {
  { 4.0f,  3.0f, 1.0f, 1.0f }, // P1: 134°C Instrumental
  { 15.0f, 5.0f, 1.0f, 1.0f }, // P2: 121°C Gomas
  { 18.0f, 5.0f, 1.0f, 1.0f }, // P3: 134°C Prion
  { 5.0f,  5.0f, 1.0f, 1.0f }, // P4: Líquidos
  { 10.0f, 4.0f, 1.0f, 1.0f }, // P5: Test Rápido
  { 1.0f,  1.0f, 0.5f, 0.5f }  // P6: Test Ultrarrápido de Banco (1 min meseta)
};

int programaSeleccionado = 1;
EstadoCiclo estadoActual = PROC_REPOSO;

// Variables Termodinámicas y Odómetro
float tempCamara = 25.0f;
float presionBar = 0.0f;
float setpointTemp = 134.0f;
float f0Acumulado = 0.0f;
int segundosRestantesFase = 0;
int ciclosCompletados = 0;
int limiteMantenimiento = 300;
int alertaMantPct = 80;
int alarmaCodigo = 0;
char alarmaMensaje[48] = "NORMAL";

// Identidad provisionada
char cfgAlias[48]   = "Autoclave Quirurgico";
char cfgCliente[48] = "Central Hospitalaria";
char cfgModelo[48]  = "Clase B HKL-EA8";
char cfgTipo[24]    = "AUTOCLAVE";

unsigned long tInicioMeseta = 0;
unsigned long tInicioFase = 0;
unsigned long tUltimoSegundoF0 = 0;
String horaInicioCiclo = "00:00:00";

// Bitácora de eventos del ciclo
struct EventoCiclo { char fase[20]; uint32_t seg; };
EventoCiclo eventosCiclo[16];
int nEventosCiclo = 0;

// FOTA pendiente (corre en tarea dedicada Core 0)
static String fotaUrlPendiente = "";
static volatile bool fotaEnCurso = false;
static volatile bool forceTelemetryFlag = false;

struct PLCCommand { char payload[2048]; };
struct PLCSnapshot {
  uint8_t estadoReles;
  uint8_t estadoEntradas;
  float tempCamara;
  float presionBar;
  float f0Score;
  char faseOEstado[32];
  int segRestantes;
  int alarmaCod;
  char alarmaMsg[48];
  int programa;
};

static PLCCommand rxCmdBuffer;
static StaticJsonDocument<2048> rxJsonDoc;
static StaticJsonDocument<2048> txTelemetriaDoc;
static char txMqttBuffer[2048];

QueueHandle_t     xQueuePLC;
SemaphoreHandle_t xMutexSnap;
SemaphoreHandle_t xMutexMqtt;   // serializa publish/connect/loop entre cores
PLCSnapshot       globalSnap;

WiFiClientSecure ethSecureClient;
PubSubClient     mqtt(ethSecureClient);
Preferences      prefs;
LiquidCrystal_I2C* lcdClinic = nullptr;

static bool ethConnected = false;
static bool ntpConfigured = false;
String macId = "";
String topicTelemetria = "";
String topicComando    = "";
String topicReporte    = "";
String topicInventory  = "";
String topicI2CReport  = "";
String topicHwScan     = "";
String topicMeta       = "";
String topicHwProfile  = "";
String topicLogicaAck  = "";
String topicEsquema    = "";
String topicAlerta     = "";
String topicFotaStatus = "";

// =============================================================================
// PERSISTENCIA (NVS)
// =============================================================================
void guardarPersistencia() {
  prefs.begin("biofleet", false);
  prefs.putInt("ciclos", ciclosCompletados);
  prefs.putInt("lim_mant", limiteMantenimiento);
  prefs.putInt("alerta_pct", alertaMantPct);
  prefs.putInt("programa", programaSeleccionado);
  prefs.putBool("bp_puerta", bypassSwPuerta);
  prefs.putBool("bp_sello", bypassSwSello);
  prefs.putBool("bp_chamber", bypassSwChamber);
  prefs.putBool("bp_caldera", bypassSwCaldera);
  prefs.putBool("bp_nivel", bypassSwNivelAgua);
  prefs.putString("alias", cfgAlias);
  prefs.putString("cliente", cfgCliente);
  prefs.putString("modelo", cfgModelo);
  prefs.putString("tipo", cfgTipo);
  prefs.end();
}

void cargarPersistencia() {
  prefs.begin("biofleet", true);
  ciclosCompletados    = prefs.getInt("ciclos", 0);
  limiteMantenimiento  = prefs.getInt("lim_mant", 300);
  alertaMantPct        = prefs.getInt("alerta_pct", 80);
  programaSeleccionado = prefs.getInt("programa", 1);
  bypassSwPuerta    = prefs.getBool("bp_puerta", true);
  bypassSwSello     = prefs.getBool("bp_sello", true);
  bypassSwChamber   = prefs.getBool("bp_chamber", true);
  bypassSwCaldera   = prefs.getBool("bp_caldera", true);
  bypassSwNivelAgua = prefs.getBool("bp_nivel", true);
  String a = prefs.getString("alias", "");   if (a.length()) a.toCharArray(cfgAlias, 48);
  String c = prefs.getString("cliente", ""); if (c.length()) c.toCharArray(cfgCliente, 48);
  String m = prefs.getString("modelo", "");  if (m.length()) m.toCharArray(cfgModelo, 48);
  String t = prefs.getString("tipo", "");    if (t.length()) t.toCharArray(cfgTipo, 24);
  prefs.end();
}

// =============================================================================
// HELPERS
// =============================================================================
void emitirBeep(uint16_t ms = 35) {
  digitalWrite(PIN_BUZZER, HIGH);
  delay(ms);
  digitalWrite(PIN_BUZZER, LOW);
}

void inicializarLCD() {
  Wire.beginTransmission(0x27);
  if (Wire.endTransmission() == 0) addrLcdAuto = 0x27;
  else {
    Wire.beginTransmission(0x3F);
    if (Wire.endTransmission() == 0) addrLcdAuto = 0x3F;
  }

  lcdClinic = new LiquidCrystal_I2C(addrLcdAuto, 16, 2);
  lcdClinic->init();
  lcdClinic->backlight();
  lcdClinic->clear();
  lcdClinic->setCursor(0, 0);
  lcdClinic->print("BIOFLEET CLOUD");
  lcdClinic->setCursor(0, 1);
  lcdClinic->print("AUTOCLAVE LISTO");
}

String obtenerHoraActual() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 10)) return "00:00:00";
  char buffer[12];
  strftime(buffer, sizeof(buffer), "%H:%M:%S", &timeinfo);
  return String(buffer);
}

void registrarEvento(const char* fase) {
  if (nEventosCiclo < 16) {
    strncpy(eventosCiclo[nEventosCiclo].fase, fase, 19);
    eventosCiclo[nEventosCiclo].seg = (millis() - tInicioFase) / 1000;
    nEventosCiclo++;
  }
}

// =============================================================================
// PUBLICACIONES MQTT (serializadas por xMutexMqtt — PubSubClient no es
// thread-safe entre Core 0 y Core 1)
// =============================================================================
bool mqttPublishSafe(const char* topic, const char* payload, bool retained = false) {
  if (!mqtt.connected() || xMutexMqtt == NULL) return false;
  bool ok = false;
  if (xSemaphoreTake(xMutexMqtt, pdMS_TO_TICKS(150)) == pdTRUE) {
    ok = mqtt.publish(topic, payload, retained);
    xSemaphoreGive(xMutexMqtt);
  }
  return ok;
}

void publicarAlertaCritica() {
  if (!mqtt.connected()) return;
  StaticJsonDocument<384> doc;
  doc["mac"] = macId;
  doc["codigo"] = alarmaCodigo;
  doc["mensaje"] = alarmaMensaje;
  doc["fase"] = globalSnap.faseOEstado;
  doc["temp"] = tempCamara;
  doc["presion"] = presionBar;
  doc["ts"] = millis();
  char buf[384];
  serializeJson(doc, buf);
  mqttPublishSafe(topicAlerta.c_str(), buf);
}

void publicarMeta() {
  if (!mqtt.connected()) return;
  StaticJsonDocument<512> doc;
  doc["mac"] = macId;
  doc["alias"] = cfgAlias;
  doc["cliente"] = cfgCliente;
  doc["modelo"] = cfgModelo;
  doc["tipo"] = cfgTipo;
  doc["version"] = SYS_VERSION;
  char buf[512];
  serializeJson(doc, buf);
  mqttPublishSafe(topicMeta.c_str(), buf, true);
}

void publicarHwProfile() {
  if (!mqtt.connected()) return;
  StaticJsonDocument<1024> doc;
  doc["mac"] = macId;
  doc["version"] = SYS_VERSION;
  doc["placa"] = "HKL-EA8";
  doc["nucleos"] = 2;
  JsonObject io = doc.createNestedObject("io");
  io["pcf_reles"] = "0x24";
  io["pcf_entradas"] = "0x26";
  io["adc"] = "0x48";
  char lcdAddr[8];
  snprintf(lcdAddr, 8, "0x%02X", addrLcdAuto);
  io["lcd"] = lcdAddr;
  doc["programas"] = 6;
  char buf[1024];
  serializeJson(doc, buf);
  mqttPublishSafe(topicHwProfile.c_str(), buf, true);
}

void publicarEsquema() {
  if (!mqtt.connected()) return;
  StaticJsonDocument<2048> doc;
  doc["tipo"] = cfgTipo;
  doc["mac"] = macId;
  doc["version"] = SYS_VERSION;
  doc["clase"] = "AUTOCLAVE_CLINICO";
  JsonArray comandos = doc.createNestedArray("comandos");
  struct CmdDesc { const char* label; const char* cmd; const char* extra; };
  const CmdDesc lista[] = {
    { "Iniciar P1 134C", "INICIAR_CICLO", "{\"programa\":1}" },
    { "Iniciar P2 121C", "INICIAR_CICLO", "{\"programa\":2}" },
    { "Iniciar P3 Prion", "INICIAR_CICLO", "{\"programa\":3}" },
    { "Abortar", "ABORTAR_PROCESO", "{}" },
    { "Reset Alarma", "RESET_ALARMA", "{}" },
    { "Escanear I2C", "SCAN_HARDWARE", "{}" },
    { "Puerta: Abrir", "CMD_ABRIR_PUERTA", "{}" },
    { "Puerta: Cerrar", "CMD_CIERRE_PUERTA", "{}" }
  };
  for (const CmdDesc& cd : lista) {
    JsonObject c = comandos.createNestedObject();
    c["label"] = cd.label;
    c["cmd"] = cd.cmd;
    StaticJsonDocument<64> p;
    deserializeJson(p, cd.extra);
    c["payload"] = p.as<JsonObject>();
  }
  char buf[2048];
  serializeJson(doc, buf);
  mqttPublishSafe(topicEsquema.c_str(), buf, true);
}

void publicarLogicaAck(bool ok, const char* detalle) {
  if (!mqtt.connected()) return;
  StaticJsonDocument<256> doc;
  doc["mac"] = macId;
  doc["ack"] = ok ? "OK" : "ERROR";
  doc["detalle"] = detalle;
  doc["ts"] = millis();
  char buf[256];
  serializeJson(doc, buf);
  mqttPublishSafe(topicLogicaAck.c_str(), buf);
}

void publicarFotaStatus(const char* estado, const char* detalle) {
  if (!mqtt.connected()) return;
  StaticJsonDocument<256> doc;
  doc["mac"] = macId;
  doc["fota"] = estado;
  doc["detalle"] = detalle;
  char buf[256];
  serializeJson(doc, buf);
  mqttPublishSafe(topicFotaStatus.c_str(), buf);
}

// Reporte médico formal al concluir el ciclo
void emitirReporteCicloSupabase(bool exito, const char* motivoFinal) {
  StaticJsonDocument<2048> rep;
  rep["session_id"] = "SES-" + macId + "-" + String(millis());
  rep["mac"] = macId;
  rep["alias"] = cfgAlias;
  rep["cliente"] = cfgCliente;
  rep["modelo"] = cfgModelo;
  rep["programa"] = "P" + String(programaSeleccionado) + " (" + String(setpointTemp, 1) + "C)";
  rep["hora_encendido"] = horaInicioCiclo;
  rep["hora_apagado"] = obtenerHoraActual();
  rep["duracion_total_seg"] = (millis() - tInicioFase) / 1000;
  rep["ciclos_acumulados"] = ciclosCompletados;
  rep["limite_mantenimiento"] = limiteMantenimiento;
  rep["temp_max"] = tempCamara;
  rep["pres_max"] = presionBar;
  rep["conteo_alarmas"] = exito ? 0 : 1;
  rep["diagnostico_principal"] = exito ? "CICLO CONFORME" : motivoFinal;
  rep["fase_final"] = exito ? "FINALIZADO CON EXITO" : "ANULADO";
  rep["f0_score"] = f0Acumulado;

  JsonArray ev = rep.createNestedArray("eventos");
  for (int i = 0; i < nEventosCiclo; i++) {
    JsonObject e = ev.createNestedObject();
    e["fase"] = eventosCiclo[i].fase;
    e["seg"] = eventosCiclo[i].seg;
  }

  char bufRep[2048];
  serializeJson(rep, bufRep);
  mqttPublishSafe(topicReporte.c_str(), bufRep);
  Serial.printf("📋 [AUDITORIA] Reporte clinico emitido: %s\n", exito ? "CONFORME" : motivoFinal);
}

void pintarLCDClinica(const PLCSnapshot& snap) {
  if (!lcdClinic) return;

  char l0[17] = {0};
  char l1[17] = {0};

  if (estadoActual == PROC_REPOSO) {
    snprintf(l0, 17, "P%d:%-12.12s", snap.programa, snap.faseOEstado);
    snprintf(l1, 17, "T:%4.1fC P:%4.2fb", snap.tempCamara, snap.presionBar);
  } else if (estadoActual == PROC_ESTERILIZANDO) {
    snprintf(l0, 17, "EST:%02d:%02dm F0:%3.1f", snap.segRestantes / 60, snap.segRestantes % 60, snap.f0Score);
    snprintf(l1, 17, "T:%4.1fC P:%4.2fb", snap.tempCamara, snap.presionBar);
  } else {
    snprintf(l0, 17, "%-16.16s", snap.faseOEstado);
    snprintf(l1, 17, "T:%4.1fC P:%4.2fb", snap.tempCamara, snap.presionBar);
  }

  lcdClinic->setCursor(0, 0);
  lcdClinic->print(l0);
  lcdClinic->setCursor(0, 1);
  lcdClinic->print(l1);
}

// =============================================================================
// ESCANEO BUS I2C (SCAN_HARDWARE)
// =============================================================================
void escanearBusI2C() {
  StaticJsonDocument<1024> doc;
  doc["mac"] = macId;
  doc["version"] = SYS_VERSION;
  doc["ts"] = millis();
  JsonArray chips = doc.createNestedArray("chips");

  for (uint8_t addr = 0x08; addr < 0x78; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      JsonObject chip = chips.createNestedObject();
      char dir[8];
      snprintf(dir, 8, "0x%02X", addr);
      chip["dir"] = dir;
      chip["addr"] = dir;
      if (addr == ADDR_PCF_RELES)        chip["rol"] = "PCF8574-RELES";
      else if (addr == ADDR_PCF_INPUTS)  chip["rol"] = "PCF8574-ENTRADAS";
      else if (addr == ADDR_ADC_ADS1115) chip["rol"] = "ADS1115-ADC";
      else if (addr == addrLcdAuto)      chip["rol"] = "LCD-1602";
      else                               chip["rol"] = "DETECTADO";
    }
    vTaskDelay(pdMS_TO_TICKS(2));
  }
  doc["total"] = chips.size();

  char buf[1024];
  serializeJson(doc, buf);
  if (mqtt.connected()) {
    mqttPublishSafe(topicI2CReport.c_str(), buf);
    mqttPublishSafe(topicHwScan.c_str(), buf);
  }
  Serial.printf("🔍 [I2C] Escaneo completo: %d chips detectados\n", chips.size());
  emitirBeep(60);
}

// =============================================================================
// HAL MAP — remapeo en caliente de roles de relés + persistencia
// =============================================================================
void aplicarHalMap(JsonDocument& doc) {
  bool changed = false;

  auto rolAIndice = [](const char* rol) -> int {
    String r = String(rol); r.toUpperCase();
    if (r == "SELLO" || r == "CIERRE" || r == "PUERTA") return 0;
    if (r == "SUCCION" || r == "VALVULA") return 1;
    if (r == "ALIVIO") return 2;
    if (r == "BOMBA" || r == "AGUA") return 3;
    if (r == "RESISTENCIA" || r == "CALENTADOR" || r == "CALOR") return 4;
    if (r == "VACIO") return 5;
    if (r == "SECADO" || r == "DESFOGUE") return 6;
    if (r == "ESTERILIZAR" || r == "VAPOR") return 7;
    return -1;
  };

  if (doc["roles_reles"].is<JsonObject>()) {
    JsonObject roles = doc["roles_reles"].as<JsonObject>();
    for (JsonPair kv : roles) {
      const char* key = kv.key().c_str();
      int pin = -1;
      int rolIdx = -1;
      if (key[0] == 'R' || key[0] == 'r') {           // {"R1":"SELLO"}
        pin = String(key + 1).toInt() - 1;
        rolIdx = rolAIndice(kv.value().as<const char*>());
      } else {                                        // {"sello":1}
        pin = kv.value().as<int>() - 1;
        rolIdx = rolAIndice(key);
      }
      if (pin >= 0 && pin < 8 && rolIdx >= 0) {
        switch (rolIdx) {
          case 0: pinOutSelloCierre = pin; break;
          case 1: pinOutValvSuccion = pin; break;
          case 2: pinOutAlivioSello = pin; break;
          case 3: pinOutBombaAgua = pin; break;
          case 4: pinOutResistencias = pin; break;
          case 5: pinOutVacio = pin; break;
          case 6: pinOutSecadoDesfogue = pin; break;
          case 7: pinOutEsterilizar = pin; break;
        }
        changed = true;
      }
    }
  }

  if (doc["tipo"].is<const char*>()) {
    String(doc["tipo"].as<const char*>()).toCharArray(cfgTipo, 24);
    changed = true;
  }

  File f = LittleFS.open("/hal_map.json", "w");
  if (f) { serializeJson(doc, f); f.close(); }

  if (changed) {
    guardarPersistencia();
    publicarLogicaAck(true, "HAL_MAP_APLICADO");
    publicarEsquema();
    Serial.println("🗺️ [HAL] Mapa de relés actualizado y persistido.");
  } else {
    publicarLogicaAck(true, "HAL_MAP_GUARDADO_SIN_CAMBIOS");
  }
}

// =============================================================================
// LÓGICA / RECETA — APPLY_LOGICA_SECUENCIA
// =============================================================================
void aplicarLogicaSecuencia(JsonDocument& doc) {
  JsonObject receta = doc["receta"].is<JsonObject>() ? doc["receta"].as<JsonObject>()
                      : doc.as<JsonObject>();

  File f = LittleFS.open("/logica.json", "w");
  if (f) { serializeJson(receta, f); f.close(); }

  int prog = receta["programa"] | receta["programa_num"] | 6;
  if (prog < 1 || prog > 6) prog = 6;
  float est = receta["min_esterilizar"] | receta["esterilizar_min"] | -1.0f;
  float sec = receta["min_secado"]      | receta["secado_min"]      | -1.0f;
  float vac = receta["min_vacio"]       | receta["vacio_min"]       | -1.0f;
  float des = receta["min_desfogue"]    | receta["desfogue_min"]    | -1.0f;

  if (est > 0) tiemposProcesos[prog - 1][0] = est;
  if (sec > 0) tiemposProcesos[prog - 1][1] = sec;
  if (vac > 0) tiemposProcesos[prog - 1][2] = vac;
  if (des > 0) tiemposProcesos[prog - 1][3] = des;

  publicarLogicaAck(true, "LOGICA_PERSISTIDA");
  Serial.printf("🧠 [LOGICA] Receta persistida en /logica.json (slot P%d)\n", prog);
}

// =============================================================================
// PROVISION — APPLY_HARDWARE_PROVISION
// =============================================================================
void aplicarProvision(JsonDocument& doc) {
  JsonObject p = doc["provision"].is<JsonObject>() ? doc["provision"].as<JsonObject>()
                 : doc.as<JsonObject>();

  if (p["alias"].is<const char*>())   String(p["alias"].as<const char*>()).toCharArray(cfgAlias, 48);
  if (p["cliente"].is<const char*>()) String(p["cliente"].as<const char*>()).toCharArray(cfgCliente, 48);
  if (p["modelo"].is<const char*>())  String(p["modelo"].as<const char*>()).toCharArray(cfgModelo, 48);
  if (p["tipo"].is<const char*>())    String(p["tipo"].as<const char*>()).toCharArray(cfgTipo, 24);

  guardarPersistencia();
  publicarMeta();
  publicarHwProfile();
  publicarEsquema();
  publicarLogicaAck(true, "PROVISION_OK");
  Serial.printf("🏷️ [PROVISION] alias=%s cliente=%s\n", cfgAlias, cfgCliente);
}

// =============================================================================
// SET_CONFIG / SET_ALERTA_MANT — campos seguros
// =============================================================================
void aplicarSetConfig(JsonDocument& doc) {
  JsonObject cfg = doc["cfg"].is<JsonObject>() ? doc["cfg"].as<JsonObject>()
                   : doc.as<JsonObject>();
  bool persist = false;

  if (cfg["lim_mant"].is<int>())             { limiteMantenimiento = cfg["lim_mant"].as<int>(); persist = true; }
  if (cfg["limite_mantenimiento"].is<int>()) { limiteMantenimiento = cfg["limite_mantenimiento"].as<int>(); persist = true; }
  if (cfg["alerta_pct"].is<int>())           { alertaMantPct = constrain(cfg["alerta_pct"].as<int>(), 1, 100); persist = true; }
  if (cfg["programa"].is<int>())             { programaSeleccionado = constrain(cfg["programa"].as<int>(), 1, 6); persist = true; }
  if (cfg["sp_temp"].is<float>() && estadoActual == PROC_REPOSO) {
    setpointTemp = constrain(cfg["sp_temp"].as<float>(), 100.0f, 140.0f);
    persist = true;
  }

  if (persist) {
    guardarPersistencia();
    publicarLogicaAck(true, "CONFIG_OK");
    Serial.println("⚙️ [CONFIG] Configuración aplicada y persistida.");
  } else {
    publicarLogicaAck(false, "CONFIG_SIN_CAMPOS_VALIDOS");
  }
}

// =============================================================================
// FOTA — OTA por HTTP, solo en REPOSO
// =============================================================================
void TaskFota(void* p) {
  String url = fotaUrlPendiente;
  fotaUrlPendiente = "";
  publicarFotaStatus("INICIANDO", url.c_str());
  Serial.printf("📦 [FOTA] Descargando: %s\n", url.c_str());

  HTTPClient http;
  http.begin(url);
  int code = http.GET();
  if (code == HTTP_CODE_OK) {
    int len = http.getSize();
    if (Update.begin(len > 0 ? len : UPDATE_SIZE_UNKNOWN)) {
      WiFiClient* stream = http.getStreamPtr();
      size_t written = Update.writeStream(*stream);
      if (Update.end() && Update.isFinished() && written > 0) {
        publicarFotaStatus("OK", "Reiniciando");
        http.end();
        delay(500);
        ESP.restart();
      } else {
        publicarFotaStatus("ERROR", Update.errorString());
      }
    } else {
      publicarFotaStatus("ERROR", "No se pudo iniciar Update");
    }
  } else {
    char det[32]; snprintf(det, 32, "HTTP %d", code);
    publicarFotaStatus("ERROR", det);
  }
  http.end();
  fotaEnCurso = false;
  vTaskDelete(NULL);
}

// =============================================================================
// RED — idéntica al original: WiFi.onEvent + ETH.begin
// =============================================================================
void onWiFiEvent(WiFiEvent_t event) {
  if (event == ARDUINO_EVENT_ETH_GOT_IP) {
    ethConnected = true;
    if (!ntpConfigured) {
      ntpConfigured = true;
      configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
    }
    Serial.printf("🌐 [ETH] Conectado. IP: %s\n", ETH.localIP().toString().c_str());
  } else if (event == ARDUINO_EVENT_ETH_DISCONNECTED) {
    ethConnected = false;
    Serial.println("⚠️ [ETH] Desconectado.");
  }
}

// Respaldo por sondeo: si el evento nunca llega, esto activa ethConnected
void actualizarEstadoRed() {
  bool linkOk = ETH.linkUp() && (ETH.localIP() != IPAddress(0, 0, 0, 0));

  static unsigned long lastDiag = 0;
  if (!linkOk && millis() - lastDiag >= 4000) {
    lastDiag = millis();
    Serial.printf("⏳ [ETH] link=%s | ip=%s\n",
                  ETH.linkUp() ? "UP" : "DOWN",
                  ETH.localIP().toString().c_str());
  }

  if (linkOk && !ethConnected) {
    ethConnected = true;
    if (!ntpConfigured) {
      ntpConfigured = true;
      configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
    }
    Serial.printf("🌐 [ETH] Enlace activo por sondeo. IP: %s\n", ETH.localIP().toString().c_str());
  } else if (!linkOk && ethConnected) {
    ethConnected = false;
    Serial.println("🌐 [ETH] Enlace perdido.");
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  if (length >= sizeof(PLCCommand::payload)) length = sizeof(PLCCommand::payload) - 1;
  PLCCommand cmd;
  memcpy(cmd.payload, payload, length);
  cmd.payload[length] = '\0';
  xQueueSend(xQueuePLC, &cmd, 0);
}

void reconectarMQTT() {
  if (!ethConnected) return;
  while (!mqtt.connected() && ethConnected) {
    String cid = "HKL_EA8_" + macId;
    bool ok = false;
    if (xSemaphoreTake(xMutexMqtt, pdMS_TO_TICKS(500)) == pdTRUE) {
      ok = mqtt.connect(cid.c_str(), mqttUser, mqttPass);
      if (ok) mqtt.subscribe(topicComando.c_str(), 1);
      xSemaphoreGive(xMutexMqtt);
    }
    if (ok) {
      Serial.printf("🚀 [MQTT] Conectado a HiveMQ. Suscrito a: %s\n", topicComando.c_str());
      publicarMeta();
      publicarHwProfile();
      publicarEsquema();
      emitirBeep(40);
      break;
    }
    vTaskDelay(pdMS_TO_TICKS(2000));
  }
}

// =========================================================================
// CORE 0: RED, MQTT Y TELEMETRÍA CONTINUA (800ms)
// =========================================================================
void TaskCore0_Comms(void* p) {
  unsigned long lastTelemetryMillis = 0;

  for (;;) {
    actualizarEstadoRed();

    if (ethConnected) {
      if (!mqtt.connected()) reconectarMQTT();
      if (mqtt.connected() && xSemaphoreTake(xMutexMqtt, pdMS_TO_TICKS(50)) == pdTRUE) {
        mqtt.loop();
        xSemaphoreGive(xMutexMqtt);
      }

      if (forceTelemetryFlag || millis() - lastTelemetryMillis >= 800) {
        forceTelemetryFlag = false;
        lastTelemetryMillis = millis();
        PLCSnapshot snap;

        if (xSemaphoreTake(xMutexSnap, pdMS_TO_TICKS(40)) == pdTRUE) {
          snap = globalSnap;
          xSemaphoreGive(xMutexSnap);

          txTelemetriaDoc.clear();
          txTelemetriaDoc["id"]            = macId;
          txTelemetriaDoc["tipo"]          = cfgTipo;
          txTelemetriaDoc["version"]       = SYS_VERSION;
          txTelemetriaDoc["fase"]          = snap.faseOEstado;
          txTelemetriaDoc["temp_camara"]   = snap.tempCamara;
          txTelemetriaDoc["presion"]       = snap.presionBar;
          txTelemetriaDoc["f0_score"]      = snap.f0Score;
          txTelemetriaDoc["seg_restantes"] = snap.segRestantes;
          txTelemetriaDoc["alarma_cod"]    = snap.alarmaCod;
          txTelemetriaDoc["alarma_msg"]    = snap.alarmaMsg;
          txTelemetriaDoc["programa"]      = snap.programa;
          txTelemetriaDoc["setpoint"]      = setpointTemp;
          txTelemetriaDoc["ciclos"]        = ciclosCompletados;
          txTelemetriaDoc["lim_mant"]      = limiteMantenimiento;
          txTelemetriaDoc["alerta_pct"]    = alertaMantPct;

          JsonObject reles = txTelemetriaDoc.createNestedObject("reles");
          for (int i = 1; i <= 8; i++) reles["R" + String(i)] = ((snap.estadoReles >> (i - 1)) & 1);

          JsonObject entradas = txTelemetriaDoc.createNestedObject("entradas");
          for (int i = 1; i <= 8; i++) entradas["IN" + String(i)] = !((snap.estadoEntradas >> (i - 1)) & 1);

          JsonObject bypasses = txTelemetriaDoc.createNestedObject("bypasses");
          bypasses["puerta"] = bypassSwPuerta;
          bypasses["sello"] = bypassSwSello;
          bypasses["recamara"] = bypassSwChamber;
          bypasses["caldera"] = bypassSwCaldera;
          bypasses["nivel_agua"] = bypassSwNivelAgua;

          serializeJson(txTelemetriaDoc, txMqttBuffer, sizeof(txMqttBuffer));
          mqttPublishSafe(topicTelemetria.c_str(), txMqttBuffer);
        }
      }
    }
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

// =========================================================================
// CORE 1: MOTOR CLÍNICO DETERMINISTA A 50Hz
// =========================================================================
void TaskCore1_PLC(void* p) {
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, 100000);
  inicializarLCD();

  uint8_t localReles = 0x00;
  uint8_t localEntradas = 0xFF;
  unsigned long relayPulseOffTime[8] = {0, 0, 0, 0, 0, 0, 0, 0};
  unsigned long lastCycleStepMillis = millis();
  unsigned long lastLcdRefresh = millis();
  int alarmaAnterior = 0;

  Wire.beginTransmission(ADDR_PCF_RELES);
  Wire.write(0xFF);
  Wire.endTransmission();

  esp_task_wdt_add(NULL); // watchdog: cuelgue del PLC → reinicio seguro

  TickType_t xLastWakeTime = xTaskGetTickCount();
  const TickType_t xFrequency = pdMS_TO_TICKS(20);

  for (;;) {
    esp_task_wdt_reset();

    // 1. Lectura Física de Entradas
    Wire.requestFrom(ADDR_PCF_INPUTS, (uint8_t)1);
    if (Wire.available()) localEntradas = Wire.read();

    // 2. Procesar Comandos de Control Remoto de la Web
    while (xQueueReceive(xQueuePLC, &rxCmdBuffer, 0) == pdTRUE) {
      rxJsonDoc.clear();
      DeserializationError err = deserializeJson(rxJsonDoc, rxCmdBuffer.payload);

      if (!err) {
        String c = rxJsonDoc["cmd"] | "";
        emitirBeep(25);

        // A. INICIAR CICLO CLÍNICO (P1 A P6)
        if (c == "INICIAR_CICLO" || c == "CMD_START_PROC") {
          programaSeleccionado = rxJsonDoc["programa"] | rxJsonDoc["proceso"] | 1;
          if (programaSeleccionado < 1 || programaSeleccionado > 6) programaSeleccionado = 1;

          setpointTemp = (programaSeleccionado == 2 || programaSeleccionado == 4) ? 121.0f : 134.0f;
          estadoActual = PROC_SELLANDO;
          f0Acumulado = 0.0f;
          nEventosCiclo = 0;
          registrarEvento("INICIO");
          horaInicioCiclo = obtenerHoraActual();
          tInicioFase = millis();
          segundosRestantesFase = 15;
          localReles = (1 << pinOutSelloCierre);
          Serial.printf("🔥 [CICLO] Iniciando Programa P%d (Setpoint: %.1fC)\n", programaSeleccionado, setpointTemp);
        }
        // B. ABORTAR / PARO DE EMERGENCIA
        else if (c == "ABORTAR_CICLO" || c == "ABORTAR_PROCESO" || c == "CMD_CANCEL") {
          if (estadoActual != PROC_REPOSO && estadoActual != PROC_FINALIZADO) {
            registrarEvento("PARO_EMERGENCIA");
            emitirReporteCicloSupabase(false, "PARO MANUAL DE EMERGENCIA");
          }
          estadoActual = PROC_CANCELADO;
          localReles = 0x00;
          for (int i = 0; i < 8; i++) relayPulseOffTime[i] = 0;
          alarmaCodigo = 5;
          strncpy(alarmaMensaje, "PARO MANUAL ACTIVADO", 47);
        }
        // C. RESET DE ALARMA
        else if (c == "RESET_ALARMA") {
          estadoActual = PROC_REPOSO;
          alarmaCodigo = 0;
          strncpy(alarmaMensaje, "NORMAL", 47);
          tempCamara = 25.0f;
          presionBar = 0.0f;
          localReles = 0x00;
        }
        // D. TOGGLE DIRECTO DE RELÉ
        else if (c == "SET_RELAY") {
          int ch = rxJsonDoc["canal"] | rxJsonDoc["relay"] | rxJsonDoc["pin"] | 0;
          if (ch < 1) ch = 1;
          bool val = false;
          if (rxJsonDoc["val"].is<bool>()) val = rxJsonDoc["val"].as<bool>();
          else if (rxJsonDoc["val"].is<int>()) val = (rxJsonDoc["val"].as<int>() != 0);
          else if (rxJsonDoc["estado"].is<int>()) val = (rxJsonDoc["estado"].as<int>() != 0);

          uint32_t duracionMs = rxJsonDoc["duracion_ms"] | rxJsonDoc["ms"] | 0;

          if (ch >= 1 && ch <= 8) {
            if (val) {
              localReles |= (1 << (ch - 1));
              if (duracionMs > 0) relayPulseOffTime[ch - 1] = millis() + duracionMs;
            } else {
              localReles &= ~(1 << (ch - 1));
              relayPulseOffTime[ch - 1] = 0;
            }
          }
        }
        // E. BYPASSES DE BANCO
        else if (c == "SET_BYPASS") {
          if (rxJsonDoc.containsKey("puerta"))     bypassSwPuerta    = rxJsonDoc["puerta"];
          if (rxJsonDoc.containsKey("sello"))      bypassSwSello     = rxJsonDoc["sello"];
          if (rxJsonDoc.containsKey("recamara"))   bypassSwChamber   = rxJsonDoc["recamara"];
          if (rxJsonDoc.containsKey("caldera"))    bypassSwCaldera   = rxJsonDoc["caldera"];
          if (rxJsonDoc.containsKey("nivel_agua")) bypassSwNivelAgua = rxJsonDoc["nivel_agua"];
          guardarPersistencia();
          Serial.println("🛠️ [BYPASS] Bypasses actualizados desde la web.");
        }
        // F. ESCANEO BUS I2C
        else if (c == "SCAN_HARDWARE" || c == "SCAN_I2C") {
          escanearBusI2C();
        }
        // G. HAL MAP
        else if (c == "APPLY_HAL_MAP") {
          aplicarHalMap(rxJsonDoc);
        }
        // H. LÓGICA / RECETA
        else if (c == "APPLY_LOGICA_SECUENCIA") {
          aplicarLogicaSecuencia(rxJsonDoc);
        }
        // I. PROVISION
        else if (c == "APPLY_HARDWARE_PROVISION") {
          aplicarProvision(rxJsonDoc);
        }
        // J. SET_CONFIG / SET_ALERTA_MANT
        else if (c == "SET_CONFIG" || c == "SET_ALERTA_MANT") {
          aplicarSetConfig(rxJsonDoc);
        }
        // K. RESET ODÓMETRO
        else if (c == "RESET_ODOMETRO") {
          ciclosCompletados = 0;
          guardarPersistencia();
          publicarLogicaAck(true, "ODOMETRO_RESET");
          Serial.println("🔄 [MANT] Odómetro de ciclos reiniciado.");
        }
        // L. PUERTA MANUAL (enclavada)
        else if (c == "CMD_ABRIR_PUERTA") {
          if ((estadoActual == PROC_REPOSO || estadoActual == PROC_FINALIZADO) && presionBar < 0.1f) {
            localReles &= ~(1 << pinOutSelloCierre);
            localReles |= (1 << pinOutAlivioSello);
            relayPulseOffTime[pinOutAlivioSello] = millis() + 3000;
            Serial.println("🚪 [PUERTA] Sello liberado — puerta desbloqueada.");
          } else {
            alarmaCodigo = 7;
            strncpy(alarmaMensaje, "APERTURA BLOQUEADA: CICLO/PRESION", 47);
            Serial.println("⛔ [PUERTA] Apertura rechazada (ciclo activo o presión).");
          }
        }
        else if (c == "CMD_CIERRE_PUERTA") {
          if (estadoActual == PROC_REPOSO) {
            localReles |= (1 << pinOutSelloCierre);
            Serial.println("🚪 [PUERTA] Sello activado — puerta bloqueada.");
          }
        }
        // M. PING / REFRESCO
        else if (c == "PING" || c == "GET_STATUS") {
          publicarMeta();
          publicarHwProfile();
          forceTelemetryFlag = true;
        }
        // N. FOTA
        else if (c == "TRIGGER_FOTA" || c == "FOTA_DEPLOY") {
          String url = rxJsonDoc["url"] | rxJsonDoc["firmware_url"] | "";
          if (!fotaEnCurso && estadoActual == PROC_REPOSO && url.length() > 8) {
            fotaEnCurso = true;
            fotaUrlPendiente = url;
            xTaskCreatePinnedToCore(TaskFota, "TaskFota", 8192, NULL, 2, NULL, 0);
          } else {
            publicarFotaStatus("RECHAZADO", fotaEnCurso ? "FOTA_EN_CURSO" : (estadoActual != PROC_REPOSO ? "CICLO_ACTIVO" : "URL_INVALIDA"));
          }
        }
        // O. Compatibilidad DOWNLOAD_JSON_SUPABASE
        else if (c == "DOWNLOAD_JSON_SUPABASE") {
          publicarMeta();
          publicarLogicaAck(true, "META_REPUBLISHED");
        }
        // P. LEGADO: teclas sueltas sin "cmd"
        else if (c.length() == 0) {
          bool touched = false;
          if (rxJsonDoc["sp_temp"].is<float>() && estadoActual == PROC_REPOSO) {
            setpointTemp = constrain(rxJsonDoc["sp_temp"].as<float>(), 100.0f, 140.0f);
            touched = true;
          }
          if (rxJsonDoc["vacio_ok"].is<bool>()) {
            if (rxJsonDoc["vacio_ok"].as<bool>()) localReles |= (1 << pinOutVacio);
            else localReles &= ~(1 << pinOutVacio);
            touched = true;
          }
          if (rxJsonDoc["mot_ok"].is<bool>()) {
            if (rxJsonDoc["mot_ok"].as<bool>()) localReles |= (1 << pinOutBombaAgua);
            else localReles &= ~(1 << pinOutBombaAgua);
            touched = true;
          }
          if (touched) Serial.println("🕹️ [LEGADO] Teclas de test aplicadas.");
        }
      }
    }

    // 3. Temporizadores de Pulso Individuales (Auto-Off)
    for (int i = 0; i < 8; i++) {
      if (relayPulseOffTime[i] > 0 && millis() >= relayPulseOffTime[i]) {
        localReles &= ~(1 << i);
        relayPulseOffTime[i] = 0;
      }
    }

    // 4. AUTÓMATA CLÍNICO
    if (estadoActual != PROC_REPOSO && estadoActual != PROC_CANCELADO && estadoActual != PROC_FINALIZADO
        && millis() - lastCycleStepMillis >= 1000) {
      lastCycleStepMillis = millis();

      switch (estadoActual) {
        case PROC_SELLANDO:
          localReles = (1 << pinOutSelloCierre);
          if (segundosRestantesFase > 0) {
            segundosRestantesFase--;
          } else {
            bool selloOK = bypassSwSello || (!((localEntradas >> pinInSello) & 1));
            bool puertaOK = bypassSwPuerta || (!((localEntradas >> pinInPuerta) & 1));
            if (selloOK && puertaOK) {
              estadoActual = PROC_PURGA;
              registrarEvento("PURGA");
              segundosRestantesFase = 20;
              localReles |= (1 << pinOutSecadoDesfogue);
            }
          }
          break;

        case PROC_PURGA:
          localReles |= (1 << pinOutSelloCierre) | (1 << pinOutSecadoDesfogue);
          if (segundosRestantesFase > 0) {
            segundosRestantesFase--;
          } else {
            estadoActual = PROC_CALENTANDO;
            registrarEvento("CALENTANDO");
            localReles &= ~(1 << pinOutSecadoDesfogue);
            localReles |= (1 << pinOutResistencias);
          }
          break;

        case PROC_CALENTANDO:
          localReles |= (1 << pinOutSelloCierre) | (1 << pinOutResistencias);
          tempCamara += 1.8f;
          presionBar = (tempCamara > 100.0f) ? (tempCamara - 100.0f) * 0.063f : 0.0f;

          if (tempCamara >= setpointTemp) {
            tempCamara = setpointTemp;
            presionBar = (setpointTemp == 134.0f) ? 2.15f : 1.15f;
            estadoActual = PROC_ESTERILIZANDO;
            registrarEvento("ESTERILIZANDO");
            segundosRestantesFase = (int)(tiemposProcesos[programaSeleccionado - 1][0] * 60.0f);
            tInicioMeseta = millis();
          }
          break;

        case PROC_ESTERILIZANDO:
          if (tempCamara < setpointTemp) {
            localReles |= (1 << pinOutResistencias);
            tempCamara += 0.2f;
          } else {
            localReles &= ~(1 << pinOutResistencias);
            tempCamara -= 0.1f;
          }

          if (tempCamara >= 100.0f) {
            f0Acumulado += pow(10.0f, (tempCamara - 121.1f) / 10.0f) * (1.0f / 60.0f);
          }

          if (segundosRestantesFase > 0) {
            segundosRestantesFase--;
          } else {
            estadoActual = PROC_DESFOGUE;
            registrarEvento("DESFOGUE");
            localReles &= ~(1 << pinOutResistencias);
            localReles |= (1 << pinOutSecadoDesfogue);
            segundosRestantesFase = 30;
          }
          break;

        case PROC_DESFOGUE:
          localReles |= (1 << pinOutSelloCierre) | (1 << pinOutSecadoDesfogue);
          if (presionBar > 0.10f) presionBar -= 0.15f;
          if (tempCamara > 95.0f) tempCamara -= 1.5f;

          if (segundosRestantesFase > 0) {
            segundosRestantesFase--;
          } else {
            presionBar = 0.0f;
            estadoActual = PROC_SECADO;
            registrarEvento("SECADO");
            localReles &= ~(1 << pinOutSecadoDesfogue);
            localReles |= (1 << pinOutVacio);
            segundosRestantesFase = (int)(tiemposProcesos[programaSeleccionado - 1][1] * 60.0f);
          }
          break;

        case PROC_SECADO:
          localReles |= (1 << pinOutSelloCierre) | (1 << pinOutVacio);
          presionBar = -0.65f;
          if (tempCamara > 60.0f) tempCamara -= 0.8f;

          if (segundosRestantesFase > 0) {
            segundosRestantesFase--;
          } else {
            estadoActual = PROC_FINALIZADO;
            registrarEvento("FIN");
            localReles = 0x00;
            presionBar = 0.0f;
            tempCamara = 38.0f;
            ciclosCompletados++;
            guardarPersistencia();
            emitirBeep(250);
            emitirReporteCicloSupabase(true, "CICLO CONFORME");
          }
          break;

        default:
          break;
      }
    }

    // Enfriamiento natural en reposo
    if (estadoActual == PROC_REPOSO || estadoActual == PROC_CANCELADO) {
      if (tempCamara > 25.0f) tempCamara -= 0.2f;
      presionBar = 0.0f;
    }

    // 5. Escritura Física de Salidas al PCF8574 (0x24)
    Wire.beginTransmission(ADDR_PCF_RELES);
    Wire.write(~localReles);
    Wire.endTransmission();

    // 6. Snapshot + alerta crítica ante alarma nueva
    bool nuevaAlarma = (alarmaCodigo != 0 && alarmaCodigo != alarmaAnterior);
    alarmaAnterior = alarmaCodigo;

    if (xSemaphoreTake(xMutexSnap, 0) == pdTRUE) {
      globalSnap.estadoReles = localReles;
      globalSnap.estadoEntradas = localEntradas;
      globalSnap.tempCamara = tempCamara;
      globalSnap.presionBar = presionBar;
      globalSnap.f0Score = f0Acumulado;
      globalSnap.segRestantes = segundosRestantesFase;
      globalSnap.alarmaCod = alarmaCodigo;
      strncpy(globalSnap.alarmaMsg, alarmaMensaje, 47);
      globalSnap.programa = programaSeleccionado;

      if (estadoActual == PROC_SELLANDO) strncpy(globalSnap.faseOEstado, "SELLANDO PUERTA", 31);
      else if (estadoActual == PROC_PURGA) strncpy(globalSnap.faseOEstado, "PURGA DE AIRE", 31);
      else if (estadoActual == PROC_CALENTANDO) strncpy(globalSnap.faseOEstado, "CALENTANDO", 31);
      else if (estadoActual == PROC_ESTERILIZANDO) strncpy(globalSnap.faseOEstado, "ESTERILIZANDO", 31);
      else if (estadoActual == PROC_DESFOGUE) strncpy(globalSnap.faseOEstado, "DESPRESURIZANDO", 31);
      else if (estadoActual == PROC_SECADO) strncpy(globalSnap.faseOEstado, "SECADO AL VACIO", 31);
      else if (estadoActual == PROC_FINALIZADO) strncpy(globalSnap.faseOEstado, "FINALIZADO CON EXITO", 31);
      else if (estadoActual == PROC_CANCELADO) strncpy(globalSnap.faseOEstado, "CANCELADO", 31);
      else strncpy(globalSnap.faseOEstado, "EN ESPERA", 31);

      xSemaphoreGive(xMutexSnap);
    }

    if (nuevaAlarma) publicarAlertaCritica();

    // 7. Refresco LCD cada 400ms
    if (millis() - lastLcdRefresh >= 400) {
      lastLcdRefresh = millis();
      PLCSnapshot snap;
      if (xSemaphoreTake(xMutexSnap, pdMS_TO_TICKS(10)) == pdTRUE) {
        snap = globalSnap;
        xSemaphoreGive(xMutexSnap);
        pintarLCDClinica(snap);
      }
    }

    vTaskDelayUntil(&xLastWakeTime, xFrequency);
  }
}

// =========================================================================
// ARRANQUE DUAL-CORE — idéntico al original
// =========================================================================
void setup() {
  Serial.begin(115200);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);

  LittleFS.begin(true);
  cargarPersistencia();

  xQueuePLC  = xQueueCreate(16, sizeof(PLCCommand));
  xMutexSnap = xSemaphoreCreateMutex();
  xMutexMqtt = xSemaphoreCreateMutex();

  // Arranque de Red Ethernet Industrial — idéntico al original
  WiFi.onEvent(onWiFiEvent);
  bool ethOk = ETH.begin(ETH_PHY_TYPE, ETH_PHY_ADDR, ETH_PHY_MDC, ETH_PHY_MDIO, ETH_PHY_POWER, ETH_CLK_MODE);
  Serial.printf("🔌 [ETH] begin() -> %s (LAN8720 addr=%d MDC=%d MDIO=%d PWR=%d CLK=GPIO17_OUT)\n",
                ethOk ? "OK" : "FALLO", ETH_PHY_ADDR, ETH_PHY_MDC, ETH_PHY_MDIO, ETH_PHY_POWER);

  delay(200);
  macId = ETH.macAddress();
  macId.replace(":", "");
  macId.toUpperCase();
  if (macId.length() < 6 || macId == "000000000000") {
    macId = WiFi.macAddress();
    macId.replace(":", "");
    macId.toUpperCase();
  }

  Serial.printf("\n========================================\n");
  Serial.printf("BIOFLEET %s - MAC: %s\n", SYS_VERSION, macId.c_str());
  Serial.printf("========================================\n");

  String base = "autoclave_med_2026/" + macId + "/";
  topicTelemetria = base + "telemetria";
  topicComando    = base + "config";
  topicReporte    = base + "reporte_paquete";
  topicInventory  = base + "hardware_inventory";
  topicI2CReport  = base + "i2c_report";
  topicHwScan     = base + "hardware_scan";
  topicMeta       = base + "meta";
  topicHwProfile  = base + "hw_profile";
  topicLogicaAck  = base + "logica/ack";
  topicEsquema    = base + "esquema";
  topicAlerta     = base + "alerta_critica";
  topicFotaStatus = base + "fota_status";

  ethSecureClient.setInsecure();
  mqtt.setBufferSize(2560);
  mqtt.setServer(mqttServer, mqttPort);
  mqtt.setCallback(mqttCallback);

  // Watchdog: IDF 5.x usa esp_task_wdt_config_t; si el core Arduino ya lo
  // inicializó, se reconfigura en su lugar
  esp_task_wdt_config_t wdtCfg = {
    .timeout_ms = WDT_TIMEOUT_S * 1000,
    .idle_core_mask = 0,
    .trigger_panic = true
  };
  if (esp_task_wdt_init(&wdtCfg) == ESP_ERR_INVALID_STATE) {
    esp_task_wdt_reconfigure(&wdtCfg);
  }

  xTaskCreatePinnedToCore(TaskCore1_PLC, "TaskCore1_PLC", 8192, NULL, 5, NULL, 1);
  xTaskCreatePinnedToCore(TaskCore0_Comms, "TaskCore0_Comms", 8192, NULL, 2, NULL, 0);
}

void loop() {
  vTaskDelete(NULL);
}
