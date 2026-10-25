// Provisión inicial de cuentas en Supabase Auth.
// Uso:
//   1) Completar .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPERADMIN_PASSWORD
//   2) node scripts/provision-users.mjs
//
// Nunca imprime contraseñas ni la service key.

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
if (!existsSync(envPath)) {
  console.error('Falta .env — copia .env.example a .env y completa las claves.');
  process.exit(1);
}
for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) {
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env');
  process.exit(1);
}
if (!SUPERADMIN_PASSWORD || SUPERADMIN_PASSWORD.length < 6) {
  console.error('Define SUPERADMIN_PASSWORD (mínimo 6 caracteres) en .env');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const syntheticEmail = (username) => `${username}@biofleet.internal`;

async function upsertAuthUser({ username, displayName, password, role, department, contactEmail, authEmail, authorizedDevices = [] }) {
  const email = authEmail || (contactEmail?.match(/^[^\s@]+@(gmail|googlemail)\.com$/)
    ? `${contactEmail.split('@')[0].split('+')[0]}+biofleet-${username}@${contactEmail.split('@')[1]}`
    : syntheticEmail(username));
  const contact = contactEmail || email;

  // Reutilizar cuenta Auth existente si el correo ya está registrado
  let userId = null;
  const { data: existingProfile } = await admin
    .from('user_profiles')
    .select('user_id')
    .eq('username', username)
    .maybeSingle();
  if (existingProfile) {
    userId = existingProfile.user_id;
    const { error: pwErr } = await admin.auth.admin.updateUserById(userId, { password });
    if (pwErr) throw pwErr;
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username, display_name: displayName || username, contact_email: contact }
    });
    if (createErr) throw createErr;
    userId = created.user.id;
  }

  const { error: profileErr } = await admin
    .from('user_profiles')
    .update({
      username,
      auth_email: email,
      contact_email: contact,
      display_name: displayName || username,
      role,
      department,
      authorized_devices: authorizedDevices,
      status: 'ACTIVO',
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId);
  if (profileErr) throw profileErr;

  return { username, userId, email };
}

async function main() {
  const results = [];

  // 1) Superadministrador — Francisco González
  results.push(await upsertAuthUser({
    username: 'superadmin',
    displayName: 'Francisco Gonzalez',
    password: SUPERADMIN_PASSWORD,
    role: 'SUPERADMIN',
    department: 'Dirección Biomédica Central',
    contactEmail: 'yuniol0220@gmail.com',
    authEmail: 'yuniol0220@gmail.com'
  }));
  console.log('✓ superadmin (SUPERADMIN) provisionado');

  // 2) Migrar usuarios heredados de usuarios_scada (conservando su clave)
  const { data: legacy, error: legacyErr } = await admin.from('usuarios_scada').select('*');
  if (legacyErr) {
    console.warn('No se pudo leer usuarios_scada:', legacyErr.message);
  } else {
    for (const row of legacy || []) {
      const username = (row.user || row.usuario || '').trim().toLowerCase();
      const password = String(row.pass || row.password || '');
      if (!username) continue;
      if (password.length < 6) {
        console.warn(`✗ ${username}: clave heredada < 6 caracteres; se omite (crea la cuenta desde la web).`);
        continue;
      }
      try {
        await upsertAuthUser({
          username,
          displayName: row.nombre || username,
          password,
          role: (row.rol || 'OPERADOR').toUpperCase(),
          department: row.departamento || null,
          contactEmail: (row.email || '').trim().toLowerCase(),
          authorizedDevices: String(row.equipos_autorizados || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
        });
        results.push(username);
        console.log(`✓ ${username} migrado (${(row.rol || 'OPERADOR').toUpperCase()})`);
      } catch (e) {
        console.warn(`✗ ${username}: ${e.message}`);
      }
    }
  }

  console.log(`\nListo: ${results.length} cuenta(s) provisionadas en Supabase Auth.`);
}

main().catch((e) => {
  console.error('Error de provisión:', e.message);
  process.exit(1);
});
