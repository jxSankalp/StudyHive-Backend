"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.corsOrigin = exports.validateCorsConfiguration = exports.isAllowedOrigin = void 0;
const rawRules = [process.env.CLIENT_URL, ...(process.env.CLIENT_URLS ?? "").split(",")]
    .map((rule) => rule?.trim().replace(/\/$/, ""))
    .filter((rule) => Boolean(rule));
const escapeRegExp = (value) => value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
const originMatchers = rawRules.map((rule) => {
    if (!/^https?:\/\//i.test(rule)) {
        throw new Error(`Invalid CORS origin '${rule}': expected an http(s) URL`);
    }
    const pattern = escapeRegExp(rule).replace(/\*/g, "[^./]+");
    return new RegExp(`^${pattern}$`, "i");
});
const isAllowedOrigin = (origin) => {
    if (!origin)
        return true;
    let normalized;
    try {
        normalized = new URL(origin).origin.replace(/\/$/, "");
    }
    catch {
        return false;
    }
    if (originMatchers.some((matcher) => matcher.test(normalized)))
        return true;
    return process.env.NODE_ENV !== "production" &&
        /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(normalized);
};
exports.isAllowedOrigin = isAllowedOrigin;
const validateCorsConfiguration = () => {
    if (process.env.NODE_ENV === "production" && rawRules.length === 0) {
        console.warn("[CORS] No production origins configured. Set CLIENT_URL or CLIENT_URLS; browser requests will be rejected.");
    }
};
exports.validateCorsConfiguration = validateCorsConfiguration;
const corsOrigin = (origin, callback) => {
    if ((0, exports.isAllowedOrigin)(origin)) {
        callback(null, true);
        return;
    }
    console.warn(`[CORS] Rejected origin: ${origin ?? "<none>"}`);
    callback(new Error(`CORS: origin '${origin}' not allowed`));
};
exports.corsOrigin = corsOrigin;
