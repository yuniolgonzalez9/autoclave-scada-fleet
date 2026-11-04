import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Package, Printer, Plus, RefreshCw, CheckCircle2, AlertTriangle,
  Clock, XCircle, Truck, Ban, Settings2, QrCode, Search
} from 'lucide-react';
import {
  createPackage, listPackages, markDelivered, cancelPackage,
  estadoEfectivo, TTL_PRESETS
} from '../../services/packageService';
import {
  getPrintPrefs, setPrintPrefs, listAvailablePrinters, printDoc,
  buildPackageTicketDoc, buildDeliveryDoc
} from '../../services/printService';
import PrintOptionsModal from '../common/PrintOptionsModal';

const ESTADO_STYLE = {
  REGISTRADO: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  EN_PROCESO: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  ESTERILIZADO: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  FALLIDO: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
  ENTREGADO: 'bg-slate-500/15 text-slate-300 border-slate-500/40',
  ANULADO: 'bg-slate-500/15 text-slate-400 border-slate-600/40',
  CADUCADO: 'bg-orange-500/15 text-orange-300 border-orange-500/40'
};

const VIVOS = ['REGISTRADO', 'EN_PROCESO', 'ESTERILIZADO'];

function Countdown({ to }) {
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNowTs(Date.now()), 30000); return () => clearInterval(t); }, []);
  if (!to) return <span className="text-slate-500">—</span>;
  const ms = new Date(to) - nowTs;
  if (ms <= 0) return <span className="text-orange-400 font-bold">VENCIDO</span>;
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  return <span className={d < 3 ? 'text-amber-300 font-bold' : 'text-emerald-300'}>{d}d {h}h</span>;
}

// Panel de configuración de impresión (impresora + reglas auto)
function PrintSettings({ prefs, onChange, printers, loadingPrinters }) {
  return (
    <div className="ultra-glass p-4 rounded-2xl border border-slate-700 space-y-3">
      <h4 className="text-[11px] font-bold text-slate-300 flex items-center gap-2 uppercase tracking-wider">
        <Settings2 className="w-4 h-4 text-cyan-400" /> Configuración de Impresión
      </h4>
      <div className="flex flex-wrap items-center gap-2">
        <Printer className="w-4 h-4 text-slate-400" />
        <select
          value={prefs.printerName}
          onChange={(e) => onChange({ printerName: e.target.value })}
          className="flex-1 min-w-[200px] bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 text-xs"
        >
          <option value="">Predeterminada del sistema</option>
          {printers.map((p) => (
            <option key={p.name} value={p.name}>{p.label}{p.default ? ' (predet.)' : ''}</option>
          ))}
        </select>
        <span className="text-[9px] text-slate-500">{loadingPrinters ? 'detectando…' : `${printers.length} impresora(s)`}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px]">
        {[
          ['autoTicket', 'Ticket al registrar paquete'],
          ['autoInicio', 'Comprobante al iniciar ciclo'],
          ['autoFin', 'Reporte forense al finalizar']
        ].map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 p-2 rounded-xl bg-slate-900/70 border border-slate-800 cursor-pointer hover:border-cyan-500/40">
            <input
              type="checkbox"
              checked={Boolean(prefs[k])}
              onChange={(e) => onChange({ [k]: e.target.checked })}
              className="accent-cyan-500"
            />
            <span className="text-slate-300">{label}</span>
          </label>
        ))}
      </div>
      <p className="text-[9px] text-slate-500">
        Dentro del Hub la impresión es silenciosa a la impresora elegida; en navegador abre el diálogo del sistema.
      </p>
    </div>
  );
}

