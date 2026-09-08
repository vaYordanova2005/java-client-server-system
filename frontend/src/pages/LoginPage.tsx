import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { extractErrorMessage } from '../api/client';

// Always-seeded restricted demo accounts (see RestrictedDemoAccountSeeder /
// README "Restricted demo accounts") — the password is public by design,
// nothing here is a secret.
const DEMO_PASSWORD = 'password12345';
const DEMO_ACCOUNTS = [
  { label: 'Демо учител', username: 'teacher@uni-sofia.bg' },
  { label: 'Демо ученик', username: 'student@uni-sofia.bg' },
] as const;

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showForgotHint, setShowForgotHint] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const signIn = async (loginUsername: string, loginPassword: string) => {
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(loginUsername, loginPassword);
      navigate(`/${user.role.toLowerCase()}`, { replace: true });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void signIn(username, password);
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-avatar">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M4.5 20c0-3.5 3.36-6 7.5-6s7.5 2.5 7.5 6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <h1 className="login-title">Markly</h1>
        <label className="login-field">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M5 19.5c0-3 3.13-5.3 7-5.3s7 2.3 7 5.3"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Потребителско име"
            required
            autoFocus
          />
        </label>
        <label className="login-field">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect x="5" y="10.5" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
            <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Парола"
            required
          />
          <button
            type="button"
            className="login-eye-toggle"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Скрий паролата' : 'Покажи паролата'}
          >
            {showPassword ? (
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path
                  d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path
                  d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.6" />
                <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </label>
        <button
          type="button"
          className="login-forgot"
          onClick={() => setShowForgotHint((v) => !v)}
        >
          Забравена парола?
        </button>
        {showForgotHint && (
          <p className="login-forgot-hint">Свържете се с администратор за възстановяване на паролата.</p>
        )}
        {error && <p className="error">{error}</p>}
        <button type="submit" className="login-btn" disabled={submitting}>
          {submitting ? 'Вход...' : 'Вход'}
        </button>
        <div className="login-demo-divider">
          <span>или вижте демо</span>
        </div>
        <div className="login-demo-buttons">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.username}
              type="button"
              className="login-demo-btn"
              disabled={submitting}
              onClick={() => void signIn(account.username, DEMO_PASSWORD)}
            >
              {account.label}
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
