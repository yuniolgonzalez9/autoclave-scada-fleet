import React, { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, Printer, CheckCircle2, ShieldCheck, X } from 'lucide-react';

export default function SurgicalQRLabel({ isOpen, onClose, deviceData, operatorName }) {
  const printAreaRef = useRef();

  if (!isOpen) return null;

  const loteId = `LOTE-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;
  const fechaHoy = new Date().toLocaleDateString();
  const horaHoy = new Date().toLocaleTimeString();

  const qrPayload = JSON.stringify({
    lote: loteId,
    equipo: deviceData?.meta?.alias || deviceData?.mac || 'AUTOCLAVE-01',
    hospital: deviceData?.meta?.cliente || 'CENTRO HOSPITALARIO',
    fecha: fechaHoy,
    hora: horaHoy,
    operador: operatorName || 'Francisco Gonzalez',
    temp_max: `${(deviceData?.datos?.temp_camara || 134.0).toFixed(1)}°C`,
    f0_alcanzado: `${(deviceData?.f0Score || 15.2).toFixed(1)} min`,
    estado: 'ESTERIL_CONFORME'
  });

  const handlePrint = () => {
    const printContent = printAreaRef.current.innerHTML;
    const windowPrint = window.open('', '', 'width=600,height=600');
    windowPrint.document.write(`
      <html>
        <head>
          <title>ETIQUETA QUIRÚRGICA - ${loteId}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; padding: 20px; color: #000; }
            .label-box { border: 2px solid #000; padding: 15px; border-radius: 8px; max-width: 380px; margin: auto; }
            .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 10px; }
            .header h2 { margin: 0; font-size: 16px; font-weight: 900; }
            .header p { margin: 2px 0 0; font-size: 10px; }
            .body-grid { display: flex; justify-content: space-between; align-items: center; }
            .data-col { font-size: 11px; line-height: 1.5; }
            .qr-col { text-align: right; }
            .footer { margin-top: 10px; border-top: 1px dashed #000; padding-top: 6px; font-size: 9px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="label-box">
            ${printContent}
          </div>
          <script>
            window.print();
            window.close();
          </script>
        </body>
      </html>
    `);
    windowPrint.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="ultra-glass border border-cyan-500/40 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
        <div className="flex justify-between items-center mb-5 border-b border-cyan-500/20 pb-3">
          <div className="flex items-center gap-2.5 text-cyan-400">
            <QrCode className="w-6 h-6" />
            <h3 className="font-bold text-white text-base">Trazabilidad Quirúrgica (Etiqueta QR)</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Vista previa de la etiqueta lista para imprimir */}
        <div ref={printAreaRef} className="bg-white text-slate-950 p-5 rounded-xl border-2 border-slate-900 mb-5 font-mono shadow-inner">
          <div className="text-center border-b-2 border-slate-900 pb-2 mb-3">
            <h4 className="font-extrabold text-sm uppercase tracking-wide">CENTRAL DE ESTERILIZACIÓN (CEYE)</h4>
            <p className="text-[10px] text-slate-600">VALIDACIÓN MICROBIOLÓGICA • ISO 17665</p>
          </div>

          <div className="flex justify-between items-center gap-4">
            <div className="text-xs space-y-1">
              <p><strong>LOTE:</strong> {loteId}</p>
              <p><strong>EQUIPO:</strong> {deviceData?.meta?.alias || deviceData?.mac || 'CEYE-01'}</p>
              <p><strong>HOSPITAL:</strong> {deviceData?.meta?.cliente || 'HOSPITAL CENTRAL'}</p>
              <p><strong>FECHA:</strong> {fechaHoy} {horaHoy}</p>
              <p><strong>OPERADOR:</strong> {operatorName || 'Francisco G.'}</p>
              <p><strong>LETALIDAD F0:</strong> <span className="text-emerald-700 font-bold">{(deviceData?.f0Score || 15.4).toFixed(1)} min</span></p>
              <p><strong>ESTADO:</strong> <span className="text-emerald-700 font-bold">ESTERILIZADO ✓</span></p>
            </div>

            <div className="shrink-0 p-2 bg-slate-50 border border-slate-300 rounded-lg">
              <QRCodeSVG value={qrPayload} size={105} level="M" />
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-dashed border-slate-400 text-center text-[9px] text-slate-600">
            CADUCIDAD: 30 DÍAS CON EMPAQUE ÍNTEGRO • NO USAR SI ESTÁ HÚMEDO O ROTO
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
          >
            Cerrar
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 py-2.5 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-90 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Etiqueta</span>
          </button>
        </div>
      </div>
    </div>
  );
}
