import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBMIKZNXXvmLWUBDHiZ1Wy4InmoHOF4Grs",
  authDomain: "blockparty-c0370.firebaseapp.com",
  databaseURL: "https://blockparty-c0370-default-rtdb.firebaseio.com",
  projectId: "blockparty-c0370",
  storageBucket: "blockparty-c0370.appspot.com",
  messagingSenderId: "1088939169987",
  appId: "1:1088939169987:web:3cc9f35650c3cebfd82a76",
  measurementId: "G-7E6WFD3DPN",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
