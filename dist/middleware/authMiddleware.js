"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = void 0;
const supabase_1 = require("../lib/supabase");
const telemetry_1 = require("../lib/telemetry");
const authMiddleware = async (req, res, next) => {
    try {
        // Accept Bearer token from Authorization header OR cookie
        const authHeader = req.headers.authorization;
        const token = authHeader?.startsWith("Bearer ")
            ? authHeader.slice(7)
            : req.cookies?.access_token;
        if (!token) {
            res.status(401).json({ message: "Not authenticated" });
            return;
        }
        // Verify via Supabase (validates the JWT signature against your project)
        const { data, error } = await supabase_1.supabase.auth.getUser(token);
        if (error || !data.user) {
            const status = error && error.status !== 401 && error.status !== 403 ? 503 : 401;
            res.status(status).json({
                message: status === 401 ? "Invalid or expired token" : "Authentication service unavailable",
            });
            return;
        }
        req.user = { userId: data.user.id };
        (0, telemetry_1.setRequestUser)(data.user.id);
        next();
    }
    catch (error) {
        (0, telemetry_1.logError)("auth.middleware.failed", error);
        res.status(503).json({ message: "Authentication service unavailable" });
    }
};
exports.authMiddleware = authMiddleware;
