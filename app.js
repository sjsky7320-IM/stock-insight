/* Stock Insight PWA — main logic */
"use strict";

const state = {
  page: "home",
  portfolio: null,
  briefings: [],
  picks: [],
  voices: [],
  selectedVoice: null,
  rate: 1.0,
  pitch: 1.0,
  prices: {},
  fx: 1380,
  marketFilter: "ALL"
};

const LS_PORTFOLIO = "stockinsight_portfolio_custom";

const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
const fmt = (n, d=0) => isFinite(n) ? n.toLocaleString("ko-KR", {minimumFractionDigits:d, maximumFractionDigits:d}) : "—";
const fmt2 = n => fmt(n, 2);
const signClass = n => n > 0 ? "pos" : (n < 0 ? "neg" : "");

function todayStr() {
  const d = new Date();
  const days = ["일","월","화","수","목","금","토"];
  return `${d.getFullYear()}년 ${String(d.getMonth()+1).padStart(2,"0")}월 ${String(d.getDate()).padStart(2,"0")}일 (${days[d.getDay()]})`;
}

/* ========== 마크다운 → HTML ========== */
function md2html(md) {
  if (!md) return "";
  let html = md.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  html = html.replace(/^### (.*)$/gm,"<h3>$1</h3>");
  html = html.replace(/^## (.*)$/gm,"<h2>$1</h2>");
  html = html.replace(/^# (.*)$/gm,"<h1>$1</h1>");
  html = html.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g,"<em>$1</em>");
  html = html.replace(/`([^`]+)`/g,"<code>$1</code>");
  html = html.replace(/^&gt; (.*)$/gm,"<blockquote>$1</blockquote>");
  html = html.replace(/(^|\n)(- .+(?:\n- .+)*)/g, (m,p1,body) => {
    const items = body.split(/\n/).map(l => l.replace(/^- /,"")).map(t => `<li>${t}</li>`).join("");
    return p1 + `<ul>${items}</ul>`;
  });
  html = html.replace(/(^|\n)(\d+\. .+(?:\n\d+\. .+)*)/g, (m,p1,body) => {
    const items = body.split(/\n/).map(l => l.replace(/^\d+\. /,"")).map(t => `<li>${t}</li>`).join("");
    return p1 + `<ol>${items}</ol>`;
  });
  html = html.replace(/((?:\|[^\n]+\|\n)+)/g, (m) => {
    const lines = m.trim().split("\n");
    if (lines.length < 2) return m;
    const header = lines[0].split("|").slice(1,-1).map(s=>s.trim());
    const align = lines[1];
    if (!/^\|?[\s\-:|]+\|?$/.test(align)) return m;
    const rows = lines.slice(2).map(l => l.split("|").slice(1,-1).map(s=>s.trim()));
    let t = "<table><thead><tr>" + header.map(h=>`<th>${h}</th>`).join("") + "</tr></thead><tbody>";
    rows.forEach(r => t += "<tr>" + r.map(c=>`<td>${c}</td>`).join("") + "</tr>");
    t += "</tbody></table>";
    return t;
  });
  html = html.split(/\n{2,}/).map(p => {
    if (/^<(h\d|ul|ol|blockquote|table|pre)/.test(p.trim())) return p;
    return `<p>${p.replace(/\n/g,"<br>")}</p>`;
  }).join("\n");
  return html;
}

function stripMd(s) {
  return (s || "").replace(/[#*`>\-|]/g,"").replace(/\n+/g," ").replace(/\s+/g," ");
}

/* ========== 라우팅 ========== */
function navigate(page) {
  state.page = page;
  $$(".page").forEach(p => p.classList.toggle("hidden", p.dataset.page !== page));
  $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.nav === page));
  const titles = {
    home: ["홈","시장 인사이트"],
    briefings: ["브리핑","매일 시장 요약"],
    portfolio: ["포트폴리오","보유 종목 현황"],
    picks: ["주도주","발굴 리포트"],
    settings: ["설정","음성·데이터"]
  };
  const [t, s] = titles[page] || ["",""];
  $("#topTitle").textContent = t;
  $("#topSub").textContent = s;
  $("#briefingDetail").classList.add("hidden");
  $("#briefingList").classList.remove("hidden");
  $("#pickDetail").classList.add("hidden");
  $("#pickList").classList.remove("hidden");
  window.scrollTo(0, 0);
  stopSpeech();
}

