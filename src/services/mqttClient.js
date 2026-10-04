import mqtt from 'mqtt';

const BROKER_URL = 'wss://d15a5980139147d99bb9e2ad3825e62e.s1.eu.hivemq.cloud:8884/mqtt';
const MQTT_USER = 'admin_autoclave';
const MQTT_PASS = '24331973';

export const connectMqttFleet = (onMessageReceived, onStatusChange) => {
  const clientId = 'SCADA_V2_' + Math.random().toString(36).substring(2, 9);

  const client = mqtt.connect(BROKER_URL, {
    clientId,
    username: MQTT_USER,
    password: MQTT_PASS,
    clean: true,
    keepalive: 60,
    reconnectPeriod: 3000
  });

  client.on('connect', () => {
    if (onStatusChange) onStatusChange(true);
    client.subscribe('autoclave_med_2026/+/telemetria');
    client.subscribe('autoclave_med_2026/+/esquema');
    client.subscribe('autoclave_med_2026/+/meta');
    client.subscribe('autoclave_med_2026/+/reporte_paquete');
    client.subscribe('autoclave_med_2026/+/alerta_critica');
  });

  client.on('error', (err) => {
    console.warn('[MQTT ERROR]', err);
    if (onStatusChange) onStatusChange(false);
  });

  client.on('offline', () => {
    if (onStatusChange) onStatusChange(false);
  });

  // Detecta packet.retain para saber si es en vivo o histórico
  client.on('message', (topic, message, packet) => {
    try {
      const payload = JSON.parse(message.toString());
      const parts = topic.split('/');
      const mac = parts[1];
      const channel = parts[2];
      const isRetained = Boolean(packet && packet.retain);

      if (onMessageReceived) {
        onMessageReceived({ mac, channel, payload, topic, isRetained });
      }
    } catch (e) {
      console.warn('[MQTT PARSE ERROR]', e);
    }
  });

  const sendCommand = (mac, cmdObject) => {
    if (client && client.connected) {
      const topic = `autoclave_med_2026/${mac}/config`;
      client.publish(topic, JSON.stringify(cmdObject), { qos: 1 });
    }
  };

  return { client, sendCommand };
};
