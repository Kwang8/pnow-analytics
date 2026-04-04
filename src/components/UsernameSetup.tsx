import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../lib/AuthContext';
import { isValidUsername, checkUsernameAvailable, setUsername } from '../lib/gameStore';
import { AtSign, Check, X, Loader2 } from 'lucide-react';

export default function UsernameSetup() {
  const { user, setUsernameLocal } = useAuth();
  const [input, setInput] = useState('');
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const normalized = input.toLowerCase();
  const valid = isValidUsername(normalized);

  useEffect(() => {
    setAvailable(null);
    setError('');

    if (!valid || normalized.length < 3) {
      setChecking(false);
      return;
    }

    setChecking(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const ok = await checkUsernameAvailable(normalized);
      setAvailable(ok);
      setChecking(false);
    }, 400);

    return () => clearTimeout(debounceRef.current);
  }, [normalized, valid]);

  const handleSubmit = async () => {
    if (!user || !valid || !available) return;
    setSubmitting(true);
    setError('');
    try {
      // Double-check availability
      const stillAvailable = await checkUsernameAvailable(normalized);
      if (!stillAvailable) {
        setAvailable(false);
        setSubmitting(false);
        return;
      }
      await setUsername(user.uid, normalized);
      setUsernameLocal(normalized);
    } catch {
      setError('Failed to set username. Please try again.');
      setSubmitting(false);
    }
  };

  const getValidationMessage = () => {
    if (!input) return null;
    if (input.length < 3) return { text: 'Must be at least 3 characters', ok: false };
    if (input.length > 20) return { text: 'Must be 20 characters or less', ok: false };
    if (!valid) return { text: 'Only lowercase letters, numbers, and underscores', ok: false };
    if (checking) return { text: 'Checking availability...', ok: true };
    if (available === false) return { text: 'Username is taken', ok: false };
    if (available === true) return { text: 'Username is available!', ok: true };
    return null;
  };

  const validation = getValidationMessage();

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4">
      <div className="bg-bg-card border border-border rounded-xl p-8 max-w-sm w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-accent/15 text-accent flex items-center justify-center mx-auto">
            <AtSign className="w-6 h-6" />
          </div>
          <h2 className="text-text-primary text-xl font-bold">Choose a username</h2>
          <p className="text-text-muted text-sm">
            Pick a unique username so friends can find you.
          </p>
        </div>

        <div className="space-y-2">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">@</span>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="username"
              maxLength={20}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && valid && available && handleSubmit()}
              className="w-full bg-bg-secondary border border-border rounded-lg pl-7 pr-10 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {checking && <Loader2 className="w-4 h-4 animate-spin text-text-muted" />}
              {!checking && available === true && <Check className="w-4 h-4 text-stat-green" />}
              {!checking && available === false && <X className="w-4 h-4 text-stat-red" />}
            </div>
          </div>

          {validation && (
            <p className={`text-xs ${validation.ok ? 'text-stat-green' : 'text-stat-red'}`}>
              {validation.text}
            </p>
          )}
          {error && <p className="text-xs text-stat-red">{error}</p>}
        </div>

        <button
          onClick={handleSubmit}
          disabled={!valid || !available || submitting}
          className="w-full py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent/85 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {submitting ? 'Setting username...' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
