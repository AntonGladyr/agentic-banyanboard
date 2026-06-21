/**
 * client/src/main.tsx — SPA entry point (TASK-006 Phase 2).
 *
 * Bootstraps the React root: installs the global error handlers (Architecture creative Q4), imports
 * the design tokens + global styles once, and mounts the app inside the root `ErrorBoundary` and
 * `BrowserRouter`. `StrictMode` surfaces unsafe lifecycles during development.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import './styles/tokens.css';
import './styles/globals.css';

import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary';
import { installGlobalErrorHandlers } from './observability/errorReporter';

installGlobalErrorHandlers();

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
