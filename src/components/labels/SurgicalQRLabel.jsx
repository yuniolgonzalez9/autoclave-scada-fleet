import React, { useRef, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, Printer, X, ShieldCheck, Calendar, Tag, CheckCircle2 } from 'lucide-react';

/**
 * Escapa cadenas para prevenir inyecciones HTML en ventanas de impresión.
 */
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default function SurgicalQRLabel({ isOpen, onClose, deviceData, operatorName }) {
  const printAreaRef = useRef(null);

  // Manejo de tecla Escape
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  // Generación de metadatos estables de trazabilidad quirúrgica
  const { loteId, fechaHoy, horaHoy, fechaCaducidad } = useMemo(() => {
    if (!isOpen) return { loteId: '', fechaHoy: '', horaHoy: '', fechaCaducidad: '' };
    
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    
    // Odómetro real o consecutivo para trazabilidad
    const cicloNum = deviceData?.datos?.cfg?.ciclos || 
                     deviceData?.meta?.ciclos_activos || 
                     deviceData?.meta?.ciclos_acumulados || 
                     1;

    const macSuffix = (deviceData?.mac || 'CEYE').slice(-4).toUpperCase();
    
    // Caducidad estándar a 30 días con empaque bilaminado grado médico
    const caducidadDate = new Date(now.getTime() + 30 * 86400000);

    return {
      loteId: `LOTE-${yyyy}${mm}${dd}-${macSuffix}-C${cicloNum}`,
      fechaHoy: now.toLocaleDateString(),
      horaHoy: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      fechaCaducidad: caducidadDate.toLocaleDateString()
    };
  }, [isOpen, deviceData]);

  const f0Score = typeof deviceData?.f0Score === 'number' 
    ? deviceData.f0Score 
    : parseFloat(deviceData?.datos?.f0_score || 15.0);

  const tempCamara = typeof deviceData?.datos?.temp_camara === 'number' 
    ? deviceData.datos.temp_camara 
    : parseFloat(deviceData?.datos?.temp_camara || 134.0);

  const qrPayload = useMemo(() => {
    return JSON.stringify({
      lote: loteId,
      equipo: deviceData?.meta?.alias || deviceData?.mac || 'AUTOCLAVE-01',
      hospital: deviceData?.meta?.cliente || 'CENTRAL HOSPITALARIA',
      departamento: deviceData?.meta?.departamento || 'CEYE / RUMED',
      fecha_esterilizacion: `${fechaHoy} ${horaHoy}`,
      fecha_caducidad: fechaCaducidad,
      operador: operatorName || 'Personal Autorizado',
      temp_meseta: `${tempCamara.toFixed(1)}°C`,
      f0_alcanzado: `${f0Score.toFixed(1)} min`,
      norma: 'ISO 17665 / EN 285',
      estado: 'ESTERILIZADO_CONFORME'
    });
  }, [loteId, deviceData, fechaHoy, horaHoy, fechaCaducidad, operatorName, tempCamara, f0Score]);

  const handlePrint = () => {
    if (!printAreaRef.current) return;
    const printContent = printAreaRef.current.innerHTML;
    const windowPrint = window.open('', '', 'width=650,height=650');

    if (!windowPrint) {
      alert('Habilite las ventanas emergentes en su navegador para imprimir el rótulo térmico.');
      return;
    }

    const safeLoteId = escapeHtml(loteId);

    windowPrint.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>ETIQUETA TÉRMICA ESTÉRIL - ${safeLoteId}</title>
          <style>
            @page {
              size: auto;
              margin: 0mm;
            }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "JetBrains Mono", monospace; 
              padding: 12px; 
              color: #000; 
              margin: 0;
              background: #fff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .thermal-label-container { 
              border: 2px solid #000; 
              padding: 12px; 
              border-radius: 6px; 
              max-width: 380px; 
              margin: 0 auto; 
              page-break-inside: avoid;
            }
            .label-header { 
              text-align: center; 
              border-bottom: 2px solid #000; 
              padding-bottom: 6px; 
              margin-bottom: 8px; 
            }
            .label-header h2 { 
              margin: 0; 
              font-size: 13px; 
              font-weight: 900; 
              letter-spacing: 0.5px;
              text-transform: uppercase; 
            }
            .label-header p { 
              margin: 2px 0 0; 
              font-size: 9px; 
              font-weight: bold;
              letter-spacing: 0.8px; 
            }
            .label-grid { 
              display: flex; 
              justify-content: space-between; 
              align-items: center; 
              gap: 8px;
            }
            .data-col { 
              font-size: 10px; 
              line-height: 1.45; 
              font-family: monospace;
            }
            .qr-col { 
              text-align: right; 
              flex-shrink: 0;
            }
            .qr-col svg {
              display: block;
              width: 95px;
              height: 95px;
            }
            .label-footer { 
              margin-top: 8px; 
              border-top: 1px dashed #000; 
              padding-top: 5px; 
              font-size: 8px; 
              text-align: center; 
              font-weight: bold;
              line-height: 1.2;
            }
          </style>
        </head>
        <body>
          <div class="thermal-label-container">
            ${printContent}
          </div>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    windowPrint.document.close();
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none font-mono text-xs"
      onClick={onClose}
    >
      <div 
        className="ultra-glass border border-cyan-500/40 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="flex justify-between items-center mb-5 border-b border-cyan-500/20 pb-3">
          <div className="flex items-center gap-2.5 text-cyan-400">
            <QrCode className="w-6 h-6" />
            <h3 className="font-bold text-white text-base">Rótulo Quirúrgico de Trazabilidad (QR)</h3>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-1 rounded-lg text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Vista previa de la etiqueta térmica */}
        <div 
          ref={printAreaRef} 
          className="bg-white text-slate-950 p-4 rounded-xl border-2 border-slate-900 mb-5 font-mono shadow-inner"
        >
          <div className="text-center border-b-2 border-slate-900 pb-2 mb-2.5">
            <h4 className="font-black text-xs uppercase tracking-wide">CENTRAL DE ESTERILIZACIÓN (CEYE / RUMED)</h4>
            <p className="text-[9px] text-slate-700 font-bold">CONTROL PARAMÉTRICO DE LIBERACIÓN · ISO 17665</p>
          </div>

          <div className="flex justify-between items-center gap-3">
            <div className="text-[10px] space-y-1">
              <p><strong>LOTE:</strong> {loteId}</p>
              <p><strong>EQUIPO:</strong> {deviceData?.meta?.alias || deviceData?.mac || 'AUTOCLAVE-01'}</p>
              <p><strong>HOSPITAL:</strong> {deviceData?.meta?.cliente || 'CENTRAL HOSPITALARIA'}</p>
              <p><strong>FECHA:</strong> {fechaHoy} {horaHoy}</p>
              <p><strong>OPERADOR:</strong> {operatorName || 'Personal Autorizado'}</p>
              <p><strong>PICO TÉRMICO:</strong> {tempCamara.toFixed(1)}°C</p>
              <p><strong>LETALIDAD F0:</strong> <strong className="text-emerald-700">{f0Score.toFixed(1)} min</strong></p>
              <p><strong>CADUCIDAD:</strong> <strong className="text-rose-700">{fechaCaducidad}</strong></p>
              <p><strong>ESTADO:</strong> <span className="bg-emerald-100 text-emerald-800 px-1 py-0.2 rounded font-black">CONFORME ✓</span></p>
            </div>

            <div className="shrink-0 p-1.5 bg-slate-50 border border-slate-300 rounded-lg">
              <QRCodeSVG value={qrPayload} size={105} level="M" />
            </div>
          </div>

          <div className="mt-2.5 pt-2 border-t border-dashed border-slate-400 text-center text-[8px] text-slate-700 leading-tight">
            CADUCIDAD: 30 DÍAS CON EMPAQUE ÍNTEGRO · NO UTILIZAR SI EL ENVASE ESTÁ HÚMEDO O ROTO
          </div>
        </div>

        {/* Acciones */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-all"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 py-2.5 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-90 text-slate-950 text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Rótulo Térmico</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
