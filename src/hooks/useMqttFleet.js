import { useState, useEffect, useRef, useCallback } from 'react';
import { accumulateF0 } from '../utils/f0Formulas';
import { supabase } from '../services/supabase';
import { mergeDeviceConfig } from '../services/deviceService';
import {
  joinFleetPresence, leaveFleetPresence, isFleetLeader,
  queueDeviceState, subscribeDeviceState, getRemoteDeviceState
} from '../services/deviceStateSync';

const CACHE_KEY = 'biofleet_fleet_cache_v2';
const PERSIST_INTERVAL_MS = 4000;
const HISTORY_WINDOW_MS = 60 * 60 * 1000; // un ciclo de autoclave cabe entero
const HISTORY_MAX_POINTS = 1800;
const REPORT_RETRY_MAX = 40;
const REPORT_RETRY_MS = 10000;

export function useMqttFleet(enabled = true) {
  const [fleet, setFleet] = useState(() => {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch (e) {
      console.warn('[CACHE] Error leyendo sesión:', e);
    }
    return {};
  });

  const [mqttConnected, setMqttConnected] = useState(true);
  const sendCommandRef = useRef(null);
  const ackReporteRef = useRef(null);
  const meshLeaderRef = useRef(null); // () => bool: líder por navegador
  const fleetRef = useRef(fleet);
  const fasePorMac = useRef({}); // borde de fase para auto-impresión/paquetes
  const reportRetryRef = useRef([]); // reportes cuyo upsert a nube falló
  const lastDrainRef = useRef(0);
  const batchSeqRef = useRef(0);

  useEffect(() => {
    fleetRef.current = fleet;
  }, [fleet]);

  useEffect(() => {
    const timer = setInterval(() => {
      try {
        const currentData = fleetRef.current;
        if (Object.keys(currentData).length > 0) {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(currentData));
        }
      } catch (_) {}
    }, PERSIST_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadRegisteredDevices = async () => {
      try {
        const { data, error } = await supabase
          .from('asignaciones_equipos')
          .select('*');

        if (!error && data && data.length > 0 && isMounted) {
          setFleet((prev) => {
            const nextFleet = { ...prev };
            const now = Date.now();

            data.forEach((item) => {
              const rawMac = item.mac || item.Mac || '';
              const cleanMac = rawMac.toUpperCase().replace(/[:-]/g, '');
              if (!cleanMac) return;

              const configDeseada = item.config_deseada || {};
              const tipoCalculado = (item.tipo || configDeseada.tipo || 'AUTOCLAVE').toUpperCase();
              const existing = nextFleet[cleanMac] || {};

              nextFleet[cleanMac] = {
                mac: cleanMac,
                lastSeen: existing.lastSeen || now,
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
                    ciclos: Number(existing.datos?.cfg?.ciclos ?? item.ciclos_activos ?? 0),
                    lim_mant: Number(item.limite_mantenimiento || configDeseada.lim_mant || existing.datos?.cfg?.lim_mant || 200),
                    alerta_pct: Number(item.alerta_porcentaje || configDeseada.alerta_pct || 80),
                    sp_temp: Number(configDeseada.sp_temp || 121.0),
                    t_ciclo: Number(configDeseada.t_ciclo || 2)
                  }
                },
                esquema: existing.esquema || null,
                i2cReport: existing.i2cReport || null,
                hwProfile: existing.hwProfile || null,
                logicaAck: existing.logicaAck || null,
                meta: { ...item, mac: cleanMac, tipo: tipoCalculado },
                f0Score: existing.f0Score || 0.0,
                history: existing.history || []
              };
            });

            return nextFleet;
          });
        }
      } catch (_) {}
    };

    if (enabled) loadRegisteredDevices();
    return () => { isMounted = false; };
  }, [enabled]);

  // Devuelve el session_id persistido o null si el upsert falló (offline,
  // sin permiso sobre la MAC…). El caller lo usa para el ack de replay.
  const persistSessionReport = useCallback(async (cleanMac, payload, currentMeta) => {
    const ciclosAcum = Number(payload?.ciclos_acumulados || payload?.ciclos || 0);
    const sessionId = payload?.session_id || `SES-${cleanMac}-${Date.now()}`;
    try {
      const { error } = await supabase.from('reportes_autoclaves').upsert({
        session_id: sessionId,
        mac: cleanMac,
        alias: currentMeta?.alias || cleanMac,
        cliente: currentMeta?.cliente || 'Central Hospitalaria',
        modelo: currentMeta?.modelo || 'Clase B',
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
      return error ? null : sessionId;
    } catch (_e) {
      return null;
    }
  }, []);

  useEffect(() => {
    // Buffer de mensajes: agrupa telemetría y aplica una sola
    // actualización de estado cada ~250ms (evita re-render por paquete).
    // El cliente MQTT (345 kB) se importa en diferido solo tras el login.
    if (!enabled) return undefined;
    let pendingPackets = [];
    let client = null;
    let cancelled = false;

    joinFleetPresence();
    subscribeDeviceState();
    // También sin paquetes nuevos: si el flujo local envejece, adopta la
    // fila remota compartida (líder otro dispositivo) — misma vista global.
    const remoteMergeTimer = setInterval(() => {
      setFleet((prevFleet) => {
        let changed = false;
        const nextFleet = { ...prevFleet };
        Object.values(nextFleet).forEach((dev) => {
          if (!dev?.mac) return;
          const stale = !dev.lastTelemetryAt || (Date.now() - dev.lastTelemetryAt >= 15000);
          if (!stale) return;
          const remote = getRemoteDeviceState(dev.mac);
          if (remote && remote.last_telemetry_at > (dev.lastTelemetryAt || 0)) {
            changed = true;
            nextFleet[dev.mac] = {
              ...dev,
              datos: { ...(dev.datos || {}), ...(remote.datos || {}) },
              f0Score: remote.f0_score || 0,
              lastTelemetryAt: remote.last_telemetry_at,
              lastSeen: remote.last_seen || remote.last_telemetry_at
            };
          }
        });
        return changed ? nextFleet : prevFleet;
      });
    }, 2000);

    import('../services/mqttClient').then(({ connectMqttFleet }) => {
      if (cancelled) return;
      const conn = connectMqttFleet(
        (packetData) => pendingPackets.push(packetData),
        (status) => setMqttConnected(status)
      );
      client = conn.client;
      sendCommandRef.current = conn.sendCommand;
      ackReporteRef.current = conn.ackReporte || null;
      meshLeaderRef.current = conn.isMeshLeader || null;
    }).catch(() => {});

    // Reportes cuyo upsert a la nube falló (offline/RLS): cola local con
    // reintento cada ~10s — antes se perdían en silencio por la ruta nube.
    const drainReportRetries = (isLeaderNow) => {
      const q = reportRetryRef.current;
      if (!q.length || !isLeaderNow()) return;
      if (Date.now() - lastDrainRef.current < REPORT_RETRY_MS) return;
      lastDrainRef.current = Date.now();
      reportRetryRef.current = [];
      q.forEach((item) => {
        persistSessionReport(item.cleanMac, item.payload, item.meta).then((sid) => {
          if (!sid) {
            if (reportRetryRef.current.length < REPORT_RETRY_MAX) reportRetryRef.current.push(item);
          } else if (item.hubReplay && ackReporteRef.current) {
            ackReporteRef.current(sid);
          }
        });
      });
    };

    const persistReportOrQueue = (cleanMac, payload, meta, hubReplay) => {
      persistSessionReport(cleanMac, payload, meta).then((sid) => {
        if (sid) {
          if (hubReplay && ackReporteRef.current) ackReporteRef.current(sid);
        } else if (reportRetryRef.current.length < REPORT_RETRY_MAX) {
          reportRetryRef.current.push({ cleanMac, payload, meta, hubReplay });
        }
      });
    };

    const flushTimer = setInterval(() => {
      // Solo la pestaña líder del mesh ejecuta efectos de escritura
      // (persistencia, impresión, marcas de paquete): antes cada pestaña
      // abierta duplicaba upserts e impresiones.
      const isLeaderNow = () => (meshLeaderRef.current ? meshLeaderRef.current() : true);
      drainReportRetries(isLeaderNow);
      if (pendingPackets.length === 0) return;
      const rawBatch = pendingPackets;
      pendingPackets = [];

      // Deduplicar telemetría: solo el último paquete por MAC importa
      const lastTeleIdx = {};
      rawBatch.forEach((p, i) => {
        if (p.channel === 'telemetria') lastTeleIdx[p.mac] = i;
      });
      const batch = rawBatch.filter(
        (p, i) => p.channel !== 'telemetria' || lastTeleIdx[p.mac] === i
      );

      // Los efectos (Supabase, impresión, imports dinámicos) se
      // recolectan durante el cálculo del estado y corren DESPUÉS del
      // commit — nunca se ejecutan dentro del updater, que React puede
      // invocar más de una vez (StrictMode/concurrent). El batchId los
      // deduplica si eso ocurre.
      const effects = [];
      const batchId = ++batchSeqRef.current;

      const computeNext = (prevFleet) => {
      const ownEffects = [];
      const pushEffect = (fn) => ownEffects.push({ id: `${batchId}:${ownEffects.length}`, fn });
      let nextFleet = prevFleet;

      // ── UNA SOLA VERDAD: el líder publica su telemetría consolidada;
      // todos adoptan la fila remota cuando su flujo local envejece. ──
      const STALE_MS = 15000;
      const publishAndMerge = (dev) => {
        if (!dev?.mac) return;
        const teleFresh = dev.lastTelemetryAt && (Date.now() - dev.lastTelemetryAt < STALE_MS);
        if (isFleetLeader() && teleFresh) {
          queueDeviceState(dev.mac, dev.datos, dev.f0Score, dev.lastTelemetryAt, dev.lastSeen);
        }
        if (!teleFresh) {
          const remote = getRemoteDeviceState(dev.mac);
          if (remote && remote.last_telemetry_at > (dev.lastTelemetryAt || 0)) {
            nextFleet = {
              ...nextFleet,
              [dev.mac]: {
                ...dev,
                datos: { ...(dev.datos || {}), ...(remote.datos || {}) },
                f0Score: remote.f0_score || 0,
                lastTelemetryAt: remote.last_telemetry_at,
                lastSeen: remote.last_seen || remote.last_telemetry_at
              }
            };
          }
        }
      };

      batch.forEach(({ mac, channel, payload, isRetained, hubReplay }) => {
        const cleanMac = (mac || '').toUpperCase().replace(/[:-]/g, '');
        if (!cleanMac) return;

        const currentDev = nextFleet[cleanMac] || {
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

        if (channel === 'telemetria') {
          const prevTeleAt = currentDev.lastTelemetryAt || 0;
          if (isFreshStream) updated.lastTelemetryAt = Date.now();

          // Borde de fase: reposo → ciclo activo. Paquete REGISTRADO pasa
          // a EN_PROCESO y (opción) se imprime el comprobante de inicio.
          const faseNueva = payload?.fase;
          if (isFreshStream && faseNueva) {
            const fasePrevia = fasePorMac.current[cleanMac];
            fasePorMac.current[cleanMac] = faseNueva;
            const REPOSO = new Set(['ESPERA', 'APAGADO', 'FINALIZADO']);
            if (fasePrevia && REPOSO.has(fasePrevia) && !REPOSO.has(faseNueva) && isLeaderNow()) {
              pushEffect(() => {
                (async () => {
                  try {
                    const [{ markInProcessByMac }, ps] = await Promise.all([
                      import('../services/packageService'),
                      import('../services/printService')
                    ]);
                    const r = await markInProcessByMac(cleanMac);
                    const prefs = ps.getPrintPrefs();
                    if (r.matched && prefs.autoInicio) {
                      ps.printDoc({ ...ps.buildStartSlipDoc(r.paquete, currentDev), printerName: prefs.printerName });
                    }
                  } catch (_) {}
                })();
              });
            }
          }

          updated.datos = {
            ...(currentDev.datos || {}),
            ...(payload || {})
          };

          const currentTemp = parseFloat(payload?.temp_camara ?? 25.0);
          const currentPres = parseFloat(payload?.presion ?? 0.0);

          // F0 con el intervalo REAL entre paquetes — hardcodear 2s
          // falseaba la letalidad cuando la telemetría cambia de ritmo.
          const nowMs = Date.now();
          const dtSeg = Math.min(10, Math.max(0.5, (nowMs - (prevTeleAt || nowMs - 2000)) / 1000));
          if (payload?.fase === 'ESTERILIZANDO' || payload?.fase === 'MESETA') {
            updated.f0Score = accumulateF0(currentDev.f0Score || 0, currentTemp, dtSeg);
          } else if (payload?.fase === 'ESPERA' || payload?.fase === 'APAGADO') {
            updated.f0Score = 0.0;
          }

          const newPoint = {
            t: nowMs,
            time: new Date(nowMs).toTimeString().slice(0, 8),
            temperature: currentTemp,
            pressure: currentPres
          };

          // Ventana de 60 min: la de 30 puntos solo cubría ~1 min y la
          // gráfica no mostraba el ciclo completo.
          const cutoff = nowMs - HISTORY_WINDOW_MS;
          const kept = (currentDev.history || []).filter((p) => (p.t ?? 0) >= cutoff);
          updated.history = kept.length >= HISTORY_MAX_POINTS
            ? [...kept.slice(kept.length - HISTORY_MAX_POINTS + 1), newPoint]
            : [...kept, newPoint];
        }

        if (channel === 'logica' || channel === 'logica/ack') {
          updated.logicaAck = { ...payload, timestamp: Date.now() };
        }

        if (channel === 'i2c_report' || channel === 'hardware_scan') {
          updated.i2cReport = payload;
        }

        if (channel === 'hw_profile') {
          updated.hwProfile = payload;
        }

        if (channel === 'esquema') {
          updated.esquema = payload;
        }

        if (channel === 'meta') {
          updated.meta = Object.assign({}, currentDev.meta || {}, payload, { mac: cleanMac });
        }

        if (channel === 'reporte_paquete') {
          const ciclosAcum = Number(payload?.ciclos_acumulados || payload?.ciclos || 0);
          if (!updated.datos.cfg) updated.datos.cfg = {};
          updated.datos.cfg.ciclos = ciclosAcum;

          if (isFreshStream) {
            updated.ultimoReporte = { ...(payload || {}), recibidoEn: Date.now() };
          } else if (hubReplay && !updated.ultimoReporte) {
            // Reporte recuperado del buffer del Hub: visible offline
            // sin marcar el equipo como vivo.
            updated.ultimoReporte = { ...(payload || {}), recibidoEn: Date.now(), viaHubBuffer: true };
          }

          if (isLeaderNow()) {
            const metaSnap = updated.meta;
            const updatedSnap = updated;
            pushEffect(() => persistReportOrQueue(cleanMac, payload, metaSnap, hubReplay));

            // Cierre de ciclo real (no replay): resuelve el paquete en
            // seguimiento y auto-imprime el reporte forense si está activo.
            if (isFreshStream) {
              pushEffect(() => {
                (async () => {
                  try {
                    const [{ markCycleReport }, ps] = await Promise.all([
                      import('../services/packageService'),
                      import('../services/printService')
                    ]);
                    const prefs = ps.getPrintPrefs();
                    if (prefs.autoFin) {
                      ps.printDoc({ ...ps.buildCycleReportDoc(updatedSnap, payload), printerName: prefs.printerName });
                    }
                    await markCycleReport(cleanMac, payload);
                  } catch (_) {}
                })();
              });
            }
          }

          const prevActivos = Number(currentDev.meta?.ciclos_activos || 0);
          if (isFreshStream && ciclosAcum > prevActivos && currentDev.meta?.updated_at) {
            const historicos = Number(currentDev.meta?.ciclos_historicos || 0) + (ciclosAcum - prevActivos);
            updated.meta = { ...updated.meta, ciclos_activos: ciclosAcum, ciclos_historicos: historicos };
            if (isLeaderNow()) {
              const write = { ciclos_activos: ciclosAcum, ciclos_historicos: historicos };
              pushEffect(() => {
                supabase.from('asignaciones_equipos')
                  .update(write)
                  .eq('mac', cleanMac)
                  .then(() => {}, () => {});
              });
            }
          }
        }

        nextFleet = { ...nextFleet, [cleanMac]: updated };
      });

      Object.values(nextFleet).forEach(publishAndMerge);
      return { nextFleet, effects: ownEffects };
      };

      setFleet((prev) => {
        const { nextFleet, effects: own } = computeNext(prev);
        fleetRef.current = nextFleet;
        effects.push(...own);
        return nextFleet;
      });
      const seen = new Set();
      for (const e of effects) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        try { e.fn(); } catch (_) {}
      }
      // Flush cada 500ms (antes 250): mitad de renders de la flota sin cambio
      // perceptible — la telemetría ya se deduplica por MAC dentro del batch.
    }, 500);

    return () => {
      cancelled = true;
      sendCommandRef.current = null;
      meshLeaderRef.current = null;
      clearInterval(flushTimer);
      clearInterval(remoteMergeTimer);
      leaveFleetPresence();
      if (client) client.end();
    };
  }, [persistSessionReport, enabled]);

  const sendDeviceCommand = useCallback((mac, cmd) => {
    const cleanMac = (mac || '').toUpperCase().replace(/[:-]/g, '');
    if (!cleanMac) return Promise.resolve({ ok: false, error: 'Equipo no indicado.' });
    if (!sendCommandRef.current) return Promise.resolve({ ok: false, error: 'Sin conexión con el servidor.' });

    const result = Promise.resolve(sendCommandRef.current(cleanMac, cmd))
      .then(() => ({ ok: true }), (e) => ({ ok: false, error: e?.message || 'Comando rechazado.' }));

    {

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

        return {
          ...prev,
          [cleanMac]: {
            ...dev,
            datos: { ...newDatos, cfg: newCfg },
            logicaAck: cmd.cmd === 'APPLY_LOGICA_SECUENCIA' ? null : dev.logicaAck
          }
        };
      });

      if (!cmd.cmd || cmd.cmd === 'APPLY_HAL_MAP' || cmd.cmd === 'SET_ALERTA_MANT') {
        const { cmd: _ignored, ...patch } = cmd;
        result.then((r) => { if (r.ok) mergeDeviceConfig(cleanMac, patch).catch(() => {}); });
      }
    }
    return result;
  }, []);

  const patchDeviceMeta = useCallback((mac, patch) => {
    const cleanMac = (mac || '').toUpperCase().replace(/[:-]/g, '');
    setFleet((prev) => {
      const dev = prev[cleanMac];
      if (!dev) return prev;
      const meta = { ...(dev.meta || {}), ...patch, mac: cleanMac };
      if (patch.tipo) meta.tipo = String(patch.tipo).toUpperCase();
      const cfg = { ...(dev.datos?.cfg || {}) };
      if (patch.ciclos_activos !== undefined) cfg.ciclos = Number(patch.ciclos_activos);
      if (patch.limite_mantenimiento !== undefined) cfg.lim_mant = Number(patch.limite_mantenimiento);
      if (patch.alerta_porcentaje !== undefined) cfg.alerta_pct = Number(patch.alerta_porcentaje);
      return { ...prev, [cleanMac]: { ...dev, meta, datos: { ...(dev.datos || {}), tipo: meta.tipo || dev.datos?.tipo, cfg } } };
    });
  }, []);

  return { fleet, mqttConnected, sendDeviceCommand, patchDeviceMeta };
}
