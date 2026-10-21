import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router';
import './style.css';
import { Accounts } from './accounts';

function Status() {
  const [status, setStatus] = useState('Checking service…');
  const [checking, setChecking] = useState(false);
  async function check(signal?: AbortSignal) {
    setChecking(true);
    setStatus('Checking service…');
    try {
      const response = await fetch('/api/health/ready', { signal });
      if (!response.ok) throw new Error('Service unavailable');
      setStatus('API and database are ready.');
    } catch {
      if (!signal?.aborted) setStatus('Service unavailable. Please try again.');
    } finally {
      if (!signal?.aborted) setChecking(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void check(controller.signal);
    return () => controller.abort();
  }, []);
  return (
    <section aria-labelledby="status-heading">
      <h2 id="status-heading">Service status</h2>
      <p role="status">{status}</p>
      <button disabled={checking} onClick={() => void check()}>
        Check again
      </button>
    </section>
  );
}

function App() {
  return (
    <main>
      <p className="eyebrow">A shared household shopping list</p>
      <h1>Cartmates</h1>
      <p>
        Keep your household shopping in one place. Create an account to get
        started.
      </p>
      <nav aria-label="Main navigation">
        <Link to="/">Home</Link>
        <Link to="/status">Service status</Link>
        <Link to="/account">Your account</Link>
        <Link to="/login">Log in</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Status />} />
        <Route path="/status" element={<Status />} />
        <Route path="/login" element={<Accounts />} />
        <Route path="/register" element={<Accounts />} />
        <Route path="/account" element={<Accounts />} />
        <Route path="*" element={<h2>Page not found</h2>} />
      </Routes>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
