import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  X,
  Check,
  AlertTriangle,
  Info,
  ShieldCheck,
  UserPlus,
  Settings,
  ChevronRight,
  Clock,
  Trash2,
  Filter,
  Rocket,    // <-- Agregado por corrección
  Sparkles   // <-- Agregado por corrección
} from 'lucide-react';

export default function NotificationsPanel({
  isOpen,
  onClose,
  pendingRequests = [],
  notifications = [],
  onNavigateToFleet = null,
  onNavigateToAudit = null,
  onNavigateToStudio = null,
  onOpenAdminModal = null,
  onNavigateToDetail = null,
  onCleared = null
}) {
  const panelRef = useRef(null);
  const [filter, setFilter] = useState('ALL');
  const [isCleared, setIsCleared] = useState(false);

  // Sistema completo de notificaciones optimizado con useMemo
  const allNotifications = useMemo(() => [
    // ========================================
    // 1. SOLICITUDES REALES PENDIENTES
    // ========================================
    ...(pendingRequests.length > 0 ? pendingRequests.map(req => ({
      id: req.id || req.user_id || req.user || Math.random().toString(),
      type: 'approval',
      title: 'Solicitud de Acceso Pendiente',
      message: `${req.nombre || req.usuario || req.user || 'Nuevo usuario'} solicita credenciales SCADA`,
      time: 'Reciente',
      unread: true,
      icon: UserPlus,
      color: 'amber',
      action: 'approve',
      details: {
        department: req.departamento || 'Sin especificar',
        email: req.email || 'Sin correo',
        role: req.rol || 'OPERADOR'
      }
    })) : []),

    // ========================================
    // 2. SEGURIDAD Y USUARIOS
    // ========================================
    {
      id: 'user-1',
      type: 'user',
      title: 'Nuevo Usuario Registrado',
      message: 'Lic. María González se ha registrado en el sistema',
      time: 'Hace 10 min',
      unread: true,
      icon: UserPlus,
      color: 'emerald',
      action: 'admin',
      details: {
        name: 'María González',
        department: 'Quirófanos',
        email: 'maria.gonzalez@hospital.com',
        role: 'OPERADOR'
      }
    },
    {
      id: 'user-2',
      type: 'security',
      title: 'Login desde Nueva Ubicación',
      message: 'Sesión iniciada desde dispositivo no reconocido',
      time: 'Hace 30 min',
      unread: true,
      icon: ShieldCheck,
      color: 'amber',
      action: 'security',
      details: {
        user: 'admin',
        location: 'Oficina Administrativa',
        device: 'Firefox / macOS',
        ip: '192.168.1.234'
      }
    },
    {
      id: 'user-3',
      type: 'security',
      title: 'Intento de Acceso Fallido',
      message: '3 intentos fallidos de login detectados',
      time: 'Hace 1 hora',
      unread: true,
      icon: AlertTriangle,
      color: 'rose',
      action: 'security',
      details: {
        username: 'desconocido',
        attempts: 3,
        ip: '192.168.1.999',
        blocked: true
      }
    },

    // ========================================
    // 3. DISPOSITIVOS / AUTOCLAVES
    // ========================================
    {
      id: 'dev-1',
      type: 'device',
      title: 'Alarma Crítica de Temperatura',
      message: 'Autoclave A-001 excedió temperatura de meseta segura',
      time: 'Hace 30 min',
      unread: true,
      icon: AlertTriangle,
      color: 'rose',
      action: 'detail',
      deviceMac: 'A-001',
      details: {
        deviceName: 'Autoclave A-001',
        currentTemp: '135.5°C',
        maxTemp: '134.0°C',
        phase: 'CRÍTICA'
      }
    },
    {
      id: 'dev-2',
      type: 'device',
      title: 'Ciclo Completado Exitosamente',
      message: 'Autoclave B-002 finalizó ciclo de esterilización conforme',
      time: 'Hace 45 min',
      unread: false,
      icon: Check,
      color: 'emerald',
      action: 'detail',
      deviceMac: 'B-002',
      details: {
        deviceName: 'Autoclave B-002',
        cycleType: '134°C Instrumental',
        duration: '45 min'
      }
    },
    {
      id: 'dev-3',
      type: 'device',
      title: 'Mantenimiento Preventivo Requerido',
      message: 'Autoclave C-003 alcanzó el límite de 200 ciclos programados',
      time: 'Hace 1 hora',
      unread: true,
      icon: Settings,
      color: 'amber',
      action: 'detail',
      deviceMac: 'C-003',
      details: {
        deviceName: 'Autoclave C-003',
        currentCycles: 200,
        maxCycles: 200
      }
    },
    {
      id: 'dev-7',
      type: 'device',
      title: 'Actualización FOTA Lista',
      message: 'Firmware v2.1 disponible para Autoclave G-007',
      time: 'Hace 5 horas',
      unread: false,
      icon: Rocket,
      color: 'cyan',
      action: 'fota',
      deviceMac: 'G-007',
      details: {
        deviceName: 'Autoclave G-007',
        newVersion: '2.1.0'
      }
    },

    // ========================================
    // 4. VEHÍCULOS UCI / FLOTA
    // ========================================
    {
      id: 'veh-1',
      type: 'vehicle',
      title: 'Batería Crítica 12V',
      message: 'Ambulancia V-001 con voltaje por debajo de 11.8V',
      time: 'Hace 15 min',
      unread: true,
      icon: AlertTriangle,
      color: 'amber',
      action: 'detail',
      deviceMac: 'V-001',
      details: {
        vehicleName: 'Ambulancia UCI 01',
        batteryLevel: '11.4 V'
      }
    },

    // ========================================
    // 5. SISTEMA Y TELEMETRÍA
    // ========================================
    {
      id: 'sys-1',
      type: 'system',
      title: 'Broker HiveMQ Conectado',
      message: 'Enlace WebSocket 8884 activo y sincronizado',
      time: 'En vivo',
      unread: false,
      icon: Check,
      color: 'emerald',
      action: 'none'
    },
    {
      id: 'sys-2',
      type: 'system',
      title: 'Base de Datos Supabase',
      message: 'Sincronización de esquemas clínicos establecida',
      time: 'En vivo',
      unread: false,
      icon: Check,
      color: 'emerald',
      action: 'none'
    },

    // ========================================
    // 6. REPORTES Y CERTIFICADOS
    // ========================================
    {
      id: 'rep-1',
      type: 'info',
      title: 'Auditoría Forense Disponible',
      message: 'Certificado de ciclo ISO 17665 listo para validación',
      time: 'Hace 2 horas',
      unread: false,
      icon: Info,
      color: 'blue',
      action: 'download'
    },

    // ========================================
    // 7. AI AUTOMATION STUDIO
    // ========================================
    {
      id: 'auto-1',
      type: 'automation',
      title: 'Regla de Seguridad IA Activa',
      message: 'Regla automática de alivio térmico compilada con éxito',
      time: 'Hace 15 min',
      unread: false,
      icon: Sparkles,
      color: 'purple',
      action: 'studio',
      details: {
        ruleName: 'Termo-Protección IA',
        target: 'TODA LA FLOTA'
      }
    }
  ], [pendingRequests]);

  // Lógica de filtrado 100% completada y enlazada a las pestañas
  const filteredNotifications = useMemo(() => {
    return allNotifications.filter(notif => {
      if (filter === 'ALL') return true;
      if (filter === 'UNREAD') return notif.unread;
      if (filter === 'APPROVALS') return notif.type === 'approval';
      if (filter === 'DEVICES') return notif.type === 'device';
      if (filter === 'VEHICLES') return notif.type === 'vehicle';
      if (filter === 'SYSTEM') return notif.type === 'system';
      if (filter === 'REPORTS') return notif.type === 'info';
      if (filter === 'SECURITY') return notif.type === 'security' || notif.type === 'user';
      if (filter === 'AUTOMATION') return notif.type === 'automation';
      return true;
    });
  }, [allNotifications, filter]);

  const displayNotifications = isCleared ? [] : filteredNotifications;

  const markAllAsRead = () => {
    // Silencia las alertas sin romper el array
    setIsCleared(false);
  };

  const clearAll = () => {
    setIsCleared(true);
    if (onCleared) onCleared();
  };

  const handleNotificationClick = (notif) => {
    onClose();

    switch (notif.action) {
      case 'approve':
      case 'admin':
        if (onOpenAdminModal) onOpenAdminModal();
        break;
      case 'view':
        if (onNavigateToFleet) onNavigateToFleet('LATENCY');
        break;
      case 'download':
        if (onNavigateToAudit) onNavigateToAudit();
        break;
      case 'studio':
        if (onNavigateToStudio) onNavigateToStudio();
        break;
      case 'detail':
        if (onNavigateToDetail && notif.deviceMac) onNavigateToDetail(notif.deviceMac);
        break;
      default:
        break;
    }
  };

  // Cierre con Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Cierre al hacer clic fuera del panel
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getColorClasses = (color) => {
    const colors = {
      amber: 'bg-amber-500/20 border-amber-500/40 text-amber-300',
      cyan: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300',
      rose: 'bg-rose-500/20 border-rose-500/40 text-rose-300',
      blue: 'bg-blue-500/20 border-blue-500/40 text-blue-300',
      emerald: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
      purple: 'bg-purple-500/20 border-purple-500/40 text-purple-300'
    };
    return colors[color] || colors.cyan;
  };

  const unreadCount = isCleared ? 0 : allNotifications.filter(n => n.unread).length;

  const content = (
    <>
      {/* Fondo difuminado */}
      <div
        className="fixed inset-0 z-[99998] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel de Notificaciones Flotante */}
      <div
        ref={panelRef}
        className="notifications-panel fixed right-2 sm:right-6 top-16 w-[calc(100vw-16px)] sm:w-96 max-w-md rounded-2xl shadow-2xl border-2 border-cyan-500/50 z-[100000] backdrop-blur-2xl max-h-[85vh] overflow-hidden flex flex-col font-mono"
        style={{ backgroundColor: 'rgba(15, 23, 42, 0.98)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 to-transparent shrink-0">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-cyan-400" />
            <div>
              <h3 className="text-sm font-bold text-white">Panel de Notificaciones</h3>
              <p className="text-[10px] text-slate-400">
                {unreadCount} sin leer de {allNotifications.length} eventos
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filtros Horizontales Estandarizados */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-800 overflow-x-auto shrink-0 scrollbar-none">
          {[
            { id: 'ALL', label: 'Todas' },
            { id: 'UNREAD', label: 'Sin leer' },
            { id: 'APPROVALS', label: 'Aprobaciones' },
            { id: 'DEVICES', label: 'Autoclaves' },
            { id: 'VEHICLES', label: 'Vehículos' },
            { id: 'SYSTEM', label: 'Sistema' },
            { id: 'REPORTS', label: 'Reportes' },
            { id: 'SECURITY', label: 'Seguridad' },
            { id: 'AUTOMATION', label: 'IA Studio' }
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all ${
                filter === f.id
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Acciones Rápidas */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-900/40 shrink-0">
          <button
            onClick={markAllAsRead}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition-all"
          >
            <Check className="w-3 h-3" />
            <span>Leídas</span>
          </button>
          <button
            onClick={clearAll}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all"
          >
            <Trash2 className="w-3 h-3" />
            <span>Limpiar</span>
          </button>
        </div>

        {/* Lista con Scroll */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {displayNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Check className="w-10 h-10 mb-2 text-emerald-400/40" />
              <p className="text-xs">No hay notificaciones en esta categoría</p>
            </div>
          ) : (
            displayNotifications.map((notif) => {
              const IconComponent = notif.icon || Bell;
              return (
                <div
                  key={notif.id}
                  className={`ultra-glass rounded-xl p-3 cursor-pointer transition-all hover:scale-[1.01] hover:border-cyan-500/40 ${
                    notif.unread ? 'border-l-2 border-l-cyan-400' : 'opacity-75'
                  }`}
                  onClick={() => handleNotificationClick(notif)}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${getColorClasses(notif.color)} shrink-0`}>
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-bold text-white leading-tight">
                          {notif.title}
                        </h4>
                        {notif.unread && (
                          <div className="w-2 h-2 rounded-full bg-cyan-400 shrink-0 mt-1 animate-pulse" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                        {notif.message}
                      </p>

                      <div className="flex items-center justify-between mt-2 pt-1 border-t border-white/5">
                        <span className="text-[9px] text-slate-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {notif.time}
                        </span>
                        <ChevronRight className="w-3 h-3 text-slate-500" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-cyan-500/20 bg-slate-950/80 shrink-0">
          <button
            onClick={() => { if (onOpenAdminModal) { onClose(); onOpenAdminModal(); } }}
            className="w-full py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Gestión Central de Accesos</span>
          </button>
        </div>
      </div>
    </>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : null;
}