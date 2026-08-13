/**
 * Cloudflare Worker — serves static dashboard files + acts as CORS proxy for Yahoo Finance.
 *
 * Routes:
 *   /api/yahoo?sym=^NSEI&interval=5m&period1=1234567890&period2=1234567890
 *   /  (and all other paths) → serves static assets
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // === CORS PROXY for Yahoo Finance ===
    if (url.pathname === "/api/yahoo") {
      const sym = url.searchParams.get("sym") || "^NSEI";
      const interval = url.searchParams.get("interval") || "5m";
      const period1 = url.searchParams.get("period1");
      const period2 = url.searchParams.get("period2");
      const range = url.searchParams.get("range");

      let yahooUrl;
      if (period1 && period2) {
        yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?period1=${period1}&period2=${period2}&interval=${interval}`;
      } else {
        yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=${range || "60d"}&interval=${interval}`;
      }

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
      const response = await env.ASSETS.fetch(request);
      if (response.status !== 404) {
        return response;
      }
      return env.ASSETS.fetch(new Request(new URL("/", request.url), request));
    }

    return new Response("ASSETS binding not configured.", { status: 500 });
  }
}
