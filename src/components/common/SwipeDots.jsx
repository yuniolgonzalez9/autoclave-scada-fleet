import React, { useMemo } from 'react';

const MAX_VISIBLE_DOTS = 12; // Límite estético para evitar desbordamiento horizontal en móviles

export default function SwipeDots({ count = 0, index = 0, className = '' }) {
  const safeCount = Math.max(0, parseInt(count, 10) || 0);
  const safeIndex = Math.max(0, Math.min(parseInt(index, 10) || 0, safeCount - 1));

  // No renderizar si hay menos de 2 elementos
  if (safeCount < 2) return null;

  // Si la cantidad de elementos excede el límite visible en pantalla, no saturar la UI
  if (safeCount > MAX_VISIBLE_DOTS) {
    return (
      <div 
        className={`flex items-center justify-center gap-1.5 select-none ${className}`} 
        aria-hidden="true"
      >
        <span className="text-[10px] font-mono text-slate-500 font-bold">
          {safeIndex + 1} / {safeCount}
        </span>
      </div>
    );
  }

  return (
    <div 
      className={`flex items-center justify-center gap-1.5 select-none ${className}`} 
      aria-hidden="true"
    >
      {Array.from({ length: safeCount }, (_, i) => {
        const isActive = i === safeIndex;
        return (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              isActive 
                ? 'w-5 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]' 
                : 'w-1.5 bg-slate-600/70 hover:bg-slate-500'
            }`}
          />
        );
      })}
    </div>
  );
}
