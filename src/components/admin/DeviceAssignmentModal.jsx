import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../services/supabase';
import { 
  Building2, 
  User, 
  X, 
  CheckCircle2, 
  Shield, 
  Cpu, 
  Hospital,
  Save,
  Layers,
  Car,
  Activity,
  Zap,
  Wrench
} from 'lucide-react';

export default function DeviceAssignmentModal({ isOpen, onClose, device, onAssignmentUpdated }) {
  const [alias, setAlias] = useState('');
  const [cliente, setCliente] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [usuarioAsignado, setUsuarioAsignado] = useState('');
  
  // Estados para el Catálogo Adaptativo
  const [catalogo, setCatalogo] = useState([]);
  const [tipo, setTipo] = useState('AUTOCLAVE');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [modeloManual, setModeloManual] = useState(false);

  const [usersList, setUsersList] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // 1. Cargar lista de usuarios y catálogo de equipos al abrir
  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      try {
        // Usuarios activos
        const { data: usersData } = await supabase
          .from('usuarios_scada')
          .select('usuario, nombre, rol, email')
          .eq('estado', 'ACTIVO');
        if (usersData) setUsersList(usersData);

        // Catálogo de dispositivos
        const { data: catData } = await supabase
          .from('catalogo_equipos')
          .select('tipo, marca, modelo, config_default')
          .eq('activo', true)
          .order('tipo', { ascending: true });
        if (catData) setCatalogo(catData);
      } catch (e) {
        console.error('Error cargando datos del modal:', e);
      }
    };

    loadData();
  }, [isOpen]);

  // 2. Sincronizar datos del equipo recibido
  useEffect(() => {
    if (device) {
      setAlias(device.meta?.alias || `DISPOSITIVO [${device.mac.slice(-4)}]`);
      setCliente(device.meta?.cliente || 'Hospital Metropolitano');
      setDepartamento(device.meta?.departamento || 'Central de Esterilización (CEYE/RUMED)');
      setUsuarioAsignado(device.meta?.usuario_asignado || '');
      
      const savedConfig = device.meta?.config_deseada || {};
      const savedTipo = savedConfig.tipo || (device.meta?.modelo?.includes('Staria') ? 'VEHICULO' : 'AUTOCLAVE');
      const savedMarca = savedConfig.marca || '';
      const savedModelo = device.meta?.modelo || '';

      setTipo(savedTipo);
      setMarca(savedMarca);
      setModelo(savedModelo);
      setMsg('');
    }
  }, [device]);

  // 3. Opciones derivadas del catálogo en cascada
  const tiposDisponibles = useMemo(() => {
    const setT = new Set(catalogo.map(c => c.tipo));
    if (setT.size === 0) return ['AUTOCLAVE', 'VEHICULO', 'CAMA_HOSPITALARIA', 'INCUBADORA', 'TERMODESINFECTADORA', 'PLANTA_ELECTRICA', 'PLC_GENERICO'];
    return Array.from(setT);
  }, [catalogo]);

  const marcasDisponibles = useMemo(() => {
    return Array.from(new Set(
      catalogo
        .filter(c => c.tipo === tipo)
        .map(c => c.marca)
    ));
  }, [catalogo, tipo]);

  const modelosDisponibles = useMemo(() => {
    return catalogo
      .filter(c => c.tipo === tipo && c.marca === marca)
      .map(c => c.modelo);
  }, [catalogo, tipo, marca]);

  // Ajustar marca y modelo al cambiar tipo
  const handleTipoChange = (newTipo) => {
    setTipo(newTipo);
    const marcasForTipo = Array.from(new Set(catalogo.filter(c => c.tipo === newTipo).map(c => c.marca)));
    const firstMarca = marcasForTipo[0] || '';
    setMarca(firstMarca);

    const modelosForMarca = catalogo.filter(c => c.tipo === newTipo && c.marca === firstMarca).map(c => c.modelo);
    setModelo(modelosForMarca[0] || '');
  };

  const handleMarcaChange = (newMarca) => {
    setMarca(newMarca);
    const modelosForMarca = catalogo.filter(c => c.tipo === tipo && c.marca === newMarca).map(c => c.modelo);
    setModelo(modelosForMarca[0] || '');
  };

  // Icono dinámico según el tipo seleccionado
  const renderTipoIcon = () => {
    switch (tipo) {
      case 'VEHICULO': return <Car className="w-4 h-4 text-amber-400" />;
      case 'CAMA_HOSPITALARIA': return <Activity className="w-4 h-4 text-emerald-400" />;
      case 'PLANTA_ELECTRICA': return <Zap className="w-4 h-4 text-yellow-400" />;
      case 'PLC_GENERICO': return <Wrench className="w-4 h-4 text-purple-400" />;
      default: return <Cpu className="w-4 h-4 text-cyan-400" />;
    }
  };

  if (!isOpen || !device) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');

    // Extraer config default si existe en el catálogo
    const matchedItem = catalogo.find(c => c.tipo === tipo && c.marca === marca && c.modelo === modelo);
    const existingConfig = device.meta?.config_deseada || {};

    const payload = {
      mac: device.mac,
      alias: alias.trim(),
      cliente: cliente.trim(),
      modelo: modelo.trim(),
      departamento: departamento.trim(),
      usuario_asignado: usuarioAsignado.trim() || null,
      config_deseada: {
        ...existingConfig,
        tipo,
        marca,
        modelo: modelo.trim(),
        ...(matchedItem?.config_default || {})
      },
      updated_at: new Date().toISOString()
    };

    try {
      const { error } = await supabase
        .from('asignaciones_equipos')
        .upsert(payload, { onConflict: 'mac' });

      if (error) throw error;

      setMsg('¡Asignación y perfil guardados con éxito!');
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
    <div className="fixed inset-0 z-[999999] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="ultra-glass border-2 border-cyan-400/50 rounded-2xl max-w-lg w-full max-h-[92vh] flex flex-col p-5 sm:p-6 shadow-2xl space-y-4 overflow-hidden">
        
        {/* Cabecera */}
        <div className="flex justify-between items-center border-b border-cyan-500/20 pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Asignación y Tipo de Dispositivo</h3>
              <p className="text-xs text-cyan-300 font-mono">MAC: {device.mac}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {msg && (
          <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono rounded-xl flex items-center gap-2 shrink-0">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{msg}</span>
          </div>
        )}

        {/* Formulario con scroll vertical seguro */}
        <form onSubmit={handleSave} className="space-y-3 font-mono text-xs overflow-y-auto pr-1">
          
          {/* SECCIÓN 1: PERFIL DE HARDWARE ADAPTATIVO */}
          <div className="p-3 rounded-xl bg-slate-900/80 border border-cyan-500/30 space-y-2.5">
            <div className="flex items-center justify-between pb-1 border-b border-slate-800">
              <span className="text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1.5 text-[11px]">
                {renderTipoIcon()}
                Perfil de Hardware & Comportamiento
              </span>
              <button
                type="button"
                onClick={() => setModeloManual(!modeloManual)}
                className="text-[10px] text-cyan-400 hover:underline"
              >
                {modeloManual ? '← Usar Catálogo' : '¿Ingresar Manual?'}
              </button>
            </div>

            {/* 1. Tipo */}
            <div>
              <label className="block text-slate-300 mb-1">Categoría / Tipo de Máquina</label>
              <select
                value={tipo}
                onChange={(e) => handleTipoChange(e.target.value)}
                className="w-full bg-slate-950 border border-cyan-500/40 rounded-lg p-2 text-cyan-300 focus:outline-none focus:border-cyan-400 font-bold"
              >
                {tiposDisponibles.map((t) => (
                  <option key={t} value={t}>
                    {t.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>

            {/* Si no es manual, mostramos Marca y Modelo en cascada */}
            {!modeloManual ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 mb-1">Marca / Fabricante</label>
                  <select
                    value={marca}
                    onChange={(e) => handleMarcaChange(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400"
                  >
                    {marcasDisponibles.map((m) => (
                      <option key={m} value={m}>
                        {m.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1">Modelo Específico</label>
                  <select
                    value={modelo}
                    onChange={(e) => setModelo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-cyan-200 focus:outline-none focus:border-cyan-400"
                  >
                    {modelosDisponibles.map((mod) => (
                      <option key={mod} value={mod}>{mod}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-slate-300 mb-1">Modelo / Referencia Manual</label>
                <input
                  type="text"
                  required
                  value={modelo}
                  onChange={(e) => setModelo(e.target.value)}
                  placeholder="Ej: Prototipo PLC v1"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>
            )}
          </div>

          {/* SECCIÓN 2: IDENTIFICACIÓN CLÍNICA / CLIENTE */}
          <div>
            <label className="block text-slate-300 mb-1">Nombre / Alias del Dispositivo</label>
            <input
              type="text"
              required
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="Ej: Quirófano 1 / Ambulancia Móvil"
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
            <label className="block text-slate-300 mb-1">Departamento / Sala / Ubicación</label>
            <input
              type="text"
              required
              value={departamento}
              onChange={(e) => setDepartamento(e.target.value)}
              placeholder="Ej: CEYE / Base de Ambulancias"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-400 font-sans"
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-1">Usuario / Operador Responsable</label>
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
              Si seleccionas un operador, este equipo solo será visible para él al iniciar sesión.
            </span>
          </div>

          {/* Botones */}
          <div className="pt-2 flex gap-2 shrink-0">
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
              <span>{saving ? 'Guardando...' : 'Guardar Perfil'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
