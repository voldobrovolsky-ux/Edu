import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import "./index.css";
import { router } from "./router";
import { AuthProvider } from "./state/auth";
import { PersonalizationPreviewProvider } from "./state/personalizationPreview";
import { UiPreferencesProvider } from "./state/uiPreferences";
import { ensureSystemSoundsUnlockedOnFirstGesture } from "./audio/systemSounds";

/** Маркер сборки: в DevTools → Elements на `<html>` должен быть этот атрибут. */
document.documentElement.dataset.edumedWeb = "communitoria-ui-v3";

ensureSystemSoundsUnlockedOnFirstGesture();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <UiPreferencesProvider>
      <PersonalizationPreviewProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </PersonalizationPreviewProvider>
    </UiPreferencesProvider>
  </StrictMode>
);
