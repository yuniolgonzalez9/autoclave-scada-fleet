import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../services/supabase';
import { 
  Cpu, 
  Search, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Send,
  RefreshCw,
  Power
} from 'lucide-react';

const ROLES_DISPONIBLES = [
  { id: 'LIBRE', label: '-- Sin Asignar / Desactivado --' },
  { id: 'CALENTADOR_VAPOR', label: '♨️ Calentador de Vapor / Resistencias' },
  { id: 'BOMBA_VACIO', label: '💨 Bomba de Vacío Fraccionado' },
  { id: 'VALVULA_PURGA', label: '💧 Válvula de Purga / Despresurización' },
  { id: 'CIERRE_SELLO', label: '🔒 Presurización de Sello de Puerta' },
  { id: 'SUCCION_SELLO', label: '🔓 Desinflado / Retracción de Sello' },
  { id: 'LLENADO_AGUA', label: '🚰 Bomba de Inyección de Agua Destilada' },
  { id: 'VENTILADOR_SECADO', label: '🌀 Turbina / Secado Forzado' },
  { id: 'IGNICION_ACC', label: '🚗 Ignición / ACC (Vehicular)' },
  { id: 'ARRANQUE_MOTOR', label: '⚡ Motor de Arranque (Start)' },
  { id: 'CORTE_COMBUSTIBLE', label: '🛑 Solenoide / Corte Bomba' },
  { id: 'SIRENA_ALARMA', label: '🚨 Sirena / Alarma Acústica' },
  { id: 'ILUMINACION_CABINA', label: '💡 Luces de Inspección / Cámara' }
];

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
  const [selectedRole, setSelectedRole] = useState({});
  const [statusMessage, setStatusMessage] = useState({ text: '', type: 'idle' });
  
  const scanTimeoutRef = useRef(null);

  // Inicializar roles según la configuración real guardada del equipo
  useEffect(() => {
    if (!device) return;

    const savedRoles = device.meta?.config_deseada?.roles_reles || 
                       device.meta?.roles_reles || 
                       {};

    const defaultRoles = {};
    for (let i = 1; i <= 8; i++) {
      defaultRoles[`R${i}`] = savedRoles[`R${i}`] || 'LIBRE';
    }
    queueMicrotask(() => setSelectedRole(defaultRoles));
  }, [device]);

  // Manejo de cierre con Escape
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    };
  }, [isOpen, handleKeyDown]);

  // Sincronizar estado físico de relés reportado en tiempo real
  useEffect(() => {
    if (device?.datos?.reles) {
      const liveMap = {};
      for (let i = 1; i <= 8; i++) {
        liveMap[i] = Boolean(Number(device.datos.reles[`R${i}`]));
      }
      queueMicrotask(() => setRelayStates(liveMap));
    }
  }, [device?.datos?.reles]);

  // Capturar respuesta real del bus I2C emitida por el ESP32
  useEffect(() => {
    if (device?.i2cReport?.chips && Array.isArray(device.i2cReport.chips)) {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
      queueMicrotask(() => {
        setDetectedChips(device.i2cReport.chips);
        setScanning(false);

        if (device.i2cReport.chips.length === 0) {
          setStatusMessage({
            text: 'Bus I2C escaneado: No se detectó ningún circuito integrado respondiendo en direcciones 0x08 a 0x77.',
            type: 'warning'
          });
        } else {
          setStatusMessage({
            text: `Bus I2C activo: Confirmada presencia física de ${device.i2cReport.chips.length} dispositivo(s).`,
            type: 'success'
          });
        }
      });
    }
  }, [device?.i2cReport]);

  // Despachador de órdenes sin intermediarios
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const dispatchCommand = useCallback((cmdPayload) => {
    if (!device?.mac) return;
    const cleanMac = device.mac.toUpperCase().replace(/[:-]/g, '');

    if (typeof sendCommand === 'function') {
      sendCommand(cleanMac, cmdPayload);
    } else if (typeof onPublishMqtt === 'function') {
      onPublishMqtt(`autoclave_med_2026/${cleanMac}/config`, cmdPayload);
    }
  }, [device?.mac, sendCommand, onPublishMqtt]);

  // Disparo del escaneo I2C físico con timeout de respuesta real
  const handleScan = () => {
    setScanning(true);
    setDetectedChips([]);
    setStatusMessage({
      text: 'Comando SCAN_HARDWARE enviado al microcontrolador. Esperando sondeo físico...',
      type: 'info'
    });

    dispatchCommand({ cmd: 'SCAN_HARDWARE' });

    // Cancelar cualquier timeout anterior
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
    }

    // Timeout de 4 segundos: Si el microcontrolador no responde, reportar fallo real
    scanTimeoutRef.current = setTimeout(() => {
      setScanning(false);
      setStatusMessage({
        text: 'FALLA DE COMUNICACIÓN I2C: La placa no devolvió reporte de hardware. Verifique cableado físico SDA/SCL, voltaje del bus y que el microcontrolador esté conectado.',
        type: 'error'
      });
    }, 4000);
  };

  // Conmutación individual directa de cada relé
  const toggleRelay = (channelNumber) => {
    const nextVal = !relayStates[channelNumber];
    setRelayStates((prev) => ({ ...prev, [channelNumber]: nextVal }));

    dispatchCommand({
      cmd: 'SET_RELAY',
      canal: channelNumber,
      val: nextVal
    });
  };

  // Grabación del mapa de hardware en LittleFS y respaldo en Supabase
  const handleApplyHalMap = async () => {
    if (!device?.mac) return;
    const cleanMac = device.mac.toUpperCase().replace(/[:-]/g, '');

    const halPayload = {
      cmd: 'APPLY_HAL_MAP',
      mac: cleanMac,
      tipo: device?.meta?.tipo || device?.datos?.tipo || 'AUTOCLAVE',
      roles: selectedRole,
      updated_at: new Date().toISOString()
    };

    dispatchCommand(halPayload);

    try {
      const { error } = await supabase.from('perfiles_hardware').insert([{
        nombre: `Mapeo HAL [${cleanMac.slice(-4)}]`,
        hardware_rev: device?.meta?.hardware_rev || 'HKL-EA8',
        perfil_json: halPayload,
        activo: true
      }]);

      if (error) throw error;

      setStatusMessage({
        text: 'Mapa de hardware transmitido al microcontrolador y registrado en base de datos.',
        type: 'success'
      });
    } catch (err) {
      setStatusMessage({
        text: `Mapa enviado al microcontrolador (Aviso BD: ${err.message})`,
        type: 'info'
      });
    }
  };

  if (!isOpen || !device || typeof document === 'undefined') return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[99999] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 select-none font-mono text-xs"
      onClick={onClose}
    >
      <div 
        className="ultra-glass border-2 border-cyan-500/50 rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col p-5 sm:p-6 shadow-2xl space-y-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="flex justify-between items-center border-b border-cyan-500/20 pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm sm:text-base">
                Diagnóstico de Hardware & Mapeo I2C
              </h3>
              <p className="text-[11px] text-cyan-300">
                Dispositivo: {device.meta?.alias || 'SCADA'} · MAC: {device.mac}
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="text-slate-400 hover:text-white p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mensajes de estado operativos */}
        {statusMessage.type !== 'idle' && (
          <div className={`p-3 rounded-xl border flex items-start gap-2.5 ${
            statusMessage.type === 'error'
              ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
              : statusMessage.type === 'warning'
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              : statusMessage.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
              : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
          }`}>
            {statusMessage.type === 'error' || statusMessage.type === 'warning' ? (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span className="leading-relaxed font-sans">{statusMessage.text}</span>
          </div>
        )}

        {/* Botón de sondeo directo */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={handleScan}
            disabled={scanning}
            className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all"
          >
            {scanning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Sondeando bus físico I2C (0x08 a 0x77)...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Ejecutar Escaneo de Bus I2C en Tiempo Real</span>
              </>
            )}
          </button>
        </div>

        {/* Cuerpo con Scroll */}
        <div className="space-y-4 overflow-y-auto pr-1 flex-1">
          
          {/* Silicio reportado por la placa */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800 space-y-2">
            <span className="text-[11px] font-bold text-cyan-400 block uppercase tracking-wider">
              Dispositivos I2C Confirmados por el Firmware ({detectedChips.length}):
            </span>
            {detectedChips.length === 0 ? (
              <div className="p-6 text-center text-slate-500 border border-dashed border-slate-800 rounded-lg font-sans">
                {scanning 
                  ? 'Consultando direcciones I2C en el microcontrolador...' 
                  : 'Ningún reporte activo. Presione "Ejecutar Escaneo" para consultar la placa física.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {detectedChips.map((c, i) => (
                  <div key={c.dir || i} className="p-2.5 rounded-lg bg-slate-900 border border-cyan-500/30">
                    <span className="text-amber-400 font-bold text-xs">{c.dir}</span>
                    <p className="text-white text-[11px] font-bold mt-0.5">{c.tipo || 'I2C Peripheral'}</p>
                    <p className="text-[10px] text-slate-400">{c.desc || 'Conectado al bus'}</p>
                    {c.canales && (
                      <span className="inline-block mt-1 text-[9px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/20">
                        {c.canales} canales
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Asignación y conmutación de los 8 relés */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">
                Mapeo Funcional y Prueba de Salidas (Relés R1 a R8):
              </span>
              <span className="text-[10px] text-slate-500">Comandos directos SET_RELAY</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => {
                const isActive = Boolean(relayStates[num]);
                return (
                  <div 
                    key={num} 
                    className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-white font-bold text-xs block">Relé R{num}</span>
                      <select
                        value={selectedRole[`R${num}`] || 'LIBRE'}
                        onChange={(e) => setSelectedRole((prev) => ({ ...prev, [`R${num}`]: e.target.value }))}
                        className="w-full mt-1 bg-slate-950 text-cyan-300 border border-slate-700 rounded px-2 py-1 text-[10px] focus:outline-none focus:border-cyan-400 font-mono"
                      >
                        {ROLES_DISPONIBLES.map((rol) => (
                          <option key={rol.id} value={rol.id}>{rol.label}</option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleRelay(num)}
                      className={`px-3 py-2 rounded-lg font-bold text-[10px] flex items-center gap-1.5 transition-all shrink-0 ${
                        isActive 
                          ? 'bg-emerald-500 text-slate-950 shadow-[0_0_12px_rgba(16,185,129,0.5)]' 
                          : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                      }`}
                    >
                      <Power className="w-3 h-3" />
                      <span>{isActive ? 'ON' : 'OFF'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Acciones inferiores */}
        <div className="pt-3 border-t border-slate-800 flex gap-2 shrink-0">
          <button 
            type="button"
            onClick={onClose} 
            className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all text-center"
          >
            Cerrar Ventana
          </button>
          <button
            type="button"
            onClick={handleApplyHalMap}
            className="flex-1 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-90 text-slate-950 rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all text-center"
          >
            <Send className="w-4 h-4" />
            <span>Desplegar Configuración HAL</span>
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}
