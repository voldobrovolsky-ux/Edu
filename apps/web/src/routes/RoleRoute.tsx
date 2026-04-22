import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../state/auth";
import type { PrimaryRole } from "../types/roles";

export function RoleRoute({
  allow,
  children,
  fallbackTo = "/section/main",
}: {
  allow: PrimaryRole[];
  children: ReactNode;
  fallbackTo?: string;
}) {
  const auth = useAuth();
  const role = auth.user?.primaryRole;
  if (!role || !allow.includes(role)) {
    return <Navigate to={fallbackTo} replace />;
  }
  return children;
}
