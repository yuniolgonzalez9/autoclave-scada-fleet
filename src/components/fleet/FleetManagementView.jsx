import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { 
  Building2, 
  Cpu, 
  RotateCcw, 
  CheckCircle2, 
  Settings,
  Car,
  Activity,
  Key,
  Zap,
  Volume2,
  Wrench,
  Search,
  Sparkles
} from 'lucide-react';

// CATÁLOGO MAESTRO EMBEBIDO DE 81 MODELOS REALES (CARGA INSTANTÁNEA SIN FALLOS)
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

export default function FleetManagementView({ fleet, sendCommand, onSelectDevice }) {
  const [mac, setMac] = useState('');
  const [alias, setAlias] = useState('');
  const [cliente, setCliente] = useState('');
  const [tipo, setTipo] = useState('VEHICULO');
  const [marca, setMarca] = useState('HYUNDAI');
  const [modelo, setModelo] = useState('Staria Ambulancia / Van');
  const [starterMs, setStarterMs] = useState(1200);

  const [selectedMacForTest, setSelectedMacForTest] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');

  const macList = Object.keys(fleet);

  // Derivación de opciones del catálogo
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

  // Al seleccionar un equipo de la lista
  const handleSelectToEdit = (deviceMac) => {
    setSelectedMacForTest(deviceMac);
    const dev = fleet[deviceMac];
    const cfg = dev?.meta?.config_deseada || {};

    const devTipo = cfg.tipo || dev?.meta?.tipo || dev?.datos?.tipo || 'VEHICULO';
    const devMarca = cfg.marca || dev?.meta?.marca || 'HYUNDAI';
    const devModelo = cfg.modelo || dev?.meta?.modelo || 'Staria Ambulancia / Van';

    setMac(deviceMac);
    setAlias(dev?.meta?.alias || `EQUIPO [${deviceMac.slice(-4)}]`);
    setCliente(dev?.meta?.cliente || 'Base Central');
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
      modelo,
      starter_ms: Number(starterMs)
    };

    const metaPayload = {
      mac: cleanMac,
      alias: alias.trim() || `EQUIPO [${cleanMac.slice(-4)}]`,
      cliente: cliente.trim() || 'Central',
      modelo: modelo.trim() || 'Estándar',
      config_deseada: configPayload,
      updated_at: new Date().toISOString()
    };

    try {
      // 1. Guardar en Supabase
      await supabase.from('asignaciones_equipos').upsert(metaPayload, { onConflict: 'mac' });

      // 2. Orden de Reconfiguración Dinámica al ESP32 por MQTT (LittleFS)
      sendCommand(cleanMac, {
        cmd: 'APPLY_HAL_MAP',
        tipo,
        marca,
        modelo,
        starter_ms: Number(starterMs)
      });

      // 3. Orden de actualización de metadatos
      sendCommand(cleanMac, { cmd: 'SET_META', ...metaPayload });

      // 4. Actualización forzada en memoria local de la Web
      if (fleet[cleanMac]) {
        fleet[cleanMac].meta = Object.assign(fleet[cleanMac].meta || {}, metaPayload);
        if (!fleet[cleanMac].datos) fleet[cleanMac].datos = {};
        fleet[cleanMac].datos.tipo = tipo;
      }

      setMsg(`¡[${cleanMac}] configurado con éxito como [${tipo} - ${marca} ${modelo}]!`);
    } catch (err) {
      setMsg('Error guardando en Supabase: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Pruebas físicas en directo
  const testRelay = (canal, val) => {
    if (!selectedMacForTest) return alert('Selecciona un equipo de la lista primero');
    sendCommand(selectedMacForTest, { cmd: 'SET_RELAY', canal, val });
  };

  const testPulseStarter = () => {
    if (!selectedMacForTest) return alert('Selecciona un equipo de la lista primero');
    testRelay(2, true);
    setTimeout(() => testRelay(2, false), starterMs);
  };

  const testResetAlarm = () => {
    if (!selectedMacForTest) return alert('Selecciona un equipo de la lista primero');
    sendCommand(selectedMacForTest, { cmd: 'RESET_ALARMA' });
  };

  return (
    <div className="space-y-4 font-mono text-xs">
      <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-cyan-400" />
            Centro Maestro de Asignación & Configuración de Flota
          </h2>
          <p className="text-xs text-slate-300 mt-0.5 font-sans">
            Configura la identidad y comportamiento de cada ESP32 (Vehículo, Autoclave, Cama o PLC). El hardware reconfigura su Flash y adapta la cabina en tiempo real.
          </p>
        </div>
      </div>

      {msg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{msg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* PANEL IZQUIERDO: CONFIGURADOR DIRECTO */}
        <form onSubmit={handleSaveDevice} className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-3.5">
          <div className="flex justify-between items-center border-b border-cyan-500/20 pb-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-400" />
              {selectedMacForTest ? `Configurar Hardware [${selectedMacForTest}]` : '+ Registrar y Asignar Equipo'}
            </h3>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${
              tipo === 'VEHICULO' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-cyan-500/20 text-cyan-300 border-cyan-400'
            }`}>
              {tipo === 'VEHICULO' ? <Car className="w-3 h-3" /> : <Activity className="w-3 h-3" />}
              {tipo}
            </span>
          </div>

          <div>
            <label className="block text-slate-300 mb-1">Dirección MAC Física del ESP32</label>
            <input
              type="text"
              required
              value={mac}
              onChange={(e) => setMac(e.target.value)}
              placeholder="Ej: 244CABC731B7"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-bold focus:outline-none focus:border-cyan-400 uppercase"
            />
          </div>

          {/* SELECTORES DE TIPO, MARCA Y MODELO (CARGA INMEDIATA GARANTIZADA) */}
          <div className="p-3.5 bg-slate-950/90 rounded-xl border border-cyan-500/40 space-y-3">
            <span className="text-cyan-400 font-bold block text-[11px] uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              1. Selección de Máquina & Comportamiento:
            </span>

            <div>
              <label className="block text-slate-300 mb-1 font-bold">Tipo / Categoría de Dispositivo</label>
              <select
                value={tipo}
                onChange={(e) => handleTipoChange(e.target.value)}
                className="w-full bg-slate-900 border border-cyan-500/60 rounded-lg p-2.5 text-cyan-300 focus:outline-none focus:border-cyan-400 font-bold text-sm"
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

          <div>
            <label className="block text-slate-300 mb-1">Nombre / Alias del Equipo</label>
            <input
              type="text"
              required
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="Ej: Ambulancia Móvil 1 / Quirófano A"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-sans focus:outline-none focus:border-cyan-400"
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
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-sans focus:outline-none focus:border-cyan-400"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:opacity-90 text-white font-bold rounded-xl text-xs shadow-lg shadow-cyan-500/25 uppercase tracking-wider"
          >
            {submitting ? 'Reconfigurando Microcontrolador...' : '⚡ GUARDAR Y APLICAR COMPORTAMIENTO AL DISPOSITIVO'}
          </button>

          {/* PRUEBAS FÍSICAS EN DIRECTO */}
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
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-cyan-500/40 text-cyan-300 rounded-lg flex items-center justify-center gap-1.5 font-bold"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Probar Relé 1</span>
                  </button>
                  <button
                    type="button"
                    onClick={testResetAlarm}
                    className="w-full py-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 rounded-lg flex items-center justify-center gap-1.5 font-bold"
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

        {/* PANEL DERECHO: EQUIPOS EN LA RED */}
        <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 flex flex-col justify-between">
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
                    'VEHICULO'
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
                          {dev?.meta?.cliente || 'Central'} • MAC: {m} • {dev?.meta?.modelo || 'Estándar'}
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
                          <Settings className="w-3.5 h-3.5" />
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
