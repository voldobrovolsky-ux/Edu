import type { FlorusSession } from "@edumed/florium";
import type { User } from "../types/user";

/** Maps the host `User` (from `state/auth`) into Flörium's slim session. */
export function toFlorusSession(user: User): FlorusSession {
  return {
    id: user.id,
    username: user.username,
  };
}
