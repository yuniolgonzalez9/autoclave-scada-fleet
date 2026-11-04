// Bóveda local cifrada de accesos — login real sin internet.
// safeStorage (DPAPI en Windows, keychain en macOS) cifra la clave maestra;
// los perfiles van en AES-256-GCM en SQLite. El password se guarda como
// scrypt(sal) — nunca en claro ni reversible.
const { app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const SCRYPT_N = 16384, SCRYPT_R = 8, SCRYPT_P = 1, KEY_LEN = 32;

let db = null;
let masterKey = null;

function keyFile() {
  const dir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'vault.key');
}

function getMasterKey() {
  if (masterKey) return masterKey;
  const f = keyFile();
  try {
    const enc = fs.readFileSync(f);
    masterKey = safeStorage.decryptString(enc);
  } catch (_) {
    masterKey = crypto.randomBytes(KEY_LEN).toString('hex');
    try { fs.writeFileSync(f, safeStorage.encryptString(masterKey)); } catch (_) {}
  }
  return masterKey;
}

const enc = (obj) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', Buffer.from(getMasterKey(), 'hex'), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString('base64');
};

const dec = (blob) => {
  const raw = Buffer.from(blob, 'base64');
  const iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), data = raw.subarray(28);
  const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(getMasterKey(), 'hex'), iv);
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString('utf8'));
};

const hashPass = (pass, salt) =>
  crypto.scryptSync(pass, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }).toString('hex');

const normUser = (u) => String(u || '').trim().toLowerCase();

exports.initVault = () => {
  const dir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(path.join(dir, 'biofleet.db'));
  db.exec(`CREATE TABLE IF NOT EXISTS accesos(
    usuario TEXT PRIMARY KEY,
    pass_hash TEXT,
    perfil_cifrado TEXT,
    actualizado_at INTEGER DEFAULT (strftime('%s','now')*1000));`);

  const upsert = db.prepare(
    'INSERT OR REPLACE INTO accesos(usuario,pass_hash,perfil_cifrado,actualizado_at) VALUES(?,?,?,?)');

  // Guarda/actualiza la credencial tras un login ONLINE exitoso.
  // identifiers: todos los alias con que el usuario puede entrar
  // (user, email) apuntan al mismo registro cifrado.
  const save = ({ identifiers = [], password, profile }) => {
    if (!password || !profile) return { ok: false, err: 'datos incompletos' };
    const salt = crypto.randomBytes(16).toString('hex');
    const ph = `${salt}:${hashPass(password, salt)}`;
    const blob = enc({ profile, user_id: profile.user_id || profile.id || null });
    const users = [...new Set(identifiers.map(normUser).filter(Boolean))];
    users.forEach((u) => upsert.run(u, ph, blob, Date.now()));
    return { ok: true, usuarios: users.length };
  };

  // Verificación OFFLINE: hash compare + devuelve el perfil cifrado.
  const verify = ({ identifier, password }) => {
    const u = normUser(identifier);
    if (!u || !password) return { ok: false, err: 'credenciales vacías' };
    const row = db.prepare('SELECT pass_hash, perfil_cifrado FROM accesos WHERE usuario=?').get(u);
    if (!row) return { ok: false, err: 'sin acceso offline registrado — inicia sesión online una vez' };
    const [salt, expected] = String(row.pass_hash).split(':');
    const got = hashPass(password, salt);
    if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(got, 'hex'))) {
      return { ok: false, err: 'credenciales no válidas' };
    }
    try {
      return { ok: true, ...dec(row.perfil_cifrado) };
    } catch (_) {
      return { ok: false, err: 'bóveda ilegible' };
    }
  };

  // Sincroniza perfiles (usuarios actuales y futuros) descargados de la nube.
  // Actualiza solo el bloque perfil; conserva el hash si ya existía.
  const syncProfiles = (profiles = []) => {
    const get = db.prepare('SELECT pass_hash FROM accesos WHERE usuario=?');
    let n = 0;
    profiles.forEach((p) => {
      const users = [p.user, p.email, p.usuario].map(normUser).filter(Boolean);
      const blob = enc({ profile: p, user_id: p.user_id || p.id || null });
      users.forEach((u) => {
        const prev = get.get(u);
        upsert.run(u, prev?.pass_hash || '', blob, Date.now());
        n++;
      });
    });
    return { ok: true, sincronizados: n };
  };

  return {
    save,
    verify,
    syncProfiles,
    stats: () => ({ usuarios: db.prepare('SELECT COUNT(*) n FROM accesos').get().n })
  };
};
