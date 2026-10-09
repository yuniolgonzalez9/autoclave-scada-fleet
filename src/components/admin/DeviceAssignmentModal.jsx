import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { 
  Building2, 
  X, 
  CheckCircle2, 
  Cpu, 
  Save, 
  Car, 
  Activity, 
  Sparkles,
  Layers,
  Wrench
} from 'lucide-react';

// CATÁLOGO MAESTRO EMBEBIDO DE 81 MODELOS REALES (CARGA INSTANTÁNEA GARANTIZADA)
const CATALOGO_MAESTRO = {
  VEHICULO: {
    HYUNDAI: ['Staria Ambulancia / Van', 'Starex / H-1 / Grand Starex', 'Porter II / H-100 Taller', 'Tucson', 'Santa Fe', 'Elantra', 'Accent', 'Sonata'],
    KIA: ['Carnival / Sedona Traslado', 'Bongo III Utilitario', 'Sportage', 'Sorento', 'K5 / Optima', 'Cerato / Forte', 'Rio / K2', 'Mohave'],
    KGM_SSANGYONG: ['Musso / Grand Musso Pick-up', 'Rexton', 'Korando'],
    TOYOTA: ['Hilux', 'HiAce Ambulancia', 'Land Cruiser / Prado', 'Fortuner', 'Corolla'],
    MERCEDES_BENZ: ['Sprinter 315 / 415 / 516 CDI Ambulancia UCI', 'Vito Combi'],
    FORD: ['Transit Ambulancia', 'F-150 / F-250 Super Duty', 'Ranger'],
    CHEVROLET: ['Express Van Ambulancia', 'D-Max / Colorado', 'Silverado'],
    NISSAN: ['Urvan NV350 Ambulancia', 'Frontier / Navara', 'Patrol'],
    GENERICO_VEHICULAR: ['Genérico 12V Gasolina (Push-to-Start)', 'Genérico 12V Llave Tradicional', 'Genérico 24V Diésel (Precalentador)']
  },
  AUTOCLAVE: {
    STERIS_AMSCO: [
      'Amsco 400 Small (16x16x26)', 'Amsco 400 Small (20x20x38)', 'Amsco 400 Medium (26x26x39)', 
      'Amsco Century V116', 'Amsco Century V120', 'Amsco Century V136', 'Amsco Eagle 3011 / 3013', 
      'Amsco Eagle 3021 / 3023', 'Steris V-PRO 1 / V-PRO max', 'Steris V-PRO 60 Compacto'
    ],
    GETINGE: [
      'Getinge GSS67N (600L)', 'Getinge GSS56 Compacto', 'Getinge Solsus 66', 
      'Getinge HS6606 (600mm)', 'Getinge HS6610 (1000mm)', 'Getinge HS55-Series', 
      'Getinge HS33-B Quirúrgico', 'Getinge K-Series (K3+ / K5+ / K7+)', 'Getinge Stericool 110 (Plasma)'
    ],
    TUTTNAUER: ['2340M / 2540M Manual', 'Elara 11 (Clase B)', 'EZ10k Plus', '3870E Vertical', '5075ELV (160L)'],
    MIDMARK_RITTER: ['M9 UltraClave', 'M11 UltraClave'],
    MATACHANA: ['Serie S1000 Doble Puerta', 'Serie 500 Hospitalario', 'Miniclave S28'],
    GENERICO: ['Autoclave Quirúrgico Clase B 24L', 'Autoclave Vertical 50L / 75L', 'Horno Calor Seco Pasteur']
  },
  CAMA_HOSPITALARIA: {
    HILL_ROM: ['Progressa UCI', 'Centrella Smart+ Bed', 'TotalCare P500', 'Advanta 2'],
    STRYKER: ['InTouch Critical Care', 'ProCuity Smart Bed', 'S3 MedSurg'],
    LINET: ['Multicare UCI', 'Eleganza 4', 'Eleganza 2'],
    PARAMOUNT_BED: ['Qualitas Plus', 'A5 Series'],
    GENERICO: ['Cama Eléctrica 3 Motores', 'Cama UCI 5 Motores (Trendelenburg)']
  },
  PLC_GENERICO: {
    HANKERILA: ['HKL-EA8 (8 Relés / 8 Entradas / ADS1115)', 'HKL-EA16 Industrial'],
    GENERICO: ['Tablero Soft-PLC Universal 8 I/O', 'Controlador Cuarto Frío / Cadena de Frío']
  }
};

