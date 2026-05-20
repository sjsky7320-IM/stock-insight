"""GitHub Actions 매시간 실행. 시세·환율·뉴스 수집 + 일일 브리핑·데일리 픽 자동 생성.

출력:
  data/prices.json
  data/news.json
  data/briefings/YYYY-MM-DD.md + index.json
  data/picks/daily/YYYY-MM-DD.md + index.json
"""
import json
import re
import sys
import time
import traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
PORTFOLIO_PATH = ROOT / "data" / "portfolio.json"
PRICES_OUT = ROOT / "data" / "prices.json"
NEWS_OUT = ROOT / "data" / "news.json"
BRIEF_DIR = ROOT / "data" / "briefings"
DAILY_PICK_DIR = ROOT / "data" / "picks" / "daily"

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/121.0 Safari/537.36")


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

def kst_now():
    return datetime.now(timezone(timedelta(hours=9)))

def kst_today():
    return kst_now().date()


# ---------- 환율 ----------
def get_fx():
    try:
        r = requests.get("https://api.frankfurter.app/latest?from=USD&to=KRW", timeout=10)
        r.raise_for_status()
        j = r.json()
        return {"USDKRW": float(j["rates"]["KRW"]), "date": j["date"], "source": "frankfurter"}
    except Exception as e:
        print(f"[fx] error: {e}", file=sys.stderr)
        return None


# ---------- 한국 시세 ----------
def get_kr_prices(tickers):
    if not tickers:
        return {}
    try:
        from pykrx import stock
    except Exception as e:
        print(f"[kr] pykrx import fail: {e}", file=sys.stderr)
        return {}
    out = {}
    today = kst_today()
    for delta in range(0, 10):
        d = (today - timedelta(days=delta)).strftime("%Y%m%d")
        try:
            df = stock.get_market_ohlcv(d, market="ALL")
        except Exception as e:
            print(f"[kr] {d} fail: {e}", file=sys.stderr)
            continue
        if df is None or df.empty:
            continue
        for t in tickers:
            if t in df.index:
                try:
                    out[t] = float(df.loc[t, "종가"])
                except Exception:
                    pass
        if out:
            print(f"[kr] using {d}, got {len(out)}/{len(tickers)}")
            break
    return out


# ---------- 미국 시세 ----------
def get_us_prices(tickers):
    if not tickers:
        return {}
    try:
        import yfinance as yf
    except Exception as e:
        print(f"[us] yfinance import fail: {e}", file=sys.stderr)
        return {}
    out = {}
    try:
        data = yf.download(
            tickers=tickers, period="5d", interval="1d",
            group_by="ticker", progress=False, threads=True, auto_adjust=False,
        )
        for t in tickers:
            try:
                close = data["Close"] if len(tickers) == 1 else data[t]["Close"]
                vals = [v for v in close.values[::-1] if v == v]
                if vals:
                    out[t] = float(vals[0])
            except Exception as e:
                print(f"[us] {t}: {e}", file=sys.stderr)
    except Exception as e:
        print(f"[us] bulk fail: {e}", file=sys.stderr)
        for t in tickers:
            try:
                hist = yf.Ticker(t).history(period="5d", auto_adjust=False)
                if not hist.empty:
                    out[t] = float(hist["Close"].dropna().iloc[-1])
            except Exception as ee:
                print(f"[us] {t} fallback: {ee}", file=sys.stderr)
    print(f"[us] got {len(out)}/{len(tickers)}")
    return out


