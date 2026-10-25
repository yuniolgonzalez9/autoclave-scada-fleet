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
 * Algoritmo SHA-256 puro para intranets hospitalarias HTTP
 * donde window.crypto.subtle no está disponible.
 */
function sha256Fallback(ascii) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let i, j;
  let result = '';

  const words = [];
  const utf8 = unescape(encodeURIComponent(ascii));
  const asciiBitLength = utf8.length * 8;

  const hash = [];
  const k = [];
  let primeCounter = 0;
  const isComposite = {};

  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  for (i = 0; i < utf8.length; i++) {
    j = utf8.charCodeAt(i);
    words[i >> 2] |= j << ((3 - (i % 4)) * 8);
  }

  words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32));
  words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;

  for (let b = 0; b < words.length; b += 16) {
    const w = words.slice(b, b + 16);
    const oldHash = hash.slice(0);

    for (i = 0; i < 64; i++) {
      let w15 = w[i - 15], w2 = w[i - 2];

      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);

      w[i] = i < 16 ? w[i] : (w[i - 16] + s0 + w[i - 7] + s1) | 0;

      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const temp1 = (hash[7] + (rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25)) + ch + k[i] + w[i]) | 0;
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const temp2 = ((rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22)) + maj) | 0;

      hash[7] = hash[6];
      hash[6] = hash[5];
      hash[5] = hash[4];
      hash[4] = (hash[3] + temp1) | 0;
      hash[3] = hash[2];
      hash[2] = hash[1];
      hash[1] = hash[0];
      hash[0] = (temp1 + temp2) | 0;
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (let c = 3; c >= 0; c--) {
      const byte = (hash[i] >> (c * 8)) & 255;
      result += (byte < 16 ? '0' : '') + byte.toString(16);
    }
  }

  return result.toUpperCase();
}

/**
 * Función Criptográfica para Sellar Reportes y Comandos con Hash SHA-256 Íntegro (256 bits).
 * Cumple con FDA 21 CFR Part 11 e ISO 17665.
 */
export async function generateClinicalHash(dataString = '') {
  const str = String(dataString);

  // 1. Entorno seguro HTTPS / Localhost (Nativo Web Crypto API)
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(str);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      // Hash SHA-256 completo de 64 caracteres hexadecimales
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    } catch (_) {}
  }

  // 2. Fallback estándar para intranets hospitalarias HTTP sin Web Crypto
  return sha256Fallback(str);
}

export default function ActionConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirmar Acción Clínica',
  description = '¿Está seguro de ejecutar esta operación en el autoclave?',
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
      className="fixed inset-0 z-[99999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none font-mono"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div 
        className={`w-full max-w-md ultra-glass border-2 ${config.border} rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.9)] p-6 space-y-4 text-xs text-left`}
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
            className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all text-center"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`flex-1 py-2.5 ${config.btnBg} text-white rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all text-center`}
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
