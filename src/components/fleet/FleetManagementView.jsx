import React, { useState, useMemo, useRef } from 'react';
import { useSwipe, stepThrough } from '../../hooks/useSwipe';
import { useNow } from '../../hooks/useNow';
import SwipeDots from '../common/SwipeDots';
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
  Wrench,
  Pencil,
  AlertTriangle,
  X,
  Wifi,
  WifiOff
} from 'lucide-react';

// Perfiles de hardware comercial preconfigurados
const PERFILES_HARDWARE = [
  { id: 'HKL-EA8', nombre: 'Hankerila HKL-EA8 (8 Relés 0x24 / 8 Entradas 0x26 / ADS1115)', tipoDefault: 'AUTOCLAVE' },
  { id: 'KC868-A8', nombre: 'Kincony KC868-A8 Industrial (8 Relés / Ethernet RJ45)', tipoDefault: 'UNIVERSAL_PLC' },
  { id: 'OLIMEX-EVB', nombre: 'Olimex ESP32-EVB (2 Relés / CAN-Bus / Ethernet)', tipoDefault: 'VEHICULO' },
  { id: 'LILYGO-TRELAY', nombre: 'LilyGO T-Relay (4/8 Canales Optoacoplados)', tipoDefault: 'UNIVERSAL_PLC' },
  { id: 'GENERIC-DIY', nombre: 'Genérico ESP32 NodeMCU (Mapeo Libre GPIO)', tipoDefault: 'AUTOCLAVE' }
];

