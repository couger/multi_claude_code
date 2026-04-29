import React, { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] 捕获到渲染错误:', error.message, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex items-center justify-center h-screen bg-dark-900 text-dark-300">
          <div className="text-center max-w-md p-8">
            <h2 className="text-lg text-red-400 mb-4">应用遇到错误</h2>
            <p className="text-sm text-dark-400 mb-2">
              {this.state.error?.message || '未知错误'}
            </p>
            <button
              onClick={this.handleReset}
              className="mt-4 px-4 py-2 bg-accent-primary text-white rounded text-sm hover:opacity-90"
            >
              尝试恢复
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
