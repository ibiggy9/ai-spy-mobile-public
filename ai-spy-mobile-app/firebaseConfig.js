// Import the functions you need from the SDKs you need
import { initializeApp, getApps } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { getStorage } from 'firebase/storage';
import { getFirestore, Timestamp, FieldValue } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

// Replace with your actual Firebase config
const firebaseConfig = {
  apiKey: 'your_firebase_api_key_here',
  authDomain: 'your-project-id.firebaseapp.com',
  projectId: 'your-project-id',
  storageBucket: 'your-project-id.firebasestorage.app',
  messagingSenderId: 'your_messaging_sender_id',
  appId: 'your_app_id',
  measurementId: 'your_measurement_id',
};

export const app = initializeApp(firebaseConfig);

// Firebase Analytics (optional)
let firebaseAnalytics = null;
try {
  if (typeof window !== 'undefined') {
    firebaseAnalytics = getAnalytics(app);
  }
} catch (error) {
  console.log('Analytics not available:', error);
}

export { firebaseAnalytics };
export default app;
