import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Cpu, Car, Activity, CheckCircle2, AlertTriangle } from 'lucide-react';
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
  const currentMeta = device?.meta || {};
  const currentDatos = device?.datos || {};
  
  const initialType = useMemo(() => {
    return (currentMeta.config_deseada?.tipo || currentMeta.tipo || currentDatos.tipo || 'AUTOCLAVE').toUpperCase();
  }, [currentMeta, currentDatos]);

  const initialBrand = useMemo(() => {
    const brands = Object.keys(CATALOGO_MODELOS[initialType] || CATALOGO_MODELOS.AUTOCLAVE);
    return currentMeta.marca && brands.includes(currentMeta.marca) ? currentMeta.marca : brands[0] || 'GENERICO';
  }, [initialType, currentMeta.marca]);

  const initialModel = useMemo(() => {
    const models = CATALOGO_MODELOS[initialType]?.[initialBrand] || ['Universal'];
    return currentMeta.modelo && models.includes(currentMeta.modelo) ? currentMeta.modelo : models[0] || 'Universal';
  }, [initialType, initialBrand, currentMeta.modelo]);

  const [tipo, setTipo] = useState(initialType);
  const [alias, setAlias] = useState('');
  const [cliente, setCliente] = useState('');
  const [usuarioAsignado, setUsuarioAsignado] = useState('');
  const [marca, setMarca] = useState(initialBrand);
  const [modelo, setModelo] = useState(initialModel);
  const [limiteMant, setLimiteMant] = useState('200');

  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [mensajeExito, setMensajeExito] = useState(false);

  // Inicialización de campos al abrir el modal con el dispositivo seleccionado
  useEffect(() => {
    if (device) {
      const metaObj = device.meta || {};
      const datosObj = device.datos || {};
      const devType = (metaObj.config_deseada?.tipo || metaObj.tipo || datosObj.tipo || 'AUTOCLAVE').toUpperCase();
      const brands = Object.keys(CATALOGO_MODELOS[devType] || CATALOGO_MODELOS.AUTOCLAVE);
      const devBrand = metaObj.marca && brands.includes(metaObj.marca) ? metaObj.marca : brands[0] || 'GENERICO';
      const models = CATALOGO_MODELOS[devType]?.[devBrand] || ['Universal'];
      const devModel = metaObj.modelo && models.includes(metaObj.modelo) ? metaObj.modelo : models[0] || 'Universal';
      const devLimit = datosObj.cfg?.lim_mant || metaObj.limite_mantenimiento || metaObj.limiteMantenimiento || 200;

      queueMicrotask(() => {
        setTipo(devType);
      setAlias(metaObj.alias || `EQUIPO [${device.mac?.slice(-4) || 'SCADA'}]`);
      setCliente(metaObj.cliente || 'Central Hospitalaria');
      setUsuarioAsignado(metaObj.usuario_asignado || '');
      setMarca(devBrand);
      setModelo(devModel);
      setLimiteMant(String(devLimit));
      setErrorMsg('');
      setMensajeExito(false);
      });
    }
  }, [device]);

  // Manejo de tecla Escape
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

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
    setErrorMsg('');

    const cleanAlias = alias.trim();
    const cleanCliente = cliente.trim();
    const cleanUsuario = usuarioAsignado.trim().toLowerCase();
    
    // Validación de límites numéricos
    const parsedLimit = parseInt(limiteMant, 10);
    if (isNaN(parsedLimit) || parsedLimit < 10) {
      setErrorMsg('El límite de mantenimiento debe ser un número entero mayor o igual a 10 ciclos.');
      return;
    }

    if (!cleanAlias) {
      setErrorMsg('Debe asignar un nombre o alias identificador al equipo.');
      return;
    }

    setGuardando(true);
    setMensajeExito(false);

    const cleanMac = (device.mac || '').toUpperCase().replace(/[:-]/g, '');

    const updatedData = {
      mac: cleanMac,
      alias: cleanAlias,
      cliente: cleanCliente || 'Central Hospitalaria',
      usuario_asignado: cleanUsuario || null,
      tipo,
      marca,
      modelo,
      limite_mantenimiento: parsedLimit,
      config_deseada: {
        ...(currentMeta.config_deseada || {}),
        tipo,
        marca,
        modelo,
        lim_mant: parsedLimit
      }
    };

    try {
      // 1. Persistencia atómica en Supabase
      const { error: dbError } = await supabase.from('asignaciones_equipos').upsert({
        mac: cleanMac,
        alias: cleanAlias,
        cliente: cleanCliente || 'Central Hospitalaria',
        usuario_asignado: cleanUsuario || null,
        tipo,
        marca,
        modelo,
        limite_mantenimiento: parsedLimit,
        config_deseada: updatedData.config_deseada,
        updated_at: new Date().toISOString()
      }, { onConflict: 'mac' });

      if (dbError) throw dbError;

      // 2. Transmisión del comando ejecutivo por MQTT al microcontrolador
      if (sendCommand) {
        sendCommand(cleanMac, {
          cmd: 'SET_CONFIG',
          cfg: { lim_mant: parsedLimit },
          meta: { 
            alias: cleanAlias, 
            cliente: cleanCliente, 
            tipo, 
            modelo,
            marca 
          }
        });
      }

      // 3. Notificación al estado en memoria de React
      if (onAssignmentUpdated) {
        onAssignmentUpdated(updatedData);
      }

      setMensajeExito(true);
      setTimeout(() => {
        setMensajeExito(false);
        onClose();
      }, 900);
    } catch (err) {
      console.error('[DEVICE ASSIGNMENT ERROR]', err);
      setErrorMsg(`Error al guardar configuración: ${err.message || 'Fallo de base de datos'}`);
    } finally {
      setGuardando(false);
    }
  };

  const marcasActuales = Object.keys(CATALOGO_MODELOS[tipo] || {});
  const modelosActuales = CATALOGO_MODELOS[tipo]?.[marca] || ['Universal'];

  if (!isOpen || !device || typeof document === 'undefined') return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 select-none font-mono text-xs"
      onClick={onClose}
    >
      <div 
        className="ultra-glass border border-cyan-500/40 rounded-2xl max-w-lg w-full p-5 sm:p-6 text-white shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="flex justify-between items-center pb-4 border-b border-cyan-500/20">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">
              Configuración de Identidad y Catálogo
            </h2>
            <p className="text-[11px] text-slate-400">Identificador MAC: {device.mac}</p>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notificaciones de error o éxito */}
        {errorMsg && (
          <div className="mt-3 p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="font-sans text-xs">{errorMsg}</span>
          </div>
        )}

        {mensajeExito && (
          <div className="mt-3 p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="font-sans text-xs">¡Parámetros actualizados y transmitidos a la placa!</span>
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleGuardar} className="mt-4 space-y-4">
          
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
                className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400 font-mono"
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
                className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400 font-mono"
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
                placeholder="Identificador de usuario (opcional)"
                value={usuarioAsignado}
                onChange={(e) => setUsuarioAsignado(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400 font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Límite Mantenimiento (Ciclos)</label>
              <input
                type="number"
                min="10"
                max="10000"
                step="1"
                value={limiteMant}
                onChange={(e) => setLimiteMant(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400 font-mono"
                required
              />
            </div>
          </div>

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
    </div>,
    document.body
  );
}