document.addEventListener("click", e => {
  const navBtn = e.target.closest("[data-nav]");
  if (navBtn) { navigate(navBtn.dataset.nav); return; }
});

/* ========== 데이터 로드 ========== */
async function fetchJSON(url) {
  const r = await fetch(url + "?t=" + Date.now(), { cache: "no-store" });
  if (!r.ok) throw new Error("Failed " + url);
  return await r.json();
}
async function fetchText(url) {
  const r = await fetch(url + "?t=" + Date.now(), { cache: "no-store" });
  if (!r.ok) throw new Error("Failed " + url);
  return await r.text();
}

async function loadPortfolio() {
  const local = localStorage.getItem(LS_PORTFOLIO);
  if (local) {
    try {
      const parsed = JSON.parse(local);
      if (parsed && Array.isArray(parsed.holdings)) {
        state.portfolio = parsed;
        return;
      }
    } catch (e) { console.warn("local portfolio parse fail", e); }
  }
  try {
    state.portfolio = await fetchJSON("./data/portfolio.json");
  } catch (e) {
    console.warn("portfolio.json missing", e);
    state.portfolio = { holdings: [] };
  }
}

async function loadBriefings() {
  try {
    const idx = await fetchJSON("./data/briefings/index.json");
    const items = await Promise.all(idx.map(async meta => {
      const body = await fetchText("./data/briefings/" + meta.file);
      return Object.assign({}, meta, { body });
    }));
    state.briefings = items.sort((a,b) => b.date.localeCompare(a.date));
  } catch (e) { console.warn("briefings missing", e); state.briefings = []; }
}

async function loadPicks() {
  try {
    const idx = await fetchJSON("./data/picks/index.json");
    const items = await Promise.all(idx.map(async meta => {
      const body = await fetchText("./data/picks/" + meta.file);
      return Object.assign({}, meta, { body });
    }));
    state.picks = items.sort((a,b) => b.date.localeCompare(a.date));
  } catch (e) { console.warn("picks missing", e); state.picks = []; }
}

async function loadAll() {
  await Promise.all([loadPortfolio(), loadBriefings(), loadPicks()]);
  renderAll();
}

async function refreshContent(which) {
  which = which || "all";
  if (typeof caches !== "undefined") {
    try {
      const keys = await caches.keys();
      for (const k of keys) {
        const c = await caches.open(k);
        const reqs = await c.keys();
        for (const r of reqs) {
          if (r.url.includes("/data/")) await c.delete(r);
        }
      }
    } catch (e) { console.warn(e); }
  }
  if (which === "all" || which === "briefings") await loadBriefings();
  if (which === "all" || which === "picks") await loadPicks();
  renderHome();
  if (which === "all" || which === "briefings") renderBriefings();
  if (which === "all" || which === "picks") renderPicks();
}

/* ========== 렌더링: 홈 ========== */
function renderHome() {
  $("#todayDate").textContent = todayStr();
  const lastBrief = state.briefings[0];
  if (lastBrief) {
    $("#homeBriefTitle").textContent = lastBrief.title || (lastBrief.date + " 브리핑");
    $("#homeBriefBody").textContent = lastBrief.snippet || stripMd(lastBrief.body).slice(0,220) + "…";
  } else {
    $("#homeBriefTitle").textContent = "브리핑이 아직 없습니다";
    $("#homeBriefBody").textContent = "매일 오전 8시에 자동 생성됩니다.";
  }
  const lastPick = state.picks[0];
  if (lastPick) {
    $("#homePickTitle").textContent = lastPick.title || (lastPick.date + " 주도주");
    $("#homePickBody").textContent = lastPick.snippet || stripMd(lastPick.body).slice(0,220) + "…";
  } else {
    $("#homePickTitle").textContent = "리포트가 아직 없습니다";
    $("#homePickBody").textContent = "매주 일요일 저녁 자동 생성됩니다.";
  }
}

