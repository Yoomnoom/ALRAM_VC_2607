const NEWS_TIMEOUT_MS = 5000;
const NEWS_KEYWORDS_KEY = "newsKeywords";
const DEFAULT_NEWS_KEYWORDS = ["스타트업", "웹툰"];
const NEWS_MORE_STEP = 5;
const newsDisplayCounts = {};

function buildNewsKeywords() {
  try {
    const stored = JSON.parse(localStorage.getItem(NEWS_KEYWORDS_KEY));
    return Array.isArray(stored) ? stored : DEFAULT_NEWS_KEYWORDS;
  } catch {
    return DEFAULT_NEWS_KEYWORDS;
  }
}

async function fetchRecentNews(keyword, count = 5) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NEWS_TIMEOUT_MS);

  try {
    const response = await fetch(CONFIG.SUPABASE_NEWS_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ keyword, count }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`naver-news function responded with ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

function stripHtmlTags(str) {
  if (typeof str !== "string") return str;
  return str.replace(/<\/?[^>]+(>|$)/g, "");
}

function buildDateLabel(pubDate) {
  const d = new Date(pubDate);
  if (Number.isNaN(d.getTime())) return pubDate;
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildHighlightedText(text, keyword) {
  const fragment = document.createDocumentFragment();
  if (!keyword) {
    fragment.appendChild(document.createTextNode(text));
    return fragment;
  }

  const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escapedKeyword})`, "gi"));

  parts.forEach((part, i) => {
    if (!part) return;
    if (i % 2 === 1) {
      const mark = document.createElement("mark");
      mark.className = "news-keyword-highlight";
      mark.textContent = part;
      fragment.appendChild(mark);
    } else {
      fragment.appendChild(document.createTextNode(part));
    }
  });

  return fragment;
}

function buildNewsCardEl(item, isNew, category) {
  const highlightKeyword = category && category.startsWith("search:") ? category.slice(7) : category;
  const cell = document.createElement("div");
  cell.className = "news-card";

  const header = document.createElement("div");
  header.className = "news-card-header";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "news-select";
  checkbox.checked = selectedNewsLinks.has(item.link);
  checkbox.addEventListener("click", (e) => e.stopPropagation());
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) selectedNewsLinks.add(item.link);
    else selectedNewsLinks.delete(item.link);
    updateSectionSelectAllState(category);
    updateGlobalSelectAllState(newsCache);
  });

  const title = document.createElement("p");
  title.className = "news-title";
  title.appendChild(buildHighlightedText(stripHtmlTags(item.title), highlightKeyword));

  if (isNew) {
    const badge = document.createElement("span");
    badge.className = "news-badge-new";
    badge.textContent = "NEW";
    title.prepend(badge);
  }

  header.appendChild(checkbox);
  header.appendChild(title);

  const desc = document.createElement("p");
  desc.className = "news-desc";
  desc.appendChild(buildHighlightedText(stripHtmlTags(item.description), highlightKeyword));

  const meta = document.createElement("div");
  meta.className = "news-meta";

  const date = document.createElement("span");
  date.className = "news-date";
  date.textContent = buildDateLabel(item.pubDate);

  const link = document.createElement("a");
  link.className = "news-link";
  link.href = item.link;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "원문보기";
  link.addEventListener("click", (e) => e.stopPropagation());

  meta.appendChild(date);
  meta.appendChild(link);

  cell.appendChild(header);
  cell.appendChild(desc);
  cell.appendChild(meta);

  cell.classList.add("news-card-clickable");
  cell.addEventListener("click", () => {
    window.open(item.link, "_blank", "noopener,noreferrer");
  });

  return cell;
}

function renderNewsStatus(message, { showRetry = false, onRetry } = {}) {
  const tableEl = document.getElementById("newsTable");
  if (!tableEl) return;

  tableEl.querySelectorAll(".news-section, .news-status, .news-retry-btn").forEach((el) => el.remove());

  const status = document.createElement("p");
  status.className = "news-status";
  status.textContent = message;
  tableEl.appendChild(status);

  if (showRetry) {
    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "news-retry-btn";
    retryBtn.textContent = "재시도";
    retryBtn.addEventListener("click", onRetry);
    tableEl.appendChild(retryBtn);
  }
}

