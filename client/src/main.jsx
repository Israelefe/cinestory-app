import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import AppErrorBoundary from './components/AppErrorBoundary.jsx';
import { installPageLoadRecovery } from './utils/pageLoadRecovery.js';
import './index.css';
import './styles/public.css';
import './styles/site-ux.css';
import './styles/client-polish.css';
import './styles/account-polish.css';
import './styles/creation-polish.css';
import './styles/workspace-polish.css';

installPageLoadRecovery();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </React.StrictMode>
);
