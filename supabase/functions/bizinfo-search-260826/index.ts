import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 기업마당(bizinfo) 지원사업정보 오픈API
// https://www.bizinfo.go.kr/web/lay1/program/S1T175C174/apiDetail.do?id=bizinfoApi
// 실제 라이브 호출로 확인된 엔드포인트/응답 필드를 기준으로 구현.
const BIZINFO_ENDPOINT = "https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do";

interface BizinfoItem {
  pblancId?: string;
  pblancNm?: string;
  bsnsSumryCn?: string;
  reqstBeginEndDe?: string;
  jrsdInsttNm?: string;
  excInsttNm?: string;
  refrncNm?: string;
  pblancUrl?: string;
  hashtags?: string;
  trgetNm?: string;
  pldirSportRealmLclasCodeNm?: string;
  pldirSportRealmMlsfcCodeNm?: string;
  creatPnttm?: string;
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

  const crtfcKey = Deno.env.get("BIZINFO_API_KEY");
  if (!crtfcKey) {
    return new Response(JSON.stringify({ error: "Bizinfo API key not configured" }), {
      status: 503,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const url = new URL(BIZINFO_ENDPOINT);
  url.searchParams.set("crtfcKey", crtfcKey);
  url.searchParams.set("searchCnt", "100");
  url.searchParams.set("dataType", "json");

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Bizinfo API responded with status ${response.status}`);
    }
    // 응답 Content-Type의 charset 유무와 무관하게 항상 UTF-8로 명시 디코딩한다
    // (한글 깨짐 방지).
    const buffer = await response.arrayBuffer();
    const rawText = new TextDecoder("utf-8").decode(buffer);
    const data = JSON.parse(rawText);
    const list: BizinfoItem[] = Array.isArray(data?.jsonArray) ? data.jsonArray : [];

    // 문서상 검색 파라미터의 정확한 쿼리 필드명이 확인되지 않아,
    // 임의 파라미터를 만들지 않고 확인된 응답 필드로 직접 필터링한다.
    const lowerKeyword = keyword.toLowerCase();
    const filtered = list.filter((item) => {
      const haystack = [item.pblancNm, item.bsnsSumryCn, item.hashtags]
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
    return new Response(JSON.stringify({ error: "Failed to fetch from Bizinfo API" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
