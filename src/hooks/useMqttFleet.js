import { useState, useEffect, useRef } from 'react';
import { connectMqttFleet } from '../services/mqttClient';
import { accumulateF0 } from '../utils/f0Formulas';
import { supabase } from '../services/supabase';

export function useMqttFleet() {
  const [fleet, setFleet] = useState({});
  const [mqttConnected, setMqttConnected] = useState(false);
  const sendCommandRef = useRef(null);
  const pendingLocksRef = useRef({}); // Candado optimista para evitar rebote de switches

  // 1. Pre-cargar equipos registrados en Supabase al abrir la plataforma
  useEffect(() => {
    const loadRegisteredDevices = async () => {
      try {
        const { data, error } = await supabase
          .from('asignaciones_equipos')
          .select('*');

        if (!error && data && data.length > 0) {
          setFleet((prev) => {
            const initialFleet = { ...prev };
            data.forEach((item) => {
              const devMac = (item.mac || item.Mac || '').toUpperCase();
              if (devMac && !initialFleet[devMac]) {
                initialFleet[devMac] = {
                  mac: devMac,
                  lastSeen: 0, // Inicia en 0: OFFLINE garantizado hasta que el ESP32 hable
                  datos: {
                    temp_camara: 25.0,
                    presion: 0.0,
                    fase: 'APAGADO',
                    seg_restantes: 0,
                    cfg: { ciclos: item.ciclos || 0, lim_mant: item.limite || 200 }
                  },
                  esquema: null,
                  meta: item,
                  f0Score: 0.0,
                  history: []
                };
              } else if (devMac && initialFleet[devMac]) {
                initialFleet[devMac].meta = Object.assign(initialFleet[devMac].meta || {}, item);
              }
            });
            return initialFleet;
          });
        }
      } catch (err) {
        console.warn('[SUPABASE] Fallo carga inicial de flota:', err);
      }
    };

    loadRegisteredDevices();
  }, []);

  // 2. Conexión WebSocket y procesamiento en caliente
  useEffect(() => {
    const { client, sendCommand } = connectMqttFleet(
      ({ mac, channel, payload, isRetained }) => {
        const cleanMac = mac.toUpperCase();

        setFleet((prevFleet) => {
          const currentDev = prevFleet[cleanMac] || {
            mac: cleanMac,
            lastSeen: 0,
            datos: {},
            esquema: null,
            meta: { alias: `AUTOCLAVE [${cleanMac.slice(-4)}]`, cliente: 'Hospital', modelo: 'Clase B' },
            f0Score: 0.0,
            history: []
          };

          const isFreshStream = !isRetained;
          const updated = { 
            ...currentDev, 
            lastSeen: isFreshStream ? Date.now() : (currentDev.lastSeen || 0)
          };

          // PROCESAR TELEMETRÍA EN VIVO
          if (channel === 'telemetria') {
            const currentLocks = pendingLocksRef.current[cleanMac] || {};
            const ahora = Date.now();

            // Respetar candados optimistas en configuración
            if (payload.cfg && currentDev.datos?.cfg) {
              Object.keys(currentLocks).forEach((k) => {
                if (ahora < currentLocks[k]) {
                  payload.cfg[k] = currentDev.datos.cfg[k];
                }
              });
            }

            updated.datos = payload;

            const currentTemp = payload.temp_camara || 25.0;
            if (payload.fase === 'ESTERILIZANDO') {
              updated.f0Score = accumulateF0(currentDev.f0Score || 0, currentTemp, 2);
            } else if (payload.fase === 'ESPERA' || payload.fase === 'APAGADO') {
              updated.f0Score = 0.0;
            }

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

          // PROCESAR ESQUEMA DINÁMICO
          if (channel === 'esquema') {
            updated.esquema = payload;
            if (payload.modelo && updated.meta.modelo === 'Clase B') {
              updated.meta.modelo = payload.modelo;
            }
          }

          // PROCESAR METADATOS
          if (channel === 'meta') {
            updated.meta = Object.assign(updated.meta || {}, payload);
          }

          // PROCESAR Y GUARDAR PAQUETE FINAL DE CICLO EN SUPABASE
          if (channel === 'reporte_paquete') {
            const ciclosAcum = payload.ciclos_acumulados || payload.ciclos || 0;
            if (!updated.datos.cfg) updated.datos.cfg = {};
            updated.datos.cfg.ciclos = ciclosAcum;

            // Inserción asíncrona segura en Supabase
            supabase.from('reportes_autoclaves').upsert({
              session_id: payload.session_id || `SES-${cleanMac}-${Date.now()}`,
              mac: cleanMac,
              alias: updated.meta?.alias || cleanMac,
              cliente: updated.meta?.cliente || 'Hospital Central',
              modelo: updated.meta?.modelo || 'Clase B',
              programa: payload.programa || '134°C INSTRUMENTAL',
              hora_encendido: payload.hora_encendido || '00:00:00',
              inicio_ciclo: payload.inicio_ciclo || payload.hora_encendido || '00:00:00',
              hora_apagado: payload.hora_apagado || '00:00:00',
              duracion_total_seg: payload.duracion_total_seg || 0,
              ciclos_acumulados: ciclosAcum,
              limite_mantenimiento: payload.limite_mantenimiento || 200,
              temp_max: parseFloat(payload.temp_max) || 0,
              pres_max: parseFloat(payload.pres_max) || 0,
              conteo_alarmas: payload.conteo_alarmas || 0,
              diagnostico_principal: payload.diagnostico_principal || 'CICLO CONFORME',
              fase_final: payload.fase_final || 'FINALIZADO',
              ciclos_detalle: payload.ciclos_detalle || payload.fases_desglose || [],
              eventos: payload.eventos || []
            }, { onConflict: 'session_id' }).then(({ error }) => {
              if (error) console.warn('[SUPABASE] Fallo guardado de paquete:', error);
            });
          }

          return { ...prevFleet, [cleanMac]: updated };
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
    const cleanMac = mac.toUpperCase();
    if (sendCommandRef.current) {
      // Registrar candado optimista de 2.5 segundos para evitar rebotes
      pendingLocksRef.current[cleanMac] = pendingLocksRef.current[cleanMac] || {};
      Object.keys(cmd).forEach((k) => {
        if (k !== 'cmd') {
          pendingLocksRef.current[cleanMac][k] = Date.now() + 2500;
        }
      });

      sendCommandRef.current(cleanMac, cmd);
    }
  };

  return { fleet, mqttConnected, sendDeviceCommand };
}
