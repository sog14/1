import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize the Firebase app
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and export it with ignoreUndefinedProperties and custom databaseId enabled
const databaseId = (firebaseConfig as any).firestoreDatabaseId || '(default)';
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true
}, databaseId);