# ---------- 네이버 뉴스 ----------
def get_naver_news():
    sources = [
        ("https://finance.naver.com/news/mainnews.naver", "메인 뉴스"),
        ("https://finance.naver.com/news/news_list.naver?mode=LSS2D&section_id=101&section_id2=258", "증권 시황"),
    ]
    out = []
    seen = set()
    headers = {"User-Agent": UA, "Referer": "https://finance.naver.com/"}
    for url, label in sources:
        try:
            r = requests.get(url, headers=headers, timeout=15)
            r.encoding = "euc-kr"
            soup = BeautifulSoup(r.text, "lxml")
            anchors = []
            for sel in [
                "dl.newsList dd.articleSubject a",
                "ul.realtimeNewsList a",
                "ul.newsList a",
                "dl.newsList dd a",
                "td.title a",
            ]:
                anchors = soup.select(sel)
                if anchors:
                    break
            if not anchors:
                anchors = soup.select("a[href*='news_read.naver']") + soup.select("a[href*='n.news.naver.com/mnews/article']")
            for a in anchors[:25]:
                title = a.get_text(strip=True)
                href = a.get("href", "")
                if not title or len(title) < 8 or title in seen:
                    continue
                if href.startswith("/"):
                    href = "https://finance.naver.com" + href
                seen.add(title)
                out.append({"title": title, "url": href, "source": label, "time": kst_now().strftime("%H:%M")})
                if len(out) >= 12:
                    break
            if len(out) >= 12:
                break
        except Exception as e:
            print(f"[news] {url}: {e}", file=sys.stderr)
    print(f"[news] got {len(out)}")
    return out


# ---------- 자동 브리핑 생성 ----------
def generate_daily_brief(prices, fx, news, portfolio_holdings):
    """오늘의 시장 브리핑 마크다운 생성."""
    today_str = kst_today().strftime("%Y-%m-%d")
    weekday = ["월","화","수","목","금","토","일"][kst_today().weekday()]
    fx_str = f"{fx['USDKRW']:.2f}원 ({fx['date']} ECB 기준)" if fx else "조회 실패"

    lines = []
    lines.append(f"# {today_str} ({weekday}) 시장 브리핑")
    lines.append("")
    lines.append(f"> 자동 생성 — {kst_now().strftime('%Y-%m-%d %H:%M KST')}")
    lines.append("")
    lines.append("## 💱 환율")
    lines.append(f"- USD/KRW: **{fx_str}**")
    lines.append("")

    # 보유 종목 시세
    lines.append("## 📊 보유 종목 시세")
    lines.append("")
    kr_lines = []
    us_lines = []
    for h in portfolio_holdings:
        tk = h["ticker"]
        if tk not in prices:
            continue
        cur = prices[tk]
        avg = h.get("avg", 0)
        pct = (cur / avg - 1) * 100 if avg else 0
        sign = "🔴" if pct >= 0 else "🔵"  # 한국식 색상 이모지
        if h.get("ccy") == "USD":
            line = f"- {sign} **{h['name']}** ({tk}): ${cur:,.2f} ({pct:+.2f}%)"
            us_lines.append(line)
        else:
            line = f"- {sign} **{h['name']}** ({tk}): {cur:,.0f}원 ({pct:+.2f}%)"
            kr_lines.append(line)

    if kr_lines:
        lines.append("### 🇰🇷 한국 종목")
        lines.extend(kr_lines)
        lines.append("")
    if us_lines:
        lines.append("### 🇺🇸 미국 종목")
        lines.extend(us_lines)
        lines.append("")
    if not kr_lines and not us_lines:
        lines.append("(시세 데이터 없음 — Actions 첫 실행 또는 데이터 소스 일시 오류)")
        lines.append("")

    # 주요 뉴스
    lines.append("## 📰 네이버 금융 주요 뉴스")
    lines.append("")
    if news:
        for i, n in enumerate(news[:8], 1):
            lines.append(f"{i}. [{n['title']}]({n['url']})")
        lines.append("")
    else:
        lines.append("뉴스 수집 실패 — 다음 시간에 재시도")
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("> 이 브리핑은 GitHub Actions가 매시간 자동 생성합니다. 더 깊은 분석이 필요하시면 채팅으로 \"오늘 시장 분석해줘\" 요청하세요.")

    snippet = f"환율 {fx['USDKRW']:.0f}원" if fx else ""
    if news:
        snippet += f" · 주요뉴스 {len(news)}건"
    snippet += f" · 보유종목 시세 {len(prices)}/{len(portfolio_holdings)}"

    return "\n".join(lines), snippet


