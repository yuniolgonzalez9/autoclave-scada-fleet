import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync, existsSync } from 'fs';

// Carga .env local para que las funciones serverless /api tengan sus
// variables de servidor (SUPABASE_SERVICE_ROLE_KEY, etc.) en desarrollo.
if (existsSync(path.resolve(__dirname, '.env'))) {
  for (const line of readFileSync(path.resolve(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

// Monta los handlers de /api/*.js (estilo Vercel) dentro del dev server.
function apiMiddleware() {
  return {
    name: 'local-api-middleware',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        const route = (req.url || '').split('?')[0].replace(/^\/+|\/+$/g, '');
        const file = path.resolve(__dirname, 'api', `${route}.js`);
        if (!route || !existsSync(file)) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'API no encontrada.' }));
          return;
        }
        try {
          const body = await new Promise((resolve) => {
            let data = '';
            req.on('data', (c) => { data += c; });
            req.on('end', () => {
              try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
            });
          });
          const mod = await server.ssrLoadModule(file);
          req.body = body;
          // Polyfill de la interfaz de respuesta estilo Vercel
          res.status = (code) => { res.statusCode = code; return res; };
          res.json = (payload) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(payload));
            return res;
          };
          await mod.default(req, res);
        } catch (err) {
          console.error('[API DEV]', err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Error interno de API.' }));
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), apiMiddleware()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    'global': 'window',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-supabase': ['@supabase/supabase-js']
        }
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
});
