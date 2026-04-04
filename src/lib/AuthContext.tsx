import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as fbSignOut, GoogleAuthProvider, type User } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  username: string | null;
  needsUsername: boolean;
  setUsernameLocal: (username: string) => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  username: null,
  needsUsername: false,
  setUsernameLocal: () => {},
  signIn: async () => {},
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

const googleProvider = new GoogleAuthProvider();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState<string | null>(null);
  const [needsUsername, setNeedsUsername] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Upsert user profile on login
        await setDoc(doc(db, 'users', u.uid), {
          displayName: u.displayName ?? '',
          email: u.email ?? '',
          photoURL: u.photoURL ?? '',
          updatedAt: serverTimestamp(),
        }, { merge: true });

        // Check if username exists
        const snap = await getDoc(doc(db, 'users', u.uid));
        const existing = snap.data()?.username as string | undefined;
        if (existing) {
          setUsername(existing);
          setNeedsUsername(false);
        } else {
          setUsername(null);
          setNeedsUsername(true);
        }
      } else {
        setUsername(null);
        setNeedsUsername(false);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const signIn = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const signOut = async () => {
    await fbSignOut(auth);
  };

  const setUsernameLocal = (name: string) => {
    setUsername(name);
    setNeedsUsername(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, username, needsUsername, setUsernameLocal, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
