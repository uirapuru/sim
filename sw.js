// Service worker of the simulator (author, 20 XI 2026): the app works without the internet once it has been opened
// online. On install every file of the release (files.json, written by tools/deploy/publish_pages.sh) is stored in
// the browser, except the large models of the full graphics, which are stored the first time they are used. A file
// that did not change since the last release (same hash) is copied from the old store instead of downloaded again.
// Requests are answered from the store first; anything missing comes from the network and is stored.
// A new release takes over when all the simulator's tabs have been closed, so a running session never mixes versions.
const RELEASE = "095a71b";
const STORE = "sim-" + RELEASE, META = "__files.json";
const LATER = [/models\/soldier\.glb$/, /models\/instructor\.glb$/];   // full graphics only: stored on first use
const base = self.registration.scope;
const key = url => { const u = new URL(url, base); u.search = ""; u.hash = ""; return u.href; };

async function tell(msg) { for (const c of await self.clients.matchAll({ includeUncontrolled: true })) c.postMessage(msg); }

async function previousStore() {
  for (const name of await caches.keys()) {
    if (!name.startsWith("sim-") || name === STORE) continue;
    const c = await caches.open(name), m = await c.match(key(META));
    if (m) return { c, files: new Map((await m.json()).files.map(f => [f.p, f.h])) };
  }
  return null;
}

self.addEventListener("install", e => e.waitUntil((async () => {
  const list = await (await fetch(new URL("files.json?v=" + RELEASE, base), { cache: "no-store" })).json();
  const store = await caches.open(STORE), old = await previousStore();
  const todo = list.files.filter(f => !LATER.some(r => r.test(f.p)));
  const total = todo.reduce((a, f) => a + f.s, 0); let done = 0;
  const one = async f => {
    const k = key(f.p);
    let r = old && old.files.get(f.p) === f.h ? await old.c.match(k) : null;          // unchanged: reuse
    // the same address the page asks for (?v=release): what the page has just loaded comes from the browser's cache
    if (!r) { r = await fetch(new URL(f.p + "?v=" + RELEASE, base)); if (!r.ok) throw new Error(f.p + " " + r.status); }
    await store.put(k, r); done += f.s; tell({ type: "sw-progress", done, total });
  };
  for (let i = 0; i < todo.length; i += 6) await Promise.all(todo.slice(i, i + 6).map(one));
  await store.put(key(META), new Response(JSON.stringify(list), { headers: { "content-type": "application/json" } }));
})()));

self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith("sim-") && name !== STORE) await caches.delete(name);
  await self.clients.claim();
  tell({ type: "sw-ready", release: RELEASE });
})()));

self.addEventListener("message", e => { if (e.data && e.data.type === "sw-status")
  caches.open(STORE).then(c => c.match(key(META))).then(m => e.source && e.source.postMessage({ type: m ? "sw-ready" : "sw-missing", release: RELEASE })); });

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || !req.url.startsWith(base) || url.pathname.endsWith("/sw.js")) return;
  e.respondWith((async () => {
    const store = await caches.open(STORE);
    const nav = req.mode === "navigate", k = nav && (url.pathname.endsWith("/") || url.pathname.endsWith("/index.html")) ? key("index.html") : key(req.url);
    const hit = await store.match(k);
    if (hit) return hit;
    try {
      const r = await fetch(req);
      if (r.ok && r.status === 200) store.put(k, r.clone());
      return r;
    } catch (err) {
      if (nav) { const page = await store.match(key("index.html")); if (page) return page; }
      throw err;
    }
  })());
});