export default function PackagesView({ fleet = {}, sendCommand, operatorName }) {
  const [paquetes, setPaquetes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [prefs, setPrefs] = useState(getPrintPrefs);
  const [printers, setPrinters] = useState([]);
  const [loadingPrinters, setLoadingPrinters] = useState(true);
  const [search, setSearch] = useState('');
  const [verHistorial, setVerHistorial] = useState(false);

  // Formulario de alta
  const [cliente, setCliente] = useState('');
  const [contenido, setContenido] = useState('');
  const [mac, setMac] = useState('');
  const [programa, setPrograma] = useState('134°C INSTRUMENTAL');
  const [ttl, setTtl] = useState(30);
  const [creando, setCreando] = useState(false);

  const equipos = useMemo(() =>
    Object.values(fleet || {}).filter((d) => d?.mac).map((d) => ({
      mac: d.mac,
      alias: d.meta?.alias || d.mac,
      tipo: d.meta?.tipo || d.datos?.tipo || 'AUTOCLAVE'
    })), [fleet]);

  const refresh = useCallback(async () => {
    const { data, error } = await listPackages();
    if (!error) setPaquetes(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await listPackages();
      if (mounted && !error) setPaquetes(data || []);
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const ps = await listAvailablePrinters();
      if (!mounted) return;
      setPrinters(ps);
      setLoadingPrinters(false);
    })();
    return () => { mounted = false; };
  }, []);

  // MAC por defecto derivada (sin efecto): la del primer equipo de la flota
  const macEfectivo = mac || equipos[0]?.mac || '';

  const updatePrefs = (patch) => setPrefs(setPrintPrefs(patch));

  const doPrint = async (doc) => {
    const r = await printDoc({ ...doc, printerName: prefs.printerName });
    if (!r?.ok) setErrorMsg(`Impresión falló: ${r?.err || 'error desconocido'}`);
    return r?.ok;
  };

  // Prints MANUALES: abren el modal de opciones (impresora / PDF / diálogo)
  const [printJob, setPrintJob] = useState(null);
  const openPrint = (doc, fallbackTitle = 'Documento') =>
    setPrintJob({ title: doc?.title || fallbackTitle, html: doc?.html || '', landscape: doc?.landscape });

  const handleCreate = async (e) => {
    e.preventDefault();
    setMsg(''); setErrorMsg('');
    setCreando(true);
    const eq = equipos.find((x) => x.mac === macEfectivo);
    const r = await createPackage({
      mac: macEfectivo,
      equipo_alias: eq?.alias || macEfectivo,
      cliente,
      contenido,
      programa,
      dias_esterilidad: ttl,
      creado_por: operatorName
    });
    setCreando(false);
    if (!r.ok) { setErrorMsg(r.error); return; }

    setMsg(`Paquete registrado — código ${r.paquete.codigo} asignado.`);
    setCliente(''); setContenido('');
    await refresh();
    if (prefs.autoTicket) doPrint(buildPackageTicketDoc(r.paquete));
  };

  const handleDeliver = async (pkg) => {
    const { error } = await markDelivered(pkg.id);
    if (error) { setErrorMsg(error.message); return; }
    setMsg(`Paquete ${pkg.codigo} entregado — código liberado.`);
    openPrint(buildDeliveryDoc(pkg), `COMPROBANTE DE ENTREGA - ${pkg.codigo}`);
    refresh();
  };

  const handleCancel = async (pkg) => {
    if (!confirm(`¿Anular el paquete ${pkg.codigo}? El código queda libre.`)) return;
    const { error } = await cancelPackage(pkg.id);
    if (error) { setErrorMsg(error.message); return; }
    setMsg(`Paquete ${pkg.codigo} anulado.`);
    refresh();
  };

  const reprintTicket = (pkg) => openPrint(buildPackageTicketDoc(pkg), `TICKET PAQUETE - ${pkg.codigo}`);

  const vivos = paquetes.filter((p) => VIVOS.includes(estadoEfectivo(p)));
  const historial = paquetes.filter((p) => !VIVOS.includes(estadoEfectivo(p)));
  const visibles = (verHistorial ? historial : vivos).filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.codigo.includes(q) || (p.cliente || '').toLowerCase().includes(q) || (p.contenido || '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4 font-mono text-xs select-none">
      {/* Cabecera */}
      <div className="ultra-glass p-5 rounded-2xl border border-cyan-500/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-cyan-400" />
            Paquetes Estériles · Seguimiento por ID
          </h2>
          <p className="text-xs text-slate-300 font-sans mt-0.5">
            ID rotativo de 4 cifras · vigencia por duración de esterilidad · consulta pública por QR
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowConfig((v) => !v)}
            className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all shadow ${showConfig ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 hover:bg-slate-700 text-cyan-300'}`}
          >
            <Printer className="w-3.5 h-3.5" /><span>Impresión</span>
          </button>
          <button type="button" onClick={refresh} className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /><span>Actualizar</span>
          </button>
          <span className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-cyan-300 font-bold">
            Activos: {vivos.length}
          </span>
        </div>
      </div>

      {showConfig && (
        <PrintSettings prefs={prefs} onChange={updatePrefs} printers={printers} loadingPrinters={loadingPrinters} />
      )}

      {msg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" /><span>{msg}</span></div>
          <button type="button" onClick={() => setMsg('')} className="text-emerald-400 font-bold">✕</button>
        </div>
      )}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /><span>{errorMsg}</span></div>
          <button type="button" onClick={() => setErrorMsg('')} className="text-rose-400 font-bold">✕</button>
        </div>
      )}

      {/* Alta de paquete */}
      <form onSubmit={handleCreate} className="ultra-glass p-5 rounded-2xl border border-amber-500/30 space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Plus className="w-4 h-4 text-amber-400" /> Registrar Paquete Nuevo
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="space-y-1">
            <span className="text-[10px] text-slate-400 uppercase">Cliente *</span>
            <input value={cliente} onChange={(e) => setCliente(e.target.value)} required placeholder="Ej. Dra. Ramírez / Quirófano 3"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200" />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-slate-400 uppercase">Contenido</span>
            <input value={contenido} onChange={(e) => setContenido(e.target.value)} placeholder="Ej. Set instrumental menor x12"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200" />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-slate-400 uppercase">Equipo que lo procesa</span>
            <select value={macEfectivo} onChange={(e) => setMac(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200">
              {!equipos.length && <option value="">Sin equipos en la flota</option>}
              {equipos.map((eq) => <option key={eq.mac} value={eq.mac}>{eq.alias} · {eq.tipo}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-slate-400 uppercase">Programa</span>
            <select value={programa} onChange={(e) => setPrograma(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200">
              <option>134°C INSTRUMENTAL</option>
              <option>121°C POROSOS/TEXTIL</option>
              <option>FLASH / PRONTO</option>
              <option>LÍQUIDOS</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-slate-400 uppercase">Vigencia estéril (empaque)</span>
            <select value={ttl} onChange={(e) => setTtl(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200">
              {TTL_PRESETS.map((t) => <option key={t.dias} value={t.dias}>{t.label}</option>)}
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" disabled={creando || !macEfectivo}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-90 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg disabled:opacity-40 active:scale-95 transition-all">
              <QrCode className="w-4 h-4" />
              <span>{creando ? 'Asignando…' : 'Asignar ID e Imprimir'}</span>
            </button>
          </div>
        </div>
      </form>

      {/* Lista */}
      <div className="ultra-glass p-5 rounded-2xl border border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex gap-1 p-1 rounded-xl bg-slate-950/80 border border-slate-800">
            {[['vivos', `En Seguimiento (${vivos.length})`], ['historial', `Historial (${historial.length})`]].map(([id, l]) => (
              <button key={id} type="button" onClick={() => setVerHistorial(id === 'historial')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${(verHistorial ? id === 'historial' : id === 'vivos') ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar código, cliente…"
              className="bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-slate-200 w-56" />
          </div>
        </div>

        {loading ? (
          <p className="text-center text-slate-500 py-8 animate-pulse">Cargando paquetes…</p>
        ) : !visibles.length ? (
          <p className="text-center text-slate-500 py-8">
            {verHistorial ? 'Sin historial todavía.' : 'No hay paquetes activos — registre el primero arriba.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {visibles.map((p) => {
              const est = estadoEfectivo(p);
              return (
                <div key={p.id} className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-cyan-500/30 transition-all space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-2xl font-black tracking-[0.2em] text-white font-mono">{p.codigo}</span>
                    <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold border ${ESTADO_STYLE[est] || ESTADO_STYLE.REGISTRADO}`}>{est}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 space-y-0.5">
                    <p><span className="text-slate-500">CLIENTE:</span> <span className="text-slate-200">{p.cliente}</span></p>
                    {p.contenido && <p><span className="text-slate-500">CONTENIDO:</span> <span className="text-slate-300">{p.contenido}</span></p>}
                    <p><span className="text-slate-500">EQUIPO:</span> {p.equipo_alias || p.mac}</p>
                    <p><span className="text-slate-500">PROGRAMA:</span> {p.programa}</p>
                    {est === 'ESTERILIZADO' && (
                      <p className="flex items-center gap-1"><Clock className="w-3 h-3 text-slate-500" /> Vigencia: <Countdown to={p.expira_at} /></p>
                    )}
                    {est === 'EN_PROCESO' && (
                      <p className="text-amber-300 flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> Procesando desde {new Date(p.iniciado_at || p.creado_at).toLocaleTimeString()}</p>
                    )}
                  </div>
                  <div className="flex gap-1.5 pt-1">
                    <button type="button" onClick={() => reprintTicket(p)} title="Reimprimir ticket"
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300"><Printer className="w-3.5 h-3.5" /></button>
                    {est === 'ESTERILIZADO' && (
                      <button type="button" onClick={() => handleDeliver(p)}
                        className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-1 text-[10px]">
                        <Truck className="w-3.5 h-3.5" /> Entregar
                      </button>
                    )}
                    {(est === 'REGISTRADO' || est === 'EN_PROCESO') && (
                      <button type="button" onClick={() => handleCancel(p)}
                        className="p-1.5 rounded-lg bg-rose-900/40 hover:bg-rose-900/70 text-rose-300 border border-rose-500/30"><Ban className="w-3.5 h-3.5" /></button>
                    )}
                    {est === 'FALLIDO' && <span className="text-[9px] text-rose-400 flex items-center gap-1"><XCircle className="w-3 h-3" /> Ciclo no conforme — reprocesar</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {printJob && <PrintOptionsModal doc={printJob} onClose={() => setPrintJob(null)} />}
    </div>
  );
}
