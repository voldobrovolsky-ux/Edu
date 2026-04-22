import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "./jwt.js";

export type AuthedRequest = Request & {
  auth?: {
    userId: string;
    primaryRole: string;
  };
};

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.header("authorization") || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }
  try {
    const payload = verifyAccessToken(token);
    req.auth = payload;
    return next();
  } catch {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }
}

