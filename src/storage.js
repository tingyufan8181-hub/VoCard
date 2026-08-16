import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

// Each signed-in user's data lives under users/{uid}/data/{key}.
// Firestore security rules (see firestore.rules) make sure a user
// can only ever read or write their own documents.

export async function getUserDoc(uid, key) {
  if (!uid) return null;
  const ref = doc(db, "users", uid, "data", key);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data().value : null;
}

export async function setUserDoc(uid, key, value) {
  if (!uid) return;
  const ref = doc(db, "users", uid, "data", key);
  await setDoc(ref, { value, updatedAt: Date.now() });
}
