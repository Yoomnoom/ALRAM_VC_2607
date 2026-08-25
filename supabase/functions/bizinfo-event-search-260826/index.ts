import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 기업마당(bizinfo) 행사정보 오픈API
// https://www.bizinfo.go.kr/apiDetail.do?id=bizinfoEventApi
// 지원사업정보(bizinfoApi)와는 별도 API/시크릿이며, 실제 라이브 호출로 확인된 응답 필드를 기준으로 구현.
const BIZINFO_EVENT_ENDPOINT = "https://www.bizinfo.go.kr/uss/rss/bizinfoEventApi.do";

interface BizinfoEventItem {
  eventInfoId?: string;
  nttNm?: string;
  nttCn?: string;
  eventBeginEndDe?: string;
  rceptPd?: string;
  registDe?: string;
  areaNm?: string;
  eventInfoTyNm?: string;
  originEngnNm?: string;
  bizinfoUrl?: string;
  orginlUrlAdres?: string;
  hashtags?: string;
  [key: string]: unknown;
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

  const crtfcKey = Deno.env.get("BIZINFOEVENT_API_KEY");
  if (!crtfcKey) {
    return new Response(JSON.stringify({ error: "Bizinfo event API key not configured" }), {
      status: 503,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const url = new URL(BIZINFO_EVENT_ENDPOINT);
  url.searchParams.set("crtfcKey", crtfcKey);
  url.searchParams.set("searchCnt", "100");
  url.searchParams.set("dataType", "json");

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Bizinfo event API responded with status ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    const rawText = new TextDecoder("utf-8").decode(buffer);
    const data = JSON.parse(rawText);
    const list: BizinfoEventItem[] = Array.isArray(data?.jsonArray) ? data.jsonArray : [];

    const lowerKeyword = keyword.toLowerCase();
    const filtered = list.filter((item) => {
      const haystack = [item.nttNm, item.nttCn, item.hashtags]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(lowerKeyword);
    });

    return new Response(JSON.stringify({ items: filtered, totalScanned: list.length }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Failed to fetch from Bizinfo event API" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
