import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  listNotifications,
  insertNotification,
  updateNotification,
  subscribeNotifications,
  getStoreMode
} from '../services/notificationsStore';

const TICK_MS = 15000;
const REFRESH_MS = 60000;
const FRESH_TELEMETRY_MS = 60000;
const OFFLINE_AFTER_MS = 5 * 60000;
const OVERTEMP_MARGIN_C = 3;
const RECOVERY_WINDOW_DAYS = 30;
const PLATEAU_PHASES = new Set(['ESTERILIZANDO', 'MESETA']);

const CONDITION_TYPES = new Set(['ALARMA', 'SOBRETEMP', 'OFFLINE', 'MANT_PROXIMO', 'MANT_LIMITE', 'ACCESO']);
const AUTO_RESOLVE_TYPES = new Set(['OFFLINE', 'MANT_PROXIMO', 'MANT_LIMITE', 'ACCESO']);

export const SEVERITY_ORDER = { CRITICA: 0, ADVERTENCIA: 1, INFO: 2 };

const deviceName = (dev) => dev?.meta?.alias || dev?.mac || 'Equipo';
const deviceType = (dev) => String(dev?.datos?.tipo || dev?.meta?.tipo || 'AUTOCLAVE').toUpperCase();
const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

function detectDeviceConditions(dev, now, sessionStart) {
  const out = [];
  const mac = dev?.mac;
  if (!mac) return { out, evaluable: new Set() };

  const datos = dev.datos || {};
  const cfg = datos.cfg || {};
  const name = deviceName(dev);
  const telemetryAt = dev.lastTelemetryAt || 0;
  const seenThisSession = telemetryAt >= sessionStart;
  const fresh = seenThisSession && now - telemetryAt < FRESH_TELEMETRY_MS;
  const temp = toNumber(datos.temp_camara);
  const pres = toNumber(datos.presion);
  const fase = String(datos.fase || '').toUpperCase();
  const evaluable = new Set();

  if (fresh) {
    evaluable.add('ALARMA');
    evaluable.add('SOBRETEMP');

    const alarmCode = toNumber(datos.alarma_cod);
    if (alarmCode && alarmCode > 0) {
      out.push({
        clave: `ALARMA:${mac}:${alarmCode}`,
        categoria: 'EQUIPO',
        severidad: 'CRITICA',
        tipo: 'ALARMA',
        titulo: `Alarma crítica · ${name}`,
        mensaje: datos.alarma_msg || `El equipo reporta el código de alarma ${alarmCode}.`,
        mac,
        datos: { codigo: alarmCode, temperatura: temp, presion: pres, fase: datos.fase || null }
      });
    }

    const setpoint = toNumber(datos.sp_temp ?? cfg.sp_temp);
    if (deviceType(dev) === 'AUTOCLAVE' && setpoint && temp !== null && PLATEAU_PHASES.has(fase) && temp > setpoint + OVERTEMP_MARGIN_C) {
      out.push({
        clave: `SOBRETEMP:${mac}`,
        categoria: 'EQUIPO',
        severidad: 'CRITICA',
        tipo: 'SOBRETEMP',
        titulo: `Sobretemperatura · ${name}`,
        mensaje: `Cámara a ${temp.toFixed(1)} °C con punto fijado en ${setpoint.toFixed(1)} °C (fase ${datos.fase}).`,
        mac,
        datos: { temperatura: temp, setpoint, presion: pres, fase: datos.fase }
      });
    }
  }

  if (seenThisSession) {
    evaluable.add('OFFLINE');
    if (now - telemetryAt > OFFLINE_AFTER_MS) {
      const minutes = Math.round((now - telemetryAt) / 60000);
      out.push({
        clave: `OFFLINE:${mac}`,
        categoria: 'EQUIPO',
        severidad: 'ADVERTENCIA',
        tipo: 'OFFLINE',
        titulo: `Equipo sin señal · ${name}`,
        mensaje: `No envía telemetría desde hace ${minutes} min. Revisa energía y conexión WiFi del equipo.`,
        mac,
        datos: { ultima_senal: new Date(telemetryAt).toISOString() }
      });
    }
  }

  const ciclos = toNumber(dev.meta?.ciclos_activos || cfg.ciclos) || 0;
  const limite = Math.max(1, toNumber(dev.meta?.limite_mantenimiento || cfg.lim_mant) || 300);
  const alertaPct = toNumber(cfg.alerta_pct) || 80;
  const pct = Math.round((ciclos / limite) * 100);
  evaluable.add('MANT_LIMITE');
  evaluable.add('MANT_PROXIMO');

  if (ciclos > 0 && ciclos >= limite) {
    out.push({
      clave: `MANT_LIMITE:${mac}`,
      categoria: 'EQUIPO',
      severidad: 'CRITICA',
      tipo: 'MANT_LIMITE',
      titulo: `Mantenimiento vencido · ${name}`,
      mensaje: `Llegó al límite de ${limite} ciclos (${ciclos}). Las salidas quedan inhibidas hasta el mantenimiento.`,
      mac,
      datos: { ciclos, limite, porcentaje: pct }
    });
  } else if (ciclos > 0 && pct >= alertaPct) {
    out.push({
      clave: `MANT_PROXIMO:${mac}`,
      categoria: 'EQUIPO',
      severidad: 'ADVERTENCIA',
      tipo: 'MANT_PROXIMO',
      titulo: `Mantenimiento próximo · ${name}`,
      mensaje: `Lleva ${ciclos} de ${limite} ciclos (${pct}%). Programa el mantenimiento preventivo.`,
      mac,
      datos: { ciclos, limite, porcentaje: pct, alerta_pct: alertaPct }
    });
  }

  const report = dev.ultimoReporte;
  if (report && (report.recibidoEn || 0) >= sessionStart) {
    const alarmas = toNumber(report.conteo_alarmas) || 0;
    const diagnostico = String(report.diagnostico_principal || 'CICLO CONFORME');
    const conforme = alarmas === 0 && diagnostico.toUpperCase().includes('CONFORME');
    const sessionId = report.session_id || `${mac}-${report.recibidoEn}`;
    out.push({
      clave: `CICLO:${sessionId}`,
      categoria: 'EQUIPO',
      severidad: conforme ? 'INFO' : 'ADVERTENCIA',
      tipo: 'CICLO',
      titulo: conforme ? `Ciclo conforme · ${name}` : `Ciclo con incidencias · ${name}`,
      mensaje: conforme
        ? `${report.programa || 'Ciclo'} finalizado correctamente.`
        : `${diagnostico}${alarmas ? ` · ${alarmas} alarma(s) durante el ciclo` : ''}.`,
      mac,
      datos: {
        session_id: report.session_id || null,
        programa: report.programa || null,
        temp_max: toNumber(report.temp_max),
        pres_max: toNumber(report.pres_max),
        conteo_alarmas: alarmas,
        diagnostico
      }
    });
  }

  return { out, evaluable };
}

