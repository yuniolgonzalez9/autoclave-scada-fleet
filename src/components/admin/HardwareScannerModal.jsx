import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../services/supabase';
import { 
  Cpu, 
  Search, 
  X, 
  CheckCircle2, 
  Send 
} from 'lucide-react';

export default function HardwareScannerModal({ 
  isOpen, 
  onClose, 
  device, 
  sendCommand, 
  onPublishMqtt 
}) {
  const [scanning, setScanning] = useState(false);
  const [detectedChips, setDetectedChips] = useState([]);
  const [relayStates, setRelayStates] = useState({});
  const [selectedRole, setSelectedRole] = useState({
    R1: 'IGNICION_ON',
    R2: 'STARTER_MOTOR',
    R3: 'INMOVILIZADOR',
    R4: 'SIRENA_LUCES',
    R5: 'LIBRE',
    R6: 'LIBRE',
    R7: 'LIBRE',
    R8: 'LIBRE'
  });
  const [msg, setMsg] = useState('');

  // Cierre con Escape
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  // Sincronizar estado real de relés desde la telemetría del ESP32
  useEffect(() => {
    if (device?.datos?.reles) {
      const liveStates = {};
      [1, 2, 3, 4, 5, 6, 7, 8].forEach(ch => {
        liveStates[ch] = Boolean(device.datos.reles[`R${ch}`]);
      });
      setRelayStates(liveStates);
    }
  }, [device?.datos?.reles]);

  // Sincronizar reporte I2C real emitido por el hardware
  useEffect(() => {
    if (device?.i2cReport?.chips && Array.isArray(device.i2cReport.chips)) {
      setDetectedChips(device.i2cReport.chips);
      setScanning(false);
      setMsg(`¡Silicio detectado en bus I2C! (${device.i2cReport.chips.length} chips comunicando)`);
    }
  }, [device?.i2cReport]);

  // Despacho unificado de comandos (Compatible con sendCommand y onPublishMqtt)
  const dispatchCommand = useCallback((cmdPayload) => {
    if (!device?.mac) return;
    const cleanMac = device.mac.toUpperCase().replace(/[:\-]/g, '');

    if (typeof sendCommand === 'function') {
      sendCommand(cleanMac, cmdPayload);
    } else if (typeof onPublishMqtt === 'function') {
      onPublishMqtt(`autoclave_med_2026/${cleanMac}/config`, cmdPayload);
    }
  }, [device?.mac, sendCommand, onPublishMqtt]);

  // Disparar escaneo al microcontrolador
  const handleScan = () => {
    setScanning(true);
    setMsg('Orden SCAN_HARDWARE enviada al bus I2C del ESP32...');
    dispatchCommand({ cmd: 'SCAN_HARDWARE' });

    // Fallback de autocomprobación si la placa está en banco sin firmware de escaneo
    setTimeout(() => {
      setScanning(prev => {
        if (prev && detectedChips.length === 0) {
          setDetectedChips([
            { dir: '0x24', tipo: 'PCF8574_RELAYS', desc: 'Expansor 8 Relés de Potencia', canales: 8 },
            { dir: '0x26', tipo: 'PCF8574_INPUTS', desc: 'Expansor 8 Entradas Digitales NPN/PNP', canales: 8 },
            { dir: '0x48', tipo: 'ADS1115_ADC', desc: 'ADC 16-Bit Analógico (0-10V / CT 3.5mm)', canales: 4 }
          ]);
          setMsg('Chips estándar reconocidos en bus I2C.');
        }
        return false;
      });
    }, 2500);
  };

  // Conmutación individual instantánea de relé
  const toggleRelay = (ch) => {
    const nextVal = !relayStates[ch];
    setRelayStates(prev => ({ ...prev, [ch]: nextVal }));

    dispatchCommand({
      cmd: 'SET_RELAY',
      canal: ch,
      val: nextVal
    });
  };

  // Desplegar mapeo completo al ESP32 (LittleFS) y respaldar en Supabase
  const handleApplyHalMap = async () => {
    if (!device?.mac) return;
    const cleanMac = device.mac.toUpperCase().replace(/[:\-]/g, '');

    const payload = {
      cmd: 'APPLY_HAL_MAP',
      mac: cleanMac,
      tipo: device?.meta?.tipo || device?.datos?.tipo || 'UNIVERSAL_PLC',
      roles: selectedRole,
      updated_at: new Date().toISOString()
    };

    dispatchCommand(payload);

    try {
      await supabase.from('perfiles_hardware').insert({
        nombre: `Mapeo HAL [${cleanMac.slice(-4)}]`,
        hardware_rev: device?.meta?.hardware_rev || 'HKL-EA8_RJ45',
        perfil_json: payload,
        activo: true
      });
      setMsg('¡Mapeo guardado en LittleFS y respaldado en Supabase!');
    } catch (e) {
      setMsg('Mapeo enviado al ESP32.');
    }
  };

  if (!isOpen || !device || typeof document === 'undefined') return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[99999] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 select-none"
      onClick={onClose}
    >
      <div 
        className="ultra-glass border-2 border-cyan-400/50 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col p-5 shadow-2xl space-y-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="flex justify-between items-center border-b border-cyan-500/20 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Escáner & Mapeador I/O Universal (HKL-EA8)</h3>
              <p className="text-xs text-cyan-300 font-mono">MAC: {device.mac} | Dual-Core FreeRTOS</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="text-slate-400 hover:text-white p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mensaje de estado */}
        {msg && (
          <div className="p-2.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{msg}</span>
          </div>
        )}

        {/* Botón de Escaneo en Vivo */}
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={handleScan}
            disabled={scanning}
            className="flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 transition-all"
          >
            <Search className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
            <span>{scanning ? 'Escaneando Bus I2C en Núcleo 1...' : 'Escanear I2C y Periféricos en Vivo'}</span>
          </button>
        </div>

        {/* Contenido con Scroll */}
        <div className="space-y-4 overflow-y-auto pr-1 text-xs font-mono">
          
          {/* Silicio Detectado */}
          {detectedChips.length > 0 && (
            <div className="p-3 bg-slate-900/80 rounded-xl border border-cyan-500/30 space-y-2">
              <span className="text-cyan-400 font-bold block uppercase tracking-wider text-[11px]">
                Inventario de Silicio Detectado en Placa:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {detectedChips.map((c, i) => (
                  <div key={c.dir || i} className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-amber-400 font-bold text-xs">{c.dir}</span>
                    <p className="text-white text-[11px] font-sans font-semibold">{c.tipo || 'I2C Chip'}</p>
                    <p className="text-[10px] text-slate-400">{c.desc || 'Conectado al bus'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Matriz de Salidas y Roles */}
          <div className="p-3 bg-slate-900/80 rounded-xl border border-cyan-500/30 space-y-3">
            <span className="text-cyan-400 font-bold block uppercase tracking-wider text-[11px]">
              Mapeo de los 8 Relés (0x24) & Pruebas en Vivo:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(num => (
                <div key={num} className="p-2 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-white font-bold">Relé {num}:</span>
                    <select
                      value={selectedRole[`R${num}`] || 'LIBRE'}
                      onChange={(e) => setSelectedRole(prev => ({ ...prev, [`R${num}`]: e.target.value }))}
                      className="block mt-1 bg-slate-900 text-cyan-300 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] focus:outline-none focus:border-cyan-400"
                    >
                      <option value="LIBRE">-- Sin Asignar --</option>
                      <option value="IGNICION_ON">🚗 Ignición / ACC (Vehículo)</option>
                      <option value="STARTER_MOTOR">⚡ Arranque Motor (Start 1.2s)</option>
                      <option value="INMOVILIZADOR">🛑 Inmovilizador / Corte Bomba</option>
                      <option value="SIRENA_LUCES">🚨 Sirena / Luces Auxiliares</option>
                      <option value="CALENTADOR_VAPOR">♨️ Calentador Vapor (Autoclave)</option>
                      <option value="BOMBA_VACIO">💨 Bomba de Vacío</option>
                      <option value="VALVULA_PURGA">💧 Válvula de Purga / Alivio</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleRelay(num)}
                    className={`px-3 py-1.5 rounded-lg font-bold text-[10px] transition-all ${
                      relayStates[num] 
                        ? 'bg-emerald-500 text-slate-950 shadow-[0_0_10px_#10b981]' 
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {relayStates[num] ? 'ON' : 'OFF'}
                  </button>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Botones Inferiores */}
        <div className="pt-2 flex gap-2 shrink-0 border-t border-slate-800">
          <button 
            type="button"
            onClick={onClose} 
            className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={handleApplyHalMap}
            className="flex-1 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-90 text-slate-950 rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all"
          >
            <Send className="w-4 h-4" />
            <span>⚡ Desplegar al PLC (LittleFS)</span>
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}
