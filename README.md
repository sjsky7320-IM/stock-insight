# Stock Insight — 안드로이드 PWA 앱

내 주식 인사이트 앱. 매일 시장 브리핑, 포트폴리오 현황, 주도주 발굴 리포트를 음성으로 들을 수 있습니다.

이 문서는 **앱을 안드로이드 폰에 설치하기 위한 단계별 가이드**입니다. 코딩 지식 없이 따라하실 수 있도록 작성했습니다.

---

## 한눈에 보기

```
[GitHub에 코드 업로드]
        ↓
[GitHub Pages 활성화 → https:// 주소 발급]
        ↓
[안드로이드 크롬에서 그 주소 열기]
        ↓
[메뉴 → 홈 화면에 추가]
        ↓
[일반 앱처럼 실행!]
```

소요 시간: **약 10~15분** (처음 한 번)

---

## STEP 1 — GitHub 계정 만들기 (이미 있으면 STEP 2로)

1. https://github.com 접속
2. 우측 상단 **Sign up** 클릭
3. 이메일·비밀번호·사용자명 입력 후 가입

> 무료 계정이면 충분합니다.

---

## STEP 2 — 새 저장소(Repository) 만들기

1. 로그인 후 우측 상단 **+** 아이콘 → **New repository**
2. 입력:
   - **Repository name**: `stock-insight` (원하는 이름)
   - **Public** 선택 (Pages는 무료 플랜에서 Public만 가능)
   - **Add a README file**: 체크 해제
   - **.gitignore**: None
   - **License**: None
3. 초록색 **Create repository** 버튼 클릭

---

## STEP 3 — 앱 파일 업로드

저장소 페이지에서 **"uploading an existing file"** 링크 클릭 (또는 **Add file → Upload files**).

이 폴더(`investment_app/`)의 **내용물 전체**를 드래그&드롭으로 업로드합니다. 업로드해야 할 항목:

```
index.html
app.js
app.css
manifest.json
sw.js
README.md   ← 이 파일
icons/
  ├ icon-192.png
  ├ icon-512.png
  ├ icon-maskable-512.png
  ├ apple-touch-icon.png
  └ favicon.png
data/
  ├ portfolio.json
  ├ briefings/
  │   ├ index.json
  │   └ 2026-05-19.md
  └ picks/
      ├ index.json
      └ sample.md
```

**중요**: 폴더 구조가 그대로 유지되어야 합니다. 드래그&드롭은 폴더 통째로 올리면 자동 유지됩니다.

업로드가 끝나면 페이지 하단 **Commit changes** 클릭.

---

## STEP 4 — GitHub Pages 활성화

1. 저장소 페이지 상단 **Settings** 클릭
2. 좌측 메뉴 **Pages** 클릭
3. **Source** 항목에서:
   - **Branch**: `main` 선택
   - **Folder**: `/ (root)`
4. **Save** 클릭

1~2분 후 Pages 페이지를 새로고침하면 상단에 다음과 같은 주소가 표시됩니다:

```
Your site is live at https://YOUR_USERNAME.github.io/stock-insight/
```

이 주소가 **앱의 URL**입니다. 복사해서 메모해두세요.

---

## STEP 5 — 안드로이드에 앱 설치

1. 안드로이드 폰에서 **Chrome** 앱 열기
2. 위에서 받은 주소(`https://YOUR_USERNAME.github.io/stock-insight/`)로 접속
3. 앱 화면이 잘 뜨는지 확인 (홈 화면, 하단 탭 4개)
4. 크롬 우측 상단 **⋮ (메뉴)** → **홈 화면에 추가**
5. 앱 이름 확인 후 **추가**
6. 홈 화면에 **Stock Insight** 아이콘 생성 완료!

이제 아이콘을 누르면 일반 앱처럼 **전체화면**으로 실행됩니다.

> iPhone(Safari) 사용자: 공유 버튼 → **홈 화면에 추가**로도 동일하게 설치 가능합니다.

---

## STEP 6 — 음성 기능 확인

