import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 네이버 블로그 검색 오픈API. 뉴스 검색과 같은 "검색" API 카테고리이므로
// naver-news 함수와 동일한 NAVER_CLIENT_ID/NAVER_CLIENT_SECRET 시크릿을 그대로 사용한다(신규 키 불필요).
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
  try {
    const body = await req.json();
    keyword = body?.keyword;
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

  const clientId = Deno.env.get("NAVER_CLIENT_ID");
  const clientSecret = Deno.env.get("NAVER_CLIENT_SECRET");

  const url = new URL("https://openapi.naver.com/v1/search/blog.json");
  url.searchParams.set("query", keyword);
  url.searchParams.set("display", "100");
  url.searchParams.set("sort", "date");

  try {
    const naverResponse = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": clientId ?? "",
        "X-Naver-Client-Secret": clientSecret ?? "",
      },
    });

    if (!naverResponse.ok) {
      throw new Error(`Naver blog API responded with status ${naverResponse.status}`);
    }

    // 응답 Content-Type의 charset 유무와 무관하게 항상 UTF-8로 명시 디코딩한다
    // (한글 깨짐 방지).
    const buffer = await naverResponse.arrayBuffer();
    const rawText = new TextDecoder("utf-8").decode(buffer);
    const data = JSON.parse(rawText);

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
    return new Response(JSON.stringify({ error: "Failed to fetch blog results from Naver API" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
