export const OFFLINE_MSG = "You're offline. This needs an internet connection.";

async function call(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    const err = new Error(OFFLINE_MSG);
    err.offline = true;
    throw err;
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    if (res.status >= 502 && res.status <= 504) err.offline = true; // gateway/network trouble: retry later
    throw err;
  }
  return data;
}

export const api = {
  get: (u) => call("GET", u),
  post: (u, b) => call("POST", u, b || {}),
  put: (u, b) => call("PUT", u, b || {}),
  del: (u) => call("DELETE", u),
};
