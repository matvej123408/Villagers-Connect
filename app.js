(() => {
  "use strict";

  const ADMIN_EMAIL = "matvejbojko146@gmail.com";
  const AUTH_KEY = "villagers-connect-auth-v1";
  const config = window.VILLAGERS_CONFIG || {};
  const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  const baseUrl = (config.supabaseUrl || "").replace(/\/$/, "");
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
    session: null, connected: false, remoteError: "", search: "", draftRouteId: null, draftBusId: null,
    selectedRouteId: null, authStep: "email", pendingEmail: "", loading: false
  };
  const app = document.getElementById("app-content");
  const authModal = document.getElementById("auth-modal");

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const cleanMedia = (value) => Array.isArray(value) ? value.filter((item) => item && typeof item.url === "string" && /^https?:\/\//i.test(item.url)) : [];
  const colorFor = (line) => palette[[...String(line)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length];
  const prettyCount = (count) => String(count).padStart(2, "0");
  const stopCount = (route) => Array.isArray(route.stops) ? route.stops.length : 0;

  async function api(path, options = {}, session = state.session) {
    const headers = { apikey: config.supabaseAnonKey, "Content-Type": "application/json", ...(options.headers || {}) };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    else headers.Authorization = `Bearer ${config.supabaseAnonKey}`;
    const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
    const body = response.status === 204 ? null : await response.text();
    if (!response.ok) {
      let message = body || `Request failed (${response.status})`;
      try { message = JSON.parse(body).message || JSON.parse(body).msg || message; } catch (_) { /* keep the response text */ }
      throw new Error(message);
    }
    if (!body) return null;
    try { return JSON.parse(body); } catch (_) { return body; }
  }

  function apiErrorText(error) {
    const message = String(error?.message || error || "Something went wrong.");
    if (/relation .* does not exist|could not find the table|schema cache/i.test(message)) return "The Villagers Connect tables are not set up yet. Follow the Supabase steps in README.md.";
    if (/row-level security|permission denied|not allowed/i.test(message)) return "This account is not allowed to change public Villagers Connect pages.";
    return message;
  }

  async function loadData() {
    if (!configured) {
      state.routes = [...seedRoutes]; state.buses = [...seedBuses]; state.connected = false; state.remoteError = "";
      updateNetwork(); render(); return;
    }
    try {
      const [routes, buses] = await Promise.all([
        api("/rest/v1/routes?select=id,line,destination,stops,description,media,created_at&order=created_at.asc", {}, null),
        api("/rest/v1/buses?select=id,model,fleet_number,description,media,created_at&order=created_at.asc", {}, null)
      ]);
      state.routes = routes.map((r) => ({ ...r, line: r.line || "?", destination: r.destination || "Untitled route", stops: Array.isArray(r.stops) ? r.stops : [], description: r.description || "", media: cleanMedia(r.media) }));
      state.buses = buses.map((b) => ({ ...b, model: b.model || "Bus", fleet_number: b.fleet_number || "", description: b.description || "", media: cleanMedia(b.media) }));
      state.connected = true; state.remoteError = "";
    } catch (error) {
      state.routes = [...seedRoutes]; state.buses = [...seedBuses]; state.connected = false; state.remoteError = apiErrorText(error);
    }
    updateNetwork(); render();
  }

  function updateNetwork() {
    const pill = document.getElementById("network-status");
    if (state.connected) { pill.className = "network-pill live"; pill.innerHTML = "<i></i><span>LIVE NETWORK</span>"; }
    else if (state.remoteError) { pill.className = "network-pill error"; pill.innerHTML = "<i></i><span>OFFLINE PREVIEW</span>"; }
    else { pill.className = "network-pill"; pill.innerHTML = "<i></i><span>PREVIEW MODE</span>"; }
    document.getElementById("route-count").textContent = prettyCount(state.routes.length);
    document.getElementById("admin-label").textContent = state.session ? "Admin panel" : "Admin sign in";
    document.getElementById("admin-subtitle").textContent = state.session ? "Manage routes and buses" : "For the people behind the routes";
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
    if (state.connected) return "";
    const text = state.remoteError
      ? `<b>Live publishing needs a quick setup.</b> ${esc(state.remoteError)}`
      : `<b>You're looking at the site preview.</b> Connect Supabase to enable emailed admin codes, shared edits, and media uploads.`;
    return `<div class="preview-banner"><span class="banner-dot">✳</span><span>${text}</span></div>`;
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
      <div class="about-band"><span>✳</span><span><strong>Know a better way around?</strong> Our local network is shaped by its routes. The administrator can add new lines and share them with everyone here.</span></div>`;
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
    return state.buses.map((bus, index) => `<div class="manage-row"><span class="manage-badge" style="background:${palette[index % palette.length]}">▱</span><div class="manage-row-copy"><strong>${esc(bus.model)}</strong><small>${esc(bus.fleet_number || "Fleet entry")} · ${cleanMedia(bus.media).length} media items</small></div><button class="row-action" data-edit-bus="${esc(bus.id)}">Edit</button><button class="row-action delete" data-delete-bus="${esc(bus.id)}" aria-label="Delete ${esc(bus.model)}">×</button></div>`).join("");
  }
  function routeRows() {
    if (!state.routes.length) return `<div class="manage-empty">No custom routes yet. Add the first local connection.</div>`;
    return state.routes.map((route) => `<div class="manage-row"><span class="manage-badge" style="background:${colorFor(route.line)}">${esc(route.line)}</span><div class="manage-row-copy"><strong>${esc(route.destination)}</strong><small>${stopCount(route)} stops · ${cleanMedia(route.media).length} media items</small></div><button class="row-action" data-edit-route="${esc(route.id)}">Edit</button><button class="row-action delete" data-delete-route="${esc(route.id)}" aria-label="Delete route ${esc(route.line)}">×</button></div>`).join("");
  }

  function adminShell() {
    if (!state.session) {
      setTimeout(openAuth, 0);
      return `<section class="page-intro"><div class="overline">JUST FOR THE ADMINISTRATOR</div><h1>Your control room.</h1><p>Sign in with the authorized administrator email to manage the routes, fleet, and media the whole village can see.</p></section><div class="about-band"><span>◇</span><span>Admin publishing is restricted to the authorized email. Everyone else can browse the public pages without signing in.</span></div><button class="button button-primary" id="admin-page-signin">Continue to admin sign in&nbsp; →</button>`;
    }
    const editingRoute = state.draftRouteId && state.routes.find((r) => r.id === state.draftRouteId);
    const editingBus = state.draftBusId && state.buses.find((b) => b.id === state.draftBusId);
    const routeTab = state.adminTab === "routes";
    return `<section class="admin-hero"><div><div class="eyebrow">YOUR LITTLE CORNER OF THE NETWORK</div><h2>Good to have you back.</h2><p>Keep the public pages clear, current, and full of good ways to go.</p></div><div class="button-row"><button class="admin-signout" id="admin-signout">Sign out&nbsp; ↗</button><div class="admin-avatar">✳</div></div></section>
      ${!state.connected ? `<div class="preview-banner"><span class="banner-dot">✳</span><span><b>Changes are not published yet.</b> Configure Supabase to save public edits across devices.</span></div>` : ""}
      <div class="admin-tabs"><button class="admin-tab ${routeTab ? "active" : ""}" data-admin-tab="routes">Custom routes · ${prettyCount(state.routes.length)}</button><button class="admin-tab ${!routeTab ? "active" : ""}" data-admin-tab="buses">Buses · ${prettyCount(state.buses.length)}</button></div>
      ${routeTab ? `<section class="admin-layout"><form class="form-card" id="route-form"><h3>${editingRoute ? `Edit line ${esc(editingRoute.line)}` : "Add a custom route"}</h3><p class="form-hint">Paste a route script below. It will appear on the public Custom routes page as soon as you publish it.</p>
        <div class="field"><label for="route-json">ROUTE SCRIPT · JSON</label><textarea id="route-json" spellcheck="false" required>${esc(routeJson(editingRoute))}</textarea><small>Use the Line, Destination, and Stops fields. The V5A example is ready to edit.</small></div>
        <div class="field"><label for="route-description">ABOUT THIS ROUTE</label><input id="route-description" value="${esc(editingRoute?.description || "")}" placeholder="A few words about the journey" maxlength="400" /></div>
        <div class="field"><label class="file-field" for="route-media"><b>＋</b><span>Attach photos or video clips<br /><small>JPG, PNG, WebP, MP4 · up to 50 MB each</small></span></label><input id="route-media" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" multiple /><div class="file-names" id="route-file-names"></div></div>
        <div class="form-actions"><button class="button button-primary" type="submit" ${state.connected ? "" : "disabled title=\"Connect Supabase to publish\""}>${editingRoute ? "Save route" : "Publish route"} &nbsp;→</button>${editingRoute ? `<button class="button button-light" id="cancel-route-edit" type="button">Cancel</button>` : ""}</div>
      </form><section class="manage-card"><h3>Routes on the network</h3><p class="manage-sub">Updates here appear straight away for every visitor.</p><div class="manage-list">${routeRows()}</div></section></section>`
      : `<section class="admin-layout"><form class="form-card" id="bus-form"><h3>${editingBus ? `Edit ${esc(editingBus.model)}` : "Add a bus to the fleet"}</h3><p class="form-hint">Add a familiar name, an optional fleet number, and a short note for everyone.</p>
        <div class="field"><label for="bus-model">MODEL OR ROLLING STOCK</label><input id="bus-model" required value="${esc(editingBus?.model || "")}" placeholder="e.g. O405N2" maxlength="50" /></div>
        <div class="field"><label for="bus-fleet-number">FLEET NUMBER · OPTIONAL</label><input id="bus-fleet-number" value="${esc(editingBus?.fleet_number || "")}" placeholder="e.g. 7000" maxlength="40" /></div>
        <div class="field"><label for="bus-description">A LITTLE ABOUT THIS BUS</label><textarea id="bus-description" maxlength="400" placeholder="A familiar face on the local routes…">${esc(editingBus?.description || "")}</textarea></div>
        <div class="field"><label class="file-field" for="bus-media"><b>＋</b><span>Attach photos or video clips<br /><small>JPG, PNG, WebP, MP4 · up to 50 MB each</small></span></label><input id="bus-media" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" multiple /><div class="file-names" id="bus-file-names"></div></div>
        <div class="form-actions"><button class="button button-primary" type="submit" ${state.connected ? "" : "disabled title=\"Connect Supabase to publish\""}>${editingBus ? "Save bus" : "Add to the fleet"} &nbsp;→</button>${editingBus ? `<button class="button button-light" id="cancel-bus-edit" type="button">Cancel</button>` : ""}</div>
      </form><section class="manage-card"><h3>Buses on the network</h3><p class="manage-sub">The Buses page is public. Your changes are shared with everyone.</p><div class="manage-list">${busRows()}</div><p class="bottom-admin-note">Rolling stocks shown on the public fleet page: O405N2, 7000, 260.04, B951, M101I/3, 7700FL.</p></section></section>`}`;
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

  function openAuth() {
    authModal.classList.remove("hidden");
    state.authStep = "email";
    state.pendingEmail = "";
    document.getElementById("auth-email").value = "";
    document.getElementById("auth-email-row").classList.remove("hidden");
    document.getElementById("auth-code").value = "";
    document.getElementById("auth-title").innerHTML = "A little code,<br />and you’re in.";
    document.getElementById("auth-description").textContent = "Enter your administrator email and we’ll send you a one-time sign-in code.";
    document.getElementById("code-wrap").classList.add("hidden");
    document.getElementById("auth-back").classList.add("hidden");
    document.getElementById("auth-submit").querySelector("span").textContent = "Send me a code";
    document.getElementById("auth-error").classList.add("hidden");
    const foot = document.querySelector(".auth-foot");
    foot.innerHTML = configured ? `<span class="mini-shield">◇</span> Only the listed administrator can edit public pages.` : `<span class="mini-shield">◇</span> Add your Supabase details in config.js and complete README.md first.`;
  }

  function closeAuth() { authModal.classList.add("hidden"); }
  function showAuthError(message) { const node = document.getElementById("auth-error"); node.textContent = message; node.classList.remove("hidden"); }
  function setAuthBusy(busy) {
    const button = document.getElementById("auth-submit"); button.disabled = busy;
    button.querySelector("span").textContent = busy ? "One moment…" : state.authStep === "code" ? "Verify my code" : "Send me a code";
  }

  async function authAction() {
    document.getElementById("auth-error").classList.add("hidden");
    if (!configured) { showAuthError("The site needs its Supabase URL and public key first. See the setup guide in README.md."); return; }
    setAuthBusy(true);
    try {
      if (state.authStep === "email") {
        const email = document.getElementById("auth-email").value.trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
        if (email !== ADMIN_EMAIL) throw new Error("This email is not enabled for admin access.");
        state.pendingEmail = email;
        await api("/auth/v1/otp", { method: "POST", body: JSON.stringify({ email, create_user: true }) }, null);
        state.authStep = "code";
        document.getElementById("auth-title").innerHTML = "Check your<br />inbox.";
        document.getElementById("auth-description").textContent = "We sent a one-time code to the email you entered. It is valid for a short time.";
        document.getElementById("auth-email-row").classList.add("hidden");
        document.getElementById("code-wrap").classList.remove("hidden"); document.getElementById("auth-back").classList.remove("hidden");
        setAuthBusy(false); document.getElementById("auth-code").focus();
      } else {
        const token = document.getElementById("auth-code").value.replace(/\s/g, "");
        if (!/^\d{6,8}$/.test(token)) throw new Error("Enter the sign-in code from your email.");
        const result = await api("/auth/v1/verify", { method: "POST", body: JSON.stringify({ email: state.pendingEmail, token, type: "email" }) }, null);
        if (!result?.access_token || result?.user?.email?.toLowerCase() !== ADMIN_EMAIL) throw new Error("This sign-in is not enabled for the administrator email.");
        state.session = result; localStorage.setItem(AUTH_KEY, JSON.stringify(result));
        closeAuth(); state.page = "admin"; state.adminTab = "routes"; updateNetwork();
        if (configured) await loadData(); else render();
        showToast("Welcome back. The admin panel is ready.");
      }
    } catch (error) { showAuthError(apiErrorText(error)); setAuthBusy(false); }
  }

  async function restoreSession() {
    try {
      const saved = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
      if (!saved?.access_token || !saved?.user?.email || saved.user.email.toLowerCase() !== ADMIN_EMAIL) { localStorage.removeItem(AUTH_KEY); return; }
      if (saved.expires_at && saved.expires_at * 1000 < Date.now() + 60000 && saved.refresh_token && configured) {
        const refreshed = await api("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: saved.refresh_token }) }, null);
        state.session = refreshed; localStorage.setItem(AUTH_KEY, JSON.stringify(refreshed));
      } else state.session = saved;
    } catch (_) { state.session = null; localStorage.removeItem(AUTH_KEY); }
  }

  function closeDetail() { state.selectedRouteId = null; document.getElementById("overlay-root")?.remove(); }
  function showToast(message, error = false) {
    const region = document.getElementById("toast-region"); const toast = document.createElement("div");
    toast.className = `toast${error ? " error" : ""}`; toast.textContent = message; region.appendChild(toast);
    setTimeout(() => toast.remove(), 3600);
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

  async function uploadMedia(files, folder) {
    const result = [];
    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) throw new Error(`${file.name} is over the 50 MB upload limit.`);
      if (!/^(image\/(jpeg|png|webp)|video\/(mp4|webm))$/.test(file.type)) throw new Error(`${file.name} is not a supported image or video.`);
      const safeName = file.name.normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").slice(-100) || "media";
      const path = `${folder}/${crypto.randomUUID()}-${safeName}`;
      const response = await fetch(`${baseUrl}/storage/v1/object/villagers-media/${path}`, {
        method: "POST", headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${state.session.access_token}`, "Content-Type": file.type, "x-upsert": "false" }, body: file
      });
      if (!response.ok) { const body = await response.text(); throw new Error(body || `Could not upload ${file.name}.`); }
      result.push({ name: file.name, kind: file.type.startsWith("video/") ? "video" : "image", url: `${baseUrl}/storage/v1/object/public/villagers-media/${path}` });
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
    event.preventDefault(); if (!state.connected) return showToast("Connect Supabase before publishing route changes.", true);
    const button = event.currentTarget.querySelector("button[type=submit]"); button.disabled = true; button.textContent = "Publishing…";
    try {
      const parsed = parseRoute(document.getElementById("route-json").value);
      const current = state.routes.find((r) => r.id === state.draftRouteId);
      const record = { ...parsed, description: document.getElementById("route-description").value.trim(), media: cleanMedia(current?.media) };
      let saved;
      if (current) {
        await api(`/rest/v1/routes?id=eq.${encodeURIComponent(current.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(record) }); saved = current;
      } else {
        const rows = await api("/rest/v1/routes", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(record) }); saved = rows[0];
      }
      const media = await uploadMedia(selectedFiles("route-media"), `routes/${saved.id}`);
      if (media.length) await api(`/rest/v1/routes?id=eq.${encodeURIComponent(saved.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ media: [...record.media, ...media] }) });
      state.draftRouteId = null; await loadData(); showToast(current ? "Route updated for everyone." : "Your new route is on the network.");
    } catch (error) { showToast(apiErrorText(error), true); button.disabled = false; button.textContent = state.draftRouteId ? "Save route →" : "Publish route →"; }
  }

  async function saveBus(event) {
    event.preventDefault(); if (!state.connected) return showToast("Connect Supabase before publishing fleet changes.", true);
    const button = event.currentTarget.querySelector("button[type=submit]"); button.disabled = true; button.textContent = "Saving…";
    try {
      const current = state.buses.find((b) => b.id === state.draftBusId);
      const record = { model: document.getElementById("bus-model").value.trim(), fleet_number: document.getElementById("bus-fleet-number").value.trim(), description: document.getElementById("bus-description").value.trim(), media: cleanMedia(current?.media) };
      if (!record.model) throw new Error("Give this bus a model or rolling stock name.");
      let saved;
      if (current) { await api(`/rest/v1/buses?id=eq.${encodeURIComponent(current.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(record) }); saved = current; }
      else { const rows = await api("/rest/v1/buses", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(record) }); saved = rows[0]; }
      const media = await uploadMedia(selectedFiles("bus-media"), `buses/${saved.id}`);
      if (media.length) await api(`/rest/v1/buses?id=eq.${encodeURIComponent(saved.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ media: [...record.media, ...media] }) });
      state.draftBusId = null; await loadData(); showToast(current ? "Fleet entry updated." : "The new bus is on the fleet page.");
    } catch (error) { showToast(apiErrorText(error), true); button.disabled = false; button.textContent = state.draftBusId ? "Save bus →" : "Add to the fleet →"; }
  }

  async function deleteItem(table, item, label) {
    if (!state.connected) return showToast("Connect Supabase before removing public content.", true);
    if (!window.confirm(`Remove ${label}? This will disappear for all visitors.`)) return;
    try { await api(`/rest/v1/${table}?id=eq.${encodeURIComponent(item.id)}`, { method: "DELETE" }); await loadData(); showToast(`${label} removed.`); }
    catch (error) { showToast(apiErrorText(error), true); }
  }

  document.addEventListener("click", async (event) => {
    const pageButton = event.target.closest("[data-page]");
    if (pageButton) { event.preventDefault(); setPage(pageButton.dataset.page); return; }
    if (event.target.closest("#admin-open, #top-admin-open")) { if (state.session) setPage("admin"); else openAuth(); return; }
    if (event.target.closest("#admin-page-signin")) { openAuth(); return; }
    if (event.target.closest("[data-close-auth]")) { closeAuth(); return; }
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
    if (event.target.closest("#admin-signout")) { state.session = null; localStorage.removeItem(AUTH_KEY); state.draftRouteId = null; state.draftBusId = null; setPage("home"); showToast("You are signed out."); return; }
    if (event.target.closest("#auth-submit")) { await authAction(); return; }
    if (event.target.closest("#auth-back")) { state.authStep = "email"; openAuth(); return; }
  });

  document.addEventListener("submit", (event) => {
    if (event.target.id === "route-form") saveRoute(event);
    if (event.target.id === "bus-form") saveBus(event);
  });
  document.addEventListener("input", (event) => {
    if (event.target.id === "route-search") { state.search = event.target.value; const start = event.target.selectionStart; render(); const next = document.getElementById("route-search"); next?.focus(); next?.setSelectionRange(start, start); }
  });
  document.addEventListener("change", (event) => {
    if (event.target.id === "route-media") showFileNames("route-media", "route-file-names");
    if (event.target.id === "bus-media") showFileNames("bus-media", "bus-file-names");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { closeDetail(); closeAuth(); }
    if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-open-route]")) { event.preventDefault(); state.selectedRouteId = event.target.dataset.openRoute; renderDetail(); }
  });
  authModal.addEventListener("click", (event) => { if (event.target === authModal) closeAuth(); });

  async function init() {
    await restoreSession(); updateNetwork(); render();
    if (configured) await loadData();
    if (state.session) { state.page = "admin"; setPage("admin"); }
  }
  init();
})();
