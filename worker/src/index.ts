// Placeholder so the Worker deploys and can be connected to Cloudflare before T9 lands.
// The real proxy (validation, limits, cache, Aegis POST /v2/screen, {level, label?} contract)
// is specified in docs/designs/send-window-plan.md, T9.

export default {
  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/health") {
      return Response.json({ ok: true });
    }
    if (pathname === "/check") {
      return Response.json({ error: "not_implemented" }, { status: 501 });
    }
    return Response.json({ error: "not_found" }, { status: 404 });
  },
};
