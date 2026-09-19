import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../lib/auth-jwt.js";

declare module "express" {
  interface Request {
    sessionId?: string;
    authEmail?: string;
    authTokenInvalid?: boolean;
  }
}

/**
 * Injects req.sessionId from either:
 *  1. JWT Bearer token in Authorization header (authenticated users)
 *  2. x-session-id header (anonymous / legacy sessions)
 *
 * Does NOT block requests without auth — downstream routes check as needed.
 */
export function sessionMiddleware(req: Request, _res: Response, next: NextFunction) {
  const auth = req.headers["authorization"];
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { sessionId?: unknown; email?: unknown };
      if (typeof payload.sessionId !== "string" || !payload.sessionId.trim()) {
        req.authTokenInvalid = true;
        return next();
      }
      req.sessionId = payload.sessionId;
      if (typeof payload.email === "string") {
        req.authEmail = payload.email;
      }
      return next();
    } catch {
      req.authTokenInvalid = true;
      return next();
    }
  }

  const xSession = req.headers["x-session-id"] as string | undefined;
  if (xSession) {
    req.sessionId = xSession;
  }

  next();
}
