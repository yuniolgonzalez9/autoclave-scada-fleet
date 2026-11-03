import React, { useState, useEffect } from 'react';
import { Package, Search, CheckCircle2, Clock, XCircle, Truck, RefreshCw, Ban, AlertTriangle } from 'lucide-react';
import { getPublicStatus } from '../../services/packageService';

const ESTADO_INFO = {
  REGISTRADO: { Icon: Clock, txt: 'RECIBIDO — EN ESPERA', cls: 'text-sky-300 border-sky-500/40 bg-sky-500/10', desc: 'Su paquete fue registrado y espera su turno de proceso.' },
  EN_PROCESO: { Icon: RefreshCw, txt: 'EN PROCESO', cls: 'text-amber-300 border-amber-500/40 bg-amber-500/10', desc: 'El ciclo de esterilización está en curso.' },
  ESTERILIZADO: { Icon: CheckCircle2, txt: 'ESTERILIZADO — LISTO', cls: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10', desc: 'Ciclo conforme. Puede retirar su paquete presentando su ticket.' },
  FALLIDO: { Icon: XCircle, txt: 'CICLO NO CONFORME', cls: 'text-rose-300 border-rose-500/40 bg-rose-500/10', desc: 'El ciclo no cumplió los parámetros. El paquete será reprocesado — consulte en ventanilla.' },
  ENTREGADO: { Icon: Truck, txt: 'ENTREGADO', cls: 'text-slate-300 border-slate-500/40 bg-slate-500/10', desc: 'Este paquete ya fue entregado. Gracias por usar el servicio.' },
  CADUCADO: { Icon: AlertTriangle, txt: 'VIGENCIA VENCIDA', cls: 'text-orange-300 border-orange-500/40 bg-orange-500/10', desc: 'La vigencia estéril expiró. El material debe reprocesarse antes de usarse.' },
  ANULADO: { Icon: Ban, txt: 'REGISTRO ANULADO', cls: 'text-slate-400 border-slate-600/40 bg-slate-500/10', desc: 'Este registro fue anulado. Consulte en ventanilla.' }
};

export default function PackageStatusPublic({ codigoInicial = '' }) {
  const [codigo, setCodigo] = useState(codigoInicial);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const consultar = async (c) => {
    const clean = String(c || '').replace(/\D/g, '').slice(-4);
    if (clean.length !== 4) { setResult({ ok: false, error: 'CODIGO_INVALIDO' }); return; }
    setLoading(true);
    const r = await getPublicStatus(clean);
    setResult(r);
    setLoading(false);
  };

  useEffect(() => {
    if (!codigoInicial) return undefined;
    const t = setTimeout(() => consultar(codigoInicial), 0);
    return () => clearTimeout(t);
  }, [codigoInicial]);

  const info = result?.ok ? ESTADO_INFO[result.estado] || ESTADO_INFO.REGISTRADO : null;

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4 font-mono">
      <div className="w-full max-w-md ultra-glass p-6 rounded-2xl border border-cyan-500/30 space-y-5">
        <div className="text-center space-y-1">
          <Package className="w-10 h-10 text-cyan-400 mx-auto" />
          <h1 className="text-base font-bold text-white">Consulta de Paquete</h1>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest">Central de Esterilización · Biofleet</p>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); consultar(codigo); }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="Código de 4 cifras"
              inputMode="numeric"
              autoFocus
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-slate-200 text-center text-xl font-black tracking-[0.4em]"
            />
          </div>
          <button type="submit" disabled={loading || codigo.length !== 4}
            className="px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold disabled:opacity-40">
            {loading ? '…' : 'Ver'}
          </button>
        </form>

        {result && !result.ok && (
          <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-center text-xs">
            {result.error === 'NO_ENCONTRADO'
              ? 'Código no encontrado — verifique el número de su ticket.'
              : result.error === 'CODIGO_INVALIDO'
                ? 'El código debe tener 4 cifras.'
                : `Error de consulta: ${result.error}`}
          </div>
        )}

        {info && (
          <div className={`p-4 rounded-2xl border text-center space-y-3 ${info.cls}`}>
            <info.Icon className="w-8 h-8 mx-auto" />
            <p className="font-black text-sm tracking-wider">{info.txt}</p>
            <p className="text-[11px] text-slate-300 font-sans">{info.desc}</p>
            <div className="text-[10px] text-slate-400 space-y-1 border-t border-white/10 pt-3">
              {result.contenido && <p><span className="text-slate-500">CONTENIDO:</span> {result.contenido}</p>}
              <p><span className="text-slate-500">PROGRAMA:</span> {result.programa}</p>
              {result.esterilizado_at && <p><span className="text-slate-500">ESTERILIZADO:</span> {new Date(result.esterilizado_at).toLocaleString()}</p>}
              {result.expira_at && result.estado === 'ESTERILIZADO' && (
                <p><span className="text-slate-500">VÁLIDO HASTA:</span> <span className="text-emerald-300 font-bold">{new Date(result.expira_at).toLocaleDateString()}</span></p>
              )}
            </div>
          </div>
        )}

        <p className="text-center text-[9px] text-slate-500">
          El código es temporal y se libera al entregar o vencer la vigencia.
        </p>
      </div>
    </div>
  );
}
