// firebase-init.js
// Single source of truth for Firebase initialization (modular v12 SDK)

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyC__WTjynMQABP5M9GUQ19-PAJOIrh5dkw",
  authDomain: "ironpump-gym-tracker.firebaseapp.com",
  projectId: "ironpump-gym-tracker",
  // If you created a custom bucket name, you can replace this with it.
  // Otherwise keep the default appspot bucket.
  storageBucket: "ironpump-gym-tracker.appspot.com",
  messagingSenderId: "267000647709",
  appId: "1:267000647709:web:5b83150b042c3e65ff76f4",
  measurementId: "G-BG3TDDWXZH",
};

// Initialize (guard against re-init in multi-bundle setups)
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Core services (singletons)
export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const storage = getStorage(app);

// Optional nicety: use device/browser language for Auth emails
try { auth.useDeviceLanguage?.(); } catch { /* noop */ }

console.log("[Firebase] initialized:", app.name);
