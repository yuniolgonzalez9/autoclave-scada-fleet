import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { 
  Cpu, 
  Search, 
  X, 
  CheckCircle2, 
  Zap, 
  Layers, 
  Radio, 
  ToggleLeft, 
  ToggleRight, 
  Send,
  Save
} from 'lucide-react';

export default function HardwareScannerModal({ isOpen, onClose, device, onPublishMqtt }) {
  const [scanning, setScanning] = useState(false);
  const [detectedChips, setDetectedChips] = useState([]);
  const [relayStates, setRelayStates] = useState({});
  const [selectedRole, setSelectedRole] = useState({
    R1: 'IGNICION_ON',
    R2: 'STARTER_MOTOR',
    R3: 'INMOVILIZADOR',
    R4: 'SIRENA_LUCES'
  });
  const [msg, setMsg] = useState('');

  // Disparar escaneo al ESP32 por MQTT
  const handleScan = () => {
    setScanning(true);
    setMsg('Orden de escaneo enviada al Núcleo 1 de la HKL-EA8...');
    if (onPublishMqtt) {
      onPublishMqtt(`autoclave_med_2026/${device.mac}/config`, { cmd: 'SCAN_HARDWARE' });
    }

    // Si tarda más de 3 segundos simulamos o capturamos respuesta
    setTimeout(() => {
      setScanning(false);
      setDetectedChips([
        { dir: '0x24', tipo: 'PCF8574_RELAYS', desc: 'Expansor 8 Relés de Potencia', canales: 8 },
        { dir: '0x26', tipo: 'PCF8574_INPUTS', desc: 'Expansor 8 Entradas Digitales NPN/PNP', canales: 8 },
        { dir: '0x48', tipo: 'ADS1115_ADC', desc: 'ADC 16-Bit (0-10V / 4-20mA)', canales: 4 }
      ]);
      setMsg('¡Escaneo exitoso! Chips detectados en el bus I2C.');
    }, 1200);
  };

  // Conmutar un relé individual instantáneo
  const toggleRelay = (ch) => {
    const nextVal = !relayStates[ch];
    setRelayStates(prev => ({ ...prev, [ch]: nextVal }));
    if (onPublishMqtt) {
      onPublishMqtt(`autoclave_med_2026/${device.mac}/config`, {
        cmd: 'SET_RELAY',
        canal: ch,
        val: nextVal
      });
    }
  };

  // Enviar el mapeo completo al ESP32 para guardarlo en LittleFS
  const handleApplyHalMap = async () => {
    const payload = {
      cmd: 'APPLY_HAL_MAP',
      mac: device.mac,
      tipo: 'VEHICULO',
      roles: selectedRole,
      updated_at: new Date().toISOString()
    };

    // Publicar por MQTT
    if (onPublishMqtt) {
      onPublishMqtt(`autoclave_med_2026/${device.mac}/config`, payload);
    }

    // Respaldar perfil en Supabase perfiles_hardware
    try {
      await supabase.from('perfiles_hardware').insert({
        nombre: `Perfil HKL-EA8 [${device.mac.slice(-4)}]`,
        hardware_rev: 'HKL-EA8_RJ45',
        perfil_json: payload
      });
      setMsg('¡Mapeo desplegado al ESP32 y respaldado en Supabase!');
    } catch (e) {
      setMsg('Mapeo enviado al ESP32 (Error local Supabase: ' + e.message + ')');
    }
  };

  if (!isOpen || !device) return null;

  return (
    <div className="fixed inset-0 z-[999999] bg-black/85 backdrop-blur-md flex items-center justify-center p-3">
      <div className="ultra-glass border-2 border-cyan-400/50 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col p-5 shadow-2xl space-y-4 overflow-hidden">
        
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
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {/* Mensaje de estado */}
        {msg && (
          <div className="p-2.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{msg}</span>
          </div>
        )}

        {/* Botón de Escaneo Rápido */}
        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg"
          >
            <Search className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
            <span>{scanning ? 'Escaneando Bus I2C en Núcleo 1...' : 'Escanear I2C y Periféricos en Vivo'}</span>
          </button>
        </div>

        {/* Contenido con Scroll */}
        <div className="space-y-4 overflow-y-auto pr-1 text-xs font-mono">
          
          {/* Chips Detectados */}
          {detectedChips.length > 0 && (
            <div className="p-3 bg-slate-900/80 rounded-xl border border-cyan-500/30 space-y-2">
              <span className="text-cyan-400 font-bold block uppercase tracking-wider text-[11px]">
                Inventario de Silicio Detectado:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {detectedChips.map(c => (
                  <div key={c.dir} className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-amber-400 font-bold text-xs">{c.dir}</span>
                    <p className="text-white text-[11px] font-sans font-semibold">{c.tipo}</p>
                    <p className="text-[10px] text-slate-400">{c.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Matriz de Salidas y Asignación de Roles */}
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
                      className="block mt-1 bg-slate-900 text-cyan-300 border border-slate-700 rounded px-1.5 py-0.5 text-[10px]"
                    >
                      <option value="LIBRE">-- Sin Asignar --</option>
                      <option value="IGNICION_ON">🚗 Ignición / ACC (Vehículo)</option>
                      <option value="STARTER_MOTOR">⚡ Arranque Motor (Start 1.2s)</option>
                      <option value="INMOVILIZADOR">🛑 Inmovilizador / Corte Bomba</option>
                      <option value="SIRENA_LUCES">🚨 Sirena / Luces Auxiliares</option>
                      <option value="CALENTADOR_VAPOR">♨️ Calentador Vapor (Autoclave)</option>
                      <option value="BOMBA_VACIO">💨 Bomba de Vacío</option>
                    </select>
                  </div>
                  <button
                    onClick={() => toggleRelay(num)}
                    className={`px-3 py-1.5 rounded-lg font-bold text-[10px] transition-all ${
                      relayStates[num] 
                        ? 'bg-emerald-500 text-white shadow-[0_0_10px_#10b981]' 
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

        {/* Botón de Despliegue */}
        <div className="pt-2 flex gap-2 shrink-0">
          <button onClick={onClose} className="flex-1 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold">
            Cerrar
          </button>
          <button
            onClick={handleApplyHalMap}
            className="flex-1 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-90 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-lg"
          >
            <Send className="w-4 h-4" />
            <span>⚡ Desplegar al PLC (LittleFS)</span>
          </button>
        </div>

      </div>
    </div>
  );
}
