import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { LogOut } from "lucide-react";
import { auth, googleProvider } from "./firebase";
import VocabApp from "./VocabApp";

export default function AuthGate() {
  const [user, setUser] = useState(undefined);
  const [error, setError] = useState("");

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (user === undefined) {
    return (
      <div style={styles.center}>
        <div style={{ fontFamily: "'Special Elite', monospace" }}>
          載入中...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={styles.center}>
        <div style={styles.card}>
          <div
            style={{
              fontFamily: "'Special Elite', monospace",
              fontSize: "1.6rem",
              marginBottom: 8,
            }}
          >
            背單字
          </div>

          <div
            style={{
              color: "#6b5f45",
              fontSize: "0.85rem",
              marginBottom: 20,
            }}
          >
            登入 Google 帳號以同步你的複習紀錄
          </div>

          <button
            style={styles.button}
            onClick={async () => {
              setError("");
              try {
                await signInWithPopup(auth, googleProvider);
              } catch (e) {
                console.error("Google login error:", e);
                setError(`登入失敗：${e.code || e.message}`);
              }
            }}
          >
            使用 Google 帳號登入
          </button>

          {error && (
            <div
              style={{
                color: "#A2402B",
                fontSize: "0.8rem",
                marginTop: 10,
              }}
            >
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={styles.topbar}>
        <span style={{ fontSize: "0.8rem", color: "#6b5f45" }}>
          {user.displayName || user.email}
        </span>

        <button
          style={styles.logout}
          onClick={() => signOut(auth)}
        >
          <LogOut size={14} /> 登出
        </button>
      </div>

      <VocabApp uid={user.uid} />
    </div>
  );
}

const styles = {
  center: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#E4D9BE",
  },

  card: {
    background: "#FBF6E9",
    border: "1px solid #B8A888",
    borderTop: "4px solid #A2402B",
    borderRadius: 3,
    padding: "2rem",
    textAlign: "center",
    width: 300,
  },

  button: {
    padding: "10px 18px",
    background: "#2A2118",
    color: "#FBF6E9",
    border: "none",
    borderRadius: 3,
    cursor: "pointer",
    fontFamily: "'Special Elite', monospace",
  },

  topbar: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    padding: "8px 16px",
    background: "#2A2118",
  },

  logout: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    background: "none",
    border: "1px solid #B8A888",
    color: "#FBF6E9",
    borderRadius: 3,
    padding: "4px 8px",
    fontSize: "0.75rem",
    cursor: "pointer",
  },
};
