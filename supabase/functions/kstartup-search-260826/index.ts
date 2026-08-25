import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 창업진흥원 K-Startup 지원사업 공고정보 오픈API(공공데이터포털)
// https://www.data.go.kr/data/15125364/openapi.do
// 실제 라이브 호출로 확인된 엔드포인트/오퍼레이션/응답 필드를 기준으로 구현.
// https 인증서 체인 문제(공공데이터포털 API들의 흔한 이슈)로 Deno 런타임에서 fetch가
// 거부되는 사례가 있어 http로 호출한다(API 자체는 http도 지원).
const KSTARTUP_ENDPOINT =
  "http://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01";

interface KstartupItem {
  pbanc_sn?: number;
  biz_pbanc_nm?: string;
  intg_pbanc_biz_nm?: string;
  pbanc_ctnt?: string;
  pbanc_ntrp_nm?: string;
  sprv_inst?: string;
  aply_trgt?: string;
  supt_regin?: string;
  biz_enyy?: string;
  biz_trgt_age?: string;
  rcrt_prgs_yn?: string;
  pbanc_rcpt_bgng_dt?: string;
  pbanc_rcpt_end_dt?: string;
  detl_pg_url?: string;
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

  const serviceKey = Deno.env.get("KSTARTUP_SERVICE_KEY");
  if (!serviceKey) {
    return new Response(JSON.stringify({ error: "K-Startup service key not configured" }), {
      status: 503,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const url = new URL(KSTARTUP_ENDPOINT);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("page", "1");
  url.searchParams.set("perPage", "100");
  url.searchParams.set("returnType", "json");

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`K-Startup API responded with status ${response.status}`);
    }
    const data = await response.json();
    const list: KstartupItem[] = Array.isArray(data?.data) ? data.data : [];

    // 문서상 검색 파라미터(사업공고명 등)의 정확한 쿼리 필드명이 확인되지 않아,
    // 임의 파라미터를 만들지 않고 확인된 응답 필드로 직접 필터링한다.
    const lowerKeyword = keyword.toLowerCase();
    const filtered = list.filter((item) => {
      const haystack = [item.biz_pbanc_nm, item.intg_pbanc_biz_nm, item.pbanc_ctnt]
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
    return new Response(JSON.stringify({ error: "Failed to fetch from K-Startup API" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
