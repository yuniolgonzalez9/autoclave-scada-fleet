import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Maximize, 
  RefreshCw, 
  LogOut, 
  Waves, 
  Palette, 
  Image as ImageIcon,
  Key,
  X
} from 'lucide-react';

export const WALLPAPERS_LIST = [
  { id: 'circuit-pcb', name: '⚡ Microchip & Pistas PCB Neón (Favorito)', url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=2000&q=80' },
  { id: 'planet-nodes', name: '🌐 Red Global de Nodos & Planeta', url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=2000&q=80' },
  { id: 'cyber-matrix', name: '🏙️ Matriz Cyberpunk de Servidores', url: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=2000&q=80' },
  { id: 'motherboard-gold', name: '🔌 Placa Base & Hardware Eléctrico', url: 'https://images.unsplash.com/photo-1555680202-c86f0e12f086?auto=format&fit=crop&w=2000&q=80' },
  { id: 'quantum-connections', name: '💠 Conexiones Cuánticas & Fibra', url: 'https://images.unsplash.com/photo-1504639725590-34d0984388bd?auto=format&fit=crop&w=2000&q=80' },
  { id: 'server-datacenter', name: '🏢 Datacenter Hospitalario', url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=2068&q=80' },
  { id: 'oled', name: '⚫ Negro OLED Cósmico', url: '' },
  { id: 'clean', name: '⚪ Blanco Quirúrgico Blueprint', url: '' }
];

export default function GearMenu({ 
  currentTheme, 
  setTheme, 
  currentBg, 
  setBg, 
  opacity, 
  setOpacity, 
  onLogout 
}) {
  const [isOpen, setIsOpen] = useState(false);

  // Alternar Pantalla Completa
  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  };

  // Forzar Sincronización
  const handleForceSync = () => {
    window.location.reload();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-cyan-500/40 text-cyan-300 transition-all flex items-center justify-center shadow-lg"
        title="Panel Técnico y Ajustes"
      >
        <Settings className="w-5 h-5 animate-[spin_12s_linear_infinite]" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-12 w-80 md:w-88 ultra-glass p-5 rounded-2xl shadow-2xl border border-cyan-500/40 z-50 backdrop-blur-2xl space-y-4">
          <div className="flex justify-between items-center border-b border-cyan-500/20 pb-3">
            <span className="text-xs font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
              <Settings className="w-4 h-4 text-cyan-400" />
              Panel de Control Técnico
            </span>
            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white p-1">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 1. SELECTOR DE TEMAS */}
          <div>
            <label className="text-[11px] font-mono text-cyan-400 font-bold block mb-2 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5" />
              TEMA VISUAL OFICIAL:
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: 'tactical', label: '🛡️ Pizarra', desc: 'Slate' },
                { id: 'cyber', label: '🌙 Cyber', desc: 'Fucsia/Cian' },
                { id: 'hybrid', label: '⚡ Híbrido', desc: 'Esmeralda' },
                { id: 'clinical', label: '🏥 Clínico', desc: 'Blueprint' }
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`py-2 px-2.5 rounded-lg text-xs font-mono text-left border transition-all ${
                    currentTheme === t.id
                      ? 'bg-cyan-500/20 border-cyan-400 text-white font-bold shadow-[0_0_10px_rgba(0,243,255,0.3)]'
                      : 'bg-slate-900/60 border-slate-700/60 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <div>{t.label}</div>
                  <span className="text-[9px] text-slate-400">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. SELECTOR DE FONDOS (8 WALLPAPERS) */}
          <div>
            <label className="text-[11px] font-mono text-cyan-400 font-bold block mb-1.5 flex items-center gap-1.5">
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

          {/* 3. TRANSPARENCIA ULTRA-GLASS */}
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-1.5">
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

          {/* 4. ACCIONES DEL SISTEMA */}
          <div className="pt-2 border-t border-slate-800 space-y-1.5">
            <button
              onClick={handleForceSync}
              className="w-full py-2 px-3 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg text-xs font-mono flex items-center gap-2 border border-slate-800 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
              <span>Forzar Sincronización Nube</span>
            </button>

            <button
              onClick={toggleFullScreen}
              className="w-full py-2 px-3 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg text-xs font-mono flex items-center gap-2 border border-slate-800 transition-colors"
            >
              <Maximize className="w-3.5 h-3.5 text-cyan-400" />
              <span>Alternar Pantalla Completa</span>
            </button>

            <button
              onClick={onLogout}
              className="w-full py-2 px-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-xs font-mono flex items-center gap-2 border border-rose-500/30 transition-colors mt-2"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cerrar Sesión Segura</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
