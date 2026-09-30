import { useState, useEffect, useRef } from 'react';
import { connectMqttFleet } from '../services/mqttClient';
import { accumulateF0 } from '../utils/f0Formulas';

export function useMqttFleet() {
  const [fleet, setFleet] = useState({});
  const [mqttConnected, setMqttConnected] = useState(false);
  const sendCommandRef = useRef(null);

  useEffect(() => {
    const { client, sendCommand } = connectMqttFleet(
      ({ mac, channel, payload }) => {
        setFleet((prevFleet) => {
          const currentDev = prevFleet[mac] || {
            mac,
            lastSeen: Date.now(),
            datos: {},
            esquema: null,
            f0Score: 0.0,
            history: []
          };

          const updated = { ...currentDev, lastSeen: Date.now() };

          if (channel === 'telemetria') {
            updated.datos = payload;

            // Integración matemática de F0 en tiempo real con los datos del sensor físico
            const currentTemp = payload.temp_camara || 25.0;
            if (payload.fase === 'ESTERILIZANDO') {
              updated.f0Score = accumulateF0(currentDev.f0Score || 0, currentTemp, 2);
            } else if (payload.fase === 'ESPERA') {
              updated.f0Score = 0.0;
            }

            // Historial de gráfica térmica en tiempo real
            const nowTime = new Date().toTimeString().slice(3, 8);
            const newPoint = {
              time: nowTime,
              temperature: currentTemp,
              pressure: payload.presion || 0.0
            };
            const newHistory = [...(currentDev.history || []), newPoint];
            if (newHistory.length > 30) newHistory.shift();
            updated.history = newHistory;
          }

          if (channel === 'esquema') {
            updated.esquema = payload;
          }

          return { ...prevFleet, [mac]: updated };
        });
      },
      (status) => setMqttConnected(status)
    );

    sendCommandRef.current = sendCommand;

    return () => {
      if (client) client.end();
    };
  }, []);

  const sendDeviceCommand = (mac, cmd) => {
    if (sendCommandRef.current) {
      sendCommandRef.current(mac, cmd);
    }
  };

  return { fleet, mqttConnected, sendDeviceCommand };
}
