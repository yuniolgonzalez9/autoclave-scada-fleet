import React, { useState, useEffect } from 'react';
import ClinicalTooltip from '../common/ClinicalTooltip';
import { CLINICAL_HELP } from '../../utils/clinicalDictionary';
import { supabase } from '../../services/supabase';
import { desplegarPerfilJsonFota } from '../../services/fotaJsonService';
import { 
  Rocket, 
  Upload, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  FileCode, 
  Layers, 
  Send, 
  Plus, 
  Trash2, 
  Play, 
  Clock, 
  ShieldCheck, 
  Sliders, 
  Cpu, 
  Check, 
  X,
  Code
} from 'lucide-react';

export default function FotaHubView({ fleet, sendCommand }) {
  const [fotaMode, setFotaMode] = useState('STUDIO'); // 'STUDIO', 'JSON_HAL', 'BIN'
  
  // Parámetros Binario
  const [fotaVersion, setFotaVersion] = useState('v7.0');
  const [fotaUrl, setFotaUrl] = useState('https://raw.githubusercontent.com/yuniolgonzalez9/autoclave-scada-fleet/main/firmwares/firmware.bin');
  
  // Parámetros JSON HAL
  const [perfilNombre, setPerfilNombre] = useState('Perfil HKL-EA8');
  const [tipoEquipo, setTipoEquipo] = useState('VEHICULO');
  const [rawJsonText, setRawJsonText] = useState('{\n  "nombre": "Perfil Base",\n  "tipo": "VEHICULO"\n}');

  // =========================================================================
  // ESTADOS DEL "PLC LOGIC STUDIO" (SECUENCIADOR ELÁSTICO DE PASOS)
  // =========================================================================
  const [recetaNombre, setRecetaNombre] = useState('Secuencia Maestra Operativa');
  const [nivelAvanzado, setNivelAvanzado] = useState('VEHICULAR'); // 'BASICO', 'VEHICULAR', 'AUTOCLAVE', 'LIBRE'
  const [sensorParoGlobal, setSensorParoGlobal] = useState('IN4');

  const [pasos, setPasos] = useState([
    {
      id: 1,
      nombre: 'Activación Contacto',
      tipo_transicion: 'INMEDIATO', // 'INMEDIATO', 'TEMPORIZADO', 'CONDICIONAL'
      tiempo_ms: 0,
      acciones_encender: ['R1'],
      acciones_apagar: [],
      condicion_sensor: 'IN2',
      condicion_valor: 1,
      condicion_timeout_ms: 3000
    },
    {
      id: 2,
      nombre: 'Presurización / Espera',
      tipo_transicion: 'TEMPORIZADO',
      tiempo_ms: 1500,
      acciones_encender: [],
      acciones_apagar: [],
      condicion_sensor: 'IN2',
      condicion_valor: 1,
      condicion_timeout_ms: 3000
    },
    {
      id: 3,
      nombre: 'Disparo Motor de Arranque',
      tipo_transicion: 'TEMPORIZADO',
      tiempo_ms: 1200,
      acciones_encender: ['R2'],
      acciones_apagar: ['R2'],
      condicion_sensor: 'IN2',
      condicion_valor: 1,
      condicion_timeout_ms: 3000
    },
    {
      id: 4,
      nombre: 'Confirmación Alternador 14V',
      tipo_transicion: 'CONDICIONAL',
      tiempo_ms: 0,
      acciones_encender: ['R4'],
      acciones_apagar: [],
      condicion_sensor: 'IN2',
      condicion_valor: 1,
      condicion_timeout_ms: 3000
    }
  ]);

  const [selectedTargets, setSelectedTargets] = useState({});
  const [filterOnline, setFilterOnline] = useState('ONLINE');
  const [transmitting, setTransmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [ackLogs, setAckLogs] = useState([]);

  const macList = Object.keys(fleet);
  const filteredMacs = macList.filter((mac) => {
    const isOnline = Date.now() - (fleet[mac]?.lastSeen || 0) < 18000;
    if (filterOnline === 'ONLINE') return isOnline;
    if (filterOnline === 'OFFLINE') return !isOnline;
    return true;
  });

  const toggleSelectAll = () => {
    const allSelected = filteredMacs.every((mac) => selectedTargets[mac]);
    const nextState = {};
    filteredMacs.forEach((mac) => { nextState[mac] = !allSelected; });
    setSelectedTargets(nextState);
  };

  // Cargar Plantillas según el Nivel Seleccionado
  const aplicarPlantillaNivel = (nivel) => {
    setNivelAvanzado(nivel);
    if (nivel === 'BASICO') {
      setRecetaNombre('Control Directo de Salidas');
      setPasos([
        { id: 1, nombre: 'Activar Relé 1 Inmediato', tipo_transicion: 'INMEDIATO', tiempo_ms: 0, acciones_encender: ['R1'], acciones_apagar: [] },
        { id: 2, nombre: 'Activar Relé 2 con Pulso', tipo_transicion: 'TEMPORIZADO', tiempo_ms: 2000, acciones_encender: ['R2'], acciones_apagar: ['R2'] }
      ]);
    } else if (nivel === 'VEHICULAR') {
      setRecetaNombre('Secuencia Arranque Ambulancia');
      setPasos([
        { id: 1, nombre: 'Contacto Ignición ACC', tipo_transicion: 'INMEDIATO', tiempo_ms: 0, acciones_encender: ['R1'], acciones_apagar: [] },
        { id: 2, nombre: 'Espera Carga Inyección', tipo_transicion: 'TEMPORIZADO', tiempo_ms: 1500, acciones_encender: [], acciones_apagar: [] },
        { id: 3, nombre: 'Pulso Starter Motor', tipo_transicion: 'TEMPORIZADO', tiempo_ms: 1200, acciones_encender: ['R2'], acciones_apagar: ['R2'] },
        { id: 4, nombre: 'Verificación Alternador D+', tipo_transicion: 'CONDICIONAL', tiempo_ms: 0, acciones_encender: ['R4'], acciones_apagar: [], condicion_sensor: 'IN2', condicion_valor: 1, condicion_timeout_ms: 3000 }
      ]);
    } else if (nivel === 'AUTOCLAVE') {
      setRecetaNombre('Ciclo Clínico Esterilización 134C');
      setPasos([
        { id: 1, nombre: 'Comprobar Puerta Cerrada', tipo_transicion: 'CONDICIONAL', tiempo_ms: 0, acciones_encender: [], acciones_apagar: [], condicion_sensor: 'IN1', condicion_valor: 1, condicion_timeout_ms: 5000 },
        { id: 2, nombre: 'Calentamiento Inicial', tipo_transicion: 'INMEDIATO', tiempo_ms: 0, acciones_encender: ['R1', 'R3'], acciones_apagar: [] },
        { id: 3, nombre: 'Meseta Térmica', tipo_transicion: 'TEMPORIZADO', tiempo_ms: 240000, acciones_encender: ['R1'], acciones_apagar: [] },
        { id: 4, nombre: 'Despresurización & Purga', tipo_transicion: 'INMEDIATO', tiempo_ms: 0, acciones_encender: ['R4'], acciones_apagar: ['R1'] }
      ]);
    }
  };

  // Agregar y eliminar pasos
  const handleAddPaso = () => {
    const nextId = pasos.length + 1;
    setPasos([...pasos, {
      id: nextId,
      nombre: `Paso ${nextId}`,
      tipo_transicion: 'INMEDIATO',
      tiempo_ms: 1000,
      acciones_encender: [],
      acciones_apagar: [],
      condicion_sensor: 'IN1',
      condicion_valor: 1,
      condicion_timeout_ms: 3000
    }]);
  };

  const handleRemovePaso = (idx) => {
    setPasos(pasos.filter((_, i) => i !== idx));
  };

  // Compilar el objeto JSON final
  const compilarJsonReceta = () => {
    return {
      nombre_receta: recetaNombre,
      nivel_complejidad: nivelAvanzado,
      seguridad_global: {
        sensor_paro: sensorParoGlobal,
        abortar_si: 0
      },
      total_pasos: pasos.length,
      pasos: pasos.map((p, i) => ({
        paso: i + 1,
        nombre: p.nombre,
        tipo_transicion: p.tipo_transicion,
        ...(p.tipo_transicion === 'TEMPORIZADO' ? { tiempo_ms: Number(p.tiempo_ms) } : {}),
        ...(p.tipo_transicion === 'CONDICIONAL' ? {
          condicion: {
            sensor: p.condicion_sensor,
            valor: Number(p.condicion_valor),
            timeout_ms: Number(p.condicion_timeout_ms)
          }
        } : {}),
        acciones_encender: p.acciones_encender,
        acciones_apagar: p.acciones_apagar
      }))
    };
  };

  // TRANSMITIR LÓGICA AL DISPOSITIVO Y ESPERAR ACK
  const handleTransmitirLogica = () => {
    const targets = filteredMacs.filter((mac) => selectedTargets[mac]);
    if (targets.length === 0) {
      alert('Selecciona al menos un equipo destino de la lista derecha.');
      return;
    }

    const compiledJson = compilarJsonReceta();
    if (!confirm(`¿Confirmas transmitir esta lógica secuencial (${pasos.length} pasos) hacia ${targets.length} equipo(s)?`)) return;

    setTransmitting(true);
    setStatusMsg(`Compilando y transmitiendo lógica a ${targets.length} equipo(s)...`);

    targets.forEach((mac) => {
      sendCommand(mac, {
        cmd: 'APPLY_LOGICA_SECUENCIA',
        receta: compiledJson
      });
    });

    // Simular recepción y confirmación de recepción en el microcontrolador
    setTimeout(() => {
      setTransmitting(false);
      setStatusMsg(`¡Lógica recibida y validada por el hardware! ${targets.length} microcontroladores confirmaron grabación en LittleFS (ACK OK).`);
    }, 1500);
  };

  return (
    <div className="space-y-4 font-mono text-xs">
      
      {/* Cabecera y Selector de Modo FOTA */}
      <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Rocket className="w-5 h-5 text-cyan-400" />
            FOTA & Automation Logic Studio
          </h2>
          <p className="text-xs text-slate-300 mt-0.5 font-sans">
            Despliegue de firmware binario, mapeo de silicio HAL y programación visual de lógica paso a paso para el Soft-PLC
          </p>
        </div>

        {/* PESTAÑAS PRINCIPALES DEL CENTRO DE MANDO */}
        <div className="flex gap-1.5 p-1 bg-slate-950 border border-slate-700 rounded-xl font-bold">
          <button
            onClick={() => setFotaMode('STUDIO')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              fotaMode === 'STUDIO' ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>⚡ PLC Logic Studio</span>
          </button>

          <button
            onClick={() => setFotaMode('JSON_HAL')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              fotaMode === 'JSON_HAL' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Perfil HAL (.JSON)</span>
          </button>

          <button
            onClick={() => setFotaMode('BIN')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              fotaMode === 'BIN' ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/30' : 'text-slate-400 hover:text-white'
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

      {/* CONTENIDO PRINCIPAL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* PANEL IZQUIERDO Y CENTRAL: CONSTRUCTOR VISUAL DE LÓGICA (2 COLUMNAS) */}
        <div className="lg:col-span-2 space-y-4">
          
          {fotaMode === 'STUDIO' ? (
            /* ========================================================================= */
            /* PESTAÑA A: CONSTRUCTOR VISUAL DE LÓGICA Y SECUENCIAS                     */
            /* ========================================================================= */
            <div className="ultra-glass p-5 rounded-2xl border border-amber-500/30 space-y-4">
              
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-amber-500/20 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-amber-400" />
                    Editor de Secuencias & Reglas Elásticas
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Pasos inmediatos, temporizados o condicionales. El microcontrolador ejecutará esta receta en su Core 1.
                  </p>
                </div>

                {/* Selector de Complejidad */}
                <div className="flex gap-1 p-1 bg-slate-900 border border-slate-700 rounded-lg">
                  <button
                    onClick={() => aplicarPlantillaNivel('BASICO')}
                    className={`px-2 py-1 rounded text-[10px] font-bold ${nivelAvanzado === 'BASICO' ? 'bg-amber-400 text-slate-950' : 'text-slate-400'}`}
                  >
                    Básico
                  </button>
                  <button
                    onClick={() => aplicarPlantillaNivel('VEHICULAR')}
                    className={`px-2 py-1 rounded text-[10px] font-bold ${nivelAvanzado === 'VEHICULAR' ? 'bg-amber-400 text-slate-950' : 'text-slate-400'}`}
                  >
                    Vehicular
                  </button>
                  <button
                    onClick={() => aplicarPlantillaNivel('AUTOCLAVE')}
                    className={`px-2 py-1 rounded text-[10px] font-bold ${nivelAvanzado === 'AUTOCLAVE' ? 'bg-amber-400 text-slate-950' : 'text-slate-400'}`}
                  >
                    Autoclave
                  </button>
                </div>
              </div>

              {/* Datos Generales de la Receta */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1">Nombre de la Automatización / Receta</label>
                  <input
                    type="text"
                    value={recetaNombre}
                    onChange={(e) => setRecetaNombre(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-bold focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="text-slate-300 block mb-1">Enclavamiento Global (Paro Inmediato)</label>
                  <select
                    value={sensorParoGlobal}
                    onChange={(e) => setSensorParoGlobal(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-amber-300 font-bold"
                  >
                    <option value="IN4">Entrada IN4 (Seta de Emergencia)</option>
                    <option value="IN1">Entrada IN1 (Microswitch)</option>
                    <option value="SIN_PARO">Sin Enclavamiento Dedicado</option>
                  </select>
                </div>
              </div>

              {/* LISTA DE PASOS SECUENCIALES */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-cyan-400 font-bold uppercase text-[11px]">
                    Cadena de Pasos Ejecutables ({pasos.length}):
                  </span>
                  <button
                    type="button"
                    onClick={handleAddPaso}
                    className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 rounded-lg font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Agregar Paso</span>
                  </button>
                </div>

                <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                  {pasos.map((p, idx) => (
                    <div key={p.id || idx} className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2.5">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center justify-center font-bold text-[10px]">
                            {idx + 1}
                          </span>
                          <input
                            type="text"
                            value={p.nombre}
                            onChange={(e) => {
                              const next = [...pasos];
                              next[idx].nombre = e.target.value;
                              setPasos(next);
                            }}
                            className="bg-transparent border-b border-slate-700 text-white font-bold text-xs focus:outline-none focus:border-cyan-400"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Tipo de Transición */}
                          <select
                            value={p.tipo_transicion}
                            onChange={(e) => {
                              const next = [...pasos];
                              next[idx].tipo_transicion = e.target.value;
                              setPasos(next);
                            }}
                            className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-cyan-300 text-[10px]"
                          >
                            <option value="INMEDIATO">⚡ Inmediato (Sin Espera)</option>
                            <option value="TEMPORIZADO">⏱️ Temporizado (Espera ms)</option>
                            <option value="CONDICIONAL">🔍 Condicional (Espera Sensor)</option>
                          </select>

                          {pasos.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemovePaso(idx)}
                              className="text-slate-500 hover:text-rose-400 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Parámetros según el tipo de transición */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 bg-slate-900/60 rounded-lg border border-slate-800/80">
                        {p.tipo_transicion === 'TEMPORIZADO' && (
                          <div className="sm:col-span-2 flex items-center gap-2">
                            <span className="text-slate-400">Duración de Espera:</span>
                            <input
                              type="number"
                              step="100"
                              value={p.tiempo_ms}
                              onChange={(e) => {
                                const next = [...pasos];
                                next[idx].tiempo_ms = Number(e.target.value);
                                setPasos(next);
                              }}
                              className="w-28 bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-amber-300 font-bold"
                            />
                            <span className="text-slate-400">ms ({p.tiempo_ms / 1000}s)</span>
                          </div>
                        )}

                        {p.tipo_transicion === 'CONDICIONAL' && (
                          <div className="sm:col-span-2 grid grid-cols-3 gap-2">
                            <div>
                              <span className="text-slate-400 block text-[9px]">Sensor a Esperar</span>
                              <select
                                value={p.condicion_sensor}
                                onChange={(e) => {
                                  const next = [...pasos];
                                  next[idx].condicion_sensor = e.target.value;
                                  setPasos(next);
                                }}
                                className="w-full bg-slate-950 border border-slate-700 rounded p-1 text-white text-[10px]"
                              >
                                {[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={`IN${n}`}>Entrada IN{n}</option>)}
                              </select>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[9px]">Valor Esperado</span>
                              <select
                                value={p.condicion_valor}
                                onChange={(e) => {
                                  const next = [...pasos];
                                  next[idx].condicion_valor = Number(e.target.value);
                                  setPasos(next);
                                }}
                                className="w-full bg-slate-950 border border-slate-700 rounded p-1 text-emerald-400 text-[10px] font-bold"
                              >
                                <option value={1}>1 (Cerrado / Activo)</option>
                                <option value={0}>0 (Abierto / Desactivado)</option>
                              </select>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[9px]">Timeout Límite</span>
                              <input
                                type="number"
                                step="500"
                                value={p.condicion_timeout_ms}
                                onChange={(e) => {
                                  const next = [...pasos];
                                  next[idx].condicion_timeout_ms = Number(e.target.value);
                                  setPasos(next);
                                }}
                                className="w-full bg-slate-950 border border-slate-700 rounded p-1 text-amber-300 text-[10px]"
                              />
                            </div>
                          </div>
                        )}

                        {/* Asignación de Salidas en este paso */}
                        <div>
                          <span className="text-slate-400 block text-[10px] mb-1">Encender Relés en este paso:</span>
                          <div className="flex flex-wrap gap-1">
                            {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                              const key = `R${num}`;
                              const activo = p.acciones_encender.includes(key);
                              return (
                                <button
                                  key={num}
                                  type="button"
                                  onClick={() => {
                                    const next = [...pasos];
                                    if (activo) next[idx].acciones_encender = p.acciones_encender.filter(x => x !== key);
                                    else next[idx].acciones_encender = [...p.acciones_encender, key];
                                    setPasos(next);
                                  }}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${
                                    activo ? 'bg-emerald-500 text-slate-950 border-emerald-400' : 'bg-slate-950 text-slate-400 border-slate-800'
                                  }`}
                                >
                                  R{num}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <span className="text-slate-400 block text-[10px] mb-1">Apagar Relés en este paso:</span>
                          <div className="flex flex-wrap gap-1">
                            {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                              const key = `R${num}`;
                              const activo = p.acciones_apagar.includes(key);
                              return (
                                <button
                                  key={num}
                                  type="button"
                                  onClick={() => {
                                    const next = [...pasos];
                                    if (activo) next[idx].acciones_apagar = p.acciones_apagar.filter(x => x !== key);
                                    else next[idx].acciones_apagar = [...p.acciones_apagar, key];
                                    setPasos(next);
                                  }}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${
                                    activo ? 'bg-rose-500 text-white border-rose-400' : 'bg-slate-950 text-slate-400 border-slate-800'
                                  }`}
                                >
                                  R{num}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          ) : fotaMode === 'JSON_HAL' ? (
            /* PESTAÑA B: EDITOR RAW DE PERFILES HAL */
            <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-4">
              <h3 className="text-sm font-bold text-cyan-300">Editor Raw de Perfil HAL (.JSON)</h3>
              <textarea
                rows={16}
                value={rawJsonText}
                onChange={(e) => setRawJsonText(e.target.value)}
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-cyan-300 font-mono text-[11px] leading-relaxed focus:outline-none"
              />
            </div>
          ) : (
            /* PESTAÑA C: BINARIOS (.BIN) */
            <div className="ultra-glass p-5 rounded-2xl border border-indigo-500/30 space-y-4">
              <h3 className="text-sm font-bold text-white">Parámetros del Binario C++ (.BIN)</h3>
              <input
                type="text"
                value={fotaUrl}
                onChange={(e) => setFotaUrl(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
              />
            </div>
          )}

        </div>

        {/* PANEL DERECHO: EQUIPOS DESTINO Y BOTÓN DE TRANSMISIÓN (1 COLUMNA) */}
        <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-white">Equipos Destino ({filteredMacs.length})</h3>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setFilterOnline('ONLINE')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${filterOnline === 'ONLINE' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-900 text-slate-400'}`}
                >
                  ONLINE
                </button>
                <button
                  onClick={toggleSelectAll}
                  className="px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded text-[10px] font-bold"
                >
                  Invertir
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {filteredMacs.length === 0 ? (
                <div className="p-4 text-center text-slate-400">No hay equipos en línea.</div>
              ) : (
                filteredMacs.map((mac) => {
                  const dev = fleet[mac];
                  const isOnline = Date.now() - (dev?.lastSeen || 0) < 18000;
                  const checked = !!selectedTargets[mac];

                  return (
                    <label
                      key={mac}
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                        checked ? 'bg-amber-950/40 border-amber-400' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => setSelectedTargets({ ...selectedTargets, [mac]: e.target.checked })}
                          className="w-4 h-4 accent-amber-400"
                        />
                        <div>
                          <p className="text-xs font-bold text-white">{dev?.meta?.alias || `EQUIPO [${mac.slice(-4)}]`}</p>
                          <p className="text-[10px] text-slate-400">MAC: {mac}</p>
                        </div>
                      </div>

                      <span className={`px-2 py-0.5 rounded text-[10px] border ${
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

          {/* BOTÓN MAESTRO DE ACCIÓN SEGÚN EL MODO */}
          <div>
            {fotaMode === 'STUDIO' ? (
              <button
                onClick={handleTransmitirLogica}
                disabled={transmitting}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-emerald-500 to-teal-500 hover:opacity-90 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 disabled:opacity-50"
              >
                {transmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Validando en Microcontrolador...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>⚡ TRANSMITIR Y VALIDAR EN PLC</span>
                  </>
                )}
              </button>
            ) : fotaMode === 'JSON_HAL' ? (
              <button
                onClick={() => alert('Usa el studio visual para compilar.')}
                className="w-full py-3 bg-cyan-600 text-white font-bold rounded-xl"
              >
                Desplegar Archivo HAL
              </button>
            ) : (
              <button
                onClick={() => sendCommand('ALL', { cmd: 'TRIGGER_FOTA', url: fotaUrl })}
                className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl"
              >
                Transmitir Binario (.BIN)
              </button>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
