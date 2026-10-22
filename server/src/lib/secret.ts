// Checks for the JWT signing secret, and where the local server listens.

// Strings that appear in this repo's examples or docs. A published placeholder is no secret.
const PLACEHOLDERS = new Set(["replace-with-32-or-more-random-characters", "change-me", "changeme", "secret"]);

export type SecretProblem = "missing" | "placeholder" | "too_short" | "too_simple";

export function secretProblem(s: string | undefined | null): SecretProblem | null {
  const v = (s ?? "").trim();
  if (!v) return "missing";
  if (PLACEHOLDERS.has(v.toLowerCase())) return "placeholder";
  if (v.length < 32) return "too_short";
  if (new Set(v).size < 16) return "too_simple";
  return null;
}

/** The plain-Node dev server listens only on this machine unless HOST says otherwise. */
export function listenHost(env: Record<string, string | undefined>): string {
  return env.HOST?.trim() || "127.0.0.1";
}
