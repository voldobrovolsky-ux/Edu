import { Navigate } from "react-router-dom";
import { useAuth } from "../state/auth";

export function PrivateRoute({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  if (!auth.isAuthenticated()) return <Navigate to="/login" replace />;
  return children;
}

