import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../services/supabase';
import { 
  Building2, 
  X, 
  CheckCircle2, 
  Save, 
  Sparkles 
} from 'lucide-react';

// CATÁLOGO MAESTRO EMBEBIDO DE 81 MODELOS REALES
export const CATALOGO_MAESTRO = {
  VEHICULO: {
    HYUNDAI: ['Staria Ambulancia / Van', 'Starex / H-1 / Grand Starex', 'Porter II / H-100 Taller', 'Tucson', 'Santa Fe', 'Elantra', 'Accent', 'Sonata'],
    KIA: ['Carnival / Sedona Traslado', 'Bongo III Utilitario', 'Sportage', 'Sorento', 'K5 / Optima', 'Cerato / Forte', 'Rio / K2', 'Mohave'],
    KGM_SSANGYONG: ['Musso / Grand Musso Pick-up', 'Rexton', 'Korando'],
    TOYOTA: ['Hilux', 'HiAce Ambulancia', 'Land Cruiser / Prado', 'Fortuner', 'Corolla'],
    MERCEDES_BENZ: ['Sprinter 315 / 415 / 516 CDI Ambulancia UCI', 'Vito Combi'],Vamos con el **Archivo 18: `src/components/admin/DeviceAssignmentModal.jsx`**, el configurador de identidad física y catálogo maestro de los 81 modelos de autoclaves, vehículos, camas y PLCs.

---

### ARCHIVO 18: `src/components/admin/DeviceAssignmentModal.jsx`

#### 🛠️ Mejoras y Correcciones Aplicadas:
1. **Montaje en Portal (`createPortal` con `document.body`):** Ev
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
    TUTTNAUER:ita que el modal quede deformado o recortado si se abre desde una tarjeta con transformaciones CSS.
2. **Normalización del Selector de Operadores:** Al consultar la lista de usuarios en Supabase, ahora tolera columnas `user` y `usuario`, garantizando que el desplegable de "Operador Responsable" nunca aparezca en blanco.
3. **Cierre con Tecla `Escape` y Clic Exterior:** Experiencia táctil y de teclado limpia.
4. **Despacho Atómico MQTT:** Envía la orden `APPLY_HAL_MAP` y `SET_META` con la ['2340M / 2540M Manual', 'Elara 11 (Clase B)', 'EZ10k Plus', '3870E Vertical', '5075ELV (160L)'],
    MIDMARK_RITTER: ['M9 UltraClave', 'M11 UltraClave'],
    MATACHANA: ['Serie S1000 Doble Puerta', 'Serie 500 Hospitalario', 'Miniclave S28'],
    GENERICO: MAC sanitizada para que el microcontrolador grabe el modelo y tipo de máquina en su memoria flash de inmediato.

```javascript
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../services/supabase';
import { 
  Building2, 
  X, 
  CheckCircle2, 
  Save, 
  Sparkles 
} from 'lucide-react';

// CATÁLOGO MAESTRO EMBEBIDO DE 81 MODELOS ['Autoclave Quirúrgico Clase B 24L', 'Autoclave Vertical 50L / 75L', 'Horno Calor Seco Pasteur']
  },
  CAMA_HOSPITALARIA: {
    HILL_ROM REALES
const CATALOGO_MAESTRO = {
  VEHICULO: {
    HYUNDAI:: ['Progressa UCI', 'Centrella Smart+ Bed', 'TotalCare P500', 'Advanta 2'],
    STRYKER: ['InTouch Critical Care', 'ProCuity Smart Bed', 'S3 MedSurg'],
    LINET ['Staria Ambulancia / Van', 'Starex / H-1 / Grand Starex', 'Porter II / H-100 Taller', 'Tucson', 'Santa Fe', 'Elantra', 'Accent', 'Sonata'],
    KIA:: ['Multicare UCI', 'Eleganza 4', 'Eleganza 2'],
    PARAMOUNT_BED: ['Qualitas Plus', 'A5 Series'],
    GENERICO: ['Carnival / Sedona Traslado', 'Bongo III Utilitario', 'Sportage', 'Sorento', 'K5 / Optima', 'Cerato / Forte', 'Rio / K2', 'Mohave'],
    KGM_SSANGYONG: ['Cama Eléctrica 3 Motores', 'Cama UCI 5 Motores (Trendelenburg)']
  },
 ['Musso / Grand Musso Pick-up', 'Rexton', 'Korando'],
    TOYOTA:  PLC_GENERICO: {
    HANKERILA: ['Hilux', 'HiAce Ambulancia', 'Land Cruiser / Prado', 'Fortuner', 'Corolla'],
     ['HKL-EA8 (8 Relés / 8 Entradas / ADS1115)', 'HKL-EA16 Industrial'],
    MERCEDES_BENZ:GENERICO: ['Sprinter 315 / 415 / 516 CDI Ambulancia UCI', 'Vito Combi'],
    FORD: ['Tablero Soft-PLC Universal 8 I/O', 'Controlador Cuarto Frío / Cadena de Frío']
  }
};

export default function DeviceAssignmentModal({ 
  isOpen ['Transit Ambulancia', 'F-150 / F-250 Super Duty', 'Ranger'],
    CHEVROLET:, 
  onClose, 
  device, 
  onAssignmentUpdated, 
  sendCommand  ['Express Van Ambulancia', 'D-Max / Colorado', 'Silverado'],
    NISSAN:
}) {
  const [alias, setAlias] = useState('');
  const [cliente, setCliente] ['Urvan NV350 Ambulancia', 'Frontier / Navara', 'Patrol'],
    GENERICO_VEHICULAR: = useState('');
  const [departamento, setDepartamento] = useState('');
  const [usuarioAsignado, setUsuarioAsignado] = useState('');
  const [usersList, setUsersList] = useState([]); ['Genérico 12V Gasolina (Push-to-Start)', 'Genérico 12V Llave Tradicional', 'Genérico 24V Diésel (Precalentador)']
  },


  // Categoría, Marca y Modelo
  const [tipo, setTipo] = useState('VEHICULO  AUTOCLAVE: {
    STERIS_AMSCO: [
      'Amsco 400 Small (16');
  const [marca, setMarca] = useState('HYUNDAI');
  constx16x26)', 'Amsco 400 Small (20x20x38 [modelo, setModelo] = useState('Staria Ambulancia / Van');
  const [starterMs, setStarterMs] = useState)', 'Amsco 400 Medium (26x26x39)', 
      'Amsco Century V116', 'Amsco Century V120', 'Amsco Century V136(1200);

  const [saving, setSaving] = useState(false);
  const', 'Amsco Eagle 3011 / 3013', 
      'Amsco Eagle [msg, setMsg] = useState('');
  const timeoutRef = useRef(null);

  // Cierre con Escape
  const 3021 / 3023', 'Steris V-PRO 1 / V-PRO handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
   max', 'Steris V-PRO 60 Compacto'
    ],
    GETINGE:}, [onClose]);

  useEffect(() => {
    if (isOpen) {
      window.addEventListener(' [
      'Getinge GSS67N (600L)', 'Getinge GSS56 Compactkeydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
o', 'Getinge Solsus 66', 
      'Getinge HS6606 (  }, [isOpen, handleKeyDown]);

  useEffect(() => {
    return () => {
      if (timeoutRef600mm)', 'Getinge HS6610 (1000mm)', 'Getinge HS5.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Opciones derivadas del5-Series', 
      'Getinge HS33-B Quirúrgico', 'Getinge K-Series (K3+ / K5+ / K7+)', 'Getinge Stericool 110 (Plasma)'
    ],
    TUTTNAUER: ['2340M / 2540M Manual', 'Elara 11 (Clase B)', 'EZ10k Plus', '3870E Vertical', '5075ELV (160L)'],
    MIDMARK_RITTER: catálogo maestro
  const tiposDisponibles = useMemo(() => Object.keys(CATALOGO_MAESTRO), []);
  const marcasDisponibles = useMemo(() => Object.keys(CATALOGO_MAESTRO ['M9 UltraClave', 'M11 UltraClave'],
    MATACHANA: ['Serie S1000 Doble Puerta', 'Serie 500 Hospitalario', 'Miniclave S28'],
    [tipo] || {}), [tipo]);
  const modelosDisponibles = useMemo(() => (CATALOGO_MAESTRO[tipo] && CATALOGO_MAESTRO[tipo][marca]) || [], [tipo, marca]);

  const handleTipoChange = (newTipo) => {
    setTipo(newTipo);
    const primerasMarcas = Object.keys(CATALOGO_MAESTRO[newTipo] || {});
    const primeraMarca = primerasMarcas[0] || '';
    setMarca(primeraMarca);
    const primerosModelos = (CATALOGO_MAESTRO[newTipo] && CATALOGO_MAESTRO[newTipo]GENERICO:[primeraMarca]) || [];
    setModelo(primerosModelos[0] || '');
  };

  const handleMarcaChange = (new ['Autoclave Quirúrgico Clase B 24L', 'Autoclave Vertical 50L / 75L', 'Horno Calor Seco Pasteur']
  },
  CAMA_HOSPITALARIA: {
    HILL_ROM: ['Progressa UCI', 'Centrella Smart+ Bed', 'TotalCare P500', 'Advanta 2'],
    STRYKER:Marca) => {
    setMarca(newMarca);
    const modelos = (CATALOGO_MAEST ['InTouch Critical Care', 'ProCuity Smart Bed', 'S3 MedSurg'],
    LINET:RO[tipo] && CATALOGO_MAESTRO[tipo][newMarca]) || [];
    setModelo(modelos[0] || '');
  };

  useEffect(() => {
    if (device) {
      const cfg = device.meta?.config_deseada || {};
      const devTipo = (cfg. ['Multicare UCI', 'Eleganza 4', 'Eleganza 2'],
    PARAMOUNT_BED: ['Qualitas Plus', 'A5 Series'],
    GENERICO:tipo || device.meta?.tipo || device.datos?.tipo || 'VEHICULO').toUpperCase();
      const devMarca = (cfg.marca || device.meta?.marca || 'HYUNDAI').toUpperCase();
      const devModelo = cfg.modelo || device.meta?.modelo || 'Staria Ambulancia / Van';

      setAlias(device.meta?.alias || `EQUIPO [${device.mac.slice(-4)}]`);
 ['Cama Eléctrica 3 Motores', 'Cama UCI 5 Motores (Trendelenburg)']
  },
  PLC_GENERICO: {
    HANKERILA:      setCliente(device.meta?.cliente || 'Base Central');
      setDepartamento(device.meta?.departamento || 'Flota Operativa');
      setUsuarioAsignado(device.meta?.usuario_asignado ['HKL-EA8 (8 Relés / 8 Entradas / ADS1115)', 'HKL-EA16 Industrial'],
    GENERICO: ['Tablero Soft-PLC Universal 8 I/O', 'Controlador Cuarto Frío / Cadena de Frío']
  }
};

export default function Device || '');
      setTipo(CATALOGO_MAESTRO[devTipo] ? devTipo : 'VEHICULO');
      setMarca(devMarca);
      setModelo(devModelo);
      setStarterMs(AssignmentModal({ 
  isOpen, 
  onClose, 
  device, 
  onAssignmentUpdated, 
  Number(cfg.starter_ms) || 1200);
      setMsg('');
    }
sendCommand 
}) {
  const [alias, setAlias] = useState('');
  const  }, [device]);

  // Carga de operadores tolerante a esquema
  useEffect(() => {
    if ( [cliente, setCliente] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [usuarioAsignado, setUsuarioAsignado] = useState('');
  const [usersList, setUsersList] =isOpen) {
      supabase.from('usuarios_scada')
        .select('*')
        .then useState([]);

  // Estados del catálogo
  const [tipo, setTipo] = useState('AUTOCLAVE');
  (({ data, error }) => {
          if (!error && data) {
            setUsersList(data.filterconst [marca, setMarca] = useState('STERIS_AMSCO');
  const(u => (u.estado || 'ACTIVO') === 'ACTIVO'));
          }
        });
 [modelo, setModelo] = useState('Amsco 400 Small (16x16x26)');
  const    }
  }, [isOpen]);

  if (!isOpen || !device || typeof document === 'undefined') return null;

  const [starterMs, setStarterMs] = useState(1200);

  const [saving, setSaving] = useState( handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    false);
  const [msg, setMsg] = useState('');

  // Cierre con Escape
  constsetMsg('');

    const cleanMac = device.mac.toUpperCase().replace(/[:\-]/g, '');

 handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
      const configPayload = {
      tipo,
      marca,
      modelo,
      starter_ms: Number(starterMs)}, [onClose]);

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('
    };

    const payload = {
      mac: cleanMac,
      alias: alias.trim(),keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);

      cliente: cliente.trim(),
      modelo: modelo.trim(),
      departamento: departamento.trim(),  }, [isOpen, handleKeyDown]);

  // Derivados del catálogo
  const tiposDisponibles = useMemo(()
      usuario_asignado: usuarioAsignado.trim() || null,
      config_deseada => Object.keys(CATALOGO_MAESTRO), []);
  const marcasDisponibles = useMemo: configPayload,
      updated_at: new Date().toISOString()
    };

    try {
      (() => Object.keys(CATALOGO_MAESTRO[tipo] || {}), [tipo]);
  const modelosDispon// 1. Guardar en Supabase
      const { error } = await supabase
        .from('asignaciones_equipos')
        .upsert(payload, { onConflict: 'mac' });

      if (ibles = useMemo(() => (CATALOGO_MAESTRO[tipo] && CATALOGO_MAESTROerror) throw error;

      // 2. Transmisión remota al ESP32 para grabar en Little[tipo][marca]) || [], [tipo, marca]);

  const handleTipoChange = (newTipo) =>FS
      if (typeof sendCommand === 'function') {
        sendCommand(cleanMac, {
          cmd: ' {
    setTipo(newTipo);
    const primerasMarcas = Object.keys(CATALOGO_MAAPPLY_HAL_MAP',
          tipo,
          marca,
          modelo,
          starter_msESTRO[newTipo] || {});
    const primeraMarca = primerasMarcas[0] || '';
    setMarca(prim: Number(starterMs)
        });
        sendCommand(cleanMac, { cmd: 'SET_META',eraMarca);
    const primerosModelos = (CATALOGO_MAESTRO[newTipo] && CATALOG ...payload });
      }

      // 3. Actualización inmediata en memoria de la UI
      if (device.metaO_MAESTRO[newTipo][primeraMarca]) || [];
    setModelo(primerosModelos) {
        Object.assign(device.meta, payload);
        device.meta.tipo = tipo;
      }
      if (device.datos) {
        device.datos.tipo = tipo;
      }

      setMsg('¡Equipo asignado y microcontrolador reconfigurado con éxito!');
      if (onAssignmentUpdated) onAssignment[0] || '');
  };

  const handleMarcaChange = (newMarca) => {
    setMarca(newMarca);
    const modelos = (CATALOGO_MAESTRO[tipo] && CATALOGO_MAESTRO[tipo][newMarca]) || [];
    setModelo(modelos[0] || '');
Updated(payload);

      timeoutRef.current = setTimeout(() => {
        onClose();
      },   };

  useEffect(() => {
    if (device) {
      const cfg = device.meta?.config_deseada || {};
      const devTipo = cfg.tipo || device.meta?.tipo || device.datos?.tipo || 'AUTOCLAVE';
      const devMarca = cfg.marca || device.meta?.marca900);
    } catch (err) {
      setMsg('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-[99999] bg- || Object.keys(CATALOGO_MAESTRO[devTipo] || {})[0] || 'GENERICOblack/85 backdrop-blur-md flex items-center justify-center p-3 font-mono text-xs select';
      const devModelo = cfg.modelo || device.meta?.modelo || (CATALOGO_MAEST-none"
      onClick={onClose}
    >
      <div 
        className="ultra-glass border-2 border-cyan-400/50 rounded-2xl max-w-lg wRO[devTipo]?.[devMarca]?.[0]) || 'Estándar';

      setAlias(device.meta?.alias || `EQUIPO [${device.mac.slice(-4)}]`);
      setCliente(device.meta?.cliente-full max-h-[92vh] flex flex-col p-5 sm:p-6 shadow-2xl space-y-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
       || 'Central Hospitalaria');
      setDepartamento(device.meta?.departamento || 'Esterilización');
      set>
        {/* Cabecera */}
        <div className="flex justify-between items-center border-UsuarioAsignado(device.meta?.usuario_asignado || '');
      setTipo(devTipo);
b border-cyan-500/20 pb-3 shrink-0">
          <div className="      setMarca(devMarca);
      setModelo(devModelo);
      setStarterMs(cfg.starterflex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-_ms || 1200);
      setMsg('');
    }
  }, [device]);

cyan-500/10 border border-cyan-500/30 text-cyan-4  // Cargar usuarios para el selector (con tolerancia user / usuario)
  useEffect(() => {
    if00">
              <Building2 className="w-5 h-5" />
            </div>
            <div> (isOpen) {
      supabase.from('usuarios_scada')
        .select('*')
        .
              <h3 className="font-bold text-white text-base">Asignación & Identidad dethen(({ data }) => {
          if (data) {
            setUsersList(data.map(u Máquina</h3>
              <p className="text-xs text-cyan-300">MAC: {device => ({
              usuario: u.user || u.usuario,
              nombre: u.nombre || u.user.mac}</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="text-slate-400 hover:text-white p-1"
          > || u.usuario,
              rol: u.rol || 'Operador'
            })));
          }

            <X className="w-5 h-5" />
          </button>
        </div>

                });
    }
  }, [isOpen]);

  if (!isOpen || !device || typeof document === '{msg && (
          <div className="p-3 bg-emerald-500/20 borderundefined') return null;

  const handleSave = async (e) => {
    e.preventDefault();
 border-emerald-500/40 text-emerald-300 rounded-xl flex items-center    setSaving(true);
    setMsg('');

    const cleanMac = device.mac.toUpperCase().replace gap-2 shrink-0">
            <CheckCircle2 className="w-4 h-4 shrink-0(/[:\-]/g, '');

    const configPayload = {
      tipo,
      marca,
      " />
            <span>{msg}</span>
          </div>
        )}

        <form onSubmit={handleSave}modelo,
      starter_ms: Number(starterMs)
    };

    const payload = {
       className="space-y-3 overflow-y-auto pr-1">
          
          {/* SELECCIÓN DE CATEGORÍAmac: cleanMac,
      alias: alias.trim(),
      cliente: cliente.trim(),
      modelo: modelo.trim(),
      departamento: departamento.trim(),
      usuario_asignado: usuarioAsign, MARCA Y MODELO */}
          <div className="p-3.5 bg-slate-950/90 rounded-xl border border-cyan-500/40 space-y-2.ado.trim() || null,
      config_deseada: configPayload,
      updated_at:5">
            <span className="text-cyan-400 font-bold block text- new Date().toISOString()
    };

    try {
      // 1. Guardar en Supabase Postgres[11px] uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-
      const { error } = await supabase
        .from('asignaciones_equipos')
        .ups3.5 h-3.5 text-amber-400" />
              1. Selección de Máert(payload, { onConflict: 'mac' });

      if (error) throw error;

      // quina & Comportamiento:
            </span>

            <div>
              <label className="block text-slate-32. Reconfigurar el ESP32 por MQTT para grabación en LittleFS
      if (sendCommand) {
        00 mb-1 font-bold">Tipo / Categoría de Máquina</label>
              <select
sendCommand(cleanMac, {
          cmd: 'APPLY_HAL_MAP',
          tipo,
                          value={tipo}
                onChange={(e) => handleTipoChange(e.target.value)}
                className="w-full bg-slate-900 border border-cyan-500/60 roundedmarca,
          modelo,
          starter_ms: Number(starterMs)
        });
        sendCommand(cleanMac, { cmd-lg p-2.5 text-cyan-300 font-bold text-sm focus:outline-: 'SET_META', ...payload });
      }

      // 3. Actualizar memoria local inmediata
none"
              >
                {tiposDisponibles.map((t) => (
                  <option key={t} value={t}>{t.replace('_', ' ')}</option>
                ))}
                    if (device.meta) {
        Object.assign(device.meta, payload);
        device.meta.tipo = tipo</select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-;
      }
      if (device.datos) {
        device.datos.tipo = tipo;
2 gap-2">
              <div>
                <label className="block text-slate-300 mb-      }

      setMsg('¡Equipo asignado y microcontrolador reconfigurado con éxito!');
      if1">Marca / Fabricante</label>
                <select
                  value={marca}
                  onChange={(e) => handleMarcaChange(e.target.value)}
                  className="w-full bg-slate-9 (onAssignmentUpdated) onAssignmentUpdated(payload);
      setTimeout(() => onClose(), 800);
    }00 border border-slate-700 rounded-lg p-2 text-white focus:outline-none catch (err) {
      setMsg('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div 
"
                >
                  {marcasDisponibles.map((m) => (
                    <option key={m} value={m}>{m.replace('_', ' ')}</option>
                  ))}
                </select>
      className="fixed inset-0 z-[99999] bg-black/85 backdrop-blur-md flex              </div>

              <div>
                <label className="block text-slate-300 mb-1">Modelo items-center justify-center p-3 font-mono text-xs select-none"
      onClick={onClose}
     Específico</label>
                <select
                  value={modelo}
                  onChange={(e) => set>
      <div 
        className="ultra-glass border-2 border-cyan-400/Modelo(e.target.value)}
                  className="w-full bg-slate-900 border border50 rounded-2xl max-w-lg w-full max-h-[92vh] flex flex-slate-700 rounded-lg p-2 text-cyan-200 focus:outline-none-col p-5 sm:p-6 shadow-2xl space-y-4 overflow-hidden"
 text-[11px]"
                >
                  {modelosDisponibles.map((mod) => (        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <
                    <option key={mod} value={mod}>{mod}</option>
                  ))}
                </select>div className="flex justify-between items-center border-b border-cyan-500/20 pb
              </div>
            </div>

            {tipo === 'VEHICULO' && (
              <div>
                -3 shrink-0">
          <div className="flex items-center gap-2.5">
            <label className="block text-slate-300 mb-1">Duración Pulso Arranque (ms<div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan)</label>
                <input
                  type="number"
                  step="100"
                  min="500-500/30 text-cyan-400">
              <Building2 className="w-"
                  max="3000"
                  value={starterMs}
                  onChange={(e) =>5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text- setStarterMs(e.target.value)}
                  className="w-full px-3 py-1.white text-base">Asignación & Identidad de Máquina</h3>
              <p className="text-xs5 bg-slate-900 border border-slate-700 rounded-lg text-amber-3 text-cyan-300">MAC: {device.mac}</p>
            </div>
          </div>
00 font-bold"
                />
              </div>
            )}
          </div>

          <div>
            <          <button 
            type="button" 
            onClick={onClose} 
            className="textlabel className="block text-slate-300 mb-1">Nombre / Alias del Equipo *</label>
            <-slate-400 hover:text-white p-1"
          >
            <X className="input
              type="text"
              required
              value={alias}
              onChange={(e) => setw-5 h-5" />
          </button>
        </div>

        {msg && (
          Alias(e.target.value)}
              placeholder="Ej: Ambulancia Móvil 1 / Quirófano<div className="p-3 bg-emerald-500/20 border border-emerald-50 Central"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg0/40 text-emerald-300 rounded-xl flex items-center gap-2 shrink-0 p-2.5 text-white font-sans focus:outline-none focus:border-cyan-400"
            />">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{
          </div>

          <div>
            <label className="block text-slate-300 mb-1">msg}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-Hospital / Clínica / Base Flota *</label>
            <input
              type="text"
              required3 overflow-y-auto pr-1">
          
          {/* SELECCIÓN DE CATEGORÍA, MARCA Y MODELO
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
               */}
          <div className="p-3.5 bg-slate-950/90 rounded-placeholder="Ej: Hospital Metropolitano"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white font-sans focus:outlinexl border border-cyan-500/40 space-y-2.5">
            <span className="text-cyan-400 font-bold block text-[11px] uppercase tracking-wider flex-none focus:border-cyan-400"
            />
          </div>

          <div>
            < items-center gap-1.5">
              <Sparkles className="w-3.5 h-3label className="block text-slate-300 mb-1">Operador Responsable</label>
            .5 text-amber-400" />
              1. Selección de Máquina & Comportamiento:<select
              value={usuarioAsignado}
              onChange={(e) => setUsuarioAsignado(e.target.value)}
              className="w-full bg-slate-900 border border-slate
            </span>

            <div>
              <label className="block text-slate-300 mb-1 font-bold">Tipo / Categoría de Máquina</label>
              <select
                value={tipo}
-700 rounded-lg p-2.5 text-cyan-300 focus:outline-none"
            >
              <option value="">-- Acceso Universal (Todos los autorizados) --</option>
                onChange={(e) => handleTipoChange(e.target.value)}
                className="w-full bg-slate-              {usersList.map((u) => {
                const uName = u.usuario || u.user900 border border-cyan-500/60 rounded-lg p-2.5 text-;
                return (
                  <option key={uName} value={uName}>
                    {u.nombre || uNamecyan-300 font-bold text-sm focus:outline-none"
              >
                {tiposDisponibles.map((t) => (
                  <option key={t} value={t}>{t} ({u.rol || 'Operador'})
                  </option>
                );
              })}
            </select>.replace('_', ' ')}</option>
                ))}
              </select>
            </div>

            <
          </div>

          <div className="pt-2 flex gap-2 shrink-0 border-t border-slate-800div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-300 mb-1">Marca / Fabricante</label>
                <select
                  value={marca}
                  onChange={(e) => handleMarcaChange(e.target">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all"
            >
              Cancelar
            </button>
            <.value)}
                  className="w-full bg-slate-900 border border-slate-70button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.0 rounded-lg p-2 text-white focus:outline-none font-bold"
                >
                  5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90 text{marcasDisponibles.map((m) => (
                    <option key={m} value={m-white rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-lg active}>{m.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Modelo Específico</label>
                <select
                  value={modelo}
                  onChange={(e) => setModelo(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-:scale-95 transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Reconfigurando...' : 'Guardar y Reconfigurar'}</span>
            700 rounded-lg p-2 text-cyan-200 focus:outline-none font-bold text-[11px]"
                >
                  {modelosDisponibles.map((mod) => (
                    </button>
          </div>
        </form>

      </div>
    </div>,
    document.body
  );
}
