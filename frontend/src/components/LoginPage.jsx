import React, { useState } from 'react';
import { BACKEND } from '../config/constants';
import './LoginPage.css';

/**
 * LoginPage – Premium authentication screen with login / signup toggle.
 * Shown inline inside the Watch tab when the user is not logged in.
 *
 * Props:
 *  - onLogin(user) — called after successful auth; receives { email, name }
 */
export default function LoginPage({ onLogin }) {
  const [mode, setMode] = useState('login');        // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const switchMode = () => {
    setMode(m => (m === 'login' ? 'signup' : 'login'));
    setError('');
    setSuccessMsg('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    const endpoint = mode === 'login' ? '/login' : '/signup';
    const body = mode === 'login'
      ? { email, password }
      : { email, password, name };

    try {
      const res = await fetch(`${BACKEND}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.success) {
        if (mode === 'signup') {
          setSuccessMsg('Account created! Logging you in…');
          setTimeout(() => onLogin(data.user), 800);
        } else {
          onLogin(data.user);
        }
      } else {
        setError(data.message || 'Authentication failed');
      }
    } catch {
      setError('Cannot reach server — check connection');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-inline">
      {/* Animated background elements */}
      <div className="auth-bg-glow auth-bg-glow-1" />
      <div className="auth-bg-glow auth-bg-glow-2" />

      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-mark">♥</div>
          <div className="auth-logo-text">
            <div className="auth-logo-title">SMART<span>WATCH</span></div>
            <div className="auth-logo-sub">Patient Telemetry Portal</div>
          </div>
        </div>

        {/* Divider */}
        <div className="auth-divider">
          <div className="auth-divider-line" />
          <span className="auth-divider-text">
            {mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
          </span>
          <div className="auth-divider-line" />
        </div>

        {/* Form */}
        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div className="auth-field fade-in" key="name-field">
              <label className="auth-label" htmlFor="auth-name">FULL NAME</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">👤</span>
                <input
                  id="auth-name"
                  className="auth-input"
                  type="text"
                  placeholder="Enter your full name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>
            </div>
          )}

          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-email">EMAIL ADDRESS</label>
            <div className="auth-input-wrap">
              <span className="auth-input-icon">✉</span>
              <input
                id="auth-email"
                className="auth-input"
                type="email"
                placeholder="you@hospital.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-password">PASSWORD</label>
            <div className="auth-input-wrap">
              <span className="auth-input-icon">🔒</span>
              <input
                id="auth-password"
                className="auth-input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={4}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>
          </div>

          {/* Error / Success messages */}
          {error && (
            <div className="auth-msg auth-msg-error fade-in">
              <span>⚠</span> {error}
            </div>
          )}
          {successMsg && (
            <div className="auth-msg auth-msg-success fade-in">
              <span>✓</span> {successMsg}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            className={`auth-btn ${loading ? 'loading' : ''}`}
            disabled={loading}
          >
            {loading ? (
              <span className="auth-spinner" />
            ) : (
              mode === 'login' ? 'Sign In →' : 'Create Account →'
            )}
          </button>
        </form>

        {/* Mode switch */}
        <div className="auth-switch">
          <span className="auth-switch-text">
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
          </span>
          <button className="auth-switch-btn" type="button" onClick={switchMode}>
            {mode === 'login' ? 'Sign Up' : 'Sign In'}
          </button>
        </div>

        {/* Footer */}
        <div className="auth-footer">
          <div className="auth-footer-line" />
          <span>MEDex Smart Hospital System</span>
        </div>
      </div>
    </div>
  );
}
