"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = void 0;
const supabase_1 = require("../lib/supabase");
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
            res.status(401).json({ message: "Invalid or expired token" });
            return;
        }
        req.user = { userId: data.user.id };
        next();
    }
    catch (error) {
        console.error("Auth middleware error:", error);
        res.status(401).json({ message: "Not authenticated" });
    }
};
exports.authMiddleware = authMiddleware;
