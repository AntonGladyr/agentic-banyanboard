/**
 * client/src/components/ErrorBoundary/ErrorBoundary.tsx — root React error boundary
 * (TASK-006 Phase 2).
 *
 * Architecture creative Q4: a single app-root boundary prevents the blank-white-screen failure
 * mode (AC-ERROR-* spirit) by catching render/lifecycle errors in the React tree, routing them to
 * the single {@link reportError} sink, and rendering a SAFE fallback UI that exposes no internal
 * detail to the user (Guiding Principle 5 / NFR4).
 *
 * This catches errors thrown during rendering only; data-fetch errors are handled by each page's
 * own error state via the `apiClient` `ApiError` mapping (UI/UX creative Decision Area 8). React
 * has no Hook equivalent for `componentDidCatch`, so this remains a class component by necessity.
 */

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { reportError } from '../../observability/errorReporter';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError('ErrorBoundary', error, { componentStack: info.componentStack });
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div role="alert" style={{ padding: '2rem', textAlign: 'center' }}>
          <h1>Something went wrong</h1>
          <p>An unexpected error occurred. Please reload the page.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
