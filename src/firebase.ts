import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const configured = Object.values(config).every(Boolean);
const app = getApps().length ? getApp() : initializeApp(configured ? config : {
  apiKey: 'missing-config', authDomain: 'missing-config', projectId: 'missing-config',
  appId: 'missing-config',
});
export const auth = getAuth(app);
export const db = getFirestore(app);
