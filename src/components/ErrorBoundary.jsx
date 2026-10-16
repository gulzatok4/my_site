import { Component } from "react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.compact) {
      return <p className="shop-empty">Эту карточку сейчас нельзя показать.</p>;
    }
    return (
      <main className="error-screen">
        <h1>Что-то пошло не так</h1>
        <p>Обновите страницу. Если так повторится, напишите Гульзат.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Обновить
        </button>
      </main>
    );
  }
}