def generate_daily_pick(prices, news, portfolio_holdings):
    """오늘의 데일리 픽 — 보유 종목 중 큰 변동 종목 + 키워드 뉴스 매칭."""
    today_str = kst_today().strftime("%Y-%m-%d")

    movers = []
    for h in portfolio_holdings:
        tk = h["ticker"]
        if tk not in prices or not h.get("avg"):
            continue
        pct = (prices[tk] / h["avg"] - 1) * 100
        movers.append((pct, h, prices[tk]))
    movers.sort(key=lambda x: x[0], reverse=True)

    lines = []
    lines.append(f"# {today_str} 오늘의 데일리 픽")
    lines.append("")
    lines.append(f"> 자동 생성 — {kst_now().strftime('%Y-%m-%d %H:%M KST')}")
    lines.append("")

    lines.append("## 🚀 보유 종목 중 상위 상승")
    lines.append("")
    if movers[:3]:
        for pct, h, cur in movers[:3]:
            ccy = "$" if h.get("ccy") == "USD" else "₩"
            avg_fmt = f"{h['avg']:,.2f}" if h.get("ccy") == "USD" else f"{h['avg']:,.0f}"
            cur_fmt = f"{cur:,.2f}" if h.get("ccy") == "USD" else f"{cur:,.0f}"
            lines.append(f"- **{h['name']}** ({h['ticker']}) {pct:+.2f}% — 평단 {ccy}{avg_fmt} → 현재 {ccy}{cur_fmt}")
            if h.get("theme"):
                lines.append(f"  - 테마: {h['theme']}")
        lines.append("")
    else:
        lines.append("(시세 데이터 부족)")
        lines.append("")

    lines.append("## 📉 보유 종목 중 큰 하락")
    lines.append("")
    bottom = sorted(movers, key=lambda x: x[0])[:3]
    if bottom:
        for pct, h, cur in bottom:
            if pct >= 0:
                continue
            ccy = "$" if h.get("ccy") == "USD" else "₩"
            cur_fmt = f"{cur:,.2f}" if h.get("ccy") == "USD" else f"{cur:,.0f}"
            lines.append(f"- **{h['name']}** ({h['ticker']}) {pct:+.2f}% — 현재 {ccy}{cur_fmt}")
            if h.get("theme"):
                lines.append(f"  - 테마: {h['theme']}")
        lines.append("")

    # 키워드 매칭: 뉴스 헤드라인에 보유 종목명·테마 키워드 포함된 것 찾기
    lines.append("## 🔍 보유 종목 관련 뉴스")
    lines.append("")
    keywords = set()
    for h in portfolio_holdings:
        keywords.add(h["name"])
        if h.get("theme"):
            for t in re.split(r"[·,/ ]+", h["theme"]):
                if len(t) >= 2:
                    keywords.add(t)
    matched = []
    for n in news:
        for kw in keywords:
            if kw and kw in n["title"]:
                matched.append((kw, n))
                break
    if matched:
        for kw, n in matched[:6]:
            lines.append(f"- **[{kw}]** [{n['title']}]({n['url']})")
        lines.append("")
    else:
        lines.append("(키워드 매칭 뉴스 없음)")
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("> 단기(1~7일) 관점. 손절선을 정해두고 진입하세요. 더 깊은 분석은 채팅으로 \"이 종목 자세히 봐줘\" 요청.")

    snippet_parts = []
    if movers[:1]:
        snippet_parts.append(f"최대 상승 {movers[0][1]['name']} {movers[0][0]:+.2f}%")
    if bottom and bottom[0][0] < 0:
        snippet_parts.append(f"최대 하락 {bottom[0][1]['name']} {bottom[0][0]:+.2f}%")
    snippet_parts.append(f"관련 뉴스 {len(matched)}건")
    snippet = " · ".join(snippet_parts) or "데이터 부족"

    return "\n".join(lines), snippet


