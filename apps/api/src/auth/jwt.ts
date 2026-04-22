import jwt from "jsonwebtoken";
import type { PrimaryRole } from "../types/roles.js";

export type JwtPayload = {
  userId: string;
  primaryRole: PrimaryRole;
};

const JWT_SECRET = process.env.JWT_SECRET || "dev-edumed-jwt-secret";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (typeof decoded !== "object" || decoded === null) {
    throw new Error("Invalid token payload");
  }

  const p = decoded as Partial<JwtPayload>;
  if (!p.userId || !p.primaryRole) {
    throw new Error("Invalid token payload");
  }
  return { userId: p.userId, primaryRole: p.primaryRole };
}

