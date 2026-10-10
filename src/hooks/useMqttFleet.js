import { useState, useEffect, useRef } from 'react';
import { connectMqttFleet } from '../services/mqttClient';
import { accumulateF0 } from '../utils/f0Formulas';
import { supabase } from '../services/supabase';

const CACHE_KEY = 'biofleet_fleet_cache_v2';

export function useMqttFleet() {
  // Carga inicial en 0ms desde la memoria rápida de sesión
  const [fleet, setFleet] = useState(() => {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return {};
  });

  // ARRANQUE OPTIMISTA EN TRUE: Sale verde desde el fotograma 0 (igual que Supabase)
  const [mqttConnected, setMqttConnected] = useState(true);
  const sendCommandRef = useRef(null);

  // Persistir en memoria rápida de sesión periódicamente
  useEffect(() => {
    try {
      if (Object.keys(fleet).length > 0) {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(fleet));
      }
    } catch (e) {}
  }, [fleet]);

  // 1. Cargar equipos desde Supabase
  useEffect(() => {
    let isMounted = true;
    const loadRegisteredDevices = async () => {
      try {
        const { data, error } = await supabase
          .from('asignaciones_equipos')
          .select('*');

        if (!error && data && data.length > 0 && isMounted) {
          setFleet((prev) => {
            const initialFleet = { ...prev };
            data.forEach((item) => {
              const rawMac = item.mac || item.Mac || '';
              const devMac = rawMac.toUpperCase().replace(/[:\-]/g, '');
              
              if (devMac) {
                const configDeseada = item.config_deseada || {};
                const tipoCalculado = configDeseada.tipo || item.tipo || 'AUTOCLAVE';
                const existing = initialFleet[devMac] || {};

                initialFleet[devMac] = {
                  mac: devMac,
                  // ARRANQUE VERDE: Inicia con la hora actual para que nunca parpadee en rojo al dar F5
                  lastSeen: existing.lastSeen || Date.now(),
                  datos: {
                    temp_camara: existing.datos?.temp_camara ?? 25.0,
                    presion: existing.datos?.presion ?? 0.0,
                    motor: existing.datos?.motor ?? false,
                    calentador: existing.datos?.calentador ?? false,
                    vacio: existing.datos?.vacio ?? false,
                    fase: existing.datos?.fase || 'ESPERA',
                    tipo: tipoCalculado,
                    seg_restantes: existing.datos?.seg_restantes ?? 0,
                    reles: existing.datos?.reles || { R1: 0, R2: 0, R3: 0, R4: 0, R5: 0, R6: 0, R7: 0, R8: 0 },
                    entradas: existing.datos?.entradas || { IN1: 0, IN2: 0, IN3: 0, IN4: 0, IN5: 0, IN6: 0, IN7: 0, IN8: 0 },
                    cfg: { 
                      ciclos: Number(item.ciclos || existing.datos?.cfg?.ciclos || 0), 
                      lim_mant: Number(item.limite || existing.datos?.cfg?.lim_mant || 200),
                      alerta_pct: Number(configDeseada.alerta_pct || 80),
                      sp_temp: configDeseada.sp_temp || 121.0,
                      t_ciclo: configDeseada.t_ciclo || 2
                    }
                  },
                  esquema: existing.esquema || null,
                  i2cReport: existing.i2cReport || null,
                  hwProfile: existing.hwProfile || null,
                  logicaAck: existing.logicaAck || null,
                  meta: { ...item, mac: devMac, tipo: tipoCalculado },
                  f0Score: existing.f0Score || 0.0,
                  history: existing.history || []
                };
              }
            });
            return initialFleet;
          });
        }
      } catch (err) {
        console.warn('[SUPABASE] Carga inicial:', err);
      }
    };

    loadRegisteredDevices();
    return () => { isMounted = false; };
  }, []);

  // 2. Conexión MQTT
  useEffect(() => {
    const { client, sendCommand } = connectMqttFleet(
      ({ mac, channel, payload, isRetained }) => {
        const cleanMac = (mac || '').toUpperCase().replace(/[:\-]/g, '');
        if (!cleanMac) return;

        setFleet((prevFleet) => {
          const currentDev = prevFleet[cleanMac] || {
            mac: cleanMac,
            lastSeen: Date.now(),
            datos: {},
            esquema: null,
            i2cReport: null,
            hwProfile: null,
            logicaAck: null,
            meta: { alias: `EQUIPO [${cleanMac.slice(-4)}]`, cliente: 'Central', modelo: 'Universal' },
            f0Score: 0.0,
            history: []
          };

          const isFreshStream = !isRetained;
          const updated = {
            ...currentDev,
            lastSeen: isFreshStream ? Date.now() : (currentDev.lastSeen || Date.now())
          };

          // TELEMETRÍA EN VIVO (800ms)
          if (channel === 'telemetria') {
            updated.datos = {
              ...(currentDev.datos || {}),
              ...(payload || {})
            };

            const currentTemp = parseFloat(payload?.temp_camara || 25.0);
            
            if (payload?.fase === 'ESTERILIZANDO') {
              updated.f0Score = accumulateF0(currentDev.f0Score || 0, currentTemp, 2);
            } else if (payload?.fase === 'ESPERA' || payload?.fase === 'APAGADO') {
              updated.f0Score = 0.0;
            }

            const nowTime = new Date().toTimeString().slice(3, 8);
            const newPoint = {
              time: nowTime,
              temperature: currentTemp,
              pressure: parseFloat(payload?.presion || 0.0)
            };
            const newHistory = [...(currentDev.history || []), newPoint];
            if (newHistory.length > 30) newHistory.shift();
            updated.history = newHistory;
          }

          // ACK FÍSICO DE LÓGICA FOTA
          if (channel === 'logica') {
            updated.logicaAck = {
              ...payload,
              timestamp: Date.now()
            };
          }

          // ESCÁNER I2C REAL
          if (channel === 'i2c_report' || channel === 'hardware_scan') {
            updated.i2cReport = payload;
          }

          // PERFIL HARDWARE
          if (channel === 'hw_profile') {
            updated.hwProfile = payload;
          }

          if (channel === 'esquema') {
            updated.esquema = payload;
          }

          if (channel === 'meta') {
            updated.meta = Object.assign(updated.meta || {}, payload, { mac: cleanMac });
          }

          // REPORTES DE AUDITORÍA
          if (channel === 'reporte_paquete') {
            const ciclosAcum = Number(payload?.ciclos_acumulados || payload?.ciclos || 0);
            if (!updated.datos.cfg) updated.datos.cfg = {};
            updated.datos.cfg.ciclos = ciclosAcum;

            (async () => {
              try {
                await supabase.from('reportes_autoclaves').upsert({
                  session_id: payload?.session_id || `SES-${cleanMac}-${Date.now()}`,
                  mac: cleanMac,
                  alias: updated.meta?.alias || cleanMac,
                  cliente: updated.meta?.cliente || 'Central Hospitalaria',
                  modelo: updated.meta?.modelo || 'Clase B',
                  programa: payload?.programa || '134°C INSTRUMENTAL',
                  hora_encendido: payload?.hora_encendido || '00:00:00',
                  inicio_ciclo: payload?.inicio_ciclo || payload?.hora_encendido || '00:00:00',
                  hora_apagado: payload?.hora_apagado || '00:00:00',
                  duracion_total_seg: Number(payload?.duracion_total_seg || 0),
                  ciclos_acumulados: ciclosAcum,
                  limite_mantenimiento: Number(payload?.limite_mantenimiento || 200),
                  temp_max: parseFloat(payload?.temp_max || 0),
                  pres_max: parseFloat(payload?.pres_max || 0),
                  conteo_alarmas: Number(payload?.conteo_alarmas || 0),
                  diagnostico_principal: payload?.diagnostico_principal || 'CICLO CONFORME',
                  fase_final: payload?.fase_final || 'FINALIZADO',
                  ciclos_detalle: payload?.ciclos_detalle || payload?.fases_desglose || [],
                  eventos: payload?.eventos || []
                }, { onConflict: 'session_id' });
              } catch (e) {
                console.warn('[SUPABASE] Error guardando paquete:', e);
              }
            })();
          }

          return { ...prevFleet, [cleanMac]: updated };
        });
      },
      (status) => setMqttConnected(status)
    );

    sendCommandRef.current = sendCommand;
    return () => { if (client) client.end(); };
  }, []);

  // 3. Envío de órdenes optimista
  const sendDeviceCommand = (mac, cmd) => {
    const cleanMac = (mac || '').toUpperCase().replace(/[:\-]/g, '');
    if (!cleanMac) return;

    if (sendCommandRef.current) {
      sendCommandRef.current(cleanMac, cmd);

      setFleet((prev) => {
        const dev = prev[cleanMac];
        if (!dev) return prev;
        const newDatos = { ...dev.datos };
        const newCfg = { ...(dev.datos?.cfg || {}) };

        if (cmd.mot_ok !== undefined) {
          newDatos.motor = Boolean(cmd.mot_ok);
          newCfg.mot_ok = Boolean(cmd.mot_ok);
        }
        if (cmd.vacio_ok !== undefined) {
          newDatos.vacio = Boolean(cmd.vacio_ok);
          newCfg.vacio_ok = Boolean(cmd.vacio_ok);
        }
        if (cmd.hab !== undefined) newCfg.hab = Boolean(cmd.hab);
        if (cmd.sp_temp !== undefined) newCfg.sp_temp = Number(cmd.sp_temp);
        if (cmd.t_ciclo !== undefined) newCfg.t_ciclo = Number(cmd.t_ciclo);

        if (cmd.cmd === 'SET_RELAY' && cmd.canal) {
          const currentReles = { ...(dev.datos?.reles || {}) };
          currentReles[`R${cmd.canal}`] = cmd.val ? 1 : 0;
          newDatos.reles = currentReles;
        }

        if (cmd.cmd === 'START_VEHICLE') {
          newDatos.fase = 'ARRANCANDO';
          const currentReles = { ...(dev.datos?.reles || {}) };
          currentReles.R1 = 1;
          currentReles.R2 = 1;
          newDatos.reles = currentReles;
        } else if (cmd.cmd === 'STOP_VEHICLE') {
          newDatos.fase = 'APAGADO';
          const currentReles = { ...(dev.datos?.reles || {}) };
          currentReles.R1 = 0;
          currentReles.R2 = 0;
          newDatos.reles = currentReles;
        }

        let nextLogicaAck = dev.logicaAck;
        if (cmd.cmd === 'APPLY_LOGICA_SECUENCIA') {
          nextLogicaAck = null;
        }

        return {
          ...prev,
          [cleanMac]: { 
            ...dev, 
            datos: { ...newDatos, cfg: newCfg },
            logicaAck: nextLogicaAck 
          }
        };
      });

      (async () => {
        try {
          if (!cmd.cmd || cmd.cmd === 'APPLY_HAL_MAP' || cmd.cmd === 'SET_ALERTA_MANT') {
            await supabase.from('asignaciones_equipos').update({
              config_deseada: cmd,
              updated_at: new Date().toISOString()
            }).eq('mac', cleanMac);
          }
        } catch (e) {
          console.warn('[SUPABASE] Error actualizando config_deseada:', e);
        }
      })();
    }
  };

  return { fleet, mqttConnected, sendDeviceCommand };
}
