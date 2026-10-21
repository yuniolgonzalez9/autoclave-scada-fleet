import React, { useState, useEffect } from 'react';
import { X, Save, Cpu, Car, Activity, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../services/supabase';

const CATALOGO_MODELOS = {
  AUTOCLAVE: {
    TUTTNAUER: ['2340M', '2540M', '3870M', 'Elara 11', 'T-Edge 10', 'T-Edge 11'],
    MIDMARK: ['M9 UltraClave', 'M11 UltraClave'],
    STERIS: ['AMSCO 400 Series', 'AMSCO 600 Series', 'Century V116'],
    GETINGE: ['GSS67H', 'HS66-series', 'K-series'],
    MELAG: ['Vacuklav 23 B+', 'Vacuklav 40 B+', 'Euroklav 23 VS+'],
    BIOBASE: ['BKM-Z18B', 'BKM-Z24B', 'BKQ-B50II', 'BKQ-Z75II'],
    GENERICO: ['Autoclave Horizontal Estándar', 'Autoclave Vertical Clínico', 'Universal SCADA']
  },
  VEHICULO: {
    MERCEDES_BENZ: ['Sprinter 315 CDI Ambulancia UCI', 'Sprinter 415 CDI', 'Sprinter 516 CDI UCI Avanzada', 'Vito Combi'],
    TOYOTA: ['Hilux Rescate 4x4', 'HiAce Ambulancia Asistencial', 'Land Cruiser / Prado', 'Fortuner Médica', 'Corolla'],
    FORD: ['Transit 350 Ambulancia', 'F-150 Rescate', 'Ranger Soporte Vital'],
    HYUNDAI: ['H-1 Starex Ambulancia', 'Staria Médica', 'Mighty'],
    KGM_SSANGYONG: ['Musso Pick-up', 'Grand Musso Pick-up UCI', 'Rexton', 'Korando'],
    NISSAN: ['NV350 Urvan Ambulancia', 'Frontier 4x4']
  },
  UNIVERSAL_PLC: {
    SIEMENS: ['S7-1200 (CPU 1214C)', 'S7-1500', 'LOGO! 8.3'],
    SCHNEIDER: ['Modicon M221', 'Modicon M241', 'Zelio Logic'],
    DELTA: ['DVP-14SS2', 'DVP-28SV2', 'AS300'],
    ESP32_INDUSTRIAL: ['ESP32 8-Relay Controller', 'ESP32 PLC DIN Rail', 'SCADA IoT Edge v2']
  }
};

export default function DeviceAssignmentModal({ 
  isOpen, 
  onClose, 
  device, 
  sendCommand, 
  onAssignmentUpdated 
}) {
  if (!isOpen || !device) return null;

  const currentMeta = device.meta || {};
  const currentDatos = device.datos || {};
  const initialType = (currentMeta.config_deseada?.tipo || currentMeta.tipo || currentDatos.tipo || 'AUTOCLAVE').toUpperCase();

  const [tipo, setTipo] = useState(initialType);
  const [alias, setAlias] = useState(currentMeta.alias || `EQUIPO [${device.mac?.slice(-4) || 'SCADA'}]`);
  const [cliente, setCliente] = useState(currentMeta.cliente || 'Hospital Central');
  const [usuarioAsignado, setUsuarioAsignado] = useState(currentMeta.usuario_asignado || '');
  const [marca, setMarca] = useState(currentMeta.marca || Object.keys(CATALOGO_MODELOS[initialType] || CATALOGO_MODELOS.AUTOCLAVE)[0]);
  const [modelo, setModelo] = useState(currentMeta.modelo || (CATALOGO_MODELOS[initialType]?.[marca]?.[0] || 'Universal'));
  const [limiteMant, setLimiteMant] = useState(currentDatos.cfg?.lim_mant || currentMeta.limiteMantenimiento || 200);

  const [guardando, setGuardando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState(false);

  // Actualiza lista de marcas al cambiar de tipo de dispositivo
  const handleTipoChange = (newTipo) => {
    setTipo(newTipo);
    const marcasDisponibles = Object.keys(CATALOGO_MODELOS[newTipo] || {});
    const primeraMarca = marcasDisponibles[0] || 'GENERICO';
    setMarca(primeraMarca);
    setModelo(CATALOGO_MODELOS[newTipo]?.[primeraMarca]?.[0] || 'Estándar');
  };

  // Actualiza modelos al cambiar de marca
  const handleMarcaChange = (newMarca) => {
    setMarca(newMarca);
    setModelo(CATALOGO_MODELOS[tipo]?.[newMarca]?.[0] || 'Estándar');
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setMensajeExito(false);

    const updatedData = {
      mac: device.mac,
      alias,
      cliente,
      usuario_asignado: usuarioAsignado,
      tipo,
      marca,
      modelo,
      limiteMantenimiento: Number(limiteMant),
      config_deseada: {
        tipo,
        marca,
        modelo
      }
    };

    try {
      // 1. Guardar metadatos en Supabase
      if (supabase) {
        const { error } = await supabase.from('asignaciones_equipos').upsert({
          mac: device.mac,
          alias,
          cliente,
          usuario_asignado: usuarioAsignado,
          tipo,
          marca,
          modelo,
          limite_mantenimiento: Number(limiteMant),
          updated_at: new Date().toISOString()
        }, { onConflict: 'mac' });
        if (error) throw error;
      }

      // 2. Enviar configuración de hardware vía MQTT si hay comando disponible
      if (sendCommand) {
        sendCommand(device.mac, {
          cmd: 'SET_CONFIG',
          cfg: { lim_mant: Number(limiteMant) },
          meta: { alias, cliente, tipo, modelo }
        });
      }

      // 3. Notificar al estado de React
      if (onAssignmentUpdated) {
        onAssignmentUpdated(updatedData);
      }

      setMensajeExito(true);
      setTimeout(() => {
        setMensajeExito(false);
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Error al guardar configuración del equipo:', err);
    } finally {
      setGuardando(false);
    }
  };

  const marcasActuales = Object.keys(CATALOGO_MODELOS[tipo] || {});
  const modelosActuales = CATALOGO_MODELOS[tipo]?.[marca] || ['Universal'];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="ultra-glass border border-cyan-500/40 rounded-2xl max-w-lg w-full p-5 sm:p-6 text-white shadow-2xl relative font-mono">
        
        {/* Cabecera */}
        <div className="flex justify-between items-center pb-4 border-b border-cyan-500/20">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">
              Configuración de Identidad y Catálogo
            </h2>
            <p className="text-[11px] text-slate-400">MAC: {device.mac}</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleGuardar} className="mt-4 space-y-4 text-xs">
          
          {/* Selector de Tipo de Dispositivo */}
          <div>
            <label className="block text-slate-300 mb-1.5 font-bold">Tipo de Unidad SCADA</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleTipoChange('AUTOCLAVE')}
                className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl border text-[11px] font-bold transition-all ${
                  tipo === 'AUTOCLAVE'
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_15px_rgba(0,243,255,0.2)]'
                    : 'bg-slate-900/60 border-slate-700/80 text-slate-400 hover:text-white'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Autoclave</span>
              </button>

              <button
                type="button"
                onClick={() => handleTipoChange('VEHICULO')}
                className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl border text-[11px] font-bold transition-all ${
                  tipo === 'VEHICULO'
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                    : 'bg-slate-900/60 border-slate-700/80 text-slate-400 hover:text-white'
                }`}
              >
                <Car className="w-3.5 h-3.5" />
                <span>Vehículo UCI</span>
              </button>

              <button
                type="button"
                onClick={() => handleTipoChange('UNIVERSAL_PLC')}
                className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl border text-[11px] font-bold transition-all ${
                  tipo === 'UNIVERSAL_PLC'
                    ? 'bg-purple-500/20 border-purple-400 text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.2)]'
                    : 'bg-slate-900/60 border-slate-700/80 text-slate-400 hover:text-white'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>PLC / IoT</span>
              </button>
            </div>
          </div>

          {/* Alias y Cliente */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 mb-1">Nombre / Alias del Equipo</label>
              <input
                type="text"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                required
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Cliente / Hospital / Base</label>
              <input
                type="text"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                required
              />
            </div>
          </div>

          {/* Marca y Modelo desde Catálogo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 mb-1">Fabricante / Marca</label>
              <select
                value={marca}
                onChange={(e) => handleMarcaChange(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
              >
                {marcasActuales.map((m) => (
                  <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Modelo de Catálogo</label>
              <select
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
              >
                {modelosActuales.map((mod) => (
                  <option key={mod} value={mod}>{mod}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Usuario asignado y Límite de mantenimiento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 mb-1">Operador / Usuario Asignado</label>
              <input
                type="text"
                placeholder="Ej: dr_ramirez o dejar en blanco"
                value={usuarioAsignado}
                onChange={(e) => setUsuarioAsignado(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Límite Mantenimiento (Ciclos)</label>
              <input
                type="number"
                min="10"
                max="5000"
                value={limiteMant}
                onChange={(e) => setLimiteMant(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          {/* Mensaje de Confirmación */}
          {mensajeExito && (
            <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>¡Parámetros actualizados y sincronizados con éxito!</span>
            </div>
          )}

          {/* Acciones */}
          <div className="pt-3 border-t border-cyan-500/20 flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={guardando}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold flex items-center gap-1.5 transition-all shadow-[0_0_15px_rgba(0,243,255,0.4)] disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{guardando ? 'Guardando...' : 'Aplicar Configuración'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
