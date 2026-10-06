import mqtt from 'mqtt';

const BROKER_URL = 'wss://d15a5980139147d99bb9e2ad3825e62e.s1.eu.hivemq.cloud:8884/mqtt';
const MQTT_USER = 'admin_autoclave';
const MQTT_PASS = '24331973';

// =========================================================================
// MULTIPLEXOR MULTI-PESTAÑA (LEADER ELECTION VIA BROADCASTCHANNEL)
// Comparte 1 SOLA conexión real a HiveMQ entre todas las pestañas abiertas
// =========================================================================

export const connectMqttFleet = (onMessageReceived, onStatusChange) => {
  const tabId = 'TAB_' + Math.random().toString(36).substring(2, 9);
  const CHANNEL_NAME = 'scada_hivemq_mesh_v2';
  
  let broadcast = null;
  let isLeader = false;
  let leaderHeartbeatTimer = null;
  let checkLeaderTimer = null;
  let lastLeaderPulse = 0;
  let mqttClient = null;

  // Comprobar soporte de BroadcastChannel en el navegador
  const hasBroadcastSupport = typeof window !== 'undefined' && 'BroadcastChannel' in window;
  if (hasBroadcastSupport) {
    broadcast = new BroadcastChannel(CHANNEL_NAME);
  }

  // Función para conectarse físicamente a HiveMQ (Solo la ejecuta la Pestaña Líder)
  const startMqttConnection = () => {
    if (mqttClient) return;

    const clientId = 'SCADA_LEADER_' + Math.random().toString(36).substring(2, 8);
    mqttClient = mqtt.connect(BROKER_URL, {
      clientId,
      username: MQTT_USER,
      password: MQTT_PASS,
      clean: true,
      keepalive: 60,
      reconnectPeriod: 2500
    });

    mqttClient.on('connect', () => {
      if (onStatusChange) onStatusChange(true);

      // Suscripciones en el broker
      mqttClient.subscribe('autoclave_med_2026/+/telemetria');
      mqttClient.subscribe('autoclave_med_2026/+/esquema');
      mqttClient.subscribe('autoclave_med_2026/+/meta');
      mqttClient.subscribe('autoclave_med_2026/+/reporte_paquete');
      mqttClient.subscribe('autoclave_med_2026/+/alerta_critica');

      // Avisar a todas las demás pestañas que la conexión está viva
      if (broadcast) {
        broadcast.postMessage({ type: 'STATUS_UPDATE', status: true });
      }
    });

    mqttClient.on('error', (err) => {
      console.warn('[MQTT LEADER ERROR]', err);
      if (onStatusChange) onStatusChange(false);
      if (broadcast) broadcast.postMessage({ type: 'STATUS_UPDATE', status: false });
    });

    mqttClient.on('offline', () => {
      if (onStatusChange) onStatusChange(false);
      if (broadcast) broadcast.postMessage({ type: 'STATUS_UPDATE', status: false });
    });

    // Cuando llega un mensaje físico desde HiveMQ
    mqttClient.on('message', (topic, message, packet) => {
      try {
        const payload = JSON.parse(message.toString());
        const parts = topic.split('/');
        const mac = parts[1];
        const channel = parts[2];
        const isRetained = Boolean(packet && packet.retain);

        const packetData = { mac, channel, payload, topic, isRetained };

        // 1. Entregar el dato a la pestaña líder
        if (onMessageReceived) onMessageReceived(packetData);

        // 2. Repartir el dato por memoria interna a las otras pestañas sin gastar HiveMQ
        if (broadcast) {
          broadcast.postMessage({ type: 'INCOMING_MQTT', packetData });
        }
      } catch (e) {
        console.warn('[MQTT PARSE ERROR]', e);
      }
    });
  };

  // Promover esta pestaña a Líder
  const electAsLeader = () => {
    if (isLeader) return;
    isLeader = true;
    startMqttConnection();

    // Emitir latido continuo a las demás pestañas cada 1 segundo
    leaderHeartbeatTimer = setInterval(() => {
      if (broadcast) {
        broadcast.postMessage({ type: 'LEADER_PULSE', leaderId: tabId });
      }
    }, 1000);
  };

  if (hasBroadcastSupport) {
    // Escuchar mensajes internos entre pestañas
    broadcast.onmessage = (event) => {
      const msg = event.data;
      if (!msg) return;

      // Si recibimos latido del líder, sabemos que hay otra pestaña encargada de HiveMQ
      if (msg.type === 'LEADER_PULSE') {
        lastLeaderPulse = Date.now();
        if (onStatusChange) onStatusChange(true);
      }

      // Si somos una pestaña esclava y nos llega un paquete retransmitido por la líder
      if (msg.type === 'INCOMING_MQTT' && !isLeader) {
        if (onMessageReceived) onMessageReceived(msg.packetData);
      }

      // Si una pestaña esclava quiere enviar un comando, la líder lo publica en HiveMQ
      if (msg.type === 'FORWARD_COMMAND' && isLeader && mqttClient && mqttClient.connected) {
        const { topic, payloadStr, shouldRetain } = msg;
        mqttClient.publish(topic, payloadStr, { qos: 1, retain: shouldRetain });
      }

      // Si la líder avisa cambios de estado de red
      if (msg.type === 'STATUS_UPDATE' && !isLeader) {
        if (onStatusChange) onStatusChange(msg.status);
      }

      // Si la líder se cerró
      if (msg.type === 'LEADER_CLOSING') {
        electAsLeader();
      }
    };

    // Al arrancar, esperar 1.2 segundos para ver si ya existe una pestaña líder
    setTimeout(() => {
      if (Date.now() - lastLeaderPulse > 1800) {
        electAsLeader();
      }
    }, 1200);

    // Vigilante continuo: Si la pestaña líder se cuelga o se cierra bruscamente, tomar el mando
    checkLeaderTimer = setInterval(() => {
      if (!isLeader && Date.now() - lastLeaderPulse > 2600) {
        electAsLeader();
      }
    }, 1500);

    // Avisar antes de cerrar esta pestaña
    window.addEventListener('beforeunload', () => {
      if (isLeader && broadcast) {
        broadcast.postMessage({ type: 'LEADER_CLOSING', leaderId: tabId });
      }
    });

  } else {
    // Fallback para navegadores antiguos: conexión directa
    electAsLeader();
  }

  // Función universal para enviar comandos (funcione en la líder o en las esclavas)
  const sendCommand = (mac, cmdObject, forceRetain = null) => {
    const cleanMac = mac.toUpperCase();
    const topic = `autoclave_med_2026/${cleanMac}/config`;
    const isInstantTrigger = Boolean(cmdObject.cmd);
    const shouldRetain = forceRetain !== null ? forceRetain : !isInstantTrigger;
    const payloadStr = JSON.stringify(cmdObject);

    if (isLeader && mqttClient && mqttClient.connected) {
      // Si esta pestaña es la líder, publica directo
      mqttClient.publish(topic, payloadStr, { qos: 1, retain: shouldRetain });
    } else if (broadcast) {
      // Si es una pestaña esclava, se lo pasa a la líder por memoria interna
      broadcast.postMessage({
        type: 'FORWARD_COMMAND',
        topic,
        payloadStr,
        shouldRetain
      });
    }
  };

  return { client: mqttClient, sendCommand };
};
