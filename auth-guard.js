// auth-guard.js  (ES module, modular SDK)
import {
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence,
  signOut as fbSignOut,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { app } from "./firebase-init.js";

// ---- Singletons ----
const auth = getAuth(app);
const db   = getFirestore(app);

// ---- Routing helpers ----
const ROUTE_BY_ROLE = {
  trainer: "trainer-dashboard.html",
  client:  "index.html",
};

const ROLE_REQUIRED_BY_PAGE = {
  "trainer-dashboard.html": "trainer",
  "trainer-program-builder.html": "trainer",
  // add more if you want to hard-gate them by role
};

const PUBLIC_PAGES = new Set([
  "login.html",
  "signup.html",
  "signup-trainer.html",
  "signup-client.html",
  "reset-password.html",
]);

// Current file name (default to index.html if empty like '/')
const HERE = (location.pathname.split("/").pop() || "index.html").toLowerCase();

function go(href) {
  // Use replace to prevent going "back" into a protected page
  window.location.replace(href);
}

// ---- Minimal event hub ----
const listeners = new Set();
let _currentUser = null;
let _profileCache = null;

// Promise that resolves when initial auth state is known
let _resolveAuthReady;
export const authReady = new Promise((resolve) => { _resolveAuthReady = resolve; });

// ---- Utils ----
async function setupSessionPersistenceOnce() {
  if (window.__ironpump_session_persisted) return;
  try {
    await setPersistence(auth, browserSessionPersistence);
    window.__ironpump_session_persisted = true;
    console.log("[AuthGuard] Using session persistence (tab lifetime).");
  } catch (e) {
    console.error("[AuthGuard] setPersistence failed:", e);
  }
}

async function fetchProfile(uid) {
  if (!uid) return null;

  // Preferred: /users/{uid}
  try {
    const uref = doc(db, "users", uid);
    const usnap = await getDoc(uref);
    if (usnap.exists()) return { id: uid, ...usnap.data() };
  } catch (e) {
    console.warn("[AuthGuard] /users fetch failed:", e);
  }

  // Fallback: /profiles/{uid}
  try {
    const pref = doc(db, "profiles", uid);
    const psnap = await getDoc(pref);
    if (psnap.exists()) return { id: uid, ...psnap.data() };
  } catch (e) {
    console.warn("[AuthGuard] /profiles fetch failed:", e);
  }

  return null;
}

function normalizedRole(p) {
  return String(p?.role || "").trim().toLowerCase();
}

function routeForRole(role) {
  return ROUTE_BY_ROLE[role] || "index.html";
}

// ---- Boot guard once ----
let _started = false;
function startGuard() {
  if (_started) return;
  _started = true;

  // Ensure session-only persistence (no top-level await)
  setupSessionPersistenceOnce();

  onAuthStateChanged(auth, async (user) => {
    _currentUser = user || null;
    _profileCache = null; // bust on transitions

    // Not logged in → allow public, block protected
    if (!user) {
      if (!PUBLIC_PAGES.has(HERE)) {
        console.warn("[AuthGuard] No user → redirecting to login.html");
        go("login.html");
      }
      if (_resolveAuthReady) { _resolveAuthReady(null); _resolveAuthReady = null; }
      listeners.forEach((cb) => { try { cb(null); } catch {} });
      return;
    }

    // Logged in
    let profile = null;
    try {
      profile = await fetchProfile(user.uid);
    } catch (e) {
      console.warn("[AuthGuard] fetchProfile error:", e);
    }
    const role = normalizedRole(profile);

    // If on a public page (e.g., login/signup), bounce to the right dashboard
    if (PUBLIC_PAGES.has(HERE)) {
      const dest = routeForRole(role);
      console.log(`[AuthGuard] Signed in on public page → ${dest}`);
      go(dest);
      if (_resolveAuthReady) { _resolveAuthReady(user); _resolveAuthReady = null; }
      return;
    }

    // If current page demands a specific role, enforce it
    const required = ROLE_REQUIRED_BY_PAGE[HERE];
    if (required && role !== required) {
      console.warn(`[AuthGuard] Role mismatch: need ${required}, have ${role || "(none)"} → redirecting`);
      go(routeForRole(role));
      if (_resolveAuthReady) { _resolveAuthReady(user); _resolveAuthReady = null; }
      return;
    }

    if (_resolveAuthReady) { _resolveAuthReady(user); _resolveAuthReady = null; }

    // Fan out to page listeners (dashboards, etc.)
    listeners.forEach((cb) => {
      try { cb(user); } catch (e) { console.error("[AuthGuard] onAuth listener error:", e); }
    });
    console.log("[AuthGuard] Authenticated:", user.email || user.uid, role ? `role=${role}` : "(no role)");
  });
}

// ---- Public API for pages ----
async function init() { startGuard(); }

function onAuth(cb) {
  if (typeof cb === "function") listeners.add(cb);
  return () => listeners.delete(cb);
}

async function getProfile() {
  if (!_currentUser) return null;
  if (_profileCache) return _profileCache;

  const p = await fetchProfile(_currentUser.uid);
  const merged = {
    uid: _currentUser.uid,
    email: _currentUser.email || p?.email || "",
    fullName: p?.fullName || _currentUser.displayName || "",
    photoURL: p?.photoURL || _currentUser.photoURL || "",
    role: p?.role || "",
    ...p,
  };
  _profileCache = merged;
  return merged;
}

async function requireRole(role) {
  const u = await authReady;
  if (!u) return; // already redirected to login
  const p = await getProfile();
  const have = normalizedRole(p);
  if (role && have !== String(role).toLowerCase()) {
    console.warn(`[AuthGuard] requireRole(${role}) failed (have=${have}) → redirect`);
    go(routeForRole(have));
  }
}

async function signOut() {
  await fbSignOut(auth);
  go("login.html");
}

// Expose globally (so inline scripts can call it)
window.AuthGuard = {
  init,
  onAuth,
  getProfile,
  requireRole,
  signOut,
  get currentUser() { return _currentUser; },
};

// Kick off
init();
