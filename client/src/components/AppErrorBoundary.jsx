import React from 'react';
import { isPageChunkError, recoverPageLoadOnce } from '../utils/pageLoadRecovery.js';

export default class AppErrorBoundary extends React.Component {
  state = { error: null, errorInfo: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Veylo could not render the app:', error, info);
    if (isPageChunkError(error) && recoverPageLoadOnce('error-boundary')) return;
    this.setState({ errorInfo: info });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className='mx-auto max-w-xl px-6 py-24 text-white'>
        <h1 className='text-2xl font-bold'>Veylo couldn’t open this page.</h1>
        <p className='mt-4 text-base leading-7 text-zinc-300'>Try reloading. If it happens again, the error below can help us find the cause.</p>
        {import.meta.env.DEV && (
          <pre className='mt-5 whitespace-pre-wrap break-words rounded-xl border border-white/20 p-4 text-xs font-mono text-zinc-300'>
            {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
            {this.state.errorInfo?.componentStack}
          </pre>
        )}
        <button onClick={() => window.location.reload()} className='mt-6 rounded-xl bg-[#ff5a47] px-5 py-3 font-bold'>Reload page</button>
      </main>
    );
  }
}
