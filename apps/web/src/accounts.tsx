import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';

type User = {
  id: string;
  displayName: string;
  email: string;
  createdAt: string;
};
type Failure = {
  code: string;
  message: string;
  fields?: Record<string, string>;
};
async function authRequest(path: string, data?: Record<string, string>) {
  const response = await fetch(`/api/v1/auth/${path}`, {
    method: path === 'me' ? 'GET' : 'POST',
    credentials: 'same-origin',
    ...(data
      ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      : {}),
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw body.error as Failure;
  return body as { user: User } | null;
}

export function Accounts() {
  const location = useLocation();
  const navigate = useNavigate();
  const registering = location.pathname === '/register';
  const privatePage = location.pathname === '/account';
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [focusRequest, setFocusRequest] = useState(0);
  const [values, setValues] = useState({
    displayName: '',
    email: '',
    password: '',
    confirmation: '',
  });
  const logoutButton = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const alert = useRef<HTMLParagraphElement>(null);
  const [retry, setRetry] = useState(0);
  type Field = keyof typeof values;
  function validate(name: Field, next = values): string {
    const value = next[name];
    if (name === 'displayName') {
      if (!value.trim()) return 'Display name is required';
      if ([...value.trim()].length > 60)
        return 'Use no more than 60 characters';
    } else if (name === 'email') {
      if (!value.trim()) return 'Email is required';
      if (
        value.trim().length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
      )
        return 'Enter a valid email address';
    } else if (name === 'password') {
      if (!value) return 'Password is required';
      if ([...value].length < 12 || [...value].length > 128)
        return 'Use 12–128 characters';
    } else {
      if (!value) return 'Confirm your password';
      if (value !== next.password) return 'Passwords must match';
    }
    return '';
  }

  useEffect(() => {
    let active = true;
    const restore = async () => {
      setLoading(true);
      setUser(null);
      setError('');
      try {
        const result = await authRequest('me');
        if (!active) return;
        setUser(result!.user);
        if (!privatePage) void navigate('/account', { replace: true });
      } catch (failure) {
        if (!active) return;
        if ((failure as Failure).code === 'UNAUTHENTICATED') {
          if (privatePage) void navigate('/login', { replace: true });
        } else setError('Unable to check your session. Please try again.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void restore();
    window.addEventListener('focus', restore);
    return () => {
      active = false;
      window.removeEventListener('focus', restore);
    };
  }, [privatePage, navigate, retry]);

  useEffect(() => {
    setFields({});
    setError('');
    setValues({ displayName: '', email: '', password: '', confirmation: '' });
  }, [location.pathname]);
  useEffect(() => {
    if (!loading) {
      if (privatePage) logoutButton.current?.focus();
      else form.current?.querySelector('input')?.focus();
    }
  }, [loading, location.pathname, privatePage]);
  useEffect(() => {
    if (!focusRequest) return;
    const invalid = form.current?.querySelector<HTMLInputElement>(
      '[aria-invalid="true"]',
    );
    if (invalid) invalid.focus();
    else alert.current?.focus();
  }, [focusRequest]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    const names: Field[] = registering
      ? ['displayName', 'email', 'password', 'confirmation']
      : ['email', 'password'];
    const validation = Object.fromEntries(
      names.map((name) => [name, validate(name)]),
    );
    setFields(validation);
    if (Object.values(validation).some(Boolean)) {
      setError('Check the form fields and try again');
      setFocusRequest((count) => count + 1);
      return;
    }
    setBusy(true);
    try {
      const result = await authRequest(registering ? 'register' : 'login', {
        email: values.email,
        password: values.password,
        ...(registering ? { displayName: values.displayName } : {}),
      });
      setUser(result!.user);
      void navigate('/account', { replace: true });
    } catch (failure) {
      const problem = failure as Failure;
      const messages: Record<string, string> = {
        EMAIL_TAKEN: 'This email is already registered. Try logging in.',
        INVALID_CREDENTIALS: 'Email or password is incorrect.',
        VALIDATION_ERROR: 'Check the form fields and try again',
        RATE_LIMITED: 'Too many attempts. Please try again in a minute.',
      };
      setFields(problem.fields ?? {});
      setError(messages[problem.code] ?? 'Unable to save. Please try again.');
      setFocusRequest((count) => count + 1);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError('');
    try {
      await authRequest('logout');
      setUser(null);
      void navigate('/login', { replace: true });
    } catch {
      setError('Unable to log out. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  const feedback = error && (
    <p role="alert" tabIndex={-1} ref={alert}>
      {error}
    </p>
  );
  if (loading) return <p role="status">Checking your session…</p>;
  if (privatePage)
    return (
      <section>
        <h2>Your account</h2>
        {feedback}
        {user ? (
          <>
            <p>Welcome, {user.displayName}.</p>
            <p>You are signed in to Cartmates.</p>
            <button
              ref={logoutButton}
              disabled={busy}
              onClick={() => void logout()}
            >
              {busy ? 'Logging out…' : 'Log out'}
            </button>
          </>
        ) : (
          <button onClick={() => setRetry(retry + 1)}>Try again</button>
        )}
      </section>
    );
  return (
    <section>
      <h2>{registering ? 'Sign up' : 'Log in'}</h2>
      <p>
        {registering
          ? 'Create your Cartmates account.'
          : 'Log in to your Cartmates account.'}
      </p>
      <form noValidate ref={form} onSubmit={(event) => void submit(event)}>
        {(registering
          ? (['displayName', 'email', 'password', 'confirmation'] as const)
          : (['email', 'password'] as const)
        ).map((name) => {
          const labels = {
            displayName: 'Display name',
            email: 'Email',
            password: 'Password',
            confirmation: 'Confirm password',
          };
          return (
            <div className="field" key={name}>
              <label htmlFor={name}>{labels[name]}</label>
              <input
                id={name}
                name={name}
                value={values[name]}
                required
                disabled={busy}
                type={
                  name === 'email'
                    ? 'email'
                    : name === 'displayName'
                      ? 'text'
                      : 'password'
                }
                autoComplete={
                  name === 'displayName'
                    ? 'nickname'
                    : name === 'email'
                      ? 'username'
                      : registering
                        ? 'new-password'
                        : 'current-password'
                }
                minLength={
                  name === 'password' || name === 'confirmation' ? 12 : 1
                }
                maxLength={
                  name === 'email' ? 254 : name === 'displayName' ? 60 : 128
                }
                aria-invalid={!!fields[name]}
                aria-describedby={fields[name] ? `${name}-error` : undefined}
                onBlur={() =>
                  setFields((previous) => ({
                    ...previous,
                    [name]: validate(name),
                  }))
                }
                onChange={(event) => {
                  const next = { ...values, [name]: event.target.value };
                  setValues(next);
                  setError('');
                  setFields((previous) => ({
                    ...previous,
                    ...(name in previous
                      ? { [name]: validate(name, next) }
                      : {}),
                    ...(name === 'password' && 'confirmation' in previous
                      ? { confirmation: validate('confirmation', next) }
                      : {}),
                  }));
                }}
              />
              <p
                className="field-error"
                id={`${name}-error`}
                aria-live="polite"
              >
                {fields[name]}
              </p>
            </div>
          );
        })}
        {registering && (
          <p>Use 12–128 characters for your password. Spaces are preserved.</p>
        )}
        <div
          className={
            registering ? 'form-actions' : 'form-actions login-actions'
          }
        >
          <button disabled={busy}>
            {busy ? 'Saving…' : registering ? 'Create account' : 'Log in'}
          </button>
          {feedback}
        </div>
      </form>
      <p>
        <Link to={registering ? '/login' : '/register'}>
          {registering ? 'Already registered? Log in' : 'Create an account'}
        </Link>
      </p>
    </section>
  );
}
