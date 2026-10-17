import React, { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  ShieldCheck, 
  Check, 
  Flame, 
  RotateCcw, 
  Square, 
  UserCheck,
  AlertTriangle,
  X
} from 'lucide-react';

/**
 * Función Criptográfica para Sellar Reportes y Comandos con Hash SHA-256
 * Compatible con HTTPS (Web Crypto API) y con redes locales HTTP (Fallback FNV-1a)
 */
export async function generateClinicalHash(dataString = '') {
  const str = String(dataString);

  // 1. Entorno seguro HTTPS / Localhost
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(str);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32).toUpperCase();
    } catch (_) {}
  }

  // 2. Fallback matemático de dispersión para intranets hospitalarias sin certificado SSL
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  const timestampPart = Date.now().toString(16).slice(-8);
  return `${part1}${part2}${timestampPart}`.substring(0, 32).toUpperCase();
}

export default function ActionConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirmar Acción Clínica',
  description = '¿Estás seguro de ejecutar esta operación en el autoclave?',
  actionType = 'WARNING', // 'START' | 'STOP' | 'RESET' | 'WARNING'
  deviceName = 'AUTOCLAVE',
  operatorName = 'Operador Activo'
}) {
  // Manejador de Escape para cancelar
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen || typeof document === 'undefined') return null;

  const getThemeConfig = () => {
    switch (actionType) {
      case 'START':
        return {
          icon: <Flame className="w-8 h-8 text-cyan-400" />,
          border: 'border-cyan-500/60',
          btnBg: 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90',
          btnText: 'Confirmar & Iniciar Ciclo',
          badge: 'ORDEN DE MARCHA'
        };
      case 'STOP':
        return {
          icon: <Square className="w-8 h-8 text-rose-500 fill-rose-500" />,
          border: 'border-rose-500/70',
          btnBg: 'bg-rose-600 hover:bg-rose-500',
          btnText: 'Ejecutar Paro de Emergencia',
          badge: 'INTERRUPCIÓN CRÍTICA'
        };
      case 'RESET':
        return {
          icon: <RotateCcw className="w-8 h-8 text-amber-400" />,
          border: 'border-amber-500/60',
          btnBg: 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold',
          btnText: 'Restablecer Error',
          badge: 'RESET SISTEMA'
        };
      default:
        return {
          icon: <ShieldCheck className="w-8 h-8 text-emerald-400" />,
          border: 'border-cyan-500/50',
          btnBg: 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold',
          btnText: 'Autorizar Operación',
          badge: 'SEGURIDAD'
        };
    }
  };

  const config = getThemeConfig();

  return createPortal(
    <div 
      className="fixed inset-0 z-[99999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none"
      onClick={onClose}
    >
      <div 
        className={`w-full max-w-md ultra-glass border-2 ${config.border} rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.9)] p-6 space-y-4 font-mono text-xs text-left`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-slate-900 border border-white/10 shrink-0">
            {config.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-white/10 text-cyan-300">
                {config.badge}
              </span>
              <span className="text-[10px] text-slate-400">FDA 21 CFR PART 11</span>
            </div>
            <h3 className="font-bold text-white text-sm sm:text-base mt-1 truncate">
              {title}
            </h3>
            <p className="text-[11px] text-cyan-400 truncate mt-0.5">
              Equipo: <strong>{deviceName}</strong>
            </p>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="text-slate-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-slate-300 font-sans text-xs leading-relaxed">
          {description}
        </p>

        {/* Firma Electrónica del Operador Responsable */}
        <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 space-y-1">
          <div className="flex justify-between items-center text-[10px] text-slate-400">
            <span className="flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
              Operador Responsable:
            </span>
            <span className="text-white font-bold">{operatorName}</span>
          </div>
          <div className="flex justify-between items-center text-[9px] text-slate-500">
            <span>Hora de Registro:</span>
            <span>{new Date().toLocaleTimeString()}</span>
          </div>
        </div>

        {/* Botones de Confirmación */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`flex-1 py-2.5 ${config.btnBg} text-white rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all`}
          >
            <Check className="w-4 h-4" />
            <span>{config.btnText}</span>
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}
