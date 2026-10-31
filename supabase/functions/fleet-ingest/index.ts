// =========================================================================
// FLEET-INGEST — receptor HTTP de telemetría (una sola verdad 24/7)
//
// Los equipos (ESP32) o cualquier ingestor POSTean su telemetría aquí:
//   POST { "mac": "AA11BB22", "datos": {...}, "f0": 0 }
// → upsert device_state → realtime → TODOS los clientes ven lo mismo.
// Header requerido:  x-ingest-key: <INGEST_SECRET>
// Secret: INGEST_SECRET (supabase secrets set)
// =========================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

Deno.serve(async (req) => {
  const json = (b: any, s = 200) => new Response(JSON.stringify(b), {
    status: s, headers: { 'Content-Type': 'application/json' }
  });

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'x-ingest-key, content-type' } });
  }
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const secret = Deno.env.get('INGEST_SECRET') || '';
  if (secret && req.headers.get('x-ingest-key') !== secret) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body: any;
  try { body = await req.json(); } catch (_) { return json({ error: 'bad json' }, 400); }

  const cleanMac = String(body?.mac || '').toUpperCase().replace(/[:-]/g, '');
  if (!cleanMac) return json({ error: 'mac required' }, 400);

  const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const now = Date.now();

  const { error } = await supa.from('device_state').upsert({
    mac: cleanMac,
    datos: body.datos || {},
    f0_score: Number(body.f0 || 0),
    last_telemetry_at: now,
    last_seen: now,
    source: body.source || 'device-http',
    updated_at: new Date().toISOString()
  }, { onConflict: 'mac' });

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, mac: cleanMac });
});
