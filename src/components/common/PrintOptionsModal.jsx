import React, { useEffect, useState } from 'react';
import { X, Printer, FileDown, MonitorSmartphone } from 'lucide-react';
import { listAvailablePrinters, printDoc, getPrintPrefs, setPrintPrefs } from '../../services/printService';

// Opción de destino — componente de módulo (no creado durante render)
function TargetOption({ v, icon: Icon, label, sub, output, setOutput }) {
  return (
    <button
      type="button"
      onClick={() => setOutput(v)}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
        output === v
          ? 'border-amber-400/60 bg-amber-400/10 text-amber-200'
          : 'border-slate-700 bg-slate-900/40 text-slate-300 hover:border-slate-500'
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span>
        <span className="block text-sm font-bold">{label}</span>
        <span className="block text-[11px] text-slate-400">{sub}</span>
      </span>
    </button>
  );
}

// Modal de opciones de impresión — se abre sobre cualquier documento.
// Elegir impresora (lista real del sistema) + destino:
//   'printer' silencio · 'pdf' PDF real · 'dialog' diálogo del SO
// Persiste impresora elegida en prefs de la estación.
export default function PrintOptionsModal({ doc, onClose }) {
  const [printers, setPrinters] = useState([]);
  const [printerName, setPrinterName] = useState(getPrintPrefs().printerName || '');
  const [output, setOutput] = useState('printer');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      const ps = await listAvailablePrinters();
      if (mounted) setPrinters(ps);
    })();
    return () => { mounted = false; };
  }, []);

  if (!doc) return null;

  const go = async () => {
    setBusy(true);
    setErr('');
    if (printerName) setPrintPrefs({ printerName });
    const r = await printDoc({
      title: doc.title,
      html: doc.html,
      landscape: doc.landscape,
      printerName: printerName || undefined,
      output
    });
    setBusy(false);
    if (r?.ok) onClose?.(true);
    else setErr(r?.err || 'No se pudo imprimir');
  };

  const optProps = { output, setOutput };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => onClose?.(false)}>
      <div className="ultra-glass w-full max-w-sm rounded-2xl border border-slate-700 p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black tracking-widest text-slate-100 uppercase">Opciones de impresión</h3>
          <button onClick={() => onClose?.(false)} className="p-1 rounded-lg hover:bg-slate-800"><X className="w-4 h-4" /></button>
        </div>

        <p className="text-xs text-slate-400">{doc.title}</p>

        <div className="space-y-2">
          <TargetOption v="printer" icon={Printer} label="Impresora" sub="Silencioso a la impresora elegida" {...optProps} />
          <TargetOption v="pdf" icon={FileDown} label="Guardar como PDF" sub="Genera archivo PDF descargable" {...optProps} />
          <TargetOption v="dialog" icon={MonitorSmartphone} label="Diálogo del sistema" sub="Elige impresora/opciones del SO" {...optProps} />
        </div>

        {output === 'printer' && (
          <select
            value={printerName}
            onChange={(e) => setPrinterName(e.target.value)}
            className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-200"
          >
            <option value="">Predeterminada del sistema</option>
            {printers.map((p) => (
              <option key={p.name} value={p.name}>{p.label}{p.default ? ' (predeterminada)' : ''}</option>
            ))}
          </select>
        )}

        {err && <p className="text-xs text-red-400 font-bold">{err}</p>}

        <button
          type="button"
          onClick={go}
          disabled={busy}
          className="w-full py-2.5 rounded-xl font-bold text-sm bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-50 transition-colors"
        >
          {busy ? 'Procesando…' : output === 'pdf' ? 'Generar PDF' : 'Imprimir'}
        </button>
      </div>
    </div>
  );
}