function buildMoreNewsBtn(keyword) {
  const moreBtn = document.createElement("button");
  moreBtn.type = "button";
  moreBtn.className = "news-more-btn";
  moreBtn.textContent = "▼ 더보기";

  moreBtn.addEventListener("click", async () => {
    moreBtn.disabled = true;
    moreBtn.textContent = "불러오는 중...";

    try {
      const nextCount = (newsDisplayCounts[keyword] || NEWS_MORE_STEP) + NEWS_MORE_STEP;
      const data = await fetchRecentNews(keyword, nextCount);
      const items = (data && data.items) || [];
      newsDisplayCounts[keyword] = nextCount;
      if (newsCache) newsCache[keyword] = items;
      renderNewsList(newsCache);
    } catch (err) {
      console.error("추가 뉴스를 불러오지 못했습니다:", err);
      moreBtn.disabled = false;
      moreBtn.textContent = "▼ 더보기";
    }
  });

  return moreBtn;
}

function buildNewsSectionEl(category, items, newLinks, onRemove) {
  const section = document.createElement("div");
  section.className = "news-section";

  const headingRow = document.createElement("div");
  headingRow.className = "news-section-heading-row";

  const heading = document.createElement("p");
  heading.className = "news-section-title";
  heading.textContent = `📌 ${category}`;
  headingRow.appendChild(heading);

  const headingRight = document.createElement("div");
  headingRight.className = "news-section-heading-right";

  const selectAllLabel = document.createElement("label");
  selectAllLabel.className = "news-section-select-all";

  const selectAllCheckbox = document.createElement("input");
  selectAllCheckbox.type = "checkbox";
  selectAllCheckbox.dataset.category = category;
  selectAllCheckbox.checked = items.length > 0 && items.every((item) => selectedNewsLinks.has(item.link));
  selectAllCheckbox.indeterminate =
    !selectAllCheckbox.checked && items.some((item) => selectedNewsLinks.has(item.link));
  selectAllCheckbox.addEventListener("change", () => {
    if (selectAllCheckbox.checked) items.forEach((item) => selectedNewsLinks.add(item.link));
    else items.forEach((item) => selectedNewsLinks.delete(item.link));
    renderNewsList(newsCache);
  });

  selectAllLabel.appendChild(selectAllCheckbox);
  selectAllLabel.appendChild(document.createTextNode("전체"));
  headingRight.appendChild(selectAllLabel);

  if (onRemove) {
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "news-keyword-remove-btn";
    removeBtn.title = "지정 해제";
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", onRemove);
    headingRight.appendChild(removeBtn);
  }

  headingRow.appendChild(headingRight);
  section.appendChild(headingRow);

  items.forEach((item) => section.appendChild(buildNewsCardEl(item, newLinks.has(item.link), category)));

  const requestedCount = newsDisplayCounts[category] || NEWS_MORE_STEP;
  if (items.length >= requestedCount) {
    section.appendChild(buildMoreNewsBtn(category));
  }

  return section;
}

function renderNewsList(newsData, newLinks = new Set()) {
  const listEl = document.getElementById("newsTable");
  if (!listEl) return;

  listEl.querySelectorAll(".news-section, .news-status, .news-retry-btn").forEach((el) => el.remove());

  const keywords = buildNewsKeywords();

  if (keywords.length === 0) {
    renderNewsStatus("지정된 키워드가 없습니다. 위 검색창에서 관심 키워드를 검색하고 지정해보세요.");
    updateGlobalSelectAllState(newsData);
    return;
  }

  keywords.forEach((keyword) => {
    const items = (newsData && newsData[keyword]) || [];
    listEl.appendChild(
      buildNewsSectionEl(keyword, items, newLinks, () => {
        const remaining = buildNewsKeywords().filter((k) => k !== keyword);
        localStorage.setItem(NEWS_KEYWORDS_KEY, JSON.stringify(remaining));
        if (newsCache) {
          delete newsCache[keyword];
          localStorage.setItem(
            NEWS_CACHE_KEY,
            JSON.stringify({ date: new Date().toDateString(), data: newsCache })
          );
        }
        renderNewsList(newsCache);
      })
    );
  });

  updateGlobalSelectAllState(newsData);
  renderStickyTopHeight();
}

