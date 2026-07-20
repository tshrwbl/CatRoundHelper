import { registerSW } from "virtual:pwa-register";

let updateServiceWorker;

export function registerPwa() {
  // Service workers make local development confusing when they cache an older
  // bundle, so register only for production builds and production previews.
  if (!import.meta.env.PROD) return;
  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      window.dispatchEvent(new Event("cap-compass-update-ready"));
    },
  });
}

export function activatePendingUpdate() {
  // Passing true asks the waiting service worker to activate before reload.
  // The helper reloads the page after activation, opening the new SQLite file.
  updateServiceWorker?.(true);
}
