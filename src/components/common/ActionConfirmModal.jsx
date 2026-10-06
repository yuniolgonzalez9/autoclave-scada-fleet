import React from 'react';
import { createPortal } from 'react-dom';
import { 
  AlertTriangle, 
  ShieldCheck, 
  Check, 
  X, 
  Flame, 
  RotateCcw, 
  Square,
  Lock,
  UserCheck
} from 'lucide-react';

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
  if (!isOpen) return null;

  const getThemeConfig = () => {
    switch (actionType) {
      case 'START':
        return {
          icon: <Flame className="w-8 h-8 text-cyan-400" />,
          border: 'border-cyan-500/60',
          btnBg: 'bg-gradient-to-r from-cyan-500 to-blue-600',
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
    <div className="fixed inset-0 z-[9999999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className={`w-full max-w-md ultra-glass border-2 ${config.border} rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.9)] p-6 space-y-4 font-mono text-xs text-left animate-in fade-in zoom-in-95 duration-150`}>
        
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
            <span>Hora del Registro:</span>
            <span>{new Date().toLocaleTimeString()}</span>
          </div>
        </div>

        {/* Botones */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`flex-1 py-2.5 ${config.btnBg} text-white rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-lg active:scale-95`}
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

// Función Criptográfica para Sellar Reportes Clínicos con Hash SHA-256
export async function generateClinicalHash(dataString) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(dataString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32).toUpperCase();
  } catch (e) {
    // Fallback matemático
    let hash = 0;
    for (let i = 0; i < dataString.length; i++) {
      hash = ((hash << 5) - hash) + dataString.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(16, '0').toUpperCase();
  }
}
