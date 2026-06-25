import { watchAuth, login, logout, createUserAccount } from "./auth.js";
import * as store from "./store.js";

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const toDate = (ts) => (ts && ts.toDate ? ts.toDate() : ts ? new Date(ts) : null);
const fmtDate = (ts) => { const d = toDate(ts); return d ? d.toLocaleDateString() : ""; };
const fmtDays = (ts) => {
  const d = toDate(ts); if (!d) return "never";
  const n = Math.floor((Date.now() - d.getTime()) / 86400000);
  return n <= 0 ? "today" : `${n} day${n > 1 ? "s" : ""} ago`;
};
const empty = (t) => `<p class="muted">${t}</p>`;

const UNITS = ["piece", "kg", "g", "mg", "litre", "ml"];
const state = { profile: null, tab: "inventory", products: [], destinations: [], users: [], visits: [], subs: [] };

// ---------- boot / realtime ----------
watchAuth((profile) => {
  state.profile = profile;
  cleanupSubs();
  if (!profile || profile.role === "none") return renderGate(profile);
  startSubs();
  renderApp();
});

function cleanupSubs() { state.subs.forEach((u) => u && u()); state.subs = []; }
function startSubs() {
  state.subs.push(store.onProducts((p) => { state.products = p; if (["inventory", "admin"].includes(state.tab)) renderTab(); }));
  state.subs.push(store.onDestinations((d) => { state.destinations = d; if (["destinations", "admin"].includes(state.tab)) renderTab(); }));
  state.subs.push(store.onMyVisits(state.profile.uid, (v) => { state.visits = v; if (state.tab === "history") renderTab(); }));
  if (state.profile.role === "admin")
    state.subs.push(store.onUsers((u) => { state.users = u; if (state.tab === "admin") renderTab(); }));
}

// ---------- views ----------
function renderGate(profile) {
  const pending = profile && profile.role === "none";
  $("#root").innerHTML = `
    <div class="auth"><div class="card auth-card">
      <h1>Envasis</h1><p class="muted">Inventory tracking</p>
      ${pending
        ? `<p class="warn">Signed in, but your account has no role yet.<br/>Ask an admin to set you up.</p>
           <button class="btn" data-action="logout">Sign out</button>`
        : `<form data-action="login">
             <input name="email" type="email" placeholder="Email" required />
             <input name="password" type="password" placeholder="Password" required />
             <button class="btn primary" type="submit">Sign in</button>
             <p class="err" id="loginErr"></p>
           </form>`}
    </div></div>`;
}

function renderApp() {
  const admin = state.profile.role === "admin";
  const tabs = [["inventory", "Inventory"], ["destinations", "Destinations"], ["history", "History"]];
  if (admin) tabs.push(["admin", "Admin"]);
  if (!tabs.some((t) => t[0] === state.tab)) state.tab = "inventory";
  $("#root").innerHTML = `
    <header class="topbar">
      <strong>Envasis</strong>
      <span class="who">${esc(state.profile.name || state.profile.email)} · ${esc(state.profile.role)}</span>
      <button class="btn sm" data-action="logout">Sign out</button>
    </header>
    <nav class="tabs">${tabs.map(([id, l]) =>
      `<button class="tab ${state.tab === id ? "on" : ""}" data-tab="${id}">${l}</button>`).join("")}</nav>
    <main id="view"></main>`;
  renderTab();
}

function renderTab() {
  const v = $("#view"); if (!v) return;
  ({ inventory: viewInventory, destinations: viewDestinations, history: viewHistory, admin: viewAdmin }
    [state.tab] || viewInventory)(v);
}

function viewInventory(v) {
  v.innerHTML = `<h2>Inventory</h2><div class="list">${
    state.products.map((p) => `<div class="card row">
      <div><strong>${esc(p.name)}</strong>${p.sku ? ` <span class="muted">#${esc(p.sku)}</span>` : ""}
        <div class="muted">${p.quantity} ${esc(p.unit)}</div></div>
      <button class="btn sm" data-dec="${p.id}">− Sell</button>
    </div>`).join("") || empty("No products yet.")}</div>`;
}

