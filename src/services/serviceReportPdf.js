import { folioFromNumero } from './deviceService';

const fmtDate = (v) => (v ? new Date(v).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export function serviceDurationText(r) {
  if (!r?.inicio_atencion || !r?.fin_atencion) return '—';
  const min = Math.max(0, Math.round((new Date(r.fin_atencion) - new Date(r.inicio_atencion)) / 60000));
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

export async function computeReportHash(r) {
  const canonical = JSON.stringify([
    r.numero, r.mac, r.falla_reportada, r.tecnico, r.inicio_atencion, r.fin_atencion,
    r.diagnostico, r.trabajo_realizado, r.repuestos, r.recomendaciones, r.estado_equipo_final, r.recibido_por, r.cerrado_en
  ]);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export async function generateServiceReportPdf(report, { emitidoPor = '' } = {}) {
  const [{ jsPDF }, autoTableMod, QRCode] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('qrcode')
  ]);
  const autoTable = autoTableMod.default || autoTableMod.autoTable;
  const hash = report.hash_certificado || await computeReportHash(report);
  const folio = folioFromNumero(report.numero);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  const navy = [15, 23, 42];
  const cyan = [8, 145, 178];
  let y = 0;

  doc.setFillColor(...navy);
  doc.rect(0, 0, W, 34, 'F');
  doc.setFillColor(...cyan);
  doc.rect(0, 34, W, 1.2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('BIOFLEET OS · SCADA', M, 11);
  doc.setFontSize(15);
  doc.text('CERTIFICADO DE SERVICIO TÉCNICO', M, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Emitido: ${fmtDate(new Date())}${emitidoPor ? `  ·  Por: ${emitidoPor}` : ''}`, M, 27);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(folio, W - M, 18, { align: 'right' });
  doc.setFontSize(8);
  const estadoColor = report.estado === 'CERRADO' ? [16, 185, 129] : report.estado === 'EN_PROCESO' ? [245, 158, 11] : [244, 63, 94];
  doc.setFillColor(...estadoColor);
  const estadoTxt = report.estado === 'EN_PROCESO' ? 'EN PROCESO' : report.estado;
  const tw = doc.getTextWidth(estadoTxt) + 6;
  doc.roundedRect(W - M - tw, 22, tw, 6, 1.5, 1.5, 'F');
  doc.text(estadoTxt, W - M - tw / 2, 26.2, { align: 'center' });
  y = 42;

  doc.setTextColor(...navy);
  const kvTable = (title, rows) => {
    autoTable(doc, {
      startY: y,
      head: [[{ content: title, colSpan: 4 }]],
      body: rows,
      theme: 'grid',
      margin: { left: M, right: M },
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2, textColor: navy, lineColor: [203, 213, 225] },
      headStyles: { fillColor: [241, 245, 249], textColor: navy, fontStyle: 'bold', fontSize: 9 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 34, fillColor: [248, 250, 252] }, 2: { fontStyle: 'bold', cellWidth: 34, fillColor: [248, 250, 252] } }
    });
    y = doc.lastAutoTable.finalY + 5;
  };

  kvTable('1. DATOS DEL EQUIPO', [
    ['Equipo', report.equipo_alias || '—', 'MAC', report.mac || '—'],
    ['Modelo', report.equipo_modelo || '—', 'Tipo', report.equipo_tipo || '—'],
    ['Cliente', report.cliente || '—', 'Departamento', report.departamento || '—'],
    ['Ciclos al momento', report.ciclos_al_momento ?? '—', 'Estado final', report.estado_equipo_final || '—']
  ]);

  kvTable('2. DATOS DEL SERVICIO', [
    ['Folio', folio, 'Tipo de servicio', report.tipo_servicio || '—'],
    ['Prioridad', report.prioridad || '—', 'Reportado por', report.reportado_por || '—'],
    ['Fecha de reporte', fmtDate(report.created_at), 'Técnico', report.tecnico || '—'],
    ['Inicio de atención', fmtDate(report.inicio_atencion), 'Fin de atención', fmtDate(report.fin_atencion)],
    ['Tiempo de atención', serviceDurationText(report), 'Cierre', fmtDate(report.cerrado_en)]
  ]);

  const section = (title, text) => {
    const body = (text || '').trim() || 'Sin información registrada.';
    const lines = doc.splitTextToSize(body, W - 2 * M - 6);
    const blockH = lines.length * 4.2 + 12;
    if (y + Math.min(blockH, 40) > H - 30) { doc.addPage(); y = 18; }
    doc.setFillColor(...cyan);
    doc.rect(M, y, 1.4, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(title, M + 4, y + 4.5);
    y += 9;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    lines.forEach((ln) => {
      if (y > H - 28) { doc.addPage(); y = 18; }
      doc.text(ln, M + 4, y);
      y += 4.2;
    });
    y += 4;
  };

  section('3. FALLA REPORTADA', report.falla_reportada);
  section('4. DIAGNÓSTICO TÉCNICO', report.diagnostico);
  section('5. TRABAJO REALIZADO', report.trabajo_realizado);

  const repuestos = Array.isArray(report.repuestos) ? report.repuestos.filter((p) => p?.descripcion) : [];
  if (repuestos.length) {
    autoTable(doc, {
      startY: y,
      head: [['6. REPUESTOS / MATERIALES', 'Referencia', 'Cant.']],
      body: repuestos.map((p) => [p.descripcion, p.referencia || '—', p.cantidad || 1]),
      theme: 'striped',
      margin: { left: M, right: M },
      styles: { fontSize: 8.5, cellPadding: 2, textColor: navy },
      headStyles: { fillColor: navy, textColor: 255 },
      columnStyles: { 2: { halign: 'center', cellWidth: 16 } }
    });
    y = doc.lastAutoTable.finalY + 6;
  }
  section(repuestos.length ? '7. RECOMENDACIONES' : '6. RECOMENDACIONES', report.recomendaciones);

  if (y > H - 62) { doc.addPage(); y = 20; }
  y += 14;
  const colW = (W - 2 * M - 12) / 2;
  doc.setDrawColor(...navy);
  [[report.tecnico, 'Técnico responsable'], [report.recibido_por, 'Recibido / conformidad del cliente']].forEach(([name, role], i) => {
    const x = M + i * (colW + 12);
    doc.line(x, y, x + colW, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(name || ' ', x + colW / 2, y + 5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(role, x + colW / 2, y + 9, { align: 'center' });
  });

  const qr = await QRCode.toDataURL(`${folio}|${report.mac}|${hash}`, { margin: 0, width: 160 });
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(203, 213, 225);
    doc.line(M, H - 20, W - M, H - 20);
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`Código de verificación SHA-256: ${hash.slice(0, 32)}`, M, H - 15);
    doc.text(hash.slice(32), M, H - 11.5);
    doc.text(`${folio} · Página ${p} de ${pages}`, W - M - 20, H - 7, { align: 'right' });
    if (p === pages) doc.addImage(qr, 'PNG', W - M - 16, H - 19, 15, 15);
  }

  doc.save(`${folio}_${(report.equipo_alias || report.mac || 'equipo').replace(/[^\w-]+/g, '_')}.pdf`);
  return hash;
}
