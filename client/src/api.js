// Talking to the RoomiePet server: the signed-in token lives in this
// browser's storage, every call carries it, and a live stream says when
// the household changed.
const KEY = "roomiepet.token";

export const getToken = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
export const setToken = (t) => {
  try {
    if (t) localStorage.setItem(KEY, t);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: signed in for this tab only */
  }
};

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(method, path, body) {
  const token = getToken();
  const res = await fetch(path, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
  return data;
}

/** Calls onChange whenever the household changes; returns a function that stops listening. */
export function listen(onChange) {
  const token = getToken();
  if (!token || typeof EventSource === "undefined") return () => {};
  const source = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
  source.addEventListener("changed", onChange);
  source.addEventListener("hello", onChange); // also after a reconnect, in case something was missed
  return () => source.close();
}