export default function DeviceAssignmentModal({ isOpen, onClose, device, onAssignmentUpdated, sendCommand }) {
  const [alias, setAlias] = useState('');
  const [cliente, setCliente] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [usuarioAsignado, setUsuarioAsignado] = useState('');
  const [usersList, setUsersList] = useState([]);

  // Estados del tipo de máquina
  const [tipo, setTipo] = useState('VEHICULO');
  const [marca, setMarca] = useState('HYUNDAI');
  const [modelo, setModelo] = useState('Staria Ambulancia / Van');
  const [starterMs, setStarterMs] = useState(1200);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // Opciones derivadas del catálogo local
  const tiposDisponibles = Object.keys(CATALOGO_MAESTRO);
  const marcasDisponibles = Object.keys(CATALOGO_MAESTRO[tipo] || {});
  const modelosDisponibles = (CATALOGO_MAESTRO[tipo] && CATALOGO_MAESTRO[tipo][marca]) || [];

  const handleTipoChange = (newTipo) => {
    setTipo(newTipo);
    const primerasMarcas = Object.keys(CATALOGO_MAESTRO[newTipo] || {});
    const primeraMarca = primerasMarcas[0] || '';
    setMarca(primeraMarca);
    const primerosModelos = (CATALOGO_MAESTRO[newTipo] && CATALOGO_MAESTRO[newTipo][primeraMarca]) || [];
    setModelo(primerosModelos[0] || '');
  };

  const handleMarcaChange = (newMarca) => {
    setMarca(newMarca);
    const modelos = (CATALOGO_MAESTRO[tipo] && CATALOGO_MAESTRO[tipo][newMarca]) || [];
    setModelo(modelos[0] || '');
  };

  useEffect(() => {
    if (device) {
      const cfg = device.meta?.config_deseada || {};
      const devTipo = cfg.tipo || device.meta?.tipo || device.datos?.tipo || 'VEHICULO';
      const devMarca = cfg.marca || device.meta?.marca || 'HYUNDAI';
      const devModelo = cfg.modelo || device.meta?.modelo || 'Staria Ambulancia / Van';

      setAlias(device.meta?.alias || `EQUIPO [${device.mac.slice(-4)}]`);
      setCliente(device.meta?.cliente || 'Base Central');
      setDepartamento(device.meta?.departamento || 'Flota Operativa');
      setUsuarioAsignado(device.meta?.usuario_asignado || '');
      setTipo(devTipo);
      setMarca(devMarca);
      setModelo(devModelo);
      setStarterMs(cfg.starter_ms || 1200);
      setMsg('');
    }
  }, [device]);

  useEffect(() => {
    if (isOpen) {
      supabase.from('usuarios_scada').select('usuario, nombre, rol').eq('estado', 'ACTIVO')
        .then(({ data }) => { if (data) setUsersList(data); });
    }
  }, [isOpen]);

  if (!isOpen || !device) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');

    const configPayload = {
      tipo,
      marca,
      modelo,
      starter_ms: Number(starterMs)
    };

    const payload = {
      mac: device.mac,
      alias: alias.trim(),
      cliente: cliente.trim(),
      modelo: modelo.trim(),
      departamento: departamento.trim(),
      usuario_asignado: usuarioAsignado.trim() || null,
      config_deseada: configPayload,
      updated_at: new Date().toISOString()
    };

    try {
      // 1. Guardar en Supabase
      const { error } = await supabase.from('asignaciones_equipos').upsert(payload, { onConflict: 'mac' });
      if (error) throw error;

      // 2. ORDEN CLAVE: Reconfigurar el ESP32 por MQTT para que grabe en LittleFS
      if (sendCommand) {
        sendCommand(device.mac, {
          cmd: 'APPLY_HAL_MAP',
          tipo,
          marca,
          modelo,
          starter_ms: Number(starterMs)
        });
        sendCommand(device.mac, { cmd: 'SET_META', ...payload });
      }

      // 3. Forzar actualización inmediata en memoria de la Web
      if (device.meta) {
        device.meta = Object.assign(device.meta, payload);
        device.meta.tipo = tipo;
      }
      if (device.datos) {
        device.datos.tipo = tipo;
      }

      setMsg('¡Equipo asignado y microcontrolador reconfigurado con éxito!');
      if (onAssignmentUpdated) onAssignmentUpdated(payload);
      setTimeout(() => onClose(), 1000);
    } catch (err) {
      setMsg('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999999] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 font-mono text-xs">
      <div className="ultra-glass border-2 border-cyan-400/50 rounded-2xl max-w-lg w-full max-h-[92vh] flex flex-col p-5 sm:p-6 shadow-2xl space-y-4 overflow-hidden">
        
        {/* Cabecera */}
        <div className="flex justify-between items-center border-b border-cyan-500/20 pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Asignación & Identidad de Máquina</h3>
              <p className="text-xs text-cyan-300">MAC: {device.mac}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {msg && (
          <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-xl flex items-center gap-2 shrink-0">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{msg}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-3 overflow-y-auto pr-1">
          
          {/* SELECCIÓN DE CATEGORÍA, MARCA Y MODELO */}
          <div className="p-3.5 bg-slate-950/90 rounded-xl border border-cyan-500/40 space-y-2.5">
            <span className="text-cyan-400 font-bold block text-[11px] uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              1. Selección de Máquina & Comportamiento:
            </span>

            <div>
              <label className="block text-slate-300 mb-1 font-bold">Tipo / Categoría de Máquina</label>
              <select
                value={tipo}
                onChange={(e) => handleTipoChange(e.target.value)}
                className="w-full bg-slate-900 border border-cyan-500/60 rounded-lg p-2.5 text-cyan-300 font-bold text-sm focus:outline-none"
              >
                {tiposDisponibles.map((t) => (
                  <option key={t} value={t}>{t.replace('_', ' ')}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-300 mb-1">Marca / Fabricante</label>
                <select
                  value={marca}
                  onChange={(e) => handleMarcaChange(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:outline-none"
                >
                  {marcasDisponibles.map((m) => (
                    <option key={m} value={m}>{m.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Modelo Específico</label>
                <select
                  value={modelo}
                  onChange={(e) => setModelo(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-cyan-200 focus:outline-none"
                >
                  {modelosDisponibles.map((mod) => (
                    <option key={mod} value={mod}>{mod}</option>
                  ))}
                </select>
              </div>
            </div>

            {tipo === 'VEHICULO' && (
              <div>
                <label className="block text-slate-300 mb-1">Duración Pulso Arranque (ms)</label>
                <input
                  type="number"
                  step="100"
                  min="500"
                  max="3000"
                  value={starterMs}
                  onChange={(e) => setStarterMs(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-amber-300 font-bold"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-slate-300 mb-1">Nombre / Alias del Equipo</label>
            <input
              type="text"
              required
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="Ej: Ambulancia Móvil 1 / Quirófano Central"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white font-sans focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-1">Hospital / Clínica / Base Flota</label>
            <input
              type="text"
              required
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              placeholder="Ej: Hospital Metropolitano"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white font-sans focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-1">Operador Responsable</label>
            <select
              value={usuarioAsignado}
              onChange={(e) => setUsuarioAsignado(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-cyan-300 focus:outline-none"
            >
              <option value="">-- Acceso Universal (Todos los autorizados) --</option>
              {usersList.map((u) => (
                <option key={u.usuario} value={u.usuario}>
                  {u.nombre || u.usuario} ({u.rol})
                </option>
              ))}
            </select>
          </div>

          <div className="pt-2 flex gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-800 text-slate-300 rounded-xl font-bold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-lg"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Reconfigurando...' : 'Guardar y Reconfigurar'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
