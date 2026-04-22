import jwt from "jsonwebtoken";
import type { PrimaryRole } from "../types/roles.js";

const SECRET = process.env.JWT_SECRET ?? "edumed-dev-secret-change-in-prod";
const EXPIRES = process.env.JWT_EXPIRES ?? "7d";

export interface JwtPayload {
  sub: string;
  userId: string;
  primaryRole: PrimaryRole;
}

export function signToken(userId: string, primaryRole: PrimaryRole): string {
  return jwt.sign(
    { sub: userId, userId, primaryRole },
    SECRET,
    { expiresIn: EXPIRES } as jwt.SignOptions,
  );
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, SECRET) as JwtPayload;
    return decoded;
  } catch {
    return null;
  }
}
