// src/lib/apiRetry.ts
import { supabase } from "./supabaseClient";

export type RetryOptions = {
  /** Maximaal aantal pogingen (excl. de eerste). Standaard: 3 */
  maxRetries?: number;
  /** Initiële wachttijd voor exponential backoff. Standaard: 800 ms */
  baseDelayMs?: number;
  /** Voeg jitter toe aan de wachttijd. Standaard: true */
  jitter?: boolean;
  /** Hook die wordt aangeroepen bij iedere retry */
  onRetry?: (info: {
    attempt: number;         // huidige retry poging (1-based)
    maxRetries: number;
    delayMs: number;
    reason: any;
  }) => void;
};

/** Kleine helper om te wachten */
function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

/** Redelijk brede detectie van auth/sessie fouten */
function isAuthError(err: any): boolean {
  const code = (err?.status ?? err?.code) as number | string | undefined;
  const msg = `${err?.message ?? err?.error_description ?? err?.hint ?? ""}`.toLowerCase();

  return (
    code === 401 ||
    code === 403 ||
    msg.includes("jwt") ||
    msg.includes("token") ||
    msg.includes("session") ||
    msg.includes("auth") ||
    msg.includes("expired") ||
    // PostgREST auth error
    (typeof code === "string" && code.startsWith("PGRST3"))
  );
}

/** Rate limiting */
function isRateLimit(err: any): boolean {
  const code = (err?.status ?? err?.code) as number | string | undefined;
  const msg = `${err?.message ?? ""}`.toLowerCase();
  return code === 429 || msg.includes("rate limit");
}

/** Netwerkfouten/ timeouts */
function isNetworkError(err: any): boolean {
  const msg = `${err?.message ?? ""}`.toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network error") ||
    msg.includes("load failed") ||
    msg.includes("timeout")
  );
}

/** 5xx server errors of generieke PostgREST codes */
function isServerError(err: any): boolean {
  const code = err?.status ?? err?.code;
  if (typeof code === "number") return code >= 500 && code < 600;
  if (typeof code === "string") return code.startsWith("PGRST5");
  return false;
}

/** Alles wat zinvol is om opnieuw te proberen */
function isRetriable(err: any): boolean {
  return isNetworkError(err) || isServerError(err) || isRateLimit(err) || isAuthError(err);
}

function backoffDelay(attemptIndex: number, baseMs: number, jitter: boolean): number {
  // attemptIndex = 0,1,2,...  ->  base * 2^attempt
  let delay = baseMs * Math.pow(2, attemptIndex);
  if (jitter) {
    //  +/- ~25% jitter
    const factor = 0.75 + Math.random() * 0.5;
    delay = Math.round(delay * factor);
  }
  return delay;
}

/** Probeert de Supabase sessie te verifiëren/verversen indien nodig */
async function tryRefreshSession(): Promise<void> {
  try {
    // In supabase-js v2 triggert getSession() intern een refresh als het JWT verlopen is
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    // Als er überhaupt geen sessie is, kunnen we niets silent fixen
    if (!data?.session) {
      // Laat de call gewoon opnieuw proberen; caller beslist of dit een harde fout is
      return;
    }
  } catch {
    // Negeer; de retry-loop zal nog steeds lopen
  }
}

/**
 * Robuuste retry helper.
 *
 * Voorbeeld:
 *   const data = await withRetry(() => supabase.from('x').select('*'));
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 800,
    jitter = true,
    onRetry,
  } = options;

  let lastError: any;

  // Eerste poging + maximaal maxRetries retries
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Bij de allereerste poging: zorg dat sessie recent is (no-op als al oké)
      if (attempt === 0) {
        await tryRefreshSession();
      }
      return await fn();
    } catch (err: any) {
      lastError = err;

      // Als het niet zinvol is om te herhalen -> direct throw
      if (!isRetriable(err) || attempt === maxRetries) {
        throw err;
      }

      // Bij auth-gerelateerde fouten: eerst proberen sessie te verversen
      if (isAuthError(err)) {
        await tryRefreshSession();
      }

      // Rate limit -> eventueel iets langere basis wachttijd
      const base = isRateLimit(err) ? Math.max(baseDelayMs, 1000) : baseDelayMs;
      const delay = backoffDelay(attempt, base, jitter);

      onRetry?.({
        attempt: attempt + 1, // 1-based voor logging
        maxRetries,
        delayMs: delay,
        reason: err,
      });

      // Wachten en opnieuw proberen
      await sleep(delay);
    }
  }

  // Zou nooit hier moeten komen
  throw lastError;
}
