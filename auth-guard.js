// auth-guard.js — role-aware & bounce-proof for merged signup flow

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

// ---- Routing helpers (NEW default client-dashboard) ----
const ROUTE_BY_ROLE = {
  trainer: "trainer-dashboard.html",
  client:  "client-dashboard.html",
};

const ROLE_REQUIRED_BY_PAGE = {
  "trainer-dashboard.html": "trainer",
  "trainer-program-builder.html": "trainer",
  "client-dashboard.html": "client",
  // add more as needed:
  // "client-progress.html": "client",
};

const PUBLIC_PAGES = new Set([
  "login.html",
  "signup.html",          // merged toggle page
  "reset-password.html",
]);

const HERE = (location.pathname.split("/").pop() || "client-dashboard.html").toLowerCase();

function go(href) {
  window.location.replace(href);
}

// ---- Welcome/hold redirect support (signup overlays) ----
// Your merged signup uses these flags while the overlay is showing:
const JUST_CLIENT_KEY  = "ironpump_client_justSignedUp";
const JUST_TRAINER_KEY = "ironpump_trainer_justSignedUp";

// (Optional generic hold, still supported if you set it anywhere else)
const HOLD_KEY = "ironpump_welcome_hold_ms";
const HOLD_MAX_AGE_MS = 6000;

function setHold(msFromNow = 1500) {
  try { sessionStorage.setItem(HOLD_KEY, String(Date.now() + Math.max(0, msFromNow))); } catch {}
}
function clearHold() { try { sessionStorage.removeItem(HOLD_KEY); } catch {} }
function isGenericHoldActive() {
  try {
    const until = Number(sessionStorage.getItem(HOLD_KEY) || "0");
    if (!until) return false;
    if (Date.now() - until > HOLD_MAX_AGE_MS) { clearHold(); return false; }
    return Date.now() < until;
  } catch { return false; }
}
// Consider the signup overlay "active" if either of the JUST_* flags is present
function isSignupOverlayActive() {
  try {
    return (
      sessionStorage.getItem(JUST_CLIENT_KEY) === "1" ||
      sessionStorage.getItem(JUST_TRAINER_KEY) === "1"
    );
  } catch { return false; }
}

window.__IronpumpHoldRedirect = { set: setHold, clear: clearHold, active: () => isGenericHoldActive() || isSignupOverlayActive() };

// ---- Last-known-role cache ----
const LAST_ROLE_KEY = "ironpump_lastRole";
function setLastRole(role) {
  try {
    if (!role) return;
    sessionStorage.setItem(LAST_ROLE_KEY, role);
    localStorage.setItem(LAST_ROLE_KEY, role);
  } catch {}
}
function getLastRole() {
  try {
    return (
      sessionStorage.getItem(LAST_ROLE_KEY) ||
      localStorage.getItem(LAST_ROLE_KEY) ||
      ""
    ).toLowerCase();
  } catch { return ""; }
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
  const fromTopLevel = String(p?.role || "").trim().toLowerCase();
  if (fromTopLevel) return fromTopLevel;
  const arr = Array.isArray(p?.roles) ? p.roles : [];
  const first = String(arr[0] || "").trim().toLowerCase();
  return first || "";
}

function routeForRole(role) {
  return ROUTE_BY_ROLE[role] || ROUTE_BY_ROLE.client;
}

// ---- Boot guard once ----
let _started = false;
function startGuard() {
  if (_started) return;
  _started = true;

  setupSessionPersistenceOnce();

  onAuthStateChanged(auth, async (user) => {
    _currentUser = user || null;
    _profileCache = null;

    // Not logged in
    if (!user) {
      if (!PUBLIC_PAGES.has(HERE)) {
        console.warn("[AuthGuard] No user → redirecting to login.html");
        go("login.html");
      }
      if (_resolveAuthReady) { _resolveAuthReady(null); _resolveAuthReady = null; }
      listeners.forEach((cb) => { try { cb(null); } catch {} });
      return;
    }

    // Logged in: fetch profile role (may lag with rules)
    let profile = null;
    try { profile = await fetchProfile(user.uid); } catch (e) { console.warn("[AuthGuard] fetchProfile error:", e); }

    const roleFromProfile = normalizedRole(profile);
    if (roleFromProfile) setLastRole(roleFromProfile);
    const role = roleFromProfile || getLastRole() || "client";

    // On public page: go to dashboard unless overlay/hold is active
    if (PUBLIC_PAGES.has(HERE)) {
      if (isGenericHoldActive() || isSignupOverlayActive()) {
        console.log("[AuthGuard] Hold/Overlay active — staying on public page.");
      } else {
        const dest = routeForRole(role);
        console.log(`[AuthGuard] Signed in on public page → ${dest}`);
        go(dest);
        if (_resolveAuthReady) { _resolveAuthReady(user); _resolveAuthReady = null; }
        return;
      }
    }

    // Enforce role if page demands it
    const required = ROLE_REQUIRED_BY_PAGE[HERE] || inferRoleByFilename(HERE);
    if (required) {
      if (role === required) {
        // OK
      } else if (!roleFromProfile && getLastRole() === required) {
        console.warn(`[AuthGuard] Using cached role="${required}" while profile is unavailable — allowing access.`);
      } else {
        console.warn(`[AuthGuard] Role mismatch: need ${required}, have ${role || "(none)"} → redirecting`);
        go(routeForRole(role));
        if (_resolveAuthReady) { _resolveAuthReady(user); _resolveAuthReady = null; }
        return;
      }
    }

    if (_resolveAuthReady) { _resolveAuthReady(user); _resolveAuthReady = null; }

    // Fan out
    listeners.forEach((cb) => {
      try { cb(user); } catch (e) { console.error("[AuthGuard] onAuth listener error:", e); }
    });
    console.log("[AuthGuard] Authenticated:", user.email || user.uid, role ? `role=${role}` : "(no role)");
  });
}

// Optional: infer role by filename prefix (helps protect additional pages without editing map)
function inferRoleByFilename(filename) {
  if (filename.startsWith("trainer-")) return "trainer";
  if (filename.startsWith("client-"))  return "client";
  return null;
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
    role: normalizedRole(p) || "",
    ...p,
  };
  _profileCache = merged;
  return merged;
}

async function requireRole(role) {
  const u = await authReady;
  if (!u) return; // already redirected to login
  const p = await getProfile();
  const have = normalizedRole(p) || getLastRole();
  if (role && have !== String(role).toLowerCase()) {
    console.warn(`[AuthGuard] requireRole(${role}) failed (have=${have || "(none)"}) → redirect`);
    go(routeForRole(have || "client"));
  }
}

async function signOut() {
  await fbSignOut(auth);
  go("login.html");
}

window.AuthGuard = {
  init,
  onAuth,
  getProfile,
  requireRole,
  signOut,
  get currentUser() { return _currentUser; },
};

init();
