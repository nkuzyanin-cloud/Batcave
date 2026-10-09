import { createRoot } from 'react-dom/client';
import { Component, Suspense, type ReactNode } from 'react';
import App from './App';
import './styles.css';
class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="boot">
        <h1>Архив не удалось открыть</h1>
        <p>Перезапустите приложение. Локальные файлы не удалены.</p>
        <button onClick={() => location.reload()}>Открыть заново</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <Suspense
      fallback={
        <div className="boot">
          <span className="spinner" />
          <p>Загрузка…</p>
        </div>
      }
    >
      <App />
    </Suspense>
  </ErrorBoundary>,
);
