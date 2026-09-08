import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';
import { ConfirmationProvider } from './components/ConfirmationProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfirmationProvider><App /></ConfirmationProvider>
  </StrictMode>,
);