/* ========== 렌더링: 브리핑 ========== */
function renderBriefings() {
  const list = $("#briefingList");
  list.innerHTML = "";
  if (state.briefings.length === 0) {
    list.innerHTML = '<div class="hint">아직 등록된 브리핑이 없습니다.</div>';
    return;
  }
  state.briefings.forEach(b => {
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML =
      '<div style="flex:1; min-width:0">' +
        '<div class="list-item-date">' + b.date + '</div>' +
        '<div class="list-item-title">' + (b.title || "시장 브리핑") + '</div>' +
        '<div class="list-item-snip">' + (b.snippet || stripMd(b.body).slice(0,100)) + '</div>' +
      '</div>' +
      '<div class="list-item-arrow">›</div>';
    item.addEventListener("click", () => openBriefing(b));
    list.appendChild(item);
  });
}
function openBriefing(b) {
  $("#briefingList").classList.add("hidden");
  $("#briefingDetail").classList.remove("hidden");
  $("#briefDetailTitle").textContent = b.date + " · " + (b.title || "시장 브리핑");
  $("#briefDetailBody").innerHTML = md2html(b.body);
}
$("#briefBack").addEventListener("click", () => {
  $("#briefingList").classList.remove("hidden");
  $("#briefingDetail").classList.add("hidden");
  stopSpeech();
});

/* ========== 렌더링: 주도주 ========== */
function renderPicks() {
  const list = $("#pickList");
  list.innerHTML = "";
  if (state.picks.length === 0) {
    list.innerHTML = '<div class="hint">아직 주도주 리포트가 없습니다.</div>';
    return;
  }
  state.picks.forEach(p => {
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML =
      '<div style="flex:1; min-width:0">' +
        '<div class="list-item-date">' + p.date + '</div>' +
        '<div class="list-item-title">' + (p.title || "주도주 리포트") + '</div>' +
        '<div class="list-item-snip">' + (p.snippet || stripMd(p.body).slice(0,100)) + '</div>' +
      '</div>' +
      '<div class="list-item-arrow">›</div>';
    item.addEventListener("click", () => openPick(p));
    list.appendChild(item);
  });
}
function openPick(p) {
  $("#pickList").classList.add("hidden");
  $("#pickDetail").classList.remove("hidden");
  $("#pickDetailTitle").textContent = p.date + " · " + (p.title || "주도주 리포트");
  $("#pickDetailBody").innerHTML = md2html(p.body);
}
$("#pickBack").addEventListener("click", () => {
  $("#pickList").classList.remove("hidden");
  $("#pickDetail").classList.add("hidden");
  stopSpeech();
});

