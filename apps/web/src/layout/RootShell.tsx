import { Outlet } from "react-router-dom";
import { LogoutAnimationProvider } from "../state/logoutAnimation";

export function RootShell() {
  return (
    <LogoutAnimationProvider>
      <Outlet />
    </LogoutAnimationProvider>
  );
}
