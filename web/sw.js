/* 智学题库网页版 · 离线缓存（作者：十三、chen_pi）
   弱网、断网也能打开、接着做题：界面和题库第一次打开时存进浏览器，之后从缓存里读；图片看过一次就存下来。
   做题记录本来就存在浏览器里（local.js），联网后自动上传；同步请求（/v1/）不经过这里。
   web/build_web.py 生成时把 __V__ 换成内容版本，__FILES__ 换成要预先存的文件。 */
const V = '__V__';
const CACHE = 'zx-web-' + V;
const MEDIA = 'zx-web-media';
const FILES = __FILES__;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(k => k.indexOf('zx-web-') === 0 && k !== CACHE && k !== MEDIA)
    .map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// 网络最多等 ms 毫秒，等不到（或失败）就用缓存
function netFirst(req, ms) {
  return caches.open(CACHE).then(c => new Promise(resolve => {
    let done = false;
    const fallback = () => c.match(req, { ignoreSearch: true }).then(r => { if (r && !done) { done = true; resolve(r); } return r; });
    const t = setTimeout(fallback, ms);
    fetch(req).then(r => {
      clearTimeout(t);
      if (r.ok) c.put(req, r.clone());
      if (!done) { done = true; resolve(r); }
    }).catch(() => {
      clearTimeout(t);
      fallback().then(r => { if (!done) { done = true; resolve(r || new Response('网络连不上', { status: 503 })); } });
    });
  }));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const base = self.registration.scope.replace(location.origin, '');      // /web/
  if (url.pathname.indexOf(base) !== 0) return;                            // /v1/ 同步请求不管
  const rel = url.pathname.slice(base.length);
  if (req.mode === 'navigate' || rel === '' || rel === 'index.html') {
    e.respondWith(netFirst(req, 4000));                                    // 页面：优先拿新的，网太慢 4 秒就先用存的
  } else if (rel === 'content.json') {
    e.respondWith(fetch(req).catch(() => caches.match(req, { ignoreSearch: true })));
  } else if (rel.indexOf('media/') === 0) {
    e.respondWith(caches.open(MEDIA).then(c => c.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok) c.put(req, r.clone());
      return r;
    }))));
  } else {
    // js / css / 题库：地址带 ?v=版本，同一个地址内容不会变，有就直接用
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
      return r;
    })));
  }
});