function detectUserRequests(pendingRequests, recoveryRequests, now) {
  const out = [];
  pendingRequests.forEach((req) => {
    const usuario = req.user || req.usuario;
    const key = req.id || usuario;
    if (!key) return;
    out.push({
      clave: `ACCESO:${key}`,
      categoria: 'USUARIO',
      severidad: 'ADVERTENCIA',
      tipo: 'ACCESO',
      titulo: 'Solicitud de acceso',
      mensaje: `${req.nombre || usuario} (${usuario}) · ${req.departamento || 'Sin área'}`,
      mac: null,
      datos: { usuario, nombre: req.nombre || null, email: req.email || null, departamento: req.departamento || null }
    });
  });

  const windowStart = now - RECOVERY_WINDOW_DAYS * 86400000;
  recoveryRequests.forEach((row) => {
    if (!row?.id || !row.usuario) return;
    const created = Date.parse(row.created_at || row.fecha || row.timestamp || '');
    if (Number.isFinite(created) && created < windowStart) return;
    out.push({
      clave: `RECUPERACION:${row.id}`,
      categoria: 'USUARIO',
      severidad: 'ADVERTENCIA',
      tipo: 'RECUPERACION',
      titulo: 'Cambio de contraseña solicitado',
      mensaje: `El usuario ${row.usuario} pidió recuperar su acceso.`,
      mac: null,
      datos: { usuario: row.usuario }
    });
  });
  return out;
}

const upsertRow = (rows, row) => {
  if (!row?.id) return rows;
  const idx = rows.findIndex((r) => r.id === row.id);
  if (idx === -1) return [row, ...rows];
  const next = rows.slice();
  next[idx] = { ...rows[idx], ...row };
  return next;
};

