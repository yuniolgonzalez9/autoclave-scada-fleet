import mqtt from 'mqtt';

const BROKER_URL = import.meta.env.VITE_MQTT_BROKER_URL || 'wss://d15a5980139147d99bb9e2ad3825e62e.s1.eu.hivemq.cloud:8884/mqtt';
const MQTT_USER = import.meta.env.VITE_MQTT_USER || 'admin_autoclave';
const MQTT_PASS = import.meta.env.VITE_MQTT_PASS || '';

const CHANNEL_NAME = 'scada_hivemq_mesh_v2';

const TOPICS_SUBSCRIPTION = [
  'autoclave_med_2026/+/telemetria',
  'autoclave_med_2026/+/esquema',
  'autoclave_med_2026/+/meta',
  'autoclave_med_2026/+/reporte_paquete',
  'autoclave_med_2026/+/alerta_critica',
  'autoclave_med_2026/+/i2c_report',
  'autoclave_med_2026/+/hardware_scan',
  'autoclave_med_2026/+/hw_profile',
  'autoclave_med_2026/+/logica/ack'
];

export const connectMqttFleet = (onMessageReceived, onStatusChange) => {
  const tabId = 'TAB_' + Math.random().toString(36).substring(2, 9);
  
  let broadcast = null;
  let isLeader = false;
  let leaderHeartbeatTimer = null;
  let checkLeaderTimer = null;
  let fastCheckTimer = null;
  let lastLeaderPulse = 0;
  let mqttClient = null;
  let isDestroyed = false;
  let reconnectAttempts = 0;
  let reconnectTimer = null;

  const hasBroadcastSupport = typeof window !== 'undefined' && 'BroadcastChannel' in window;
  if (hasBroadcastSupport) {
    try {
      broadcast = new BroadcastChannel(CHANNEL_NAME);
    } catch (e) {
      console.warn('[MQTT MESH] BroadcastChannel no soportado:', e);
    }
  }

  const clearLeaderTimers = () => {
    if (leaderHeartbeatTimer) clearInterval(leaderHeartbeatTimer);
    if (checkLeaderTimer) clearInterval(checkLeaderTimer);
    if (fastCheckTimer) clearTimeout(fastCheckTimer);
  };

  const scheduleReconnect = () => {
    if (isDestroyed || !mqttClient || reconnectTimer) return;
    const delay = Math.min(30000, 2500 * Math.pow(2, reconnectAttempts));
    reconnectAttempts += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (isDestroyed || !mqttClient || mqttClient.connected) return;
      try {
        mqttClient.reconnect();
      } catch (e) {
        scheduleReconnect();
      }
    }, delay);
  };

  const startMqttConnection = () => {
    if (mqttClient || isDestroyed) return;

    if (!MQTT_PASS) {
      if (onStatusChange) onStatusChange(false);
      return;
    }

    const clientId = 'SCADA_' + Math.random().toString(36).substring(2, 10);

    mqttClient = mqtt.connect(BROKER_URL, {
      clientId,
      username: MQTT_USER,
      password: MQTT_PASS,
      clean: true,
      keepalive: 20,
      reschedulePings: true,
      connectTimeout: 8000,
      reconnectPeriod: 0
    });

    mqttClient.on('connect', () => {
      if (isDestroyed) {
        mqttClient.end(true);
        return;
      }
      reconnectAttempts = 0;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (onStatusChange) onStatusChange(true);

      TOPICS_SUBSCRIPTION.forEach((top) => {
        mqttClient.subscribe(top, { qos: 1 });
      });

      if (broadcast) {
        broadcast.postMessage({ type: 'STATUS_UPDATE', status: true });
      }
    });

    mqttClient.on('error', () => {
      if (onStatusChange) onStatusChange(false);
      if (broadcast) broadcast.postMessage({ type: 'STATUS_UPDATE', status: false });
    });

    mqttClient.on('close', () => {
      if (onStatusChange) onStatusChange(false);
      if (broadcast) broadcast.postMessage({ type: 'STATUS_UPDATE', status: false });
      scheduleReconnect();
    });

    mqttClient.on('offline', () => {
      if (onStatusChange) onStatusChange(false);
      if (broadcast) broadcast.postMessage({ type: 'STATUS_UPDATE', status: false });
    });

    mqttClient.on('message', (topic, message, packet) => {
      if (isDestroyed) return;

      try {
        const payload = JSON.parse(message.toString());
        const parts = topic.split('/');
        const mac = parts[1];
        const channel = parts[2];
        const isRetained = Boolean(packet && packet.retain);

        const packetData = { mac, channel, payload, topic, isRetained };

        if (onMessageReceived) onMessageReceived(packetData);

        if (broadcast) {
          broadcast.postMessage({ type: 'INCOMING_MQTT', packetData });
        }
      } catch (e) {}
    });
  };

  const electAsLeader = () => {
    if (isLeader || isDestroyed) return;
    isLeader = true;
    startMqttConnection();

    clearLeaderTimers();
    leaderHeartbeatTimer = setInterval(() => {
      if (broadcast && !isDestroyed) {
        broadcast.postMessage({ type: 'LEADER_PULSE', leaderId: tabId });
      }
    }, 1000);
  };

  const handleBeforeUnload = () => {
    if (isLeader && broadcast) {
      broadcast.postMessage({ type: 'LEADER_CLOSING', leaderId: tabId });
    }
  };

  if (hasBroadcastSupport && broadcast) {
    broadcast.onmessage = (event) => {
      if (isDestroyed) return;
      const msg = event.data;
      if (!msg) return;

      if (msg.type === 'LEADER_PULSE') {
        lastLeaderPulse = Date.now();
        if (onStatusChange) onStatusChange(true);
      }

      if (msg.type === 'INCOMING_MQTT' && !isLeader) {
        if (onMessageReceived) onMessageReceived(msg.packetData);
      }

      if (msg.type === 'FORWARD_COMMAND' && isLeader && mqttClient?.connected) {
        const { topic, payloadStr, shouldRetain } = msg;
        mqttClient.publish(topic, payloadStr, { qos: 1, retain: Boolean(shouldRetain) });
      }

      if (msg.type === 'STATUS_UPDATE' && !isLeader) {
        if (onStatusChange) onStatusChange(msg.status);
      }

      if (msg.type === 'LEADER_CLOSING') {
        electAsLeader();
      }
    };

    fastCheckTimer = setTimeout(() => {
      if (!isDestroyed && Date.now() - lastLeaderPulse > 400) {
        electAsLeader();
      }
    }, 90);

    checkLeaderTimer = setInterval(() => {
      if (!isDestroyed && !isLeader && Date.now() - lastLeaderPulse > 2200) {
        electAsLeader();
      }
    }, 1200);

    window.addEventListener('beforeunload', handleBeforeUnload);
  } else {
    electAsLeader();
  }

  const sendCommand = (mac, cmdObject, forceRetain = null) => {
    const cleanMac = (mac || '').toUpperCase().replace(/[:\-]/g, '');
    if (!cleanMac) return;

    const topic = `autoclave_med_2026/${cleanMac}/config`;
    const isInstantTrigger = Boolean(cmdObject.cmd);
    const shouldRetain = forceRetain !== null ? forceRetain : !isInstantTrigger;
    const payloadStr = JSON.stringify(cmdObject);

    if (isLeader && mqttClient?.connected) {
      mqttClient.publish(topic, payloadStr, { qos: 1, retain: shouldRetain });
    } else if (broadcast) {
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
