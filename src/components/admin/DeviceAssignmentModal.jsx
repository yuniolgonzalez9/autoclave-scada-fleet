import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { 
  Building2, 
  User, 
  X, 
  CheckCircle2, 
  Shield, 
  Cpu, 
  Hospital,
  Save
} from 'lucide-react';

export default function DeviceAssignmentModal({ isOpen, onClose, device, onAssignmentUpdated }) {
  const [alias, setAlias] = useState('');
  const [cliente, setCliente] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [usuarioAsignado, setUsuarioAsignado] = useState('');
  const [usersList, setUsersList] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (device) {
      setAlias(device.meta?.alias || `AUTOCLAVE [${device.mac.slice(-4)}]`);
      setCliente(device.meta?.cliente || 'Hospital Metropolitano');
      setDepartamento(device.meta?.departamento || 'Central de Esterilización (CEYE/RUMED)');
      setUsuarioAsignado(device.meta?.usuario_asignado || '');
      setMsg('');
    }
  }, [device]);

  // Cargar lista de usuarios registrados para asignarlos
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const { data } = await supabase
          .from('usuarios_scada')
          .select('usuario, nombre, rol, email')
          .eq('estado', 'ACTIVO');
        if (data) setUsersList(data);
      } catch (e) {}
    };
    if (isOpen) loadUsers();
  }, [isOpen]);

  if (!isOpen || !device) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');

    const payload = {
      mac: device.mac,
      alias: alias.trim(),
      cliente: cliente.trim(),
      departamento: departamento.trim(),
      usuario_asignado: usuarioAsignado.trim() || null,
      updated_at: new Date().toISOString()
    };

    try {
      // Guardar en Supabase asignaciones_equipos
      const { error } = await supabase
        .from('asignaciones_equipos')
        .upsert(payload, { onConflict: 'mac' });

      if (error) throw error;

      setMsg('¡Asignación guardada con éxito en la nube!');
      if (onAssignmentUpdated) onAssignmentUpdated(payload);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setMsg('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="ultra-glass border-2 border-cyan-400/50 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4">
        
        <div className="flex justify-between items-center border-b border-cyan-500/20 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Asignación de Dispositivo a Cliente</h3>
              <p className="text-xs text-cyan-300 font-mono">MAC: {device.mac}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {msg && (
          <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{msg}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-3 font-mono text-xs">
          <div>
            <label className="block text-slate-300 mb-1">Nombre / Alias del Equipo</label>
            <input
              type="text"
              required
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="Ej: Autoclave Quirófano 1"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-400 font-sans"
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-1">Hospital / Clínica / Cliente Principal</label>
            <input
              type="text"
              required
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              placeholder="Ej: Hospital Metropolitano"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-400 font-sans"
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-1">Departamento / Sala Asignada</label>
            <input
              type="text"
              required
              value={departamento}
              onChange={(e) => setDepartamento(e.target.value)}
              placeholder="Ej: CEYE / Central de Esterilización"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-400 font-sans"
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-1">Usuario / Operador Responsable Exclusivo</label>
            <select
              value={usuarioAsignado}
              onChange={(e) => setUsuarioAsignado(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-cyan-300 focus:outline-none focus:border-cyan-400"
            >
              <option value="">-- Acceso Universal (Todos los autorizados) --</option>
              {usersList.map((u) => (
                <option key={u.usuario} value={u.usuario}>
                  {u.nombre || u.usuario} ({u.rol}) - {u.usuario}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-slate-400 block mt-1">
              Si seleccionas un operador, este autoclave solo será visible para él al iniciar sesión.
            </span>
          </div>

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-lg"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Guardando...' : 'Guardar Asignación'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
