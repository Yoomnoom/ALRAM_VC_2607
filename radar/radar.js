// radar/radar.js — 관심 레이더 (news/, script.js와 완전히 독립된 모듈)
// 함수 접두사 규칙(fetchXxx/renderXxx/buildXxx)은 radar/CLAUDE.md 참고.

const RADAR_CONFIG = {
  ANOMALY: {
    AVG_WINDOW_DAYS: 28,
    RISE_THRESHOLD_PCT: 30,
    MIN_CONSECUTIVE_RISES: 2,
    DEDUP_HOURS: 24,
  },
};

const RADAR_KEYWORDS_KEY = "radarKeywords";
const RADAR_TIMEOUT_MS = 8000;

function buildRadarFunctionUrl(configuredUrl, functionName) {
  if (configuredUrl) return configuredUrl;
  const newsUrl = CONFIG.SUPABASE_NEWS_FUNCTION_URL || "";
  return newsUrl.endsWith("/naver-news") ? newsUrl.replace(/\/naver-news$/, `/${functionName}`) : "";
}

const RADAR_FUNCTION_URL = {
  kstartup: buildRadarFunctionUrl(CONFIG.SUPABASE_KSTARTUP_FUNCTION_URL, "kstartup-search"),
  bizinfo: buildRadarFunctionUrl(CONFIG.SUPABASE_BIZINFO_FUNCTION_URL, "bizinfo-search"),
  bizinfoEvent: buildRadarFunctionUrl(CONFIG.SUPABASE_BIZINFOEVENT_FUNCTION_URL, "bizinfo-event-search"),
  blog: buildRadarFunctionUrl(CONFIG.SUPABASE_BLOG_FUNCTION_URL, "blog-search"),
};

const RADAR_PLATFORM_SOURCES = [
  { name: "네이버웹툰 공식 공지", status: "planned" },
  { name: "카카오페이지 공식 공지", status: "planned" },
  { name: "리디 공식 공지", status: "planned" },
  { name: "레진코믹스 공식 공지", status: "planned" },
  { name: "태피툰 공식 공지", status: "planned" },
  { name: "Google Play 정책 공지", status: "planned" },
  { name: "Apple App Store 심사 지침 공지", status: "planned" },
  { name: "Steam 공지", status: "planned" },
];

const RADAR_RECOMMENDED_KEYWORDS = ["웹툰", "게임 에셋", "AI 콘텐츠", "콘텐츠 제작지원", "예비창업자", "로컬라이제이션"];

const RADAR_BADGE_LABEL = {
  search_trend: "검색상승",
  grant: "지원사업",
  contest: "공모전",
  platform_notice: "플랫폼공지",
  news: "관련뉴스",
  content_idea: "콘텐츠 아이디어",
  blog: "블로그동향",
  event: "행사정보",
};

const RADAR_SOURCE_LABEL = {
  kstartup: "K-Startup",
  bizinfo: "기업마당",
  bizinfoEvent: "기업마당 행사정보",
  kocca: "한국콘텐츠진흥원",
  datalab: "검색 관심도(데이터랩)",
  news: "관련뉴스",
  blog: "블로그동향",
  platform: "플랫폼 공지",
};

const RADAR_BLOG_STOPWORDS = new Set([
  "그리고", "그런데", "그래서", "합니다", "있습니다", "했습니다", "됩니다",
  "것을", "것이", "그것", "이것", "저것", "정말", "매우", "너무", "오늘",
  "저는", "이번", "많이", "우리", "블로그", "포스팅", "이벤트", "관련",
  "대한", "위해", "통해", "에서", "으로", "에게", "에는", "에도",
]);

let radarInitialized = false;
let radarLastResults = [];
let radarLastUpdatedAt = null;
let radarLastSourceStatus = {};
let radarLastKeyword = "";
let radarActiveTypeFilter = "all";
let radarLoading = false;

// ---------- 저장 키워드 ----------

