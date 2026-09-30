import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { FileText, FileSpreadsheet, Printer, RotateCcw, AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function ClinicalAuditView() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState('');

  const fetchReports = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('reportes_autoclaves')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (!error && data) {
        setReports(data);
      }
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  // Exportar a Excel (CSV)
  const exportToExcel = () => {
    if (!reports.length) return alert('No hay reportes para exportar');
    let csv = "\uFEFFID_SESION,FECHA,MAC,PROGRAMA,T_MAX,P_MAX,DIAGNOSTICO\n";
    reports.forEach((r) => {
      csv += `"${r.session_id}","${r.created_at || r.fecha}","${r.mac}","${r.programa || '134°C'}","${r.temp_max}","${r.pres_max}","${r.diagnostico_principal}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Auditoria_Clinica_${Date.now()}.csv`;
    a.click();
  };

  // Imprimir Certificado de Auditoría
  const printAuditPDF = () => {
    window.print();
  };

  const filtered = reports.filter((r) => 
    (r.mac || '').toLowerCase().includes(filterText.toLowerCase()) ||
    (r.diagnostico_principal || '').toLowerCase().includes(filterText.toLowerCase()) ||
    (r.session_id || '').toLowerCase().includes(filterText.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-cyan-400" />
            Centro de Auditoría Clínica & Trazabilidad
          </h2>
          <p className="text-xs text-slate-300 font-mono mt-0.5">
            Registro inmutable de ciclos y validaciones térmicas en Supabase Cloud
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={exportToExcel}
            className="px-3 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-xl flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Excel (CSV)</span>
          </button>
          <button
            onClick={printAuditPDF}
            className="px-3 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-bold rounded-xl flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir PDF</span>
          </button>
        </div>
      </div>

      <div className="ultra-glass p-4 rounded-xl border border-slate-800">
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Buscar por MAC, diagnóstico o sesión..."
          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
        />
      </div>

      {/* Tabla de Registros */}
      <div className="ultra-glass rounded-2xl border border-slate-800 overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-slate-900/90 text-cyan-400 border-b border-slate-800">
            <tr>
              <th className="p-3">FECHA / HORA</th>
              <th className="p-3">ID SESIÓN</th>
              <th className="p-3">MAC EQUIPO</th>
              <th className="p-3">MÁXIMOS</th>
              <th className="p-3">DIAGNÓSTICO</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {loading ? (
              <tr>
                <td colSpan="5" className="p-6 text-center text-slate-400">Consultando paquetes en Supabase Cloud...</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan="5" className="p-6 text-center text-slate-400">No hay paquetes de sesión registrados.</td>
              </tr>
            ) : (
              filtered.map((r, i) => (
                <tr key={i} className="hover:bg-slate-800/40">
                  <td className="p-3">{new Date(r.created_at || r.fecha).toLocaleString()}</td>
                  <td className="p-3 text-cyan-300 font-bold">{r.session_id}</td>
                  <td className="p-3">{r.mac}</td>
                  <td className="p-3">T: {r.temp_max || 0}°C | P: {r.pres_max || 0}b</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      {r.diagnostico_principal || 'CONFORME'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
