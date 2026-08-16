import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// ⬇️ 把這裡換成你自己 Firebase 專案「網頁 App」的設定值
// (Firebase 主控台 → 專案設定 → 一般 → 你的應用程式 → SDK 設定與程式碼)
const firebaseConfig = {
  apiKey: "AIzaSyCbJtLdAs1rBPHy-EUbqLa9akYWU69L6W4",
  authDomain: "vocab-card-c688c.firebaseapp.com",
  projectId: "vocab-card-c688c",
  storageBucket: "vocab-card-c688c.firebasestorage.app",
  messagingSenderId: "146542755198",
  appId: "1:146542755198:web:e7a27f3f25acf513c3472f",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);


