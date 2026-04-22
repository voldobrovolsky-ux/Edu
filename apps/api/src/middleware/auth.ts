import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt.js";
import { userStore } from "../store/userStore.js";

export interface AuthedRequest extends Request {
  userId?: string;
}

export function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  const token =
    header?.startsWith("Bearer ") ? header.slice(7).trim() : undefined;
  if (!token) {
    res.status(401).json({ error: "Требуется авторизация" });
    return;
  }
  const payload = verifyToken(token);
  if (!payload?.userId) {
    res.status(401).json({ error: "Недействительный токен" });
    return;
  }
  const user = userStore.findById(payload.userId);
  if (!user) {
    res.status(401).json({ error: "Пользователь не найден" });
    return;
  }
  req.userId = payload.userId;
  next();
}
