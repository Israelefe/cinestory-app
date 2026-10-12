import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { hash } from './storage.mjs';
const scrypt = promisify(scryptCallback);
const cookie = 'veylo_studio_session';
export async function createOwner(db, password) {
  const salt = randomBytes(32).toString('hex');
  const digest = (await scrypt(password, salt, 64)).toString('hex');
  db.prepare('INSERT INTO owner(id,digest,salt,created_at) VALUES(1,?,?,?)').run(digest, salt, Date.now());
}
export async function verifyOwner(db, password) {
  const owner = db.prepare('SELECT * FROM owner WHERE id=1').get();
  // Do the expensive derivation on unsuccessful attempts as well.
  const actual = await scrypt(password, owner?.salt || 'uninitialised-studio-owner', 64);
  return Boolean(owner && timingSafeEqual(actual, Buffer.from(owner.digest, 'hex')));
}
export function issueSession(db, res) {
  const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions(digest,csrf,expires_at) VALUES(?,?,?)').run(hash(token), csrf, Date.now() + 86400000);
  res.cookie(cookie, token, { httpOnly: true, sameSite: 'strict', maxAge: 86400000, path: '/api' });
  return csrf;
}
export function session(db, req) {
  const token = req.cookies?.[cookie];
  if (!token || !/^[a-f\d]{64}$/.test(token)) return null;
  return db.prepare('SELECT * FROM sessions WHERE digest=? AND expires_at>?').get(hash(token), Date.now()) || null;
}
export function endSession(db, req, res) { if (req.cookies?.[cookie]) db.prepare('DELETE FROM sessions WHERE digest=?').run(hash(req.cookies[cookie])); res.clearCookie(cookie, { path: '/api', sameSite: 'strict' }); }
