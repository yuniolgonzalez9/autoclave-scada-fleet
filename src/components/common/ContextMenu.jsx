import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  ExternalLink, 
  Activity, 
  Pin, 
  Building2, 
  Lightbulb, 
  RotateCcw, 
  QrCode, 
  Copy, 
  X,
  Sliders
} from 'lucide-react';

export default function ContextMenu({ 
  isOpen, 
  position, 
  onClose, 
  device, 
  isAdmin, 
  canEditHardware,
  onOpenDetail,
  onToggleKiosk,
  onOpenAssignModal,
  onTestMotor,
  onResetAlarm,
  onOpenQR
}) {
  const menuRef = useRef(null);

  // Cerrar al hacer clic afuera o presionar Escape
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      window.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !device) return null;

  // Evitar que el menú se salga de los bordes de la pantalla
  const menuWidth = 240;
  const menuHeight = 360;
  const adjustedX = Math.min(position.x, window.innerWidth - menuWidth - 10);
  const adjustedY = Math.min(position.y, window.innerHeight - menuHeight - 10);

  // Abrir en Nueva Pestaña independiente
  const handleOpenNewTab = () => {
    const url = `${window.location.origin}${window.location.pathname}?mac=${device.mac}`;
    window.open(url, '_blank');
    onClose();
  };

  // Copiar MAC
  const handleCopyMac = () => {
    navigator.clipboard.writeText(device.mac).catch(() => {});
    alert(`MAC [${device.mac}] copiada al portapapeles.`);
    onClose();
  };

  return createPortal(
    <div 
      ref={menuRef}
      style={{ left: `${adjustedX}px`, top: `${adjustedY}px` }}
      className="fixed z-[999999] w-60 ultra-glass border-2 border-cyan-400/60 rounded-2xl shadow-[0_15px_50px_rgba(0,0,0,0.9)] p-2 font-mono text-xs backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-100 select-none"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Encabezado del Menú */}
      <div className="px-3 py-2 border-b border-cyan-500/20 mb-1 flex items-center justify-between">
        <div className="truncate">
          <p className="font-bold text-white text-[11px] truncate">{device.meta?.alias || `AUTOCLAVE [${device.mac.slice(-4)}]`}</p>
          <p className="text-[9px] text-cyan-300 font-mono truncate">{device.mac}</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-0.5">
        {/* Abrir en Nueva Pestaña */}
        <button
          onClick={handleOpenNewTab}
          className="w-full px-2.5 py-1.5 rounded-lg text-left text-slate-200 hover:bg-cyan-500/20 hover:text-white flex items-center gap-2 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
          <span>Abrir en Nueva Pestaña</span>
        </button>

        {/* Entrar a Control Total */}
        <button
          onClick={() => { onOpenDetail(device.mac); onClose(); }}
          className="w-full px-2.5 py-1.5 rounded-lg text-left text-slate-200 hover:bg-cyan-500/20 hover:text-white flex items-center gap-2 transition-colors"
        >
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          <span>Entrar a Control Total</span>
        </button>

        {/* Anclar Terminal */}
        <button
          onClick={() => { onToggleKiosk(device.mac); onClose(); }}
          className="w-full px-2.5 py-1.5 rounded-lg text-left text-slate-200 hover:bg-cyan-500/20 hover:text-white flex items-center gap-2 transition-colors"
        >
          <Pin className="w-3.5 h-3.5 text-amber-400" />
          <span>Anclar como Terminal Fija</span>
        </button>

        {/* Asignar a Cliente / Usuario (Admin) */}
        {isAdmin && (
          <button
            onClick={() => { onOpenAssignModal(device); onClose(); }}
            className="w-full px-2.5 py-1.5 rounded-lg text-left text-slate-200 hover:bg-cyan-500/20 hover:text-white flex items-center gap-2 transition-colors"
          >
            <Building2 className="w-3.5 h-3.5 text-purple-400" />
            <span>Asignar a Cliente / Usuario</span>
          </button>
        )}

        <div className="my-1 border-t border-slate-800"></div>

        {/* Acciones de Hardware Rápido (Técnico / Admin) */}
        {canEditHardware && (
          <>
            <button
              onClick={() => { onTestMotor(device.mac); onClose(); }}
              className="w-full px-2.5 py-1.5 rounded-lg text-left text-slate-200 hover:bg-cyan-500/20 hover:text-white flex items-center gap-2 transition-colors"
            >
              <Lightbulb className="w-3.5 h-3.5 text-emerald-400" />
              <span>Probar Motor (GPIO 2)</span>
            </button>

            <button
              onClick={() => { onResetAlarm(device.mac); onClose(); }}
              className="w-full px-2.5 py-1.5 rounded-lg text-left text-slate-200 hover:bg-cyan-500/20 hover:text-white flex items-center gap-2 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>Restablecer Alarma</span>
            </button>
          </>
        )}

        {/* Generar QR Quirúrgico */}
        <button
          onClick={() => { onOpenQR(device); onClose(); }}
          className="w-full px-2.5 py-1.5 rounded-lg text-left text-slate-200 hover:bg-cyan-500/20 hover:text-white flex items-center gap-2 transition-colors"
        >
          <QrCode className="w-3.5 h-3.5 text-emerald-400" />
          <span>Generar Etiqueta QR</span>
        </button>

        {/* Copiar MAC */}
        <button
          onClick={handleCopyMac}
          className="w-full px-2.5 py-1.5 rounded-lg text-left text-slate-400 hover:bg-slate-800 hover:text-white flex items-center gap-2 transition-colors"
        >
          <Copy className="w-3.5 h-3.5" />
          <span>Copiar Dirección MAC</span>
        </button>
      </div>
    </div>,
    document.body
  );
}
