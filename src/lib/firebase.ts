import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    projectId: "deepl-corrector-hanchen",
    appId: "1:230592278350:web:769551bf60c67acdca781f",
    storageBucket: "deepl-corrector-hanchen.firebasestorage.app",
    apiKey: "AIzaSyDkHv4qbQksbMsMooCJQQ2g7bWmxiXXgCc",
    authDomain: "deepl-corrector-hanchen.firebaseapp.com",
    messagingSenderId: "230592278350",
};

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
