import React, { useState, useEffect } from 'react';
import SterilizationChart from '../graphics/SterilizationChart';
import SurgicalQRLabel from '../labels/SurgicalQRLabel';
import { supabase } from '../../services/supabase';
import { 
  Activity, 
  Thermometer, 
  Gauge, 
  Zap, 
  Play, 
  Square, 
  RotateCcw, 
  Sliders, 
  Building2, 
  History, 
  Wrench, 
  QrCode, 
  CheckCircle2, 
  AlertTriangle,
  FileSpreadsheet,
  Printer,
  ChevronLeft,
  Flame,
  Volume2,
  VolumeX,
  ShieldCheck,
  Send,
  Sparkles
} from 'lucide-react';

export default function DeviceDetailView({ device, onBack, sendCommand, operatorName }) {
  const [activeTab, setActiveTab] = useState('sensores'); // 'sensores' | 'nvs' | 'ficha' | 'historial' | 'mantenimiento'
  const [showQRModal, setShowQRModal] = useState(false);
  const [nvsMsg, setNvsMsg] = useState('');

  const d = device?.datos || {};
  const cfg = d?.cfg || {};

  // =========================================================================
  // PARÁMETROS NVS DEL HARDWARE Y DEL CICLO (LEÍDOS DESDE EL ESP32)
  // =========================================================================
  const [spTemp, setSpTemp] = useState(cfg.sp_temp ?? 121.0);
  const [tCiclo, setTCiclo] = useState(cfg.t_ciclo ?? 2);
  const [hab, setHab] = useState(cfg.hab ?? true);
  const [motOk, setMotOk] = useState(cfg.mot_ok ?? false);
  const [vacioOk, setVacioOk] = useState(cfg.vacio_ok ?? true);
  const [purgaOk, setPurgaOk] = useState(cfg.purga_ok ?? true);
  const [pMax, setPMax] = useState(cfg.p_max ?? 2.60);
  const [limMant, setLimMant] = useState(cfg.lim_mant ?? 200);
  const [sndOk, setSndOk] = useState(cfg.snd_ok ?? true);

  // Sincronizar automáticamente cuando el ESP32 envíe nueva configuración
  useEffect(() => {
    if (cfg.sp_temp !== undefined) setSpTemp(cfg.sp_temp);
    if (cfg.t_ciclo !== undefined) setTCiclo(cfg.t_ciclo);
    if (cfg.hab !== undefined) setHab(cfg.hab);
    if (cfg.mot_ok !== undefined) setMotOk(cfg.mot_ok);
    if (cfg.vacio_ok !== undefined) setVacioOk(cfg.vacio_ok);
    if (cfg.purga_ok !== undefined) setPurgaOk(cfg.purga_ok);
    if (cfg.p_max !== undefined) setPMax(cfg.p_max);
    if (cfg.lim_mant !== undefined) setLimMant(cfg.lim_mant);
    if (cfg.snd_ok !== undefined) setSndOk(cfg.snd_ok);
  }, [cfg.sp_temp, cfg.t_ciclo, cfg.hab, cfg.mot_ok, cfg.vacio_ok, cfg.purga_ok, cfg.p_max, cfg.lim_mant, cfg.snd_ok]);

  // Presets Rápidos Clínicos
  const applyPreset134 = () => {
    setSpTemp(134.0);
    setTCiclo(4);
    setPMax(2.65);
    setPurgaOk(true);
    setHab(true);
  };

  const applyPreset121 = () => {
    setSpTemp(121.0);
    setTCiclo(15);
    setPMax(2.40);
    setPurgaOk(true);
    setHab(true);
  };

  // Transmitir Ajustes a la Memoria Flash NVS del ESP32 por MQTT
  const handleTransmitNVS = (e) => {
    e.preventDefault();
    const payload = {
      sp_temp: Number(spTemp),
      t_ciclo: Number(tCiclo),
      hab: Boolean(hab),
      mot_ok: Boolean(motOk),
      vacio_ok: Boolean(vacioOk),
      purga_ok: Boolean(purgaOk),
      p_max: Number(pMax),
      lim_mant: Number(limMant),
      snd_ok: Boolean(sndOk)
    };

    sendCommand(device.mac, payload);
    setNvsMsg(`⚡ Parámetros transmitidos hacia ${device.mac}. Guardando en memoria Flash NVS...`);
    setTimeout(() => setNvsMsg(''), 4000);
  };

  // Cambio optimista de switch individual en tiempo real
  const handleToggleSwitch = (key, currentVal, setter) => {
    const nextVal = !currentVal;
    setter(nextVal);
    sendCommand(device.mac, { [key]: nextVal });
  };

  // Estados para Ficha de Cliente
  const [alias, setAlias] = useState(device?.meta?.alias || `AUTOCLAVE [${device.mac.slice(-4)}]`);
  const [cliente, setCliente] = useState(device?.meta?.cliente || 'Hospital Metropolitano');
  const [modelo, setModelo] = useState(device?.meta?.modelo || 'Quirúrgico Clase B');
  const [guardandoFicha, setGuardandoFicha] = useState(false);

  // Estados para Programar Mantenimiento
  const [maintFecha, setMaintFecha] = useState('');
  const [maintTipo, setMaintTipo] = useState('PREVENTIVO_GENERAL');
  const [maintTecnico, setMaintTecnico] = useState('');
  const [maintNotas, setMaintNotas] = useState('');

  const ciclos = cfg.ciclos || device?.meta?.ciclosCompletados || 0;
  const limite = cfg.lim_mant || device?.meta?.limiteMantenimiento || 200;
  const pctMant = Math.min(100, Math.round((ciclos / limite) * 100));

  const handleGuardarFicha = async (e) => {
    e.preventDefault();
    setGuardandoFicha(true);
    try {
      const metaPayload = {
        mac: device.mac,
        alias,
        cliente,
        modelo,
        updated_at: new Date().toISOString()
      };
      await supabase.from('asignaciones_equipos').upsert(metaPayload, { onConflict: 'mac' });
      sendCommand(device.mac, { cmd: 'SET_META', ...metaPayload });
      alert('Ficha vinculada y guardada en Supabase Cloud');
    } catch (err) {
      alert('Error guardando ficha: ' + err.message);
    } finally {
      setGuardandoFicha(false);
    }
  };

  const handleGuardarMantenimiento = async (e) => {
    e.preventDefault();
    try {
      await supabase.from('mantenimientos_equipos').insert([{
        mac: device.mac,
        tipo_servicio: maintTipo,
        tecnico_responsable: maintTecnico,
        descripcion: `FECHA_OBJETIVO:${maintFecha} | ${maintNotas}`,
        ciclos_al_momento: ciclos,
        created_at: new Date().toISOString()
      }]);
      alert('Mantenimiento programado con éxito en Supabase Cloud');
      setMaintNotas('');
    } catch (err) {
      alert('Error agendando mantenimiento: ' + err.message);
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Cabecera */}
      <div className="ultra-glass p-4 rounded-2xl border border-cyan-500/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white flex items-center gap-1 text-xs font-mono"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Volver a Flota</span>
          </button>
          <div>
            <h2 className="text-lg font-bold text-white tracking-wide">{alias.toUpperCase()}</h2>
            <p className="text-xs text-cyan-300 font-mono">MAC: {device.mac} • {cliente} • Setpoint: {spTemp}°C</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowQRModal(true)}
            className="px-3.5 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-lg"
          >
            <QrCode className="w-4 h-4" />
            <span>Generar Etiqueta QR</span>
          </button>
        </div>
      </div>

      {/* Pestañas de Navegación del Equipo */}
      <div className="flex gap-2 overflow-x-auto pb-1 border-b border-slate-800">
        <button
          onClick={() => setActiveTab('sensores')}
          className={`py-2 px-3.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 whitespace-nowrap transition-all ${
            activeTab === 'sensores' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white bg-slate-900/60'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Sensores & Gráfica</span>
        </button>

        <button
          onClick={() => setActiveTab('nvs')}
          className={`py-2 px-3.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 whitespace-nowrap transition-all ${
            activeTab === 'nvs' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white bg-slate-900/60'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Ajustes NVS & Parámetros</span>
        </button>

        <button
          onClick={() => setActiveTab('ficha')}
          className={`py-2 px-3.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 whitespace-nowrap transition-all ${
            activeTab === 'ficha' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white bg-slate-900/60'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Ficha de Cliente</span>
        </button>

        <button
          onClick={() => setActiveTab('mantenimiento')}
          className={`py-2 px-3.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 whitespace-nowrap transition-all ${
            activeTab === 'mantenimiento' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white bg-slate-900/60'
          }`}
        >
          <Wrench className="w-4 h-4" />
          <span>Mantenimiento & Odómetro</span>
        </button>
      </div>

      {/* PESTAÑA 1: SENSORES, F0 Y GRÁFICA */}
      {activeTab === 'sensores' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="ultra-glass p-3.5 rounded-xl border border-cyan-500/30">
              <span className="text-[10px] font-mono text-cyan-400 block mb-1">TEMPERATURA CÁMARA</span>
              <p className="text-2xl font-bold font-mono text-white">{(d?.temp_camara || 25.0).toFixed(1)} °C</p>
              <span className="text-[10px] text-slate-400 font-mono">Setpoint: {spTemp}°C</span>
            </div>
            <div className="ultra-glass p-3.5 rounded-xl border border-pink-500/30">
              <span className="text-[10px] font-mono text-pink-400 block mb-1">PRESIÓN VAPOR</span>
              <p className="text-2xl font-bold font-mono text-white">{(d?.presion || 0.0).toFixed(2)} bar</p>
              <span className="text-[10px] text-slate-400 font-mono">Límite: {pMax}b</span>
            </div>
            <div className="ultra-glass p-3.5 rounded-xl border border-emerald-500/30">
              <span className="text-[10px] font-mono text-emerald-400 block mb-1">LETALIDAD (F0)</span>
              <p className="text-2xl font-bold font-mono text-emerald-300">{(device.f0Score || 0.0).toFixed(1)} min</p>
              <span className="text-[10px] text-emerald-400/80 font-mono">ISO 17665</span>
            </div>
            <div className="ultra-glass p-3.5 rounded-xl border border-amber-500/30">
              <span className="text-[10px] font-mono text-amber-400 block mb-1">FASE ACTUAL</span>
              <p className="text-lg font-bold font-mono text-white truncate">{d?.fase || 'ESPERA'}</p>
              <span className="text-[10px] text-slate-400 font-mono">Restante: {Math.floor((d?.seg_restantes || 0)/60)}:{(d?.seg_restantes || 0)%60}</span>
            </div>
          </div>

          <div className="flex gap-2.5">
            <button
              onClick={() => sendCommand(device.mac, { cmd: 'INICIAR_CICLO' })}
              className="flex-1 py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Iniciar Ciclo ({spTemp}°C)</span>
            </button>
            <button
              onClick={() => sendCommand(device.mac, { cmd: 'ABORTAR_CICLO' })}
              className="flex-1 py-3 px-4 bg-rose-600 hover:bg-rose-500 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg"
            >
              <Square className="w-4 h-4 fill-white" />
              <span>Paro de Emergencia</span>
            </button>
            <button
              onClick={() => sendCommand(device.mac, { cmd: 'RESET_ALARMA' })}
              className="py-3 px-4 bg-slate-900 border border-slate-700 text-slate-300 rounded-xl text-xs font-mono"
              title="Reset Alarma"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          <div className="ultra-glass p-4 rounded-2xl border border-cyan-500/30">
            <h3 className="text-xs font-bold text-cyan-300 font-mono mb-3">CURVA TÉRMICA EN TIEMPO REAL (ESP32)</h3>
            <SterilizationChart telemetryData={device.history || []} />
          </div>
        </div>
      )}

      {/* PESTAÑA 2: GESTOR COMPLETO NVS & PARÁMETROS DEL CICLO */}
      {activeTab === 'nvs' && (
        <form onSubmit={handleTransmitNVS} className="ultra-glass p-5 md:p-6 rounded-2xl border border-cyan-500/30 space-y-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-cyan-500/20 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                Ajustes de Parámetros del Ciclo & Memoria NVS Flash
              </h3>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                Configuración del protocolo térmico para {cliente || 'el cliente'}. Se guarda directamente en el microcontrolador.
              </p>
            </div>

            {/* Presets Rápidos Clínicos */}
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={applyPreset134}
                className="px-2.5 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 rounded-lg text-xs font-mono font-bold flex items-center gap-1"
                title="Cargar 134°C para Instrumental Quirúrgico"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>134°C Instrumental</span>
              </button>
              <button
                type="button"
                onClick={applyPreset121}
                className="px-2.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 rounded-lg text-xs font-mono font-bold flex items-center gap-1"
                title="Cargar 121°C para Gomas y Plásticos"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>121°C Plásticos</span>
              </button>
            </div>
          </div>

          {nvsMsg && (
            <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{nvsMsg}</span>
            </div>
          )}

          {/* CATEGORÍA 1: PARÁMETROS DEL CICLO */}
          <div>
            <span className="text-xs font-mono text-cyan-400 font-bold block mb-3 uppercase tracking-wider">
              1. Parámetros del Ciclo de Esterilización
            </span>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Setpoint Temp */}
              <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 space-y-1.5">
                <label className="text-[11px] font-mono text-slate-300 block flex justify-between">
                  <span>Temperatura Setpoint (°C)</span>
                  <span className="text-cyan-400 font-bold">{spTemp}°C</span>
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="105.0"
                  max="138.0"
                  value={spTemp}
                  onChange={(e) => setSpTemp(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-cyan-400"
                />
                <span className="text-[9px] text-slate-500 font-mono block">Rango clínico: 105.0°C a 138.0°C</span>
              </div>

              {/* Tiempo de Meseta */}
              <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 space-y-1.5">
                <label className="text-[11px] font-mono text-slate-300 block flex justify-between">
                  <span>Tiempo Meseta (minutos)</span>
                  <span className="text-cyan-400 font-bold">{tCiclo} min</span>
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="60"
                  value={tCiclo}
                  onChange={(e) => setTCiclo(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-cyan-400"
                />
                <span className="text-[9px] text-slate-500 font-mono block">Duración de esterilización en meseta</span>
              </div>

              {/* Sistema Habilitado */}
              <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 flex justify-between items-center">
                <div>
                  <span className="text-xs font-mono font-bold text-white block">Sistema Habilitado</span>
                  <span className="text-[10px] text-slate-400 font-mono">Seguro maestro del ciclo</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSwitch('hab', hab, setHab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                    hab ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                  }`}
                >
                  {hab ? 'HABILITADO' : 'BLOQUEADO'}
                </button>
              </div>
            </div>
          </div>

          {/* CATEGORÍA 2: ACTUADORES FÍSICOS & SALIDAS (GPIO 2, 4 y 5) */}
          <div>
            <span className="text-xs font-mono text-cyan-400 font-bold block mb-3 uppercase tracking-wider">
              2. Actuadores Físicos & Relevadores
            </span>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Motor / LED (GPIO 2) */}
              <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 flex justify-between items-center">
                <div>
                  <span className="text-xs font-mono font-bold text-white block">Motor Agitador (GPIO 2)</span>
                  <span className="text-[10px] text-slate-400 font-mono">Salida LED 1</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSwitch('mot_ok', motOk, setMotOk)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                    motOk ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {motOk ? 'ACTIVO' : 'INACTIVO'}
                </button>
              </div>

              {/* Bomba Vacío (GPIO 5) */}
              <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 flex justify-between items-center">
                <div>
                  <span className="text-xs font-mono font-bold text-white block">Bomba Vacío (GPIO 5)</span>
                  <span className="text-[10px] text-slate-400 font-mono">Salida LED 3</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSwitch('vacio_ok', vacioOk, setVacioOk)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                    vacioOk ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {vacioOk ? 'ACTIVA' : 'INACTIVA'}
                </button>
              </div>

              {/* Purga Automática */}
              <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 flex justify-between items-center">
                <div>
                  <span className="text-xs font-mono font-bold text-white block">Purga Automática</span>
                  <span className="text-[10px] text-slate-400 font-mono">Evacuación periódica</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSwitch('purga_ok', purgaOk, setPurgaOk)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                    purgaOk ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {purgaOk ? 'ACTIVA' : 'MANUAL'}
                </button>
              </div>
            </div>
          </div>

          {/* CATEGORÍA 3: SEGURIDAD, MANTENIMIENTO Y ALARMAS */}
          <div>
            <span className="text-xs font-mono text-cyan-400 font-bold block mb-3 uppercase tracking-wider">
              3. Seguridad, Odómetro y Alarmas
            </span>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Límite Sobrepresión */}
              <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 space-y-1.5">
                <label className="text-[11px] font-mono text-slate-300 block flex justify-between">
                  <span>Límite Sobrepresión (Bar)</span>
                  <span className="text-pink-400 font-bold">{pMax} bar</span>
                </label>
                <input
                  type="number"
                  step="0.05"
                  min="2.00"
                  max="3.00"
                  value={pMax}
                  onChange={(e) => setPMax(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-cyan-400"
                />
                <span className="text-[9px] text-slate-500 font-mono block">Disparo de alarma de escape</span>
              </div>

              {/* Límite Mantenimiento */}
              <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 space-y-1.5">
                <label className="text-[11px] font-mono text-slate-300 block flex justify-between">
                  <span>Límite Odómetro (Ciclos)</span>
                  <span className="text-amber-400 font-bold">{limMant}</span>
                </label>
                <input
                  type="number"
                  step="10"
                  min="50"
                  max="1000"
                  value={limMant}
                  onChange={(e) => setLimMant(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-cyan-400"
                />
                <span className="text-[9px] text-slate-500 font-mono block">Alerta de servicio preventivo</span>
              </div>

              {/* Alarma Sonora */}
              <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 flex justify-between items-center">
                <div>
                  <span className="text-xs font-mono font-bold text-white block">Zumbador / Sirena Física</span>
                  <span className="text-[10px] text-slate-400 font-mono">Alarma sonora en placa</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSwitch('snd_ok', sndOk, setSndOk)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                    sndOk ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {sndOk ? 'AUDIBLE' : 'SILENCIOSO'}
                </button>
              </div>
            </div>
          </div>

          {/* Botón de Transmisión NVS */}
          <button
            type="submit"
            className="w-full py-3 bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:opacity-90 text-white font-bold rounded-xl text-xs font-mono flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25 pt-3"
          >
            <Send className="w-4 h-4" />
            <span>TRANSMITIR Y GRABAR PARÁMETROS EN NVS FLASH DEL ESP32</span>
          </button>
        </form>
      )}

      {/* PESTAÑA 3: FICHA DE CLIENTE */}
      {activeTab === 'ficha' && (
        <form onSubmit={handleGuardarFicha} className="ultra-glass p-6 rounded-2xl border border-cyan-500/30 space-y-4 max-w-xl">
          <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
            <Building2 className="w-4 h-4 text-cyan-400" />
            Ficha del Equipo & Asignación Hospitalaria
          </h3>

          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1">Alias del Autoclave</label>
            <input
              type="text"
              required
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1">Hospital / Clínica / Cliente</label>
            <input
              type="text"
              required
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1">Modelo de Hardware</label>
            <input
              type="text"
              required
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-400"
            />
          </div>

          <button
            type="submit"
            disabled={guardandoFicha}
            className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-lg text-xs shadow-lg"
          >
            {guardandoFicha ? 'Guardando en Supabase...' : 'Guardar y Vincular en Nube'}
          </button>
        </form>
      )}

      {/* PESTAÑA 4: MANTENIMIENTOS & ODÓMETRO */}
      {activeTab === 'mantenimiento' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-3">
            <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
              <Wrench className="w-4 h-4 text-cyan-400" />
              Estado del Odómetro Físico
            </h3>

            <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-800 space-y-2">
              <div className="flex justify-between text-xs font-mono text-slate-300">
                <span>Ciclos Acumulados:</span>
                <span className="font-bold text-cyan-300">{ciclos} / {limite}</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-700">
                <div
                  className={`h-full ${pctMant > 90 ? 'bg-rose-500' : 'bg-emerald-400'}`}
                  style={{ width: `${pctMant}%` }}
                ></div>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                {limite - ciclos > 0 ? `Restan ${limite - ciclos} ciclos para servicio preventivo.` : '¡Mantenimiento vencido!'}
              </p>
              <button
                type="button"
                onClick={() => sendCommand(device.mac, { cmd: 'RESET_ODOMETRO' })}
                className="w-full mt-2 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 rounded-lg text-xs font-bold"
              >
                🔄 Reiniciar Odómetro a Cero (RESET_ODOMETRO)
              </button>
            </div>
          </div>

          <form onSubmit={handleGuardarMantenimiento} className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-3">
            <h3 className="text-sm font-bold text-white font-mono">Agendar Mantenimiento Preventivo</h3>
            <input
              type="date"
              required
              value={maintFecha}
              onChange={(e) => setMaintFecha(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
            />
            <input
              type="text"
              required
              placeholder="Técnico responsable..."
              value={maintTecnico}
              onChange={(e) => setMaintTecnico(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
            />
            <input
              type="text"
              placeholder="Notas u observaciones del servicio..."
              value={maintNotas}
              onChange={(e) => setMaintNotas(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
            />
            <button
              type="submit"
              className="w-full py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-lg text-xs"
            >
              Agendar en Supabase Cloud
            </button>
          </form>
        </div>
      )}

      {/* Modal de Etiquetas QR */}
      <SurgicalQRLabel
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
        deviceData={device}
        operatorName={operatorName}
      />
    </div>
  );
}
