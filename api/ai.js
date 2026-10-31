import { OPERATOR_ROLES, PRIVILEGED_ROLES, HttpError, applyCors, requireActor, sendError } from './_lib/session.js';

// Proxy de IA: las claves (config_ai_keys o variables de entorno) nunca
// salen del servidor. El cliente solo envía la conversación y el contexto.
const STUDIO_ROLES = ['TECNICO', ...PRIVILEGED_ROLES];
const MAX_PROMPT = 4000;
const MAX_CONTEXT = 60000;
const MAX_HISTORY = 20;
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];
const OPENAI_COMPATIBLE = {
  GROQ: ['https://api.groq.com/openai/v1/chat/completions', 'llama-3.3-70b-versatile'],
  OPENAI: ['https://api.openai.com/v1/chat/completions', 'gpt-4o-mini'],
  OPENROUTER: ['https://openrouter.ai/api/v1/chat/completions', 'meta-llama/llama-3.3-70b-instruct']
};

const TEXT_SYSTEM = 'Eres un editor técnico de mantenimiento biomédico. Corrige ortografía, acentos y redacción en español neutro, ordena el contenido en frases claras o viñetas (•) y usa terminología técnica correcta. No inventes datos, valores ni acciones que no estén en el texto. Devuelve solo el texto corregido.';

import { STUDIO_SYSTEM } from './_lib/studioSystemPrompt.js';

export function detectProvider(key = '') {
  const k = String(key).trim();
  if (k.startsWith('AIza')) return 'GEMINI';
  if (k.startsWith('gsk_')) return 'GROQ';
  if (k.startsWith('sk-or-')) return 'OPENROUTER';
  if (k.startsWith('sk-')) return 'OPENAI';
  return 'GEMINI';
}

async function loadKeyPool(admin, preferred) {
  let pool = [];
  const { data } = await admin
    .from('config_ai_keys')
    .select('proveedor, api_key, prioridad')
    .eq('activo', true)
    .order('prioridad', { ascending: true });
  if (data?.length) pool = data.filter((k) => k.api_key);

  const envKeys = [
    ['GROQ', process.env.GROQ_API_KEY],
    ['GEMINI', process.env.GEMINI_API_KEY],
    ['OPENAI', process.env.OPENAI_API_KEY],
    ['OPENROUTER', process.env.OPENROUTER_API_KEY]
  ].filter(([, v]) => v).map(([proveedor, api_key]) => ({ proveedor, api_key }));
  pool = [...pool, ...envKeys].map((k) => ({ ...k, proveedor: (k.proveedor || detectProvider(k.api_key)).toUpperCase() }));

  const pref = String(preferred || 'AUTO').toUpperCase();
  if (pref !== 'AUTO') pool.sort((a, b) => (a.proveedor === pref ? 0 : 1) - (b.proveedor === pref ? 0 : 1));
  if (!pool.length) throw new HttpError(503, 'No hay claves de IA activas en el servidor.');
  return pool;
}

async function callGemini(key, { system, messages, json }) {
  const contents = [
    { role: 'user', parts: [{ text: system }] },
    ...messages.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] }))
  ];
  let lastError = null;
  for (const model of GEMINI_MODELS) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key.trim() },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: json ? 0.1 : 0.2, ...(json ? { responseMimeType: 'application/json' } : {}) }
      })
    });
    if (res.ok) {
      const body = await res.json();
      const text = body?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (text) return text;
    }
    lastError = `${model} HTTP ${res.status}`;
  }
  throw new Error(lastError || 'Gemini sin respuesta');
}

async function callOpenAICompatible(provider, key, { system, messages, json }) {
  const [endpoint, model] = OPENAI_COMPATIBLE[provider] || OPENAI_COMPATIBLE.GROQ;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key.trim()}` },
    body: JSON.stringify({
      model,
      temperature: json ? 0.1 : 0.2,
      messages: [{ role: 'system', content: system }, ...messages],
      ...(json ? { response_format: { type: 'json_object' } } : {})
    })
  });
  if (!res.ok) throw new Error(`${provider} HTTP ${res.status}`);
  const body = await res.json();
  const text = body?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`${provider} sin respuesta`);
  return text;
}

async function complete(pool, request) {
  let lastError = null;
  for (const item of pool) {
    try {
      return item.proveedor === 'GEMINI'
        ? await callGemini(item.api_key, request)
        : await callOpenAICompatible(item.proveedor, item.api_key, request);
    } catch (err) {
      lastError = err.message;
    }
  }
  throw new HttpError(502, `Ningún proveedor de IA respondió (${lastError || 'sin detalle'}).`);
}

function asText(value, max) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return text.slice(0, max);
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });

  try {
    const { task, prompt, historial, contexto, proveedor } = req.body || {};
    const isStudio = task === 'studio';
    const { admin } = await requireActor(req, { roles: isStudio ? STUDIO_ROLES : OPERATOR_ROLES });

    const userText = asText(prompt, MAX_PROMPT).trim();
    if (!userText) throw new HttpError(400, 'Mensaje vacío.');

    const pool = await loadKeyPool(admin, proveedor);
    let request;
    if (isStudio) {
      const history = (Array.isArray(historial) ? historial : []).slice(-MAX_HISTORY).map((h) => ({
        role: h?.role === 'user' ? 'user' : 'assistant',
        content: asText(h?.content, MAX_PROMPT)
      }));
      request = {
        json: true,
        system: `${STUDIO_SYSTEM}\n\nCONTEXTO:\n${asText(contexto, MAX_CONTEXT)}`,
        messages: [...history, { role: 'user', content: userText }]
      };
    } else {
      const campo = asText(contexto, 200).trim();
      request = {
        json: false,
        system: TEXT_SYSTEM,
        messages: [{ role: 'user', content: `${campo ? `Campo: ${campo}\n` : ''}Texto:\n${userText}` }]
      };
    }

    const text = await complete(pool, request);
    return res.status(200).json({ text });
  } catch (err) {
    return sendError(res, err);
  }
}
