import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let keyword: string | undefined;
  let count: unknown;
  try {
    const body = await req.json();
    keyword = body?.keyword;
    count = body?.count;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  if (!keyword || typeof keyword !== "string") {
    return new Response(JSON.stringify({ error: "keyword is required" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const display = Number.isInteger(count) && (count as number) > 0 ? (count as number) : 5;

  const clientId = Deno.env.get("NAVER_CLIENT_ID");
  const clientSecret = Deno.env.get("NAVER_CLIENT_SECRET");

  const url = new URL("https://openapi.naver.com/v1/search/news.json");
  url.searchParams.set("query", keyword);
  url.searchParams.set("display", String(display));
  url.searchParams.set("sort", "date");

  try {
    const naverResponse = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": clientId ?? "",
        "X-Naver-Client-Secret": clientSecret ?? "",
      },
    });

    if (!naverResponse.ok) {
      throw new Error(`Naver API responded with status ${naverResponse.status}`);
    }

    const data = await naverResponse.json();

    if (Array.isArray(data.items)) {
      data.items = data.items.map((item: Record<string, unknown>) => ({
        ...item,
        title: decodeHtmlEntities(String(item.title ?? "")),
        description: decodeHtmlEntities(String(item.description ?? "")),
      }));
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch news from Naver API" }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }
});
