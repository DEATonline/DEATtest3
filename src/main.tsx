import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryState {
  error: Error | null;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: '24px',
            fontFamily: 'system-ui, sans-serif',
            maxWidth: '640px',
            margin: '40px auto',
          }}
        >
          <h1 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>
            Application failed to load
          </h1>
          <p style={{ fontSize: '14px', color: '#475569', marginBottom: '12px' }}>
            {this.state.error.message || 'An unexpected runtime error occurred.'}
          </p>
          <pre
            style={{
              fontSize: '12px',
              background: '#f1f5f9',
              padding: '12px',
              overflowX: 'auto',
              borderRadius: '4px',
            }}
          >
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
