import React from 'react';

export default function SwipeDots({ count, index, className = '' }) {
  if (count < 2) return null;
  return (
    <div className={`flex items-center justify-center gap-1.5 ${className}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? 'w-5 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]' : 'w-1.5 bg-slate-600'}`}
        />
      ))}
    </div>
  );
}
