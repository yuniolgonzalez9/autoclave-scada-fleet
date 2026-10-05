import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../services/supabase';
import SessionDetailModal from './SessionDetailModal';
import ClinicalTooltip from '../common/ClinicalTooltip';
import { CLINICAL_HELP } from '../../utils/clinicalDictionary';
import { 
  FileText, 
  FileSpreadsheet, 
  Printer, 
  Download, 
  Upload, 
  Trash2, 
  RotateCcw, 
  Search, 
  CheckSquare, 
  Square,
  AlertTriangle,
  CheckCircle2,
  Filter
} from 'lucide-react';

export default function ClinicalAuditView() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState(null);

  // Filtros avanzados
  const [filterDevice, setFilterDevice] = useState('TODOS');
  const [filterType, setFilterType] = useState('TODOS');
  const [filterDesde, setFilterDesde] = useState('');
  const [filterHasta, setFilterHasta] = useState('');
  const [filterLimit, setFilterLimit] = useState('100');
  const [filterText, setFilterText] = useState('');

  const [selectedIds, setSelectedIds] = useState([]);
  const fileInputRef = useRef(null);

  const fetchReports = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('reportes_autoclaves')
        .select('*')
        .order('created_at', { ascending: false });

      if (filterLimit !== 'ALL') {
        query = query.limit(parseInt(filterLimit));
      }
      if (filterDevice !== 'TODOS') {
        query = query.eq('mac', filterDevice);
      }
      if (filterDesde) {
        query = query.gte('created_at', filterDesde);
      }
      if (filterHasta) {
        query = query.lte('created_at', filterHasta + 'T23:59:59');
      }

      const { data, error } = await query;
      if (!error && data) {
        setReports(data);
      }
    } catch (e) {
      console.warn('Error cargando reportes:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [filterDevice, filterLimit, filterDesde, filterHasta]);

  const toggleSelectAll = () => {
    if (selectedIds.length === reports.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(reports.map((r) => r.session_id));
    }
  };

  const toggleSelectOne = (sessionId) => {
    setSelectedIds((prev) => 
      prev.includes(sessionId) ? prev.filter((id) => id !== sessionId) : [...prev, sessionId]
    );
  };

  const exportToExcel = () => {
    const listToExport = selectedIds.length > 0 
      ? reports.filter((r) => selectedIds.includes(r.session_id))
      : reports;

    if (!listToExport.length) return alert('No hay reportes para exportar');

    let csv = "\uFEFFID_SESION,FECHA,MAC,ALIAS,CLIENTE,MODELO,PROGRAMA,DURACION_SEG,ODOMETRO,T_MAX,P_MAX,DIAGNOSTICO\n";
    listToExport.forEach((r) => {
      csv += `"${r.session_id}","${new Date(r.created_at || r.fecha).toLocaleString()}","${r.mac}","${r.alias || 'Autoclave'}","${r.cliente || 'Clínica'}","${r.modelo || 'Clase B'}","${r.programa || '134°C'}","${r.duracion_total_seg || 0}","${r.ciclos_acumulados || 0}","${r.temp_max || 0}","${r.pres_max || 0}","${r.diagnostico_principal || 'CONFORME'}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Auditoria_Clinica_${Date.now()}.csv`;
    a.click();
  };

  const downloadBackupJSON = () => {
    if (!reports.length) return alert('No hay reportes para respaldar.');
    const backupPkg = {
      tipo: 'SCADA_CLINICAL_BACKUP_ENTERPRISE',
      fecha: new Date().toISOString(),
      total: reports.length,
      reportes: reports
    };
    const blob = new Blob([JSON.stringify(backupPkg, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `backup_auditoria_scada_${Date.now()}.json`;
    a.click();
  };

  const handleRestoreJSON = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        const list = parsed.reportes || (Array.isArray(parsed) ? parsed : null);
        if (!list || !list.length) throw new Error('Archivo JSON no válido');

        alert(`Subiendo ${list.length} paquetes a Supabase Cloud...`);
        for (const item of list) {
          await supabase.from('reportes_autoclaves').upsert(item, { onConflict: 'session_id' });
        }
        alert('¡Respaldo restaurado con éxito en la nube!');
        fetchReports();
      } catch (err) {
        alert('Error al restaurar archivo: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  const deleteSelected = async () => {
    if (!selectedIds.length) return alert('Selecciona al menos un paquete para eliminar.');
    if (!confirm(`¿Eliminar definitivamente ${selectedIds.length} paquete(s) de la base de datos de la nube?`)) return;

    try {
      await supabase.from('reportes_autoclaves').delete().in('session_id', selectedIds);
      alert('Paquetes eliminados de la nube.');
      setSelectedIds([]);
      fetchReports();
    } catch (err) {
      alert('Error eliminando: ' + err.message);
    }
  };

  const uniqueMacs = Array.from(new Set(reports.map((r) => r.mac).filter(Boolean)));

  const filteredReports = reports.filter((r) => {
    if (filterType === 'CICLO_OK' && !(r.diagnostico_principal || '').includes('CONFORME')) return false;
    if (filterType === 'ALARMA' && !((r.conteo_alarmas > 0) || (r.diagnostico_principal || '').includes('ABORTADO'))) return false;
    
    if (filterText) {
      const q = filterText.toLowerCase();
      const match = (r.session_id || '').toLowerCase().includes(q) ||
                    (r.mac || '').toLowerCase().includes(q) ||
                    (r.alias || '').toLowerCase().includes(q) ||
                    (r.cliente || '').toLowerCase().includes(q) ||
                    (r.diagnostico_principal || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const totalCiclosConformes = reports.filter((r) => (r.diagnostico_principal || '').includes('CONFORME')).length;
  const totalAlarmas = reports.filter((r) => (r.conteo_alarmas > 0) || (r.diagnostico_principal || '').includes('ABORTADO')).length;

  return (
    <div className="space-y-4">
      {/* Cabecera y Acciones con Tooltips */}
      <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-cyan-400" />
            Centro de Auditoría Clínica & Trazabilidad
          </h2>
          <p className="text-xs text-slate-300 font-mono mt-0.5">
            Registro inmutable de ciclos, desgloses cronométricos y validación ISO 17665
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Tooltip Excel */}
          <ClinicalTooltip title={CLINICAL_HELP.btn_export_excel.title} description={CLINICAL_HELP.btn_export_excel.desc} badge={CLINICAL_HELP.btn_export_excel.badge}>
            <button
              onClick={exportToExcel}
              className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-xl flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Excel (CSV)</span>
            </button>
          </ClinicalTooltip>

          {/* Tooltip Backup JSON */}
          <ClinicalTooltip title={CLINICAL_HELP.btn_backup_json.title} description={CLINICAL_HELP.btn_backup_json.desc} badge={CLINICAL_HELP.btn_backup_json.badge}>
            <button
              onClick={downloadBackupJSON}
              className="px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-bold rounded-xl flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Backup JSON</span>
            </button>
          </ClinicalTooltip>

          {/* Tooltip Restaurar */}
          <ClinicalTooltip title={CLINICAL_HELP.btn_restore_json.title} description={CLINICAL_HELP.btn_restore_json.desc} badge={CLINICAL_HELP.btn_restore_json.badge}>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 text-xs font-bold rounded-xl flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Restaurar</span>
            </button>
          </ClinicalTooltip>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleRestoreJSON}
          />

          {selectedIds.length > 0 && (
            <button
              onClick={deleteSelected}
              className="px-3 py-1.5 bg-rose-600/30 hover:bg-rose-600/40 border border-rose-500 text-rose-300 text-xs font-bold rounded-xl flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Eliminar ({selectedIds.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Tarjetas KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="ultra-glass p-3.5 rounded-xl border border-cyan-500/30 text-center">
          <span className="text-[10px] font-mono text-cyan-400 block mb-1">TOTAL SESIONES</span>
          <p className="text-2xl font-bold font-mono text-white">{reports.length}</p>
        </div>
        <div className="ultra-glass p-3.5 rounded-xl border border-emerald-500/30 text-center">
          <span className="text-[10px] font-mono text-emerald-400 block mb-1">CICLOS CONFORMES</span>
          <p className="text-2xl font-bold font-mono text-emerald-300">{totalCiclosConformes}</p>
        </div>
        <div className="ultra-glass p-3.5 rounded-xl border border-rose-500/30 text-center">
          <span className="text-[10px] font-mono text-rose-400 block mb-1">ALARMAS / FALLOS</span>
          <p className="text-2xl font-bold font-mono text-rose-400">{totalAlarmas}</p>
        </div>
        <div className="ultra-glass p-3.5 rounded-xl border border-amber-500/30 text-center">
          <span className="text-[10px] font-mono text-amber-400 block mb-1">EQUIPOS ACTIVOS</span>
          <p className="text-2xl font-bold font-mono text-amber-300">{uniqueMacs.length}</p>
        </div>
      </div>

      {/* Barra de Filtros Combinados */}
      <div className="ultra-glass p-4 rounded-xl border border-slate-800 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5">
          <div>
            <label className="block text-[10px] font-mono text-cyan-400 mb-1">AUTOCLAVE / MAC</label>
            <select
              value={filterDevice}
              onChange={(e) => setFilterDevice(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded-lg p-2 font-mono focus:outline-none"
            >
              <option value="TODOS">TODOS LOS EQUIPOS</option>
              {uniqueMacs.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-mono text-cyan-400 mb-1">ESTADO DEL CICLO</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded-lg p-2 font-mono focus:outline-none"
            >
              <option value="TODOS">TODAS LAS SESIONES</option>
              <option value="CICLO_OK">CICLOS CONFORMES</option>
              <option value="ALARMA">CON ALARMAS / ERRORES</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-mono text-cyan-400 mb-1">FECHA DESDE</label>
            <input
              type="date"
              value={filterDesde}
              onChange={(e) => setFilterDesde(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded-lg p-1.5 font-mono focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono text-cyan-400 mb-1">FECHA HASTA</label>
            <input
              type="date"
              value={filterHasta}
              onChange={(e) => setFilterHasta(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded-lg p-1.5 font-mono focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono text-cyan-400 mb-1">LÍMITE CONSULTA</label>
            <select
              value={filterLimit}
              onChange={(e) => setFilterLimit(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded-lg p-2 font-mono focus:outline-none"
            >
              <option value="50">Últimos 50 paquetes</option>
              <option value="100">Últimos 100 paquetes</option>
              <option value="300">Últimos 300 paquetes</option>
              <option value="ALL">Sin límite (Todos)</option>
            </select>
          </div>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Buscar por ID de sesión, hospital, MAC o diagnóstico..."
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400"
          />
        </div>
      </div>

      {/* Tabla Interactiva de Reportes */}
      <div className="ultra-glass rounded-2xl border border-slate-800 overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-slate-900/90 text-cyan-400 border-b border-slate-800">
            <tr>
              <th className="p-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={selectedIds.length > 0 && selectedIds.length === reports.length}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 accent-cyan-400"
                />
              </th>
              <th className="p-3">FECHA / ID SESIÓN</th>
              <th className="p-3">AUTOCLAVE & CLIENTE</th>
              <th className="p-3">HORARIOS</th>
              <th className="p-3">PROGRAMA</th>
              <th className="p-3">PICO (T° / P)</th>
              <th className="p-3">DIAGNÓSTICO</th>
              <th className="p-3 text-center">ACCIÓN</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {loading ? (
              <tr>
                <td colSpan="8" className="p-8 text-center text-slate-400">
                  Consultando paquetes clínicos en Supabase Cloud...
                </td>
              </tr>
            ) : filteredReports.length === 0 ? (
              <tr>
                <td colSpan="8" className="p-8 text-center text-slate-400">
                  No hay paquetes de sesión que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              filteredReports.map((r) => {
                const isSelected = selectedIds.includes(r.session_id);
                const huboAlarma = (r.conteo_alarmas > 0) || (r.diagnostico_principal || '').includes('ABORTADO');

                return (
                  <tr 
                    key={r.session_id} 
                    onClick={() => setSelectedSession(r)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-cyan-950/40' : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectOne(r.session_id)}
                        className="w-4 h-4 accent-cyan-400"
                      />
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-white">{new Date(r.created_at || r.fecha).toLocaleDateString()}</div>
                      <div className="text-[10px] text-cyan-400">{r.session_id}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-white">{r.alias || 'Autoclave'}</div>
                      <div className="text-[10px] text-slate-400">{r.cliente || 'Hospital Central'} • {r.mac}</div>
                    </td>
                    <td className="p-3">
                      <div>{r.hora_encendido || r.inicio_ciclo || '--'} ➔ {r.hora_apagado || '--'}</div>
                      <div className="text-[10px] text-slate-500">
                        {r.duracion_total_seg ? `${Math.floor(r.duracion_total_seg / 60)}m ${r.duracion_total_seg % 60}s` : '--'}
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-cyan-300">
                        {r.programa || '134°C'}
                      </span>
                    </td>
                    <td className="p-3">
                      <div>T: <strong>{parseFloat(r.temp_max || 0).toFixed(1)}°C</strong></div>
                      <div className="text-slate-400">P: <strong>{parseFloat(r.pres_max || 0).toFixed(2)}b</strong></div>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${
                        huboAlarma 
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' 
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      }`}>
                        {r.diagnostico_principal || 'CONFORME'}
                      </span>
                    </td>
                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setSelectedSession(r)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg text-xs"
                      >
                        👁️ Ver
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <SessionDetailModal
        isOpen={selectedSession !== null}
        onClose={() => setSelectedSession(null)}
        session={selectedSession}
      />
    </div>
  );
}
