const PENDING_KEY = "edumed.postLoginSplash.pending";

export function markPostLoginSplashPending(): void {
  try {
    sessionStorage.setItem(PENDING_KEY, "1");
  } catch {
    // ignore
  }
}

export function clearPostLoginSplashSession(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}

export function shouldShowPostLoginSplash(): boolean {
  try {
    return sessionStorage.getItem(PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

export function markPostLoginSplashFinished(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}
