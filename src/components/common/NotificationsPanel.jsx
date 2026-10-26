import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  X,
  Check,
  CheckCheck,
  AlertTriangle,
  AlertOctagon,
  Info,
  Thermometer,
  WifiOff,
  Wrench,
  Lock,
  UserPlus,
  KeyRound,
  ClipboardCheck,
  RadioTower,
  Database,
  Eye,
  RotateCcw,
  VolumeX,
  ShieldCheck,
  ChevronDown,
  Users,
  Cpu,
  Server,
  Trash2
} from 'lucide-react';
import { SEVERITY_ORDER } from '../../hooks/useNotificationCenter';
import { useSwipe, stepThrough } from '../../hooks/useSwipe';
import SwipeDots from './SwipeDots';

const TYPE_ICONS = {
  ALARMA: AlertOctagon,
  SOBRETEMP: Thermometer,
  OFFLINE: WifiOff,
  MANT_PROXIMO: Wrench,
  MANT_LIMITE: Lock,
  CICLO: ClipboardCheck,
  ACCESO: UserPlus,
  RECUPERACION: KeyRound,
  MQTT: RadioTower
};

const SEVERITY_STYLES = {
  CRITICA: {
    label: 'Críticas',
    bar: 'bg-rose-500',
    icon: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
    chip: 'bg-rose-500/15 text-rose-300 border-rose-500/40'
  },
  ADVERTENCIA: {
    label: 'Advertencias',
    bar: 'bg-amber-400',
    icon: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    chip: 'bg-amber-500/15 text-amber-300 border-amber-500/40'
  },
  INFO: {
    label: 'Informativas',
    bar: 'bg-cyan-400',
    icon: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
    chip: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
  }
};

const ROLES = ['OPERADOR', 'CLIENTE', 'TECNICO', 'AUDITOR_CALIDAD', 'ADMIN', 'DIRECTOR'];

const rtf = typeof Intl !== 'undefined' && Intl.RelativeTimeFormat
  ? new Intl.RelativeTimeFormat('es', { numeric: 'auto' })
  : null;

