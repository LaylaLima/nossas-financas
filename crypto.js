// Criptografia ponta a ponta (tudo acontece no aparelho, com a Web Crypto API do navegador).
//
// - Cada pessoa tem a PRÓPRIA senha. Dela saem duas coisas diferentes:
//     1) a "senha de login" enviada ao servidor = PBKDF2(senha, e-mail)  → o servidor nunca vê a senha real
//     2) a "chave pessoal" (KEK) = PBKDF2(senha, sal aleatório)          → nunca sai do aparelho
// - O cofre do casal tem uma "chave de dados" aleatória (AES-256). Ela fica guardada no servidor
//   embrulhada (criptografada) com a chave pessoal de cada um. Só quem sabe a própria senha desembrulha.
// - Todos os dados são cifrados com AES-256-GCM usando essa chave de dados.
const enc = new TextEncoder();
const dec = new TextDecoder();
const ITER = 400000;

export function b64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
export function unb64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
export function b64url(bytes) { return b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
export function unb64url(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return unb64(s); }
export function randomBytes(n) { return crypto.getRandomValues(new Uint8Array(n)); }
export function newSalt() { return b64(randomBytes(16)); }

async function pbkdf2(secret, saltBytes, iterations, bits = 256) {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' }, base, bits));
}

// Senha que vai para o servidor de login (o servidor nunca recebe a senha digitada)
export async function authPassword(email, password) {
  const bits = await pbkdf2(password, enc.encode('nossas-financas/auth/' + email.trim().toLowerCase()), ITER);
  return [...bits].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function aesKey(raw) {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

// Chave pessoal (embrulha a chave de dados)
export async function deriveKEK(password, saltB64) {
  return aesKey(await pbkdf2(password, unb64(saltB64), ITER));
}
// Chave do convite (o código do convite já é aleatório e longo)
export async function inviteKey(secret, householdId) {
  return aesKey(await pbkdf2(secret, enc.encode('nossas-financas/invite/' + householdId), 100000));
}
export async function importDataKey(raw) { return aesKey(raw); }

export async function encryptBytes(key, bytes, aad) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, bytes);
  return { iv: b64(iv), data: b64(ct) };
}
export async function decryptBytes(key, { iv, data }, aad) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: enc.encode(aad) }, key, unb64(data)));
}
export async function encryptJSON(key, obj, aad) { return encryptBytes(key, enc.encode(JSON.stringify(obj)), aad); }
export async function decryptJSON(key, box, aad) { return JSON.parse(dec.decode(await decryptBytes(key, box, aad))); }
