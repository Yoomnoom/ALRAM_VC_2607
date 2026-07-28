# news/CLAUDE.md

이 파일은 `news/` 폴더 안의 파일을 다룰 때만 참고하는 세부 규칙이다.
프로젝트 전체 공통 규칙(보안, 실패 허용 원칙 등)은 루트 [CLAUDE.md](../CLAUDE.md)를 따르며 여기서는 반복하지 않는다.

## 담당 범위

이 폴더는 알람 앱의 **'최근뉴스'(사용자 지정 키워드, 최대 2개) 조회 및 TTS 브리핑 기능**만 담당한다.
알람 자체의 트리거/재생 로직은 이 폴더의 책임이 아니다.

## 파일 구조 규칙

- 이 폴더에는 `news.js`, `news.css` 파일만 둔다.
- 그 외 파일(설계 문서 제외)을 추가하지 않는다. 기능이 커져도 파일을 쪼개지 말고 이 두 파일 안에서 정리한다.

## 함수 이름 규칙

- 데이터를 가져오는(비동기 조회) 함수: `fetchXxx` (예: `fetchNews`)
- 화면에 그리는 함수: `renderXxx` (예: `renderNewsList`)
- 순수 변환 함수(데이터 가공, HTML 태그 제거 등 부작용 없는 함수): `buildXxx` / `stripXxx` (예: `buildNewsQueue`, `stripHtmlTags`)

이 세 카테고리 접두사 외의 이름(`getXxx`, `handleXxx`, `processXxx` 등)을 임의로 사용하지 않는다.

## 함수 시그니처 규칙

- 함수 시그니처(함수명, 파라미터명, 파라미터 순서)는 현재 `news/news.js`에 구현된 코드를 기준으로 한다.
- 예: `fetchRecentNews(keyword, count = 5)`, `fetchNews()`, `fetchAlarmBriefingNews()`, `speakBriefing(text, onEnd)`, `stopBriefing()`
- 하단 탭(알람/뉴스/설정) 구조 도입 이후 추가된 함수: `fetchNewsIfNeeded()`(탭 진입 시 캐시 있으면 렌더만, 없으면 `fetchNews()` 호출), `fetchNewsRefresh(iconEl)`(강제 새로고침 + 아이콘 스핀 처리), `renderNewsTabLabels()`(키워드 전환 버튼 라벨 갱신)
- `updateSectionSelectAllState(category)` / `updateGlobalSelectAllState(newsData)`는 이번 세션 이전부터 있던 함수로, `update` 접두사가 위 세 카테고리 규칙과 맞지 않는 기존 예외다. 신규 함수에서 `update` 접두사를 새로 따라 하지 말 것 — 필요하면 `renderXxx`로 만든다.
- `ETC/최근뉴스_기술명세서.md`는 초기 기획 단계의 설계 스케치(React+Supabase 개념안)로, 실제 구현과 함수명·구조가 달라 시그니처 기준으로 참고하지 않는다.
- 리팩터링·가독성 개선 목적이라도 기존 함수의 파라미터 이름이나 순서를 임의로 바꾸지 않는다. 변경이 필요하다고 판단되면 먼저 사용자에게 확인한다.

## script.js와의 경계

- `script.js`(알람 로직)는 이 폴더가 제공하는 함수를 **호출만** 한다.
- 뉴스 조회, 캐싱, TTS 재생 등 뉴스 관련 로직을 `script.js`에 직접 작성하지 않는다. 해당 로직은 반드시 `news/news.js`에 구현하고 `script.js`에서는 import/호출만 한다.
