import React, { useState } from 'react';
import { supabase } from '../../services/supabase';
import ClinicalTooltip from '../common/ClinicalTooltip';
import { CLINICAL_HELP } from '../../utils/clinicalDictionary';
import { 
  Building2, 
  Cpu, 
  Lightbulb, 
  RotateCcw, 
  Trash2, 
  CheckCircle2, 
  Settings,
  Server
} from 'lucide-react';

export default function FleetManagementView({ fleet, sendCommand, onSelectDevice }) {
  const [mac, setMac] = useState('');
  const [alias, setAlias] = useState('');
  const [cliente, setCliente] = useState('');
  const [modelo, setModelo] = useState('');
  const [selectedMacForTest, setSelectedMacForTest] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');

  const macList = Object.keys(fleet);

  const handleSelectToEdit = (deviceMac) => {
    setSelectedMacForTest(deviceMac);
    const dev = fleet[deviceMac];
    setMac(deviceMac);
    setAlias(dev?.meta?.alias || `AUTOCLAVE [${deviceMac.slice(-4)}]`);
    setCliente(dev?.meta?.cliente || '');
    setModelo(dev?.meta?.modelo || 'Quirúrgico Clase B');
  };

  const handleSaveDevice = async (e) => {
    e.preventDefault();
    const cleanMac = mac.trim().toUpperCase().replace(/[:\-]/g, '');
    if (cleanMac.length < 6) return alert('Dirección MAC no válida');

    setSubmitting(true);
    setMsg('');

    const metaPayload = {
      mac: cleanMac,
      alias: alias.trim() || `AUTOCLAVE [${cleanMac.slice(-4)}]`,
      cliente: cliente.trim() || 'Hospital Metropolitano',
      modelo: modelo.trim() || 'Clase B Estándar',
      updated_at: new Date().toISOString()
    };

    try {
      await supabase.from('asignaciones_equipos').upsert(metaPayload, { onConflict: 'mac' });
      sendCommand(cleanMac, { cmd: 'SET_META', ...metaPayload });
      setMsg(`¡Autoclave [${cleanMac}] guardado y sincronizado en la nube!`);
      setMac('');
      setAlias('');
      setCliente('');
      setModelo('');
      setSelectedMacForTest(null);
    } catch (err) {
      setMsg('Error guardando en Supabase: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const testToggleMotor = () => {
    if (!selectedMacForTest) return alert('Selecciona un autoclave de la tabla primero');
    const current = fleet[selectedMacForTest]?.datos?.motor || false;
    sendCommand(selectedMacForTest, { mot_ok: !current });
  };

  const testResetAlarm = () => {
    if (!selectedMacForTest) return alert('Selecciona un autoclave de la tabla primero');
    sendCommand(selectedMacForTest, { cmd: 'RESET_ALARMA' });
  };

  return (
    <div className="space-y-4">
      <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-cyan-400" />
            Directorio & Gestión de Flota Hospitalaria
          </h2>
          <p className="text-xs text-slate-300 font-mono mt-0.5">
            Asignación de autoclaves a clínicas, salas y pruebas físicas de actuadores
          </p>
        </div>
      </div>

      {msg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{msg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Formulario */}
        <form onSubmit={handleSaveDevice} className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 space-y-3.5">
          <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            {selectedMacForTest ? `Modificar Autoclave [${selectedMacForTest}]` : '+ Registrar Nuevo Autoclave'}
          </h3>

          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1">Dirección MAC (Sin dos puntos)</label>
            <input
              type="text"
              required
              value={mac}
              onChange={(e) => setMac(e.target.value)}
              placeholder="Ej: 04B2479CA33C"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1">Alias / Quirófano / Sala</label>
            <input
              type="text"
              required
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="Ej: Quirófano Central 1"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1">Hospital / Clínica / Cliente</label>
            <input
              type="text"
              required
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              placeholder="Ej: Hospital Metropolitano"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1">Modelo de Autoclave</label>
            <input
              type="text"
              required
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              placeholder="Ej: Getinge 133HC"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90 text-white font-bold rounded-xl text-xs shadow-lg shadow-cyan-500/20"
          >
            {submitting ? 'Propagando en la nube...' : '💾 Guardar y Vincular en Nube'}
          </button>

          {/* Pruebas de Hardware con Tooltips */}
          {selectedMacForTest && (
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <span className="text-[11px] font-mono text-cyan-300 block font-bold">
                PRUEBAS DE HARDWARE EN VIVO [{selectedMacForTest}]:
              </span>
              <div className="flex gap-2">
                <ClinicalTooltip title={CLINICAL_HELP.btn_test_motor_hw.title} description={CLINICAL_HELP.btn_test_motor_hw.desc} badge={CLINICAL_HELP.btn_test_motor_hw.badge}>
                  <button
                    type="button"
                    onClick={testToggleMotor}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-cyan-500/40 text-cyan-300 text-xs font-mono rounded-lg flex items-center justify-center gap-1.5"
                  >
                    <Lightbulb className="w-3.5 h-3.5" />
                    <span>Probar LED (GPIO 2)</span>
                  </button>
                </ClinicalTooltip>

                <ClinicalTooltip title={CLINICAL_HELP.btn_test_reset_hw.title} description={CLINICAL_HELP.btn_test_reset_hw.desc} badge={CLINICAL_HELP.btn_test_reset_hw.badge}>
                  <button
                    type="button"
                    onClick={testResetAlarm}
                    className="w-full py-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-mono rounded-lg flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Alarma</span>
                  </button>
                </ClinicalTooltip>
              </div>
            </div>
          )}
        </form>

        {/* Tabla */}
        <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-white font-mono mb-2">Equipos en la Red ({macList.length})</h3>
            <p className="text-[11px] text-slate-400 font-mono mb-3">Toca cualquier autoclave para editarlo o probarlo:</p>

            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {macList.length === 0 ? (
                <div className="p-6 text-center text-xs font-mono text-slate-400">
                  Esperando que los autoclaves transmitan...
                </div>
              ) : (
                macList.map((m) => {
                  const dev = fleet[m];
                  const isOnline = Date.now() - (dev?.lastSeen || 0) < 18000;
                  const isSelected = selectedMacForTest === m;

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
                          <span className="font-bold text-xs text-white">{dev?.meta?.alias || `AUTOCLAVE [${m.slice(-4)}]`}</span>
                          <span className="text-[10px] font-mono text-cyan-400">({m})</span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {dev?.meta?.cliente || 'Hospital Central'} • {dev?.meta?.modelo || 'Clase B'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-mono border ${
                          isOnline ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        }`}>
                          {isOnline ? 'ONLINE' : 'OFFLINE'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onSelectDevice(m); }}
                          className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                          title="Entrar a Control Total"
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
