(() => {
  "use strict";

  const DRAFT_KEY = "villagers-connect-local-draft-v1";
  const DRAFT_DB = "villagers-connect-drafts";
  const CONTENT_URL = new URL("./content.json", document.baseURI);
  const MAX_MEDIA_FILE = 8 * 1024 * 1024;
  const MAX_CONTENT_FILE = 20 * 1024 * 1024;
  const palette = ["#e6744d", "#438170", "#617e99", "#b98549", "#87739c", "#548a86"];
  const seedRoutes = [
    { id: "sample-v5a", line: "V5A", destination: "Okleśna PKP", stops: ["Lwówek Śląski", "Młynka", "Lanckorona", "Lanckorona Wiadukt", "Okleśna PKP"], description: "A gentle run through the valley, with a handy connection at Okleśna PKP.", media: [], created_at: "2026-01-01T09:00:00Z" },
    { id: "sample-12", line: "12", destination: "Village Green", stops: ["Old Mill", "Market Square", "Village Green"], description: "The easy way into the heart of the village.", media: [], created_at: "2026-01-02T09:00:00Z" },
    { id: "sample-7", line: "7", destination: "Hilltop Gardens", stops: ["Riverside", "The Orchard", "Hilltop Gardens"], description: "A scenic climb past the orchard and up to the gardens.", media: [], created_at: "2026-01-03T09:00:00Z" }
  ];
  const seedBuses = [
    { id: "sample-o405n2", model: "O405N2", fleet_number: "", description: "A familiar low-floor workhorse, ready for the longer village roads.", media: [] },
    { id: "sample-7000", model: "7000", fleet_number: "", description: "A bright local favourite with a little extra room for the ride.", media: [] },
    { id: "sample-26004", model: "260.04", fleet_number: "", description: "A nimble single-decker for winding lanes and close-set stops.", media: [] },
    { id: "sample-b951", model: "B951", fleet_number: "", description: "A dependable bus for all the little connections between towns.", media: [] },
    { id: "sample-m101i3", model: "M101I/3", fleet_number: "", description: "A classic shape with a welcoming view of the village outside.", media: [] },
    { id: "sample-7700fl", model: "7700FL", fleet_number: "", description: "A smooth, modern ride for busy days on the local network.", media: [] }
  ];

  const state = {
    page: "home", adminTab: "routes", routes: [...seedRoutes], buses: [...seedBuses],
    dirty: false, search: "", draftRouteId: null, draftBusId: null,
    selectedRouteId: null, published: { routes: [], buses: [] }
  };
  const app = document.getElementById("app-content");

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const cleanMedia = (value) => Array.isArray(value) ? value.filter((item) => item && typeof item.url === "string" && (/^https?:\/\//i.test(item.url) || /^data:(image\/(jpeg|png|webp)|video\/(mp4|webm));base64,/i.test(item.url))) : [];
  const colorFor = (line) => palette[[...String(line)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length];
  const prettyCount = (count) => String(count).padStart(2, "0");
  const stopCount = (route) => Array.isArray(route.stops) ? route.stops.length : 0;

  function normalizedContent(value) {
    const routes = Array.isArray(value?.routes) ? value.routes : seedRoutes;
    const buses = Array.isArray(value?.buses) ? value.buses : seedBuses;
    return {
      routes: routes.map((route, index) => ({ ...route, id: String(route.id || `route-${index + 1}`), line: String(route.line || "?"), destination: String(route.destination || "Untitled route"), stops: Array.isArray(route.stops) ? route.stops.filter((stop) => typeof stop === "string") : [], description: String(route.description || ""), media: cleanMedia(route.media) })),
      buses: buses.map((bus, index) => ({ ...bus, id: String(bus.id || `bus-${index + 1}`), model: String(bus.model || "Bus"), fleet_number: String(bus.fleet_number || ""), description: String(bus.description || ""), media: cleanMedia(bus.media) }))
    };
  }

  function openDraftDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("Local draft storage is unavailable in this browser."));
      const request = indexedDB.open(DRAFT_DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("drafts");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function readLocalDraft() {
    try {
      const db = await openDraftDb();
      const draft = await new Promise((resolve, reject) => {
        const request = db.transaction("drafts", "readonly").objectStore("drafts").get("current");
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return draft ? normalizedContent(draft) : null;
    } catch (_) {
      try {
        const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
        return draft ? normalizedContent(draft) : null;
      } catch (_) { return null; }
    }
  }

  async function writeLocalDraft(content) {
    try {
      const db = await openDraftDb();
      await new Promise((resolve, reject) => {
        const transaction = db.transaction("drafts", "readwrite");
        transaction.objectStore("drafts").put(content, "current");
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
      db.close();
      try { localStorage.removeItem(DRAFT_KEY); } catch (_) { /* The IndexedDB draft is already saved. */ }
    } catch (_) {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(content)); }
      catch (_) { showToast("This draft is too large for local browser storage. Download the publish file now.", true); }
    }
  }

  async function clearLocalDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (_) { /* Continue clearing IndexedDB. */ }
    try {
      const db = await openDraftDb();
      await new Promise((resolve, reject) => {
        const transaction = db.transaction("drafts", "readwrite");
        transaction.objectStore("drafts").delete("current");
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
      db.close();
    } catch (_) { /* No saved draft to clear. */ }
  }

  function currentContent() { return { routes: state.routes, buses: state.buses }; }

  async function saveDraft(content = currentContent()) {
    const next = normalizedContent(content);
    const json = JSON.stringify(next, null, 2);
    if (new Blob([json]).size > MAX_CONTENT_FILE) throw new Error("The publish file is over 20 MB. Remove or shrink some media first.");
    await writeLocalDraft(next);
    state.routes = next.routes;
    state.buses = next.buses;
    state.dirty = JSON.stringify(next) !== JSON.stringify(state.published);
    updateNetwork();
  }

  async function loadData() {
    let published;
    try {
      const response = await fetch(`${CONTENT_URL.href}?v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Published content file is not available yet.");
      published = normalizedContent(await response.json());
    } catch (_) { published = normalizedContent({ routes: seedRoutes, buses: seedBuses }); }
    state.published = JSON.parse(JSON.stringify(published));
    const draft = await readLocalDraft();
    if (draft) {
      state.routes = draft.routes;
      state.buses = draft.buses;
      state.dirty = JSON.stringify(draft) !== JSON.stringify(published);
    } else {
      state.routes = published.routes;
      state.buses = published.buses;
      state.dirty = false;
    }
    updateNetwork(); render();
  }

  function updateNetwork() {
    const pill = document.getElementById("network-status");
    pill.className = state.dirty ? "network-pill error" : "network-pill live";
    pill.innerHTML = state.dirty ? "<i></i><span>LOCAL DRAFT</span>" : "<i></i><span>GITHUB PAGES</span>";
    document.getElementById("route-count").textContent = prettyCount(state.routes.length);
    document.getElementById("bus-count").textContent = prettyCount(state.buses.length);
    document.getElementById("admin-label").textContent = "Edit content";
    document.getElementById("admin-subtitle").textContent = "Manage routes and buses";
  }

  function setPage(page) {
    state.page = page;
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.page === page));
    const names = { home: "The village", routes: "Custom routes", buses: "The buses", admin: "Admin panel" };
    document.getElementById("crumb-current").textContent = names[page] || "The village";
    render(); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function mapSvg() {
    return `<svg class="map-blob" viewBox="0 0 600 380" role="img" aria-label="Illustrated village map with the V5A route">
      <path class="map-water" d="M-25 291 C63 266 70 211 141 223 S236 289 297 251 373 153 438 177 530 259 632 207"/>
      <path class="map-road" d="M-20 109 C74 98 97 132 169 122 S267 63 337 89 407 158 467 130 533 61 622 79"/><path class="map-road-edge" d="M-20 109 C74 98 97 132 169 122 S267 63 337 89 407 158 467 130 533 61 622 79"/>
      <path class="map-road" d="M85 388 C103 313 193 310 212 247 S202 166 264 143 352 174 362 231 430 278 482 269 546 293 580 379"/><path class="map-road-edge" d="M85 388 C103 313 193 310 212 247 S202 166 264 143 352 174 362 231 430 278 482 269 546 293 580 379"/>
      <path class="map-road" d="M5 183 C91 174 127 207 183 197 S273 191 320 207 402 225 476 199 561 173 626 186"/><path class="map-road-edge" d="M5 183 C91 174 127 207 183 197 S273 191 320 207 402 225 476 199 561 173 626 186"/>
      <path class="map-route-shadow" d="M112 86 C135 125 158 151 188 178 S225 214 258 216 300 214 335 204 389 177 423 157 476 143 510 113"/><path class="map-route" d="M112 86 C135 125 158 151 188 178 S225 214 258 216 300 214 335 204 389 177 423 157 476 143 510 113"/>
      <circle class="map-stop" cx="112" cy="86" r="6"/><circle class="map-stop" cx="188" cy="178" r="6"/><circle class="map-stop" cx="258" cy="216" r="6"/><circle class="map-stop" cx="335" cy="204" r="6"/><circle class="map-stop" cx="510" cy="113" r="6"/>
      <text class="map-label" x="71" y="72">Lwówek Śląski</text><text class="map-label" x="150" y="165">Młynka</text><text class="map-label" x="219" y="238">Lanckorona</text><text class="map-label" x="465" y="101">Okleśna PKP</text>
    </svg>`;
  }

  function busSvg(color = "#438170") {
    return `<svg class="fleet-bus" viewBox="0 0 240 104" aria-hidden="true"><path d="M30 22c0-10 8-17 18-17h135c12 0 21 9 21 21v48h12a7 7 0 0 1 7 7v6h-9a17 17 0 0 1-33 0H72a17 17 0 0 1-33 0H24v-9c0-8 5-14 13-16L30 22Z" fill="${color}"/><path d="M43 21c0-5 3-8 8-8h29v27H46a3 3 0 0 1-3-3V21Zm45-8h39v27H88V13Zm55 0h43c5 0 8 4 8 9v18h-51V13Z" fill="#dce9e7"/><path d="M90 47h46v29H90zm55 0h42v29h-42z" fill="#ffffff1b"/><path d="M39 54h174v8H39z" fill="#f4b740"/><path d="M19 72h17v13H22a6 6 0 0 1-6-6v-1a6 6 0 0 1 3-6Z" fill="#ffd065"/><circle cx="55" cy="85" r="11" fill="#27362f"/><circle cx="55" cy="85" r="5" fill="#edf0e8"/><circle cx="197" cy="85" r="11" fill="#27362f"/><circle cx="197" cy="85" r="5" fill="#edf0e8"/><path d="M199 56h13v5h-13z" fill="#fff1ce"/></svg>`;
  }

  function previewNotice() {
    if (!state.dirty) return "";
    return `<div class="preview-banner"><span class="banner-dot">✳</span><span><b>Unpublished draft on this device.</b> Other visitors still see the published version until you upload the downloaded content file to GitHub.</span></div>`;
  }

  function routeCard(route) {
    const stops = Array.isArray(route.stops) ? route.stops : [];
    const first = stops[0] || "Route stops";
    const last = stops[stops.length - 1] || route.destination;
    const media = cleanMedia(route.media);
    const mediaLabel = media.length ? `${media.length} ${media.length === 1 ? "photo" : "photos & clips"}` : `${stopCount(route)} stops`;
    const c = colorFor(route.line);
    return `<article class="route-card" role="button" tabindex="0" data-open-route="${esc(route.id)}" aria-label="View route ${esc(route.line)} to ${esc(route.destination)}">
      <div class="route-topline"><span class="route-badge" style="background:${c}">${esc(route.line)}</span><span class="service-tag">LOCAL · ALL STOPS</span></div>
      <h3>${esc(route.destination)}</h3><div class="route-subtitle">A local line, made for the way there.</div>
      <div class="route-mini-stops"><i></i><span>${esc(first)}</span><span>···</span><span>${esc(last)}</span></div>
      <div class="route-card-bottom"><strong>${esc(mediaLabel)}</strong><span class="card-arrow">↗</span></div>
    </article>`;
  }

  function renderHome() {
    const featured = state.routes.slice(0, 3);
    return `${previewNotice()}
      <section class="hero">
        <div class="hero-copy"><div class="overline">A LITTLE CLOSER, EVERY DAY</div>
          <h1>Your village,<br />a little more <span>connected.</span></h1>
          <p>From the first familiar stop to the last bend in the road. Find your route, meet the fleet, and see where the village can take you.</p>
          <div class="hero-actions"><button class="button button-primary" data-page="routes">Find your route <span aria-hidden="true">↗</span></button><button class="button-arrow" aria-label="Browse the buses" data-page="buses">→</button></div>
          <div class="hero-note"><b>V5A</b><span>Lwówek Śląski&nbsp; to &nbsp;Okleśna PKP</span></div>
        </div>
        <div class="hero-visual"><div class="hero-label">A WELL-KNOWN WAY AROUND<span>Small stops. Strong connections.</span></div>${mapSvg()}<span class="map-pin"></span><svg class="illustration-bus" viewBox="0 0 240 104" aria-hidden="true"><path d="M30 22c0-10 8-17 18-17h135c12 0 21 9 21 21v48h12a7 7 0 0 1 7 7v6h-9a17 17 0 0 1-33 0H72a17 17 0 0 1-33 0H24v-9c0-8 5-14 13-16L30 22Z" fill="#438170"/><path d="M43 21c0-5 3-8 8-8h29v27H46a3 3 0 0 1-3-3V21Zm45-8h39v27H88V13Zm55 0h43c5 0 8 4 8 9v18h-51V13Z" fill="#dce9e7"/><path d="M39 54h174v8H39z" fill="#f4b740"/><circle cx="55" cy="85" r="11" fill="#27362f"/><circle cx="55" cy="85" r="5" fill="#edf0e8"/><circle cx="197" cy="85" r="11" fill="#27362f"/><circle cx="197" cy="85" r="5" fill="#edf0e8"/></svg>
          <div class="floating-route"><span class="route-chip">V5A</span><span><small>HEADING TO</small><strong>Okleśna PKP</strong></span></div>
        </div>
      </section>
      <section class="intro-row"><div class="section-title"><div class="eyebrow">FIND YOUR WAY</div><h2>A few good ways to go.</h2></div><button class="text-link" data-page="routes">All custom routes &nbsp;↗</button></section>
      <section class="route-grid">${featured.length ? featured.map(routeCard).join("") : `<div class="empty-results"><strong>New routes are on their way.</strong>Check back soon for local connections.</div>`}</section>
      <div class="stats-strip"><div class="stat"><strong>${prettyCount(state.routes.length)}</strong><span>Local connections</span></div><div class="stat"><strong>${prettyCount(state.buses.length)}</strong><span>In the fleet</span></div><div class="stat"><strong>One</strong><span>Connected village</span></div></div>`;
  }

  function renderRoutes() {
    const query = state.search.trim().toLocaleLowerCase();
    const routes = state.routes.filter((r) => `${r.line} ${r.destination} ${(r.stops || []).join(" ")}`.toLocaleLowerCase().includes(query));
    return `${previewNotice()}<section class="page-intro"><div class="overline">THE LOCAL LINES</div><h1>Custom routes</h1><p>Each line has a story and a stop worth knowing. Pick a route to see its full journey, stop by stop.</p></section>
      <div class="filter-row"><label class="search-box"><span>⌕</span><input id="route-search" type="search" value="${esc(state.search)}" placeholder="Search a line, destination, or stop…" aria-label="Search routes" /></label><span class="result-count">${prettyCount(routes.length)} ${routes.length === 1 ? "ROUTE" : "ROUTES"}</span></div>
      <section class="route-grid">${routes.length ? routes.map(routeCard).join("") : `<div class="empty-results"><strong>No routes found just yet.</strong>Try a different line, destination, or stop name.</div>`}</section>
      <div class="about-band"><span>✳</span><span><strong>Know a better way around?</strong> Add a line in the site editor, then publish its content file through GitHub.</span></div>`;
  }

  function fleetCard(bus, index) {
    const media = cleanMedia(bus.media);
    const c = palette[index % palette.length];
    return `<article class="fleet-card"><div class="fleet-art">${busSvg(c)}${bus.fleet_number ? `<span class="fleet-number">${esc(bus.fleet_number)}</span>` : ""}</div>
      <div class="fleet-card-body"><h3>${esc(bus.model)}</h3><p>${esc(bus.description || "Part of the Villagers Connect fleet.")}</p><div class="fleet-meta"><span>${media.length ? `${media.length} MEDIA ITEM${media.length === 1 ? "" : "S"}` : "ON THE LOCAL NETWORK"}</span><span>VC · ${String(index + 1).padStart(2, "0")}</span></div>${media.length ? `<button class="text-link" data-open-bus="${esc(bus.id)}">See photos & clips ↗</button>` : ""}</div></article>`;
  }

  function renderBuses() {
    return `${previewNotice()}<section class="page-intro"><div class="overline">OUR EVERYDAY COMPANIONS</div><h1>The buses</h1><p>A little character goes a long way. Meet the rolling stock that keeps our routes moving, from much-loved classics to the daily workhorses.</p></section>
      <div class="page-head-row"><div class="section-title"><div class="eyebrow">THE FLEET</div><h2>Ready when you are.</h2></div><span class="result-count">${prettyCount(state.buses.length)} VEHICLES</span></div>
      <section class="fleet-grid">${state.buses.length ? state.buses.map(fleetCard).join("") : `<div class="empty-results"><strong>The fleet is taking a breather.</strong>Check back soon for the vehicles on our network.</div>`}</section>
      <section class="rolling-panel"><div class="eyebrow">A QUICK LOOK AT THE LINEUP</div><h3>Rolling stocks</h3><div class="rolling-list">${["O405N2", "7000", "260.04", "B951", "M101I/3", "7700FL"].map((model) => `<span>${model}</span>`).join("")}</div><small>Rolling stocks: O405N2, 7000, 260.04, B951, M101I/3, 7700FL</small></section>`;
  }

  function routeJson(route) { return JSON.stringify({ Line: route?.line || "", Destination: route?.destination || "", Stops: route?.stops || [] }, null, 2); }
  function busRows() {
    if (!state.buses.length) return `<div class="manage-empty">No buses yet. Add one to bring the fleet page to life.</div>`;
    return state.buses.map((bus, index) => `<div class="manage-row"><span class="manage-badge" style="background:${palette[index % palette.length]}">▱</span><div class="manage-row-copy"><strong>${esc(bus.model)}</strong><small>${esc(bus.fleet_number || "Fleet entry")} · ${cleanMedia(bus.media).length} media items</small></div><button class="row-action" data-edit-bus="${esc(bus.id)}">Edit</button><button class="row-action delete" data-delete-bus="${esc(bus.id)}" aria-label="Delete ${esc(bus.model)}">Delete</button></div>`).join("");
  }
  function routeRows() {
    if (!state.routes.length) return `<div class="manage-empty">No custom routes yet. Add the first local connection.</div>`;
    return state.routes.map((route) => `<div class="manage-row"><span class="manage-badge" style="background:${colorFor(route.line)}">${esc(route.line)}</span><div class="manage-row-copy"><strong>${esc(route.destination)}</strong><small>${stopCount(route)} stops · ${cleanMedia(route.media).length} media items</small></div><button class="row-action" data-edit-route="${esc(route.id)}">Edit</button><button class="row-action delete" data-delete-route="${esc(route.id)}" aria-label="Delete route ${esc(route.line)}">Delete</button></div>`).join("");
  }

  function adminShell() {
    const editingRoute = state.draftRouteId && state.routes.find((r) => r.id === state.draftRouteId);
    const editingBus = state.draftBusId && state.buses.find((b) => b.id === state.draftBusId);
    const routeTab = state.adminTab === "routes";
    return `<section class="admin-hero"><div><div class="eyebrow">YOUR LITTLE CORNER OF THE NETWORK</div><h2>Site editor</h2><p>Changes are saved as a draft on this device until you publish through GitHub.</p></div><div class="admin-avatar">✳</div></section>
      <div class="publish-tools"><div class="publish-copy"><strong>${state.dirty ? "You have an unpublished draft." : "Ready to edit your website."}</strong><span>Download the content file, then upload it to your GitHub repository to publish for everyone.</span></div><div class="button-row"><button class="button button-primary" id="download-content">Download content.json ↓</button><button class="button button-light" id="discard-draft" ${state.dirty ? "" : "disabled"}>Reload published version</button></div></div>
      <div class="preview-banner"><span class="banner-dot">◇</span><span>This public editor does not use a password. Anyone can make a draft on their own device, but only someone with permission to your GitHub repository can publish it.</span></div>
      <div class="admin-tabs"><button class="admin-tab ${routeTab ? "active" : ""}" data-admin-tab="routes">Custom routes · ${prettyCount(state.routes.length)}</button><button class="admin-tab ${!routeTab ? "active" : ""}" data-admin-tab="buses">Buses · ${prettyCount(state.buses.length)}</button></div>
      ${routeTab ? `<section class="admin-layout"><form class="form-card" id="route-form"><h3>${editingRoute ? `Edit line ${esc(editingRoute.line)}` : "Add a custom route"}</h3><p class="form-hint">Paste a route script below. Download the content file when your changes are ready.</p>
        <div class="field"><label for="route-json">ROUTE SCRIPT · JSON</label><textarea id="route-json" spellcheck="false" required>${esc(routeJson(editingRoute))}</textarea><small>Use the Line, Destination, and Stops fields. The V5A example is ready to edit.</small></div>
        <div class="field"><label for="route-description">ABOUT THIS ROUTE</label><input id="route-description" value="${esc(editingRoute?.description || "")}" placeholder="A few words about the journey" maxlength="400" /></div>
        <div class="field"><label for="route-pictures">ROUTE PICTURES</label><div class="route-media-upload"><button class="button button-light" id="route-picture-picker" type="button">＋ Upload route pictures</button><input class="sr-only" id="route-pictures" type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="Choose route pictures" /><small>JPG, PNG, or WebP · up to 8 MB each. Everyone can see these after you publish the updated content file.</small></div></div>
        <div class="field"><label for="route-videos">ROUTE VIDEOS · OPTIONAL</label><div class="route-media-upload"><button class="button button-light" id="route-video-picker" type="button">＋ Upload route videos</button><input class="sr-only" id="route-videos" type="file" accept="video/mp4,video/webm" multiple aria-label="Choose route videos" /><small>MP4 or WebM · up to 8 MB each.</small></div><div class="file-names" id="route-file-names"></div></div>
        <div class="form-actions"><button class="button button-primary" type="submit">${editingRoute ? "Save route draft" : "Add route draft"} &nbsp;→</button>${editingRoute ? `<button class="button button-light" id="cancel-route-edit" type="button">Cancel</button>` : ""}</div>
      </form><section class="manage-card"><h3>Routes in your draft</h3><p class="manage-sub">Changes are visible on this device. Download and publish to update the live site.</p><div class="manage-list">${routeRows()}</div></section></section>`
      : `<section class="admin-layout"><form class="form-card" id="bus-form"><h3>${editingBus ? `Edit ${esc(editingBus.model)}` : "Add a bus to the fleet"}</h3><p class="form-hint">Add a familiar name, an optional fleet number, and a short note for everyone.</p>
        <div class="field"><label for="bus-model">MODEL OR ROLLING STOCK</label><input id="bus-model" required value="${esc(editingBus?.model || "")}" placeholder="e.g. O405N2" maxlength="50" /></div>
        <div class="field"><label for="bus-fleet-number">FLEET NUMBER · OPTIONAL</label><input id="bus-fleet-number" value="${esc(editingBus?.fleet_number || "")}" placeholder="e.g. 7000" maxlength="40" /></div>
        <div class="field"><label for="bus-description">A LITTLE ABOUT THIS BUS</label><textarea id="bus-description" maxlength="400" placeholder="A familiar face on the local routes…">${esc(editingBus?.description || "")}</textarea></div>
        <div class="field"><label class="file-field" for="bus-media"><b>＋</b><span>Attach photos or video clips<br /><small>JPG, PNG, WebP, MP4 · up to 8 MB each</small></span></label><input id="bus-media" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" multiple /><div class="file-names" id="bus-file-names"></div></div>
        <div class="form-actions"><button class="button button-primary" type="submit">${editingBus ? "Save bus draft" : "Add bus draft"} &nbsp;→</button>${editingBus ? `<button class="button button-light" id="cancel-bus-edit" type="button">Cancel</button>` : ""}</div>
      </form><section class="manage-card"><h3>Buses in your draft</h3><p class="manage-sub">The public fleet updates after you upload and commit the downloaded content file.</p><div class="manage-list">${busRows()}</div><p class="bottom-admin-note">Rolling stocks shown on the public fleet page: O405N2, 7000, 260.04, B951, M101I/3, 7700FL.</p></section></section>`}`;
  }

  function render() {
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.page === state.page));
    if (state.page === "home") app.innerHTML = renderHome();
    else if (state.page === "routes") app.innerHTML = renderRoutes();
    else if (state.page === "buses") app.innerHTML = renderBuses();
    else app.innerHTML = `<div class="admin-page">${adminShell()}</div>`;
    if (state.selectedRouteId) renderDetail(); else document.getElementById("overlay-root")?.remove();
  }

  function renderDetail() {
    let route = state.routes.find((r) => r.id === state.selectedRouteId);
    let bus = null;
    if (!route) bus = state.buses.find((b) => b.id === state.selectedRouteId);
    if (!route && !bus) { state.selectedRouteId = null; return; }
    const isBus = Boolean(bus);
    const media = cleanMedia((route || bus).media);
    const headerTitle = isBus ? bus.model : `${route.line} · ${route.destination}`;
    const gallery = media.length ? `<section class="media-section"><h3>${isBus ? "Photos & clips" : "A little more of the journey"}</h3><div class="media-grid">${media.map((item) => `<figure class="media-item">${item.kind === "video" ? `<video src="${esc(item.url)}" controls preload="metadata"></video>` : `<img src="${esc(item.url)}" alt="${esc(item.name || headerTitle)}" loading="lazy" />`}<figcaption>${esc(item.name || (item.kind === "video" ? "Video" : "Photo"))}</figcaption></figure>`).join("")}</div></section>` : "";
    const content = isBus ? `<div class="detail-display"><div class="display-caption">VILLAGERS CONNECT · FLEET</div><div class="display-line" style="color:#f6bd55">${esc(bus.fleet_number || "VC")}</div><div class="display-dest">${esc(bus.model)}</div><div class="display-direction">IN SERVICE · THE LOCAL NETWORK</div><div class="display-route-info">${esc(bus.description || "Part of the Villagers Connect fleet.")}</div></div>` : `<div><div class="detail-display"><div class="display-caption">VILLAGERS CONNECT · LOCAL SERVICE</div><div class="display-line">${esc(route.line)}</div><div class="display-dest">${esc(route.destination)}</div><div class="display-direction">Lwówek Śląski <span>→</span> ${esc(route.destination)}</div><div class="display-route-info">${esc(route.description || "A familiar local connection, stop by stop.")}</div></div></div><section><div class="stops-heading"><strong>Stops along the way</strong><span>${prettyCount(stopCount(route))} STOPS</span></div><ol class="stop-timeline">${(route.stops || []).map((stop) => `<li>${esc(stop)}</li>`).join("")}</ol></section>`;
    const overlay = document.createElement("div");
    overlay.className = "detail-backdrop"; overlay.id = "overlay-root"; overlay.setAttribute("role", "presentation");
    overlay.innerHTML = `<section class="detail-panel" role="dialog" aria-modal="true" aria-label="${esc(headerTitle)}"><header class="detail-head"><div><div class="eyebrow">${isBus ? "A VEHICLE FROM THE FLEET" : "THE FULL JOURNEY"}</div><h2>${esc(headerTitle)}</h2></div><div class="detail-controls">${!isBus ? `<button class="route-copy" data-copy-route="${esc(route.id)}"><span aria-hidden="true">▢</span> Copy route script</button>` : ""}<button class="detail-close" id="detail-close" aria-label="Close route details">×</button></div></header><div class="detail-content">${content}${gallery}</div></section>`;
    overlay.addEventListener("click", (event) => { if (event.target === overlay) closeDetail(); });
    document.getElementById("overlay-root")?.remove(); document.body.appendChild(overlay);
  }

  function closeDetail() { state.selectedRouteId = null; document.getElementById("overlay-root")?.remove(); }
  function showToast(message, error = false) {
    const region = document.getElementById("toast-region"); const toast = document.createElement("div");
    toast.className = `toast${error ? " error" : ""}`; toast.textContent = message; region.appendChild(toast);
    setTimeout(() => toast.remove(), 3600);
  }
  function downloadContent() {
    const output = JSON.stringify(currentContent(), null, 2);
    if (new Blob([output]).size > MAX_CONTENT_FILE) { showToast("The publish file is over 20 MB. Remove or shrink some media first.", true); return; }
    const blob = new Blob([output], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "content.json"; link.style.display = "none"; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("Downloaded content.json. Upload it to GitHub to publish the changes.");
  }
  async function reloadPublishedContent() {
    if (state.dirty && !window.confirm("Discard this device's draft and reload the published website content?")) return;
    await clearLocalDraft();
    state.draftRouteId = null; state.draftBusId = null;
    await loadData();
    showToast("Loaded the published website content.");
  }
  async function copyRouteScript(routeId) {
    const route = state.routes.find((item) => item.id === routeId);
    if (!route) return;
    const script = JSON.stringify({ Line: route.line, Destination: route.destination, Stops: route.stops || [] }, null, 2);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(script);
      } else {
        const input = document.createElement("textarea");
        input.value = script; input.setAttribute("readonly", "");
        input.style.position = "fixed"; input.style.opacity = "0";
        document.body.appendChild(input); input.select();
        const copied = document.execCommand("copy"); input.remove();
        if (!copied) throw new Error("Clipboard access is unavailable.");
      }
      showToast(`Route ${route.line} copied as JSON.`);
    } catch (_) {
      showToast("Could not copy automatically. Try the route script from the admin editor.", true);
    }
  }
  function selectedFiles(id) { return [...(document.getElementById(id)?.files || [])]; }
  function showFileNames(inputId, targetId) {
    const files = selectedFiles(inputId); const target = document.getElementById(targetId);
    target.textContent = files.length ? files.map((file) => file.name).join(" · ") : "";
  }

  async function uploadMedia(files) {
    const result = [];
    for (const file of files) {
      if (file.size > MAX_MEDIA_FILE) throw new Error(`${file.name} is over the 8 MB file limit.`);
      if (!/^(image\/(jpeg|png|webp)|video\/(mp4|webm))$/.test(file.type)) throw new Error(`${file.name} is not a supported image or video.`);
      const url = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
        reader.readAsDataURL(file);
      });
      result.push({ name: file.name, kind: file.type.startsWith("video/") ? "video" : "image", url });
    }
    return result;
  }

  function parseRoute(value) {
    let item;
    try { item = JSON.parse(value); } catch (_) { throw new Error("That route script is not valid JSON. Check its quotes, commas, and brackets."); }
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Paste one route object with Line, Destination, and Stops fields.");
    const line = String(item.Line ?? item.line ?? "").trim();
    const destination = String(item.Destination ?? item.destination ?? "").trim();
    const stops = item.Stops ?? item.stops;
    if (!line || line.length > 20 || !destination || destination.length > 120 || !Array.isArray(stops) || stops.length < 1 || stops.length > 100 || stops.some((stop) => typeof stop !== "string" || !stop.trim() || stop.length > 120)) {
      throw new Error("Include a line (up to 20 characters), a destination, and 1–100 named stops.");
    }
    return { line, destination, stops: stops.map((stop) => stop.trim()) };
  }

  async function saveRoute(event) {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type=submit]"); button.disabled = true; button.textContent = "Saving draft…";
    try {
      const parsed = parseRoute(document.getElementById("route-json").value);
      const current = state.routes.find((r) => r.id === state.draftRouteId);
      const media = await uploadMedia([...selectedFiles("route-pictures"), ...selectedFiles("route-videos")]);
      const record = { id: current?.id || crypto.randomUUID(), ...parsed, description: document.getElementById("route-description").value.trim(), media: [...cleanMedia(current?.media), ...media], created_at: current?.created_at || new Date().toISOString() };
      const routes = current ? state.routes.map((route) => route.id === current.id ? record : route) : [...state.routes, record];
      await saveDraft({ routes, buses: state.buses });
      state.draftRouteId = null; render(); showToast(current ? "Route draft saved on this device." : "Route draft added on this device.");
    } catch (error) { showToast(error.message || "Could not save this route draft.", true); button.disabled = false; button.textContent = state.draftRouteId ? "Save route draft →" : "Add route draft →"; }
  }

  async function saveBus(event) {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type=submit]"); button.disabled = true; button.textContent = "Saving draft…";
    try {
      const current = state.buses.find((b) => b.id === state.draftBusId);
      const media = await uploadMedia(selectedFiles("bus-media"));
      const record = { id: current?.id || crypto.randomUUID(), model: document.getElementById("bus-model").value.trim(), fleet_number: document.getElementById("bus-fleet-number").value.trim(), description: document.getElementById("bus-description").value.trim(), media: [...cleanMedia(current?.media), ...media] };
      if (!record.model) throw new Error("Give this bus a model or rolling stock name.");
      const buses = current ? state.buses.map((bus) => bus.id === current.id ? record : bus) : [...state.buses, record];
      await saveDraft({ routes: state.routes, buses });
      state.draftBusId = null; render(); showToast(current ? "Bus draft saved on this device." : "Bus draft added on this device.");
    } catch (error) { showToast(error.message || "Could not save this bus draft.", true); button.disabled = false; button.textContent = state.draftBusId ? "Save bus draft →" : "Add bus draft →"; }
  }

  async function deleteItem(table, item, label) {
    if (!window.confirm(`Remove ${label} from this device's draft? The live website changes only after you publish through GitHub.`)) return;
    try {
      const content = currentContent();
      content[table] = content[table].filter((entry) => entry.id !== item.id);
      await saveDraft(content); render(); showToast(`${label} removed from your draft.`);
    } catch (error) { showToast(error.message || `Could not remove ${label}.`, true); }
  }

  document.addEventListener("click", async (event) => {
    const pageButton = event.target.closest("[data-page]");
    if (pageButton) { event.preventDefault(); setPage(pageButton.dataset.page); return; }
    if (event.target.closest("#admin-open, #top-admin-open")) { setPage("admin"); return; }
    if (event.target.closest("#download-content")) { downloadContent(); return; }
    if (event.target.closest("#discard-draft")) { await reloadPublishedContent(); return; }
    if (event.target.closest("#route-picture-picker")) { document.getElementById("route-pictures")?.click(); return; }
    if (event.target.closest("#route-video-picker")) { document.getElementById("route-videos")?.click(); return; }
    if (event.target.closest("#detail-close")) { closeDetail(); return; }
    const copyRoute = event.target.closest("[data-copy-route]");
    if (copyRoute) { await copyRouteScript(copyRoute.dataset.copyRoute); return; }
    if (event.target.closest("[data-admin-tab]")) { state.adminTab = event.target.closest("[data-admin-tab]").dataset.adminTab; state.draftRouteId = null; state.draftBusId = null; render(); return; }
    const route = event.target.closest("[data-open-route]");
    if (route) { state.selectedRouteId = route.dataset.openRoute; renderDetail(); return; }
    const bus = event.target.closest("[data-open-bus]");
    if (bus) { state.selectedRouteId = bus.dataset.openBus; renderDetail(); return; }
    const editRoute = event.target.closest("[data-edit-route]");
    if (editRoute) { state.draftRouteId = editRoute.dataset.editRoute; state.adminTab = "routes"; render(); return; }
    const editBus = event.target.closest("[data-edit-bus]");
    if (editBus) { state.draftBusId = editBus.dataset.editBus; state.adminTab = "buses"; render(); return; }
    const deleteRoute = event.target.closest("[data-delete-route]");
    if (deleteRoute) { const item = state.routes.find((r) => r.id === deleteRoute.dataset.deleteRoute); if (item) await deleteItem("routes", item, `route ${item.line}`); return; }
    const deleteBus = event.target.closest("[data-delete-bus]");
    if (deleteBus) { const item = state.buses.find((b) => b.id === deleteBus.dataset.deleteBus); if (item) await deleteItem("buses", item, item.model); return; }
    if (event.target.closest("#cancel-route-edit")) { state.draftRouteId = null; render(); return; }
    if (event.target.closest("#cancel-bus-edit")) { state.draftBusId = null; render(); return; }
  });

  document.addEventListener("submit", (event) => {
    if (event.target.id === "route-form") saveRoute(event);
    if (event.target.id === "bus-form") saveBus(event);
  });
  document.addEventListener("input", (event) => {
    if (event.target.id === "route-search") { state.search = event.target.value; const start = event.target.selectionStart; render(); const next = document.getElementById("route-search"); next?.focus(); next?.setSelectionRange(start, start); }
  });
  document.addEventListener("change", (event) => {
    if (event.target.id === "route-pictures" || event.target.id === "route-videos") {
      const files = [...selectedFiles("route-pictures"), ...selectedFiles("route-videos")];
      document.getElementById("route-file-names").textContent = files.length ? files.map((file) => file.name).join(" · ") : "";
    }
    if (event.target.id === "bus-media") showFileNames("bus-media", "bus-file-names");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDetail();
    if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-open-route]")) { event.preventDefault(); state.selectedRouteId = event.target.dataset.openRoute; renderDetail(); }
  });

  async function init() {
    updateNetwork(); render();
    await loadData();
  }
  init();
})();
