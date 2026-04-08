import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as fbSignOut, GoogleAuthProvider, type User } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  username: string | null;
  needsUsername: boolean;
  isPublic: boolean;
  setUsernameLocal: (username: string) => void;
  setIsPublicLocal: (isPublic: boolean) => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  username: null,
  needsUsername: false,
  isPublic: false,
  setUsernameLocal: () => {},
  setIsPublicLocal: () => {},
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
  const [isPublic, setIsPublic] = useState(false);

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

        // Check if username + public flag exist
        const snap = await getDoc(doc(db, 'users', u.uid));
        const data = snap.data() ?? {};
        const existing = data.username as string | undefined;
        if (existing) {
          setUsername(existing);
          setNeedsUsername(false);
        } else {
          setUsername(null);
          setNeedsUsername(true);
        }
        setIsPublic(Boolean(data.isPublic));
      } else {
        setUsername(null);
        setNeedsUsername(false);
        setIsPublic(false);
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

  const setIsPublicLocal = (next: boolean) => {
    setIsPublic(next);
  };

  return (
    <AuthContext.Provider value={{ user, loading, username, needsUsername, isPublic, setUsernameLocal, setIsPublicLocal, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
