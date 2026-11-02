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
  MoveRight,
  Snowflake
} from 'lucide-react';
import { readMotionPrefs, saveMotionPrefs } from '../../services/motionPrefs';
import { readXmasPrefs, saveXmasPrefs } from './SnowfallLayer';
import { supabase } from '../../services/supabase';

export const WALLPAPERS_LIST = [
  // ── Sólidos minimalistas ──
  { id: 'solid', name: '🖤 Oscuro Geométrico — con Ónix', url: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=2000&q=80' },
  { id: 'navy-solid', name: '🔷 Navy Profundo Sólido — con Aurum', color: '#081020' },
  { id: 'carbon-solid', name: '⚫ Carbón Puro Sólido — con Platino', color: '#07080b' },
  { id: 'forest-solid', name: '❄️ Aurora Boreal — con Stealth', url: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?auto=format&fit=crop&w=2000&q=80' },
  { id: 'wine-solid', name: '� Nebulosa Cósmica — con Obsidiana', url: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=2000&q=80' },
  // ── Auroras minimalistas (gradiente, sin foto) ──
  { id: 'aurum-gradient', name: '✨ Aurora Dorada — con Aurum', gradient: 'radial-gradient(ellipse at 50% -10%, rgba(245,194,74,0.18) 0%, transparent 55%), linear-gradient(180deg, #081020 0%, #04070f 100%)' },
  { id: 'ice-gradient', name: '❄️ Aurora Ártica — con Stealth', gradient: 'radial-gradient(ellipse at 50% -10%, rgba(103,232,249,0.14) 0%, transparent 55%), linear-gradient(180deg, #0a1220 0%, #04070f 100%)' },
  { id: 'violet-gradient', name: '🌌 Aurora Violeta — con Neon', gradient: 'radial-gradient(ellipse at 50% -10%, rgba(167,139,250,0.16) 0%, transparent 55%), linear-gradient(180deg, #0a0c1a 0%, #04060f 100%)' },
  { id: 'mint-gradient', name: '💓 Monitor de Signos Vitales — con Bio-Teal', url: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=2000&q=80' },
  { id: 'champagne-gradient', name: '🔮 Render 3D Abstracto — con Platino-Oro', url: 'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?auto=format&fit=crop&w=2000&q=80' },
  { id: 'oled', name: '⚫ Negro OLED Cósmico — bajo consumo', gradient: 'radial-gradient(circle at 50% -5%, rgba(139,92,246,0.25) 0%, transparent 55%), radial-gradient(circle at 100% 100%, rgba(0,243,255,0.18) 0%, transparent 50%)', color: '#030712' },
  // ── Fotos industriales / hospitalarias / hardware ──
  { id: 'server-datacenter', name: '� Quirófano Moderno — con Industrial', url: 'https://images.unsplash.com/photo-1538108149393-fbbd81895907?auto=format&fit=crop&w=2000&q=80' },
  { id: 'hospital-corridor', name: '🏥 Corredor Hospitalario — con Bio-Teal', url: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=2000&q=80' },
  { id: 'medical-lab', name: '🧪 Laboratorio Clínico — con Platino', url: 'https://images.unsplash.com/photo-1582719471384-894fbb16e074?auto=format&fit=crop&w=2000&q=80' },
  { id: 'circuit-pcb', name: '⚡ Microchip & Pistas PCB — con Neon', url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=2000&q=80' },
  { id: 'motherboard-gold', name: '🎨 Gradiente Premium — con Aurum', url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=2000&q=80' },
  { id: 'chip-macro', name: '🔬 Chip Macro Acero — con Platino', url: 'https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?auto=format&fit=crop&w=2000&q=80' },
  { id: 'server-racks', name: '🗄️ Racks de Servidor — con Stealth', url: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=2000&q=80' },
  { id: 'planet-nodes', name: '🌐 Red Global de Nodos — con Aurum', url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=2000&q=80' },
  { id: 'cyber-matrix', name: '⬡ Malla Hexagonal Matrix — con Neon', url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=2000&q=80' },
  { id: 'quantum-connections', name: '💠 Conexiones Cuánticas & Fibra — con Neon', url: 'https://images.unsplash.com/photo-1504639725590-34d0984388bd?auto=format&fit=crop&w=2000&q=80' },
  // ── Ciudad-circuito: aéreas nocturnas tipo PCB ──
  { id: 'circuit-city', name: '🌃 Ciudad-Circuito Aérea — con Industrial', url: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=2000&q=80' },
  { id: 'aerial-highways', name: '🛣️ Autopistas de Luz — con Ónix', url: 'https://images.unsplash.com/photo-1514924013411-cbf25faa35bb?auto=format&fit=crop&w=2000&q=80' },
  { id: 'city-lights-grid', name: '✨ Campo Estelar — con Obsidiana', url: 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?auto=format&fit=crop&w=2000&q=80' },
  { id: 'neon-skyline', name: '🏙️ Skyline Nocturno — con Neon', url: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=2000&q=80' },
  { id: 'night-aerial', name: '🌌 Metrópolis Nocturna — con Obsidiana', url: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=2000&q=80' },
  // ── Esterilización & Vehicular ──
  { id: 'sterilization-zone', name: '🧼 Zona de Esterilización — con Bio-Teal', url: 'https://images.unsplash.com/photo-1584036561566-baf8f5f1b144?auto=format&fit=crop&w=2000&q=80' },
  { id: 'lab-sterile', name: '🔬 Laboratorio Estéril — con Platino', url: 'https://images.unsplash.com/photo-1530026405186-ed1f139313f8?auto=format&fit=crop&w=2000&q=80' },
  { id: 'surgical-tools', name: '⚕️ Instrumental Médico — con Industrial', url: 'https://images.unsplash.com/photo-1551601651-2a8555f1a136?auto=format&fit=crop&w=2000&q=80' },
  { id: 'night-drive', name: '🚗 Vehículo Nocturno — con Ónix', url: 'https://images.unsplash.com/photo-1486572788966-cfd3df1f5b42?auto=format&fit=crop&w=2000&q=80' },
  { id: 'garage-engine', name: '🔧 Motor & Taller — con Industrial', url: 'https://images.unsplash.com/photo-1494905998402-395d579af36f?auto=format&fit=crop&w=2000&q=80' },
  { id: 'highway-car', name: '🏎️ Deportivo en Vía — con Neon', url: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=2000&q=80' }
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
  onMotionChange,
  canEditGlobal
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [kioskOn, setKioskOn] = useState(() => localStorage.getItem('biofleet_kiosk') === '1');
  const toggleKiosk = () => {
    const next = !kioskOn;
    setKioskOn(next);
    if (next) localStorage.setItem('biofleet_kiosk', '1');
    else localStorage.removeItem('biofleet_kiosk');
    if (window.biofleetHub?.isHub) {
      window.dispatchEvent(new Event('biofleet-kiosk'));
    } else if (next && !document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else if (!next && document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  };
  const [localMotion, setLocalMotion] = useState(readMotionPrefs);
  const [xmas, setXmas] = useState(readXmasPrefs);
  const motion = motionPrefs || localMotion;
  const updateMotion = onMotionChange || ((patch) => setLocalMotion((m) => saveMotionPrefs({ ...m, ...patch })));
  // Superadmin: guarda el switch GLOBAL (toda la web). Usuario normal:
  // su toggle es un opt-out local solamente.
  const updateXmas = (patch) => {
    setXmas((p) => {
      const next = saveXmasPrefs({ ...p, ...patch }, { localOnly: !canEditGlobal });
      if (canEditGlobal) {
        supabase.rpc('save_global_xmas', { p_xmas: next }).then(({ error }) => {
          if (error) console.warn('[XMAS] No se pudo guardar el switch global:', error.message);
        });
      }
      return next;
    });
  };

  // Reloj Año Nuevo — superadmin lo enciende para TODA la web; usuario
  // normal hace opt-out local. El estado se refleja vía evento global.
  const [nyeOn, setNyeOnState] = useState(false);
  useEffect(() => {
    const sync = () => setNyeOnState(document.documentElement.dataset.nyeOn === '1');
    sync();
    const onEvt = () => sync();
    window.addEventListener('bf:nye', onEvt);
    return () => window.removeEventListener('bf:nye', onEvt);
  }, []);
  const updateNye = (on) => {
    setNyeOnState(on);
    document.documentElement.dataset.nyeOn = on ? '1' : '0';
    window.dispatchEvent(new CustomEvent('bf:nye'));
    if (canEditGlobal) {
      supabase.rpc('save_global_countdown', { p: { on } }).then(({ error }) => {
        if (error) console.warn('[NYE] No se pudo guardar el switch global:', error.message);
      });
    }
  };

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
                  { id: 'onyx', label: '� Ónix', desc: 'Negro + Oro' },
                  { id: 'obsidian', label: '🌑 Obsidiana', desc: 'Negro + Plata' },
                  { id: 'day', label: '☀️ Día', desc: 'Claro + Azul Acero' },
                  { id: 'pearl', label: '🏆 Perla', desc: 'Claro + Láser Dorado' },
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

            {/* 3b. Modo Navidad — nieve + luces festivas */}
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-3">
              <div className="flex justify-between items-center text-xs gear-accent-text">
                <span className="flex items-center gap-1.5">
                  <Snowflake className="w-3.5 h-3.5" />
                  <span>Modo Navidad{canEditGlobal ? ' (Global)' : ''}</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={xmas.on}
                  aria-label={xmas.on ? 'Desactivar Modo Navidad' : 'Activar Modo Navidad'}
                  onClick={() => updateXmas({ on: !xmas.on })}
                  className={`gear-switch ${xmas.on ? 'gear-switch--on' : ''}`}
                >
                  <span />
                </button>
              </div>
              <div className={`space-y-1.5 transition-opacity ${xmas.on ? '' : 'opacity-50'}`}>
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>Nieve cayendo</span>
                  <span className="font-bold">{xmas.flakes} copos</span>
                </div>
                <input
                  type="range" min={10} max={400} step={10}
                  value={xmas.flakes}
                  disabled={!xmas.on}
                  onChange={(e) => updateXmas({ flakes: Number(e.target.value) })}
                  className="gear-slider w-full h-1.5 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed"
                  aria-label="Cantidad de copos de nieve"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>Velocidad de caída</span>
                  <span className="font-bold">{xmas.speed}%</span>
                </div>
                <input
                  type="range" min={10} max={300} step={5}
                  value={xmas.speed}
                  disabled={!xmas.on}
                  onChange={(e) => updateXmas({ speed: Number(e.target.value) })}
                  className="gear-slider w-full h-1.5 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed"
                  aria-label="Velocidad de la nieve"
                />
                <div className="flex justify-between items-center text-xs gear-accent-text pt-1">
                  <span>Luces y láser candy-cane</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={xmas.lights}
                    disabled={!xmas.on}
                    aria-label="Alternar luces navideñas"
                    onClick={() => updateXmas({ lights: !xmas.lights })}
                    className={`gear-switch ${xmas.lights ? 'gear-switch--on' : ''}`}
                  >
                    <span />
                  </button>
                </div>
                {[
                  { key: 'garland', label: 'Guirnalda de bombillas' }
                ].map(({ key, label }) => (
                  <div key={key} className="flex justify-between items-center text-xs gear-accent-text">
                    <span>{label}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={xmas[key]}
                      disabled={!xmas.on}
                      aria-label={`Alternar ${label}`}
                      onClick={() => updateXmas({ [key]: !xmas[key] })}
                      className={`gear-switch ${xmas[key] ? 'gear-switch--on' : ''}`}
                    >
                      <span />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* 3c. Reloj cuenta regresiva de fin de año — global */}
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              <div className="flex justify-between items-center text-xs gear-accent-text">
                <span className="flex items-center gap-1.5">
                  <Snowflake className="w-3.5 h-3.5" />
                  <span>Reloj Año Nuevo{canEditGlobal ? ' (Global)' : ''}</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={nyeOn}
                  aria-label={nyeOn ? 'Desactivar reloj de año nuevo' : 'Activar reloj de año nuevo'}
                  onClick={() => updateNye(!nyeOn)}
                  className={`gear-switch ${nyeOn ? 'gear-switch--on' : ''}`}
                >
                  <span />
                </button>
              </div>
            </div>

            {/* 3d. Modo kiosko — pantalla completa, oculta la barra de tareas */}
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              <div className="flex justify-between items-center text-xs gear-accent-text">
                <span className="flex items-center gap-1.5">
                  <Maximize className="w-3.5 h-3.5" />
                  <span>Modo Kiosko (pantalla completa)</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={kioskOn}
                  aria-label={kioskOn ? 'Desactivar modo kiosko' : 'Activar modo kiosko'}
                  onClick={toggleKiosk}
                  className={`gear-switch ${kioskOn ? 'gear-switch--on' : ''}`}
                >
                  <span />
                </button>
              </div>
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
