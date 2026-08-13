/**
 * Cloudflare Worker — serves static dashboard files + acts as CORS proxy for Yahoo Finance.
 * 
 * Routes:
 *   /api/yahoo?sym=BTC-USD&interval=5m&range=60d  → fetches Yahoo Finance server-side
 *   /  (and all other paths)                        → serves static assets
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // === CORS PROXY for Yahoo Finance ===
    if (url.pathname === "/api/yahoo") {
      const sym = url.searchParams.get("sym") || "^NSEI";
      const interval = url.searchParams.get("interval") || "5m";
      const range = url.searchParams.get("range") || "60d";
      const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=${range}&interval=${interval}`;

      try {
        const resp = await fetch(yahooUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
        });
        const data = await resp.text();
        return new Response(data, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=60",
          },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 502,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
    }

    // === SERVE STATIC ASSETS ===
    if (env.ASSETS) {
      // Try the exact path first
      const response = await env.ASSETS.fetch(request);
      if (response.status !== 404) {
        return response;
      }
      // Fallback to index.html for SPA routing
      return env.ASSETS.fetch(new Request(new URL("/", request.url), request));
    }

    return new Response("ASSETS binding not configured.", { status: 500 });
  }
}
