// firebase-init.js
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC__WTjynMQABP5M9GUQ19-PAJOIrh5dkw",
  authDomain: "ironpump-gym-tracker.firebaseapp.com",
  projectId: "ironpump-gym-tracker",
  storageBucket: "ironpump-gym-tracker.firebasestorage.app",
  messagingSenderId: "267000647709",
  appId: "1:267000647709:web:5b83150b042c3e65ff76f4",
  measurementId: "G-BG3TDDWXZH"
};

// Initialize Firebase
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// Log for debugging
console.log("[Firebase] initialized:", app.name);