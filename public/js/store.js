import { db } from "./firebase.js";
import {
  collection, doc, onSnapshot, query, orderBy, where,
  addDoc, updateDoc, deleteDoc, getDocs,
  runTransaction, writeBatch, serverTimestamp, increment,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const rows = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));

// ---- Realtime subscriptions (each returns an unsubscribe fn) ----
export const onProducts = (cb) =>
  onSnapshot(query(collection(db, "products"), orderBy("name")), (s) => cb(rows(s)));
export const onDestinations = (cb) =>
  onSnapshot(query(collection(db, "destinations"), orderBy("name")), (s) => cb(rows(s)));
export const onUsers = (cb) =>
  onSnapshot(query(collection(db, "users"), orderBy("name")), (s) => cb(rows(s)));
export const onMyVisits = (uid, cb) =>
  onSnapshot(
    query(collection(db, "visits"), where("userId", "==", uid), orderBy("visitedAt", "desc")),
    (s) => cb(rows(s))
  );

// ---- Admin: products ----
export const addProduct = (p) =>
  addDoc(collection(db, "products"), {
    name: p.name, sku: p.sku || "", quantity: Number(p.quantity) || 0,
    unit: p.unit || "piece", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
export const removeProduct = (id) => deleteDoc(doc(db, "products", id));
export const setProductUnit = (id, unit) =>
  updateDoc(doc(db, "products", id), { unit, updatedAt: serverTimestamp() });

// ---- User: decrease inventory (atomic, never below zero) ----
export async function decreaseInventory(id, amount) {
  const ref = doc(db, "products", id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Product not found");
    const next = (snap.data().quantity || 0) - Number(amount);
    if (Number.isNaN(next)) throw new Error("Invalid amount");
    if (next < 0) throw new Error("Not enough inventory");
    tx.update(ref, { quantity: next, updatedAt: serverTimestamp() });
  });
}

// ---- Admin: destinations ----
export const addDestination = (d) =>
  addDoc(collection(db, "destinations"), {
    name: d.name, address: d.address || "", contact: d.contact || "",
    lastVisitedAt: null, visitCount: 0, createdAt: serverTimestamp(),
  });
export const removeDestination = (id) => deleteDoc(doc(db, "destinations", id));

// ---- User: mark a destination visited (+ optional sold items), atomically ----
export async function markVisited(dest, soldItems, profile, note = "") {
  const batch = writeBatch(db);
  const visitRef = doc(collection(db, "visits"));
  batch.set(visitRef, {
    destinationId: dest.id, destName: dest.name,
    userId: profile.uid, userName: profile.name || profile.email,
    items: soldItems, note, visitedAt: serverTimestamp(),
  });
  batch.update(doc(db, "destinations", dest.id), {
    lastVisitedAt: serverTimestamp(), visitCount: increment(1),
  });
  for (const it of soldItems) {
    batch.update(doc(db, "products", it.productId), {
      quantity: increment(-Number(it.qty)), updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

// ---- Admin: users & history ----
export const removeUser = (id) => deleteDoc(doc(db, "users", id));
export const setUserActive = (id, active) => updateDoc(doc(db, "users", id), { active });

export async function userHistory(uid) {
  const s = await getDocs(
    query(collection(db, "visits"), where("userId", "==", uid), orderBy("visitedAt", "desc"))
  );
  return rows(s);
}
export async function lastVisit(destId) {
  const s = await getDocs(
    query(collection(db, "visits"), where("destinationId", "==", destId), orderBy("visitedAt", "desc"))
  );
  return s.docs.length ? { id: s.docs[0].id, ...s.docs[0].data() } : null;
}
