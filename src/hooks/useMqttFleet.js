import { useState, useEffect, useRef } from 'react';
import { connectMqttFleet } from '../services/mqttClient';
import { accumulateF0 } from '../utils/f0Formulas';
import { supabase } from '../services/supabase';

export function useMqttFleet() {
  const [fleet, setFleet] = useState({});
  const [mqttConnected, setMqttConnected] = useState(false);
  const sendCommandRef = useRef(null);

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
              const rawMac = item.mac || item.Mac || '';
              const devMac = rawMac.toUpperCase().replace(/[:\-]/g, '');
              
              if (devMac && !initialFleet[devMac]) {
                initialFleet[devMac] = {
                  mac: devMac,
                  lastSeen: 0,
                  datos: {
                    temp_camara: 25.0,
                    presion: 0.0,
                    motor: false,
                    calentador: false,
                    vacio: false,
                    fase: 'APAGADO',
                    seg_restantes: 0,
                    cfg: { ciclos: item.ciclos || 0, lim_mant: item.limite || 200 }
                  },
                  esquema: null,
                  meta: { ...item, mac: devMac },
                  f0Score: 0.0,
                  history: []
                };
              } else if (devMac && initialFleet[devMac]) {
                initialFleet[devMac].meta = Object.assign(initialFleet[devMac].meta || {}, item, { mac: devMac });
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

  useEffect(() => {
    const { client, sendCommand } = connectMqttFleet(
      ({ mac, channel, payload, isRetained }) => {
        if (!mac) return;
        const cleanMac = mac.toUpperCase().replace(/[:\-]/g, '');

        setFleet((prevFleet) => {
          const currentDev = prevFleet[cleanMac] || {
            mac: cleanMac,
            lastSeen: 0,
            datos: { cfg: { ciclos: 0, lim_mant: 200 } },
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

          if (channel === 'telemetria') {
            // Protección: fusionar datos preservando cfg para que nunca sea undefined
            updated.datos = {
              ...(currentDev.datos || {}),
              ...(payload || {}),
              cfg: {
                ...((currentDev.datos && currentDev.datos.cfg) || {}),
                ...((payload && payload.cfg) || {})
              }
            };

            const currentTemp = payload?.temp_camara ?? 25.0;
            if (payload?.fase === 'ESTERILIZANDO') {
              updated.f0Score = accumulateF0(currentDev.f0Score || 0, currentTemp, 2);
            } else if (payload?.fase === 'ESPERA' || payload?.fase === 'APAGADO') {
              updated.f0Score = 0.0;
            }

            const nowTime = new Date().toTimeString().slice(3, 8);
            const newPoint = {
              time: nowTime,
              temperature: currentTemp,
              pressure: payload?.presion ?? 0.0
            };
            const newHistory = [...(currentDev.history || []), newPoint];
            if (newHistory.length > 30) newHistory.shift();
            updated.history = newHistory;
          }

          if (channel === 'esquema') {
            updated.esquema = payload;
            if (payload?.modelo && updated.meta?.modelo === 'Clase B') {
              updated.meta.modelo = payload.modelo;
            }
          }

          if (channel === 'meta') {
            updated.meta = Object.assign(updated.meta || {}, payload, { mac: cleanMac });
          }

          if (channel === 'reporte_paquete') {
            const ciclosAcum = payload?.ciclos_acumulados || payload?.ciclos || 0;
            if (!updated.datos.cfg) updated.datos.cfg = {};
            updated.datos.cfg.ciclos = ciclosAcum;

            supabase.from('reportes_autoclaves').upsert({
              session_id: payload?.session_id || `SES-${cleanMac}-${Date.now()}`,
              mac: cleanMac,
              alias: updated.meta?.alias || cleanMac,
              cliente: updated.meta?.cliente || 'Hospital Central',
              modelo: updated.meta?.modelo || 'Clase B',
              programa: payload?.programa || '134°C INSTRUMENTAL',
              hora_encendido: payload?.hora_encendido || '00:00:00',
              inicio_ciclo: payload?.inicio_ciclo || payload?.hora_encendido || '00:00:00',
              hora_apagado: payload?.hora_apagado || '00:00:00',
              duracion_total_seg: payload?.duracion_total_seg || 0,
              ciclos_acumulados: ciclosAcum,
              limite_mantenimiento: payload?.limite_mantenimiento || 200,
              temp_max: parseFloat(payload?.temp_max) || 0,
              pres_max: parseFloat(payload?.pres_max) || 0,
              conteo_alarmas: payload?.conteo_alarmas || 0,
              diagnostico_principal: payload?.diagnostico_principal || 'CICLO CONFORME',
              fase_final: payload?.fase_final || 'FINALIZADO',
              ciclos_detalle: payload?.ciclos_detalle || payload?.fases_desglose || [],
              eventos: payload?.eventos || []
            }, { onConflict: 'session_id' }).catch((e) => console.warn(e));
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
    if (!mac) return;
    const cleanMac = mac.toUpperCase().replace(/[:\-]/g, '');
    if (sendCommandRef.current) {
      sendCommandRef.current(cleanMac, cmd);

      setFleet((prev) => {
        const dev = prev[cleanMac];
        if (!dev) return prev;
        const newDatos = { ...dev.datos };
        const newCfg = { ...(dev.datos?.cfg || {}) };

        if (cmd.mot_ok !== undefined) {
          newDatos.motor = cmd.mot_ok;
          newCfg.mot_ok = cmd.mot_ok;
        }
        if (cmd.vacio_ok !== undefined) {
          newDatos.vacio = cmd.vacio_ok;
          newCfg.vacio_ok = cmd.vacio_ok;
        }
        if (cmd.hab !== undefined) newCfg.hab = cmd.hab;
        if (cmd.sp_temp !== undefined) newCfg.sp_temp = cmd.sp_temp;
        if (cmd.t_ciclo !== undefined) newCfg.t_ciclo = cmd.t_ciclo;

        return {
          ...prev,
          [cleanMac]: { ...dev, datos: { ...newDatos, cfg: newCfg } }
        };
      });

      if (!cmd.cmd) {
        supabase.from('asignaciones_equipos').update({
          config_deseada: cmd,
          updated_at: new Date().toISOString()
        }).eq('mac', cleanMac).catch(() => {});
      }
    }
  };

  return { fleet, mqttConnected, sendDeviceCommand };
}
