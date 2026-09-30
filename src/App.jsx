import React, { useState } from 'react';
import { Activity, ShieldCheck, Cpu, Waves } from 'lucide-react';

export default function App() {
  const [opacity, setOpacity] = useState(85);

  return (
    <div className="min-h-screen bg-[#0a0a14] text-slate-100 flex flex-col">
      {/* Header con rayita láser animada Speedtest */}
      <header className="speedtest-laser-header border-b border-cyan-500/20 bg-slate-950/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-emerald-400">
              SCADA BIOMÉDICO FLEET v2.0
            </h1>
            <p className="text-xs text-slate-400 font-mono">ENTERPRISE CORE • RUTA B</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            Vite React Activo
          </span>
        </div>
      </header>

      {/* Contenido principal con tarjeta Ultra-Glass interactiva */}
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full flex flex-col items-center justify-center gap-6">
        <div 
          className="ultra-glass p-8 rounded-2xl shadow-2xl max-w-xl w-full border border-cyan-500/30 transition-all duration-300"
          style={{ '--glass-opacity': `${opacity / 100}` }}
        >
          <div className="flex items-center gap-3 mb-4 text-cyan-400">
            <Cpu className="w-8 h-8" />
            <h2 className="text-xl font-bold text-white">Núcleo Vite 2.0 Operativo</h2>
          </div>
          
          <p className="text-slate-300 text-sm leading-relaxed mb-6">
            La arquitectura modular de la Ruta B ha sido inicializada exitosamente. La sesión blindada de Supabase, las curvas térmicas y el cálculo F0 están listos para integrarse.
          </p>

          {/* Slider de prueba para el efecto Ultra-Glass */}
          <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-2">
            <div className="flex justify-between text-xs font-mono text-cyan-300">
              <span className="flex items-center gap-1"><Waves className="w-3.5 h-3.5" /> Opacidad Ultra-Glass:</span>
              <span className="font-bold">{opacity}%</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={opacity} 
              onChange={(e) => setOpacity(e.target.value)} 
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
