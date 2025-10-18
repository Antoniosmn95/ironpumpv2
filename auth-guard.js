// auth-guard.js
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { app } from "./firebase-init.js"; // make sure firebase-init.js is in the same folder

const auth = getAuth(app);

// Optional: show a short message while checking auth
console.log("[AuthGuard] Checking authentication...");

onAuthStateChanged(auth, (user) => {
  if (!user) {
    console.warn("[AuthGuard] No user found → redirecting to login.html");
    window.location.replace("login.html");
  } else {
    console.log("[AuthGuard] User authenticated:", user.email || user.uid);
  }
});