function buildRadarKeywords() {
  try {
    const raw = JSON.parse(localStorage.getItem(RADAR_KEYWORDS_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function fetchRadarSaveKeyword(entry) {
  const keywords = buildRadarKeywords();
  const trimmed = (entry.keyword || "").trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  const isDuplicate = keywords.some((k) => k.keyword === trimmed);
  if (isDuplicate) return { ok: false, reason: "duplicate" };

  const now = new Date().toISOString();
  keywords.push({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    keyword: trimmed,
    synonyms: entry.synonyms || [],
    excludeWords: entry.excludeWords || [],
    interests: entry.interests || [],
    targets: entry.targets || ["grant", "news", "platform_notice", "search_trend"],
    alertEnabled: !!entry.alertEnabled,
    alertCriteria: entry.alertCriteria || [],
    createdAt: now,
    lastCheckedAt: null,
  });
  localStorage.setItem(RADAR_KEYWORDS_KEY, JSON.stringify(keywords));
  return { ok: true };
}

function fetchRadarRemoveKeyword(id) {
  const keywords = buildRadarKeywords().filter((k) => k.id !== id);
  localStorage.setItem(RADAR_KEYWORDS_KEY, JSON.stringify(keywords));
}

function fetchRadarTouchKeyword(keywordName) {
  const keywords = buildRadarKeywords();
  const target = keywords.find((k) => k.keyword === keywordName);
  if (!target) return;
  target.lastCheckedAt = new Date().toISOString();
  localStorage.setItem(RADAR_KEYWORDS_KEY, JSON.stringify(keywords));
}

// ---------- 날짜 / D-Day ----------

function buildDateFromYyyymmdd(str) {
  if (typeof str !== "string" || !/^\d{8}$/.test(str)) return null;
  const y = str.slice(0, 4);
  const m = str.slice(4, 6);
  const d = str.slice(6, 8);
  const parsed = new Date(`${y}-${m}-${d}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildDateRangeFromTilde(str) {
  if (typeof str !== "string" || !str.includes("~")) return { start: null, end: null };
  const [startRaw, endRaw] = str.split("~").map((s) => s.trim());
  const start = startRaw ? new Date(`${startRaw}T00:00:00`) : null;
  const end = endRaw ? new Date(`${endRaw}T00:00:00`) : null;
  return {
    start: start && !Number.isNaN(start.getTime()) ? start : null,
    end: end && !Number.isNaN(end.getTime()) ? end : null,
  };
}

function buildFlexibleDate(token) {
  if (typeof token !== "string") return null;
  const trimmed = token.trim();
  if (!trimmed) return null;
  if (/^\d{8}$/.test(trimmed)) return buildDateFromYyyymmdd(trimmed);
  const parsed = new Date(`${trimmed}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildFlexibleDateRange(str) {
  if (typeof str !== "string" || !str.includes("~")) {
    return { start: null, end: buildFlexibleDate(str) };
  }
  const [startRaw, endRaw] = str.split("~");
  return { start: buildFlexibleDate(startRaw), end: buildFlexibleDate(endRaw) };
}

function buildDDayInfo(deadlineDate) {
  if (!(deadlineDate instanceof Date) || Number.isNaN(deadlineDate.getTime())) {
    return { label: null, isClosed: false };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(deadlineDate);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: "마감", isClosed: true };
  if (diffDays === 0) return { label: "D-DAY", isClosed: false };
  return { label: `D-${diffDays}`, isClosed: false };
}

// ---------- 공통 결과 카드 포맷 ----------

function buildResultCard(fields) {
  return {
    id: fields.id,
    type: fields.type,
    badge: RADAR_BADGE_LABEL[fields.type] || fields.type,
    title: fields.title || "",
    summary: fields.summary || "",
    sourceName: fields.sourceName || "",
    registeredAt: fields.registeredAt || null,
    deadlineAt: fields.deadlineAt || null,
    ddayLabel: fields.deadlineAt ? buildDDayInfo(fields.deadlineAt).label : null,
    isClosed: fields.deadlineAt ? buildDDayInfo(fields.deadlineAt).isClosed : false,
    interestChangeRate: typeof fields.interestChangeRate === "number" ? fields.interestChangeRate : null,
    matchedKeywords: fields.matchedKeywords || [],
    url: fields.url || null,
    isSimilar: !!fields.isSimilar,
    detailLines: fields.detailLines || [],
    links: fields.links || [],
    blogStats: fields.blogStats || null,
  };
}

function buildKstartupCard(item, keyword) {
  const endDate = buildDateFromYyyymmdd(item.pbanc_rcpt_end_dt);
  return buildResultCard({
    id: `kstartup_${item.pbanc_sn}`,
    type: "grant",
    title: item.biz_pbanc_nm || item.intg_pbanc_biz_nm || "(제목 없음)",
    summary: stripRadarHtml(item.pbanc_ctnt || item.aply_trgt_ctnt || ""),
    sourceName: `K-Startup · ${item.sprv_inst || item.pbanc_ntrp_nm || ""}`.trim(),
    registeredAt: buildDateFromYyyymmdd(item.pbanc_rcpt_bgng_dt),
    deadlineAt: endDate,
    matchedKeywords: [keyword],
    url: item.detl_pg_url || null,
  });
}

function buildBizinfoCard(item, keyword) {
  const range = buildDateRangeFromTilde(item.reqstBeginEndDe);
  return buildResultCard({
    id: `bizinfo_${item.pblancId}`,
    type: "grant",
    title: item.pblancNm || "(제목 없음)",
    summary: stripRadarHtml(item.bsnsSumryCn || ""),
    sourceName: `기업마당 · ${item.excInsttNm || item.jrsdInsttNm || ""}`.trim(),
    registeredAt: range.start,
    deadlineAt: range.end,
    matchedKeywords: [keyword],
    url: item.pblancUrl || null,
  });
}

function buildBizinfoEventCard(item, keyword) {
  const rceptRange = buildFlexibleDateRange(item.rceptPd);
  const eventRange = buildFlexibleDateRange(item.eventBeginEndDe);
  const deadlineAt = rceptRange.end || eventRange.end;

  return buildResultCard({
    id: `bizinfo_event_${item.eventInfoId}`,
    type: "event",
    title: item.nttNm || "(제목 없음)",
    summary: stripRadarHtml(item.nttCn || ""),
    sourceName: `기업마당 행사 · ${item.originEngnNm || ""}`.trim(),
    registeredAt: buildDateFromYyyymmdd(item.registDe),
    deadlineAt,
    matchedKeywords: [keyword],
    url: item.orginlUrlAdres || (item.bizinfoUrl ? `https://www.bizinfo.go.kr${item.bizinfoUrl}` : null),
    detailLines: [
      [item.eventInfoTyNm, item.areaNm].filter(Boolean).join(" · "),
      item.eventBeginEndDe ? `행사 일정: ${item.eventBeginEndDe}` : null,
    ].filter(Boolean),
  });
}

function stripRadarHtml(str) {
  if (typeof str !== "string") return "";
  return str.replace(/<\/?[^>]+(>|$)/g, "").trim();
}

// ---------- 블로그 통계 ----------

function buildBlogKeywordFrequency(items, excludeKeyword) {
  const counts = new Map();
  const excludeLower = (excludeKeyword || "").toLowerCase();
  items.forEach((item) => {
    const text = `${stripRadarHtml(item.title)} ${stripRadarHtml(item.description)}`;
    const words = text.match(/[가-힣a-zA-Z0-9]{2,}/g) || [];
    words.forEach((word) => {
      const lower = word.toLowerCase();
      if (lower === excludeLower || RADAR_BLOG_STOPWORDS.has(word)) return;
      counts.set(word, (counts.get(word) || 0) + 1);
    });
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word, count]) => `${word}(${count})`);
}

function buildBlogPostTrend(items) {
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  let recent7 = 0;
  let prior7 = 0;
  let parsedCount = 0;

  items.forEach((item) => {
    const postDate = buildDateFromYyyymmdd(item.postdate);
    if (!postDate) return;
    parsedCount++;
    const diffDays = Math.floor((now - postDate) / dayMs);
    if (diffDays >= 0 && diffDays < 7) recent7++;
    else if (diffDays >= 7 && diffDays < 14) prior7++;
  });

  return {
    recent7,
    changePct: parsedCount >= 5 && prior7 > 0 ? Math.round(((recent7 - prior7) / prior7) * 100) : null,
  };
}

function buildBlogStatCard(keyword, items) {
  const topKeywords = buildBlogKeywordFrequency(items, keyword);
  const trend = buildBlogPostTrend(items);
  const sortedByDate = items
    .filter((item) => buildDateFromYyyymmdd(item.postdate))
    .sort((a, b) => buildDateFromYyyymmdd(b.postdate) - buildDateFromYyyymmdd(a.postdate));
  const topLinks = (sortedByDate.length ? sortedByDate : items)
    .filter((item) => item.link)
    .map((item) => ({ label: stripRadarHtml(item.title), url: item.link }));

  return buildResultCard({
    id: `blog_${keyword}`,
    type: "blog",
    title: `${keyword} 블로그 동향`,
    sourceName: "네이버 블로그 검색",
    registeredAt: new Date(),
    matchedKeywords: [keyword],
    links: topLinks,
    blogStats: { total: items.length, recent7: trend.recent7, changePct: trend.changePct, topKeywords },
  });
}

// ---------- 소스별 조회 ----------

async function fetchRadarWithTimeout(url, body) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RADAR_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`radar function responded with ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchKstartupResults(keyword) {
  if (!RADAR_FUNCTION_URL.kstartup) return { status: "key_required", cards: [] };
  try {
    const data = await fetchRadarWithTimeout(RADAR_FUNCTION_URL.kstartup, { keyword });
    const items = Array.isArray(data.items) ? data.items : [];
    return { status: "ok", cards: items.map((item) => buildKstartupCard(item, keyword)) };
  } catch (err) {
    console.error("K-Startup 조회 실패:", err);
    return { status: "error", cards: [] };
  }
}

async function fetchBizinfoResults(keyword) {
  if (!RADAR_FUNCTION_URL.bizinfo) return { status: "key_required", cards: [] };
  try {
    const data = await fetchRadarWithTimeout(RADAR_FUNCTION_URL.bizinfo, { keyword });
    const items = Array.isArray(data.items) ? data.items : [];
    return { status: "ok", cards: items.map((item) => buildBizinfoCard(item, keyword)) };
  } catch (err) {
    console.error("기업마당 조회 실패:", err);
    return { status: "error", cards: [] };
  }
}

async function fetchBizinfoEventResults(keyword) {
  if (!RADAR_FUNCTION_URL.bizinfoEvent) return { status: "key_required", cards: [] };
  try {
    const data = await fetchRadarWithTimeout(RADAR_FUNCTION_URL.bizinfoEvent, { keyword });
    const items = Array.isArray(data.items) ? data.items : [];
    return { status: "ok", cards: items.map((item) => buildBizinfoEventCard(item, keyword)) };
  } catch (err) {
    console.error("기업마당 행사정보 조회 실패:", err);
    return { status: "error", cards: [] };
  }
}

async function fetchKoccaResults(keyword) {
  // 공식 데이터포털 API 활용신청은 아직 승인되지 않음 — 키가 등록되면 kstartup-search와
  // 동일한 패턴(Supabase Edge Function 경유)으로 연동한다. 지금은 가짜 데이터를 만들지 않는다.
  if (!CONFIG.SUPABASE_KOCCA_FUNCTION_URL) return { status: "key_required", cards: [] };
  try {
    const data = await fetchRadarWithTimeout(CONFIG.SUPABASE_KOCCA_FUNCTION_URL, { keyword });
    const items = Array.isArray(data.items) ? data.items : [];
    return { status: "ok", cards: items };
  } catch (err) {
    console.error("KOCCA 조회 실패:", err);
    return { status: "error", cards: [] };
  }
}

async function fetchDatalabTrend(keyword) {
  // 네이버 데이터랩(검색어트렌드) 앱에 데이터랩 사용 권한이 아직 등록되지 않음.
  // 등록되면 별도 Edge Function을 통해 최근 7일/30일 추이, 전주 대비 변화를 조회한다.
  if (!CONFIG.SUPABASE_DATALAB_FUNCTION_URL) return { status: "key_required", trend: null };
  try {
    const data = await fetchRadarWithTimeout(CONFIG.SUPABASE_DATALAB_FUNCTION_URL, { keyword });
    return { status: "ok", trend: data };
  } catch (err) {
    console.error("데이터랩 조회 실패:", err);
    return { status: "error", trend: null };
  }
}

async function fetchRadarNewsResults(keyword) {
  // news/news.js의 기존 함수를 입력·반환값 변경 없이 안전하게 호출만 한다.
  // 뉴스 탭의 저장 키워드/캐시와는 절대 섞지 않는다.
  if (typeof fetchRecentNews !== "function") return { status: "error", cards: [] };
  try {
    const data = await fetchRecentNews(keyword, 5);
    const items = Array.isArray(data?.items) ? data.items : [];
    return {
      status: "ok",
      cards: items.map((item, idx) =>
        buildResultCard({
          id: `news_${keyword}_${idx}_${item.link}`,
          type: "news",
          title: stripRadarHtml(item.title),
          summary: stripRadarHtml(item.description),
          sourceName: "관련뉴스",
          registeredAt: item.pubDate ? new Date(item.pubDate) : null,
          matchedKeywords: [keyword],
          url: item.link,
        })
      ),
    };
  } catch (err) {
    console.error("관심 레이더 뉴스 조회 실패:", err);
    return { status: "error", cards: [] };
  }
}

async function fetchRadarBlogResults(keyword) {
  if (!RADAR_FUNCTION_URL.blog) return { status: "key_required", items: [] };
  try {
    const data = await fetchRadarWithTimeout(RADAR_FUNCTION_URL.blog, { keyword });
    const items = Array.isArray(data.items) ? data.items : [];
    return { status: "ok", items };
  } catch (err) {
    console.error("블로그 조회 실패:", err);
    return { status: "error", items: [] };
  }
}

function fetchRadarPlatformNotices() {
  return { status: "planned", sources: RADAR_PLATFORM_SOURCES };
}

function buildRadarContentIdeas(keyword, evidenceCards, blogItems) {
  const evidenceCount = evidenceCards.length + blogItems.length;
  if (evidenceCount < 2) return [];

  const related = buildBlogKeywordFrequency(blogItems, keyword)
    .map((item) => item.replace(/\(\d+\)$/, ""))
    .filter(Boolean);
  const focus = related[0] || "최신 흐름";
  const secondFocus = related[1] || "지원 기회";
  const references = evidenceCards.filter((card) => card.url).slice(0, 3);
  const ideas = [
    `${keyword} 시작 전 확인할 체크리스트`,
    `${keyword}와 ${focus}, 최근 흐름 한눈에 정리하기`,
    `${secondFocus}로 보는 ${keyword} 활용 아이디어`,
  ];

  return ideas.map((title, index) => buildResultCard({
    id: `idea_${keyword}_${index}`,
    type: "content_idea",
    title,
    summary: `관련 자료 ${evidenceCount}건과 자주 등장한 키워드를 바탕으로 추천했어요.`,
    sourceName: "뉴스·블로그 분석",
    registeredAt: new Date(),
    matchedKeywords: [keyword],
    links: references[index] ? [{ label: references[index].title, url: references[index].url }] : [],
  }));
}

// ---------- 중복 판정 ----------

function buildNormalizedTitle(title) {
  return (title || "").replace(/\[[^\]]*\]/g, "").replace(/\s+/g, "").toLowerCase();
}

function buildGrantDedupe(cards) {
  const grantCards = cards.filter((c) => c.type === "grant");
  for (let i = 0; i < grantCards.length; i++) {
    for (let j = i + 1; j < grantCards.length; j++) {
      const a = grantCards[i];
      const b = grantCards[j];
      const na = buildNormalizedTitle(a.title);
      const nb = buildNormalizedTitle(b.title);
      if (!na || !nb) continue;
      const sameTitle = na === nb || (na.length > 6 && nb.includes(na)) || (nb.length > 6 && na.includes(nb));
      if (sameTitle) {
        b.isSimilar = true;
      }
    }
  }
  return cards;
}

// ---------- 검색 오케스트레이션 ----------

async function fetchRadarSearch(keyword) {
  radarLoading = true;
  radarLastKeyword = keyword;
  renderRadarResults();
  document.getElementById("radarSearchBtn").disabled = true;
  const [kstartup, bizinfo, bizinfoEvent, kocca, datalab, news, blog] = await Promise.all([
    fetchKstartupResults(keyword),
    fetchBizinfoResults(keyword),
    fetchBizinfoEventResults(keyword),
    fetchKoccaResults(keyword),
    fetchDatalabTrend(keyword),
    fetchRadarNewsResults(keyword),
    fetchRadarBlogResults(keyword),
  ]);
  const platform = fetchRadarPlatformNotices();

  let cards = [...kstartup.cards, ...bizinfo.cards, ...kocca.cards, ...news.cards, ...bizinfoEvent.cards];
  cards = buildGrantDedupe(cards);

  if (blog.status === "ok" && blog.items.length > 0) {
    cards.push(buildBlogStatCard(keyword, blog.items));
  }

  const ideaEvidence = [...kstartup.cards, ...bizinfo.cards, ...news.cards];
  cards.push(...buildRadarContentIdeas(keyword, ideaEvidence, blog.items));

  radarLastResults = cards;
  radarLoading = false;
  radarLastUpdatedAt = new Date();
  radarLastKeyword = keyword;
  radarLastSourceStatus = {
    kstartup: kstartup.status,
    bizinfo: bizinfo.status,
    bizinfoEvent: bizinfoEvent.status,
    kocca: kocca.status,
    datalab: datalab.status,
    news: news.status,
    blog: blog.status,
    platform: platform.status,
  };

  fetchRadarTouchKeyword(keyword);
  renderRadarSourceStatus(radarLastSourceStatus);
  renderRadarUpdatedAt();
  renderRadarKeywordTabs();
  renderRadarResults();
  document.getElementById("radarSearchBtn").disabled = false;
}

// ---------- 렌더링 ----------

function renderRadarUpdatedAt() {
  const el = document.getElementById("radarUpdatedAt");
  if (!el) return;
  if (!radarLastUpdatedAt) {
    el.textContent = "";
    return;
  }
  const hh = String(radarLastUpdatedAt.getHours()).padStart(2, "0");
  const mm = String(radarLastUpdatedAt.getMinutes()).padStart(2, "0");
  el.textContent = `마지막 업데이트 ${hh}:${mm}`;
}

const RADAR_STATUS_LABEL = {
  ok: "연동 완료",
  error: "일시 오류",
  key_required: "API 키 필요",
  planned: "개발 예정",
};

function renderRadarSourceStatus(statusMap) {
  const el = document.getElementById("radarSourceStatus");
  if (!el) return;
  el.innerHTML = "";
  const unavailable = Object.entries(statusMap).filter(([, status]) => status !== "ok");
  if (!unavailable.length) return;
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  const errorCount = unavailable.filter(([, status]) => status === "error").length;
  summary.textContent = errorCount
    ? `일부 출처를 불러오지 못했습니다 (${errorCount})`
    : `준비 중인 정보 출처가 있습니다`;
  details.appendChild(summary);
  const sources = document.createElement("div");
  sources.className = "radar-source-detail";
  unavailable.forEach(([source, status]) => {
    const chip = document.createElement("span");
    chip.className = `radar-status-chip radar-status-${status}`;
    chip.textContent = `${RADAR_SOURCE_LABEL[source] || source} ${RADAR_STATUS_LABEL[status] || status}`;
    sources.appendChild(chip);

    if (status === "error") {
      const retryBtn = document.createElement("button");
      retryBtn.type = "button";
      retryBtn.className = "radar-retry-btn";
      retryBtn.textContent = "재시도";
      retryBtn.addEventListener("click", () => {
        if (radarLastKeyword) fetchRadarSearch(radarLastKeyword);
      });
      sources.appendChild(retryBtn);
    }
  });
  details.appendChild(sources);
  el.appendChild(details);
}

function buildRadarIsUrgent(card) {
  if (card.isClosed) return false;
  if (typeof card.interestChangeRate === "number" && card.interestChangeRate >= 30) return true;
  if (!card.deadlineAt) return false;
  const days = Math.ceil((card.deadlineAt - new Date()) / 86400000);
  return days >= 0 && days <= 7;
}

function buildRadarCardEl(card) {
  const el = document.createElement("div");
  el.className = "radar-card";
  if (card.type === "blog") el.classList.add("radar-card-blog");

  const badgeRow = document.createElement("div");
  badgeRow.className = "radar-card-badge-row";

  const badge = document.createElement("span");
  badge.className = `radar-badge radar-badge-${card.type}`;
  badge.textContent = card.badge;
  badgeRow.appendChild(badge);

  if (card.isSimilar) {
    const similarBadge = document.createElement("span");
    similarBadge.className = "radar-badge radar-badge-similar";
    similarBadge.textContent = "유사 공고";
    badgeRow.appendChild(similarBadge);
  }

  if (card.ddayLabel) {
    const dday = document.createElement("span");
    dday.className = `radar-dday ${card.isClosed ? "radar-dday-closed" : ""}`;
    dday.textContent = card.ddayLabel;
    badgeRow.appendChild(dday);
  }

  el.appendChild(badgeRow);

  const title = document.createElement("p");
  title.className = "radar-card-title";
  title.textContent = card.title;
  el.appendChild(title);

  if (card.type === "blog" && card.blogStats) {
    const stats = document.createElement("div");
    stats.className = "radar-blog-stats";
    const change = card.blogStats.changePct;
    const changeLabel = change === null ? "비교 중" : `${change > 0 ? "+" : ""}${change}%`;
    [
      [card.blogStats.total, "수집 글"],
      [card.blogStats.recent7, "최근 7일"],
      [changeLabel, "이전 7일 대비"],
    ].forEach(([value, label]) => {
      const item = document.createElement("div");
      const strong = document.createElement("strong");
      const span = document.createElement("span");
      strong.textContent = value;
      span.textContent = label;
      item.append(strong, span);
      stats.appendChild(item);
    });
    el.appendChild(stats);

    const keywordBlock = document.createElement("div");
    keywordBlock.className = "radar-blog-keywords";
    const keywordLabel = document.createElement("span");
    keywordLabel.textContent = "자주 등장한 키워드";
    keywordBlock.appendChild(keywordLabel);
    const tags = document.createElement("div");
    (card.blogStats.topKeywords.length ? card.blogStats.topKeywords : ["수집 중"]).forEach((keyword) => {
      const tag = document.createElement("span");
      tag.textContent = keyword;
      tags.appendChild(tag);
    });
    keywordBlock.appendChild(tags);
    el.appendChild(keywordBlock);

    const source = document.createElement("p");
    source.className = "radar-blog-source";
    source.textContent = card.sourceName;
    el.appendChild(source);

    if (card.links.length) {
      const references = document.createElement("div");
      references.className = "radar-blog-references";
      const heading = document.createElement("p");
      const initialVisibleCount = Math.min(10, card.links.length);
      heading.textContent = `최근 참고 글 ${initialVisibleCount}/${card.links.length}개`;
      references.appendChild(heading);
      card.links.forEach((linkInfo, index) => {
        if (!linkInfo.url) return;
        const link = document.createElement("a");
        link.href = linkInfo.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = linkInfo.label || "참고 글";
        link.hidden = index >= 10;
        references.appendChild(link);
      });
      if (card.links.length > 10) {
        const moreButton = document.createElement("button");
        moreButton.type = "button";
        moreButton.className = "radar-blog-more-btn";
        moreButton.textContent = `더 보기 (${card.links.length - 10})`;
        moreButton.addEventListener("click", () => {
          const hiddenLinks = [...references.querySelectorAll("a[hidden]")];
          hiddenLinks.slice(0, 10).forEach((link) => { link.hidden = false; });
          const remaining = references.querySelectorAll("a[hidden]").length;
          heading.textContent = `최근 참고 글 ${card.links.length - remaining}/${card.links.length}개`;
          if (remaining) moreButton.textContent = `더 보기 (${remaining})`;
          else moreButton.remove();
        });
        references.appendChild(moreButton);
      }
      el.appendChild(references);
    }
    return el;
  }

  if (card.summary) {
    const summary = document.createElement("p");
    summary.className = "radar-card-summary";
    summary.textContent = card.summary.length > 120 ? `${card.summary.slice(0, 120)}…` : card.summary;
    el.appendChild(summary);
  }

  const metaRow = document.createElement("div");
  metaRow.className = "radar-card-meta";
  if (card.sourceName) {
    const source = document.createElement("span");
    source.textContent = card.sourceName;
    metaRow.appendChild(source);
  }
  if (card.deadlineAt) {
    const deadline = document.createElement("span");
    deadline.textContent = `마감 ${card.deadlineAt.getFullYear()}.${String(card.deadlineAt.getMonth() + 1).padStart(2, "0")}.${String(card.deadlineAt.getDate()).padStart(2, "0")}`;
    metaRow.appendChild(deadline);
  }
  el.appendChild(metaRow);

  if (card.detailLines.length > 0) {
    const detailBox = document.createElement("div");
    detailBox.className = "radar-card-detail";
    card.detailLines.forEach((line) => {
      const p = document.createElement("p");
      p.textContent = line;
      detailBox.appendChild(p);
    });
    el.appendChild(detailBox);
  }

  const actionRow = document.createElement("div");
  actionRow.className = "radar-card-actions";
  if (card.url) {
    const link = document.createElement("a");
    link.href = card.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "radar-card-link";
    link.textContent = "원문 보기";
    actionRow.appendChild(link);
  }
  card.links.forEach((linkInfo) => {
    if (!linkInfo.url) return;
    const link = document.createElement("a");
    link.href = linkInfo.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "radar-card-link radar-card-link-multi";
    link.textContent = linkInfo.label ? `참고: ${linkInfo.label}` : "참고 링크";
    actionRow.appendChild(link);
  });
  el.appendChild(actionRow);

  return el;
}

function buildRadarEmptyStateEl(kind) {
  const wrap = document.createElement("div");
  wrap.className = "radar-empty-state";

  if (kind === "loading") {
    wrap.classList.add("radar-loading-state");
    wrap.innerHTML = `<span class="radar-loading-dot"></span><p>여러 출처에서 관련 정보를 모으고 있어요.</p>`;
  } else if (kind === "before_search") {
    const msg = document.createElement("p");
    msg.textContent = "관심 있는 분야를 검색하거나 키워드를 저장해보세요.";
    wrap.appendChild(msg);

    const chipRow = document.createElement("div");
    chipRow.className = "radar-recommend-row";
    RADAR_RECOMMENDED_KEYWORDS.forEach((kw) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "radar-recommend-chip";
      chip.textContent = kw;
      chip.addEventListener("click", () => {
        document.getElementById("radarSearchInput").value = kw;
        fetchRadarSearch(kw);
      });
      chipRow.appendChild(chip);
    });
    wrap.appendChild(chipRow);
  } else {
    const msg = document.createElement("p");
    msg.textContent = "조건에 맞는 결과를 찾지 못했습니다. 검색어 또는 필터를 변경해보세요.";
    wrap.appendChild(msg);
  }
  return wrap;
}

function buildRadarFilteredCards() {
  let cards = radarLastResults.slice();
  if (radarActiveTypeFilter === "urgent") cards = cards.filter(buildRadarIsUrgent);
  if (radarActiveTypeFilter === "opportunity") cards = cards.filter((c) => c.type === "grant" || c.type === "event");
  if (radarActiveTypeFilter === "trend") cards = cards.filter((c) => c.type === "news");
  if (radarActiveTypeFilter === "market") cards = cards.filter((c) => ["blog", "search_trend"].includes(c.type));
  if (radarActiveTypeFilter === "idea") cards = cards.filter((c) => c.type === "content_idea");
  return cards;
}

function renderRadarSummary(cards) {
  const el = document.getElementById("radarSummary");
  if (!el) return;
  el.hidden = !radarLastKeyword || radarLoading;
  if (el.hidden) return;
  const openCards = cards.filter((card) => !card.isClosed && card.type !== "content_idea");
  const urgent = openCards.filter(buildRadarIsUrgent).length;
  const opportunities = openCards.filter((card) => card.type === "grant" || card.type === "event").length;
  el.innerHTML = `
    <div><strong>${openCards.length}</strong><span>새로운 소식</span></div>
    <div class="${urgent ? "radar-summary-alert" : ""}"><strong>${urgent}</strong><span>마감 임박</span></div>
    <div><strong>${opportunities}</strong><span>지원·행사</span></div>`;
}

function buildRadarSection(title, description, cards, className = "") {
  if (!cards.length) return null;
  const section = document.createElement("section");
  section.className = `radar-section ${className}`.trim();
  const heading = document.createElement("div");
  heading.className = "radar-section-heading";
  const copy = document.createElement("div");
  const headingTitle = document.createElement("h2");
  headingTitle.textContent = title;
  const headingDescription = document.createElement("p");
  headingDescription.textContent = description;
  const count = document.createElement("span");
  count.textContent = cards.length;
  copy.append(headingTitle, headingDescription);
  heading.append(copy, count);
  section.appendChild(heading);
  const grid = document.createElement("div");
  grid.className = "radar-section-grid";
  cards.forEach((card) => grid.appendChild(buildRadarCardEl(card)));
  section.appendChild(grid);
  return section;
}

function renderRadarResults() {
  const list = document.getElementById("radarResultList");
  if (!list) return;
  list.innerHTML = "";
  renderRadarSummary(radarLastResults);

  if (radarLoading) {
    const loading = buildRadarEmptyStateEl("loading");
    list.appendChild(loading);
    return;
  }

  if (!radarLastKeyword) {
    list.appendChild(buildRadarEmptyStateEl("before_search"));
    return;
  }

  const cards = buildRadarFilteredCards();
  if (cards.length === 0) {
    list.appendChild(buildRadarEmptyStateEl("no_results"));
    return;
  }

  if (radarActiveTypeFilter !== "all") {
    const filterTitles = {
      urgent: "놓치면 안 되는 정보",
      opportunity: "지원·행사",
      trend: "뉴스·동향",
      market: "시장 반응",
      idea: "콘텐츠 아이디어",
    };
    const filtered = buildRadarSection(filterTitles[radarActiveTypeFilter] || "검색 결과", `‘${radarLastKeyword}’에서 고른 정보예요.`, cards);
    if (filtered) list.appendChild(filtered);
    return;
  }

  const urgent = cards.filter(buildRadarIsUrgent);
  const market = cards.filter((card) => card.type === "blog" || card.type === "search_trend");
  const ideas = cards.filter((card) => card.type === "content_idea");
  const updates = cards.filter((card) => !urgent.includes(card) && !market.includes(card) && !ideas.includes(card) && !card.isClosed);
  const sections = [
    buildRadarSection("지금 확인하세요", "마감이 가깝거나 변화가 큰 정보예요.", urgent, "radar-section-priority"),
    buildRadarSection("새로 들어온 소식", `‘${radarLastKeyword}’ 관련 최신 정보예요.`, updates),
    buildRadarSection("시장 반응", "검색과 콘텐츠에서 발견한 흐름이에요.", market),
    buildRadarSection("콘텐츠 아이디어", "수집한 자료에서 발견한 주제를 활용해보세요.", ideas),
  ].filter(Boolean);
  sections.forEach((section) => list.appendChild(section));
}

function renderRadarKeywordTabs() {
  const el = document.getElementById("radarKeywordTabs");
  if (!el) return;
  el.innerHTML = "";
  buildRadarKeywords().forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `radar-keyword-tab ${item.keyword === radarLastKeyword ? "active" : ""}`;
    button.textContent = item.keyword;
    button.addEventListener("click", () => {
      document.getElementById("radarSearchInput").value = item.keyword;
      fetchRadarSearch(item.keyword);
    });
    el.appendChild(button);
  });
}

// ---------- 저장 키워드 관리 패널 ----------

function buildRadarKeywordManagerEl() {
  const overlay = document.createElement("div");
  overlay.className = "radar-keyword-overlay";
  overlay.id = "radarKeywordOverlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "관심사 관리");

  const box = document.createElement("div");
  box.className = "radar-keyword-box";

  const title = document.createElement("p");
  title.className = "radar-keyword-box-title";
  title.textContent = "관심사 관리";
  box.appendChild(title);

  const description = document.createElement("p");
  description.className = "radar-keyword-description";
  description.textContent = "관심사를 저장하면 관련 지원사업과 뉴스를 빠르게 확인할 수 있어요.";
  box.appendChild(description);

  const list = document.createElement("div");
  list.className = "radar-keyword-list";
  list.id = "radarKeywordList";
  box.appendChild(list);

  const form = document.createElement("div");
  form.className = "radar-keyword-form";
  form.innerHTML = `
    <p class="radar-keyword-form-title">어떤 정보를 찾고 있나요?</p>
    <div class="radar-keyword-suggestions" aria-label="추천 관심사">
      <button type="button" data-keyword="예비창업자">예비창업자</button>
      <button type="button" data-keyword="청년 창업">청년 창업</button>
      <button type="button" data-keyword="콘텐츠 지원사업">콘텐츠 지원사업</button>
      <button type="button" data-keyword="서울 창업 지원">서울 창업 지원</button>
    </div>
    <input type="text" id="radarNewKeywordInput" class="radar-keyword-input" aria-label="관심사" placeholder="관심사를 입력하세요" maxlength="30" />
    <p class="radar-keyword-tip">대상과 분야를 조합하면 더 정확해요. 예: 예비창업자 콘텐츠</p>
    <input type="text" id="radarNewSynonymsInput" class="radar-keyword-input" aria-label="유사어" placeholder="유사어 (쉼표로 구분, 선택)" maxlength="100" />
    <input type="text" id="radarNewExcludeInput" class="radar-keyword-input" aria-label="제외어" placeholder="제외어 (쉼표로 구분, 선택)" maxlength="100" />
    <label class="radar-toggle-label"><input type="checkbox" id="radarNewAlertCheckbox" /> 이상 상승 시 알림</label>
    <button type="button" class="radar-keyword-add-btn" id="radarKeywordAddBtn">키워드 저장</button>
  `;
  box.appendChild(form);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "radar-keyword-close-btn";
  closeBtn.textContent = "닫기";
  closeBtn.addEventListener("click", () => overlay.remove());
  box.appendChild(closeBtn);

  overlay.appendChild(box);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") overlay.remove();
  });

  return overlay;
}

function renderRadarKeywordList() {
  const list = document.getElementById("radarKeywordList");
  if (!list) return;
  list.innerHTML = "";
  const keywords = buildRadarKeywords();
  if (keywords.length === 0) {
    const empty = document.createElement("p");
    empty.className = "radar-keyword-empty";
    empty.textContent = "저장된 키워드가 없습니다.";
    list.appendChild(empty);
    return;
  }
  keywords.forEach((k) => {
    const row = document.createElement("div");
    row.className = "radar-keyword-row";

    const label = document.createElement("span");
    label.textContent = k.keyword + (k.alertEnabled ? " 🔔" : "");
    row.appendChild(label);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "radar-keyword-remove-btn";
    removeBtn.textContent = "삭제";
    removeBtn.addEventListener("click", () => {
      fetchRadarRemoveKeyword(k.id);
      renderRadarKeywordList();
      renderRadarKeywordTabs();
    });
    row.appendChild(removeBtn);

    list.appendChild(row);
  });
}

function renderRadarKeywordManagerOpen() {
  const existing = document.getElementById("radarKeywordOverlay");
  if (existing) existing.remove();

  const overlay = buildRadarKeywordManagerEl();
  document.body.appendChild(overlay);
  renderRadarKeywordList();

  document.querySelectorAll(".radar-keyword-suggestions button").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById("radarNewKeywordInput");
      input.value = button.dataset.keyword;
      input.focus();
    });
  });

  document.getElementById("radarKeywordAddBtn").addEventListener("click", () => {
    const keyword = document.getElementById("radarNewKeywordInput").value.trim();
    const synonyms = document
      .getElementById("radarNewSynonymsInput")
      .value.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const excludeWords = document
      .getElementById("radarNewExcludeInput")
      .value.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const alertEnabled = document.getElementById("radarNewAlertCheckbox").checked;

    if (!keyword) {
      if (typeof showAppAlert === "function") showAppAlert("키워드를 입력해주세요.");
      return;
    }
    const result = fetchRadarSaveKeyword({ keyword, synonyms, excludeWords, alertEnabled });
    if (!result.ok && result.reason === "duplicate") {
      if (typeof showAppAlert === "function") showAppAlert("이미 저장된 키워드입니다.");
      return;
    }
    document.getElementById("radarNewKeywordInput").value = "";
    document.getElementById("radarNewSynonymsInput").value = "";
    document.getElementById("radarNewExcludeInput").value = "";
    document.getElementById("radarNewAlertCheckbox").checked = false;
    renderRadarKeywordList();
    renderRadarKeywordTabs();
    if (typeof showAppAlert === "function") showAppAlert(`‘${keyword}’을 관심사로 저장했어요.`);
  });
}

// ---------- 탭 진입 / 이벤트 초기화 ----------

function fetchRadarIfNeeded() {
  if (radarInitialized) return;
  radarInitialized = true;

  renderRadarKeywordTabs();
  renderRadarResults();

  document.getElementById("radarSearchBtn").addEventListener("click", () => {
    const keyword = document.getElementById("radarSearchInput").value.trim();
    if (!keyword) return;
    fetchRadarSearch(keyword);
  });

  document.getElementById("radarSearchInput").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const keyword = e.target.value.trim();
    if (!keyword) return;
    fetchRadarSearch(keyword);
  });

  document.getElementById("radarRefreshBtn").addEventListener("click", () => {
    if (!radarLastKeyword) return;
    const icon = document.getElementById("radarRefreshIcon");
    icon.classList.add("spinning");
    fetchRadarSearch(radarLastKeyword).finally(() => icon.classList.remove("spinning"));
  });

  document.getElementById("radarKeywordManageBtn").addEventListener("click", () => {
    renderRadarKeywordManagerOpen();
  });

  document.querySelectorAll("#radarTypeFilter .radar-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#radarTypeFilter .radar-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      radarActiveTypeFilter = chip.dataset.radarType;
      renderRadarResults();
    });
  });

  const firstKeyword = buildRadarKeywords()[0]?.keyword;
  if (firstKeyword) {
    document.getElementById("radarSearchInput").value = firstKeyword;
    fetchRadarSearch(firstKeyword);
  }
}
