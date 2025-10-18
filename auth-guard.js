// auth-guard.js  (ES module)
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
  import { app } from "./firebase-init.js"; // must export your initialized app
  
  // ---- Singletons ----
  const auth = getAuth(app);
  const db   = getFirestore(app);
  
  // Avoid double init across pages
  if (!window.__ironpump_authguard_initialized) {
    window.__ironpump_authguard_initialized = true;
  }
  
  // --- Session-only login: stay signed in ONLY while tab/app is open ---
  if (!window.__ironpump_session_persisted) {
    try {
      await setPersistence(auth, browserSessionPersistence);
      window.__ironpump_session_persisted = true;
      console.log("[AuthGuard] Using session persistence (tab lifetime).");
    } catch (e) {
      console.error("[AuthGuard] setPersistence failed:", e);
    }
  }
  
  // Public (no-auth) pages
  const PUBLIC_PAGES = new Set([
    "login.html",
    "signup.html",
    "signup-trainer.html",
    "signup-client.html",
    "reset-password.html",
  ]);
  
  // Current file name (default index.html if empty)
  const HERE = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  
  // Minimal event hub for auth listeners
  const listeners = new Set();
  let _currentUser = null;
  let _profileCache = null;
  
  // Resolve once we know initial auth state
  let _resolveAuthReady;
  export const authReady = new Promise((resolve) => { _resolveAuthReady = resolve; });
  
  // ---- Internal helpers ----
  async function fetchProfile(uid) {
    if (!uid) return null;
  
    // Prefer your app profile in /users/{uid}
    try {
      const uref = doc(db, "users", uid);
      const usnap = await getDoc(uref);
      if (usnap.exists()) return { id: uid, ...usnap.data() };
    } catch (e) {
      console.warn("[AuthGuard] /users fetch failed:", e);
    }
  
    // Fallback to /profiles/{uid} if older flow used this
    try {
      const pref = doc(db, "profiles", uid);
      const psnap = await getDoc(pref);
      if (psnap.exists()) return { id: uid, ...psnap.data() };
    } catch (e) {
      console.warn("[AuthGuard] /profiles fetch failed:", e);
    }
  
    return null;
  }
  
  // ---- Boot the guard once and fan out events ----
  let _started = false;
  function startGuard() {
    if (_started) return;
    _started = true;
  
    onAuthStateChanged(auth, async (user) => {
      _currentUser = user || null;
      _profileCache = null; // bust cache on every transition
  
      // Not logged in → kick to login unless public page
      if (!user) {
        if (!PUBLIC_PAGES.has(HERE)) {
          console.warn("[AuthGuard] No user → redirecting to login.html");
          window.location.replace("login.html"); // prevents back into protected page
        }
        if (_resolveAuthReady) { _resolveAuthReady(null); _resolveAuthReady = null; }
        listeners.forEach((cb) => { try { cb(null); } catch {} });
        console.log("[AuthGuard] Signed out");
        return;
      }
  
      // Logged in & currently on login page → redirect by role
      if (HERE === "login.html") {
        console.log("[AuthGuard] Signed in on login.html → checking role redirect");
        try {
          const p = await fetchProfile(user.uid);
          const role = String(p?.role || "").toLowerCase();
          if (role === "trainer") {
            window.location.replace("trainer-dashboard.html");
          } else {
            window.location.replace("index.html");
          }
        } catch {
          window.location.replace("index.html"); // safe default
        }
      }
  
      if (_resolveAuthReady) { _resolveAuthReady(user); _resolveAuthReady = null; }
  
      // fan out to listeners (trainer dashboard, index, etc.)
      listeners.forEach((cb) => {
        try { cb(user); } catch (e) { console.error("[AuthGuard] onAuth listener error:", e); }
      });
      console.log("[AuthGuard]", `Authenticated: ${user.email || user.uid}`);
    });
  }
  
  // ---- Public API used by your pages ----
  async function init() {
    startGuard();
  }
  
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
      role: p?.role || "",  // "trainer" | "client" | ...
      ...p,
    };
    _profileCache = merged;
    return merged;
  }
  
  async function requireRole(role) {
    // Wait until we know who the user is
    const u = await authReady;
    if (!u) return; // already redirected to login
  
    const p = await getProfile();
    if (!p || !p.role) {
      console.warn("[AuthGuard] No role on profile; UI may restrict features.");
      return;
    }
    if (String(p.role).toLowerCase() !== String(role).toLowerCase()) {
      console.warn(`[AuthGuard] Role mismatch: need ${role}, have ${p.role}. Redirecting to index.html`);
      window.location.replace("index.html");
    }
  }
  
  async function signOut() {
    await fbSignOut(auth);
    window.location.replace("login.html");
  }
  
  // Expose globally for compat pages/scripts
  window.AuthGuard = {
    init,
    onAuth,
    getProfile,
    requireRole,
    signOut,
    get currentUser() { return _currentUser; },
  };
  
  // Kick off immediately
  init();
  