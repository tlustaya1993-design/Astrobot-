import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../routes/auth.js";

declare module "express" {
  interface Request {
    sessionId?: string;
    authEmail?: string;
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
      const payload = jwt.verify(token, JWT_SECRET) as { sessionId: string; email?: string };
      req.sessionId = payload.sessionId;
      req.authEmail = payload.email;
      return next();
    } catch {
      // Invalid token — fall through to x-session-id
    }
  }

  const xSession = req.headers["x-session-id"] as string | undefined;
  if (xSession) {
    req.sessionId = xSession;
  }

  next();
}
