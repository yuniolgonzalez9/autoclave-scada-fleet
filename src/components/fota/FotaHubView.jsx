import React, { useState, useMemo } from 'react';
import { useNow } from '../../hooks/useNow';
import ClinicalTooltip from '../common/ClinicalTooltip';
import { CLINICAL_HELP } from '../../utils/clinicalDictionary';
import { desplegarPerfilJsonFota } from '../../services/fotaJsonService';
import { 
  Rocket, 
  Upload, 
  CheckCircle2, 
  Loader2, 
  FileCode, 
  Layers, 
  Send,
  AlertTriangle,
  ShieldAlert,
  Wifi,
  WifiOff
} from 'lucide-react';

export default function FotaHubView({ fleet = {}, sendCommand }) {
  const nowTs = useNow(2000);
  const [fotaMode, setFotaMode] = useState('JSON'); // 'JSON' | 'BIN'
  
  // Parámetros Binario C++
  const [fotaVersion, setFotaVersion] = useState('v8.1.0');
  const [fotaUrl, setFotaUrl] = useState(() => {
    return import.meta.env.VITE_FOTA_FIRMWARE_URL || 
           'https://gjtqyodpgwfvfvkhlhik.supabase.co/storage/v1/object/public/firmwares/firmware.bin';
  });
  
  // Parámetros Manifiesto JSON (Supabase Storage + LittleFS)
  const [perfilNombre, setPerfilNombre] = useState('Manifiesto_Industrial_Base');
  const [tipoEquipo, setTipoEquipo] = useState('UNIVERSAL_PLC');
  const [jsonText, setJsonText] = useState(() => JSON.stringify({
    version: "2.1",
    dispositivo: "HKL-EA8 Industrial Controller",
    tipo: "UNIVERSAL_PLC",
    seguridad: {
      paro_emergencia: "IN4",
      corte_automatico: true,
      bloqueo_presion_mbar: 50
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
  const [statusMessage, setStatusMessage] = useState({ text: '', type: 'idle' });
  const [jsonError, setJsonError] = useState('');

  const macList = useMemo(() => Object.keys(fleet || {}), [fleet]);

  const filteredMacs = useMemo(() => {
    const now = nowTs;
    return macList.filter((mac) => {
      const isOnline = (now - (fleet[mac]?.lastSeen || 0)) < 15000;
      if (filterOnline === 'ONLINE') return isOnline;
      if (filterOnline === 'OFFLINE') return !isOnline;
      return true;
    });
  }, [macList, fleet, filterOnline, nowTs]);

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
      setJsonError(`Error de sintaxis JSON: ${e.message}`);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        handleJsonChange(content);
        setPerfilNombre(file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_'));
      }
    };
    reader.onerror = () => {
      setStatusMessage({ text: 'Error de lectura de archivo local.', type: 'error' });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  /**
   * Comprueba si el equipo se encuentra operando un ciclo activo.
   */
  const isDeviceInActiveCycle = (mac) => {
    const dev = fleet[mac];
    const fase = String(dev?.datos?.fase || '').trim().toUpperCase();
    return Boolean(
      fase && 
      !/^(EN[ _]?ESPERA|ESPERA|APAGADO|CANCELADO|FINALIZADO.*|LISTO|IDLE)$/i.test(fase)
    );
  };

  // 1. Despliegue de Binario C++ (.BIN)
  const handleExecuteFotaBin = async () => {
    const targets = filteredMacs.filter((mac) => selectedTargets[mac]);
    if (targets.length === 0) {
      alert('Debe seleccionar al menos un equipo en línea como destino.');
      return;
    }

    // Validación de URL
    let cleanUrl = fotaUrl.trim();
    try {
      const parsedUrl = new URL(cleanUrl);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        throw new Error();
      }
    } catch (_) {
      alert('La URL del binario de firmware no es válida. Debe iniciar con http:// o https://.');
      return;
    }

    // Comprobación de Enclavamiento de Seguridad: Evitar OTA si hay ciclo en curso
    const busyNodes = targets.filter(isDeviceInActiveCycle);
    if (busyNodes.length > 0) {
      const busyNames = busyNodes.map((m) => fleet[m]?.meta?.alias || m).join(', ');
      alert(
        `⛔ ENCLAVAMIENTO DE SEGURIDAD ACTIVADO:\nLos siguientes equipos están ejecutando un ciclo clínico activo y no pueden ser reiniciados:\n${busyNames}\n\nEspere a que finalicen la fase de secado o deselecciónelos.`
      );
      return;
    }

    if (!confirm(`¿Confirma la transmisión de actualización de firmware (${fotaVersion}) a ${targets.length} equipo(s)? La placa se reiniciará automáticamente tras la validación SHA-256.`)) {
      return;
    }

    setTransmitting(true);
    setStatusMessage({ text: `Transmitiendo órdenes OTA a ${targets.length} equipo(s)...`, type: 'info' });

    let sentCount = 0;
    try {
      targets.forEach((mac) => {
        if (sendCommand) {
          sendCommand(mac, {
            cmd: 'TRIGGER_FOTA',
            url: cleanUrl,
            version: fotaVersion.trim()
          });
          sentCount++;
        }
      });

      setStatusMessage({
        text: `Órdenes OTA transmitidas exitosamente a ${sentCount} dispositivo(s). Los microcontroladores descargarán y validarán la partición dual.`,
        type: 'success'
      });
    } catch (err) {
      setStatusMessage({
        text: `Error de despacho OTA: ${err.message || 'Fallo de transmisión'}`,
        type: 'error'
      });
    } finally {
      setTransmitting(false);
    }
  };

  // 2. Despliegue de Manifiesto JSON (Supabase Storage + LittleFS)
  const handleExecuteFotaJson = async () => {
    if (jsonError) {
      alert('Debe corregir los errores de sintaxis JSON antes de proceder con el despliegue.');
      return;
    }

    const targets = filteredMacs.filter((mac) => selectedTargets[mac]);
    if (targets.length === 0) {
      alert('Debe seleccionar al menos un equipo destino.');
      return;
    }

    let parsedJson;
    try {
      parsedJson = JSON.parse(jsonText);
    } catch (e) {
      alert(`Error en estructura JSON: ${e.message}`);
      return;
    }

    if (!confirm(`¿Confirma subir el manifiesto "${perfilNombre}" a Supabase Storage y grabarlo en memoria flash LittleFS de ${targets.length} equipo(s)?`)) {
      return;
    }

    setTransmitting(true);
    setStatusMessage({ text: 'Sincronizando manifiesto con Supabase Storage...', type: 'info' });

    try {
      let deployedCount = 0;
      for (const mac of targets) {
        const result = await desplegarPerfilJsonFota({
          mac,
          perfilNombre: perfilNombre.trim(),
          tipo: tipoEquipo,
          jsonObject: parsedJson,
          sendCommand
        });

        if (!result.success) {
          throw new Error(`Fallo en nodo [${mac}]: ${result.error}`);
        }
        deployedCount++;
      }

      setStatusMessage({
        text: `Manifiesto desplegado y grabado en flash LittleFS en ${deployedCount} equipo(s).`,
        type: 'success'
      });
    } catch (err) {
      setStatusMessage({
        text: `Error durante el despliegue a LittleFS: ${err.message}`,
        type: 'error'
      });
    } finally {
      setTransmitting(false);
    }
  };

  return (
    <div className="fota-hub-view space-y-4 font-mono text-xs select-none">
      
      {/* Cabecera */}
      <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Rocket className="w-5 h-5 text-cyan-400" />
            Centro de Despliegue FOTA Industrial
          </h2>
          <p className="text-xs text-slate-300 mt-0.5 font-sans">
            Actualización remota de firmware compilado (.BIN) y manifiestos de hardware (.JSON a Flash LittleFS)
          </p>
        </div>

        {/* Selector de Modo */}
        <div className="flex gap-1.5 p-1 bg-slate-950 border border-slate-700 rounded-xl font-bold">
          <button
            type="button"
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
            type="button"
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

      {/* Notificación de Estado */}
      {statusMessage.type !== 'idle' && (
        <div className={`p-3.5 rounded-xl border flex items-center justify-between ${
          statusMessage.type === 'error'
            ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
            : statusMessage.type === 'success'
            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
            : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
        }`}>
          <div className="flex items-center gap-2">
            {statusMessage.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span className="font-sans text-xs">{statusMessage.text}</span>
          </div>
          <button 
            type="button"
            onClick={() => setStatusMessage({ text: '', type: 'idle' })} 
            className="text-slate-400 hover:text-white font-bold ml-2"
          >
            ✕
          </button>
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
                  Editor de Manifiesto de Hardware (.JSON LittleFS)
                </h3>
                <label className="cursor-pointer px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 rounded-lg text-[11px] font-bold flex items-center gap-1">
                  <Upload className="w-3 h-3" />
                  <span>Cargar .json</span>
                  <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 mb-1">Nombre del Perfil</label>
                  <input
                    type="text"
                    value={perfilNombre}
                    onChange={(e) => setPerfilNombre(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1">Tipo de Activo</label>
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
                  <span>Estructura JSON (Partición LittleFS en ESP32):</span>
                  {jsonError && <span className="text-rose-400 font-bold text-[10px]">{jsonError}</span>}
                </label>
                <textarea
                  rows={13}
                  value={jsonText}
                  onChange={(e) => handleJsonChange(e.target.value)}
                  className={`w-full p-3 bg-slate-950 border rounded-xl text-cyan-300 font-mono text-[11px] leading-relaxed focus:outline-none ${
                    jsonError ? 'border-rose-500' : 'border-slate-800 focus:border-cyan-400'
                  }`}
                  spellCheck="false"
                />
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-400 text-[10px] space-y-1">
                <p>• Los manifiestos configuran en caliente los pines GPIO, I2C y reglas sin recompilar código C++.</p>
                <p>• El ESP32 monta la partición LittleFS, valida la firma JSON y actualiza su esquema en memoria flash no volátil.</p>
              </div>
            </>
          ) : (
            <>
              <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-cyan-500/20 pb-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                Parámetros de Flasheo OTA Binario (.BIN)
              </h3>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Versión Objetivo de Firmware</label>
                <input
                  type="text"
                  value={fotaVersion}
                  onChange={(e) => setFotaVersion(e.target.value)}
                  placeholder="v8.1.0"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400 font-bold"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">URL HTTPS del Archivo Binario (.BIN)</label>
                <input
                  type="text"
                  value={fotaUrl}
                  onChange={(e) => setFotaUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                />
              </div>

              <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/70 space-y-2">
                <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Protocolo de Flasheo Seguro FreeRTOS Dual-Boot</span>
                </div>
                <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                  El bootloader del ESP32 descarga el archivo en la partición OTA alternativa (`ota_0` / `ota_1`), verifica el checksum y valida el inicio. Si el nuevo firmware falla en los primeros 10 segundos, el sistema revierte automáticamente a la partición de fábrica (Auto-Rollback).
                </p>
              </div>
            </>
          )}

        </div>

        {/* PANEL DERECHO: EQUIPOS DESTINO */}
        <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-white">
                Equipos Seleccionados ({filteredMacs.filter((m) => selectedTargets[m]).length} de {filteredMacs.length})
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
                  EN LÍNEA
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
                <div className="p-6 text-center text-slate-400 border border-dashed border-slate-800 rounded-xl font-sans">
                  No existen equipos disponibles bajo el filtro seleccionado.
                </div>
              ) : (
                filteredMacs.map((mac) => {
                  const dev = fleet[mac];
                  const isOnline = (nowTs - (dev?.lastSeen || 0)) < 15000;
                  const isBusy = isDeviceInActiveCycle(mac);
                  const checked = Boolean(selectedTargets[mac]);
                  const devTipo = (dev?.meta?.tipo || dev?.datos?.tipo || 'UNIVERSAL_PLC').toUpperCase();

                  return (
                    <label
                      key={mac}
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                        checked ? 'bg-cyan-950/40 border-cyan-400' : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
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
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-cyan-300 font-bold">
                              {devTipo}
                            </span>
                          </p>
                          <p className="text-[10px] text-slate-400">
                            MAC: {mac} · FW Actual: {dev?.esquema?.fw || dev?.datos?.cfg?.fw || 'v8.0'}
                          </p>
                          {isBusy && (
                            <span className="inline-block mt-0.5 text-[9px] text-amber-300 font-bold">
                              ⚠️ Ciclo en ejecución: Flasheo bloqueado
                            </span>
                          )}
                        </div>
                      </div>

                      <span className={`px-2 py-0.5 rounded text-[10px] border font-bold flex items-center gap-1 ${
                        isOnline ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}>
                        {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
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
                type="button"
                onClick={handleExecuteFotaJson}
                disabled={transmitting || Boolean(jsonError)}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-emerald-500 to-teal-500 hover:opacity-90 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 disabled:opacity-50 transition-all"
              >
                {transmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Grabando Manifiesto en Flash LittleFS...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>GRABAR MANIFIESTO A MEMORIA FLASH LITTLEFS</span>
                  </>
                )}
              </button>
            ) : (
              <ClinicalTooltip 
                title={CLINICAL_HELP?.btn_fota_trigger?.title || 'FOTA Binario'} 
                description={CLINICAL_HELP?.btn_fota_trigger?.desc || 'Despliegue OTA de binario compilado'} 
                badge={CLINICAL_HELP?.btn_fota_trigger?.badge || 'OTA'}
              >
                <button
                  type="button"
                  onClick={handleExecuteFotaBin}
                  disabled={transmitting}
                  className="w-full py-3.5 bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:opacity-90 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25 disabled:opacity-50 transition-all"
                >
                  {transmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Transmitiendo Paquetes OTA por MQTT...</span>
                    </>
                  ) : (
                    <>
                      <Rocket className="w-4 h-4" />
                      <span>INICIAR DESPLIEGUE REMOTO DE FIRMWARE BINARIO (.BIN)</span>
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
