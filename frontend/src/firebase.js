import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDr7Lja-huI2e4-qjPt_qPFRHBOKihMJGY",
  authDomain: "gestionale-hr.firebaseapp.com",
  projectId: "gestionale-hr",
  storageBucket: "gestionale-hr.appspot.com",
  messagingSenderId: "509816739539",
  appId: "1:509816739539:web:a9bdc0c29880d143636626"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
