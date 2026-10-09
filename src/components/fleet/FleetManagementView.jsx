import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../services/supabase';
import ClinicalTooltip from '../common/ClinicalTooltip';
import { CLINICAL_HELP } from '../../utils/clinicalDictionary';
import { 
  Building2, 
  Cpu, 
  Lightbulb, 
  RotateCcw, 
  CheckCircle2, 
  Settings,
  Car,
  Activity,
  Layers,
  Key,
  Zap,
  Volume2,
  Wrench,
  Search
} from 'lucide-react';

export default function FleetManagementView({ fleet, sendCommand, onSelectDevice }) {
  const [mac, setMac] = useState('');
  const [alias, setAlias] = useState('');
  const [cliente, setCliente] = useState('');
  const [tipo, setTipo] = useState('AUTOCLAVE');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [starterMs, setStarterMs] = useState(1200);

  // Catálogo dinámico desde Supabase
  const [catalogo, setCatalogo] = useState([]);
  const [selectedMacForTest, setSelectedMacForTest] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');

  const macList = Object.keys(fleet);

  // 1. Cargar catálogo de equipos desde Supabase
  useEffect(() => {
    const fetchCatalogo = async () => {
      try {
        const { data, error } = await supabase
          .from('catalogo_equipos')
          .select('tipo, marca, modelo')
          .eq('activo', true)
          .order('tipo', { ascending: true });
        if (!error && data) setCatalogo(data);
      } catch (e) {
        console.warn('Error cargando catálogo:', e);
      }
    };
    fetchCatalogo();
  }, []);

  // 2. Selectores en cascada derivados
  const tiposDisponibles = useMemo(() => {
    const s = new Set(catalogo.map(c => c.tipo));
    if (s.size === 0) return ['AUTOCLAVE', 'VEHICULO', 'CAMA_HOSPITALARIA', 'INCUBADORA', 'PLANTA_ELECTRICA', 'PLC_GENERICO'];
    return Array.from(s);
  }, [catalogo]);

  const marcasDisponibles = useMemo(() => {
    return Array.from(new Set(
      catalogo.filter(c => c.tipo === tipo).map(c => c.marca)
    ));
  }, [catalogo, tipo]);

  const modelosDisponibles = useMemo(() => {
    return catalogo
      .filter(c => c.tipo === tipo && c.marca === marca)
      .map(c => c.modelo);
  }, [catalogo, tipo, marca]);

  const handleTipoChange = (newTipo) => {
    setTipo(newTipo);
    const marcasForTipo = Array.from(new Set(catalogo.filter(c => c.tipo === newTipo).map(c => c.marca)));
    const firstMarca = marcasForTipo[0] || '';
    setMarca(firstMarca);
    const modelosForMarca = catalogo.filter(c => c.tipo === newTipo && c.marca === firstMarca).map(c => c.modelo);
    setModelo(modelosForMarca[0] || '');
  };

  const handleMarcaChange = (newMarca) => {
    setMarca(newMarca);
    const modelosForMarca = catalogo.filter(c => c.tipo === tipo && c.marca === newMarca).map(c => c.modelo);
    setModelo(modelosForMarca[0] || '');
  };

  // Seleccionar equipo de la lista para editar o probar
  const handleSelectToEdit = (deviceMac) => {
    setSelectedMacForTest(deviceMac);
    const dev = fleet[deviceMac];
    const cfg = dev?.meta?.config_deseada || {};

    const devTipo = cfg.tipo || dev?.meta?.tipo || dev?.datos?.tipo || 'AUTOCLAVE';
    const devMarca = cfg.marca || dev?.meta?.marca || '';
    const devModelo = cfg.modelo || dev?.meta?.modelo || '';

    setMac(deviceMac);
    setAlias(dev?.meta?.alias || `EQUIPO [${deviceMac.slice(-4)}]`);
    setCliente(dev?.meta?.cliente || 'Hospital Central');
    setTipo(devTipo);
    setMarca(devMarca);
    setModelo(devModelo);
    setStarterMs(cfg.starter_ms || 1200);
  };

  // Guardar configuración completa y propagar al ESP32
  const handleSaveDevice = async (e) => {
    e.preventDefault();
    const cleanMac = mac.trim().toUpperCase().replace(/[:\-]/g, '');
    if (cleanMac.length < 6) return alert('Dirección MAC no válida');

    setSubmitting(true);
    setMsg('');

    const configPayload = {
      tipo,
      marca,
      modelo: modelo.trim() || 'Estándar',
      starter_ms: Number(starterMs)
    };

    const metaPayload = {
      mac: cleanMac,
      alias: alias.trim() || `EQUIPO [${cleanMac.slice(-4)}]`,
      cliente: cliente.trim() || 'Central Hospitalaria',
      modelo: modelo.trim() || 'Estándar',
      config_deseada: configPayload,
      updated_at: new Date().toISOString()
    };

    try {
      // 1. Guardar en Supabase
      await supabase.from('asignaciones_equipos').upsert(metaPayload, { onConflict: 'mac' });

      // 2. Orden de Reconfiguración Dinámica al ESP32 (LittleFS)
      sendCommand(cleanMac, {
        cmd: 'APPLY_HAL_MAP',
        tipo,
        starter_ms: Number(starterMs)
      });

      // 3. Orden de actualización de metadatos
      sendCommand(cleanMac, { cmd: 'SET_META', ...metaPayload });

      setMsg(`¡Equipo [${cleanMac}] reconfigurado como [${tipo}] y sincronizado con éxito!`);
    } catch (err) {
      setMsg('Error guardando en Supabase: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Pruebas Físicas Dinámicas según el tipo
  const testRelay = (canal, val) => {
    if (!selectedMacForTest) return alert('Selecciona un equipo de la lista primero');
    sendCommand(selectedMacForTest, {
      cmd: 'SET_RELAY',
      canal,
      val
    });
  };

  const testBeep = () => {
    if (!selectedMacForTest) return alert('Selecciona un equipo de la lista primero');
    sendCommand(selectedMacForTest, { cmd: 'BEEP', ms: 250 });
  };

  const testPulseStarter = () => {
    if (!selectedMacForTest) return alert('Selecciona un equipo de la lista primero');
    testRelay(2, true);
    setTimeout(() => testRelay(2, false), starterMs);
  };

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-cyan-400" />
            Directorio & Asignación de Máquinas (Gestión Flota)
          </h2>
          <p className="text-xs text-slate-300 font-mono mt-0.5">
            Configura qué tipo de máquina es cada ESP32 (Autoclave, Vehículo, Cama o PLC) y prueba sus salidas físicas
          </p>
        </div>
      </div>

      {msg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{msg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* PANEL IZQUIERDO: CONFIGURADOR MAESTRO DEL EQUIPO */}
        <form onSubmit={handleSaveDevice} className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-3.5 font-mono text-xs">
          <div className="flex justify-between items-center border-b border-cyan-500/20 pb-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-400" />
              {selectedMacForTest ? `Configurar Hardware [${selectedMacForTest}]` : '+ Registrar y Asignar Equipo'}
            </h3>
            {tipo && (
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${
                tipo === 'VEHICULO' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-cyan-500/20 text-cyan-300 border-cyan-400'
              }`}>
                {tipo === 'VEHICULO' ? <Car className="w-3 h-3" /> : <Activity className="w-3 h-3" />}
                {tipo}
              </span>
            )}
          </div>

          <div>
            <label className="block text-slate-300 mb-1">Dirección MAC (Física del ESP32)</label>
            <input
              type="text"
              required
              value={mac}
              onChange={(e) => setMac(e.target.value)}
              placeholder="Ej: 244CABC731B7"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-bold focus:outline-none focus:border-cyan-400 uppercase"
            />
          </div>

          {/* SELECCIÓN MAESTRA DE TIPO, MARCA Y MODELO */}
          <div className="p-3 bg-slate-950/80 rounded-xl border border-cyan-500/30 space-y-2.5">
            <span className="text-cyan-400 font-bold block text-[11px] uppercase tracking-wider">
              1. Comportamiento & Tipo de Dispositivo:
            </span>

            <div>
              <label className="block text-slate-300 mb-1">Categoría / Tipo de Máquina</label>
              <select
                value={tipo}
                onChange={(e) => handleTipoChange(e.target.value)}
                className="w-full bg-slate-900 border border-cyan-500/50 rounded-lg p-2 text-cyan-300 focus:outline-none focus:border-cyan-400 font-bold"
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
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400"
                >
                  <option value="">-- Seleccionar Marca --</option>
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
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-cyan-200 focus:outline-none focus:border-cyan-400"
                >
                  <option value="">-- Seleccionar Modelo --</option>
                  {modelosDisponibles.map((mod) => (
                    <option key={mod} value={mod}>{mod}</option>
                  ))}
                </select>
              </div>
            </div>

            {tipo === 'VEHICULO' && (
              <div>
                <label className="block text-slate-300 mb-1">Duración Pulso Arranque / Starter (ms)</label>
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

          {/* DATOS DE SALA / CLIENTE */}
          <div>
            <label className="block text-slate-300 mb-1">Nombre / Alias del Equipo</label>
            <input
              type="text"
              required
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="Ej: Ambulancia Staria Móvil 1 / Quirófano A"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-1">Hospital / Clínica / Base Flota</label>
            <input
              type="text"
              required
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              placeholder="Ej: Hospital Metropolitano / Base Norte"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-400"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:opacity-90 text-white font-bold rounded-xl text-xs shadow-lg shadow-cyan-500/20"
          >
            {submitting ? 'Reconfigurando Microcontrolador...' : '⚡ GUARDAR Y APLICAR COMPORTAMIENTO AL DISPOSITIVO'}
          </button>

          {/* PRUEBAS DE HARDWARE EN VIVO ADAPTATIVAS */}
          {selectedMacForTest && (
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <span className="text-[11px] text-amber-300 block font-bold uppercase">
                Pruebas Físicas en Directo [{selectedMacForTest}] ({tipo}):
              </span>
              
              {tipo === 'VEHICULO' ? (
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => testRelay(1, true)}
                    className="py-2 bg-slate-800 hover:bg-slate-700 border border-amber-500/40 text-amber-300 rounded-lg font-bold flex items-center justify-center gap-1"
                  >
                    <Key className="w-3.5 h-3.5" />
                    <span>Ignición ON</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => testRelay(1, false)}
                    className="py-2 bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-400 rounded-lg font-bold"
                  >
                    Ignición OFF
                  </button>
                  <button
                    type="button"
                    onClick={testPulseStarter}
                    className="py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 rounded-lg font-bold flex items-center justify-center gap-1"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Pulso Starter</span>
                  </button>
                </div>
              ) : tipo === 'AUTOCLAVE' ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => testRelay(1, true)}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-cyan-500/40 text-cyan-300 rounded-lg flex items-center justify-center gap-1.5"
                  >
                    <Lightbulb className="w-3.5 h-3.5" />
                    <span>Motor (Relé 1)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => sendCommand(selectedMacForTest, { cmd: 'RESET_ALARMA' })}
                    className="w-full py-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 rounded-lg flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Alarma</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => testRelay(r, true)}
                      className="py-1.5 bg-slate-900 border border-slate-700 text-cyan-300 rounded text-[10px] font-bold hover:bg-slate-800"
                    >
                      R{r} ON
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </form>

        {/* PANEL DERECHO: LISTA DE EQUIPOS EN LA RED */}
        <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 flex flex-col justify-between font-mono text-xs">
          <div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-bold text-white">Equipos en la Red ({macList.length})</h3>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">Toca cualquier equipo para editar su tipo, marca o probar sus relés:</p>

            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {macList.length === 0 ? (
                <div className="p-6 text-center text-slate-400">
                  Esperando que los equipos transmitan por RJ45...
                </div>
              ) : (
                macList.map((m) => {
                  const dev = fleet[m];
                  const isOnline = Date.now() - (dev?.lastSeen || 0) < 18000;
                  const isSelected = selectedMacForTest === m;

                  const devTipo = (
                    dev?.meta?.config_deseada?.tipo || 
                    dev?.meta?.tipo || 
                    dev?.datos?.tipo || 
                    'AUTOCLAVE'
                  ).toUpperCase();

                  const isVeh = devTipo === 'VEHICULO';

                  return (
                    <div
                      key={m}
                      onClick={() => handleSelectToEdit(m)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                        isSelected 
                          ? 'bg-cyan-950/60 border-cyan-400 shadow-md shadow-cyan-500/20' 
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{dev?.meta?.alias || `EQUIPO [${m.slice(-4)}]`}</span>
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border flex items-center gap-1 ${
                            isVeh 
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                              : 'bg-cyan-500/20 text-cyan-300 border-cyan-400'
                          }`}>
                            {isVeh ? <Car className="w-2.5 h-2.5" /> : <Activity className="w-2.5 h-2.5" />}
                            {devTipo}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {dev?.meta?.cliente || 'Hospital Central'} • MAC: {m} • {dev?.meta?.modelo || 'Estándar'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[9px] border ${
                          isOnline ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        }`}>
                          {isOnline ? 'ONLINE' : 'OFFLINE'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onSelectDevice(m); }}
                          className="p-1.5 rounded-lg bg-slate-800 text-cyan-300 hover:text-white"
                          title="Entrar a Cabina / Dashboard"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