function viewDestinations(v) {
  v.innerHTML = `<h2>Destinations</h2><div class="list">${
    state.destinations.map((d) => `<div class="card">
      <div class="row">
        <div><strong>${esc(d.name)}</strong>${d.address ? `<div class="muted">${esc(d.address)}</div>` : ""}
          <div class="muted">Last visit: ${fmtDays(d.lastVisitedAt)} · ${d.visitCount || 0} total</div></div>
        <button class="btn sm" data-visit="${d.id}">Mark visited</button>
      </div>
      <div class="visit-form hidden" id="vf-${d.id}">
        <div class="muted">Sold this visit (leave 0 if none):</div>
        ${state.products.map((p) => `<label class="qline">${esc(p.name)} (${esc(p.unit)})
          <input type="number" min="0" step="any" data-sold="${p.id}" placeholder="0" /></label>`).join("")
          || empty("No products to record.")}
        <button class="btn primary sm" data-confirm="${d.id}">Save visit</button>
      </div>
    </div>`).join("") || empty("No destinations yet.")}</div>`;
}

function viewHistory(v) {
  v.innerHTML = `<h2>My visit history</h2><div class="list">${
    state.visits.map((x) => `<div class="card">
      <strong>${esc(x.destName)}</strong> <span class="muted">${fmtDate(x.visitedAt)}</span>
      <div class="muted">${(x.items || []).map((i) => `${esc(i.name)}: ${i.qty} ${esc(i.unit || "")}`).join(", ") || "No items sold"}</div>
      ${x.note ? `<div class="muted">📝 ${esc(x.note)}</div>` : ""}
    </div>`).join("") || empty("No visits yet.")}</div>`;
}

function viewAdmin(v) {
  const unitOpts = UNITS.map((u) => `<option>${u}</option>`).join("") + `<option value="__custom">custom…</option>`;
  v.innerHTML = `
    <h2>Admin</h2>

    <section class="card"><h3>Products</h3>
      <form data-action="addProduct" class="grid">
        <input name="name" placeholder="Name" required />
        <input name="sku" placeholder="SKU (optional)" />
        <input name="quantity" type="number" step="any" placeholder="Qty" value="0" />
        <select name="unit">${unitOpts}</select>
        <input name="customUnit" placeholder="Custom unit" class="hidden" />
        <button class="btn primary">Add</button>
      </form>
      <div class="list">${state.products.map((p) => `<div class="card row">
        <div><strong>${esc(p.name)}</strong> <span class="muted">${p.quantity} ${esc(p.unit)}</span></div>
        <span><button class="btn sm" data-unit="${p.id}">Unit</button>
          <button class="btn sm danger" data-delp="${p.id}">Delete</button></span>
      </div>`).join("") || empty("None yet.")}</div>
    </section>

    <section class="card"><h3>Destinations</h3>
      <form data-action="addDest" class="grid">
        <input name="name" placeholder="Name" required />
        <input name="address" placeholder="Address" />
        <input name="contact" placeholder="Contact" />
        <button class="btn primary">Add</button>
      </form>
      <div class="list">${state.destinations.map((d) => `<div class="card row">
        <div><strong>${esc(d.name)}</strong> <span class="muted">${fmtDays(d.lastVisitedAt)}</span></div>
        <button class="btn sm danger" data-deld="${d.id}">Delete</button>
      </div>`).join("") || empty("None yet.")}</div>
    </section>

    <section class="card"><h3>Users</h3>
      <form data-action="addUser" class="grid">
        <input name="name" placeholder="Name" required />
        <input name="email" type="email" placeholder="Email" required />
        <input name="password" type="password" placeholder="Temp password" required />
        <select name="role"><option value="user">user</option><option value="admin">admin</option></select>
        <button class="btn primary">Add user</button>
      </form>
      <p class="err" id="userErr"></p>
      <div class="list">${state.users.map((u) => `<div class="card row">
        <div><strong>${esc(u.name || u.email)}</strong>
          <div class="muted">${esc(u.email)} · ${esc(u.role)} · ${u.active ? "active" : "disabled"}</div></div>
        <span>
          <button class="btn sm" data-hist="${u.id}">History</button>
          <button class="btn sm" data-toggle="${u.id}" data-active="${u.active ? 1 : 0}">${u.active ? "Disable" : "Enable"}</button>
          <button class="btn sm danger" data-delu="${u.id}">Delete</button>
        </span>
      </div>`).join("") || empty("None yet.")}</div>
      <div id="histBox"></div>
    </section>`;
}

