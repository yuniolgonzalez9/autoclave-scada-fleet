import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { 
  Building2, 
  Cpu, 
  CheckCircle2, 
  Settings,
  Car,
  Activity,
  Zap,
  Wrench,
  Sparkles,
  Layers,
  Network,
  Sliders,
  ShieldAlert,
  HelpCircle,
  Plus,
  Trash2
} from 'lucide-react';

// CATÁLOGO MAESTRO EMBEBIDO DE MÁQUINAS CLÍNICAS Y FLOTA
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

// PLACAS PRE-FABRICADAS COMERCIALES CON ESQUEMÁTICO CONOCIDO
const PLACAS_PREFABRICADAS = {
  HKL_EA8: {
    nombre: 'Hankerila HKL-EA8 Industrial',
    desc: 'ESP32 16MB + Ethernet LAN8720 + I2C (0x24 Relés, 0x26 Opto, 0x48 ADC ADS1115)',
    uplink: 'ETHERNET_LAN8720',
    sda: 4,
    scl: 5,
    reles: 8,
    entradas: 8,
    adc: 4
  },
  KINCONY_A8: {
    nombre: 'Kincony KC868-A8 PLC',
    desc: 'ESP32 + Ethernet LAN8720 + RS485 + 8 Relés Directos + 8 Entradas Opto',
    uplink: 'ETHERNET_LAN8720',
    sda: 4,
    scl: 15,
    reles: 8,
    entradas: 8,
    adc: 4
  },
  OLIMEX_EVB: {
    nombre: 'Olimex ESP32-EVB Gateway',
    desc: 'ESP32 + Ethernet LAN8720 + 2 Relés 10A + Bus CAN + Ranura MicroSD',
    uplink: 'ETHERNET_LAN8720',
    sda: 13,
    scl: 16,
    reles: 2,
    entradas: 2,
    adc: 2
  },
  LILYGO_T_RELAY: {
    nombre: 'LilyGO T-Relay 8 Canales',
    desc: 'ESP32 WiFi/BLE + 8 Relés Optoacoplados Directos',
    uplink: 'WIFI',
    sda: 21,
    scl: 22,
    reles: 8,
    entradas: 4,
    adc: 2
  },
  GENERIC_DEVKIT: {
    nombre: 'ESP32 DevKit Genérico / Custom',
    desc: 'Placa estándar de 30 o 38 pines con conexionado libre de taller',
    uplink: 'WIFI',
    sda: 21,
    scl: 22,
    reles: 4,
    entradas: 4,
    adc: 2
  }
};

