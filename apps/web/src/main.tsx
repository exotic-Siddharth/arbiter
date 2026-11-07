import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { bindQueryClientToAuth } from '@/lib/queryClient';
import { useAuth } from '@/stores/auth';
import '@/stores/theme';
import { App } from './App';

// Silent refresh on boot (spec 13.2); requests wait for it, so the first page loads signed in.
void useAuth.getState().bootstrap();
// Refetch user-specific data whenever the signed-in identity changes.
bindQueryClientToAuth();

const container = document.getElementById('root');
if (!container) throw new Error('index.html is missing #root');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
