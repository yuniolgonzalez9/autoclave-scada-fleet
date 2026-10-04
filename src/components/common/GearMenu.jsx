import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  Settings, 
  Maximize, 
  RefreshCw, 
  LogOut, 
  Waves, 
  Palette, 
  Image as ImageIcon,
  X,
  Unlock
} from 'lucide-react';

export const WALLPAPERS_LIST = [
  { id: 'circuit-pcb', name: '⚡ Microchip & Pistas PCB Neón (Favorito)', url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=2000&q=80' },
  { id: 'planet-nodes', name: '🌐 Red Global de Nodos & Planeta', url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=2000&q=80' },
  { id: 'cyber-matrix', name: '🏙️ Matriz Cyberpunk de Servidores', url: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=2000&q=80' },
  { id: 'motherboard-gold', name: '🔌 Placa Base & Hardware Eléctrico', url: 'https://images.unsplash.com/photo-1555680202-c86f0e12f086?auto=format&fit=crop&w=2000&q=80' },
  { id: 'quantum-connections', name: '💠 Conexiones Cuánticas & Fibra', url: 'https://images.unsplash.com/photo-1504639725590-34d0984388bd?auto=format&fit=crop&w=2000&q=80' },
  { id: 'server-datacenter', name: '🏢 Datacenter Hospitalario', url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=2068&q=80' },
  { id: 'oled', name: '⚫ Negro OLED Cósmico', url: '' }
];

export default function GearMenu({ 
  currentTheme, 
  setTheme, 
  currentBg, 
  setBg, 
  opacity, 
  setOpacity, 
  onLogout,
  kioskMac,
  onUnlockKiosk
}) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  };

  const handleForceSync = () => {
    window.location.reload();
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 sm:p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-cyan-500/40 text-cyan-300 transition-all flex items-center justify-center shadow-lg active:scale-95 shrink-0"
        title="Panel Técnico y Ajustes"
      >
        <Settings className="w-4 h-4 sm:w-5 sm:h-5 animate-[spin_14s_linear_infinite]" />
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <>
          <div 
            className="fixed inset-0 z-[99998] bg-black/60 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          <div className="fixed right-2 sm:right-6 top-14 sm:top-16 w-[calc(100vw-16px)] sm:w-88 max-w-sm ultra-glass p-4 sm:p-5 rounded-2xl shadow-2xl border-2 border-cyan-500/50 z-[99999] backdrop-blur-2xl space-y-3 sm:space-y-4 max-h-[85vh] overflow-y-auto">
            
            <div className="flex justify-between items-center border-b border-cyan-500/20 pb-2.5">
              <span className="text-xs font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                <Settings className="w-4 h-4 text-cyan-400" />
                Panel de Control Técnico
              </span>
              <button 
                type="button"
                onClick={() => setIsOpen(false)} 
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* BOTÓN DE RESCATE SI ESTÁ EN MODO KIOSCO */}
            {kioskMac && (
              <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 space-y-1.5">
                <p className="text-[11px] font-mono font-bold text-amber-300 flex items-center gap-1.5">
                  <Unlock className="w-3.5 h-3.5" />
                  Terminal Anclada a [{kioskMac.slice(-4)}]
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onUnlockKiosk();
                    setIsOpen(false);
                  }}
                  className="w-full py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-mono font-bold transition-all shadow-md"
                >
                  Desanclar y Ver Toda la Flota
                </button>
              </div>
            )}

            {/* 1. Selector de Temas */}
            <div>
              <label className="text-[11px] font-mono text-cyan-400 font-bold block mb-1.5 flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5" />
                TEMA VISUAL OFICIAL:
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'tactical', label: '🛡️ Pizarra', desc: 'Cian' },
                  { id: 'cyber', label: '🌙 Cyber', desc: 'Fucsia' },
                  { id: 'hybrid', label: '⚡ Híbrido', desc: 'Esmeralda' }
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTheme(t.id)}
                    className={`py-1.5 sm:py-2 px-1.5 rounded-xl text-xs font-mono text-center border transition-all ${
                      currentTheme === t.id
                        ? 'bg-cyan-500/20 border-cyan-400 text-white font-bold shadow-[0_0_12px_rgba(0,243,255,0.35)]'
                        : 'bg-slate-900/60 border-slate-700/60 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <div className="font-bold text-[11px]">{t.label}</div>
                    <span className="text-[8px] text-slate-400 block mt-0.5">{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Selector de Fondos */}
            <div>
              <label className="text-[11px] font-mono text-cyan-400 font-bold block mb-1 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" />
                PAPEL TAPIZ (CIRCUITOS & HD):
              </label>
              <select
                value={currentBg}
                onChange={(e) => setBg(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded-lg p-2 font-mono focus:outline-none focus:border-cyan-400"
              >
                {WALLPAPERS_LIST.map((bg) => (
                  <option key={bg.id} value={bg.id}>
                    {bg.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Transparencia Ultra-Glass */}
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="flex justify-between text-xs font-mono text-cyan-300">
                <span className="flex items-center gap-1"><Waves className="w-3.5 h-3.5" /> Transparencia Ultra-Glass:</span>
                <span className="font-bold">{opacity}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={opacity} 
                onChange={(e) => setOpacity(Number(e.target.value))} 
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
            </div>

            {/* 4. Acciones */}
            <div className="pt-2 border-t border-slate-800 space-y-1.5">
              <button
                type="button"
                onClick={handleForceSync}
                className="w-full py-1.5 px-3 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg text-xs font-mono flex items-center gap-2 border border-slate-800"
              >
                <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                <span>Forzar Sincronización Nube</span>
              </button>

              <button
                type="button"
                onClick={toggleFullScreen}
                className="w-full py-1.5 px-3 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg text-xs font-mono flex items-center gap-2 border border-slate-800"
              >
                <Maximize className="w-3.5 h-3.5 text-cyan-400" />
                <span>Pantalla Completa</span>
              </button>

              <button
                type="button"
                onClick={() => { setIsOpen(false); onLogout(); }}
                className="w-full py-2 px-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-xs font-mono flex items-center gap-2 border border-rose-500/30 mt-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Cerrar Sesión</span>
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
