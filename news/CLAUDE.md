# news/CLAUDE.md

이 파일은 `news/` 폴더 안의 파일을 다룰 때만 참고하는 세부 규칙이다.
프로젝트 전체 공통 규칙(보안, 실패 허용 원칙 등)은 루트 [CLAUDE.md](../CLAUDE.md)를 따르며 여기서는 반복하지 않는다.

## 담당 범위

이 폴더는 알람 앱의 **'최근뉴스'(창업/웹툰) 조회 및 TTS 브리핑 기능**만 담당한다.
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

- 함수 시그니처(함수명, 파라미터명, 파라미터 순서)는 `참고사항/최근뉴스_기술명세서.md`에 나온 코드를 그대로 따른다.
- 예: `searchNews(query, display = 3)`, `fetchNews(forceRefresh = false)`, `readNews(news)`, `stopReading()`
- 리팩터링·가독성 개선 목적이라도 파라미터 이름이나 순서를 임의로 바꾸지 않는다. 변경이 필요하다고 판단되면 먼저 사용자에게 확인한다.

## script.js와의 경계

- `script.js`(알람 로직)는 이 폴더가 제공하는 함수를 **호출만** 한다.
- 뉴스 조회, 캐싱, TTS 재생 등 뉴스 관련 로직을 `script.js`에 직접 작성하지 않는다. 해당 로직은 반드시 `news/news.js`에 구현하고 `script.js`에서는 import/호출만 한다.
