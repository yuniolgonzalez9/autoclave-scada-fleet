import { memo } from 'react';
import { Activity, Car, Cpu, ChevronRight } from 'lucide-react';
import { getDeviceHealth, getDeviceType } from '../../utils/deviceHealth';
import { useNow } from '../../hooks/useNow';

// Tarjeta de equipo de la grilla de flota. Memoizada: solo se re-renderiza
// cuando cambia SU dispositivo (identidad del objeto) o su propio reloj
// interno para la frescura del badge — antes toda la grilla re-renderizaba
// con cada tick de la app.
const HEALTH_CLASS = {
  ONLINE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  LATENCY: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  OFFLINE: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
};

const FleetDeviceCard = memo(function FleetDeviceCard({ dev, onOpen, onContextMenu }) {
  const now = useNow(4000);
  const health = getDeviceHealth(dev, now);
  const colorClass = HEALTH_CLASS[health.status] || HEALTH_CLASS.OFFLINE;

  const dDev = dev.datos || {};
  const devTipo = getDeviceType(dev);
  const isVeh = devTipo === 'VEHICULO';
  const isPlc = devTipo === 'UNIVERSAL_PLC' || devTipo === 'PLC_GENERICO';

  const fase = String(dDev.fase || 'EN ESPERA').toUpperCase();
  const faseActiva = !/^(EN[ _]?ESPERA|ESPERA|APAGADO|CANCELADO|FINALIZADO.*|LISTO|IDLE)$/.test(fase.trim());
  const faseTone = /ALARM|ERROR|FALL|ABORT|CANCEL/.test(fase)
    ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
    : /FINALIZ|EXITO|ÉXITO/.test(fase)
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
      : faseActiva
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
        : 'border-slate-700 bg-slate-900/60 text-slate-300';
  const segRest = Number(dDev.seg_restantes || 0);

  const tempNum = parseFloat(dDev.temp_camara ?? 25.0);
  const presNum = parseFloat(dDev.presion ?? 0.0);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Abrir equipo ${dev.meta?.alias || dev.mac}`}
      onClick={() => onOpen(dev.mac)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(dev.mac);
        }
      }}
      onContextMenu={(e) => onContextMenu(e, dev)}
      className="fleet-device-card ultra-glass glow-border scale-3d p-5 rounded-2xl cursor-pointer flex flex-col justify-between"
    >
      <div>
        <div className="flex justify-between items-start mb-3">
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-sm text-white">{dev.meta?.alias || `EQUIPO [${dev.mac.slice(-4)}]`}</h3>
              <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold border flex items-center gap-1 ${
                isVeh
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : isPlc
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                  : 'bg-cyan-500/20 text-cyan-300 border-cyan-400'
              }`}>
                {isVeh ? <Car className="w-2.5 h-2.5" /> : isPlc ? <Cpu className="w-2.5 h-2.5" /> : <Activity className="w-2.5 h-2.5" />}
                {devTipo}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">{dev.meta?.cliente || 'Cliente'} • {dev.mac}</p>
          </div>

          <div className="text-right">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border font-bold ${colorClass} status-indicator`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                health.status === 'ONLINE' ? 'bg-emerald-400 pulse-organic' :
                health.status === 'LATENCY' ? 'bg-amber-400 pulse-organic' :
                'bg-rose-400'
              }`}></span>
              {health.text}
            </span>
            <span className="block text-[9px] text-slate-400 font-mono mt-0.5">
              {health.timeAgo}
            </span>
          </div>
        </div>

        {isVeh ? (
          <div className="grid grid-cols-2 gap-2 my-3">
            <div className="p-2.5 rounded-xl glass-cell hologram text-center w-full scale-3d">
              <span className="text-[10px] font-mono text-emerald-400 block">BATERÍA 12V</span>
              <span className="text-xl font-bold font-mono text-emerald-300">
                {(dDev.bateria_v || 12.6).toFixed(1)} V
              </span>
            </div>
            <div className="p-2.5 rounded-xl glass-cell hologram text-center w-full scale-3d">
              <span className="text-[10px] font-mono text-amber-400 block">ESTADO</span>
              <span className="text-sm font-bold font-mono text-white truncate block mt-1">
                {dDev.fase || 'APAGADO'}
              </span>
            </div>
          </div>
        ) : isPlc ? (
          <div className="grid grid-cols-2 gap-2 my-3 font-mono">
            <div className="p-2.5 rounded-xl glass-cell hologram text-center w-full scale-3d">
              <span className="text-[10px] text-cyan-400 block">RELÉS</span>
              <span className="text-xl font-bold text-white">
                {Object.values(dDev.reles || {}).filter(Boolean).length} / 8
              </span>
            </div>
            <div className="p-2.5 rounded-xl glass-cell hologram text-center w-full scale-3d">
              <span className="text-[10px] text-emerald-400 block">ENTRADAS</span>
              <span className="text-xl font-bold text-white">
                {Object.values(dDev.entradas || {}).filter(Boolean).length} / 8
              </span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 my-3">
            <div className="p-2.5 rounded-xl glass-cell hologram text-center w-full scale-3d">
              <span className="text-[10px] font-mono text-cyan-400 block">TEMPERATURA</span>
              <span className="text-xl font-bold font-mono text-white">
                {isNaN(tempNum) ? '25.0' : tempNum.toFixed(1)}°C
              </span>
            </div>
            <div className="p-2.5 rounded-xl glass-cell hologram text-center w-full scale-3d">
              <span className="text-[10px] font-mono text-pink-400 block">PRESIÓN</span>
              <span className="text-xl font-bold font-mono text-white">
                {isNaN(presNum) ? '0.00' : presNum.toFixed(2)}b
              </span>
            </div>
          </div>
        )}

        <div className={`flex items-center justify-between gap-2 mb-3 px-3 py-2 rounded-xl border ${faseTone}`}>
          <span className="flex items-center gap-2 min-w-0">
            <span className="relative flex w-2.5 h-2.5 shrink-0">
              {faseActiva && <span className="absolute inset-0 rounded-full bg-current opacity-60 animate-ping" />}
              <span className="relative w-2.5 h-2.5 rounded-full bg-current" />
            </span>
            <span className="text-[10px] font-mono uppercase tracking-wider opacity-70">Fase</span>
            <span className="text-xs font-bold font-mono truncate">{fase}</span>
          </span>
          {segRest > 0 && (
            <span className="text-[11px] font-mono font-bold tabular-nums shrink-0">
              {Math.floor(segRest / 60)}:{String(segRest % 60).padStart(2, '0')}
            </span>
          )}
        </div>
      </div>

      <div className="fleet-device-cta pt-3 border-t border-white/10 flex items-center justify-between text-xs font-mono text-cyan-400 font-bold w-full rounded-b-xl">
        <span>ENTRAR A CABINA DE CONTROL</span>
        <ChevronRight className="w-4 h-4" />
      </div>
    </div>
  );
});

export default FleetDeviceCard;