export default function FleetManagementView({ fleet, sendCommand, onSelectDevice }) {
  const [mac, setMac] = useState('');
  const [alias, setAlias] = useState('');
  const [cliente, setCliente] = useState('');

  // 1. Selección de Modalidad de Hardware
  const [modoHardware, setModoHardware] = useState('PREFABRICADO'); // 'PREFABRICADO' o 'LIBRE_DIY'
  const [placaPrefabricada, setPlacaPrefabricada] = useState('HKL_EA8');

  // 2. Parámetros para Modo Libre / Genérico (DIY)
  const [uplinkLibre, setUplinkLibre] = useState('ETHERNET_LAN8720'); // 'ETHERNET_LAN8720', 'ETHERNET_W5500', 'WIFI'
  const [pinSda, setPinSda] = useState(21);
  const [pinScl, setPinScl] = useState(22);
  const [pinesLibres, setPinesLibres] = useState([
    { gpio: 2, rol: 'SALIDA_DIGITAL', nombre: 'Relé Principal 1' },
    { gpio: 4, rol: 'SALIDA_DIGITAL', nombre: 'Relé Principal 2' },
    { gpio: 15, rol: 'ENTRADA_PULLUP', nombre: 'Sensor de Puerta' },
    { gpio: 34, rol: 'ADC_ANALOGICO', nombre: 'Transductor Presión 0-3.3V' }
  ]);

  // 3. Máquina e Identidad
  const [tipo, setTipo] = useState('VEHICULO');
  const [marca, setMarca] = useState('HYUNDAI');
  const [modelo, setModelo] = useState('Staria Ambulancia / Van');
  const [starterMs, setStarterMs] = useState(1200);

  const [selectedMacForTest, setSelectedMacForTest] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');

  const macList = Object.keys(fleet);

  // Derivación de opciones del catálogo de máquinas
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

  // Cargar equipo de la lista al tocarlo
  const handleSelectToEdit = (deviceMac) => {
    setSelectedMacForTest(deviceMac);
    const dev = fleet[deviceMac];
    const cfg = dev?.meta?.config_deseada || {};

    setMac(deviceMac);
    setAlias(dev?.meta?.alias || `EQUIPO [${deviceMac.slice(-4)}]`);
    setCliente(dev?.meta?.cliente || 'Central Hospitalaria');

    // Cargar modo de hardware si existía
    if (cfg.modo_hardware) setModoHardware(cfg.modo_hardware);
    if (cfg.placa_prefabricada) setPlacaPrefabricada(cfg.placa_prefabricada);
    if (cfg.pines_libres) setPinesLibres(cfg.pines_libres);

    const devTipo = cfg.tipo || dev?.meta?.tipo || dev?.datos?.tipo || 'VEHICULO';
    const devMarca = cfg.marca || dev?.meta?.marca || 'HYUNDAI';
    const devModelo = cfg.modelo || dev?.meta?.modelo || 'Staria Ambulancia / Van';

    setTipo(devTipo);
    setMarca(devMarca);
    setModelo(devModelo);
    setStarterMs(cfg.starter_ms || 1200);
  };

  // Agregar pin a la lista libre DIY
  const handleAddPinLibre = () => {
    setPinesLibres([
      ...pinesLibres,
      { gpio: 25, rol: 'SALIDA_DIGITAL', nombre: `Salida GPIO 25` }
    ]);
  };

  const handleRemovePinLibre = (index) => {
    setPinesLibres(pinesLibres.filter((_, i) => i !== index));
  };

  // GUARDAR PROVISIÓN DE HARDWARE Y PROPAGAR AL ESP32
  const handleSaveDevice = async (e) => {
    e.preventDefault();
    const cleanMac = mac.trim().toUpperCase().replace(/[:\-]/g, '');
    if (cleanMac.length < 6) return alert('Dirección MAC no válida');

    setSubmitting(true);
    setMsg('');

    // Estructura completa de aprovisionamiento
    const configPayload = {
      modo_hardware: modoHardware,
      placa_prefabricada: modoHardware === 'PREFABRICADO' ? placaPrefabricada : null,
      uplink_red: modoHardware === 'PREFABRICADO' ? PLACAS_PREFABRICADAS[placaPrefabricada]?.uplink : uplinkLibre,
      i2c_sda: modoHardware === 'PREFABRICADO' ? PLACAS_PREFABRICADAS[placaPrefabricada]?.sda : Number(pinSda),
      i2c_scl: modoHardware === 'PREFABRICADO' ? PLACAS_PREFABRICADAS[placaPrefabricada]?.scl : Number(pinScl),
      pines_libres: modoHardware === 'LIBRE_DIY' ? pinesLibres : [],
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
      // 1. Guardar en Supabase asignaciones_equipos
      await supabase.from('asignaciones_equipos').upsert(metaPayload, { onConflict: 'mac' });

      // 2. Orden directa de aprovisionamiento de silicio al ESP32 por MQTT
      sendCommand(cleanMac, {
        cmd: 'APPLY_HARDWARE_PROVISION',
        provision: configPayload
      });

      // 3. Actualizar metadatos
      sendCommand(cleanMac, { cmd: 'SET_META', ...metaPayload });

      // 4. Actualizar memoria local de la web
      if (fleet[cleanMac]) {
        fleet[cleanMac].meta = Object.assign(fleet[cleanMac].meta || {}, metaPayload);
        if (!fleet[cleanMac].datos) fleet[cleanMac].datos = {};
        fleet[cleanMac].datos.tipo = tipo;
      }

      setMsg(`¡Hardware [${cleanMac}] aprovisionado con éxito en modo [${modoHardware === 'PREFABRICADO' ? PLACAS_PREFABRICADAS[placaPrefabricada]?.nombre : 'Placa Libre DIY'}]!`);
    } catch (err) {
      setMsg('Error guardando en Supabase: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 font-mono text-xs">
      
      {/* Cabecera */}
      <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-cyan-400" />
            Centro de Provisión de Hardware & Gestión de Flota
          </h2>
          <p className="text-xs text-slate-300 mt-0.5 font-sans">
            Configura placas comerciales pre-fabricadas (HKL-EA8, Kincony, etc.) o mapea desde cero cualquier ESP32 libre pin a pin antes de operar.
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
        
        {/* PANEL IZQUIERDO: FORMULARIO DE APROVISIONAMIENTO MAESTRO */}
        <form onSubmit={handleSaveDevice} className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-4">
          <div className="flex justify-between items-center border-b border-cyan-500/20 pb-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-400" />
              {selectedMacForTest ? `Aprovisionar Hardware [${selectedMacForTest}]` : '+ Registrar y Configurar Dispositivo'}
            </h3>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${
              tipo === 'VEHICULO' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-cyan-500/20 text-cyan-300 border-cyan-400'
            }`}>
              {tipo === 'VEHICULO' ? <Car className="w-3 h-3" /> : <Activity className="w-3 h-3" />}
              {tipo}
            </span>
          </div>

          <div>
            <label className="block text-slate-300 mb-1">Dirección MAC Física del Dispositivo</label>
            <input
              type="text"
              required
              value={mac}
              onChange={(e) => setMac(e.target.value)}
              placeholder="Ej: 244CABC731B7"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-bold focus:outline-none focus:border-cyan-400 uppercase"
            />
          </div>

          {/* ========================================================================= */}
          {/* SECCIÓN 1: SELECCIÓN DE MODALIDAD (PRE-FABRICADO vs LIBRE DIY)            */}
          {/* ========================================================================= */}
          <div className="p-3.5 bg-slate-950/90 rounded-xl border border-cyan-500/40 space-y-3">
            <span className="text-cyan-400 font-bold block text-[11px] uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-amber-400" />
              1. Modalidad de Hardware:
            </span>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setModoHardware('PREFABRICADO')}
                className={`py-2 px-3 rounded-xl border font-bold text-xs flex flex-col items-center gap-1 transition-all ${
                  modoHardware === 'PREFABRICADO'
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400 shadow-lg shadow-cyan-500/20'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Cpu className="w-4 h-4" />
                <span>Placa Pre-fabricada</span>
                <span className="text-[9px] font-normal text-slate-400">(HKL-EA8, Kincony, etc.)</span>
              </button>

              <button
                type="button"
                onClick={() => setModoHardware('LIBRE_DIY')}
                className={`py-2 px-3 rounded-xl border font-bold text-xs flex flex-col items-center gap-1 transition-all ${
                  modoHardware === 'LIBRE_DIY'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-400 shadow-lg shadow-amber-500/20'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Wrench className="w-4 h-4" />
                <span>Placa Libre / DIY</span>
                <span className="text-[9px] font-normal text-slate-400">(Mapeo Pin a Pin de Cero)</span>
              </button>
            </div>

            {/* CASO A: SI ES PLACA PRE-FABRICADA */}
            {modoHardware === 'PREFABRICADO' ? (
              <div className="space-y-2 pt-1 border-t border-slate-800">
                <label className="text-slate-300 block mb-1">Modelo de Placa Comercial</label>
                <select
                  value={placaPrefabricada}
                  onChange={(e) => setPlacaPrefabricada(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-cyan-300 font-bold"
                >
                  {Object.keys(PLACAS_PREFABRICADAS).map((k) => (
                    <option key={k} value={k}>{PLACAS_PREFABRICADAS[k].nombre}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                  ℹ️ {PLACAS_PREFABRICADAS[placaPrefabricada]?.desc}
                </p>
              </div>
            ) : (
              /* CASO B: SI ES PLACA LIBRE / DIY */
              <div className="space-y-3 pt-1 border-t border-slate-800">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="text-slate-300 block mb-1">Uplink Red</label>
                    <select
                      value={uplinkLibre}
                      onChange={(e) => setUplinkLibre(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-amber-300 text-[11px]"
                    >
                      <option value="ETHERNET_LAN8720">Ethernet LAN8720 (RMII)</option>
                      <option value="ETHERNET_W5500">Ethernet W5500 (SPI)</option>
                      <option value="WIFI">Conexión WiFi 2.4GHz</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-300 block mb-1">Pin I2C SDA</label>
                    <input
                      type="number"
                      value={pinSda}
                      onChange={(e) => setPinSda(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-white text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="text-slate-300 block mb-1">Pin I2C SCL</label>
                    <input
                      type="number"
                      value={pinScl}
                      onChange={(e) => setPinScl(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-white text-[11px]"
                    />
                  </div>
                </div>

                {/* Asignación Pin por Pin de GPIOs nativos */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-amber-400 font-bold text-[10px] uppercase">
                      Pines GPIO Declarados ({pinesLibres.length}):
                    </span>
                    <button
                      type="button"
                      onClick={handleAddPinLibre}
                      className="px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded text-[10px] font-bold border border-amber-500/40 flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Agregar Pin</span>
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {pinesLibres.map((pinItem, idx) => (
                      <div key={idx} className="p-2 bg-slate-900 rounded-lg border border-slate-800 flex items-center gap-2">
                        <div className="w-20">
                          <span className="text-[9px] text-slate-400 block">GPIO</span>
                          <input
                            type="number"
                            value={pinItem.gpio}
                            onChange={(e) => {
                              const next = [...pinesLibres];
                              next[idx].gpio = Number(e.target.value);
                              setPinesLibres(next);
                            }}
                            className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-white text-xs"
                          />
                        </div>

                        <div className="w-32">
                          <span className="text-[9px] text-slate-400 block">Rol del Pin</span>
                          <select
                            value={pinItem.rol}
                            onChange={(e) => {
                              const next = [...pinesLibres];
                              next[idx].rol = e.target.value;
                              setPinesLibres(next);
                            }}
                            className="w-full bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-cyan-300 text-[10px]"
                          >
                            <option value="SALIDA_DIGITAL">Salida Digital (Relé)</option>
                            <option value="ENTRADA_PULLUP">Entrada Digital</option>
                            <option value="ADC_ANALOGICO">Entrada ADC</option>
                            <option value="PWM_MOTOR">Salida PWM</option>
                            <option value="ONE_WIRE">Bus 1-Wire</option>
                          </select>
                        </div>

                        <div className="flex-1">
                          <span className="text-[9px] text-slate-400 block">Nombre del Componente</span>
                          <input
                            type="text"
                            value={pinItem.nombre}
                            onChange={(e) => {
                              const next = [...pinesLibres];
                              next[idx].nombre = e.target.value;
                              setPinesLibres(next);
                            }}
                            placeholder="Ej: Electroválvula Llenado"
                            className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-white text-xs"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemovePinLibre(idx)}
                          className="text-slate-500 hover:text-rose-400 p-1 mt-3"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* SECCIÓN 2: IDENTIDAD CLÍNICA / VEHICULAR (TIPO, MARCA Y MODELO)           */}
          {/* ========================================================================= */}
          <div className="p-3.5 bg-slate-950/90 rounded-xl border border-cyan-500/40 space-y-3">
            <span className="text-cyan-400 font-bold block text-[11px] uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              2. Comportamiento & Perfil de Máquina:
            </span>

            <div>
              <label className="block text-slate-300 mb-1 font-bold">Tipo / Categoría de Dispositivo</label>
              <select
                value={tipo}
                onChange={(e) => handleTipoChange(e.target.value)}
                className="w-full bg-slate-900 border border-cyan-500/60 rounded-lg p-2 text-cyan-300 font-bold text-xs"
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
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-xs"
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
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-cyan-200 text-xs"
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

          {/* DATOS DE SALA / CLIENTE */}
          <div>
            <label className="block text-slate-300 mb-1">Nombre / Alias del Equipo</label>
            <input
              type="text"
              required
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="Ej: Ambulancia Staria Móvil 1 / Quirófano A"
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
            {submitting ? 'Aprovisionando Silicio en el ESP32...' : '⚡ APROVISIONAR HARDWARE Y APLICAR AL DISPOSITIVO'}
          </button>
        </form>

        {/* PANEL DERECHO: EQUIPOS EN LA RED */}
        <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-white mb-2">Equipos Encontrados en la Red ({macList.length})</h3>
            <p className="text-[11px] text-slate-400 mb-3">Toca cualquier equipo para asignarle su modalidad o abrir su cabina:</p>

            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
              {macList.length === 0 ? (
                <div className="p-6 text-center text-slate-400">
                  Esperando que los equipos transmitan por red...
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

                  const devModo = dev?.meta?.config_deseada?.modo_hardware || 'PREFABRICADO';
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
                          <span className="text-[8px] px-1 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                            {devModo === 'PREFABRICADO' ? 'COMERCIAL' : 'DIY LIBRE'}
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
                          title="Entrar al Dashboard de este equipo"
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