1. 앱 실행 → 홈 화면의 카드에 있는 **🔊 듣기** 버튼 누르기
2. 안드로이드 내장 한국어 음성으로 카드 내용을 읽어줍니다
3. **설정 탭**(우측 상단 톱니바퀴 아이콘)에서:
   - 음성 선택 (여러 한국어 음성이 있다면 골라보세요)
   - 속도 조절 (이동 중엔 1.2× 정도 추천)
   - 음높이 조절

> **음성이 안 나올 때**: 안드로이드 설정 → 텍스트 음성 변환(TTS) → Google TTS 또는 삼성 TTS 활성화 + 한국어 데이터 다운로드.

---

## 매일 업데이트 흐름

이 앱은 정적 파일이지만, 다음 두 가지 방법으로 매일/매주 콘텐츠가 갱신됩니다.

### 방법 A — Claude에게 부탁 (현재 권장)

채팅으로 다음과 같이 말씀하시면 됩니다:
- "오늘 브리핑 만들어줘" → `data/briefings/YYYY-MM-DD.md` 새 파일 생성 + `index.json` 업데이트
- "주도주 리포트 만들어줘" → `data/picks/YYYY-Wxx.md` 생성

생성된 파일을 GitHub 웹페이지에서 **Add file → Upload files**로 올리면 끝.

### 방법 B — 스케줄 자동화 + Git 자동 푸시 (다음 단계)

다음 채팅 세션에서 "스케줄에 매일 8시 자동 브리핑 등록해줘"라고 말씀하시면, 매일 자동으로 브리핑 마크다운이 생성되도록 등록해드립니다. GitHub 자동 푸시까지 원하시면 별도 설정이 필요합니다 (자세한 안내 가능).

---

## 자주 묻는 질문

**Q. 푸시 알림이 안 오는데요?**
A. PWA의 푸시는 안드로이드에서는 가능하지만 추가 서버 설정이 필요합니다. v1.1에서 옵션으로 추가할 예정. 우선 매일 출근 길에 앱을 한 번 열어보는 습관을 만드세요.

**Q. 오프라인에서도 보입니까?**
A. 한 번 접속한 뒤에는 service worker가 캐시해두어 비행기 모드에서도 마지막 데이터가 보입니다.

**Q. 보유 종목이 바뀌었어요.**
A. 채팅에서 "포트폴리오 업데이트" 말씀해주시면 `data/portfolio.json`을 수정해드립니다.

**Q. 현재가가 자동으로 안 나오나요?**
A. v1은 사용자가 직접 현재가를 입력하는 구조입니다(저장됨). 실시간 시세 자동 연동은 외부 API 키가 필요해서 v2에서 추가 예정입니다. 한국투자증권·키움 OpenAPI 또는 Alpha Vantage 등 옵션이 있습니다.

**Q. 화면이 라이트모드로 보였으면 좋겠어요.**
A. 현재 다크 톤이 기본입니다. 원하시면 `app.css`에서 `--bg` 등 색상을 변경하면 됩니다. 채팅으로 부탁하시면 바꿔드립니다.

---

## 파일 구조 요약

| 파일 | 역할 |
|---|---|
| `index.html` | 앱의 메인 화면 셸 |
| `app.css` | 디자인·테마 |
| `app.js` | 라우팅·TTS·계산 로직 |
| `manifest.json` | PWA 설치 정보 (이름·아이콘·테마색) |
| `sw.js` | Service Worker — 오프라인 캐시 |
| `data/portfolio.json` | 내 보유 종목 |
| `data/briefings/` | 매일 시장 브리핑 (마크다운) |
| `data/picks/` | 주간 주도주 리포트 |

---

## 다음 작업 (v1.1~v2 로드맵)

- [ ] 종목별 뉴스 피드 페이지
- [ ] 한국투자증권 OpenAPI로 실시간 시세 자동 갱신
- [ ] 매도/매수 알림 푸시
- [ ] 차트 (Chart.js) — 보유 종목 기간별 수익률
- [ ] 종목 상세 페이지 (뉴스·차트·이슈)
- [ ] 다국어 음성 (한/영 혼합 종목명 자연스럽게)

---

설치하시면서 막히는 부분 있으면 채팅으로 알려주세요. 화면 캡처 보내주시면 더 정확히 도와드립니다.
