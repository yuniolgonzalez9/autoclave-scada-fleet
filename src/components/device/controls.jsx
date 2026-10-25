import React from 'react';
import {
  Activity, 
  Bell, 
  CircleDot, 
  DoorClosed, 
  DoorOpen, 
  Droplets, 
  Fan, 
  Flame, 
  Gauge, 
  Lightbulb, 
  Lock, 
  Power,
  RotateCcw, 
  ShieldCheck, 
  Snowflake, 
  Thermometer, 
  Unlock, 
  Waves, 
  Wind, 
  Zap
} from 'lucide-react';

const ROLE_ICONS = [
  [/CALENT|RESIST|CALOR|HEAT|CALDERA|VAPOR/, Flame],
  [/BOMBA.*AGUA|AGUA|WATER|LLENADO|INYECCION/, Droplets],
  [/VAC[IÍ]O|VACUUM/, Wind],
  [/PURGA|DESFOGUE|ALIVIO|ESCAPE|VENT/, Waves],
  [/PUERTA|DOOR/, DoorClosed],
  [/SELLO|CIERRE|LOCK/, Lock],
  [/VENTIL|FAN|TURBINA/, Fan],
  [/FR[IÍ]O|COOL|COMPRES/, Snowflake],
  [/LUZ|LAMP|LIGHT|ILUM/, Lightbulb],
  [/ALARMA|SIRENA|BUZZ/, Bell],
  [/MOTOR|ARRANQ|IGNIC|ACC/, Zap],
  [/ESTERIL/, ShieldCheck],
  [/TEMP/, Thermometer],
  [/PRES/, Gauge]
];

export function iconFor(...hints) {
  const text = hints.filter(Boolean).join(' ').toUpperCase();
  const hit = ROLE_ICONS.find(([re]) => re.test(text));
  return hit ? hit[1] : Power;
}

export const TONES = {
  cyan: { 
    on: 'from-cyan-500/25 to-cyan-500/5 border-cyan-400/60', 
    icon: 'bg-cyan-400 text-slate-950 shadow-[0_0_18px_rgba(34,211,238,0.55)]', 
    text: 'text-cyan-200', 
    track: 'bg-cyan-400' 
  },
  emerald: { 
    on: 'from-emerald-500/25 to-emerald-500/5 border-emerald-400/60', 
    icon: 'bg-emerald-400 text-slate-950 shadow-[0_0_18px_rgba(52,211,153,0.55)]', 
    text: 'text-emerald-200', 
    track: 'bg-emerald-400' 
  },
  amber: { 
    on: 'from-amber-500/25 to-amber-500/5 border-amber-400/60', 
    icon: 'bg-amber-400 text-slate-950 shadow-[0_0_18px_rgba(251,191,36,0.55)]', 
    text: 'text-amber-200', 
    track: 'bg-amber-400' 
  },
  rose: { 
    on: 'from-rose-500/25 to-rose-500/5 border-rose-400/60', 
    icon: 'bg-rose-400 text-slate-950 shadow-[0_0_18px_rgba(251,113,133,0.55)]', 
    text: 'text-rose-200', 
    track: 'bg-rose-400' 
  },
  violet: { 
    on: 'from-violet-500/25 to-violet-500/5 border-violet-400/60', 
    icon: 'bg-violet-400 text-slate-950 shadow-[0_0_18px_rgba(167,139,250,0.55)]', 
    text: 'text-violet-200', 
    track: 'bg-violet-400' 
  },
  sky: { 
    on: 'from-sky-500/25 to-sky-500/5 border-sky-400/60', 
    icon: 'bg-sky-400 text-slate-950 shadow-[0_0_18px_rgba(56,189,248,0.55)]', 
    text: 'text-sky-200', 
    track: 'bg-sky-400' 
  }
};

function getSafeTone(tone) {
  return TONES[tone] || TONES.cyan;
}

