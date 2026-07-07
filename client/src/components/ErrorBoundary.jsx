import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[Crownfall crash]', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          position: 'fixed', inset: 0, background: '#0a0c18',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 16, padding: 32, color: '#e2e8f0',
          fontFamily: 'monospace',
        }}>
          <div style={{ fontSize: '2rem' }}>💥</div>
          <div style={{ fontSize: '1.1rem', color: '#fc8181', fontWeight: 700 }}>
            Something crashed
          </div>
          <pre style={{
            background: '#13162a', border: '1px solid #2a2f50',
            borderRadius: 8, padding: 16, fontSize: '0.78rem',
            color: '#fc8181', maxWidth: 600, overflow: 'auto',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack?.split('\n').slice(0, 8).join('\n')}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              padding: '10px 24px', background: '#f6c90e', color: '#000',
              fontWeight: 700, border: 'none', borderRadius: 8, cursor: 'pointer',
            }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
