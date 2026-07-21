type OriginCallback = (error: Error | null, allow?: boolean) => void;

// Vercel production and preview deployments use HTTPS subdomains of
// vercel.app. Keep this platform rule in code because existing Render services
// do not automatically receive newly added Blueprint environment variables.
const BUILT_IN_ORIGIN_RULES = ["https://*.vercel.app"];

const rawRules = Array.from(
  new Set(
    [
      ...BUILT_IN_ORIGIN_RULES,
      process.env.CLIENT_URL,
      ...(process.env.CLIENT_URLS ?? "").split(","),
    ]
      .map((rule) => rule?.trim().replace(/\/$/, ""))
      .filter((rule): rule is string => Boolean(rule))
  )
);

const escapeRegExp = (value: string) => value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");

const originMatchers = rawRules.map((rule) => {
  if (!/^https?:\/\//i.test(rule)) {
    throw new Error(`Invalid CORS origin '${rule}': expected an http(s) URL`);
  }

  const pattern = escapeRegExp(rule).replace(/\*/g, "[^./]+");
  return new RegExp(`^${pattern}$`, "i");
});

export const isAllowedOrigin = (origin?: string): boolean => {
  if (!origin) return true;

  let normalized: string;
  try {
    normalized = new URL(origin).origin.replace(/\/$/, "");
  } catch {
    return false;
  }

  if (originMatchers.some((matcher) => matcher.test(normalized))) return true;

  return process.env.NODE_ENV !== "production" &&
    /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(normalized);
};

export const validateCorsConfiguration = () => {
  console.log(`[CORS] Allowed origin rules: ${rawRules.join(", ")}`);
};

export const corsOrigin = (origin: string | undefined, callback: OriginCallback) => {
  if (isAllowedOrigin(origin)) {
    callback(null, true);
    return;
  }

  console.warn(`[CORS] Rejected origin: ${origin ?? "<none>"}`);
  callback(new Error(`CORS: origin '${origin}' not allowed`));
};