function renderStickyTopHeight() {
  const stickyTop = document.querySelector(".news-box-sticky-top");
  const box = document.querySelector(".news-box");
  if (!stickyTop || !box) return;
  const height = stickyTop.getBoundingClientRect().height;
  box.style.setProperty("--news-sticky-top-height", `${height}px`);
}

function updateSectionSelectAllState(category) {
  const checkbox = Array.from(document.querySelectorAll(".news-section-select-all input")).find(
    (el) => el.dataset.category === category
  );
  if (!checkbox || !newsCache) return;

  const items = newsCache[category] || [];
  if (items.length === 0) {
    checkbox.checked = false;
    checkbox.indeterminate = false;
    return;
  }

  const selectedCount = items.filter((item) => selectedNewsLinks.has(item.link)).length;
  checkbox.checked = selectedCount === items.length;
  checkbox.indeterminate = selectedCount > 0 && selectedCount < items.length;
}

function updateGlobalSelectAllState(newsData) {
  const checkbox = document.getElementById("newsSelectAllCheckbox");
  if (!checkbox) return;

  const allLinks = [];
  Object.keys(newsData || {}).forEach((category) => {
    (newsData[category] || []).forEach((item) => allLinks.push(item.link));
  });

  if (allLinks.length === 0) {
    checkbox.checked = false;
    checkbox.indeterminate = false;
    return;
  }

  const selectedCount = allLinks.filter((link) => selectedNewsLinks.has(link)).length;
  checkbox.checked = selectedCount === allLinks.length;
  checkbox.indeterminate = selectedCount > 0 && selectedCount < allLinks.length;
}

function buildNewLinkSet(previousData, freshData) {
  const previousLinks = new Set();
  Object.keys(previousData || {}).forEach((category) => {
    (previousData[category] || []).forEach((item) => previousLinks.add(item.link));
  });

  const newLinks = new Set();
  if (!previousData) return newLinks;

  Object.keys(freshData || {}).forEach((category) => {
    (freshData[category] || []).forEach((item) => {
      if (!previousLinks.has(item.link)) newLinks.add(item.link);
    });
  });

  return newLinks;
}

