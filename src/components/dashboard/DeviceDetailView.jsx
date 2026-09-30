import React, { useState } from 'react';
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
  ChevronLeft
} from 'lucide-react';

export default function DeviceDetailView({ device, onBack, sendCommand, operatorName }) {
  const [activeTab, setActiveTab] = useState('sensores'); // 'sensores' | 'nvs' | 'ficha' | 'historial' | 'mantenimiento'
  const [showQRModal, setShowQRModal] = useState(false);

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

  const d = device?.datos || {};
  const isOnline = Date.now() - (device?.lastSeen || 0) < 18000;
  const ciclos = d?.cfg?.ciclos || device?.meta?.ciclosCompletados || 0;
  const limite = d?.cfg?.lim_mant || device?.meta?.limiteMantenimiento || 200;
  const pctMant = Math.min(100, Math.round((ciclos / limite) * 100));

  // Guardar Ficha en Supabase y publicar MQTT
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

  // Guardar Mantenimiento en Supabase
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
      {/* Barra de cabecera con botón de retorno */}
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
            <p className="text-xs text-cyan-300 font-mono">MAC: {device.mac} • {cliente}</p>
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
          <span>Ajustes NVS Hardware</span>
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
            </div>
            <div className="ultra-glass p-3.5 rounded-xl border border-pink-500/30">
              <span className="text-[10px] font-mono text-pink-400 block mb-1">PRESIÓN VAPOR</span>
              <p className="text-2xl font-bold font-mono text-white">{(d?.presion || 0.0).toFixed(2)} bar</p>
            </div>
            <div className="ultra-glass p-3.5 rounded-xl border border-emerald-500/30">
              <span className="text-[10px] font-mono text-emerald-400 block mb-1">LETALIDAD (F0)</span>
              <p className="text-2xl font-bold font-mono text-emerald-300">{(device.f0Score || 0.0).toFixed(1)} min</p>
            </div>
            <div className="ultra-glass p-3.5 rounded-xl border border-amber-500/30">
              <span className="text-[10px] font-mono text-amber-400 block mb-1">FASE ACTUAL</span>
              <p className="text-lg font-bold font-mono text-white truncate">{d?.fase || 'ESPERA'}</p>
            </div>
          </div>

          <div className="flex gap-2.5">
            <button
              onClick={() => sendCommand(device.mac, { cmd: 'INICIAR_CICLO' })}
              className="flex-1 py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Iniciar Ciclo</span>
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

      {/* PESTAÑA 2: NVS & MENÚS DINÁMICOS */}
      {activeTab === 'nvs' && (
        <div className="ultra-glass p-6 rounded-2xl border border-cyan-500/30 space-y-4">
          <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            Parámetros en Memoria Flash (NVS) del ESP32
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Control Motor (GPIO 2) */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex justify-between items-center">
              <div>
                <p className="text-xs font-bold text-white">Motor Agitador (GPIO 2)</p>
                <p className="text-[10px] text-slate-400 font-mono">Salida Digital</p>
              </div>
              <button
                onClick={() => sendCommand(device.mac, { mot_ok: !d?.motor })}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border ${
                  d?.motor ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {d?.motor ? 'ACTIVO' : 'INACTIVO'}
              </button>
            </div>

            {/* Control Vacío (GPIO 5) */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex justify-between items-center">
              <div>
                <p className="text-xs font-bold text-white">Bomba de Vacío (GPIO 5)</p>
                <p className="text-[10px] text-slate-400 font-mono">Salida Digital</p>
              </div>
              <button
                onClick={() => sendCommand(device.mac, { vacio_ok: !d?.vacio })}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border ${
                  d?.vacio ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {d?.vacio ? 'ACTIVA' : 'INACTIVA'}
              </button>
            </div>

            {/* Sistema Habilitado */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex justify-between items-center">
              <div>
                <p className="text-xs font-bold text-white">Sistema Habilitado</p>
                <p className="text-[10px] text-slate-400 font-mono">Seguro de Cámara</p>
              </div>
              <button
                onClick={() => sendCommand(device.mac, { hab: !d?.cfg?.hab })}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border ${
                  d?.cfg?.hab !== false ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-rose-500/20 text-rose-400'
                }`}
              >
                {d?.cfg?.hab !== false ? 'HABILITADO' : 'BLOQUEADO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑA 3: ASIGNAR CLIENTE Y FICHA */}
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

      {/* PESTAÑA 5: MANTENIMIENTOS & ODÓMETRO */}
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
                onClick={() => sendCommand(device.mac, { cmd: 'RESET_ODOMETRO' })}
                className="w-full mt-2 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 rounded-lg text-xs font-bold"
              >
                🔄 Reiniciar Odómetro a Cero
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

      {/* Modal de Etiquetas QR Quirúrgicas */}
      <SurgicalQRLabel
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
        deviceData={device}
        operatorName={operatorName}
      />
    </div>
  );
}
