const NEWS_TIMEOUT_MS = 5000;

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

function buildNewsCardEl(item, isNew, category) {
  const cell = document.createElement("div");
  cell.className = "news-card";

  const header = document.createElement("div");
  header.className = "news-card-header";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "news-select";
  checkbox.checked = selectedNewsLinks.has(item.link);
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) selectedNewsLinks.add(item.link);
    else selectedNewsLinks.delete(item.link);
    updateSectionSelectAllState(category);
  });

  const title = document.createElement("p");
  title.className = "news-title";
  title.textContent = stripHtmlTags(item.title);

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
  desc.textContent = stripHtmlTags(item.description);

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

  meta.appendChild(date);
  meta.appendChild(link);

  cell.appendChild(header);
  cell.appendChild(desc);
  cell.appendChild(meta);
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

const NEWS_SECTION_LABELS = { startup: "🚀 스타트업", webtoon: "🌐 웹툰" };

function buildNewsSectionEl(category, items, newLinks) {
  const section = document.createElement("div");
  section.className = "news-section";

  const headingRow = document.createElement("div");
  headingRow.className = "news-section-heading-row";

  const heading = document.createElement("p");
  heading.className = "news-section-title";
  heading.textContent = NEWS_SECTION_LABELS[category] || category;
  headingRow.appendChild(heading);

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
  selectAllLabel.appendChild(document.createTextNode("전체 선택"));
  headingRow.appendChild(selectAllLabel);

  section.appendChild(headingRow);

  items.forEach((item) => section.appendChild(buildNewsCardEl(item, newLinks.has(item.link), category)));
  return section;
}

function renderNewsList(newsData, newLinks = new Set()) {
  const listEl = document.getElementById("newsTable");
  if (!listEl) return;

  listEl.querySelectorAll(".news-section, .news-status, .news-retry-btn").forEach((el) => el.remove());

  listEl.appendChild(buildNewsSectionEl("startup", (newsData && newsData.startup) || [], newLinks));
  listEl.appendChild(buildNewsSectionEl("webtoon", (newsData && newsData.webtoon) || [], newLinks));
}

function updateSectionSelectAllState(category) {
  const checkbox = document.querySelector(`.news-section-select-all input[data-category="${category}"]`);
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

function buildNewLinkSet(previousData, freshData) {
  const previousLinks = new Set();
  ["startup", "webtoon"].forEach((category) => {
    ((previousData && previousData[category]) || []).forEach((item) => previousLinks.add(item.link));
  });

  const newLinks = new Set();
  if (!previousData) return newLinks;

  ["startup", "webtoon"].forEach((category) => {
    ((freshData && freshData[category]) || []).forEach((item) => {
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

const NEWS_CACHE_KEY = "newsCache";
let newsCache = null;
const selectedNewsLinks = new Set();

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

  if (!newsCache) {
    renderNewsStatus("불러오는 중...");
  }

  try {
    const [startupData, webtoonData] = await Promise.all([
      fetchRecentNews("스타트업", 5),
      fetchRecentNews("웹툰", 5),
    ]);

    const startup = (startupData && startupData.items) || [];
    const webtoon = (webtoonData && webtoonData.items) || [];

    if (startup.length === 0 && webtoon.length === 0) {
      if (!newsCache) renderNewsStatus("표시할 뉴스가 없습니다");
      return;
    }

    const freshData = { startup, webtoon };
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

const BRIEFING_ORDINALS = ["첫번째", "두번째", "세번째", "네번째", "다섯번째"];

function buildBriefingItemText(item, index) {
  const ordinal = BRIEFING_ORDINALS[index] || `${index + 1}번째`;
  const title = stripHtmlTags(item.title);
  const desc = stripHtmlTags(item.description);
  return `${ordinal} 뉴스, ${title}. ${desc}`;
}

function buildBriefingText(items) {
  return items.map((item, i) => buildBriefingItemText(item, i)).join(" ");
}

function renderNewsBriefing(items) {
  const listEl = document.getElementById("newsBriefingList");
  if (!listEl) return;

  listEl.innerHTML = "";

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "news-card briefing-card";

    const title = document.createElement("p");
    title.className = "news-title";
    title.textContent = stripHtmlTags(item.title);

    const desc = document.createElement("p");
    desc.className = "news-desc";
    desc.textContent = stripHtmlTags(item.description);

    card.appendChild(title);
    card.appendChild(desc);
    listEl.appendChild(card);
  });
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
  ["startup", "webtoon"].forEach((category) => {
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
