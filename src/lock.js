// App lock + encryption of the data saved on this phone.
//
// How it works:
//  - A random 256-bit AES-GCM "data key" encrypts the copy of your data stored on the phone.
//  - The data key is itself encrypted ("wrapped") with a key made from your passcode (PBKDF2, 310,000 rounds).
//  - For fingerprint / Face ID, the data key is also wrapped with a secret that the server only sends
//    after it has verified your fingerprint signature (WebAuthn).
//  - Nothing readable is stored on the phone while app lock is on: no passcode, no data key, no data.

const enc = new TextEncoder();
const dec = new TextDecoder();
const ITER = 310000;

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64urlToBytes = (s) => unb64(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));

const cfgKey = (uid) => `st:lock:${uid}`;
export function getLockConfig(uid) {
  try { return JSON.parse(localStorage.getItem(cfgKey(uid)) || "null"); } catch { return null; }
}
export function saveLockConfig(uid, cfg) {
  try { if (cfg) localStorage.setItem(cfgKey(uid), JSON.stringify(cfg)); else localStorage.removeItem(cfgKey(uid)); } catch { /* ignore */ }
}

async function passKey(passcode, salt) {
  const base = await crypto.subtle.importKey("raw", enc.encode(passcode), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function secretKey(secretB64url) {
  return crypto.subtle.importKey("raw", b64urlToBytes(secretB64url), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function wrapWith(kek, dek) {
  const raw = await crypto.subtle.exportKey("raw", dek);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, kek, raw);
  return { iv: b64(iv), ct: b64(ct) };
}
async function unwrapWith(kek, wrapped) {
  const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(wrapped.iv) }, kek, unb64(wrapped.ct));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

export async function newDataKey() {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function encryptJSON(key, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(value)));
  return { __enc: 1, iv: b64(iv), ct: b64(ct) };
}
export async function decryptJSON(key, box) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv) }, key, unb64(box.ct));
  return JSON.parse(dec.decode(pt));
}

// ---- passcode ----
export async function setupPasscode(passcode, dek) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const wrapped = await wrapWith(await passKey(passcode, salt), dek);
  return { salt: b64(salt), wrapped };
}
export async function unlockWithPasscode(cfg, passcode) {
  try {
    return await unwrapWith(await passKey(passcode, unb64(cfg.pin.salt)), cfg.pin.wrapped);
  } catch {
    return null; // wrong passcode
  }
}

// ---- fingerprint / Face ID (key released by the server after WebAuthn check) ----
export async function wrapForBiometric(secret, dek) {
  return wrapWith(await secretKey(secret), dek);
}
export async function unwrapWithBiometric(secret, wrapped) {
  return unwrapWith(await secretKey(secret), wrapped);
}

export async function biometricAvailable() {
  try {
    return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
}

// ---- password-protected backup files (.stbak) ----
export async function encryptBackup(password, data) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await passKey(password, salt);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(data)));
  return { format: "ServiceTracker-encrypted-backup", v: 1, kdf: "PBKDF2-SHA256", iterations: ITER, salt: b64(salt), iv: b64(iv), data: b64(ct) };
}
export async function decryptBackup(password, file) {
  const key = await passKey(password, unb64(file.salt));
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(file.iv) }, key, unb64(file.data));
    return JSON.parse(dec.decode(pt));
  } catch {
    throw new Error("Wrong password for this backup file.");
  }
}
