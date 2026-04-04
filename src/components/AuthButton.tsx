import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { LogIn, LogOut } from 'lucide-react';

export default function AuthButton() {
  const { user, loading, username, signIn, signOut } = useAuth();
  const [imgErr, setImgErr] = useState(false);

  if (loading) return null;

  if (!user) {
    return (
      <button
        onClick={signIn}
        className="flex items-center gap-1.5 text-text-muted hover:text-text-primary text-sm transition-colors px-3 py-1.5 rounded-md hover:bg-bg-hover"
      >
        <LogIn className="w-3.5 h-3.5" />
        Sign in
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {user.photoURL && !imgErr ? (
        <img
          src={user.photoURL}
          alt=""
          className="w-6 h-6 rounded-full"
          referrerPolicy="no-referrer"
          onError={() => setImgErr(true)}
        />
      ) : (
        <div className="w-6 h-6 rounded-full bg-accent/20 text-accent text-xs flex items-center justify-center font-bold">
          {(user.displayName ?? user.email ?? '?')[0].toUpperCase()}
        </div>
      )}
      <span className="text-text-secondary text-sm max-w-[120px] truncate hidden md:inline">
        {username ? `@${username}` : (user.displayName ?? user.email)}
      </span>
      <button
        onClick={signOut}
        className="text-text-muted hover:text-text-primary transition-colors p-1 rounded hover:bg-bg-hover"
        title="Sign out"
      >
        <LogOut className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