// ---------- events (delegated, attached once) ----------
document.addEventListener("submit", onSubmit);
document.addEventListener("click", onClick);
document.addEventListener("change", (e) => {
  if (e.target.name === "unit") {
    const cu = e.target.form?.querySelector('[name="customUnit"]');
    if (cu) cu.classList.toggle("hidden", e.target.value !== "__custom");
  }
});

async function onSubmit(e) {
  const f = e.target, a = f.dataset.action; if (!a) return;
  e.preventDefault();
  const d = Object.fromEntries(new FormData(f));
  try {
    if (a === "login") {
      try { await login(d.email, d.password); }
      catch (err) { $("#loginErr").textContent = err.code || err.message; }
    } else if (a === "addProduct") {
      const unit = d.unit === "__custom" ? (d.customUnit || "unit") : d.unit;
      await store.addProduct({ name: d.name, sku: d.sku, quantity: d.quantity, unit }); f.reset();
    } else if (a === "addDest") {
      await store.addDestination(d); f.reset();
    } else if (a === "addUser") {
      $("#userErr").textContent = "";
      try { await createUserAccount(d); f.reset(); }
      catch (err) { $("#userErr").textContent = err.code || err.message; }
    }
  } catch (err) { alert(err.message); }
}

async function onClick(e) {
  const t = e.target.closest("[data-action],[data-tab],[data-dec],[data-visit],[data-confirm],[data-delp],[data-deld],[data-delu],[data-unit],[data-toggle],[data-hist]");
  if (!t) return;
  const ds = t.dataset;
  try {
    if (ds.action === "logout") return logout();
    if (ds.tab) { state.tab = ds.tab; return renderApp(); }
    if (ds.dec) return sell(ds.dec);
    if (ds.visit) return $("#vf-" + ds.visit)?.classList.toggle("hidden");
    if (ds.confirm) return saveVisit(ds.confirm);
    if (ds.delp) return confirm("Delete product?") && store.removeProduct(ds.delp);
    if (ds.deld) return confirm("Delete destination?") && store.removeDestination(ds.deld);
    if (ds.delu) return confirm("Delete user profile? (Their login still exists — remove it in the Firebase console.)") && store.removeUser(ds.delu);
    if (ds.unit) return changeUnit(ds.unit);
    if (ds.toggle) return store.setUserActive(ds.toggle, ds.active !== "1");
    if (ds.hist) return showHistory(ds.hist);
  } catch (err) { alert(err.message); }
}

// ---------- actions ----------
async function sell(id) {
  const p = state.products.find((x) => x.id === id); if (!p) return;
  const amt = prompt(`Sell how many ${p.unit} of "${p.name}"?  (in stock: ${p.quantity})`);
  if (amt == null || amt === "") return;
  await store.decreaseInventory(id, amt);
}

async function saveVisit(destId) {
  const dest = state.destinations.find((x) => x.id === destId); if (!dest) return;
  const items = $$(`#vf-${destId} [data-sold]`).map((i) => {
    const qty = Number(i.value), p = state.products.find((x) => x.id === i.dataset.sold);
    return qty > 0 && p ? { productId: p.id, name: p.name, unit: p.unit, qty } : null;
  }).filter(Boolean);
  await store.markVisited(dest, items, state.profile, "");
  $("#vf-" + destId)?.classList.add("hidden");
}

async function changeUnit(id) {
  const p = state.products.find((x) => x.id === id);
  const unit = prompt("Unit (kg, g, mg, litre, ml, piece, or custom):", p?.unit || "piece");
  if (unit) await store.setProductUnit(id, unit.trim());
}

async function showHistory(uid) {
  const box = $("#histBox"); box.innerHTML = empty("Loading…");
  const h = await store.userHistory(uid);
  box.innerHTML = `<h4>History</h4>` + (h.map((x) => `<div class="card">
    <strong>${esc(x.destName)}</strong> <span class="muted">${fmtDate(x.visitedAt)}</span>
    <div class="muted">${(x.items || []).map((i) => `${esc(i.name)}: ${i.qty} ${esc(i.unit || "")}`).join(", ") || "—"}</div>
  </div>`).join("") || empty("No visits."));
}
