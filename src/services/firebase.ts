import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: "AIzaSyBXIXfqvxWjFHzeURzKgSv0t8Mouz9Q_ak",
  authDomain: "tenis-rezervasyon-81a28.firebaseapp.com",
  projectId: "tenis-rezervasyon-81a28",
  storageBucket: "tenis-rezervasyon-81a28.firebasestorage.app",
  messagingSenderId: "208140638479",
  appId: "1:208140638479:web:0e201a3efb1896b364c67a",
  measurementId: "G-5K8GQRF8SF"
};

export const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const functions = getFunctions(app);
