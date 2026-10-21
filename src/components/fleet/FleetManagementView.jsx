import React, { useState, useMemo } from 'react';
import { supabase } from '../../services/supabase';
import { 
  Building2, 
  Search, 
  Cpu, 
  Plus, 
  Trash2, 
  Send, 
  CheckCircle2, 
  Activity, 
  Car, 
  Flame, 
  Layers, 
  ExternalLink,
  RefreshCw,
  Sliders,
  ShieldCheck,
  Radio,
  Wrench
} from 'lucide-react';

// Perfiles de hardware comercial preconfigurados
const PERFILES_HARDWARE = [
  { id: 'HKL-EA8', nombre: 'Hankerila HKL-EA8 (8 Relés 0x24 / 8 Entradas 0x26 / ADS1115)', tipoDefault: 'AUTOCLAVE' },
  { id: 'KC868-A8', nombre: 'Kincony KC868-A8 Industrial (8 Relés / Ethernet RJ45)', tipoDefault: 'UNIVERSAL_PLC' },
  { id: 'OLIMEX-EVB', nombre: 'Olimex ESP32-EVB (2 Relés / CAN-Bus / Ethernet)', tipoDefault: 'VEHICULO' },
  { id: 'LILYGO-TRELAY', nombre: 'LilyGO T-Relay (4/8 Canales Optoacoplados)', tipoDefault: 'UNIVERSAL_PLC' },
  { id: 'GENERIC-DIY', nombre: 'Genérico ESP32 NodeMCU (Mapeo Libre GPIO)', tipoDefault: 'AUTOCLAVE' }
];

