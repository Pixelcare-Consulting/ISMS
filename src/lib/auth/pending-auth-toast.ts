const STORAGE_KEY = "isms.pending-auth-toast";

export type PendingAuthToast =
  | { kind: "welcome"; name?: string | null }
  | { kind: "signed-out" };

function welcomeMessage(name?: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? `Welcome back, ${trimmed}` : "Welcome back";
}

export function messageForPendingAuthToast(toast: PendingAuthToast): string {
  switch (toast.kind) {
    case "welcome":
      return welcomeMessage(toast.name);
    case "signed-out":
      return "You have signed out";
    default: {
      const _exhaustive: never = toast;
      return _exhaustive;
    }
  }
}

export function queuePendingAuthToast(toast: PendingAuthToast): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(toast));
  } catch {
    // Private mode or blocked storage — skip; in-flight toasts would not survive navigation anyway.
  }
}

export function consumePendingAuthToast(): PendingAuthToast | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(STORAGE_KEY);
    const parsed = JSON.parse(raw) as PendingAuthToast;
    if (parsed?.kind === "welcome" || parsed?.kind === "signed-out") {
      return parsed;
    }
    return null;
  } catch {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    return null;
  }
}