/* ========== 렌더링: 포트폴리오 ========== */
function renderPortfolio() {
  if (!state.portfolio || !state.portfolio.holdings) return;
  const holdings = state.portfolio.holdings;
  $("#cntAll").textContent = holdings.length;
  $("#cntKR").textContent = holdings.filter(h => h.market === "KR").length;
  $("#cntUS").textContent = holdings.filter(h => h.market === "US").length;

  const list = $("#holdingsList");
  list.innerHTML = "";
  const visible = holdings.filter(h => state.marketFilter === "ALL" || h.market === state.marketFilter);
  if (visible.length === 0) {
    list.innerHTML = '<div class="hint" style="padding:20px; text-align:center">표시할 종목이 없습니다.<br>"＋ 종목 추가"를 눌러 등록하세요.</div>';
    computeSummary();
    return;
  }

  visible.forEach(h => {
    const cost = h.qty * h.avg;
    const userPrice = state.prices[h.ticker];
    const evalVal = userPrice ? h.qty * userPrice : null;
    const plPct = userPrice ? (userPrice / h.avg - 1) * 100 : null;
    const ccy = h.ccy === "USD" ? "$" : "₩";
    const mkTag = h.market === "KR" ? "🇰🇷" : "🇺🇸";
    const div = document.createElement("div");
    div.className = "hold";
    div.innerHTML =
      '<div class="hold-actions">' +
        '<button class="hold-act edit" data-edit="' + h.ticker + '">수정</button>' +
        '<button class="hold-act del" data-del="' + h.ticker + '">삭제</button>' +
      '</div>' +
      '<div class="hold-head">' +
        '<div>' +
          '<span class="hold-name">' + mkTag + ' ' + h.name + '</span>' +
          '<span class="hold-ticker">' + h.ticker + '</span>' +
          '<div class="hold-theme">' + (h.theme || "") + '</div>' +
        '</div>' +
        '<div class="hold-pl ' + signClass(plPct) + '">' +
          (plPct == null ? "—" : (plPct >= 0 ? "+" : "") + plPct.toFixed(2) + "%") +
        '</div>' +
      '</div>' +
      '<div class="hold-body">' +
        '<div><div class="lbl">수량</div><div class="val">' + fmt(h.qty) + '</div></div>' +
        '<div><div class="lbl">평단</div><div class="val">' + ccy + (h.ccy==="USD"?fmt2(h.avg):fmt(h.avg)) + '</div></div>' +
        '<div><div class="lbl">매수금액</div><div class="val">' + ccy + (h.ccy==="USD"?fmt2(cost):fmt(cost)) + '</div></div>' +
        '<div class="hold-price"><div class="lbl">현재가</div>' +
          '<input type="number" inputmode="decimal" data-ticker="' + h.ticker + '" value="' + (userPrice == null ? "" : userPrice) + '" placeholder="' + ccy + '—">' +
        '</div>' +
        '<div><div class="lbl">평가금액</div><div class="val">' +
          (evalVal == null ? "—" : ccy + (h.ccy==="USD"?fmt2(evalVal):fmt(evalVal))) +
        '</div></div>' +
        '<div><div class="lbl">손익</div><div class="val ' + signClass(plPct) + '">' +
          (evalVal == null ? "—" : (evalVal-cost>=0?"+":"") + (h.ccy==="USD"?fmt2(evalVal-cost):fmt(evalVal-cost))) +
        '</div></div>' +
      '</div>';
    list.appendChild(div);
  });

  $$("input[data-ticker]").forEach(inp => {
    inp.addEventListener("input", () => {
      const v = parseFloat(inp.value);
      if (isFinite(v) && v > 0) state.prices[inp.dataset.ticker] = v;
      else delete state.prices[inp.dataset.ticker];
      computeSummary();
    });
  });
  $$("button[data-edit]").forEach(btn => btn.addEventListener("click", () => openHoldingModal(btn.dataset.edit)));
  $$("button[data-del]").forEach(btn => btn.addEventListener("click", () => deleteHolding(btn.dataset.del)));

  computeSummary();
}

function computeSummary() {
  if (!state.portfolio) return;
  let costKRW = 0, evalKRW = 0;
  state.portfolio.holdings.forEach(h => {
    const cost = h.qty * h.avg;
    const ck = h.ccy === "KRW" ? cost : cost * state.fx;
    costKRW += ck;
    const p = state.prices[h.ticker];
    if (p) {
      const v = h.qty * p;
      evalKRW += h.ccy === "KRW" ? v : v * state.fx;
    }
  });
  $("#psCost").textContent = "₩" + fmt(Math.round(costKRW));
  $("#kpiCost").textContent = fmt(Math.round(costKRW));
  if (evalKRW > 0) {
    $("#psEval").textContent = "₩" + fmt(Math.round(evalKRW));
    $("#kpiEval").textContent = fmt(Math.round(evalKRW));
    const pl = evalKRW - costKRW;
    const plPct = pl / costKRW * 100;
    const psPL = $("#psPL"), kpiPL = $("#kpiPL"), kpiPLPct = $("#kpiPLPct");
    const sign = pl >= 0 ? "+" : "";
    psPL.textContent = sign + "₩" + fmt(Math.round(pl)) + " (" + sign + plPct.toFixed(2) + "%)";
    psPL.className = "ps-row strong " + signClass(pl);
    kpiPL.textContent = sign + fmt(Math.round(pl));
    kpiPL.className = "kpi-val " + signClass(pl);
    kpiPLPct.textContent = sign + plPct.toFixed(2) + "%";
  } else {
    $("#psEval").textContent = "—";
    $("#kpiEval").textContent = "—";
    $("#psPL").innerHTML = "<span>평가손익</span><span>—</span>";
    $("#kpiPL").textContent = "—";
    $("#kpiPLPct").textContent = "현재가 입력 시";
  }
  $("#kpiCount").textContent = state.portfolio.holdings.length;
}

