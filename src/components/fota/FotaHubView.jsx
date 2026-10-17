import React, { useState, useMemo } from 'react';
import ClinicalTooltip from '../common/ClinicalTooltip';
import { CLINICAL_HELP } from '../../utils/clinicalDictionary';
import { desplegarPerfilJsonFota } from '../../services/fotaService';
import { 
  Rocket, 
  Upload, 
  CheckCircle2, 
  Loader2, 
  FileCode, 
  Layers, 
  Send 
} from 'lucide-react';

export default function FotaHubView({ fleet = {}, sendCommand }) {
  const [fotaMode, setFotaMode] = useState('JSON'); // 'JSON' o 'BIN'
  
  // Parámetros Binario C++
  const [fotaVersion, setFotaVersion] = useState('v8.0');
  const [fotaUrl, setFotaUrl] = useState('https://raw.githubusercontent.com/yuniolgonzalez9/autoclave-scada-fleet/main/firmwares/firmware.bin');
  
  // Parámetros Manifiesto JSON (Supabase Storage + LittleFS)
  const [perfilNombre, setPerfilNombre] = useState('Manifiesto_Industrial_Base');
  const [tipoEquipo, setTipoEquipo] = useState('UNIVERSAL_PLC');
  const [jsonText, setJsonText] = useState(() => JSON.stringify({
    version: "2.0",
    dispositivo: "HKL-EA8 Universal",
    tipo: "UNIVERSAL_PLC",
    seguridad: {
      paro_emergencia: "IN4",
      corte_automatico: true
    },
    variables: {
      temperatura: { tipo: "float", unidad: "°C", adc_canal: 0 },
      presion: { tipo: "float", unidad: "bar", adc_canal: 1 },
      bateria: { tipo: "float", unidad: "V", adc_canal: 2 }
    }
  }, null, 2));

  const [selectedTargets, setSelectedTargets] = useState({});
  const [filterOnline, setFilterOnline] = useState('ONLINE');
  const [transmitting, setTransmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [jsonError, setJsonError] = useState('');

  const macList = useMemo(() => Object.keys(fleet || {}), [fleet]);

  const filteredMacs = useMemo(() => {
    const now = Date.now();
    return macList.filter((mac) => {
      const isOnline = (now - (fleet[mac]?.lastSeen || 0)) < 15000;
      if (filterOnline === 'ONLINE') return isOnline;
      if (filterOnline === 'OFFLINE') return !isOnline;
      return true;
    });
  }, [macList, fleet, filterOnline]);

  const toggleSelectAll = () => {
    const allSelected = filteredMacs.length > 0 && filteredMacs.every((mac) => selectedTargets[mac]);
    const nextState = {};
    filteredMacs.forEach((mac) => { nextState[mac] = !allSelected; });
    setSelectedTargets(nextState);
  };

  const handleJsonChange = (val) => {
    setJsonText(val);
    try {
      JSON.parse(val);
      setJsonError('');
    } catch (e) {
      setJsonError('Sintaxis JSON no válida: ' + e.message);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      handleJsonChange(event.target.result);
      setPerfilNombre(file.name.replace('.json', ''));
    };
    reader.readAsText(file);
    e.target.value = ''; // Permite cargar el mismo archivo si fue editado
  };

  // 1. Despliegue de Binario C++ (.BIN)
  const handleExecuteFotaBin = () => {
    const targets = filteredMacs.filter((mac) => selectedTargets[mac]);
    if (targets.length === 0) {
      alert('Debes seleccionar al menos un equipo destino.');
      return;
    }

    if (!confirm(`¿Confirmas la transmisión de firmware binario (${fotaVersion}) hacia ${targets.length} equipo(s)?`)) return;

    setTransmitting(true);
    setStatusMsg(`Transmitiendo orden FOTA (.BIN) hacia ${targets.length} equipo(s)...`);

    targets.forEach((mac) => {
      if (sendCommand) {
        sendCommand(mac, {
          cmd: 'TRIGGER_FOTA',
          url: fotaUrl.trim(),
          version: fotaVersion.trim()
        });
      }
    });

    setTimeout(() => {
      setTransmitting(false);
      setStatusMsg(`¡Orden FOTA (.BIN) transmitida con éxito vía MQTT hacia ${targets.length} equipo(s)!`);
    }, 1500);
  };

  // 2. Despliegue de Manifiesto JSON (Supabase Storage + LittleFS)
  const handleExecuteFotaJson = async () => {
    if (jsonError) {
      alert('Corrige los errores de sintaxis del JSON antes de desplegar.');
      return;
    }

    const targets = filteredMacs.filter((mac) => selectedTargets[mac]);
    if (targets.length === 0) {
      alert('Debes seleccionar al menos un equipo destino.');
      return;
    }

    let parsedJson;
    try {
      parsedJson = JSON.parse(jsonText);
    } catch (e) {
      alert('Error en JSON: ' + e.message);
      return;
    }

    if (!confirm(`¿Confirmas subir este manifiesto a Supabase Storage y grabarlo en Flash LittleFS en ${targets.length} equipo(s)?`)) {
      return;
    }

    setTransmitting(true);
    setStatusMsg(`Subiendo manifiesto a Supabase Storage...`);

    try {
      for (const mac of targets) {
        const result = await desplegarPerfilJsonFota({
          mac,
          perfilNombre,
          tipo: tipoEquipo,
          jsonObject: parsedJson,
          sendCommand
        });

        if (!result.success) throw new Error(result.error);
      }

      setStatusMsg(`¡Manifiesto subido y transmitido a Flash LittleFS en ${targets.length} equipo(s)!`);
    } catch (err) {
      setStatusMsg(`Error durante el despliegue: ${err.message}`);
    } finally {
      setTransmitting(false);
    }
  };

  return (
    <div className="space-y-4 font-mono text-xs select-none">
      
      {/* Cabecera */}
      <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Rocket className="w-5 h-5 text-cyan-400" />
            FOTA Cloud Hub Enterprise
          </h2>
          <p className="text-xs text-slate-300 mt-0.5 font-sans">
            Actualización remota de software binario (.BIN) y manifiestos de hardware (.JSON LittleFS)
          </p>
        </div>

        {/* Selector de Modo */}
        <div className="flex gap-1.5 p-1 bg-slate-950 border border-slate-700 rounded-xl font-bold">
          <button
            onClick={() => setFotaMode('JSON')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              fotaMode === 'JSON' 
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Manifiestos (.JSON LittleFS)</span>
          </button>
          
          <button
            onClick={() => setFotaMode('BIN')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              fotaMode === 'BIN' 
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Firmware Núcleo (.BIN)</span>
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* PANEL IZQUIERDO: CONFIGURADOR */}
        <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-4">
          
          {fotaMode === 'JSON' ? (
            <>
              <div className="flex justify-between items-center border-b border-cyan-500/20 pb-2">
                <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-amber-400" />
                  Editor de Manifiesto (.JSON LittleFS)
                </h3>
                <label className="cursor-pointer px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 rounded-lg text-[11px] font-bold flex items-center gap-1">
                  <Upload className="w-3 h-3" />
                  <span>Cargar .json</span>
                  <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 mb-1">Nombre del Archivo / Perfil</label>
                  <input
                    type="text"
                    value={perfilNombre}
                    onChange={(e) => setPerfilNombre(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1">Categoría</label>
                  <select
                    value={tipoEquipo}
                    onChange={(e) => setTipoEquipo(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-amber-300 focus:outline-none focus:border-amber-400 font-bold"
                  >
                    <option value="UNIVERSAL_PLC">⚙️ PLC INDUSTRIAL / GENERAL</option>
                    <option value="VEHICULO">🚗 VEHÍCULO / FLOTA</option>
                    <option value="AUTOCLAVE">♨️ AUTOCLAVE CLÍNICO</option>
                    <option value="CAMA_HOSPITALARIA">🛏️ CAMA HOSPITALARIA</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 flex justify-between">
                  <span>Estructura JSON (Se graba en LittleFS vía Supabase Storage):</span>
                  {jsonError && <span className="text-rose-400 font-bold text-[10px]">{jsonError}</span>}
                </label>
                <textarea
                  rows={14}
                  value={jsonText}
                  onChange={(e) => handleJsonChange(e.target.value)}
                  className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-cyan-300 font-mono text-[11px] leading-relaxed focus:outline-none focus:border-cyan-400"
                  spellCheck="false"
                />
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-400 text-[10px] space-y-1">
                <p>🔹 Este archivo se almacena en el bucket <strong>'firmwares'</strong> de Supabase Storage.</p>
                <p>🔹 El microcontrolador descarga el archivo por HTTPS y lo graba en su partición Flash LittleFS.</p>
              </div>
            </>
          ) : (
            <>
              <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-cyan-500/20 pb-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                Parámetros del Firmware Binario (.BIN)
              </h3>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Versión del Núcleo</label>
                <input
                  type="text"
                  value={fotaVersion}
                  onChange={(e) => setFotaVersion(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400 font-bold"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">URL Pública del Binario (.BIN)</label>
                <input
                  type="text"
                  value={fotaUrl}
                  onChange={(e) => setFotaUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                />
              </div>

              <div className="p-4 rounded-xl border border-dashed border-slate-700 bg-slate-950/40 text-center">
                <Upload className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
                <p className="text-xs text-slate-300 font-sans font-semibold">Binario C++ con Doble Partición OTA</p>
                <p className="text-[10px] text-slate-500 mt-1">El ESP32 valida la integridad SHA-256 antes de reiniciar y cuenta con rollback automático si falla.</p>
              </div>
            </>
          )}

        </div>

        {/* PANEL DERECHO: EQUIPOS DESTINO */}
        <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-white">
                Equipos Destino ({filteredMacs.length})
              </h3>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setFilterOnline('ALL')}
                  className={`px-2 py-1 rounded text-[10px] ${filterOnline === 'ALL' ? 'bg-cyan-500 text-slate-950 font-bold' : 'bg-slate-900 text-slate-400'}`}
                >
                  TODOS
                </button>
                <button
                  type="button"
                  onClick={() => setFilterOnline('ONLINE')}
                  className={`px-2 py-1 rounded text-[10px] ${filterOnline === 'ONLINE' ? 'bg-emerald-500 text-slate-950 font-bold' : 'bg-slate-900 text-slate-400'}`}
                >
                  ONLINE
                </button>
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="px-2 py-1 bg-amber-500/20 text-amber-300 rounded text-[10px] font-bold"
                >
                  Invertir
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {filteredMacs.length === 0 ? (
                <div className="p-4 text-center text-slate-400">
                  No hay equipos disponibles para este filtro.
                </div>
              ) : (
                filteredMacs.map((mac) => {
                  const dev = fleet[mac];
                  const isOnline = (Date.now() - (dev?.lastSeen || 0)) < 15000;
                  const checked = Boolean(selectedTargets[mac]);
                  const devTipo = dev?.meta?.tipo || 'UNIVERSAL_PLC';

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
                          <p className="text-xs font-bold text-white flex items-center gap-1.5">
                            {dev?.meta?.alias || `EQUIPO [${mac.slice(-4)}]`}
                            <span className="text-[9px] px-1 rounded bg-slate-800 text-cyan-300">
                              {devTipo}
                            </span>
                          </p>
                          <p className="text-[10px] text-slate-400">MAC: {mac} • FW: {dev?.esquema?.fw || 'v8.0'}</p>
                        </div>
                      </div>

                      <span className={`px-2 py-0.5 rounded text-[10px] border font-bold ${
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

          {/* Botón Maestro */}
          <div>
            {fotaMode === 'JSON' ? (
              <button
                onClick={handleExecuteFotaJson}
                disabled={transmitting || Boolean(jsonError)}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-emerald-500 to-teal-500 hover:opacity-90 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 disabled:opacity-50"
              >
                {transmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Subiendo a Supabase Storage y Transmitiendo...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>⚡ SUBIR A STORAGE Y DESPLEGAR A LITTLEFS</span>
                  </>
                )}
              </button>
            ) : (
              <ClinicalTooltip 
                title={CLINICAL_HELP.btn_fota_trigger?.title || 'FOTA Binario'} 
                description={CLINICAL_HELP.btn_fota_trigger?.desc || 'Despliegue OTA de binario C++ compilado'} 
                badge={CLINICAL_HELP.btn_fota_trigger?.badge || 'OTA'}
              >
                <button
                  onClick={handleExecuteFotaBin}
                  disabled={transmitting}
                  className="w-full py-3.5 bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:opacity-90 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25 disabled:opacity-50"
                >
                  {transmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Transmitiendo Binario OTA...</span>
                    </>
                  ) : (
                    <>
                      <Rocket className="w-4 h-4" />
                      <span>🚀 TRANSMITIR ACTUALIZACIÓN BINARIA (.BIN)</span>
                    </>
                  )}
                </button>
              </ClinicalTooltip>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
