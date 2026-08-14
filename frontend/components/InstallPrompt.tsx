"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";

const DISMISSED_KEY = "installPromptDismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function InstallPrompt() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && !!localStorage.getItem(DISMISSED_KEY)
  );
  const [eligibleForIos] = useState(() => typeof window !== "undefined" && isIos() && !isStandalone());
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  }

  async function handleAndroidInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  }

  const variant = eligibleForIos ? "ios" : deferredPrompt ? "android" : null;
  if (!user || dismissed || !variant) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
      <div className="mx-auto flex max-w-2xl items-center gap-3">
        <span className="text-sm text-gray-700">
          {variant === "ios"
            ? "把 SnapLedger 装到主屏幕：点击分享图标 → “添加到主屏幕”"
            : "把 SnapLedger 装到桌面，像 App 一样打开"}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {variant === "android" && (
            <button
              onClick={handleAndroidInstall}
              className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white"
            >
              安装
            </button>
          )}
          <button
            onClick={dismiss}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
            aria-label="Dismiss"
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  );
}
