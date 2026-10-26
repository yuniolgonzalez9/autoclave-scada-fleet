import { createClient } from '@supabase/supabase-js';

const ALLOWED_ROLES = new Set([
  'OPERADOR',
  'CLIENTE',
  'TECNICO',
  'AUDITOR_CALIDAD',
  'ADMIN',
  'DIRECTOR',
  'SUPERADMIN'
]);
const ALLOWED_STATUSES = new Set(['PENDIENTE', 'ACTIVO', 'INACTIVO', 'SUSPENDIDO']);
const ALLOWED_THEMES = new Set(['industrial', 'tactical', 'cyber', 'hybrid']);
const ALLOWED_BACKGROUNDS = new Set([
  'solid',
  'circuit-pcb',
  'planet-nodes',
  'cyber-matrix',
  'motherboard-gold',
  'quantum-connections',
  'server-datacenter',
  'oled'
]);

class RequestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RequestError';
    this.status = 400;
  }
}

function send(res, status, payload) {
  return res.status(status).json(payload);
}

function normalizePreferences(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RequestError('Las preferencias deben ser un objeto JSON.');
  }

  const keys = Object.keys(value);
  if (keys.some((key) => !['theme', 'background', 'opacity'].includes(key))) {
    throw new RequestError('La solicitud contiene una preferencia no permitida.');
  }

  const preferences = {};
  if (Object.hasOwn(value, 'theme')) {
    if (!ALLOWED_THEMES.has(value.theme)) throw new RequestError('Tema no permitido.');
    preferences.theme = value.theme;
  }
  if (Object.hasOwn(value, 'background')) {
    if (!ALLOWED_BACKGROUNDS.has(value.background)) throw new RequestError('Fondo no permitido.');
    preferences.background = value.background;
  }
  if (Object.hasOwn(value, 'opacity')) {
    if (!Number.isInteger(value.opacity) || value.opacity < 0 || value.opacity > 100) {
      throw new RequestError('La transparencia debe ser un entero entre 0 y 100.');
    }
    preferences.opacity = value.opacity;
  }

  return preferences;
}

function normalizeAuthorizedDevices(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new RequestError('La lista de equipos debe ser un arreglo.');
  return [...new Set(value.map((mac) => String(mac).replace(/[:-]/g, '').toUpperCase()))];
}

function resolveAuthEmail(explicitAuthEmail, contactEmail, username) {
  const requested = String(explicitAuthEmail || '').trim().toLowerCase();
  if (requested) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requested)) {
      throw new RequestError('El correo único de acceso no es válido.');
    }
    return requested;
  }

  const contact = String(contactEmail || '').trim().toLowerCase();
  const [localPart, domain] = contact.split('@');
  if (['gmail.com', 'googlemail.com'].includes(domain)) {
    const baseMailbox = localPart.split('+')[0];
    return `${baseMailbox}+biofleet-${username}@${domain}`;
  }

  // Sin correo real o proveedor sin alias: identidad Auth sintética por usuario.
  return `${username}@biofleet.internal`;
}

