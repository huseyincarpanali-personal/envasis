import { auth, db, firebaseConfig } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  getAuth,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const login = (email, pw) => signInWithEmailAndPassword(auth, email, pw);
export const logout = () => signOut(auth);

// Load the signed-in user's profile (name + role + active) from Firestore.
async function loadProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { id: uid, ...snap.data() } : null;
}

// Fire `cb` with the resolved profile (or null) on every auth change.
// role === "none" means: authenticated, but no profile yet (pending admin setup).
export function watchAuth(cb) {
  return onAuthStateChanged(auth, async (u) => {
    if (!u) return cb(null);
    const p = await loadProfile(u.uid);
    cb(p ? { uid: u.uid, email: u.email, ...p } : { uid: u.uid, email: u.email, role: "none" });
  });
}

// Admin creates a staff/admin account WITHOUT being signed out, by doing the
// auth-account creation on a throwaway secondary Firebase app. The profile doc
// is written with the (primary) admin's credentials, satisfying firestore.rules.
export async function createUserAccount({ email, password, name, role }) {
  const secondary = initializeApp(firebaseConfig, "secondary-" + Date.now());
  try {
    const cred = await createUserWithEmailAndPassword(getAuth(secondary), email, password);
    await setDoc(doc(db, "users", cred.user.uid), {
      name, email, role, active: true, createdAt: serverTimestamp(),
    });
    return cred.user.uid;
  } finally {
    await deleteApp(secondary);
  }
}