/* ========== 시장 탭 / FX ========== */
$$(".mt-btn").forEach(b => b.addEventListener("click", () => {
  $$(".mt-btn").forEach(x => x.classList.toggle("active", x === b));
  state.marketFilter = b.dataset.market;
  renderPortfolio();
}));

$("#fxInput").addEventListener("change", () => {
  state.fx = parseFloat($("#fxInput").value) || 1380;
  renderPortfolio();
});
$("#saveFx").addEventListener("click", () => {
  localStorage.setItem("stockinsight_state", JSON.stringify({fx: state.fx, prices: state.prices}));
  alert("환율·현재가 저장 완료");
});
$("#loadPrices").addEventListener("click", loadPersistedState);

function loadPersistedState() {
  const raw = localStorage.getItem("stockinsight_state");
  if (!raw) return;
  try {
    const obj = JSON.parse(raw);
    state.fx = obj.fx || 1380;
    state.prices = obj.prices || {};
    $("#fxInput").value = state.fx;
    renderPortfolio();
  } catch (e) { console.warn(e); }
}

/* ========== 포트폴리오 CRUD ========== */
function savePortfolioToLocal() {
  localStorage.setItem(LS_PORTFOLIO, JSON.stringify(state.portfolio));
}

function openHoldingModal(editTicker) {
  const modal = $("#holdingModal");
  const form = $("#holdingForm");
  form.reset();
  $("#hf_origTicker").value = "";
  if (editTicker) {
    const h = state.portfolio.holdings.find(x => x.ticker === editTicker);
    if (!h) return;
    $("#modalTitle").textContent = "종목 수정";
    $("#hf_origTicker").value = h.ticker;
    $("#hf_name").value = h.name;
    $("#hf_ticker").value = h.ticker;
    $("#hf_qty").value = h.qty;
    $("#hf_avg").value = h.avg;
    $("#hf_theme").value = h.theme || "";
    const mkInp = document.querySelector('input[name="hf_market"][value="' + h.market + '"]');
    if (mkInp) mkInp.checked = true;
    const ccyInp = document.querySelector('input[name="hf_ccy"][value="' + h.ccy + '"]');
    if (ccyInp) ccyInp.checked = true;
  } else {
    $("#modalTitle").textContent = "종목 추가";
  }
  modal.classList.remove("hidden");
}

function closeModals() {
  $("#holdingModal").classList.add("hidden");
  $("#exportModal").classList.add("hidden");
}

$$("[data-close-modal]").forEach(el => el.addEventListener("click", closeModals));
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModals(); });

$$('input[name="hf_market"]').forEach(r => r.addEventListener("change", () => {
  const mk = document.querySelector('input[name="hf_market"]:checked').value;
  const want = mk === "KR" ? "KRW" : "USD";
  const tgt = document.querySelector('input[name="hf_ccy"][value="' + want + '"]');
  if (tgt) tgt.checked = true;
}));