export default function FleetManagementView({ fleet = {}, sendCommand, onSelectDevice, onOpenReports, onOpenAssignModal }) {
  const nowTs = useNow(2000);
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

  // Edición completa de dispositivo existente
  const [editDevice, setEditDevice] = useState(null); // {mac, alias, cliente, modelo, area, tipo, hardware_rev}
  const [savingEdit, setSavingEdit] = useState(false);
  const [sugeridos, setSugeridos] = useState({ clientes: [], aliases: [] });

  // Sugerencias: clientes y alias ya registrados en la web
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase
          .from('asignaciones_equipos')
          .select('cliente, alias');
        if (!mounted || !data) return;
        setSugeridos({
          clientes: [...new Set(data.map((r) => r.cliente).filter(Boolean))],
          aliases: [...new Set(data.map((r) => r.alias).filter(Boolean))]
        });
      } catch (_) {}
    })();
    return () => { mounted = false; };
  }, []);

  const openEditDevice = (mac, dev) => {
    setEditDevice({
      mac,
      alias: dev?.meta?.alias || '',
      cliente: dev?.meta?.cliente || '',
      modelo: dev?.meta?.modelo || '',
      area: dev?.meta?.area || dev?.meta?.ubicacion || '',
      tipo: (dev?.meta?.tipo || dev?.datos?.tipo || 'AUTOCLAVE').toUpperCase(),
      hardware_rev: dev?.meta?.hardware_rev || 'HKL-EA8'
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editDevice) return;
    setSavingEdit(true);
    setMsg('');
    setErrorMsg('');

    const payload = {
      mac: editDevice.mac,
      alias: editDevice.alias.trim() || `EQUIPO [${editDevice.mac.slice(-4)}]`,
      cliente: editDevice.cliente.trim() || 'Central Hospitalaria',
      modelo: editDevice.modelo.trim() || 'Estándar',
      area: editDevice.area.trim(),
      tipo: editDevice.tipo,
      hardware_rev: editDevice.hardware_rev,
      config_deseada: {
        tipo: editDevice.tipo,
        hardware_rev: editDevice.hardware_rev,
        alerta_pct: 80,
        lim_mant: 200,
        sp_temp: 121.0
      },
      updated_at: new Date().toISOString()
    };

    try {
      const { error } = await supabase
        .from('asignaciones_equipos')
        .upsert(payload, { onConflict: 'mac' });
      if (error) throw error;

      if (sendCommand) {
        sendCommand(editDevice.mac, {
          cmd: 'APPLY_HARDWARE_PROVISION',
          mac: editDevice.mac,
          alias: payload.alias,
          cliente: payload.cliente,
          modelo: payload.modelo,
          area: payload.area,
          tipo: payload.tipo,
          hardware_rev: payload.hardware_rev
        });
      }

      setMsg(`Equipo [${editDevice.mac}] actualizado: "${payload.alias}".`);
      setEditDevice(null);
    } catch (err) {
      setErrorMsg(`No se pudo guardar: ${err.message || 'error de base de datos'}`);
    } finally {
      setSavingEdit(false);
    }
  };

  const [view, setView] = useState('equipos'); // 'equipos' | 'alta'
  const rootRef = useRef(null);
  const VIEWS = ['equipos', 'alta'];

  useSwipe(rootRef, {
    onSwipeLeft: () => stepThrough(VIEWS, view, 1, setView),
    onSwipeRight: () => stepThrough(VIEWS, view, -1, setView)
  });

  const macList = useMemo(() => Object.keys(fleet || {}), [fleet]);

  // Lista filtrada
  const filteredDevices = useMemo(() => {
    return macList.map((mac) => fleet[mac]).filter((dev) => {
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

    // Saneamiento de MAC a formato canónico de 12 caracteres hex
    const cleanMac = newMac.toUpperCase().replace(/[:\-\s]/g, '').trim();

    // Validación estricta de formato MAC (IEEE 802 - 48 bits)
    const macRegex = /^[0-9A-F]{12}$/;
    if (!macRegex.test(cleanMac)) {
      setErrorMsg('La dirección MAC debe contener exactamente 12 caracteres hexadecimales válidos (ej. 246F28A1B2C3).');
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
      // 1. Guardar en base de datos central
      const { error } = await supabase
        .from('asignaciones_equipos')
        .upsert(payload, { onConflict: 'mac' });

      if (error) throw error;

      // 2. Transmitir provisión remota por MQTT al microcontrolador
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

      setMsg(`¡Equipo [${cleanMac}] aprovisionado y registrado con éxito en la red!`);
      setView('equipos');
      setNewMac('');
      setNewAlias('');
      setNewCliente('');
    } catch (err) {
      setErrorMsg(`Error de aprovisionamiento: ${err.message || 'Fallo de base de datos'}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Eliminar equipo del inventario
  const handleDeleteDevice = async (mac, alias) => {
    if (!confirm(`¿Confirma eliminar definitivamente el equipo "${alias || mac}" de la base de datos central? Esta acción removerá sus asignaciones.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('asignaciones_equipos')
        .delete()
        .eq('mac', mac);

      if (error) throw error;
      setMsg(`Equipo [${mac}] eliminado del inventario central.`);
    } catch (err) {
      alert(`Error al eliminar: ${err.message}`);
    }
  };

  return (
    <div ref={rootRef} className="space-y-4 font-mono text-xs select-none">
      
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
              className="px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold flex items-center gap-1.5 transition-all shadow"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Reportes técnicos</span>
            </button>
          )}
          <span className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-cyan-300 font-bold">
            Total en Red: {macList.length}
          </span>
        </div>
      </div>

      {/* Notificaciones */}
      {msg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{msg}</span>
          </div>
          <button type="button" onClick={() => setMsg('')} className="text-emerald-400 font-bold">✕</button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button type="button" onClick={() => setErrorMsg('')} className="text-rose-400 font-bold">✕</button>
        </div>
      )}

      {/* Selector de subvista */}
      <div className="sticky top-14 sm:top-16 z-20 py-1">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-950/80 backdrop-blur-md border border-slate-800">
          {[
            ['equipos', `Equipos Registrados (${macList.length})`],
            ['alta', 'Aprovisionar Nuevo Hardware']
          ].map(([id, label]) => (
            <button 
              key={id} 
              type="button" 
              onClick={() => setView(id)} 
              className={`py-2 rounded-xl text-[11px] font-bold transition-all ${
                view === id 
                  ? 'bg-cyan-500 text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.45)]' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <SwipeDots count={2} index={VIEWS.indexOf(view)} className="mt-1.5 lg:hidden" />
      </div>

      {/* FORMULARIO DE ALTA Y PROVISIÓN */}
      {view === 'alta' && (
        <form onSubmit={handleProvisionDevice} className="ultra-glass p-5 rounded-2xl border border-amber-500/30 space-y-4">
          <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2 border-b border-amber-500/20 pb-2">
            <Plus className="w-4 h-4 text-amber-400" />
            Aprovisionar Nueva Placa Microcontroladora (ESP32)
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="block text-slate-300 mb-1 font-bold">Dirección MAC (12 Hex) *</label>
              <input
                type="text"
                required
                maxLength={17}
                value={newMac}
                onChange={(e) => setNewMac(e.target.value)}
                placeholder="246F28A1B2C3"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-bold uppercase focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Nombre / Alias del Equipo</label>
              <input
                type="text"
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                placeholder="Autoclave Quirófano 01"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-sans focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Clínica / Hospital / Base</label>
              <input
                type="text"
                value={newCliente}
                onChange={(e) => setNewCliente(e.target.value)}
                placeholder="Hospital Central"
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
                {PERFILES_HARDWARE.map((p) => (
                  <option key={p.id} value={p.id}>{p.id} - {p.nombre.slice(0, 24)}...</option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-90 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-50 transition-all"
          >
            {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span>APROVISIONAR EQUIPO & TRANSMITIR IDENTIDAD</span>
          </button>
        </form>
      )}

      {/* FILTROS Y BÚSQUEDA */}
      {view === 'equipos' && (
        <>
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
                  <th className="p-3">TELEMETRÍA EN VIVO</th>
                  <th className="p-3 text-center">ACCIONES RÁPIDAS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredDevices.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-8 text-center text-slate-400 font-sans">
                      No existen equipos en la flota que coincidan con los criterios de búsqueda.
                    </td>
                  </tr>
                ) : (
                  filteredDevices.map((dev) => {
                    const mac = dev.mac;
                    const dDev = dev.datos || {};
                    const isOnline = (nowTs - (dev.lastSeen || 0)) < 15000;
                    const dTipo = (dev.meta?.tipo || dDev.tipo || 'AUTOCLAVE').toUpperCase();

                    return (
                      <tr key={mac} onClick={() => openEditDevice(mac, dev)} className="hover:bg-slate-800/40 transition-colors cursor-pointer" title="Click para editar equipo">
                        <td className="p-3">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold border ${
                            isOnline ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          }`}>
                            {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                            {isOnline ? 'ONLINE' : 'OFFLINE'}
                          </span>
                        </td>

                        <td className="p-3 font-bold font-mono">
                          <span className="text-white">{mac}</span>
                          <span className="block text-[10px] text-slate-400 font-normal">
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
                            <span>Bat: <strong className="text-emerald-400">{(dDev.bateria_v || 12.6).toFixed(1)}V</strong> · {dDev.fase || 'APAGADO'}</span>
                          ) : (
                            <span>T: <strong className="text-cyan-300">{(parseFloat(dDev.temp_camara) || 25.0).toFixed(1)}°C</strong> | P: <strong className="text-pink-300">{(parseFloat(dDev.presion) || 0.0).toFixed(2)}b</strong></span>
                          )}
                        </td>

                        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onSelectDevice && onSelectDevice(mac)}
                              className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow transition-all"
                              title="Entrar a Cabina de Control"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Cabina</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => openEditDevice(mac, dev)}
                              className="p-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg transition-all"
                              title="Editar equipo (nombre, área, modelo)"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={async () => {
                                if (sendCommand) {
                                  const r = await sendCommand(mac, { cmd: 'SCAN_HARDWARE' });
                                  setMsg(r?.ok === false
                                    ? `No se envió la orden a [${mac}]: ${r.error}`
                                    : `Orden SCAN_HARDWARE enviada a la placa [${mac}].`);
                                }
                              }}
                              className="p-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg transition-all"
                              title="Sondear Bus I2C en Vivo"
                            >
                              <Cpu className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteDevice(mac, dev.meta?.alias)}
                              className="p-1 bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 rounded-lg transition-all"
                              title="Eliminar de Base de Datos"
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
        </>
      )}

      {/* Modal: edición completa del dispositivo */}
      {editDevice && (
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditDevice(null)}>
          <form
            onSubmit={handleSaveEdit}
            onClick={(e) => e.stopPropagation()}
            className="ultra-glass w-full max-w-md rounded-2xl p-5 space-y-3 font-mono text-xs shadow-2xl"
          >
            <div className="flex items-center justify-between border-b gear-divider pb-2.5">
              <span className="font-bold text-white flex items-center gap-2">
                <Pencil className="w-4 h-4 gear-accent-text" />
                EDITAR EQUIPO [{editDevice.mac.slice(-4)}]
              </span>
              <button type="button" onClick={() => setEditDevice(null)} className="text-slate-400 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <label className="col-span-2 space-y-1">
                <span className="text-[10px] text-slate-400">NOMBRE / ALIAS</span>
                <input
                  value={editDevice.alias}
                  onChange={(e) => setEditDevice({ ...editDevice, alias: e.target.value })}
                  list="fleet-aliases-sugeridos"
                  className="w-full bg-slate-900/70 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400"
                  placeholder="Autoclave Quirúrgico"
                />
                <datalist id="fleet-aliases-sugeridos">
                  {sugeridos.aliases.map((a) => <option key={a} value={a} />)}
                </datalist>
              </label>
              <label className="col-span-2 space-y-1">
                <span className="text-[10px] text-slate-400">CLIENTE / CENTRO</span>
                <input
                  value={editDevice.cliente}
                  onChange={(e) => setEditDevice({ ...editDevice, cliente: e.target.value })}
                  list="fleet-clientes-sugeridos"
                  className="w-full bg-slate-900/70 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400"
                  placeholder="Central Hospitalaria"
                />
                <datalist id="fleet-clientes-sugeridos">
                  {sugeridos.clientes.map((c) => <option key={c} value={c} />)}
                </datalist>
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-slate-400">ÁREA / SALA</span>
                <input
                  value={editDevice.area}
                  onChange={(e) => setEditDevice({ ...editDevice, area: e.target.value })}
                  className="w-full bg-slate-900/70 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400"
                  placeholder="Quirófano 2"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-slate-400">MODELO</span>
                <input
                  value={editDevice.modelo}
                  onChange={(e) => setEditDevice({ ...editDevice, modelo: e.target.value })}
                  className="w-full bg-slate-900/70 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400"
                  placeholder="Clase B HKL-EA8"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-slate-400">TIPO</span>
                <select
                  value={editDevice.tipo}
                  onChange={(e) => setEditDevice({ ...editDevice, tipo: e.target.value })}
                  className="w-full bg-slate-900/70 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none"
                >
                  <option value="AUTOCLAVE">AUTOCLAVE</option>
                  <option value="UNIVERSAL_PLC">UNIVERSAL_PLC</option>
                  <option value="VEHICULO">VEHICULO</option>
                  <option value="INCUBADORA">INCUBADORA</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-slate-400">HARDWARE</span>
                <select
                  value={editDevice.hardware_rev}
                  onChange={(e) => setEditDevice({ ...editDevice, hardware_rev: e.target.value })}
                  className="w-full bg-slate-900/70 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none"
                >
                  {PERFILES_HARDWARE.map((p) => (
                    <option key={p.id} value={p.id}>{p.id}</option>
                  ))}
                </select>
              </label>
            </div>

            {onOpenAssignModal && (
              <button
                type="button"
                onClick={() => { const dev = fleet[editDevice.mac]; setEditDevice(null); onOpenAssignModal(dev || { mac: editDevice.mac }); }}
                className="w-full py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-bold transition-all flex items-center justify-center gap-2"
              >
                👥 ASIGNAR A USUARIOS REGISTRADOS
              </button>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={savingEdit}
                className="flex-1 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Send className="w-3.5 h-3.5" />
                {savingEdit ? 'GUARDANDO…' : 'GUARDAR EQUIPO'}
              </button>
              <button
                type="button"
                onClick={() => setEditDevice(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-all"
              >
                CANCELAR
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
