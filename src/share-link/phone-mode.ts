// Phone mode: the shared link opens as the bare phone interface, without the studio chrome (sidebar, editor,
// toolbar). It is on when the link says `?view=phone`, off for `?view=studio`, and otherwise follows the device:
// a phone-sized viewport (or a touch device up to tablet width) gets it automatically, so a link shared to an
// iPhone just opens the app. Pure functions: the caller passes in what it measured.
export type ViewParam = "phone" | "studio";
export type ChromeStyle = "ios" | "android";

export interface DeviceInfo {
  width: number;
  /** True for a touch-first primary pointer (matchMedia("(pointer: coarse)")). */
  coarsePointer: boolean;
}

export const PHONE_MAX_WIDTH = 640;
export const TOUCH_MAX_WIDTH = 900;

export function parseViewParam(search: string): ViewParam | undefined {
  const value = new URLSearchParams(search).get("view");
  return value === "phone" || value === "studio" ? value : undefined;
}

/** A phone-class device: a narrow viewport, or a touch device that is not much wider than a large phone. */
export function isPhoneDevice(device: DeviceInfo): boolean {
  return device.width <= PHONE_MAX_WIDTH || (device.coarsePointer && device.width <= TOUCH_MAX_WIDTH);
}

export interface PhoneModeResolution {
  /** Show only the phone interface. */
  phoneMode: boolean;
  /** Fill the whole screen with no device bezel (a real phone); otherwise the phone is drawn as a device. */
  fullscreen: boolean;
}

export function resolvePhoneMode(search: string, device: DeviceInfo): PhoneModeResolution {
  const view = parseViewParam(search);
  const onPhone = isPhoneDevice(device);
  if (view === "studio") return { phoneMode: false, fullscreen: false };
  if (view === "phone") return { phoneMode: true, fullscreen: onPhone };
  return { phoneMode: onPhone, fullscreen: onPhone };
}

/** iOS look for iPhone/iPad (including iPadOS, which reports as a Mac with touch), Android look for Android. */
export function detectChromeStyle(userAgent: string, maxTouchPoints: number): ChromeStyle | undefined {
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return "ios";
  if (/Android/.test(userAgent)) return "android";
  return undefined;
}

/** The same address with `view=phone` set (or removed): what "Copy phone link" shares. */
export function withViewParam(href: string, view: ViewParam | undefined): string {
  const url = new URL(href);
  if (view) url.searchParams.set("view", view);
  else url.searchParams.delete("view");
  return url.toString();
}
