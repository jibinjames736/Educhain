import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDzc4rzr1vYjURProQv7Q1sWWnWOQgNipA",
  authDomain: "cert-verify-b1961.firebaseapp.com",
  projectId: "cert-verify-b1961",
  storageBucket: "cert-verify-b1961.appspot.com",
  messagingSenderId: "494698941714",
  appId: "1:494698941714:web:808a93c8e25fb0ed75b7cb",
  measurementId: "G-Q45GY8LTLQ",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// 🔑 EXPORT FIRESTORE INSTANCE (THIS FIXES YOUR ERROR)
export const db = getFirestore(app);
