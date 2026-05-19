# Stock Insight — 안드로이드 PWA 앱

내 주식 인사이트 앱. 매일 시장 브리핑, 포트폴리오 현황, 주도주 발굴 리포트를 음성으로 들을 수 있습니다.
**v1.3** — GitHub Actions로 시세·환율·뉴스 자동 갱신 지원.

---

## ① 설치 (10~15분, 처음 한 번)

### STEP 1 — GitHub 가입
https://github.com 우측 상단 **Sign up** (무료)

### STEP 2 — 새 저장소
**＋ → New repository** → 이름 `stock-insight` → **Public** 선택 → README 체크 해제 → **Create**

### STEP 3 — 파일 업로드
저장소 화면에서 **Add file → Upload files** → 이 `investment_app` 폴더의 **내용 전체**를 드래그.

업로드 후 폴더 구조가 이렇게 보여야 합니다:
```
index.html
app.js
app.css
manifest.json
sw.js
README.md
icons/
data/
.github/workflows/update-data.yml   ← GitHub Actions 워크플로우
scripts/
  update_data.py
  requirements.txt
```

페이지 하단 **Commit changes** 클릭.

### STEP 4 — GitHub Pages 활성화
**Settings → Pages → Branch: `main`, Folder: `/ (root)` → Save**
1~2분 뒤 `https://YOUR_USER.github.io/stock-insight/` 주소 발급.

### STEP 5 — 안드로이드에 설치
크롬에서 그 주소 접속 → **⋮ 메뉴 → 홈 화면에 추가** → 끝.

---

## ② GitHub Actions 자동화 켜기

매시간 시세·환율·네이버 뉴스를 자동으로 갱신하는 워크플로우가 들어 있습니다.
파일을 업로드만 해도 작동하지만, **첫 실행 권한 설정**이 필요합니다.

### 자동 커밋 권한 켜기 (1회 설정)
1. 저장소 **Settings → Actions → General** 이동
2. 아래쪽 **Workflow permissions** 섹션에서:
   - **Read and write permissions** 선택
   - **Allow GitHub Actions to create and approve pull requests** 체크
3. **Save** 클릭

### 첫 수동 실행
1. 저장소 상단 **Actions** 탭 클릭
2. 왼쪽 목록에서 **Update market data** 클릭
3. 우측의 **Run workflow** 버튼 → 다시 **Run workflow** 확인
4. 1~3분 대기. 초록색 체크가 뜨면 성공
5. 저장소 `data/prices.json`·`data/news.json` 파일이 생성됨

### 이후 자동 실행
- **매시간 정시** 자동 실행 (`cron: 0 * * * *`)
- 보유 종목(`data/portfolio.json`) 변경 시 즉시 실행
- Actions 탭에서 수동 실행도 항상 가능

### 앱에 반영
GitHub Actions가 새 데이터를 커밋한 직후 GitHub Pages가 자동 갱신됩니다.
앱에서 **⟳ 새로고침** 버튼 한 번 누르면 새 시세/뉴스 표시.

---

## ③ 작동 흐름

```
[매시간 GitHub Actions]
   ├── pykrx        → 한국 종목 최근 거래일 종가
   ├── yfinance     → 미국 종목 최근 거래일 종가
   ├── frankfurter  → USD→KRW 환율
   └── 네이버 금융   → 메인 시황 뉴스 헤드라인
        ↓
   data/prices.json + data/news.json 자동 커밋
        ↓
[안드로이드 앱]
   loadServerPrices() → 자동 시세·환율 적용
   loadNews()          → 홈 화면 뉴스 카드
```

---

## ④ 음성·UI 사용법

- **듣기 버튼** — 한 번 누르면 1× 재생, 두 번 1.5×, 세 번 2×, 네 번 1× (위치 유지)
- **상단 ⏹** — 음성 정지
- **뒤로가기 (안드로이드 버튼)**:
  - 모달/상세 화면: 닫힘
  - 홈이 아닌 페이지: 홈으로 이동
  - 홈: "정말 나가시겠습니까?" 모달

---

## ⑤ 자주 묻는 질문

**Q. 시세가 늦게 갱신돼요.**
A. 한국 시세는 pykrx가 매일 장 마감 후 데이터를 제공합니다. 미국 시세는 yfinance가 15~20분 지연된 값을 줍니다. 실시간 호가는 별도 API 필요.

**Q. 시세가 아예 안 보여요.**
A. GitHub Actions 첫 실행 전이면 그렇습니다. 위 ② STEP을 진행하세요. 또는 포트폴리오 화면에서 종목별로 수동 입력하면 그 값이 그대로 손익에 반영됩니다.

**Q. 새 종목을 추가했는데 시세가 안 들어와요.**
A. 포트폴리오 → "내보내기" → JSON 복사 → GitHub의 `data/portfolio.json`에 붙여넣기 commit. push 트리거로 워크플로우가 즉시 실행됩니다.

**Q. 네이버 뉴스가 비어 있어요.**
A. Actions가 한 번 실행되어야 합니다. Actions 탭에서 수동 실행해보세요. 또 네이버가 HTML 구조를 자주 바꿔서 스크래핑이 실패할 수 있습니다(`scripts/update_data.py`의 셀렉터를 조정하면 됨).

**Q. Actions 실행이 실패해요.**
A. Actions 탭 → 실패한 실행 클릭 → 로그 확인. 흔한 원인:
   - "permission denied" → 위 자동 커밋 권한 설정 누락
   - "ModuleNotFoundError" → `scripts/requirements.txt`가 누락됐는지 확인
   - yfinance/pykrx 일시 오류 → 다음 시간에 자동 재시도됨

**Q. 무료 한도 걱정 안 해도 되나요?**
A. Public 저장소는 GitHub Actions가 무료입니다. 매시간 실행 = 월 ~720회 × ~30초 ≈ 6시간 사용. 무료 한도(public 무제한, private은 월 2,000분) 안에 들어옵니다.

---

## ⑥ 파일 구조 요약

| 파일/폴더 | 역할 |
|---|---|
| `index.html`, `app.css`, `app.js` | 앱 본체 (PWA) |
| `manifest.json`, `sw.js`, `icons/` | PWA 설치/오프라인 캐싱 |
| `data/portfolio.json` | 보유 종목 (앱 내에서도 추가/수정/삭제 가능) |
| `data/briefings/` | 일일 시장 브리핑 (`index.json` + 마크다운) |
| `data/picks/daily/` | 일일 주도주 픽 |
| `data/picks/weekly/` | 주간 주도주 리포트 |
| `data/prices.json` | **GitHub Actions가 자동 생성**: 시세·환율 |
| `data/news.json` | **GitHub Actions가 자동 생성**: 네이버 뉴스 |
| `.github/workflows/update-data.yml` | 매시간 실행 워크플로우 |
| `scripts/update_data.py` | 데이터 수집 Python |
| `scripts/requirements.txt` | Python 의존성 |

---

## ⑦ v1.4 로드맵 (다음 단계)

- [ ] 매일 8시 브리핑 자동 생성 (Claude API 또는 별도 스크립트)
- [ ] 주간 주도주 리포트 자동 생성
- [ ] 한국투자증권 API로 실시간 시세
- [ ] 푸시 알림 (특정 종목 ±n% 변동 시)
- [ ] 종목별 차트(Chart.js)
- [ ] 종목별 뉴스 필터

문제 생기면 채팅으로 알려주세요.
