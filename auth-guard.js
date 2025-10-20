// auth-guard.js  — role-based router for IronPump (GitHub Pages friendly)

import {
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { app } from "./firebase-init.js";

// --- Firebase handles ---
const auth = getAuth(app);
const db = getFirestore(app);

// --- Public pages (no login required) ---
const PUBLIC_PAGES = new Set(["index.html", "login.html", "signup.html", ""]);

// --- Role home destinations ---
const HOME_BY_ROLE = {
  client: "client-dashboard.html",
  trainer: "trainer-dashboard.html",
};

// --- Utility: current file name (works on GitHub Pages subpaths) ---
function here() {
  const fname = location.pathname.split("/").pop();
  return fname || "index.html";
}

// --- Utility: is one of our dashboards? ---
function isDashboard(page) {
  return page === "client-dashboard.html" || page === "trainer-dashboard.html";
}

// --- Utility: soft navigate (avoid redirect loops on GH Pages) ---
function go(page) {
  if (here() !== page) location.href = page;
}

// --- Get user role from Firestore (users/{uid}.role or profiles/{uid}.role) ---
async function fetchUserRole(uid) {
  // Try /users/{uid}
  let snap = await getDoc(doc(db, "users", uid));
  if (snap.exists()) {
    const r = snap.data()?.role;
    if (r === "trainer" || r === "client") return r;
  }
  // Fallback /profiles/{uid}
  snap = await getDoc(doc(db, "profiles", uid));
  if (snap.exists()) {
    const r = snap.data()?.role;
    if (r === "trainer" || r === "client") return r;
  }
  // Default (be explicit so misconfigured accounts still land somewhere)
  return "client";
}

// --- Ensure session-only persistence (tab scope) ---
if (!window.__ironpump_session_persisted) {
  try {
    await setPersistence(auth, browserSessionPersistence);
    window.__ironpump_session_persisted = true;
    console.log("[AuthGuard] Session persistence enabled.");
  } catch (e) {
    console.error("[AuthGuard] setPersistence failed:", e);
  }
}

// --- Main gate ---
onAuthStateChanged(auth, async (user) => {
  const page = here();

  // Not signed in
  if (!user) {
    if (!PUBLIC_PAGES.has(page)) {
      go("login.html");
    }
    return;
  }

  // Signed in → fetch role and route
  let role = "client";
  try {
    role = await fetchUserRole(user.uid);
  } catch (e) {
    console.error("[AuthGuard] Could not read role; defaulting to client.", e);
  }

  const home = HOME_BY_ROLE[role] || "client-dashboard.html";

  // If on a public page while signed in → go home by role
  if (PUBLIC_PAGES.has(page)) {
    go(home);
    return;
  }

  // If on a dashboard but it doesn't match role → correct it
  if (isDashboard(page) && page !== home) {
    go(home);
    return;
  }

  // If on some protected non-dashboard page, allow it to load
  // (e.g., profile-client.html, trainer-program-builder.html).
  console.log(`[AuthGuard] Access granted to ${page} as ${role}.`);
});

// --- Export a simple sign-out helper you can call from any page ---
export const AuthGuard = {
  async signOut() {
    try {
      await signOut(auth);
    } finally {
      go("login.html");
    }
  },
};
