import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './context/AuthContext';
import App from './App.tsx';
import './index.css';

const rawClientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || (import.meta as any).env?.GOOGLE_CLIENT_ID || '';
const googleClientId = rawClientId && rawClientId !== 'your-google-client-id' ? rawClientId : 'unconfigured-google-client-id.apps.googleusercontent.com';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={googleClientId}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </GoogleOAuthProvider>
  </StrictMode>,
);
