import { createHash } from "node:crypto";
import type { CatchUpDigest, DigestSourceMessage } from "./geminiDigest";

interface CachedDigest { digest: CatchUpDigest; model: string; generatedAt: string; expiresAt: number }
interface QuotaEntry { count: number; resetAt: number }

const cache = new Map<string, CachedDigest>();
const quotas = new Map<string, QuotaEntry>();

const boundedInteger = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};

export const digestFingerprint = (userId: string, chatId: string, messages: DigestSourceMessage[]) => createHash("sha256")
  .update(JSON.stringify([userId, chatId, messages]))
  .digest("hex");

export const readDigestCache = (key: string): CachedDigest | null => {
  const cached = cache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) { cache.delete(key); return null; }
  return cached;
};

export const writeDigestCache = (key: string, digest: CatchUpDigest, model: string, generatedAt: string) => {
  const ttlMs = boundedInteger(process.env.AI_DIGEST_CACHE_TTL_MS, 5 * 60_000, 10_000, 60 * 60_000);
  if (cache.size >= 200) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { digest, model, generatedAt, expiresAt: Date.now() + ttlMs });
};

export const consumeDigestQuota = (userId: string, chatId: string): { allowed: true } | { allowed: false; retryAfter: number } => {
  const now = Date.now();
  const limit = boundedInteger(process.env.AI_DIGEST_RATE_LIMIT, 5, 1, 50);
  const windowMs = boundedInteger(process.env.AI_DIGEST_RATE_WINDOW_MS, 10 * 60_000, 10_000, 60 * 60_000);
  const key = `${userId}:${chatId}`;
  let entry = quotas.get(key);
  if (!entry || entry.resetAt <= now) entry = { count: 0, resetAt: now + windowMs };
  entry.count += 1;
  quotas.set(key, entry);
  return entry.count <= limit ? { allowed: true } : { allowed: false, retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
};

export const resetAiDigestStateForTests = () => { cache.clear(); quotas.clear(); };
