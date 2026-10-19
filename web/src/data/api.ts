// Network calls with on-device fallbacks. Nothing here invents a value: when there is
// no answer and nothing cached, the caller gets null and the UI says so.
import { cacheGet, cachePut, meta, setMeta } from "./db.ts";
import type { MandiAnswer } from "../core/mandi.ts";
import { openMeteoUrl, parseOpenMeteo, type Day } from "../core/irrigation.ts";

export type User = { id: string; name: string; role: string };

async function post(path: string, body: unknown) {
  const res = await fetch(path, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

export async function signIn(email: string, password: string): Promise<User> {
  const { user } = await post("/api/auth/login", { email, password });
  await setMeta("user", user);
  return user;
}
export async function signOut() {
  await post("/api/auth/logout", {}).catch(() => {});
  await setMeta("user", null);
}
export async function register(name: string, email: string, password: string, role?: string): Promise<User> {
  return (await post("/api/auth/register", { name, email, password, role })).user;
}
export const currentUser = () => meta<User | null>("user");

export type Fetched<T> = { value: T; savedAt: number; offline: boolean };

/** Mandi prices for a place. Falls back to the copy last saved on this phone. */
export async function getMandi(state: string, district?: string): Promise<Fetched<MandiAnswer> | null> {
  const key = `mandi:${state}|${district ?? ""}`;
  try {
    const q = new URLSearchParams({ state, ...(district ? { district } : {}) });
    const res = await fetch(`/api/mandi?${q}`, { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const value = (await res.json()) as MandiAnswer;
    if (value.available) await cachePut(key, value);
    else {
      const old = await cacheGet<MandiAnswer>(key);
      if (old) return { value: old.value, savedAt: old.at, offline: false };
    }
    return { value, savedAt: Date.now(), offline: false };
  } catch {
    const old = await cacheGet<MandiAnswer>(key);
    return old ? { value: old.value, savedAt: old.at, offline: true } : null;
  }
}

const WEATHER_TTL_MS = 3 * 3600 * 1000;

/** Open-Meteo daily ET0 / rain / temperature, cached 3 h on the phone. */
export async function getWeather(lat: number, lon: number): Promise<Fetched<Day[]> | null> {
  const key = `weather:${lat.toFixed(2)},${lon.toFixed(2)}`;
  const old = await cacheGet<Day[]>(key);
  if (old && Date.now() - old.at < WEATHER_TTL_MS) return { value: old.value, savedAt: old.at, offline: false };
  try {
    const res = await fetch(openMeteoUrl(lat, lon));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const value = parseOpenMeteo(await res.json());
    await cachePut(key, value);
    return { value, savedAt: Date.now(), offline: false };
  } catch {
    return old ? { value: old.value, savedAt: old.at, offline: true } : null;
  }
}
