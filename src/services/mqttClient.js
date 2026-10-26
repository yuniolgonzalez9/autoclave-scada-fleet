
import { supabase } from './supabase';

// Las credenciales MQTT no viven en el código: se piden al servidor con la
// sesión activa (solo lectura). Los comandos salen por /api/device-command,
// que valida usuario, rol y permiso sobre el equipo.
async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sesión no válida.');
  return { Authorization: `Bearer ${session.access_token}` };
}

async function fetchViewerCredentials() {
  const res = await fetch('/api/mqtt-credentials', { headers: await authHeaders() });
  if (!res.ok) throw new Error('No se pudieron obtener credenciales MQTT.');
  return res.json();
}

export async function sendDeviceCommandSecure(mac, command, retain = null) {
  const res = await fetch('/api/device-command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ mac, command, ...(retain !== null ? { retain } : {}) })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'No se pudo enviar el comando.');
  return json;
}

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

  let connecting = false;
  const startMqttConnection = async () => {
    if (mqttClient || isDestroyed || connecting) return;
    connecting = true;

    let creds;
    try {
      creds = await fetchViewerCredentials();
    } catch (e) {
      connecting = false;
      if (onStatusChange) onStatusChange(false);
      if (!isDestroyed) setTimeout(startMqttConnection, 15000);
      return;
    }
    // La librería MQTT se carga bajo demanda (tras iniciar sesión) para
    // aligerar la carga inicial de la web.
    const { default: mqtt } = await import('mqtt');
    connecting = false;
    if (isDestroyed || mqttClient) return;

    const clientId = 'SCADA_' + Math.random().toString(36).substring(2, 10);

    mqttClient = mqtt.connect(creds.url, {
      clientId,
      username: creds.username,
      password: creds.password,
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
    if (!cleanMac) return Promise.resolve();
    return sendDeviceCommandSecure(cleanMac, cmdObject, forceRetain).catch((e) => {
      console.warn('[COMANDO]', e.message);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('biofleet:command-error', { detail: { mac: cleanMac, message: e.message } }));
      }
      throw e;
    });
  };

  const destroy = () => {
    isDestroyed = true;
    clearLeaderTimers();
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (typeof window !== 'undefined') window.removeEventListener('beforeunload', handleBeforeUnload);
    if (broadcast) {
      if (isLeader) broadcast.postMessage({ type: 'LEADER_CLOSING', leaderId: tabId });
      broadcast.close();
    }
    if (mqttClient) mqttClient.end(true);
  };

  return { client: { end: destroy }, sendCommand };
};
