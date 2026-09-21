import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css?list-design=20260912-3';
import './components/LearningList.css';
import './components/WorkspaceLayout.css';
import './components/EntryNavigation.css';
import './components/PageTemplates.css';
import App from './App';
import { ConfirmationProvider } from './components/ConfirmationProvider';
import { initializeAnalytics, trackPageView } from './lib/analytics';

initializeAnalytics();
trackPageView();
window.addEventListener('hashchange', () => trackPageView());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfirmationProvider><App /></ConfirmationProvider>
  </StrictMode>,
);