$("#holdingForm").addEventListener("submit", e => {
  e.preventDefault();
  const orig = $("#hf_origTicker").value.trim();
  const market = document.querySelector('input[name="hf_market"]:checked').value;
  const ccy = document.querySelector('input[name="hf_ccy"]:checked').value;
  const newH = {
    market: market,
    name: $("#hf_name").value.trim(),
    ticker: $("#hf_ticker").value.trim(),
    qty: parseFloat($("#hf_qty").value),
    avg: parseFloat($("#hf_avg").value),
    ccy: ccy,
    theme: $("#hf_theme").value.trim() || ""
  };
  if (!newH.name || !newH.ticker || !isFinite(newH.qty) || !isFinite(newH.avg)) {
    alert("필수 항목을 모두 입력하세요.");
    return;
  }
  const list = state.portfolio.holdings;
  if (orig) {
    const idx = list.findIndex(h => h.ticker === orig);
    if (idx < 0) return;
    list[idx] = newH;
  } else {
    const dup = list.findIndex(h => h.ticker === newH.ticker);
    if (dup >= 0) {
      if (!confirm("티커 " + newH.ticker + "가 이미 있습니다. 기존 항목을 덮어쓸까요?")) return;
      list[dup] = newH;
    } else {
      list.push(newH);
    }
  }
  savePortfolioToLocal();
  closeModals();
  renderPortfolio();
});

function deleteHolding(ticker) {
  const h = state.portfolio.holdings.find(x => x.ticker === ticker);
  if (!h) return;
  if (!confirm(h.name + " (" + ticker + ") 종목을 삭제할까요?")) return;
  state.portfolio.holdings = state.portfolio.holdings.filter(x => x.ticker !== ticker);
  delete state.prices[ticker];
  savePortfolioToLocal();
  renderPortfolio();
}

$("#addHoldingBtn").addEventListener("click", () => openHoldingModal(null));

$("#exportPortfolio").addEventListener("click", () => {
  const json = JSON.stringify({
    updated: new Date().toISOString().slice(0,10),
    holdings: state.portfolio.holdings
  }, null, 2);
  $("#exportArea").value = json;
  $("#exportModal").classList.remove("hidden");
});
$("#copyExportBtn").addEventListener("click", async () => {
  const txt = $("#exportArea").value;
  try {
    await navigator.clipboard.writeText(txt);
    alert("클립보드에 복사됐습니다");
  } catch (e) {
    $("#exportArea").select();
    document.execCommand("copy");
    alert("복사됨 (수동 모드)");
  }
});

$("#resetPortfolio").addEventListener("click", async () => {
  if (!confirm("로컬에서 변경한 종목 정보를 모두 지우고 원본 데이터로 되돌릴까요?")) return;
  localStorage.removeItem(LS_PORTFOLIO);
  try {
    state.portfolio = await fetchJSON("./data/portfolio.json");
  } catch (e) {
    state.portfolio = { holdings: [] };
  }
  renderPortfolio();
});

/* ========== 새로고침 버튼 ========== */
function spinOn(btn) { btn.classList.add("spinning"); }
function spinOff(btn) { setTimeout(() => btn.classList.remove("spinning"), 400); }
$("#refreshHome").addEventListener("click", async () => {
  spinOn($("#refreshHome"));
  await refreshContent("all");
  spinOff($("#refreshHome"));
});
$("#refreshBriefings").addEventListener("click", async () => {
  spinOn($("#refreshBriefings"));
  await refreshContent("briefings");
  spinOff($("#refreshBriefings"));
});
$("#refreshPicks").addEventListener("click", async () => {
  spinOn($("#refreshPicks"));
  await refreshContent("picks");
  spinOff($("#refreshPicks"));
});

/* ========== TTS ========== */
function loadVoices() {
  state.voices = speechSynthesis.getVoices();
  const sel = $("#voiceSelect");
  if (!sel) return;
  sel.innerHTML = "";
  const koVoices = state.voices.filter(v => v.lang && v.lang.toLowerCase().startsWith("ko"));
  const others = state.voices.filter(v => !v.lang || !v.lang.toLowerCase().startsWith("ko"));
  [...koVoices, ...others].forEach(v => {
    const opt = document.createElement("option");
    opt.value = v.name;
    opt.textContent = v.name + " (" + v.lang + ")";
    sel.appendChild(opt);
  });
  const saved = localStorage.getItem("stockinsight_voice");
  if (saved && state.voices.find(v => v.name === saved)) {
    sel.value = saved;
    state.selectedVoice = state.voices.find(v => v.name === saved);
  } else if (koVoices.length) {
    sel.value = koVoices[0].name;
    state.selectedVoice = koVoices[0];
  } else if (state.voices.length) {
    state.selectedVoice = state.voices[0];
  }
}
if (typeof speechSynthesis !== "undefined") {
  speechSynthesis.addEventListener("voiceschanged", loadVoices);
}

