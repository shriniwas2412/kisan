// Password hashing (PBKDF2-SHA256) and HS256 JWTs with WebCrypto only, so the same
// code runs on Cloudflare Workers and Node. Workers cap PBKDF2 at 100000 iterations.

const enc = new TextEncoder();
export const PBKDF2_ITERATIONS = 100_000;

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, c => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
};

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

/** Returns "pbkdf2$<iterations>$<salt>$<hash>" (base64url). */
export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${iterations}$${b64url(salt)}$${b64url(await pbkdf2(password, salt, iterations))}`;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parts = (stored ?? "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > PBKDF2_ITERATIONS) return false;
  return equalBytes(await pbkdf2(password, fromB64url(parts[2]), iterations), fromB64url(parts[3]));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export type Claims = { sub: string; role: string; name: string; exp: number };

export async function signJwt(claims: Claims, secret: string): Promise<string> {
  const head = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64url(enc.encode(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
}

/** Returns the claims, or null if the signature, algorithm or expiry is wrong. */
export async function verifyJwt(token: string, secret: string, nowSec = Math.floor(Date.now() / 1000)): Promise<Claims | null> {
  const [head, body, sig] = token.split(".");
  if (!head || !body || !sig) return null;
  try {
    const h = JSON.parse(new TextDecoder().decode(fromB64url(head)));
    if (h.alg !== "HS256") return null;
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromB64url(sig), enc.encode(`${head}.${body}`));
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Claims;
    if (typeof claims.exp !== "number" || claims.exp <= nowSec) return null;
    return claims;
  } catch {
    return null;
  }
}
