/**
 * Cloudflare Worker — serves static dashboard files + acts as CORS proxy.
 *
 * Routes:
 *   /api/yahoo?sym=^NSEI&interval=5m&range=3mo      → Yahoo Finance (max 60 days for intraday)
 *   /api/twelvedata?sym=NIFTY&interval=5min&start=2025-01-01&end=2025-08-13&apikey=KEY
 *   /  (and all other paths)                         → serves static assets
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // === Yahoo Finance proxy (max 60 days for intraday) ===
    if (url.pathname === "/api/yahoo") {
      const sym = url.searchParams.get("sym") || "^NSEI";
      const interval = url.searchParams.get("interval") || "5m";
      const range = url.searchParams.get("range") || "3mo";
      const encodedSym = encodeURIComponent(sym);
      const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedSym}?range=${range}&interval=${interval}`;

      try {
        const resp = await fetch(yahooUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
        });
        const data = await resp.text();
        return new Response(data, {
          status: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 502,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
    }

    // === Twelve Data proxy (supports years of intraday data) ===
    if (url.pathname === "/api/twelvedata") {
      const sym = url.searchParams.get("sym") || "NIFTY";
      const interval = url.searchParams.get("interval") || "5min";
      const start = url.searchParams.get("start");
      const end = url.searchParams.get("end");
      const apikey = url.searchParams.get("apikey");

      if (!apikey) {
        return new Response(JSON.stringify({ error: "Twelve Data API key required. Get a free key at twelvedata.com" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      // Twelve Data max 5000 points per request — use outputsize=5000
      let tdUrl = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(sym)}&interval=${interval}&outputsize=5000&apikey=${apikey}`;
      if (start) tdUrl += `&start_date=${start}`;
      if (end) tdUrl += `&end_date=${end}`;

      try {
        const resp = await fetch(tdUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
        });
        const data = await resp.text();
        return new Response(data, {
          status: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" },
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
      if (response.status !== 404) return response;
      return env.ASSETS.fetch(new Request(new URL("/", request.url), request));
    }

    return new Response("ASSETS binding not configured.", { status: 500 });
  }
}
