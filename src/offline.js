// Offline storage + sync queue.
// Data is always saved to the user's account on the server; this keeps a copy on the device
// so the app opens without internet, and queues changes made offline until they can be sent.

const k = (uid, name) => `st:${uid}:${name}`;

import { encryptJSON, decryptJSON } from "./lock";

// When app lock is on, everything saved here is AES-GCM encrypted with the in-memory data key.
let dataKey = null;
let encryptOn = false;
let chain = Promise.resolve();
export function setLocalCrypto(key, on) { dataKey = key; encryptOn = on; }
export const localFlush = () => chain;
export const getLocalKey = () => dataKey;

export const local = {
  async get(uid, name, fallback) {
    try {
      const v = localStorage.getItem(k(uid, name));
      if (!v) return fallback;
      const obj = JSON.parse(v);
      if (obj && obj.__enc) return dataKey ? await decryptJSON(dataKey, obj) : fallback;
      return obj;
    } catch { return fallback; }
  },
  set(uid, name, value) {
    chain = chain.then(async () => {
      try {
        if (encryptOn) {
          if (!dataKey) return; // locked: never write readable data
          localStorage.setItem(k(uid, name), JSON.stringify(await encryptJSON(dataKey, value)));
        } else {
          localStorage.setItem(k(uid, name), JSON.stringify(value));
        }
      } catch { /* storage full or blocked */ }
    });
    return chain;
  },
  clear(uid) {
    try { Object.keys(localStorage).filter((x) => x.startsWith(`st:${uid}:`)).forEach((x) => localStorage.removeItem(x)); } catch { /* ignore */ }
  },
};

export const lastUser = {
  get() { try { return JSON.parse(localStorage.getItem("st:lastUser") || "null"); } catch { return null; } },
  set(u) { try { localStorage.setItem("st:lastUser", JSON.stringify(u)); } catch { /* ignore */ } },
  clear() { try { localStorage.removeItem("st:lastUser"); } catch { /* ignore */ } },
};

const qid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
export const tempId = () => -Date.now() - Math.floor(Math.random() * 1000);

// ---- queue helpers (pure functions: return a new queue) ----
export function queueCreate(queue, id, data) {
  return [...queue, { qid: qid(), op: "create", id, data }];
}
export function queueUpdate(queue, id, data) {
  if (id < 0) return queue.map((o) => (o.op === "create" && o.id === id ? { ...o, data } : o));
  return [...queue.filter((o) => !(o.op === "update" && o.id === id)), { qid: qid(), op: "update", id, data }];
}
export function queueDelete(queue, id) {
  if (id < 0) return queue.filter((o) => o.id !== id);
  return [...queue.filter((o) => !(o.op === "update" && o.id === id)), { qid: qid(), op: "delete", id }];
}
export function queueSettings(queue, data) {
  return [...queue.filter((o) => o.op !== "settings"), { qid: qid(), op: "settings", data }];
}

// Show server data with not-yet-synced changes applied on top
export function applyQueue(serverTx, queue) {
  let list = serverTx;
  for (const o of queue) {
    if (o.op === "create") list = [{ ...o.data, id: o.id, pending: true }, ...list];
    else if (o.op === "update") list = list.map((t) => (t.id === o.id ? { ...t, ...o.data, id: o.id, pending: true } : t));
    else if (o.op === "delete") list = list.filter((t) => t.id !== o.id);
  }
  return list;
}

// Send queued changes one by one. Stops at the first network problem (kept for later).
export async function flushQueue(getQueue, removeOp, api) {
  const result = { sent: 0, dropped: [], offline: false, unauthorized: false };
  while (true) {
    const o = getQueue()[0];
    if (!o) break;
    try {
      if (o.op === "create") await api.post("/api/transactions", o.data);
      else if (o.op === "update") await api.put(`/api/transactions/${o.id}`, o.data);
      else if (o.op === "delete") await api.del(`/api/transactions/${o.id}`);
      else if (o.op === "settings") await api.put("/api/settings", o.data);
      removeOp(o.qid);
      result.sent++;
    } catch (e) {
      if (e.offline || e.status >= 500) { result.offline = !!e.offline; break; }
      if (e.status === 401) { result.unauthorized = true; break; }
      if (o.op === "delete" && e.status === 404) { removeOp(o.qid); result.sent++; continue; } // already gone
      // 400 / 404 / 409: the server rejected it (e.g. already deleted on another phone) — drop it
      removeOp(o.qid);
      result.dropped.push(o.op === "update" && e.status === 404 ? "an item you edited was deleted on another device" : e.message);
    }
  }
  return result;
}