export function Switch({ on, tone = 'cyan' }) {
  const currentTone = getSafeTone(tone);
  return (
    <span 
      className={`relative inline-flex w-11 h-6 rounded-full transition-colors duration-200 shrink-0 ${
        on ? currentTone.track : 'bg-slate-700'
      }`}
      aria-hidden="true"
    >
      <span 
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-200 ${
          on ? 'left-[22px]' : 'left-0.5'
        }`} 
      />
    </span>
  );
}

export function ToggleTile({ 
  label, 
  sublabel, 
  on, 
  onToggle, 
  disabled = false, 
  tone = 'cyan', 
  icon: Icon = Power, 
  compact = false 
}) {
  const currentTone = getSafeTone(tone);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={onToggle}
      className={`control-tile group w-full text-left flex items-center gap-3 rounded-2xl border bg-gradient-to-br transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 ${
        compact ? 'p-2.5' : 'p-3'
      } ${
        on 
          ? currentTone.on 
          : 'from-slate-900/80 to-slate-950/80 border-slate-700/70 hover:border-slate-500'
      }`}
    >
      <span 
        className={`flex items-center justify-center rounded-xl shrink-0 transition-all duration-200 ${
          compact ? 'w-8 h-8' : 'w-10 h-10'
        } ${
          on 
            ? currentTone.icon 
            : 'bg-slate-800 text-slate-400 group-hover:text-slate-200'
        }`}
      >
        <Icon className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
      </span>

      <span className="flex-1 min-w-0">
        <span className={`block text-[12px] font-semibold font-sans truncate ${on ? 'text-white' : 'text-slate-200'}`}>
          {label}
        </span>
        <span className={`block text-[10px] font-mono ${on ? currentTone.text : 'text-slate-500'}`}>
          {sublabel ?? (on ? 'Energizado' : 'Inactivo')}
        </span>
      </span>

      <Switch on={on} tone={tone} />
    </button>
  );
}

export function ActionTile({ 
  label, 
  hint, 
  icon: Icon = Activity, 
  onClick, 
  disabled = false, 
  tone = 'cyan' 
}) {
  const currentTone = getSafeTone(tone);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="control-tile group w-full flex items-center gap-3 p-3 rounded-2xl border border-slate-700/70 bg-gradient-to-br from-slate-900/80 to-slate-950/80 hover:border-slate-500 active:scale-[0.98] transition-all disabled:opacity-40"
    >
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${currentTone.icon}`}>
        <Icon className="w-5 h-5" />
      </span>
      <span className="flex-1 min-w-0 text-left">
        <span className="block text-[12px] font-semibold font-sans text-white truncate">
          {label}
        </span>
        {hint && (
          <span className="block text-[10px] text-slate-400 font-sans truncate">
            {hint}
          </span>
        )}
      </span>
    </button>
  );
}

export function LedTile({ label, on, tone = 'emerald', sublabel }) {
  const currentTone = getSafeTone(tone);

  return (
    <div 
      className={`flex items-center gap-2.5 p-2.5 rounded-2xl border transition-all ${
        on ? `bg-gradient-to-br ${currentTone.on}` : 'border-slate-800 bg-slate-950/60'
      }`}
    >
      <span className="relative flex w-3.5 h-3.5 shrink-0">
        {on && (
          <span className={`absolute inset-0 rounded-full ${currentTone.track} opacity-60 animate-ping`} />
        )}
        <span className={`relative w-3.5 h-3.5 rounded-full ${on ? currentTone.track : 'bg-slate-700'}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold font-sans text-slate-200 truncate">
          {label}
        </span>
        <span className={`block text-[10px] font-mono ${on ? currentTone.text : 'text-slate-500'}`}>
          {sublabel ?? (on ? 'Activa' : 'Inactiva')}
        </span>
      </span>
    </div>
  );
}

export function ProgramPicker({ programs = [], value, onChange, disabled = false }) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar snap-x pb-1" data-no-swipe>
      {programs.map((p) => {
        const active = p.id === value;
        const rawName = String(p.nombre || '');
        const hasParens = rawName.includes('(');
        
        const titulo = hasParens ? rawName.split(/\s*\(/)[0] : rawName;
        const detalle = hasParens ? rawName.slice(rawName.indexOf('(') + 1).replace(/\)$/, '') : '';

        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(p.id)}
            className={`snap-start shrink-0 w-44 text-left p-3 rounded-2xl border transition-all disabled:opacity-40 select-none ${
              active 
                ? 'border-cyan-400 bg-gradient-to-br from-cyan-500/25 to-blue-600/10 shadow-[0_0_16px_rgba(34,211,238,0.25)]' 
                : 'border-slate-700/70 bg-slate-950/60 hover:border-slate-500'
            }`}
          >
            <span 
              className={`inline-block px-1.5 py-0.5 rounded-md text-[10px] font-bold font-mono ${
                active ? 'bg-cyan-400 text-slate-950' : 'bg-slate-800 text-slate-300'
              }`}
            >
              Programa P{p.id}
            </span>
            <span className="block mt-1.5 text-[12px] font-semibold font-sans text-white leading-tight line-clamp-2">
              {titulo}
            </span>
            {detalle && (
              <span className="block mt-1 text-[10px] text-slate-400 font-sans line-clamp-2">
                {detalle}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export { DoorOpen, Lock, RotateCcw, Unlock, CircleDot };
