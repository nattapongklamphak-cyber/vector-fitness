import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyC3ZRf-O1-DJyL3-rtt9c6hPzh43-oyMPI",
  authDomain: "vector-fitness.firebaseapp.com",
  projectId: "vector-fitness",
  storageBucket: "vector-fitness.firebasestorage.app",
  messagingSenderId: "647755524250",
  appId: "1:647755524250:web:0507ce11ce5ec7f9245723"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
