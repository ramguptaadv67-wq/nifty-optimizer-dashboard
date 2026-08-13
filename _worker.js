export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // Serve static assets via the ASSETS binding
    if (env.ASSETS) {
      const response = await env.ASSETS.fetch(request);
      if (response.status !== 404) {
        return response;
      }
    }
    
    // Fallback to index.html for any unmatched route
    if (env.ASSETS) {
      return env.ASSETS.fetch(new Request(new URL("/", request.url), request));
    }
    
    // If no ASSETS binding, return a simple message
    return new Response(
      "Dashboard deployed. The ASSETS binding is not configured.\n" +
      "In Cloudflare dashboard: Settings > Bindings > Add > Assets > Set path to ./",
      { status: 200, headers: { "Content-Type": "text/plain" } }
    );
  }
}
