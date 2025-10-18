// firebase-init.js
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
// If you’ll use Storage later:
// import { getStorage } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyC__WTjynMQABP5M9GUQ19-PAJOIrh5dkw",
  authDomain: "ironpump-gym-tracker.firebaseapp.com",
  projectId: "ironpump-gym-tracker",
  storageBucket: "ironpump-gym-tracker.appspot.com", // <-- use the appspot.com bucket
  messagingSenderId: "267000647709",
  appId: "1:267000647709:web:5b83150b042c3e65ff76f4",
  measurementId: "G-BG3TDDWXZH"
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);
// export const storage = getStorage(app); // uncomment if needed

console.log("[Firebase] initialized:", app.name);