async function createAuthUserWithProfile(adminClient, {
  username,
  displayName,
  password,
  role = 'OPERADOR',
  department = null,
  contactEmail = '',
  authEmail = '',
  authorizedDevices = [],
  status = 'ACTIVO'
}) {
  const finalAuthEmail = resolveAuthEmail(authEmail, contactEmail, username);
  const finalContactEmail = String(contactEmail || '').trim().toLowerCase() || finalAuthEmail;

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: finalAuthEmail,
    password,
    email_confirm: true,
    user_metadata: {
      username,
      display_name: displayName || username,
      contact_email: finalContactEmail
    }
  });
  if (createError) throw createError;
  if (!created.user) throw new Error('Supabase did not return the created user.');

  const { error: profileError } = await adminClient
    .from('user_profiles')
    .update({
      username,
      auth_email: finalAuthEmail,
      contact_email: finalContactEmail,
      display_name: displayName || username,
      role,
      department,
      authorized_devices: authorizedDevices,
      status,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', created.user.id);
  if (profileError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    throw profileError;
  }

  return created.user;
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  const configuredOrigins = (process.env.APP_ORIGINS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  let sameOrigin = false;
  if (origin && host) {
    try {
      sameOrigin = new URL(origin).host === host;
    } catch (_) {}
  }

  if (origin && (sameOrigin || configuredOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Método no permitido.' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authorization = req.headers.authorization || '';
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';

  if (!supabaseUrl || !serviceRoleKey) {
    return send(res, 503, { error: 'La administración segura no está configurada en el servidor.' });
  }
  if (!accessToken) return send(res, 401, { error: 'Autenticación requerida.' });

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  try {
    const { data: authData, error: authError } = await adminClient.auth.getUser(accessToken);
    if (authError || !authData.user) return send(res, 401, { error: 'Sesión no válida.' });

    const { data: actor, error: actorError } = await adminClient
      .from('user_profiles')
      .select('user_id, role, status, contact_email')
      .eq('user_id', authData.user.id)
      .maybeSingle();

    if (actorError) throw actorError;
    if (!actor || actor.status !== 'ACTIVO' || !['ADMIN', 'DIRECTOR', 'SUPERADMIN'].includes(actor.role)) {
      return send(res, 403, { error: 'Se requieren permisos administrativos.' });
    }

    const { action } = req.body || {};

    if (action === 'list_profiles') {
      const { data: profiles, error } = await adminClient
        .from('user_profiles')
        .select('user_id, username, auth_email, contact_email, display_name, role, department, authorized_devices, status, created_at, updated_at')
        .order('username');
      if (error) throw error;

      const { data: overrides, error: overridesError } = await adminClient
        .from('admin_appearance_overrides')
        .select('user_id, overrides, updated_at');
      if (overridesError) throw overridesError;
      const overridesByUserId = new Map((overrides || []).map((entry) => [entry.user_id, entry]));

      return send(res, 200, {
        profiles: (profiles || []).map((profile) => ({
          ...profile,
          appearance_override: overridesByUserId.get(profile.user_id)?.overrides || {},
          appearance_override_updated_at: overridesByUserId.get(profile.user_id)?.updated_at || null
        }))
      });
    }

    if (action === 'invite_profile') {
      const username = String(req.body.username || '').trim().toLowerCase();
      const displayName = String(req.body.displayName || '').trim();
      const role = String(req.body.role || 'OPERADOR').trim().toUpperCase();
      const department = String(req.body.department || '').trim() || null;
      const authorizedDevices = normalizeAuthorizedDevices(req.body.authorizedDevices || []);
      const contactEmail = String(req.body.contactEmail || actor.contact_email || '').trim().toLowerCase();

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new RequestError('El correo de contacto no es válido.');
      if (!/^[a-z0-9_.-]{3,40}$/.test(username)) throw new RequestError('El usuario debe tener 3-40 caracteres válidos.');
      const authEmail = resolveAuthEmail(req.body.authEmail, contactEmail, username);
      if (authEmail.endsWith('@biofleet.internal')) {
        throw new RequestError('La invitación por correo requiere un correo real (gmail con alias o correo Auth único).');
      }
      if (!displayName) throw new RequestError('El nombre visible es obligatorio.');
      if (!ALLOWED_ROLES.has(role)) throw new RequestError('Rol no permitido.');
      if (role === 'SUPERADMIN' && actor.role !== 'SUPERADMIN') {
        return send(res, 403, { error: 'Solo un superadministrador puede crear otro superadministrador.' });
      }

      const { data: existingUsername, error: usernameError } = await adminClient
        .from('user_profiles')
        .select('user_id')
        .eq('username', username)
        .maybeSingle();
      if (usernameError) throw usernameError;
      if (existingUsername) return send(res, 409, { error: 'El nombre de usuario ya está en uso.' });

      const appOrigin = process.env.APP_ORIGIN || (sameOrigin ? origin : null);
      const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(authEmail, {
        data: { username, display_name: displayName, contact_email: contactEmail },
        ...(process.env.AUTH_REDIRECT_URL || appOrigin ? { redirectTo: process.env.AUTH_REDIRECT_URL || appOrigin } : {})
      });
      if (inviteError) throw inviteError;
      if (!invited.user) throw new Error('Supabase did not return an invited user.');

      const { error: profileError } = await adminClient
        .from('user_profiles')
        .update({
          username,
          auth_email: authEmail,
          contact_email: contactEmail,
          display_name: displayName,
          role,
          department,
          authorized_devices: authorizedDevices,
          status: 'PENDIENTE',
          updated_at: new Date().toISOString()
        })
        .eq('user_id', invited.user.id);
      if (profileError) {
        await adminClient.auth.admin.deleteUser(invited.user.id);
        throw profileError;
      }

      return send(res, 201, { userId: invited.user.id, status: 'PENDIENTE' });
    }

    if (action === 'update_profile') {
      const userId = String(req.body.userId || '');
      const update = {};

      if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new RequestError('ID de usuario no válido.');
      const { data: target, error: targetError } = await adminClient
        .from('user_profiles')
        .select('user_id, role')
        .eq('user_id', userId)
        .maybeSingle();
      if (targetError) throw targetError;
      if (!target) return send(res, 404, { error: 'La cuenta solicitada no existe.' });
      if (userId === actor.user_id && (req.body.role !== undefined || req.body.status !== undefined)) {
        return send(res, 409, { error: 'No puedes cambiar tu propio rol o estado desde esta acción.' });
      }
      if (target.role === 'SUPERADMIN' && actor.role !== 'SUPERADMIN') {
        return send(res, 403, { error: 'Solo un superadministrador puede editar esa cuenta.' });
      }

      if (req.body.displayName !== undefined) update.display_name = String(req.body.displayName).trim();
      if (req.body.department !== undefined) update.department = String(req.body.department).trim() || null;
      if (req.body.contactEmail !== undefined) {
        const contactEmail = String(req.body.contactEmail || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
          throw new RequestError('El correo de contacto no es válido.');
        }
        update.contact_email = contactEmail;
      }
      if (req.body.status !== undefined) {
        if (!ALLOWED_STATUSES.has(req.body.status)) throw new RequestError('Estado no permitido.');
        update.status = req.body.status;
      }
      if (req.body.role !== undefined) {
        if (!ALLOWED_ROLES.has(req.body.role)) throw new RequestError('Rol no permitido.');
        if (req.body.role === 'SUPERADMIN' && actor.role !== 'SUPERADMIN') {
          return send(res, 403, { error: 'Solo un superadministrador puede asignar ese rol.' });
        }
        update.role = req.body.role;
      }
      if (req.body.authorizedDevices !== undefined) {
        update.authorized_devices = normalizeAuthorizedDevices(req.body.authorizedDevices);
      }

      const { error } = await adminClient
        .from('user_profiles')
        .update({ ...update, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (error) throw error;
      return send(res, 200, { ok: true });
    }

    if (action === 'set_appearance_override') {
      const userId = String(req.body.userId || '');
      if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new RequestError('ID de usuario no válido.');
      const overrides = normalizePreferences(req.body.overrides);
      const { error } = await adminClient
        .from('admin_appearance_overrides')
        .upsert({
          user_id: userId,
          overrides,
          updated_by: actor.user_id,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
      if (error) throw error;
      return send(res, 200, { ok: true });
    }

    if (action === 'create_user') {
      const username = String(req.body.username || '').trim().toLowerCase();
      const displayName = String(req.body.displayName || '').trim();
      const password = String(req.body.password || '');
      const role = String(req.body.role || 'OPERADOR').trim().toUpperCase();
      const status = String(req.body.status || 'ACTIVO').trim().toUpperCase();
      const department = String(req.body.department || '').trim() || null;
      const contactEmail = String(req.body.contactEmail || '').trim().toLowerCase();
      const authorizedDevices = normalizeAuthorizedDevices(req.body.authorizedDevices || []);

      if (!/^[a-z0-9_.-]{3,40}$/.test(username)) throw new RequestError('El usuario debe tener 3-40 caracteres válidos.');
      if (password.length < 6) throw new RequestError('La contraseña debe tener mínimo 6 caracteres.');
      if (!ALLOWED_ROLES.has(role)) throw new RequestError('Rol no permitido.');
      if (!ALLOWED_STATUSES.has(status)) throw new RequestError('Estado no permitido.');
      if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
        throw new RequestError('El correo de contacto no es válido.');
      }
      if (role === 'SUPERADMIN' && actor.role !== 'SUPERADMIN') {
        return send(res, 403, { error: 'Solo un superadministrador puede crear otro superadministrador.' });
      }

      const { data: existingUsername, error: usernameError } = await adminClient
        .from('user_profiles')
        .select('user_id')
        .eq('username', username)
        .maybeSingle();
      if (usernameError) throw usernameError;
      if (existingUsername) return send(res, 409, { error: 'El nombre de usuario ya está en uso.' });

      const createdUser = await createAuthUserWithProfile(adminClient, {
        username, displayName, password, role, department,
        contactEmail, authEmail: req.body.authEmail,
        authorizedDevices, status
      });

      return send(res, 201, { userId: createdUser.id, status });
    }

    if (action === 'set_password') {
      const userId = String(req.body.userId || '');
      const password = String(req.body.password || '');

      if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new RequestError('ID de usuario no válido.');
      if (password.length < 6) throw new RequestError('La contraseña debe tener mínimo 6 caracteres.');

      const { data: target, error: targetError } = await adminClient
        .from('user_profiles')
        .select('user_id, role')
        .eq('user_id', userId)
        .maybeSingle();
      if (targetError) throw targetError;
      if (!target) return send(res, 404, { error: 'La cuenta solicitada no existe.' });
      if (target.role === 'SUPERADMIN' && actor.role !== 'SUPERADMIN') {
        return send(res, 403, { error: 'Solo un superadministrador puede modificar esa cuenta.' });
      }

      const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, { password });
      if (updateError) throw updateError;
      return send(res, 200, { ok: true });
    }

    if (action === 'delete_user') {
      const userId = String(req.body.userId || '');
      if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new RequestError('ID de usuario no válido.');
      if (userId === actor.user_id) {
        return send(res, 409, { error: 'No puedes eliminar tu propia cuenta desde esta acción.' });
      }

      const { data: target, error: targetError } = await adminClient
        .from('user_profiles')
        .select('user_id, role')
        .eq('user_id', userId)
        .maybeSingle();
      if (targetError) throw targetError;
      if (!target) return send(res, 404, { error: 'La cuenta solicitada no existe.' });
      if (target.role === 'SUPERADMIN' && actor.role !== 'SUPERADMIN') {
        return send(res, 403, { error: 'Solo un superadministrador puede eliminar esa cuenta.' });
      }

      const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
      if (deleteError) throw deleteError;
      return send(res, 200, { ok: true });
    }

    if (action === 'approve_request') {
      const requestId = Number(req.body.requestId);
      const role = String(req.body.role || 'OPERADOR').trim().toUpperCase();
      if (!Number.isInteger(requestId)) throw new RequestError('Solicitud no válida.');
      if (!ALLOWED_ROLES.has(role)) throw new RequestError('Rol no permitido.');
      if (role === 'SUPERADMIN' && actor.role !== 'SUPERADMIN') {
        return send(res, 403, { error: 'Solo un superadministrador puede asignar ese rol.' });
      }

      const { data: request, error: requestError } = await adminClient
        .from('access_requests')
        .select('*')
        .eq('id', requestId)
        .maybeSingle();
      if (requestError) throw requestError;
      if (!request || request.status !== 'PENDIENTE') {
        return send(res, 404, { error: 'La solicitud no existe o ya fue procesada.' });
      }

      const password = String(request.requested_password || '');
      if (password.length < 6) {
        throw new RequestError('La contraseña propuesta es demasiado corta; crea la cuenta manualmente con una clave segura.');
      }

      const createdUser = await createAuthUserWithProfile(adminClient, {
        username: request.username,
        displayName: request.display_name,
        password,
        role,
        department: request.department,
        contactEmail: request.contact_email,
        status: 'ACTIVO'
      });

      const { error: markError } = await adminClient
        .from('access_requests')
        .update({ status: 'APROBADA' })
        .eq('id', requestId);
      if (markError) throw markError;

      return send(res, 201, { userId: createdUser.id, status: 'ACTIVO' });
    }

    if (action === 'reject_request') {
      const requestId = Number(req.body.requestId);
      if (!Number.isInteger(requestId)) throw new RequestError('Solicitud no válida.');

      const { error: markError } = await adminClient
        .from('access_requests')
        .update({ status: 'RECHAZADA' })
        .eq('id', requestId)
        .eq('status', 'PENDIENTE');
      if (markError) throw markError;
      return send(res, 200, { ok: true });
    }

    return send(res, 400, { error: 'Acción no válida.' });
  } catch (error) {
    console.error('[ADMIN ACCOUNTS]', error);
    if (error instanceof RequestError) return send(res, error.status, { error: error.message });
    return send(res, 500, { error: 'No se pudo completar la solicitud.' });
  }
}