function timeAgo(iso) {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const diff = Math.round((t - Date.now()) / 1000);
  const abs = Math.abs(diff);

  if (!rtf) {
    const d = new Date(t);
    return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  if (abs < 45) return 'hace unos segundos';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

function ActionButton({ onClick, icon: Icon, children, tone = 'slate', disabled }) {
  const tones = {
    slate: 'border-slate-600/60 text-slate-200 hover:bg-slate-700/40',
    cyan: 'border-cyan-500/50 text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20',
    emerald: 'border-emerald-500/50 text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20',
    rose: 'border-rose-500/50 text-rose-200 bg-rose-500/10 hover:bg-rose-500/20',
    amber: 'border-amber-500/50 text-amber-200 bg-amber-500/10 hover:bg-amber-500/20'
  };
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors disabled:opacity-40 ${tones[tone]}`}
    >
      {Icon && <Icon className="w-3.5 h-3.5" />}
      <span>{children}</span>
    </button>
  );
}

function NotificationCard({ notif, center, isAdmin, canDelete, onViewDevice }) {
  const [mode, setMode] = useState(null);
  const [text, setText] = useState('');
  const [role, setRole] = useState('OPERADOR');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const styles = SEVERITY_STYLES[notif.severidad] || SEVERITY_STYLES.INFO;
  const Icon = TYPE_ICONS[notif.tipo] || Info;
  const resolved = notif.estado === 'RESUELTA';

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      setMode(null);
      setText('');
    } catch (e) {
      setError(e?.message || 'No fue posible completar la acción solicitada.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`relative overflow-hidden rounded-xl border border-white/10 bg-slate-900/70 ${resolved ? 'opacity-70' : ''}`}>
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${styles.bar}`} />
      <div className="pl-4 pr-3 py-3">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg border shrink-0 ${styles.icon}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-[13px] font-bold text-white leading-snug">{notif.titulo}</h4>
              <span className="text-[10px] text-slate-400 whitespace-nowrap mt-0.5">{timeAgo(notif.creada_en)}</span>
            </div>
            {notif.mensaje && <p className="text-[12px] text-slate-300 mt-1 leading-snug">{notif.mensaje}</p>}

            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {notif.estado === 'NUEVA' && !resolved && (
                <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${styles.chip}`}>Nueva</span>
              )}
              {notif.estado === 'ATENDIDA' && (
                <span className="px-1.5 py-0.5 rounded border border-sky-500/40 bg-sky-500/10 text-sky-300 text-[10px] font-bold">
                  En atención · {notif.atendida_por || 'Técnico'}
                </span>
              )}
              {!resolved && notif.activa === false && (
                <span className="px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-[10px] font-bold">
                  Condición normalizada
                </span>
              )}
              {(notif.ocurrencias || 1) > 1 && (
                <span className="px-1.5 py-0.5 rounded border border-slate-600 text-slate-300 text-[10px] font-bold font-mono">
                  ×{notif.ocurrencias}
                </span>
              )}
              {notif.mac && (
                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-mono">
                  {notif.mac}
                </span>
              )}
            </div>

            {resolved && (
              <p className="text-[11px] text-emerald-300/90 mt-2 flex items-start gap-1 font-sans">
                <CheckCheck className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>
                  Resuelta por {notif.resuelta_por || 'Supervisión'} {timeAgo(notif.resuelta_en)}
                  {notif.nota_resolucion ? ` · ${notif.nota_resolucion}` : ''}
                </span>
              </p>
            )}

            {resolved && canDelete && !notif.local && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {mode === 'delete' ? (
                  <>
                    <ActionButton onClick={() => setMode(null)}>Cancelar</ActionButton>
                    <ActionButton icon={Trash2} tone="rose" disabled={busy} onClick={() => run(() => center.remove(notif))}>
                      Confirmar Eliminación
                    </ActionButton>
                  </>
                ) : (
                  <ActionButton icon={Trash2} tone="rose" onClick={() => setMode('delete')}>Eliminar Registro</ActionButton>
                )}
              </div>
            )}

            {!resolved && !notif.local && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {notif.mac && <ActionButton icon={Eye} onClick={() => onViewDevice(notif.mac)}>Inspeccionar Equipo</ActionButton>}
                {notif.tipo === 'ALARMA' && notif.activa !== false && (
                  <ActionButton icon={RotateCcw} tone="amber" disabled={busy} onClick={() => run(() => center.resetDeviceAlarm(notif))}>
                    Restablecer Alarma
                  </ActionButton>
                )}
                {notif.tipo === 'ACCESO' && isAdmin && (
                  <>
                    <ActionButton icon={Check} tone="emerald" onClick={() => setMode(mode === 'approve' ? null : 'approve')}>Aprobar Acceso</ActionButton>
                    <ActionButton icon={X} tone="rose" disabled={busy} onClick={() => run(() => center.rejectAccess(notif))}>Rechazar</ActionButton>
                  </>
                )}
                {notif.tipo === 'RECUPERACION' && isAdmin && (
                  <ActionButton icon={KeyRound} tone="cyan" onClick={() => setMode(mode === 'password' ? null : 'password')}>
                    Asignar Clave
                  </ActionButton>
                )}
                {notif.estado === 'NUEVA' && notif.severidad !== 'INFO' && !['ACCESO', 'RECUPERACION'].includes(notif.tipo) && (
                  <ActionButton icon={ShieldCheck} tone="cyan" disabled={busy} onClick={() => run(() => center.acknowledge(notif))}>
                    Reconocer / Atender
                  </ActionButton>
                )}
                {notif.severidad === 'INFO' ? (
                  <ActionButton icon={Check} disabled={busy} onClick={() => run(() => center.resolve(notif, 'Revisada'))}>Marcar Leída</ActionButton>
                ) : (
                  <ActionButton icon={CheckCheck} tone="emerald" onClick={() => setMode(mode === 'resolve' ? null : 'resolve')}>Resolver Evento</ActionButton>
                )}
              </div>
            )}

            {mode === 'resolve' && (
              <div className="mt-3 space-y-2">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={2}
                  placeholder="Acciones correctivas realizadas (opcional)..."
                  className="w-full rounded-lg bg-slate-950/80 border border-slate-700 px-2.5 py-2 text-[12px] text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/60 font-sans"
                />
                <div className="flex gap-1.5 justify-end">
                  <ActionButton onClick={() => setMode(null)}>Cancelar</ActionButton>
                  <ActionButton icon={CheckCheck} tone="emerald" disabled={busy} onClick={() => run(() => center.resolve(notif, text))}>
                    Cerrar y Archivar
                  </ActionButton>
                </div>
              </div>
            )}

            {mode === 'approve' && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="rounded-lg bg-slate-950/80 border border-slate-700 px-2 py-1.5 text-[12px] text-white font-mono"
                >
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <ActionButton icon={Check} tone="emerald" disabled={busy} onClick={() => run(() => center.approveAccess(notif, role))}>
                  Confirmar Aprobación
                </ActionButton>
              </div>
            )}

            {mode === 'password' && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <input
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Contraseña temporal..."
                  className="flex-1 min-w-[140px] rounded-lg bg-slate-950/80 border border-slate-700 px-2.5 py-1.5 text-[12px] text-white placeholder:text-slate-500 font-mono"
                />
                <ActionButton icon={KeyRound} tone="cyan" disabled={busy || text.trim().length < 4} onClick={() => run(() => center.resetPassword(notif, text))}>
                  Guardar Credencial
                </ActionButton>
              </div>
            )}

            {error && <p className="text-[11px] text-rose-300 mt-2 font-sans">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NotificationsPanel({
  isOpen,
  onClose,
  center,
  isAdmin = false,
  sirenActive = false,
  onSilenceSiren = null,
  onNavigateToDetail = null,
  onOpenAdminModal = null
}) {
  const panelRef = useRef(null);
  const [tab, setTab] = useState('ALL');
  const [showResolved, setShowResolved] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [tabDir, setTabDir] = useState('none');
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState('');
  const listRef = useRef(null);

  const notifications = center?.notifications || [];
  const counts = center?.counts || { open: 0, critical: 0, warning: 0 };

  const tabs = useMemo(() => {
    const open = notifications.filter((n) => n.estado !== 'RESUELTA');
    const base = [
      { id: 'ALL', label: 'Todas', icon: Bell, count: open.length },
      { id: 'EQUIPO', label: 'Equipos', icon: Cpu, count: open.filter((n) => n.categoria === 'EQUIPO').length }
    ];
    if (isAdmin) {
      base.push({ id: 'USUARIO', label: 'Usuarios', icon: Users, count: open.filter((n) => n.categoria === 'USUARIO').length });
    }
    base.push({ id: 'SISTEMA', label: 'Sistema', icon: Server, count: open.filter((n) => n.categoria === 'SISTEMA').length });
    return base;
  }, [notifications, isAdmin]);

  const groups = useMemo(() => {
    const list = notifications
      .filter((n) => (tab === 'ALL' ? true : n.categoria === tab))
      .filter((n) => (showResolved ? n.estado === 'RESUELTA' : n.estado !== 'RESUELTA'));

    if (showResolved) {
      return [{
        id: 'RESUELTA',
        label: 'Historial Resuelto (Últimos 30 días)',
        items: list.sort((a, b) => Date.parse(b.resuelta_en || 0) - Date.parse(a.resuelta_en || 0))
      }];
    }

    const sorted = list.sort((a, b) =>
      (SEVERITY_ORDER[a.severidad] ?? 9) - (SEVERITY_ORDER[b.severidad] ?? 9) ||
      (a.estado === 'NUEVA' ? 0 : 1) - (b.estado === 'NUEVA' ? 0 : 1) ||
      Date.parse(b.creada_en || 0) - Date.parse(a.creada_en || 0)
    );
    return ['CRITICA', 'ADVERTENCIA', 'INFO']
      .map((sev) => ({ id: sev, label: SEVERITY_STYLES[sev].label, items: sorted.filter((n) => n.severidad === sev) }))
      .filter((g) => g.items.length > 0);
  }, [notifications, tab, showResolved]);

  const tabIds = useMemo(() => tabs.map((t) => t.id), [tabs]);
  const tabIndex = Math.max(0, tabIds.indexOf(tab));
  
  const selectTab = useCallback((next) => {
    setTabDir(tabIds.indexOf(next) > tabIndex ? 'next' : 'prev');
    setTab(next);
  }, [tabIds, tabIndex]);

  useSwipe(listRef, {
    enabled: isOpen,
    onSwipeLeft: () => stepThrough(tabIds, tab, 1, selectTab),
    onSwipeRight: () => stepThrough(tabIds, tab, -1, selectTab)
  });

  useEffect(() => {
    setConfirmClear(false);
    setClearError('');
  }, [tab, showResolved, isOpen]);

  const resolvedCount = notifications.filter((n) =>
    n.estado === 'RESUELTA' && !n.local && (tab === 'ALL' || n.categoria === tab)
  ).length;
  const canClear = isAdmin && showResolved && resolvedCount > 0;

  const clearHistory = async () => {
    setClearing(true);
    setClearError('');
    try {
      await center.clearHistory(tab);
      setConfirmClear(false);
    } catch (e) {
      setClearError(e?.message || 'No fue posible vaciar el historial.');
    } finally {
      setClearing(false);
    }
  };

  const openInfoCount = notifications.filter((n) => n.severidad === 'INFO' && n.estado !== 'RESUELTA' && !n.local).length;

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const prev = document.body.style.overflow;
    if (window.matchMedia?.('(max-width: 639px)').matches) {
      document.body.style.overflow = 'hidden';
    }
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;

  const viewDevice = (mac) => {
    onClose();
    onNavigateToDetail?.(mac);
  };

  const shared = center?.storeMode === 'remote';

  const content = (
    <>
      <div className="fixed inset-0 z-[99998] bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Centro de notificaciones y alarmas SCADA"
        className="notifications-panel fixed z-[100000] flex flex-col overflow-hidden border-cyan-500/40 shadow-2xl font-mono
          inset-x-0 bottom-0 h-[88dvh] rounded-t-2xl border-t
          sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-16 sm:w-[440px] sm:h-[min(700px,calc(100dvh-5rem))] sm:rounded-2xl sm:border"
        style={{ backgroundColor: 'rgba(10, 15, 30, 0.98)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="sm:hidden flex justify-center pt-2">
          <span className="w-10 h-1 rounded-full bg-slate-600" />
        </div>

        <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-cyan-500/15 border border-cyan-500/40">
              <Bell className="w-5 h-5 text-cyan-300" />
            </div>
            <div className="min-w-0">
              <h3 className="text-[14px] font-bold text-white leading-tight">Centro de Notificaciones</h3>
              <p className="text-[11px] text-slate-400 mt-0.5 font-sans">
                {counts.open === 0
                  ? 'Sin eventos pendientes de resolución'
                  : `${counts.critical} crítica${counts.critical === 1 ? '' : 's'} · ${counts.warning} advertencia${counts.warning === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>

        {sirenActive && (
          <div className="mx-3 mt-3 flex items-center justify-between gap-2 rounded-xl border border-rose-500/50 bg-rose-500/15 px-3 py-2 shrink-0">
            <span className="flex items-center gap-2 text-[12px] font-bold text-rose-200">
              <AlertTriangle className="w-4 h-4 animate-pulse" /> Sirena Industrial Activa
            </span>
            {onSilenceSiren && <ActionButton icon={VolumeX} tone="rose" onClick={onSilenceSiren}>Silenciar</ActionButton>}
          </div>
        )}

        <div className="flex items-center gap-3 px-4 py-2 text-[10px] text-slate-400 border-b border-white/5 shrink-0">
          <span className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${center?.mqttConnected ? 'bg-emerald-400' : 'bg-rose-500'}`} />
            MQTT: {center?.mqttConnected ? 'En línea' : 'Sin conexión'}
          </span>
          <span className="flex items-center gap-1.5">
            <Database className="w-3 h-3 text-cyan-400" />
            {shared ? 'PostgreSQL Central Sincronizado' : 'Registro de Terminal Local'}
          </span>
        </div>

        <div className="flex items-center gap-1 px-3 pt-2 overflow-x-auto shrink-0 scrollbar-none">
          {tabs.map((t) => {
            const TabIcon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTab(t.id)}
                className={`flex flex-1 sm:flex-none justify-center items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors ${
                  active ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40' : 'text-slate-400 border border-transparent hover:text-white hover:bg-white/5'
                }`}
              >
                <TabIcon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
                {t.count > 0 && (
                  <span className={`min-w-[18px] px-1 rounded-full text-[10px] font-bold ${active ? 'bg-cyan-400 text-slate-950' : 'bg-slate-700 text-slate-200'}`}>
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 px-3 py-2 shrink-0">
          <SwipeDots count={tabs.length} index={tabIndex} className="sm:hidden" />
          <button
            type="button"
            onClick={() => setShowResolved((v) => !v)}
            className={`ml-auto min-w-[110px] justify-center flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap border transition-all ${
              showResolved ? 'border-emerald-500/50 text-emerald-200 bg-emerald-500/10' : 'border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>{showResolved ? 'Ver Abiertas' : 'Historial'}</span>
          </button>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
          <div
            key={`${tab}-${showResolved}`}
            className={`space-y-3 min-h-full ${tabDir === 'next' ? 'swipe-enter-next' : tabDir === 'prev' ? 'swipe-enter-prev' : ''}`}
          >
            {groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-14 px-6 font-sans">
                <div className="p-3 rounded-full bg-emerald-500/10 border border-emerald-500/30 mb-3">
                  <ShieldCheck className="w-7 h-7 text-emerald-400" />
                </div>
                <p className="text-[13px] font-semibold text-white">
                  {showResolved ? 'Sin registros en el historial' : 'No hay alarmas activas'}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {showResolved 
                    ? 'Los eventos resueltos y archivados aparecerán en este registro.' 
                    : 'Todos los equipos operan dentro de los parámetros térmicos e interlocks nominales.'}
                </p>
              </div>
            ) : (
              groups.map((group) => (
                <section key={group.id}>
                  <button
                    type="button"
                    onClick={() => setCollapsed((c) => ({ ...c, [group.id]: !c[group.id] }))}
                    className="w-full flex items-center justify-between py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400"
                  >
                    <span>{group.label} ({group.items.length})</span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${collapsed[group.id] ? '-rotate-90' : ''}`} />
                  </button>
                  {!collapsed[group.id] && (
                    <div className="space-y-2">
                      {group.items.map((n) => (
                        <NotificationCard key={n.id} notif={n} center={center} isAdmin={isAdmin} canDelete={isAdmin} onViewDevice={viewDevice} />
                      ))}
                    </div>
                  )}
                </section>
              ))
            )}
          </div>
        </div>

        {(openInfoCount > 0 || canClear || (isAdmin && onOpenAdminModal)) && (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-t border-white/10 bg-slate-950/70 shrink-0">
            {canClear && (confirmClear ? (
              <>
                <ActionButton onClick={() => setConfirmClear(false)}>Cancelar</ActionButton>
                <ActionButton icon={Trash2} tone="rose" disabled={clearing} onClick={clearHistory}>
                  {clearing ? 'Eliminando...' : `Confirmar Borrado (${resolvedCount})`}
                </ActionButton>
              </>
            ) : (
              <ActionButton icon={Trash2} tone="rose" onClick={() => setConfirmClear(true)}>
                Vaciar Historial ({resolvedCount})
              </ActionButton>
            ))}
            {clearError && <span className="w-full text-[11px] text-rose-300 font-sans">{clearError}</span>}
            {openInfoCount > 0 && (
              <ActionButton icon={Check} onClick={() => center.resolveAllInfo()}>
                Depurar Informativas ({openInfoCount})
              </ActionButton>
            )}
            {isAdmin && onOpenAdminModal && (
              <button
                type="button"
                onClick={() => { onClose(); onOpenAdminModal(); }}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-200 text-[11px] font-semibold hover:bg-cyan-500/20"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Gestión de Accesos</span>
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );

  return createPortal(content, document.body);
}
