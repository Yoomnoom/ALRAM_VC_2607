# 알람 앱

날씨 배경과 함께 동작하는 웹 알람 앱. PWA로 설치해 홈 화면/바탕화면에서 앱처럼 사용할 수 있고, 알람이 울릴 때 사용자가 지정한 키워드의 최신 뉴스를 음성(TTS)으로 읽어준다.

## 주요 기능

- **알람**: 시간/반복(한 번만·매일·평일·주기·요일 지정) 설정, 알람음 3종, 스누즈(5/10/15분)
- **날씨 배경**: 서울 현재 날씨(OpenWeatherMap)에 따라 배경 애니메이션(맑음/구름/비/이슬비/뇌우/눈/안개)이 바뀜
- **최근뉴스**: 관심 키워드(최대 2개) 검색·지정, 뉴스 목록 조회, 체크한 기사 저장
- **뉴스 브리핑**: 알람이 울릴 때 지정 키워드 뉴스를 순서대로 음성으로 읽어줌 (알람 소리와는 독립적으로 동작 — 브리핑이 실패해도 알람은 정상 작동)
- **다크모드 / 글자 크기 조절**: 설정 탭에서 변경, 브라우저에 저장되어 유지됨
- **PWA**: manifest + service worker로 홈 화면 설치 지원 (앱 셸만 캐싱, 뉴스/날씨 등 실시간 데이터는 캐싱하지 않음)

## 화면 구조

하단 탭 3개로 구성되어 있다.

| 탭 | 내용 |
|---|---|
| 알람 | 시계, 알람 목록, 알람 추가/수정 |
| 뉴스 | 키워드 검색·지정, 지정 키워드별 뉴스 목록(데스크톱은 2열, 모바일은 전환 버튼으로 1열씩) |
| 설정 | 다크모드, 글자 크기, 로컬 데이터 초기화 |

## 기술 스택

- 순수 HTML / CSS / JavaScript (프레임워크·빌드 도구 없음)
- 백엔드: Supabase Edge Function(`supabase/functions/naver-news`)이 네이버 뉴스 검색 API를 프록시 — API 키가 클라이언트에 노출되지 않도록 서버에서만 호출
- 뉴스 브리핑/저장 로그: Google Apps Script 웹앱 (Google Sheets에 기록)

## 로컬 실행

Node 등 별도 빌드 과정 없이 정적 파일 그대로 서빙하면 된다. 단, `fetch`(뉴스 API 등)가 동작하려면 `file://`가 아니라 `http://`로 열어야 한다.

```bash
npx serve .
# 또는
python -m http.server 8080
```

### 환경 변수 / 키 설정

`config.js`는 `.gitignore`에 포함되어 있어 저장소에 커밋되지 않는다. 로컬 개발 시 `config.example.js`를 참고해 `config.js`를 직접 만들거나, 배포 환경에서는 아래 4개 환경 변수를 채운 뒤 `node generate-config.js`로 생성한다.

- `SUPABASE_NEWS_FUNCTION_URL`
- `SUPABASE_ANON_KEY`
- `APPS_SCRIPT_BRIEFING_LOG_URL`
- `APPS_SCRIPT_URL`

**네이버 API 키 등 실제 시크릿은 Supabase Edge Function 환경 변수로만 관리하며, 클라이언트 코드에는 절대 포함하지 않는다.** (자세한 원칙은 [CLAUDE.md](CLAUDE.md) 참고)

## 폴더 구조

```
index.html / script.js / style.css   — 알람 앱 코어(시계, 알람 CRUD, 날씨, 탭 전환, 설정, 커스텀 모달)
news/news.js / news/news.css         — 최근뉴스 기능 전용 (news/CLAUDE.md 참고)
manifest.json / sw.js / icons/       — PWA 설정
supabase/functions/naver-news/       — 네이버 뉴스 API 프록시(Edge Function)
config.js (gitignored) / config.example.js / generate-config.js — 환경별 설정
```

## 더 읽어보기

- [CLAUDE.md](CLAUDE.md) — 프로젝트 전체 공통 규칙(보안, 데이터 저장 원칙, 실패 허용 원칙 등)
- [news/CLAUDE.md](news/CLAUDE.md) — 뉴스 기능 파일 구조·함수 네이밍 규칙
- [news/prd.md](news/prd.md) — 뉴스 브리핑 기능 PRD
- [HANDOVER.md](HANDOVER.md) — 세션별 작업 인수인계 로그
