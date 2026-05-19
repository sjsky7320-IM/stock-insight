"""GitHub Actions에서 매시간 실행되는 데이터 수집 스크립트.

수집 대상:
  - 한국 보유 종목 종가/현재가 (pykrx)
  - 미국 보유 종목 종가/현재가 (yfinance)
  - USD→KRW 환율 (frankfurter)
  - 네이버 금융 메인 뉴스

출력:
  - data/prices.json
  - data/news.json
"""

import json
import re
import sys
import time
import html
import traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parent.parent
PORTFOLIO_PATH = ROOT / "data" / "portfolio.json"
PRICES_OUT = ROOT / "data" / "prices.json"
NEWS_OUT = ROOT / "data" / "news.json"

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/121.0 Safari/537.36")


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def kst_now():
    return datetime.now(timezone(timedelta(hours=9)))


# -------- 환율 --------
def get_fx():
    try:
        r = requests.get(
            "https://api.frankfurter.app/latest?from=USD&to=KRW",
            timeout=10,
        )
        r.raise_for_status()
        j = r.json()
        return {"USDKRW": float(j["rates"]["KRW"]), "date": j["date"], "source": "frankfurter"}
    except Exception as e:
        print(f"[fx] error: {e}", file=sys.stderr)
        return None


# -------- 한국 시세 --------
def get_kr_prices(tickers):
    """가능한 가장 최근 거래일의 종가를 반환."""
    if not tickers:
        return {}
    try:
        from pykrx import stock
    except Exception as e:
        print(f"[kr] pykrx import fail: {e}", file=sys.stderr)
        return {}

    out = {}
    today = kst_now().date()
    for delta in range(0, 10):
        d = (today - timedelta(days=delta)).strftime("%Y%m%d")
        try:
            df = stock.get_market_ohlcv(d, market="ALL")
        except Exception as e:
            print(f"[kr] {d} fetch fail: {e}", file=sys.stderr)
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


# -------- 미국 시세 --------
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
            tickers=tickers,
            period="5d",
            interval="1d",
            group_by="ticker",
            progress=False,
            threads=True,
            auto_adjust=False,
        )
        for t in tickers:
            try:
                if len(tickers) == 1:
                    close = data["Close"]
                else:
                    close = data[t]["Close"]
                # 가장 최근의 NaN 아닌 값
                vals = [v for v in close.values[::-1] if v == v]
                if vals:
                    out[t] = float(vals[0])
            except Exception as e:
                print(f"[us] {t}: {e}", file=sys.stderr)
    except Exception as e:
        print(f"[us] bulk download fail: {e}", file=sys.stderr)
        # 폴백: 개별 호출
        for t in tickers:
            try:
                tk = yf.Ticker(t)
                hist = tk.history(period="5d", auto_adjust=False)
                if not hist.empty:
                    out[t] = float(hist["Close"].dropna().iloc[-1])
            except Exception as ee:
                print(f"[us] {t} fallback: {ee}", file=sys.stderr)
    print(f"[us] got {len(out)}/{len(tickers)}")
    return out


# -------- 네이버 금융 뉴스 --------
def get_naver_news():
    """네이버 금융 메인의 주요 뉴스/시황 헤드라인 수집."""
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
            # 다양한 셀렉터 시도
            anchors = []
            for sel in ["dl.newsList dd.articleSubject a", "ul.realtimeNewsList a", "ul.newsList a", "dl.newsList dd a", "td.title a"]:
                anchors = soup.select(sel)
                if anchors:
                    break
            if not anchors:
                # 전체 본문에서 뉴스 링크 패턴 추출
                anchors = soup.select("a[href*='news_read.naver']") + soup.select("a[href*='n.news.naver.com/mnews/article']")

            for a in anchors[:25]:
                title = a.get_text(strip=True)
                href = a.get("href", "")
                if not title or len(title) < 8:
                    continue
                if title in seen:
                    continue
                if href.startswith("/"):
                    href = "https://finance.naver.com" + href
                seen.add(title)
                out.append({
                    "title": title,
                    "url": href,
                    "source": label,
                    "time": kst_now().strftime("%H:%M"),
                })
                if len(out) >= 12:
                    break
            if len(out) >= 12:
                break
        except Exception as e:
            print(f"[news] {url} error: {e}", file=sys.stderr)
            traceback.print_exc()

    print(f"[news] got {len(out)} items")
    return out


# -------- 메인 --------
def main():
    if not PORTFOLIO_PATH.exists():
        print("portfolio.json not found, aborting.")
        sys.exit(1)
    portfolio = json.loads(PORTFOLIO_PATH.read_text(encoding="utf-8"))
    holdings = portfolio.get("holdings", [])
    kr_tickers = [h["ticker"] for h in holdings if h.get("market") == "KR"]
    us_tickers = [h["ticker"] for h in holdings if h.get("market") == "US"]

    print(f"보유 종목: KR={len(kr_tickers)}, US={len(us_tickers)}")
    print(f"KR: {kr_tickers}")
    print(f"US: {us_tickers}")

    fx = get_fx()
    kr_prices = get_kr_prices(kr_tickers)
    us_prices = get_us_prices(us_tickers)
    news = get_naver_news()

    prices = {**kr_prices, **us_prices}

    prices_payload = {
        "updated": now_iso(),
        "updated_kst": kst_now().isoformat(timespec="seconds"),
        "fx": fx,
        "prices": prices,
        "stats": {
            "kr_total": len(kr_tickers),
            "kr_fetched": len(kr_prices),
            "us_total": len(us_tickers),
            "us_fetched": len(us_prices),
        },
    }
    PRICES_OUT.write_text(
        json.dumps(prices_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {PRICES_OUT}: {len(prices)} prices")

    news_payload = {
        "updated": now_iso(),
        "updated_kst": kst_now().isoformat(timespec="seconds"),
        "source": "naver-finance",
        "items": news,
    }
    NEWS_OUT.write_text(
        json.dumps(news_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {NEWS_OUT}: {len(news)} news items")

    print("Done.")


if __name__ == "__main__":
    main()
