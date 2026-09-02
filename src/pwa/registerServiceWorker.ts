export interface ServiceWorkerRegistrationHooks {
  onRegistered?: (registration: ServiceWorkerRegistration) => void;
  onOfflineReady?: (registration: ServiceWorkerRegistration) => void;
  onUpdateAvailable?: (registration: ServiceWorkerRegistration) => void;
  onError?: (error: unknown) => void;
}

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

function watchForUpdates(
  registration: ServiceWorkerRegistration,
  hooks: ServiceWorkerRegistrationHooks,
): void {
  if (registration.waiting && navigator.serviceWorker.controller) {
    hooks.onUpdateAvailable?.(registration);
  }

  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    if (!worker) return;

    worker.addEventListener("statechange", () => {
      if (worker.state !== "installed") return;

      if (navigator.serviceWorker.controller) {
        hooks.onUpdateAvailable?.(registration);
      } else {
        hooks.onOfflineReady?.(registration);
      }
    });
  });
}

/** Registers the static service worker at the current Vite/GitHub Pages base. */
export function registerServiceWorker(
  hooks: ServiceWorkerRegistrationHooks = {},
): Promise<ServiceWorkerRegistration | null> {
  if (registrationPromise) return registrationPromise;

  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !window.isSecureContext
  ) {
    return Promise.resolve(null);
  }

  registrationPromise = (async () => {
    try {
      const serviceWorkerUrl = new URL("sw.js", new URL(import.meta.env.BASE_URL, window.location.href));
      const scope = new URL("./", serviceWorkerUrl).pathname;
      const registration = await navigator.serviceWorker.register(serviceWorkerUrl, {
        scope,
        updateViaCache: "none",
      });

      watchForUpdates(registration, hooks);
      hooks.onRegistered?.(registration);
      void registration.update().catch(() => {
        // Offline startup is expected to work from the existing registration.
      });
      return registration;
    } catch (error) {
      registrationPromise = null;
      hooks.onError?.(error);
      return null;
    }
  })();

  return registrationPromise;
}

/** Activates a waiting update. Reloading is opt-in to avoid losing unsaved edits. */
export function activateServiceWorkerUpdate(
  registration: ServiceWorkerRegistration,
  reloadAfterActivation = false,
): void {
  const waiting = registration.waiting;
  if (!waiting) return;

  if (reloadAfterActivation) {
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  }

  waiting.postMessage({ type: "SKIP_WAITING" });
}
