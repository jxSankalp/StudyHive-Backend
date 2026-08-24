/// <reference path="../types/index.d.ts" />
import { Request, Response, NextFunction } from "express";
import { supabase } from "../lib/supabase";
import { logError, setRequestUser } from "../lib/telemetry";

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Accept Bearer token from Authorization header OR cookie
    const authHeader = req.headers.authorization;
    const token =
      authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7)
        : req.cookies?.access_token;

    if (!token) {
      res.status(401).json({ message: "Not authenticated" });
      return;
    }

    // Verify via Supabase (validates the JWT signature against your project)
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      const status = error && error.status !== 401 && error.status !== 403 ? 503 : 401;
      res.status(status).json({
        message: status === 401 ? "Invalid or expired token" : "Authentication service unavailable",
      });
      return;
    }

    req.user = { userId: data.user.id };
    setRequestUser(data.user.id);
    next();
  } catch (error) {
    logError("auth.middleware.failed", error);
    res.status(503).json({ message: "Authentication service unavailable" });
  }
};