function speakText(text) {
  if (!("speechSynthesis" in window)) {
    alert("이 브라우저는 음성 합성을 지원하지 않습니다.");
    return;
  }
  speechSynthesis.cancel();
  if (!text || !text.trim()) return;
  const chunks = text.match(/[\s\S]{1,180}(?:[.!?。\n]|$)/g) || [text];
  let idx = 0;
  showTTSBar(true);
  const playNext = () => {
    if (idx >= chunks.length) { showTTSBar(false); markSpeaking(null); return; }
    const utter = new SpeechSynthesisUtterance(chunks[idx]);
    if (state.selectedVoice) utter.voice = state.selectedVoice;
    utter.lang = (state.selectedVoice && state.selectedVoice.lang) || "ko-KR";
    utter.rate = state.rate;
    utter.pitch = state.pitch;
    utter.onend = () => { idx++; playNext(); };
    utter.onerror = () => { idx++; playNext(); };
    speechSynthesis.speak(utter);
  };
  playNext();
}

function stopSpeech() {
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  showTTSBar(false);
  markSpeaking(null);
}

function showTTSBar(show) {
  $("#ttsBar").classList.toggle("hidden", !show);
  $("#ttsPlayPause").textContent = "⏸";
}

function markSpeaking(btn) {
  $$(".speak-btn").forEach(b => {
    if (b !== btn) {
      b.classList.remove("speaking");
      if (b.dataset.origLabel) b.textContent = b.dataset.origLabel;
      delete b.dataset.speedIdx;
    }
  });
  if (btn) btn.classList.add("speaking");
}

/* === 듣기 버튼 속도 순환 1× → 1.5× → 2× → 1× === */
const SPEED_CYCLE = [1.0, 1.5, 2.0];
function applySpeedToBtn(sBtn) {
  const isActive = sBtn.classList.contains("speaking");
  let idx = parseInt(sBtn.dataset.speedIdx, 10);
  if (!isActive || !isFinite(idx)) idx = -1;
  idx = (idx + 1) % SPEED_CYCLE.length;
  const rate = SPEED_CYCLE[idx];
  sBtn.dataset.speedIdx = String(idx);
  state.rate = rate;
  const ttsRate = $("#ttsRate");
  if (ttsRate) ttsRate.value = rate;
  const ttsRateLabel = $("#ttsRateLabel");
  if (ttsRateLabel) ttsRateLabel.textContent = rate.toFixed(1) + "×";
  if (!sBtn.dataset.origLabel) sBtn.dataset.origLabel = sBtn.textContent.trim();
  const speedLabel = Number.isInteger(rate) ? rate + "×" : rate.toFixed(1) + "×";
  sBtn.textContent = sBtn.dataset.origLabel + " (" + speedLabel + ")";
}

document.addEventListener("click", e => {
  const sBtn = e.target.closest(".speak-btn");
  if (!sBtn) return;
  applySpeedToBtn(sBtn);
  markSpeaking(sBtn);
  if (sBtn.id === "speakPortfolio") {
    speakPortfolio();
    return;
  }
  const target = sBtn.dataset.speakTarget;
  if (!target) return;
  const el = document.getElementById(target);
  if (!el) return;
  speakText(el.innerText || el.textContent);
});

