import { Component } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * ErrorBoundary — acota fallos de render por sección.
 * Si una vista explota, muestra un panel de recuperación con el
 * estilo del producto en vez de dejar toda la app en blanco.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.handleReset = this.handleReset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    try {
      console.error('[ErrorBoundary]', error, info?.componentStack);
    } catch (_) {}
  }

  handleReset() {
    // Chunk de deploy viejo: el remount reutiliza el mismo index con
    // hashes muertos y vuelve a fallar — recarga dura del documento.
    const msg = String(this.state.error?.message || this.state.error || '');
    if (/dynamically imported|Loading chunk|ChunkLoadError/i.test(msg)) {
      window.location.reload();
      return;
    }
    this.setState({ error: null });
    this.props.onReset?.();
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="ultra-glass rounded-2xl border border-rose-500/40 p-6 max-w-md w-full text-center space-y-4 font-mono">
          <div className="w-12 h-12 mx-auto rounded-xl bg-rose-500/15 border border-rose-500/40 flex items-center justify-center text-rose-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-widest">
              Módulo interrumpido
            </h3>
            <p className="text-[11px] text-slate-400 mt-1 font-sans">
              Esta sección encontró un error inesperado. El resto del sistema sigue operativo.
            </p>
            <p className="text-[10px] text-rose-300/70 mt-2 font-mono truncate">
              {String(error?.message || error || 'Error desconocido')}
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30 text-xs font-bold transition-all active:scale-95"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reintentar sección
          </button>
        </div>
      </div>
    );
  }
}
