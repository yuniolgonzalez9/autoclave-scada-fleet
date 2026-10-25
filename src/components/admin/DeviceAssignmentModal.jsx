import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { supabase } from '../../services/supabase';
import SessionDetailModal from './SessionDetailModal';
import ClinicalTooltip from '../common/ClinicalTooltip';
import { CLINICAL_HELP } from '../../utils/clinicalDictionary';
import { 
  FileText, 
  FileSpreadsheet, 
  Download, 
  Upload, 
  Trash2, 
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';

/**
 * Sanitiza valores de celda para evitar ejecuciones maliciosas de fórmulas en Excel/CSV (CWE-1236).
 */
function sanitizeCsvCell(value) {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  // Si el valor comienza con un carácter ejecutable de fórmula, neutralizarlo anteponiendo comilla simple
  const sanitized = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  return `"${sanitized.replace(/"/g, '""')}"`;
}

export default function ClinicalAuditView() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState(null);

  // Filtros de consulta
  const [filterDevice, setFilterDevice] = useState('TODOS');
  const [filterType, setFilterType] = useState('TODOS');
  const [filterDesde, setFilterDesde] = useState('');
  const [filterHasta, setFilterHasta] = useState('');
  const [filterLimit, setFilterLimit] = useState('100');
  const [filterText, setFilterText] = useState('');

  const [selectedIds, setSelectedIds] = useState([]);
  const [actionMessage, setActionMessage] = useState({ text: '', type: 'idle' });
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef(null);

  // Consulta de paquetes clínicos
  const fetchReports = useCallback(async () => {
    setLoading(true);
    setActionMessage({ text: '', type: 'idle' });

    try {
      let query = supabase
        .from('reportes_autoclaves')
        .select('*')
        .order('created_at', { ascending: false });

      if (filterLimit !== 'ALL') {
        const parsedLimit = parseInt(filterLimit, 10);
        if (!isNaN(parsedLimit) && parsedLimit > 0) {
          query = query.limit(parsedLimit);
        }
      }

      if (filterDevice && filterDevice !== 'TODOS') {
        query = query.eq('mac', filterDevice);
      }

      if (filterDesde && filterDesde.trim()) {
        query = query.gte('created_at', `${filterDesde.trim()}T00:00:00.000Z`);
      }

      if (filterHasta && filterHasta.trim()) {
        query = query.lte('created_at', `${filterHasta.trim()}T23:59:59.999Z`);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      if (data) {
        setReports(data);
      }
    } catch (e) {
      console.warn('[AUDIT] Error cargando paquetes clínicos:', e);
      setActionMessage({
        text: `Error de consulta en base de datos: ${e.message || 'Sin conexión'}`,
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  }, [filterDevice, filterLimit, filterDesde, filterHasta]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Selección múltiple
  const toggleSelectAll = () => {
    if (selectedIds.length === reports.length && reports.length > 0) {
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

  // 1. Exportación segura a Excel (CSV con UTF-8 BOM y sanitización estricta de celdas)
  const exportToExcel = () => {
    const listToExport = selectedIds.length > 0 
      ? reports.filter((r) => selectedIds.includes(r.session_id))
      : reports;

    if (!listToExport.length) {
      alert('No existen reportes clínicos disponibles para exportar con los filtros actuales.');
      return;
    }

    let csv = "\uFEFFID_SESION,FECHA,MAC,ALIAS,CLIENTE,MODELO,PROGRAMA,DURACION_SEG,ODOMETRO,T_MAX,P_MAX,DIAGNOSTICO\n";

    listToExport.forEach((r) => {
      const fecha = new Date(r.created_at || r.fecha || Date.now()).toISOString();
      const row = [
        sanitizeCsvCell(r.session_id),
        sanitizeCsvCell(fecha),
        sanitizeCsvCell(r.mac),
        sanitizeCsvCell(r.alias || 'Autoclave'),
        sanitizeCsvCell(r.cliente || 'Central Hospitalaria'),
        sanitizeCsvCell(r.modelo || 'Universal'),
        sanitizeCsvCell(r.programa || '134°C Instrumental'),
        Number(r.duracion_total_seg) || 0,
        Number(r.ciclos_acumulados) || 0,
        parseFloat(r.temp_max || 0).toFixed(1),
        parseFloat(r.pres_max || 0).toFixed(2),
        sanitizeCsvCell(r.diagnostico_principal || 'CONFORME')
      ];
      csv += row.join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Auditoria_Clinica_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // 2. Descarga de Copia de Seguridad JSON Estructurada
  const downloadBackupJSON = () => {
    if (!reports.length) {
      alert('No existen reportes clínicos para respaldar.');
      return;
    }

    const backupPkg = {
      tipo: 'SCADA_CLINICAL_BACKUP_ENTERPRISE',
      version: '2.0',
      fecha_emision: new Date().toISOString(),
      total_expedientes: reports.length,
      reportes: reports
    };

    const blob = new Blob([JSON.stringify(backupPkg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_auditoria_scada_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // 3. Restauración Atómica por Lotes (Chunking sin desbordar memoria)
  const handleRestoreJSON = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setActionMessage({ text: 'Validando archivo de respaldo JSON...', type: 'info' });

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        const list = parsed.reportes || (Array.isArray(parsed) ? parsed : null);

        if (!list || !Array.isArray(list) || list.length === 0) {
          throw new Error('El archivo no contiene un arreglo válido de expedientes clínicos.');
        }

        // Validar integridad mínima de los registros
        const validList = list.filter((item) => item && item.session_id && item.mac);

        if (validList.length === 0) {
          throw new Error('Ninguno de los registros posee campos mandatorios (session_id, mac).');
        }

        // Inserción en bloques de máximo 50 registros
        const CHUNK_SIZE = 50;
        let processedCount = 0;

        for (let i = 0; i < validList.length; i += CHUNK_SIZE) {
          const chunk = validList.slice(i, i + CHUNK_SIZE);
          const { error: upsertError } = await supabase
            .from('reportes_autoclaves')
            .upsert(chunk, { onConflict: 'session_id' });

          if (upsertError) {
            throw upsertError;
          }
          processedCount += chunk.length;
        }

        setActionMessage({
          text: `Restauración exitosa: Se importaron ${processedCount} expedientes a la base de datos.`,
          type: 'success'
        });

        fetchReports();
      } catch (err) {
        console.error('[AUDIT RESTORE ERROR]', err);
        setActionMessage({
          text: `Error al restaurar archivo: ${err.message || 'Formato corrupto'}`,
          type: 'error'
        });
      } finally {
        setIsProcessing(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };

    reader.onerror = () => {
      setIsProcessing(false);
      setActionMessage({ text: 'Error de lectura de archivo en el sistema operativo.', type: 'error' });
    };

    reader.readAsText(file);
  };

  // 4. Eliminación Segura de Registros Seleccionados
  const deleteSelected = async () => {
    if (!selectedIds.length) {
      alert('Debe seleccionar al menos un paquete para eliminar.');
      return;
    }

    if (!confirm(`¿Confirma eliminar definitivamente ${selectedIds.length} expediente(s) clínicos de la base de datos central? Esta acción es irreversible.`)) {
      return;
    }

    setIsProcessing(true);
    setActionMessage({ text: 'Eliminando registros seleccionados...', type: 'info' });

    try {
      const { error } = await supabase
        .from('reportes_autoclaves')
        .delete()
        .in('session_id', selectedIds);

      if (error) throw error;

      setActionMessage({
        text: `Se eliminaron ${selectedIds.length} paquete(s) de la base de datos.`,
        type: 'success'
      });

      setSelectedIds([]);
      fetchReports();
    } catch (err) {
      setActionMessage({
        text: `Error durante la eliminación: ${err.message}`,
        type: 'error'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Memoizaciones
  const uniqueMacs = useMemo(() => {
    return Array.from(new Set(reports.map((r) => r.mac).filter(Boolean)));
  }, [reports]);

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      const diag = (r.diagnostico_principal || '').toUpperCase();
      const hasAlarm = Number(r.conteo_alarmas) > 0 || diag.includes('ABORT') || diag.includes('FALLA') || diag.includes('ERROR');

      if (filterType === 'CICLO_OK' && !diag.includes('CONFORME')) return false;
      if (filterType === 'ALARMA' && !hasAlarm) return false;

      if (filterText.trim()) {
        const q = filterText.toLowerCase();
        const match = (r.session_id || '').toLowerCase().includes(q) ||
                      (r.mac || '').toLowerCase().includes(q) ||
                      (r.alias || '').toLowerCase().includes(q) ||
                      (r.cliente || '').toLowerCase().includes(q) ||
                      (r.diagnostico_principal || '').toLowerCase().includes(q) ||
                      (r.programa || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [reports, filterType, filterText]);

  const totalCiclosConformes = useMemo(() => {
    return reports.filter((r) => (r.diagnostico_principal || '').toUpperCase().includes('CONFORME')).length;
  }, [reports]);

  const totalAlarmas = useMemo(() => {
    return reports.filter((r) => {
      const diag = (r.diagnostico_principal || '').toUpperCase();
      return Number(r.conteo_alarmas) > 0 || diag.includes('ABORT') || diag.includes('FALLA') || diag.includes('ERROR');
    }).length;
  }, [reports]);

  return (
    <div className="clinical-audit-view space-y-4 font-mono text-xs select-none">
      
      {/* Cabecera y Acciones */}
      <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-cyan-400" />
            Centro de Auditoría Clínica & Trazabilidad
          </h2>
          <p className="text-xs text-slate-300 font-sans mt-0.5">
            Registro inmutable de ciclos, desgloses cronométricos y validación bajo norma ISO 17665
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Exportar Excel */}
          <ClinicalTooltip 
            title={CLINICAL_HELP?.btn_export_excel?.title || 'Exportar a Excel'} 
            description={CLINICAL_HELP?.btn_export_excel?.desc || 'Descarga de datos sanitizados en CSV UTF-8'} 
            badge={CLINICAL_HELP?.btn_export_excel?.badge || 'CSV'}
          >
            <button
              type="button"
              onClick={exportToExcel}
              disabled={isProcessing || reports.length === 0}
              className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow disabled:opacity-40"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Excel (CSV)</span>
            </button>
          </ClinicalTooltip>

          {/* Backup JSON */}
          <ClinicalTooltip 
            title={CLINICAL_HELP?.btn_backup_json?.title || 'Backup JSON'} 
            description={CLINICAL_HELP?.btn_backup_json?.desc || 'Respaldo integral de registros'} 
            badge={CLINICAL_HELP?.btn_backup_json?.badge || 'NUBE'}
          >
            <button
              type="button"
              onClick={downloadBackupJSON}
              disabled={isProcessing || reports.length === 0}
              className="px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Backup JSON</span>
            </button>
          </ClinicalTooltip>

          {/* Restaurar */}
          <ClinicalTooltip 
            title={CLINICAL_HELP?.btn_restore_json?.title || 'Restaurar JSON'} 
            description={CLINICAL_HELP?.btn_restore_json?.desc || 'Importación por lotes a la base de datos'} 
            badge={CLINICAL_HELP?.btn_restore_json?.badge || 'POSTGRES'}
          >
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow disabled:opacity-40"
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

          <button
            type="button"
            onClick={fetchReports}
            disabled={loading || isProcessing}
            className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow"
            title="Actualizar listado"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={deleteSelected}
              disabled={isProcessing}
              className="px-3 py-1.5 bg-rose-600/30 hover:bg-rose-600/40 border border-rose-500 text-rose-300 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Eliminar ({selectedIds.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Notificación de estado */}
      {actionMessage.type !== 'idle' && (
        <div className={`p-3 rounded-xl border flex items-center justify-between ${
          actionMessage.type === 'error'
            ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
            : actionMessage.type === 'success'
            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
            : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
        }`}>
          <div className="flex items-center gap-2">
            {actionMessage.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span className="font-sans text-xs">{actionMessage.text}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setActionMessage({ text: '', type: 'idle' })} 
            className="text-slate-400 hover:text-white font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Tarjetas KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="ultra-glass p-3.5 rounded-xl border border-cyan-500/30 text-center">
          <span className="text-[10px] text-cyan-400 block mb-1">TOTAL SESIONES</span>
          <p className="text-2xl font-bold text-white">{reports.length}</p>
        </div>
        <div className="ultra-glass p-3.5 rounded-xl border border-emerald-500/30 text-center">
          <span className="text-[10px] text-emerald-400 block mb-1">CICLOS CONFORMES</span>
          <p className="text-2xl font-bold text-emerald-300">{totalCiclosConformes}</p>
        </div>
        <div className="ultra-glass p-3.5 rounded-xl border border-rose-500/30 text-center">
          <span className="text-[10px] text-rose-400 block mb-1">ALARMAS / ANOMALÍAS</span>
          <p className="text-2xl font-bold text-rose-400">{totalAlarmas}</p>
        </div>
        <div className="ultra-glass p-3.5 rounded-xl border border-amber-500/30 text-center">
          <span className="text-[10px] text-amber-400 block mb-1">EQUIPOS REGISTRADOS</span>
          <p className="text-2xl font-bold text-amber-300">{uniqueMacs.length}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="ultra-glass p-4 rounded-xl border border-slate-800 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5">
          <div>
            <label className="block text-[10px] text-cyan-400 mb-1">AUTOCLAVE / MAC</label>
            <select
              value={filterDevice}
              onChange={(e) => setFilterDevice(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded-lg p-2 focus:outline-none"
            >
              <option value="TODOS">TODOS LOS EQUIPOS</option>
              {uniqueMacs.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] text-cyan-400 mb-1">ESTADO DEL CICLO</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded-lg p-2 focus:outline-none font-bold"
            >
              <option value="TODOS">TODAS LAS SESIONES</option>
              <option value="CICLO_OK">SOLO CONFORMES</option>
              <option value="ALARMA">CON ALARMAS / ABORTADOS</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] text-cyan-400 mb-1">FECHA DESDE</label>
            <input
              type="date"
              value={filterDesde}
              onChange={(e) => setFilterDesde(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded-lg p-1.5 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] text-cyan-400 mb-1">FECHA HASTA</label>
            <input
              type="date"
              value={filterHasta}
              onChange={(e) => setFilterHasta(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded-lg p-1.5 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] text-cyan-400 mb-1">LÍMITE CONSULTA</label>
            <select
              value={filterLimit}
              onChange={(e) => setFilterLimit(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded-lg p-2 focus:outline-none font-bold"
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
            placeholder="Buscar por ID de sesión, hospital, MAC, programa o diagnóstico..."
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400 font-sans"
          />
        </div>
      </div>

      {/* Tabla Interactiva de Reportes */}
      <div className="ultra-glass rounded-2xl border border-slate-800 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-900/90 text-cyan-400 border-b border-slate-800">
            <tr>
              <th className="p-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={selectedIds.length > 0 && selectedIds.length === reports.length}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 accent-cyan-400 cursor-pointer"
                />
              </th>
              <th className="p-3">FECHA / ID SESIÓN</th>
              <th className="p-3">AUTOCLAVE & CLIENTE</th>
              <th className="p-3">HORARIOS</th>
              <th className="p-3">PROGRAMA</th>
              <th className="p-3">PICO (T° / P)</th>
              <th className="p-3">DIAGNÓSTICO</th>
              <th className="p-3 text-center">EXPEDIENTE</th>
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
                  No existen expedientes que coincidan con los filtros aplicados.
                </td>
              </tr>
            ) : (
              filteredReports.map((r) => {
                const isSelected = selectedIds.includes(r.session_id);
                const diag = (r.diagnostico_principal || '').toUpperCase();
                const huboAlarma = Number(r.conteo_alarmas) > 0 || diag.includes('ABORT') || diag.includes('FALLA') || diag.includes('ERROR');

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
                        className="w-4 h-4 accent-cyan-400 cursor-pointer"
                      />
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-white">{new Date(r.created_at || r.fecha || Date.now()).toLocaleDateString()}</div>
                      <div className="text-[10px] text-cyan-400 font-mono">{r.session_id}</div>
                    </td>
                    <td className="p-3 font-sans">
                      <div className="font-bold text-white">{r.alias || 'Autoclave'}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{r.cliente || 'Central Hospitalaria'} • {r.mac}</div>
                    </td>
                    <td className="p-3 font-mono">
                      <div>{r.hora_encendido || r.inicio_ciclo || '--'} ➔ {r.hora_apagado || '--'}</div>
                      <div className="text-[10px] text-slate-500">
                        {r.duracion_total_seg ? `${Math.floor(r.duracion_total_seg / 60)}m ${r.duracion_total_seg % 60}s` : '--'}
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-cyan-300 font-bold font-mono">
                        {r.programa || '134°C'}
                      </span>
                    </td>
                    <td className="p-3 font-mono">
                      <div>T: <strong className="text-white">{parseFloat(r.temp_max || 0).toFixed(1)}°C</strong></div>
                      <div className="text-slate-400">P: <strong className="text-white">{parseFloat(r.pres_max || 0).toFixed(2)}b</strong></div>
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
                        type="button"
                        onClick={() => setSelectedSession(r)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg text-xs font-bold transition-all shadow"
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

      {/* Modal de Detalle Forense */}
      {selectedSession !== null && (
        <SessionDetailModal
          isOpen={selectedSession !== null}
          onClose={() => setSelectedSession(null)}
          session={selectedSession}
        />
      )}
    </div>
  );
}
