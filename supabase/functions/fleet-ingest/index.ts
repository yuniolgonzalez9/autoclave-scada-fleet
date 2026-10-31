// =========================================================================
// FLEET-INGEST — ingestor MQTT central en Supabase Edge Functions
//
// Corre periódicamente (pg_cron/Scheduled Function) SIN ningún cliente
// abierto: abre HiveMQ, lee los mensajes retenidos + el flujo por ~60s,
// y consolida device_state → todos los clientes ven la misma verdad.
//
// Secrets requeridos (supabase secrets set):
//   HIVEMQ_HOST, HIVEMQ_PORT (8883), HIVEMQ_USER, HIVEMQ_PASS
// =========================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Client as MqttClient } from 'https://deno.land/x/mqtt@0.1.2/deno/mod.ts';

const WINDOW_MS = 60_000;

Deno.serve(async () => {
  const host = Deno.env.get('HIVEMQ_HOST');
  const user = Deno.env.get('HIVEMQ_USER');
  const pass = Deno.env.get('HIVEMQ_PASS');
  const port = Number(Deno.env.get('HIVEMQ_PORT') || 8883);

  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const seen = new Map<string, { datos: any; lastTelemetryAt: number }>();

  if (host && user && pass) {
    try {
      const client = new MqttClient({ url: `mqtts://${host}:${port}`, username: user, password: pass });
      await client.connect();
      await client.subscribe('#');

      const deadline = Date.now() + WINDOW_MS;
      for await (const msg of client.receive()) {
        if (Date.now() > deadline) break;
        try {
          const topic = msg.topic || '';
          const mac = topic.split('/').pop()?.toUpperCase().replace(/[:-]/g, '');
          if (!mac) continue;
          const payload = JSON.parse(new TextDecoder().decode(msg.payload));
          if (topic.includes('telemetria') || topic.includes('telemetr')) {
            seen.set(mac, { datos: payload, lastTelemetryAt: Date.now() });
          }
        } catch (_) {}
      }
      try { await client.disconnect(); } catch (_) {}
    } catch (e) {
      console.warn('[INGEST] MQTT error:', e?.message || e);
    }
  }

  if (seen.size) {
    const now = Date.now();
    const rows = [...seen.entries()].map(([mac, v]) => ({
      mac,
      datos: v.datos,
      last_telemetry_at: v.lastTelemetryAt,
      last_seen: now,
      source: 'edge-ingest',
      updated_at: new Date().toISOString()
    }));
    const { error } = await supa.from('device_state').upsert(rows, { onConflict: 'mac' });
    if (error) console.warn('[INGEST] upsert:', error.message);
  }

  return new Response(JSON.stringify({ ok: true, devices: seen.size }), {
    headers: { 'Content-Type': 'application/json' }
  });
});
