import { NavLink, Route, Routes } from 'react-router-dom';
import Live from './pages/Live.jsx';
import History from './pages/History.jsx';

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-dot" />
          Speech to Text
          <span className="brand-sub">multilingual live transcription</span>
        </div>
        <nav>
          <NavLink to="/" end>Live</NavLink>
          <NavLink to="/history">History</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Live />} />
          <Route path="/history" element={<History />} />
        </Routes>
      </main>
    </div>
  );
}