function renderNewsRefreshedAt(date, failMessage) {
  const el = document.getElementById("newsRefreshedAt");
  if (!el) return;

  if (failMessage) {
    el.textContent = failMessage;
    return;
  }

  el.textContent = `마지막 갱신: ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

const openNewsBtn = document.getElementById("openNewsBtn");
const newsOverlay = document.getElementById("newsOverlay");
const closeNewsBtn = document.getElementById("closeNewsBtn");
const newsSelectAllCheckbox = document.getElementById("newsSelectAllCheckbox");
const newsMoreAllBtn = document.getElementById("newsMoreAllBtn");

const NEWS_CACHE_KEY = "newsCache";
let newsCache = null;
const selectedNewsLinks = new Set();

if (newsSelectAllCheckbox) {
  newsSelectAllCheckbox.addEventListener("change", () => {
    const allLinks = [];
    Object.keys(newsCache || {}).forEach((category) => {
      (newsCache[category] || []).forEach((item) => allLinks.push(item.link));
    });

    if (newsSelectAllCheckbox.checked) {
      allLinks.forEach((link) => selectedNewsLinks.add(link));
    } else {
      selectedNewsLinks.clear();
    }

    renderNewsList(newsCache);
  });
}

if (newsMoreAllBtn) {
  newsMoreAllBtn.addEventListener("click", async () => {
    const keywords = buildNewsKeywords();
    if (keywords.length === 0 || !newsCache) return;

    newsMoreAllBtn.disabled = true;
    newsMoreAllBtn.textContent = "불러오는 중...";

    try {
      const results = await Promise.all(
        keywords.map((keyword) => {
          const nextCount = (newsDisplayCounts[keyword] || NEWS_MORE_STEP) + NEWS_MORE_STEP;
          newsDisplayCounts[keyword] = nextCount;
          return fetchRecentNews(keyword, nextCount);
        })
      );
      keywords.forEach((keyword, i) => {
        newsCache[keyword] = (results[i] && results[i].items) || [];
      });
      renderNewsList(newsCache);
    } catch (err) {
      console.error("전체 더보기 실패:", err);
    } finally {
      newsMoreAllBtn.disabled = false;
      newsMoreAllBtn.textContent = "▼ 전체 더보기";
    }
  });
}

async function fetchNews() {
  let previousData = newsCache;

  if (!previousData) {
    try {
      const cached = JSON.parse(localStorage.getItem(NEWS_CACHE_KEY));
      if (cached && cached.data) {
        previousData = cached.data;
        newsCache = previousData;
        renderNewsList(newsCache);
      }
    } catch {
      // 캐시가 손상된 경우 무시하고 재조회로 진행
    }
  }

  const keywords = buildNewsKeywords();

  if (keywords.length === 0) {
    newsCache = {};
    renderNewsList(newsCache);
    const refreshedEl = document.getElementById("newsRefreshedAt");
    if (refreshedEl) refreshedEl.textContent = "";
    return;
  }

  if (!newsCache) {
    renderNewsStatus("불러오는 중...");
  } else {
    renderNewsRefreshedAt(null, "새로고침 중...");
  }

  keywords.forEach((keyword) => {
    newsDisplayCounts[keyword] = NEWS_MORE_STEP;
  });

  try {
    const results = await Promise.all(keywords.map((keyword) => fetchRecentNews(keyword, newsDisplayCounts[keyword])));

    const freshData = {};
    keywords.forEach((keyword, i) => {
      freshData[keyword] = (results[i] && results[i].items) || [];
    });

    if (Object.values(freshData).every((items) => items.length === 0)) {
      if (!newsCache) renderNewsStatus("표시할 뉴스가 없습니다");
      return;
    }

    const newLinks = buildNewLinkSet(previousData, freshData);

    newsCache = freshData;
    localStorage.setItem(
      NEWS_CACHE_KEY,
      JSON.stringify({ date: new Date().toDateString(), data: newsCache })
    );
    renderNewsList(newsCache, newLinks);
    renderNewsRefreshedAt(new Date());
  } catch (error) {
    if (newsCache) {
      renderNewsRefreshedAt(null, "갱신 실패 · 이전 목록 표시 중");
    } else if (error.name === "AbortError") {
      renderNewsStatus("뉴스를 불러올 수 없습니다 (응답 지연)", {
        showRetry: true,
        onRetry: fetchNews,
      });
    } else {
      renderNewsStatus("뉴스를 불러올 수 없습니다");
    }
  }
}

if (openNewsBtn && newsOverlay) {
  openNewsBtn.addEventListener("click", () => {
    newsOverlay.classList.add("show");
    fetchNews();
  });
}

if (closeNewsBtn && newsOverlay) {
  closeNewsBtn.addEventListener("click", () => {
    newsOverlay.classList.remove("show");
  });
}

async function fetchAlarmBriefingNews() {
  const keywords = buildNewsKeywords();
  if (keywords.length === 0) return [];

  const results = await Promise.all(keywords.map((keyword) => fetchRecentNews(keyword, 5)));
  const groups = results.map((data, i) => ((data && data.items) || []).map((item) => ({ ...item, keyword: keywords[i] })));

  const merged = [];
  const maxLen = Math.max(0, ...groups.map((group) => group.length));
  for (let i = 0; i < maxLen; i++) {
    groups.forEach((group) => {
      if (group[i]) merged.push(group[i]);
    });
  }
  return merged;
}

const newsSearchInput = document.getElementById("newsSearchInput");
const newsSearchBtn = document.getElementById("newsSearchBtn");
const newsSearchResultEl = document.getElementById("newsSearchResult");

function buildNewsSearchResultEl(keyword, items) {
  const wrap = document.createElement("div");
  wrap.className = "news-section news-search-preview";

  const headingRow = document.createElement("div");
  headingRow.className = "news-section-heading-row";

  const heading = document.createElement("p");
  heading.className = "news-section-title";
  heading.textContent = `🔍 "${keyword}" 검색 결과`;
  headingRow.appendChild(heading);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "news-keyword-remove-btn";
  closeBtn.title = "검색 결과 닫기";
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", () => {
    newsSearchResultEl.innerHTML = "";
    newsSearchInput.value = "";
    renderStickyTopHeight();
  });
  headingRow.appendChild(closeBtn);

  wrap.appendChild(headingRow);

  const keywords = buildNewsKeywords();

  if (keywords.includes(keyword)) {
    const info = document.createElement("p");
    info.className = "news-search-info";
    info.textContent = "이미 지정된 키워드입니다.";
    wrap.appendChild(info);
  } else {
    const actionRow = document.createElement("div");
    actionRow.className = "news-designate-row";

    if (keywords.length < 2) {
      const designateBtn = document.createElement("button");
      designateBtn.type = "button";
      designateBtn.className = "news-designate-btn";
      designateBtn.textContent = "⭐ 이 키워드 지정하기";
      designateBtn.addEventListener("click", () => {
        localStorage.setItem(NEWS_KEYWORDS_KEY, JSON.stringify([...keywords, keyword]));
        newsSearchResultEl.innerHTML = "";
        newsSearchInput.value = "";
        fetchNews();
      });
      actionRow.appendChild(designateBtn);
    } else {
      keywords.forEach((existing, i) => {
        const replaceBtn = document.createElement("button");
        replaceBtn.type = "button";
        replaceBtn.className = "news-designate-btn";
        replaceBtn.textContent = `'${existing}' 대신 지정`;
        replaceBtn.addEventListener("click", () => {
          const next = [...keywords];
          next[i] = keyword;
          localStorage.setItem(NEWS_KEYWORDS_KEY, JSON.stringify(next));
          newsSearchResultEl.innerHTML = "";
          newsSearchInput.value = "";
          fetchNews();
        });
        actionRow.appendChild(replaceBtn);
      });
    }

    wrap.appendChild(actionRow);
  }

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "news-search-info";
    empty.textContent = "검색 결과가 없습니다.";
    wrap.appendChild(empty);
  } else {
    items.forEach((item) => wrap.appendChild(buildNewsCardEl(item, false, `search:${keyword}`)));
  }

  return wrap;
}

async function fetchNewsSearchResult() {
  const keyword = newsSearchInput.value.trim();
  if (!keyword) return;

  newsSearchResultEl.innerHTML = "";
  const loading = document.createElement("p");
  loading.className = "news-search-info";
  loading.textContent = "검색 중...";
  newsSearchResultEl.appendChild(loading);
  renderStickyTopHeight();

  try {
    const data = await fetchRecentNews(keyword, 5);
    newsSearchResultEl.innerHTML = "";
    newsSearchResultEl.appendChild(buildNewsSearchResultEl(keyword, (data && data.items) || []));
  } catch {
    newsSearchResultEl.innerHTML = "";
    const errEl = document.createElement("p");
    errEl.className = "news-search-info";
    errEl.textContent = "검색에 실패했습니다.";
    newsSearchResultEl.appendChild(errEl);
  } finally {
    renderStickyTopHeight();
  }
}

if (newsSearchBtn) newsSearchBtn.addEventListener("click", fetchNewsSearchResult);
if (newsSearchInput) {
  newsSearchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") fetchNewsSearchResult();
  });
}

const BRIEFING_ORDINALS = ["첫번째", "두번째", "세번째", "네번째", "다섯번째"];

function buildBriefingItemText(item, index) {
  const ordinal = BRIEFING_ORDINALS[index] || `${index + 1}번째`;
  const title = stripHtmlTags(item.title);
  const desc = stripHtmlTags(item.description);
  const keywordPrefix = item.keyword ? `${item.keyword} 키워드, ` : "";
  return `${ordinal} 뉴스, ${keywordPrefix}${title}. ${desc}`;
}

function buildBriefingText(items) {
  return items.map((item, i) => buildBriefingItemText(item, i)).join(" ");
}

function renderNewsBriefing(items) {
  const listEl = document.getElementById("newsBriefingList");
  if (!listEl) return;

  listEl.innerHTML = "";

  items.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "news-card briefing-card";
    card.dataset.index = index;

    if (item.keyword) {
      const badge = document.createElement("span");
      badge.className = "briefing-keyword-badge";
      badge.textContent = `📌 ${item.keyword}`;
      card.appendChild(badge);
    }

    const title = document.createElement("p");
    title.className = "news-title";
    title.appendChild(buildHighlightedText(stripHtmlTags(item.title), item.keyword));

    const desc = document.createElement("p");
    desc.className = "news-desc";
    desc.appendChild(buildHighlightedText(stripHtmlTags(item.description), item.keyword));

    card.appendChild(title);
    card.appendChild(desc);
    listEl.appendChild(card);
  });
}

function renderBriefingActive(index) {
  const listEl = document.getElementById("newsBriefingList");
  if (!listEl) return;

  listEl.querySelectorAll(".briefing-card").forEach((card) => {
    card.classList.toggle("active", Number(card.dataset.index) === index);
  });

  const activeCard = listEl.querySelector(".briefing-card.active");
  if (activeCard) activeCard.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

const BRIEFING_FALLBACK_DISPLAY_MS = 5000;

function speakBriefing(text, onEnd) {
  if (!("speechSynthesis" in window)) {
    if (onEnd) setTimeout(onEnd, BRIEFING_FALLBACK_DISPLAY_MS);
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ko-KR";
  if (onEnd) {
    utterance.onend = onEnd;
    utterance.onerror = onEnd;
  }

  speechSynthesis.speak(utterance);
}

function stopBriefing() {
  speechSynthesis.cancel();
}

function logBriefingToSheet(items, alarmTime) {
  try {
    fetch(CONFIG.APPS_SCRIPT_BRIEFING_LOG_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        loggedAt: new Date().toISOString(),
        alarmTime,
        items: items.map((item) => ({
          title: stripHtmlTags(item.title),
          description: stripHtmlTags(item.description),
          link: item.link,
          pubDate: item.pubDate,
        })),
      }),
    }).catch((err) => console.error("뉴스 브리핑 로그 기록 실패:", err));
  } catch (err) {
    console.error("뉴스 브리핑 로그 기록 실패:", err);
  }
}

async function logSelectedNewsToSheet() {
  if (!newsCache || selectedNewsLinks.size === 0) return null;

  const selected = [];
  Object.keys(newsCache).forEach((category) => {
    (newsCache[category] || []).forEach((item) => {
      if (selectedNewsLinks.has(item.link)) {
        selected.push({
          category,
          title: stripHtmlTags(item.title),
          description: stripHtmlTags(item.description),
          link: item.link,
          pubDate: item.pubDate,
        });
      }
    });
  });

  if (selected.length === 0) return null;

  try {
    const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ selectedNews: selected, loggedAt: new Date().toISOString() }),
    });
    const data = await response.json();
    const ok = Boolean(data && data.result === "success");
    if (ok) {
      selectedNewsLinks.clear();
      renderNewsList(newsCache);
    }
    return ok;
  } catch (err) {
    console.error("선택한 뉴스 저장 실패:", err);
    return false;
  }
}
