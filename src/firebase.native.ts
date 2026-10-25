import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
// Firebase's browser type entry omits this React Native export. Metro resolves the RN entry at runtime.
// @ts-ignore React Native-only Firebase export.
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
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
let nativeAuth;
try {
  nativeAuth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
} catch (error) {
  if ((error as { code?: string }).code !== 'auth/already-initialized') throw error;
  nativeAuth = getAuth(app);
}
export const auth = nativeAuth;
export const db = getFirestore(app);
