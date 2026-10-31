import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Activity,
  Settings, 
  Maximize, 
  Minimize,
  RefreshCw, 
  LogOut, 
  Waves, 
  Palette, 
  Image as ImageIcon,
  X,
  Unlock,
  CheckCircle2,
  HardDrive,
  Zap,
  Orbit,
  MoveRight
} from 'lucide-react';
import { readMotionPrefs, saveMotionPrefs } from '../../services/motionPrefs';

export const WALLPAPERS_LIST = [
  // ── Sólidos minimalistas ──
  { id: 'solid', name: '⬜ Gris Industrial Sólido — con Industrial', color: '#1b1e23' },
  { id: 'navy-solid', name: '🔷 Navy Profundo Sólido — con Aurum', color: '#081020' },
  { id: 'carbon-solid', name: '⚫ Carbón Puro Sólido — con Platino', color: '#07080b' },
  { id: 'forest-solid', name: '🌿 Bosque Profundo Sólido — con Bio-Teal', color: '#08110e' },
  { id: 'wine-solid', name: '🍷 Vino Oscuro Sólido — con Carmesí', color: '#120a0c' },
  // ── Auroras minimalistas (gradiente, sin foto) ──
  { id: 'aurum-gradient', name: '✨ Aurora Dorada — con Aurum', gradient: 'radial-gradient(ellipse at 50% -10%, rgba(245,194,74,0.18) 0%, transparent 55%), linear-gradient(180deg, #081020 0%, #04070f 100%)' },
  { id: 'ice-gradient', name: '❄️ Aurora Ártica — con Stealth', gradient: 'radial-gradient(ellipse at 50% -10%, rgba(103,232,249,0.14) 0%, transparent 55%), linear-gradient(180deg, #0a1220 0%, #04070f 100%)' },
  { id: 'violet-gradient', name: '🌌 Aurora Violeta — con Neon', gradient: 'radial-gradient(ellipse at 50% -10%, rgba(167,139,250,0.16) 0%, transparent 55%), linear-gradient(180deg, #0a0c1a 0%, #04060f 100%)' },
  { id: 'mint-gradient', name: '🍃 Aurora Menta — con Bio-Teal', gradient: 'radial-gradient(ellipse at 50% -10%, rgba(45,212,191,0.14) 0%, transparent 55%), linear-gradient(180deg, #08100f 0%, #040706 100%)' },
  { id: 'champagne-gradient', name: '🥂 Aurora Champán — con Platino-Oro', gradient: 'radial-gradient(ellipse at 50% -10%, rgba(203,213,225,0.10) 0%, transparent 40%), radial-gradient(ellipse at 50% 110%, rgba(245,194,74,0.14) 0%, transparent 50%), linear-gradient(180deg, #0c0e13 0%, #06070b 100%)' },
  { id: 'oled', name: '⚫ Negro OLED Cósmico — bajo consumo', gradient: 'radial-gradient(circle at 50% -5%, rgba(139,92,246,0.25) 0%, transparent 55%), radial-gradient(circle at 100% 100%, rgba(0,243,255,0.18) 0%, transparent 50%)', color: '#030712' },
  // ── Fotos industriales / hospitalarias / hardware ──
  { id: 'server-datacenter', name: '🏢 Datacenter Biomédico — con Industrial', url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=2068&q=80' },
  { id: 'hospital-corridor', name: '🏥 Corredor Hospitalario — con Bio-Teal', url: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=2000&q=80' },
  { id: 'medical-lab', name: '🧪 Laboratorio Clínico — con Platino', url: 'https://images.unsplash.com/photo-1582719471384-894fbb16e074?auto=format&fit=crop&w=2000&q=80' },
  { id: 'circuit-pcb', name: '⚡ Microchip & Pistas PCB — con Neon', url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=2000&q=80' },
  { id: 'motherboard-gold', name: '🔌 Placa Base Dorada — con Platino-Oro', url: 'https://images.unsplash.com/photo-1555680202-c86f0e12f086?auto=format&fit=crop&w=2000&q=80' },
  { id: 'chip-macro', name: '🔬 Chip Macro Acero — con Platino', url: 'https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?auto=format&fit=crop&w=2000&q=80' },
  { id: 'server-racks', name: '🗄️ Racks de Servidor — con Stealth', url: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=2000&q=80' },
  { id: 'planet-nodes', name: '🌐 Red Global de Nodos — con Aurum', url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=2000&q=80' },
  { id: 'cyber-matrix', name: '🏙️ Matriz Cyberpunk — con Neon', url: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=2000&q=80' },
  { id: 'quantum-connections', name: '💠 Conexiones Cuánticas & Fibra — con Neon', url: 'https://images.unsplash.com/photo-1504639725590-34d0984388bd?auto=format&fit=crop&w=2000&q=80' }
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
  onUnlockKiosk,
  onOpenDiagnostics,
  appearanceSyncStatus,
  motionPrefs,
  onMotionChange
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [localMotion, setLocalMotion] = useState(readMotionPrefs);
  const motion = motionPrefs || localMotion;
  const updateMotion = onMotionChange || ((patch) => setLocalMotion((m) => saveMotionPrefs({ ...m, ...patch })));

  // Escuchar cambios de fullscreen nativo
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Cierre con tecla Escape
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = originalOverflow;
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, handleKeyDown]);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      const docEl = document.documentElement;
      if (docEl.requestFullscreen) {
        docEl.requestFullscreen().catch(() => {});
      } else if (docEl.webkitRequestFullscreen) {
        docEl.webkitRequestFullscreen();
      } else if (docEl.msRequestFullscreen) {
        docEl.msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
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
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-900/90 hover:bg-slate-800 border gear-accent-border gear-accent-text transition-all flex items-center justify-center shadow-lg active:scale-95 shrink-0 icon-glow glow-border"
        title="Panel Técnico y Preferencias"
        aria-label="Abrir panel técnico y ajustes"
      >
        <Settings className="w-4 h-4 sm:w-5 sm:h-5 animate-[spin_18s_linear_infinite]" />
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <>
          {/* Fondo Difuminado */}
          <div 
            className="fixed inset-0 z-[99998] bg-black/60 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          {/* Panel Lateral Flotante */}
          <div 
            className="gear-panel fixed right-2 sm:right-6 top-14 sm:top-16 w-[calc(100vw-16px)] sm:w-88 max-w-sm ultra-glass p-4 sm:p-5 rounded-2xl shadow-2xl border-2 z-[99999] backdrop-blur-2xl space-y-3 sm:space-y-4 max-h-[85vh] overflow-y-auto select-none font-mono text-xs"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Panel de configuración técnica y estética"
          >
            <div className="flex justify-between items-center border-b gear-divider pb-2.5">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Settings className="w-4 h-4 gear-accent-text" />
                <span>Panel Técnico y Personalización</span>
              </span>
              <button 
                type="button"
                onClick={() => setIsOpen(false)} 
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
                aria-label="Cerrar panel de ajustes"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Alerta de Desanclaje Kiosk */}
            {kioskMac && (
              <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 space-y-1.5">
                <p className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Terminal Anclada a [{kioskMac.slice(-4)}]</span>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (onUnlockKiosk) onUnlockKiosk();
                    setIsOpen(false);
                  }}
                  className="w-full py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-bold transition-all shadow active:scale-95 text-center"
                >
                  Desanclar y Ver Flota Completa
                </button>
              </div>
            )}

            {/* 1. Selector de Tema de Color */}
            <div>
              <label className="text-[11px] gear-accent-text font-bold block mb-1.5 flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5" />
                <span>PALETA DE COLORES CLÍNICA:</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {[
                  { id: 'industrial', label: '🏭 Industrial', desc: 'Azul Acero' },
                  { id: 'aurum', label: '👑 Aurum', desc: 'Marino + Oro' },
                  { id: 'gold', label: '⚪ Platino', desc: 'Plata & Acero' },
                  { id: 'tactical', label: '🛡️ Stealth', desc: 'Cian Ártico' },
                  { id: 'cyber', label: '� Neon', desc: 'Violeta Neón' },
                  { id: 'platinum', label: '⚜️ Platino-Oro', desc: 'Plata + Dorado' },
                  { id: 'hybrid', label: '🍃 Bio-Mint', desc: 'Menta Neón' }
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTheme(t.id)}
                    className={`py-1.5 sm:py-2 px-1.5 rounded-xl text-xs text-center border transition-all ${
                      currentTheme === t.id
                        ? 'gear-theme-active'
                        : 'bg-slate-900/60 border-slate-700/60 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <div className="font-bold text-[11px]">{t.label}</div>
                    <span className="text-[8px] text-slate-400 block mt-0.5">{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Selector de Papel Tapiz */}
            <div>
              <label className="text-[11px] gear-accent-text font-bold block mb-1 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" />
                <span>FONDO DE PANTALLA INDUSTRIAL:</span>
              </label>
              <select
                value={currentBg}
                onChange={(e) => setBg(e.target.value)}
                className="gear-select w-full bg-slate-900/80 border border-slate-700/80 text-xs text-white rounded-lg p-2.5 focus:outline-none font-mono"
              >
                {WALLPAPERS_LIST.map((bg) => (
                  <option key={bg.id} value={bg.id}>
                    {bg.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Controles de Ajuste — transparencia + movimiento, toggle + slider cada uno */}
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-3">
              {[
                {
                  key: 'glassOn', speedKey: 'opacity', icon: Waves, label: 'Transparencia',
                  hint: 'Cristal glass en paneles', suffix: '%', min: 0, max: 100, step: 1
                },
                {
                  key: 'animOn', speedKey: 'animSpeed', icon: Zap, label: 'Efectos & Animaciones',
                  hint: 'Glows, pulsos y efectos visuales', suffix: '%'
                },
                {
                  key: 'laserOn', speedKey: 'laserSpeed', icon: Orbit, label: 'Láseres en Movimiento',
                  hint: 'Aurora del header y del nav', suffix: '%', max: 600
                },
                {
                  key: 'transOn', speedKey: 'transSpeed', icon: MoveRight, label: 'Transiciones de Sección',
                  hint: 'Cambio animado entre apartados', suffix: '%'
                }
              ].map(({ key, speedKey, icon: Icon, label, hint, suffix, min = 10, max = 300, step = 5 }) => {
                const on = motion[key] !== false;
                const isOpacity = speedKey === 'opacity';
                const speed = isOpacity ? opacity : (motion[speedKey] || 100);
                return (
                  <div key={key} className={`space-y-1.5 transition-opacity ${on ? '' : 'opacity-50'}`}>
                    <div className="flex justify-between items-center text-xs gear-accent-text">
                      <span className="flex items-center gap-1.5">
                        <Icon className="w-3.5 h-3.5" />
                        <span>{label}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-bold font-mono text-[10px]">{speed}{suffix}</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          aria-label={`${on ? 'Desactivar' : 'Activar'} ${label}`}
                          onClick={() => updateMotion({ [key]: !on })}
                          className={`gear-switch ${on ? 'gear-switch--on' : ''}`}
                        >
                          <span />
                        </button>
                      </span>
                    </div>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={Math.min(speed, max)}
                      disabled={!on}
                      onChange={(e) => (isOpacity ? setOpacity(Number(e.target.value)) : updateMotion({ [speedKey]: Number(e.target.value) }))}
                      className="gear-slider w-full h-1.5 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed"
                      aria-label={`Nivel de ${label}`}
                      aria-valuemin={min}
                      aria-valuemax={max}
                      aria-valuenow={speed}
                    />
                  </div>
                );
              })}
            </div>

            {/* Estado de sincronización en la nube */}
            {appearanceSyncStatus && (
              <div className="px-1 py-0.5 text-[10px] text-slate-400 flex items-center gap-1.5" role="status">
                <span className={`w-1.5 h-1.5 rounded-full ${
                  appearanceSyncStatus === 'synced' ? 'bg-emerald-400' :
                  appearanceSyncStatus === 'saving' ? 'bg-amber-400 animate-pulse' :
                  'bg-slate-500'
                }`} />
                <span>
                  {appearanceSyncStatus === 'synced' ? 'Preferencias sincronizadas con la nube' :
                   appearanceSyncStatus === 'saving' ? 'Guardando ajustes en Supabase...' :
                   appearanceSyncStatus === 'loading' ? 'Cargando perfil...' :
                   'Guardado localmente en esta terminal'}
                </span>
              </div>
            )}

            {/* 4. Acciones del Sistema */}
            <div className="pt-2 border-t border-slate-800 space-y-1.5">
              {onOpenDiagnostics && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onOpenDiagnostics();
                  }}
                  className="gear-action w-full py-1.5 px-3 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg text-xs flex items-center gap-2 border border-slate-800 transition-colors"
                >
                  <Activity className="w-3.5 h-3.5 gear-accent-text" />
                  <span>Diagnóstico de Red & Base de Datos</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleForceSync}
                className="gear-action w-full py-1.5 px-3 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg text-xs flex items-center gap-2 border border-slate-800 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5 gear-accent-text" />
                <span>Forzar Recarga & Sincronización</span>
              </button>

              <button
                type="button"
                onClick={toggleFullScreen}
                className="gear-action w-full py-1.5 px-3 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg text-xs flex items-center gap-2 border border-slate-800 transition-colors"
              >
                {isFullscreen ? <Minimize className="w-3.5 h-3.5 gear-accent-text" /> : <Maximize className="w-3.5 h-3.5 gear-accent-text" />}
                <span>{isFullscreen ? 'Salir de Pantalla Completa' : 'Modo Pantalla Completa'}</span>
              </button>

              <button
                type="button"
                onClick={() => { setIsOpen(false); onLogout(); }}
                className="gear-danger w-full py-2 px-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-xs flex items-center gap-2 border border-rose-500/30 mt-1.5 transition-colors font-bold"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Cerrar Sesión Activa</span>
              </button>
            </div>

            {/* Versión del despliegue actual — ayuda a verificar que la app
                se auto-actualizó tras un push a GitHub/Vercel */}
            <div className="pt-1.5 text-center text-[9px] font-mono text-slate-600">
              BIOFLEET OS v{__APP_VERSION__} · build {__COMMIT_SHA__}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
