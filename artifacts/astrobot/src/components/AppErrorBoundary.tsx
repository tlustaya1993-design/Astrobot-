import React from 'react';

type Props = { children: React.ReactNode };

type State = { error: Error | null };

/**
 * Prevents a render-time throw (common on restricted Android WebViews) from
 * leaving a blank white page with no recovery UI.
 */
export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[AstroBot] render error', error);
  }

  private handleReload = () => {
    try {
      localStorage.removeItem('sw_version');
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: '#2D2152',
          color: '#fff',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          gap: 12,
        }}
      >
        <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Не удалось открыть AstroBot</p>
        <p style={{ fontSize: 14, opacity: 0.85, margin: 0, maxWidth: 320, lineHeight: 1.45 }}>
          На части Android-браузеров (особенно внутри Telegram/VK) мешает ограниченное хранилище
          или старая версия Chrome. Откройте сайт в обычном Chrome или обновите браузер.
        </p>
        <button
          type="button"
          onClick={this.handleReload}
          style={{
            marginTop: 8,
            padding: '12px 20px',
            borderRadius: 12,
            border: 'none',
            background: '#E8C36A',
            color: '#1a1230',
            fontWeight: 600,
            fontSize: 15,
          }}
        >
          Обновить страницу
        </button>
      </div>
    );
  }
}
