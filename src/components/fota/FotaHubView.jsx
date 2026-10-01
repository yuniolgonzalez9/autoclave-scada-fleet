import React, { useState } from 'react';
import { 
  Rocket, 
  Radio, 
  Upload, 
  CheckSquare, 
  Square, 
  ShieldCheck, 
  AlertTriangle,
  Server,
  Loader2
} from 'lucide-react';

export default function FotaHubView({ fleet, sendCommand }) {
  const [fotaVersion, setFotaVersion] = useState('v3.6');
  const [fotaUrl, setFotaUrl] = useState('https://raw.githubusercontent.com/yuniolgonzalez9/autoclave-scada-fleet/main/firmwares/firmware.bin');
  const [selectedTargets, setSelectedTargets] = useState({});
  const [filterOnline, setFilterOnline] = useState('ALL'); // 'ALL' | 'ONLINE' | 'OFFLINE'
  const [transmitting, setTransmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const macList = Object.keys(fleet);

  // Filtrado de equipos
  const filteredMacs = macList.filter((mac) => {
    const isOnline = Date.now() - (fleet[mac]?.lastSeen || 0) < 18000;
    if (filterOnline === 'ONLINE') return isOnline;
    if (filterOnline === 'OFFLINE') return !isOnline;
    return true;
  });

  const toggleSelectAll = () => {
    const allSelected = filteredMacs.every((mac) => selectedTargets[mac]);
    const nextState = {};
    filteredMacs.forEach((mac) => {
      nextState[mac] = !allSelected;
    });
    setSelectedTargets(nextState);
  };

  const handleExecuteFota = () => {
    const targets = filteredMacs.filter((mac) => selectedTargets[mac]);
    if (targets.length === 0) {
      alert('Debes seleccionar al menos un autoclave destino para desplegar el firmware.');
      return;
    }

    if (!confirm(`¿Confirmas la transmisión y actualización de firmware hacia ${targets.length} equipo(s)?`)) {
      return;
    }

    setTransmitting(true);
    setStatusMsg(`Transmitiendo comando FOTA hacia ${targets.length} equipo(s)...`);

    targets.forEach((mac) => {
      sendCommand(mac, {
        cmd: 'TRIGGER_FOTA',
        url: fotaUrl,
        modelo: 'UNIVERSAL'
      });
    });

    setTimeout(() => {
      setTransmitting(false);
      setStatusMsg(`¡Orden FOTA transmitida con éxito vía MQTT! Las placas iniciarán la descarga del binario.`);
    }, 2000);
  };

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Rocket className="w-5 h-5 text-cyan-400" />
            FOTA Cloud Hub (Firmware Over-The-Air)
          </h2>
          <p className="text-xs text-slate-300 font-mono mt-0.5">
            Despliegue y actualización remota de software binario hacia la flota ESP32
          </p>
        </div>
      </div>

      {statusMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-mono">
          {statusMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Panel Izquierdo: Configuración del Paquete */}
        <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-4">
          <h3 className="text-sm font-bold text-white font-mono">1. Parámetros del Binario</h3>

          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1">Versión a Desplegar</label>
            <input
              type="text"
              value={fotaVersion}
              onChange={(e) => setFotaVersion(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1">URL Pública del Binario (.BIN)</label>
            <input
              type="text"
              value={fotaUrl}
              onChange={(e) => setFotaUrl(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div className="p-4 rounded-xl border border-dashed border-slate-700 bg-slate-950/40 text-center">
            <Upload className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
            <p className="text-xs text-slate-300 font-mono">Binario Oficial Configurado</p>
            <p className="text-[10px] text-slate-500 mt-1">El ESP32 descargará el archivo y reiniciará de forma segura.</p>
          </div>
        </div>

        {/* Panel Derecho: Selección de Equipos Destino */}
        <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-white font-mono">2. Autoclaves Destino ({filteredMacs.length})</h3>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setFilterOnline('ALL')}
                  className={`px-2 py-1 rounded text-[10px] font-mono ${filterOnline === 'ALL' ? 'bg-cyan-500 text-slate-950 font-bold' : 'bg-slate-900 text-slate-400'}`}
                >
                  TODOS
                </button>
                <button
                  onClick={() => setFilterOnline('ONLINE')}
                  className={`px-2 py-1 rounded text-[10px] font-mono ${filterOnline === 'ONLINE' ? 'bg-emerald-500 text-slate-950 font-bold' : 'bg-slate-900 text-slate-400'}`}
                >
                  ONLINE
                </button>
                <button
                  onClick={toggleSelectAll}
                  className="px-2 py-1 bg-amber-500/20 text-amber-300 rounded text-[10px] font-mono font-bold"
                >
                  Invertir
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {filteredMacs.length === 0 ? (
                <div className="p-4 text-center text-xs font-mono text-slate-400">
                  No hay autoclaves detectados para este filtro.
                </div>
              ) : (
                filteredMacs.map((mac) => {
                  const dev = fleet[mac];
                  const isOnline = Date.now() - (dev?.lastSeen || 0) < 18000;
                  const checked = !!selectedTargets[mac];

                  return (
                    <label
                      key={mac}
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                        checked ? 'bg-cyan-950/40 border-cyan-400' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => setSelectedTargets({ ...selectedTargets, [mac]: e.target.checked })}
                          className="w-4 h-4 accent-cyan-400"
                        />
                        <div>
                          <p className="text-xs font-bold text-white">{dev?.meta?.alias || `AUTOCLAVE [${mac.slice(-4)}]`}</p>
                          <p className="text-[10px] font-mono text-slate-400">MAC: {mac} • FW Actual: {dev?.esquema?.fw || 'v3.5'}</p>
                        </div>
                      </div>

                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                        isOnline ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}>
                        {isOnline ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <button
            onClick={handleExecuteFota}
            disabled={transmitting}
            className="w-full py-3 bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:opacity-90 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25 mt-3 disabled:opacity-50"
          >
            {transmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Transmitiendo Paquete FOTA...</span>
              </>
            ) : (
              <>
                <Rocket className="w-4 h-4" />
                <span>🚀 Transmitir Actualización FOTA</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
