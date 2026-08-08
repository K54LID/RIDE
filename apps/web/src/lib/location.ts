/**
 * Telegram's in-app location, with a graceful fall back to the bot.
 *
 * LocationManager arrived in Bot API 8.0. Where it exists, the app can
 * ask for a fix with a native permission prompt and never send anybody
 * to the chat — which is the whole problem with the bot keyboard: it
 * lives at the bottom of a conversation and is easy to lose once other
 * messages scroll past.
 *
 * Everything here is feature-detected. An older Telegram simply reports
 * `unsupported` and the caller uses the keyboard path, so this cannot
 * make the existing flow worse.
 */

interface LocationData {
  latitude: number;
  longitude: number;
}

interface LocationManager {
  isInited?: boolean;
  isLocationAvailable?: boolean;
  isAccessGranted?: boolean;
  isAccessRequested?: boolean;
  init: (cb?: () => void) => void;
  getLocation: (cb: (data: LocationData | null) => void) => void;
  openSettings?: () => void;
}

function manager(): LocationManager | null {
  return (window as unknown as {
    Telegram?: { WebApp?: { LocationManager?: LocationManager } };
  }).Telegram?.WebApp?.LocationManager ?? null;
}

/** Whether this client can capture a location without leaving the app. */
export function canRequestInApp(): boolean {
  return manager() !== null;
}

export type LocationResult =
  | { status: 'ok'; latitude: number; longitude: number }
  /** Client too old, or location hardware unavailable. Use the bot. */
  | { status: 'unsupported' }
  /** Asked and refused. Telegram will not re-prompt; settings can. */
  | { status: 'denied' }
  | { status: 'failed' };

/**
 * Ask for one fix.
 *
 * `init` must complete before `getLocation`, and both are callback-based,
 * so they are wrapped rather than used raw. Each is given a timeout: a
 * callback that never fires would otherwise leave the button spinning
 * forever, which is exactly the failure the bot flow already had.
 */
export async function requestLocationInApp(): Promise<LocationResult> {
  const lm = manager();
  if (!lm) return { status: 'unsupported' };

  const withTimeout = <T>(fn: (cb: (v: T) => void) => void, ms: number): Promise<T | 'timeout'> =>
    new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; resolve('timeout'); } }, ms);
      fn((v) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(v);
      });
    });

  if (!lm.isInited) {
    const inited = await withTimeout<void>((cb) => lm.init(() => cb(undefined)), 8000);
    if (inited === 'timeout') return { status: 'failed' };
  }

  if (lm.isLocationAvailable === false) return { status: 'unsupported' };

  const data = await withTimeout<LocationData | null>((cb) => lm.getLocation(cb), 20000);
  if (data === 'timeout') return { status: 'failed' };

  // Telegram returns null both for a refusal and for a failure to fix a
  // position. `isAccessGranted` is what separates them, and it decides
  // whether offering "open settings" would help or just confuse.
  if (!data) {
    return lm.isAccessGranted === false ? { status: 'denied' } : { status: 'failed' };
  }
  return { status: 'ok', latitude: data.latitude, longitude: data.longitude };
}

/** Deep-link to Telegram's own permission screen after a refusal. */
export function openLocationSettings(): void {
  manager()?.openSettings?.();
}
