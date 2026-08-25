import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  let body: { location?: unknown; lat?: unknown; lon?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const hasLocation = typeof body.location === "string" && body.location.trim().length > 0;
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  const hasCoordinates = Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lon) && lon >= -180 && lon <= 180;
  if (!hasLocation && !hasCoordinates) return json({ error: "location or valid coordinates are required" }, 400);

  const apiKey = Deno.env.get("OPENWEATHER_API_KEY");
  if (!apiKey) return json({ error: "OpenWeather API key not configured" }, 503);

  const query = new URLSearchParams({ appid: apiKey, units: "metric", lang: "kr" });
  if (hasLocation) query.set("q", String(body.location));
  else {
    query.set("lat", String(lat));
    query.set("lon", String(lon));
  }

  try {
    const [currentResponse, forecastResponse] = await Promise.all([
      fetch(`https://api.openweathermap.org/data/2.5/weather?${query}`),
      fetch(`https://api.openweathermap.org/data/2.5/forecast?${query}`),
    ]);
    if (!currentResponse.ok || !forecastResponse.ok) {
      throw new Error(`OpenWeather responded with ${currentResponse.status}/${forecastResponse.status}`);
    }
    const [current, forecast] = await Promise.all([currentResponse.json(), forecastResponse.json()]);
    return json({ current, forecast });
  } catch (error) {
    console.error(error);
    return json({ error: "Failed to fetch weather" }, 502);
  }
});
