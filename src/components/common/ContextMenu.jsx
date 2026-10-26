import React, { useEffect, useRef, useCallback, useState } from 'react';
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
  Check,
  X 
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
  const [copied, setCopied] = useState(false);

  // Cerrar al presionar la tecla Escape
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  // Cierre por clic o toque fuera del menú
  useEffect(() => {
    const handleOutsideInteraction = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener('mousedown', handleOutsideInteraction);
      window.addEventListener('touchstart', handleOutsideInteraction, { passive: true });
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('mousedown', handleOutsideInteraction);
      window.removeEventListener('touchstart', handleOutsideInteraction);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, handleKeyDown]);

  useEffect(() => {
    if (isOpen) setCopied(false);
  }, [isOpen]);

  if (!isOpen || !device || typeof document === 'undefined') return null;

  // Cálculo antidesborde según dimensiones del viewport
  const menuWidth = 250;
  const menuHeight = 360;
  const adjustedX = Math.max(10, Math.min(position?.x || 10, window.innerWidth - menuWidth - 15));
  const adjustedY = Math.max(10, Math.min(position?.y || 10, window.innerHeight - menuHeight - 15));

  // Abrir en Nueva Pestaña independiente con parámetro MAC
  const handleOpenNewTab = () => {
    const cleanMac = (device.mac || '').toUpperCase().replace(/[:\-]/g, '');
    const url = `${window.location.origin}${window.location.pathname}?mac=${cleanMac}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    onClose();
  };

  const fallbackCopy = (text) => {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.style.top = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => onClose(), 600);
    } catch (_) {
      onClose();
    }
  };

  // Copiado al Portapapeles con fallback para redes HTTP locales
  const handleCopyMac = () => {
    const macToCopy = (device.mac || '').toUpperCase().replace(/[:\-]/g, '');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(macToCopy)
        .then(() => {
          setCopied(true);
          setTimeout(() => onClose(), 600);
        })
        .catch(() => fallbackCopy(macToCopy));
    } else {
      fallbackCopy(macToCopy);
    }
  };

  return createPortal(
    <div 
      ref={menuRef}
      style={{ left: `${adjustedX}px`, top: `${adjustedY}px` }}
      role="menu"
      aria-label="Acciones de equipo SCADA"
      className="fixed z-[99999] w-64 ultra-glass border-2 border-cyan-400/60 rounded-2xl shadow-[0_15px_50px_rgba(0,0,0,0.9)] p-2 font-mono text-xs backdrop-blur-2xl select-none animate-in fade-in zoom-in-95 duration-100"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Encabezado */}
      <div className="px-3 py-2 border-b border-cyan-500/20 mb-1 flex items-center justify-between">
        <div className="min-w-0 flex-1 pr-2">
          <p className="font-bold text-white text-[11px] truncate">
            {device.meta?.alias || `EQUIPO [${device.mac.slice(-4)}]`}
          </p>
          <p className="text-[9px] text-cyan-300 font-mono truncate">
            {device.mac}
          </p>
        </div>
        <button 
          type="button" 
          onClick={onClose} 
          className="text-slate-400 hover:text-white p-1 rounded transition-colors"
          aria-label="Cerrar menú contextual"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-0.5" role="none">
        {/* Abrir en Pestaña Independiente */}
        <button
          type="button"
          role="menuitem"
          onClick={handleOpenNewTab}
          className="w-full px-2.5 py-1.5 rounded-lg text-left text-slate-200 hover:bg-cyan-500/20 hover:text-white flex items-center gap-2 transition-colors font-medium"
        >
          <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
          <span>Abrir en Nueva Pestaña</span>
        </button>

        {/* Control Directo */}
        <button
          type="button"
          role="menuitem"
          onClick={() => { onOpenDetail(device.mac); onClose(); }}
          className="w-full px-2.5 py-1.5 rounded-lg text-left text-slate-200 hover:bg-cyan-500/20 hover:text-white flex items-center gap-2 transition-colors font-bold"
        >
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          <span>Entrar a Cabina de Control</span>
        </button>

        {/* Anclar Terminal */}
        <button
          type="button"
          role="menuitem"
          onClick={() => { onToggleKiosk(device.mac); onClose(); }}
          className="w-full px-2.5 py-1.5 rounded-lg text-left text-slate-200 hover:bg-cyan-500/20 hover:text-white flex items-center gap-2 transition-colors"
        >
          <Pin className="w-3.5 h-3.5 text-amber-400" />
          <span>Fijar como Terminal Kiosk</span>
        </button>

        {/* Asignación de Equipo (Administrador) */}
        {isAdmin && (
          <button
            type="button"
            role="menuitem"
            onClick={() => { onOpenAssignModal(device); onClose(); }}
            className="w-full px-2.5 py-1.5 rounded-lg text-left text-slate-200 hover:bg-cyan-500/20 hover:text-white flex items-center gap-2 transition-colors"
          >
            <Building2 className="w-3.5 h-3.5 text-purple-400" />
            <span>Asignar a Hospital / Usuario</span>
          </button>
        )}

        <div className="my-1 border-t border-slate-800" role="separator" />

        {/* Pruebas de Hardware (Técnico / Administrador) */}
        {canEditHardware && (
          <>
            <button
              type="button"
              role="menuitem"
              onClick={() => { onTestMotor(device.mac); onClose(); }}
              className="w-full px-2.5 py-1.5 rounded-lg text-left text-slate-200 hover:bg-cyan-500/20 hover:text-white flex items-center gap-2 transition-colors"
            >
              <Lightbulb className="w-3.5 h-3.5 text-emerald-400" />
              <span>Conmutar Salida (GPIO 2)</span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => { onResetAlarm(device.mac); onClose(); }}
              className="w-full px-2.5 py-1.5 rounded-lg text-left text-slate-200 hover:bg-cyan-500/20 hover:text-white flex items-center gap-2 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>Restablecer Alarma</span>
            </button>
          </>
        )}

        {/* Rótulo QR */}
        <button
          type="button"
          role="menuitem"
          onClick={() => { onOpenQR(device); onClose(); }}
          className="w-full px-2.5 py-1.5 rounded-lg text-left text-slate-200 hover:bg-cyan-500/20 hover:text-white flex items-center gap-2 transition-colors"
        >
          <QrCode className="w-3.5 h-3.5 text-emerald-400" />
          <span>Generar Rótulo QR Quirúrgico</span>
        </button>

        {/* Copiar Identificador MAC */}
        <button
          type="button"
          role="menuitem"
          onClick={handleCopyMac}
          className="w-full px-2.5 py-1.5 rounded-lg text-left text-slate-400 hover:bg-slate-800 hover:text-white flex items-center gap-2 transition-colors font-mono"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? '¡MAC Copiada al Portapapeles!' : 'Copiar Dirección MAC'}</span>
        </button>
      </div>
    </div>,
    document.body
  );
}