def update_index_json(idx_path, date_str, title, file_name, snippet):
    """index.json에 새 항목 추가/갱신. 같은 날짜는 덮어쓰기."""
    items = []
    if idx_path.exists():
        try:
            items = json.loads(idx_path.read_text(encoding="utf-8"))
        except Exception:
            items = []
    # 같은 날짜 제거
    items = [it for it in items if it.get("date") != date_str]
    # 새로 추가
    items.append({
        "date": date_str,
        "title": title,
        "file": file_name,
        "snippet": snippet,
    })
    # 최신순 정렬
    items.sort(key=lambda x: x.get("date", ""), reverse=True)
    # 최근 30일만 유지
    items = items[:30]
    idx_path.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[index] updated {idx_path} ({len(items)} entries)")


# ---------- 메인 ----------
def main():
    if not PORTFOLIO_PATH.exists():
        print("portfolio.json missing")
        sys.exit(1)
    portfolio = json.loads(PORTFOLIO_PATH.read_text(encoding="utf-8"))
    holdings = portfolio.get("holdings", [])
    kr_tickers = [h["ticker"] for h in holdings if h.get("market") == "KR"]
    us_tickers = [h["ticker"] for h in holdings if h.get("market") == "US"]

    print(f"보유: KR={len(kr_tickers)}, US={len(us_tickers)}")

    fx = get_fx()
    kr_prices = get_kr_prices(kr_tickers)
    us_prices = get_us_prices(us_tickers)
    news = get_naver_news()
    prices = {**kr_prices, **us_prices}

    # ----- prices.json -----
    PRICES_OUT.write_text(json.dumps({
        "updated": now_iso(),
        "updated_kst": kst_now().isoformat(timespec="seconds"),
        "fx": fx,
        "prices": prices,
        "stats": {"kr_total": len(kr_tickers), "kr_fetched": len(kr_prices),
                  "us_total": len(us_tickers), "us_fetched": len(us_prices)},
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"prices.json: {len(prices)} prices")

    # ----- news.json -----
    NEWS_OUT.write_text(json.dumps({
        "updated": now_iso(),
        "updated_kst": kst_now().isoformat(timespec="seconds"),
        "source": "naver-finance",
        "items": news,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"news.json: {len(news)} items")

    # ----- 일일 브리핑 -----
    BRIEF_DIR.mkdir(parents=True, exist_ok=True)
    today_str = kst_today().strftime("%Y-%m-%d")
    weekday = ["월","화","수","목","금","토","일"][kst_today().weekday()]
    brief_md, brief_snip = generate_daily_brief(prices, fx, news, holdings)
    brief_file = f"{today_str}.md"
    (BRIEF_DIR / brief_file).write_text(brief_md, encoding="utf-8")
    update_index_json(
        BRIEF_DIR / "index.json",
        today_str,
        f"{today_str} ({weekday}) 시장 브리핑",
        brief_file,
        brief_snip,
    )
    print(f"브리핑 생성: {brief_file}")

    # ----- 데일리 픽 -----
    DAILY_PICK_DIR.mkdir(parents=True, exist_ok=True)
    pick_md, pick_snip = generate_daily_pick(prices, news, holdings)
    pick_file = f"{today_str}.md"
    (DAILY_PICK_DIR / pick_file).write_text(pick_md, encoding="utf-8")
    update_index_json(
        DAILY_PICK_DIR / "index.json",
        today_str,
        f"{today_str} 오늘의 데일리 픽",
        pick_file,
        pick_snip,
    )
    print(f"데일리 픽 생성: {pick_file}")

    print("Done.")


if __name__ == "__main__":
    main()