function speakPortfolio() {
  if (!state.portfolio) return;
  const lines = [];
  const label = state.marketFilter === "ALL" ? "전체" : (state.marketFilter === "KR" ? "한국" : "미국");
  lines.push("현재 " + label + " 보유 종목 현황입니다.");
  state.portfolio.holdings
    .filter(h => state.marketFilter === "ALL" || h.market === state.marketFilter)
    .forEach(h => {
      const p = state.prices[h.ticker];
      let line = h.name + ", " + fmt(h.qty) + "주, 평단 " + (h.ccy==="USD"?fmt2(h.avg)+"달러":fmt(h.avg)+"원");
      if (p) {
        const plPct = (p/h.avg - 1) * 100;
        const dir = plPct >= 0 ? "상승" : "하락";
        line += ", 현재가 " + (h.ccy==="USD"?fmt2(p)+"달러":fmt(p)+"원") + ", " + Math.abs(plPct).toFixed(2) + "퍼센트 " + dir + ".";
      } else line += ", 현재가 미입력.";
      lines.push(line);
    });
  speakText(lines.join(" "));
}

$("#ttsBtn").addEventListener("click", () => {
  if (speechSynthesis.speaking) { stopSpeech(); return; }
  const active = $(".page:not(.hidden)");
  if (!active) return;
  speakText(active.innerText);
});

$("#ttsPlayPause").addEventListener("click", () => {
  if (speechSynthesis.paused) { speechSynthesis.resume(); $("#ttsPlayPause").textContent = "⏸"; }
  else if (speechSynthesis.speaking) { speechSynthesis.pause(); $("#ttsPlayPause").textContent = "▶"; }
});
$("#ttsStop").addEventListener("click", stopSpeech);
$("#ttsRate").addEventListener("input", () => {
  state.rate = parseFloat($("#ttsRate").value);
  $("#ttsRateLabel").textContent = state.rate.toFixed(1) + "×";
});

/* ========== 설정 ========== */
$("#voiceSelect").addEventListener("change", () => {
  state.selectedVoice = state.voices.find(v => v.name === $("#voiceSelect").value);
  localStorage.setItem("stockinsight_voice", $("#voiceSelect").value);
});
$("#rateSetting").addEventListener("input", () => {
  state.rate = parseFloat($("#rateSetting").value);
  $("#rateSettingLabel").textContent = state.rate.toFixed(1) + "×";
  $("#ttsRate").value = state.rate;
  localStorage.setItem("stockinsight_rate", state.rate);
});
$("#pitchSetting").addEventListener("input", () => {
  state.pitch = parseFloat($("#pitchSetting").value);
  $("#pitchSettingLabel").textContent = state.pitch.toFixed(1);
  localStorage.setItem("stockinsight_pitch", state.pitch);
});
$("#testVoice").addEventListener("click", () => {
  speakText("안녕하세요. 주식 인사이트 음성 테스트입니다. 오늘도 좋은 투자 되세요.");
});
$("#refreshData").addEventListener("click", async () => {
  if (typeof caches !== "undefined") {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  }
  location.reload();
});
$("#clearLocal").addEventListener("click", () => {
  if (confirm("저장된 현재가·환율·설정·포트폴리오 변경 사항을 모두 지울까요?")) {
    localStorage.clear();
    location.reload();
  }
});
$("#settingsBtn").addEventListener("click", () => navigate("settings"));

/* ========== 초기 ========== */
function renderAll() {
  renderHome();
  renderBriefings();
  renderPortfolio();
  renderPicks();
  $("#lastUpdate").textContent = todayStr();
}

function init() {
  const r = parseFloat(localStorage.getItem("stockinsight_rate"));
  if (isFinite(r)) {
    state.rate = r;
    $("#rateSetting").value = r;
    $("#rateSettingLabel").textContent = r.toFixed(1) + "×";
    $("#ttsRate").value = r;
  }
  const p = parseFloat(localStorage.getItem("stockinsight_pitch"));
  if (isFinite(p)) {
    state.pitch = p;
    $("#pitchSetting").value = p;
    $("#pitchSettingLabel").textContent = p.toFixed(1);
  }
  loadVoices();
  loadPersistedState();
  loadAll();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(e => console.warn("SW register fail:", e));
  }
}

init();
