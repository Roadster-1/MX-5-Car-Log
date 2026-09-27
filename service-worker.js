/* =========================================================================
 * MX-5 차계부 — 서비스워커 (오프라인 캐싱)
 * 앱 파일(index.html, db.js 등)과 외부 CDN 리소스를 캐싱해서
 * 와이파이/서버 없이도 홈 화면 아이콘으로 바로 열리게 합니다.
 * ========================================================================= */

const CACHE_NAME = "mx5-carlog-v1";

// 최초 설치 시 반드시 캐싱해둘 핵심 파일들 (앱 셸)
const APP_SHELL = [
  "./",
  "./index.html",
  "./db.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // POST 등은 그냥 통과 (어차피 서버 없음)

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          // 같은 출처(same-origin) 또는 CDN/폰트 리소스는 다음을 위해 캐싱
          const cache = caches.open(CACHE_NAME);
          cache.then((c) => c.put(req, res.clone())).catch(() => {});
          return res;
        })
        .catch(() => {
          // 완전 오프라인이고 캐시에도 없을 때: index.html이라도 보여줌
          if (req.mode === "navigate") return caches.match("./index.html");
          return new Response("", { status: 504 });
        });
    })
  );
});
