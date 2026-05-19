// Stock Insight PWA Service Worker — v1.3.1
// 캐시 이름을 빌드 타임스탬프로 만들어, 새로 배포될 때마다 자동으로 새 캐시를 사용.
// 옛 캐시는 자동 정리.
const VERSION = "1.3.1-2026-05-19T16:00";
const CACHE = "stock-insight-" + VERSION;

const CORE = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", e => {
  // 새 SW 설치 즉시 활성화 — 사용자가 한 번만 새로고침해도 새 버전이 잡힘
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => Promise.all(
      CORE.map(u => c.add(u).catch(err => console.warn("cache add fail", u, err)))
    ))
  );
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    // 옛 캐시 모두 정리
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    // 즉시 모든 클라이언트 제어
    await self.clients.claim();
    // 새 버전 알림
    const all = await self.clients.matchAll({ type: "window" });
    all.forEach(c => c.postMessage({ type: "SW_UPDATED", version: VERSION }));
  })());
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // /data/ — 항상 네트워크 우선 (GitHub Actions가 자주 갱신)
  if (url.pathname.includes("/data/")) {
    e.respondWith(
      fetch(e.request).then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // 앱 셸 — 네트워크 우선, 실패 시 캐시 (구버전 lock 방지)
  e.respondWith(
    fetch(e.request).then(net => {
      // 정상 응답만 캐시
      if (net && net.ok) {
        const copy = net.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return net;
    }).catch(() => caches.match(e.request))
  );
});

// 클라이언트로부터 메시지 받으면 즉시 캐시 비우기
self.addEventListener("message", e => {
  if (e.data && e.data.type === "CLEAR_CACHE") {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});
