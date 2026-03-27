import React from 'react';
import { Alert } from 'antd';

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
  };

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return {
      hasError: true,
    };
  }

  public componentDidCatch(error: Error) {
    console.error('Iframe page component crashed', error);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <Alert
          type="error"
          showIcon
          message="Module unavailable"
          description="This section failed to render. Refresh the page and try again."
        />
      );
    }

    return this.props.children;
  }
}

export const withErrorBoundary = <P extends object>(Component: React.ComponentType<P>) => {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name || 'Component'})`;

  return WrappedComponent;
};