export default function FleetManagementView({ fleet = {}, sendCommand, onSelectDevice, onOpenReports }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('ALL');

  // Formulario para dar de alta nuevo hardware
  const [newMac, setNewMac] = useState('');
  const [newAlias, setNewAlias] = useState('');
  const [newCliente, setNewCliente] = useState('');
  const [newTipo, setNewTipo] = useState('AUTOCLAVE');
  const [newPerfilHw, setNewPerfilHw] = useState('HKL-EA8');
  
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const macList = useMemo(() => Object.keys(fleet || {}), [fleet]);

  // Lista filtrada
  const filteredDevices = useMemo(() => {
    return macList.map(mac => fleet[mac]).filter(dev => {
      if (!dev) return false;
      const dTipo = (dev.meta?.tipo || dev.datos?.tipo || 'AUTOCLAVE').toUpperCase();
      if (filterCategory !== 'ALL' && dTipo !== filterCategory) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchMac = (dev.mac || '').toLowerCase().includes(q);
        const matchAlias = (dev.meta?.alias || '').toLowerCase().includes(q);
        const matchCliente = (dev.meta?.cliente || '').toLowerCase().includes(q);
        return matchMac || matchAlias || matchCliente;
      }
      return true;
    });
  }, [macList, fleet, filterCategory, searchTerm]);

  // Manejador de alta y provisión
  const handleProvisionDevice = async (e) => {
    e.preventDefault();
    setMsg('');
    setErrorMsg('');

    const cleanMac = newMac.toUpperCase().replace(/[:\-]/g, '').trim();
    if (cleanMac.length < 6) {
      setErrorMsg('Introduce una dirección MAC válida (ej. 246F28XXXXXX).');
      return;
    }

    setSubmitting(true);

    const payload = {
      mac: cleanMac,
      alias: (newAlias || `EQUIPO [${cleanMac.slice(-4)}]`).trim(),
      cliente: (newCliente || 'Central Hospitalaria').trim(),
      tipo: newTipo,
      hardware_rev: newPerfilHw,
      config_deseada: {
        tipo: newTipo,
        hardware_rev: newPerfilHw,
        alerta_pct: 80,
        lim_mant: 200,
        sp_temp: 121.0
      },
      updated_at: new Date().toISOString()
    };

    try {
      // 1. Guardar en Supabase
      const { error } = await supabase
        .from('asignaciones_equipos')
        .upsert(payload, { onConflict: 'mac' });

      if (error) throw error;

      // 2. Transmitir provisión remota por MQTT
      if (sendCommand) {
        sendCommand(cleanMac, {
          cmd: 'APPLY_HARDWARE_PROVISION',
          mac: cleanMac,
          alias: payload.alias,
          cliente: payload.cliente,
          tipo: newTipo,
          hardware_rev: newPerfilHw
        });
      }

      setMsg(`¡Equipo [${cleanMac}] aprovisionado y registrado con éxito en la nube!`);
      setNewMac('');
      setNewAlias('');
      setNewCliente('');
    } catch (err) {
      setErrorMsg('Error de provisión: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Eliminar equipo del inventario
  const handleDeleteDevice = async (mac, alias) => {
    if (!confirm(`¿Eliminar definitivamente el equipo "${alias || mac}" de la base de datos?`)) return;

    try {
      const { error } = await supabase
        .from('asignaciones_equipos')
        .delete()
        .eq('mac', mac);

      if (error) throw error;
      setMsg(`Equipo [${mac}] eliminado.`);
    } catch (err) {
      alert('Error eliminando: ' + err.message);
    }
  };

  return (
    <div className="space-y-4 font-mono text-xs select-none">
      
      {/* Cabecera */}
      <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-cyan-400" />
            Directorio & Aprovisionamiento de Flota
          </h2>
          <p className="text-xs text-slate-300 font-sans mt-0.5">
            Alta física de microcontroladores por MAC, mapeo de silicio y vinculación hospitalaria
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onOpenReports && (
            <button
              type="button"
              onClick={onOpenReports}
              className="px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold flex items-center gap-1.5"
            >
              <Wrench className="w-3.5 h-3.5" />
              Reportes técnicos
            </button>
          )}
          <span className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-cyan-300 font-bold">
            Total en Red: {macList.length}
          </span>
        </div>
      </div>

      {msg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{msg}</span>
          </div>
          <button onClick={() => setMsg('')} className="text-emerald-400 font-bold">X</button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg('')} className="text-rose-400 font-bold">X</button>
        </div>
      )}

      {/* FORMULARIO DE ALTA Y PROVISIÓN */}
      <form onSubmit={handleProvisionDevice} className="ultra-glass p-5 rounded-2xl border border-amber-500/30 space-y-4">
        <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2 border-b border-amber-500/20 pb-2">
          <Plus className="w-4 h-4 text-amber-400" />
          Aprovisionar Nueva Placa Microcontroladora (ESP32)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="block text-slate-300 mb-1">Dirección MAC *</label>
            <input
              type="text"
              required
              value={newMac}
              onChange={(e) => setNewMac(e.target.value)}
              placeholder="Ej: A0B1C2D3E4F5"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-bold uppercase focus:outline-none focus:border-amber-400"
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-1">Nombre / Alias del Equipo</label>
            <input
              type="text"
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
              placeholder="Ej: Autoclave CEYE 01"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-sans focus:outline-none focus:border-amber-400"
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-1">Clínica / Hospital / Base</label>
            <input
              type="text"
              value={newCliente}
              onChange={(e) => setNewCliente(e.target.value)}
              placeholder="Ej: Hospital Metropolitano"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-sans focus:outline-none focus:border-amber-400"
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-1">Tipo de Activo</label>
            <select
              value={newTipo}
              onChange={(e) => setNewTipo(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-amber-300 font-bold focus:outline-none focus:border-amber-400"
            >
              <option value="AUTOCLAVE">♨️ Autoclave Quirúrgico</option>
              <option value="VEHICULO">🚗 Flota Vehicular / Ambulancia</option>
              <option value="UNIVERSAL_PLC">⚙️ Soft-PLC Universal</option>
              <option value="CAMA_HOSPITALARIA">🛏️ Cama Hospitalaria UCI</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-300 mb-1">Perfil de Silicio / Board</label>
            <select
              value={newPerfilHw}
              onChange={(e) => setNewPerfilHw(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-cyan-300 font-bold focus:outline-none focus:border-amber-400 text-[10px]"
            >
              {PERFILES_HARDWARE.map(p => (
                <option key={p.id} value={p.id}>{p.id} - {p.nombre.slice(0, 24)}...</option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-90 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-50"
        >
          {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          <span>⚡ Aprovisionar Equipo & Grabar Identidad</span>
        </button>
      </form>

      {/* FILTROS Y BÚSQUEDA */}
      <div className="ultra-glass p-3 rounded-xl border border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-2">
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por MAC, Alias o Clínica..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-cyan-400"
          />
        </div>

        <div className="flex gap-1.5 w-full sm:w-auto overflow-x-auto pb-1">
          {['ALL', 'AUTOCLAVE', 'VEHICULO', 'UNIVERSAL_PLC', 'CAMA_HOSPITALARIA'].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilterCategory(cat)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                filterCategory === cat 
                  ? 'bg-cyan-500 text-slate-950 shadow' 
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {cat === 'ALL' ? 'TODOS' : cat.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* TABLA DE EQUIPOS */}
      <div className="ultra-glass rounded-2xl border border-slate-800 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-900/90 text-cyan-400 border-b border-slate-800">
            <tr>
              <th className="p-3">ESTADO</th>
              <th className="p-3">MAC / HARDWARE</th>
              <th className="p-3">ALIAS / EQUIPO</th>
              <th className="p-3">TIPO</th>
              <th className="p-3">CLÍNICA / HOSPITAL</th>
              <th className="p-3">TELEMETRÍA ACTUAL</th>
              <th className="p-3 text-center">ACCIONES RÁPIDAS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {filteredDevices.length === 0 ? (
              <tr>
                <td colSpan="7" className="p-8 text-center text-slate-400">
                  No hay equipos en la flota que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              filteredDevices.map((dev) => {
                const mac = dev.mac;
                const dDev = dev.datos || {};
                const isOnline = (Date.now() - (dev.lastSeen || 0)) < 15000;
                const dTipo = (dev.meta?.tipo || dDev.tipo || 'AUTOCLAVE').toUpperCase();

                return (
                  <tr key={mac} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold border ${
                        isOnline ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-ping' : 'bg-rose-400'}`}></span>
                        {isOnline ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </td>

                    <td className="p-3 font-bold">
                      <span className="text-white">{mac}</span>
                      <span className="block text-[10px] text-slate-400 font-mono">
                        {dev.meta?.hardware_rev || 'HKL-EA8'}
                      </span>
                    </td>

                    <td className="p-3 font-sans">
                      <span className="text-white font-bold">{dev.meta?.alias || `EQUIPO [${mac.slice(-4)}]`}</span>
                      <span className="block text-[10px] text-cyan-300 font-mono">{dev.meta?.modelo || 'Estándar'}</span>
                    </td>

                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-cyan-300 text-[10px] font-bold">
                        {dTipo}
                      </span>
                    </td>

                    <td className="p-3 font-sans text-slate-300">
                      {dev.meta?.cliente || 'Central Hospitalaria'}
                    </td>

                    <td className="p-3 font-mono text-[11px]">
                      {dTipo === 'VEHICULO' ? (
                        <span>Bat: <strong className="text-emerald-400">{(dDev.bateria_v || 12.6).toFixed(1)}V</strong> • {dDev.fase || 'APAGADO'}</span>
                      ) : (
                        <span>T: <strong className="text-cyan-300">{(parseFloat(dDev.temp_camara) || 25.0).toFixed(1)}°C</strong> | P: <strong className="text-pink-300">{(parseFloat(dDev.presion) || 0.0).toFixed(2)}b</strong></span>
                      )}
                    </td>

                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSelectDevice && onSelectDevice(mac)}
                          className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow"
                          title="Entrar a Cabina de Control"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Cabina</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (sendCommand) {
                              sendCommand(mac, { cmd: 'SCAN_HARDWARE' });
                              setMsg(`📡 Orden SCAN_HARDWARE enviada a [${mac}]`);
                            }
                          }}
                          className="p-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg"
                          title="Escanear Bus I2C en Vivo"
                        >
                          <Cpu className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteDevice(mac, dev.meta?.alias)}
                          className="p-1 bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 rounded-lg"
                          title="Eliminar de Supabase"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
