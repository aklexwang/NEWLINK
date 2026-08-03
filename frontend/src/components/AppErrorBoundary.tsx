import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Prevent full white-screen when a provider throws in Telegram WebView. */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-white px-6 text-center">
          <p className="text-lg font-bold text-slate-900">화면을 불러오지 못했습니다</p>
          <p className="max-w-sm text-sm text-slate-600">
            {this.state.error.message || '알 수 없는 오류가 발생했습니다.'}
          </p>
          <button
            type="button"
            className="mt-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"
            onClick={() => window.location.reload()}
          >
            다시 시도
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
