import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };

  const hasFirebaseConfig = Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
  );

  const define = {
    // Keep the collection path stable outside the Gemini runtime.
    __app_id: JSON.stringify(env.VITE_FIREBASE_DATASET_ID || 'default-app-id'),
  };

  if (hasFirebaseConfig) {
    // The existing application parses this global as a JSON string.
    define.__firebase_config = JSON.stringify(JSON.stringify(firebaseConfig));
  }

  return {
    plugins: [react()],
    define,
  };
});