export function useNotificationCenter({
  enabled,
  fleet,
  allowedDevices,
  isAdmin,
  profile,
  mqttConnected,
  pendingRequests = [],
  recoveryRequests = [],
  requestsLoadedAt = 0,
  loadPendingRequests,
  updateUserStatus,
  resetUserPassword,
  sendDeviceCommand
}) {
  const [rows, setRows] = useState([]);
  const [storeMode, setStoreMode] = useState('unknown');
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const sessionStartRef = useRef(Date.now());
  const inflightRef = useRef(new Set());
  const clearedRef = useRef(new Set());
  const failedAtRef = useRef(new Map());
  const mqttDownSinceRef = useRef(null);

  const actor = (profile?.nombre || profile?.user || profile?.usuario || profile?.email || 'usuario').toString();

  const refresh = useCallback(async () => {
    try {
      const data = await listNotifications();
      setRows(data);
    } catch (e) {
      console.warn('[NOTIFICACIONES] Error cargando:', e?.message || e);
    } finally {
      setStoreMode(getStoreMode());
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    const unsubscribe = subscribeNotifications((event) => {
      setRows((prev) => (event.type === 'DELETE' ? prev.filter((r) => r.id !== event.row?.id) : upsertRow(prev, event.row)));
    });
    const tick = setInterval(() => setNow(Date.now()), TICK_MS);
    const poll = setInterval(() => {
      refresh();
      if (isAdmin && loadPendingRequests) loadPendingRequests();
    }, REFRESH_MS);
    return () => {
      unsubscribe();
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [enabled, refresh, isAdmin, loadPendingRequests]);

  const fleetNow = useMemo(() => Date.now(), [fleet, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const { detected, evaluableByMac } = useMemo(() => {
    const list = [];
    const evaluable = new Map();
    allowedDevices.forEach((dev) => {
      const res = detectDeviceConditions(dev, fleetNow, sessionStartRef.current);
      list.push(...res.out);
      evaluable.set(dev.mac, res.evaluable);
    });
    if (isAdmin && requestsLoadedAt) {
      list.push(...detectUserRequests(pendingRequests, recoveryRequests, fleetNow));
    }
    return { detected: list, evaluableByMac: evaluable };
  }, [allowedDevices, fleetNow, isAdmin, requestsLoadedAt, pendingRequests, recoveryRequests]);

  useEffect(() => {
    if (!enabled || !loaded) return;

    const detectedByKey = new Map(detected.map((d) => [d.clave, d]));
    const openByKey = new Map();
    const everSeen = new Set();
    rows.forEach((r) => {
      everSeen.add(r.clave);
      if (r.estado !== 'RESUELTA') openByKey.set(r.clave, r);
    });

    detected.forEach((d) => {
      const open = openByKey.get(d.clave);
      if (open) {
        const lock = `upd:${open.id}`;
        if (open.activa === false && !inflightRef.current.has(lock)) {
          inflightRef.current.add(lock);
          updateNotification(open.id, {
            activa: true,
            ocurrencias: (open.ocurrencias || 1) + 1,
            mensaje: d.mensaje,
            datos: d.datos
          })
            .then((row) => row && setRows((prev) => upsertRow(prev, row)))
            .catch(() => {})
            .finally(() => inflightRef.current.delete(lock));
        }
        return;
      }
      if (inflightRef.current.has(d.clave)) return;
      if (Date.now() - (failedAtRef.current.get(d.clave) || 0) < REFRESH_MS) return;
      if (everSeen.has(d.clave) && !clearedRef.current.has(d.clave)) return;

      inflightRef.current.add(d.clave);
      clearedRef.current.delete(d.clave);
      insertNotification(d)
        .then((row) => (row ? setRows((prev) => upsertRow(prev, row)) : refresh()))
        .catch((e) => {
          failedAtRef.current.set(d.clave, Date.now());
          console.warn('[NOTIFICACIONES] Error creando:', e?.message || e);
        })
        .finally(() => inflightRef.current.delete(d.clave));
    });

    rows.forEach((r) => {
      if (!CONDITION_TYPES.has(r.tipo) || detectedByKey.has(r.clave)) return;

      if (r.categoria === 'EQUIPO') {
        const evaluable = evaluableByMac.get(r.mac);
        if (!evaluable || !evaluable.has(r.tipo)) return;
      } else if (r.tipo === 'ACCESO' && !(isAdmin && requestsLoadedAt)) {
        return;
      }

      clearedRef.current.add(r.clave);
      const lock = `upd:${r.id}`;
      if (r.estado === 'RESUELTA' || r.activa === false || inflightRef.current.has(lock)) return;
      inflightRef.current.add(lock);

      const patch = AUTO_RESOLVE_TYPES.has(r.tipo)
        ? {
            activa: false,
            estado: 'RESUELTA',
            resuelta_por: 'SISTEMA',
            resuelta_en: new Date().toISOString(),
            nota_resolucion: r.tipo === 'ACCESO' ? 'Solicitud gestionada desde Gestión de Accesos.' : 'La condición se normalizó automáticamente.'
          }
        : { activa: false };
      updateNotification(r.id, patch)
        .then((row) => row && setRows((prev) => upsertRow(prev, row)))
        .catch(() => {})
        .finally(() => inflightRef.current.delete(lock));
    });
  }, [enabled, loaded, detected, rows, evaluableByMac, isAdmin, requestsLoadedAt, refresh]);

  if (mqttConnected) mqttDownSinceRef.current = null;
  else if (!mqttDownSinceRef.current) mqttDownSinceRef.current = Date.now();

  const systemItems = useMemo(() => {
    if (mqttConnected || !mqttDownSinceRef.current) return [];
    return [{
      id: 'local:MQTT',
      clave: 'SISTEMA:MQTT',
      categoria: 'SISTEMA',
      severidad: 'CRITICA',
      tipo: 'MQTT',
      titulo: 'Sin conexión con el broker MQTT',
      mensaje: 'Este navegador no recibe telemetría en vivo. Verifica tu conexión a internet.',
      estado: 'NUEVA',
      activa: true,
      creada_en: new Date(mqttDownSinceRef.current).toISOString(),
      local: true
    }];
  }, [mqttConnected, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleRows = useMemo(() => {
    const allowedMacs = new Set(allowedDevices.map((d) => d.mac));
    return rows.filter((r) => {
      if (r.categoria === 'USUARIO') return isAdmin;
      if (r.categoria === 'EQUIPO') return isAdmin || allowedMacs.has(r.mac);
      return true;
    });
  }, [rows, allowedDevices, isAdmin]);

  const notifications = useMemo(() => [...systemItems, ...visibleRows], [systemItems, visibleRows]);

  const counts = useMemo(() => {
    const open = notifications.filter((n) => n.estado !== 'RESUELTA');
    return {
      open: open.length,
      critical: open.filter((n) => n.severidad === 'CRITICA').length,
      warning: open.filter((n) => n.severidad === 'ADVERTENCIA').length,
      unattended: open.filter((n) => n.estado === 'NUEVA' && n.severidad !== 'INFO').length,
      criticalNew: open.filter((n) => n.estado === 'NUEVA' && n.severidad === 'CRITICA').length
    };
  }, [notifications]);

  const applyUpdate = useCallback(async (notif, patch) => {
    if (!notif?.id || notif.local) return;
    const row = await updateNotification(notif.id, patch);
    if (row) setRows((prev) => upsertRow(prev, row));
  }, []);

  const acknowledge = useCallback((notif) => applyUpdate(notif, {
    estado: 'ATENDIDA',
    atendida_por: actor,
    atendida_en: new Date().toISOString()
  }), [applyUpdate, actor]);

  const resolve = useCallback((notif, nota = '') => applyUpdate(notif, {
    estado: 'RESUELTA',
    resuelta_por: actor,
    resuelta_en: new Date().toISOString(),
    nota_resolucion: nota.trim() || null,
    ...(notif.atendida_por ? {} : { atendida_por: actor, atendida_en: new Date().toISOString() })
  }), [applyUpdate, actor]);

  const resolveAllInfo = useCallback(async () => {
    const infos = notifications.filter((n) => n.severidad === 'INFO' && n.estado !== 'RESUELTA' && !n.local);
    await Promise.all(infos.map((n) => resolve(n, 'Revisada')));
  }, [notifications, resolve]);

  const approveAccess = useCallback(async (notif, rol = 'OPERADOR') => {
    const usuario = notif?.datos?.usuario;
    if (!usuario || !updateUserStatus) return;
    await updateUserStatus(usuario, 'ACTIVO', rol);
    await resolve(notif, `Acceso aprobado con rol ${rol}.`);
  }, [updateUserStatus, resolve]);

  const rejectAccess = useCallback(async (notif) => {
    const usuario = notif?.datos?.usuario;
    if (!usuario || !updateUserStatus) return;
    await updateUserStatus(usuario, 'RECHAZADO');
    await resolve(notif, 'Solicitud de acceso rechazada.');
  }, [updateUserStatus, resolve]);

  const resetPassword = useCallback(async (notif, tempPassword) => {
    const usuario = notif?.datos?.usuario;
    if (!usuario || !resetUserPassword) return;
    await resetUserPassword(usuario, tempPassword);
    await resolve(notif, 'Se asignó una contraseña temporal.');
  }, [resetUserPassword, resolve]);

  const resetDeviceAlarm = useCallback(async (notif) => {
    if (!notif?.mac || !sendDeviceCommand) return;
    sendDeviceCommand(notif.mac, { cmd: 'RESET_ALARMA' });
    if (notif.estado === 'NUEVA') await acknowledge(notif);
  }, [sendDeviceCommand, acknowledge]);

  return {
    notifications,
    counts,
    storeMode,
    mqttConnected,
    acknowledge,
    resolve,
    resolveAllInfo,
    approveAccess,
    rejectAccess,
    resetPassword,
    resetDeviceAlarm
  };
}
