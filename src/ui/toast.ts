// A small non-blocking confirmation ("Link copied") instead of window.alert. One live region, one toast at a time.
let timer: ReturnType<typeof setTimeout> | undefined;

export function showToast(message: string, durationMs = 2200): void {
  let region = document.getElementById("toast-region");
  if (!region) {
    region = document.createElement("div");
    region.id = "toast-region";
    region.className = "toast-region";
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    document.body.append(region);
  }
  region.textContent = "";
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  region.append(toast);
  clearTimeout(timer);
  timer = setTimeout(() => toast.remove(), durationMs);
}
