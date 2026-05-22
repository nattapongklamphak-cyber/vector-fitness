import React, { useState, useEffect } from "react";
import { db } from "./firebase";
import {
  collection, doc, setDoc, getDocs, deleteDoc, onSnapshot
} from "firebase/firestore";
import Dashboard from "./trainer-dashboard";

// Wrapper that syncs localStorage data to/from Firestore
export default function App() {
  const [synced, setSynced] = useState(false);
  const [clients, setClients] = useState(null);

  useEffect(() => {
    // Listen to Firestore in real-time
    const unsub = onSnapshot(collection(db, "clients"), (snapshot) => {
      if (snapshot.empty) {
        // First time — load from localStorage if exists
        const local = localStorage.getItem("vector_v2");
        if (local) {
          const parsed = JSON.parse(local);
          // Push localStorage data to Firestore
          parsed.forEach(async (c) => {
            await setDoc(doc(db, "clients", String(c.id)), c);
          });
        }
      } else {
        const data = snapshot.docs.map(d => d.data());
        setClients(data.sort((a, b) => a.id - b.id));
        // Keep localStorage in sync
        localStorage.setItem("vector_v2", JSON.stringify(data));
      }
      setSynced(true);
    });
    return () => unsub();
  }, []);

  const handleSave = async (updatedClients) => {
    // Save each client to Firestore
    for (const c of updatedClients) {
      await setDoc(doc(db, "clients", String(c.id)), c);
    }
  };

  const handleDelete = async (id) => {
    await deleteDoc(doc(db, "clients", String(id)));
  };

  if (!synced) {
    return (
      <div style={{
        minHeight: "100vh", background: "#0D0D0D", display: "flex",
        alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16
      }}>
        <svg width="48" height="48" viewBox="0 0 100 100" fill="none">
          <defs>
            <linearGradient id="vg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#F97316"/>
              <stop offset="100%" stopColor="#FDBA74"/>
            </linearGradient>
          </defs>
          <polygon points="50,8 92,75 8,75" fill="none" stroke="url(#vg)" strokeWidth="7" strokeLinejoin="round"/>
          <polygon points="50,30 72,60 50,82 28,60" fill="none" stroke="url(#vg)" strokeWidth="7" strokeLinejoin="round"/>
        </svg>
        <div style={{ color: "#F97316", fontFamily: "sans-serif", fontWeight: 700, fontSize: 16 }}>
          กำลังโหลดข้อมูล...
        </div>
      </div>
    );
  }

  return <Dashboard initialClients={clients} onSave={handleSave} onDelete={handleDelete} />;
}
