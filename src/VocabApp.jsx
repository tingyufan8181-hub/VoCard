import { useState, useEffect, useRef, useMemo } from "react";
import {
  Plus, Search, Trash2, Check, X, RotateCcw, BookOpen, Volume2, Home,
  Settings as SettingsIcon, FolderOpen, Folder, ExternalLink, Smile, Frown,
  ChevronLeft, Pencil, Flame, Layers,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { getUserDoc, setUserDoc } from "./storage";

const INK = "#2A2118";
const PAPER = "#FBF6E9";
const PAGE_BG = "#E4D9BE";
const RED = "#A2402B";
const BLUE = "#6E88A6";
const GREEN = "#4F6B45";
const AMBER = "#C08A3E";
const MUTED = "#B8A888";

const DAY_MS = 24 * 60 * 60 * 1000;
const INTERVALS = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 15 }; // days, indexed by box

const STATUS_META = {
  new: { label: "新單字", color: MUTED },
  weak: { label: "不熟", color: RED },
  normal: { label: "普通", color: AMBER },
  mastered: { label: "精熟", color: GREEN },
};

const POS_OPTIONS = ["n.", "v.", "adj.", "adv.", "phrase", "sentence", "other"];

const fontDisplay = "'Special Elite', 'Courier New', monospace";
const fontBody = "'Noto Serif TC', serif";

function makeUid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function todayStr(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
function speak(text, lang) {
  if (!text) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    window.speechSynthesis.speak(u);
  } catch (e) {}
}

function getEffectiveBox(card, now) {
  if (card.reviewCount === 0) return 1;
  const days = INTERVALS[card.box];
  const elapsedDays = (now - card.lastReviewed) / DAY_MS;
  if (card.box >= 4 && elapsedDays > days * 2) return 3;
  if (card.box === 3 && elapsedDays > days * 2) return 1;
  return card.box;
}
function isDue(card, now) {
  if (card.reviewCount === 0) return true;
  const dueAt = card.lastReviewed + INTERVALS[card.box] * DAY_MS;
  return now >= dueAt;
}
function cardStatus(card, now) {
  if (card.reviewCount === 0) return "new";
  const eb = getEffectiveBox(card, now);
  if (eb <= 2) return "weak";
  if (eb === 3) return "normal";
  return "mastered";
}
function blankWord(word) {
  if (!word) return "";
  return word
    .split(/(\s+)/)
    .map((chunk) => {
      if (/^\s+$/.test(chunk)) return chunk;
      if (chunk.length <= 1) return chunk;
      return chunk[0] + "_".repeat(chunk.length - 1);
    })
    .join("");
}
// Builds the fill-in-the-blank prompt for spelling mode.
// Uses plain string search (not regex) so accents, apostrophes, and
// punctuation in French words/sentences can never break rendering.
function buildSpellingPrompt(current) {
  const word = current.word || "";
  const example = current.example || "";
  if (!word) {
    return { display: example || "（尚未填寫單字）", extraBlank: null };
  }
  if (!example) {
    return { display: blankWord(word), extraBlank: null };
  }
  const idx = example.toLowerCase().indexOf(word.toLowerCase());
  if (idx === -1) {
    return { display: example, extraBlank: blankWord(word) };
  }
  const blanked = example.slice(0, idx) + blankWord(example.slice(idx, idx + word.length)) + example.slice(idx + word.length);
  return { display: blanked, extraBlank: null };
}

export default function VocabApp({ uid }) {
  const [decks, setDecks] = useState([]);
  const [cards, setCards] = useState([]);
  const [settings, setSettings] = useState({ dailyTarget: 20 });
  const [reviewLog, setReviewLog] = useState([]); // [{date, completed, target}]
  const [loaded, setLoaded] = useState(false);
  const didInit = useRef(false);

  const [tab, setTab] = useState("home"); // home | library | settings
  const [activeDeckId, setActiveDeckId] = useState(null);

  const [reviewMode, setReviewMode] = useState(null); // 'flip' | 'audio' | 'spelling'
  const [reviewStage, setReviewStage] = useState(null); // null | 'select' | 'session'
  const [queue, setQueue] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(null);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [sessionStats, setSessionStats] = useState({ correct: 0, total: 0 });

  useEffect(() => {
    (async () => {
      try {
        const value = await getUserDoc(uid, "vocab-data");
        if (value) {
          const parsed = JSON.parse(value);
          setDecks(parsed.decks || []);
          setCards(parsed.cards || []);
        }
      } catch (e) {}
      try {
        const value2 = await getUserDoc(uid, "vocab-meta");
        if (value2) {
          const parsed = JSON.parse(value2);
          setSettings(parsed.settings || { dailyTarget: 20 });
          setReviewLog(parsed.reviewLog || []);
        }
      } catch (e) {
  console.error("Firebase vocab-meta error:", e);
}
      setLoaded(true);
    })();
  }, [uid]);

  useEffect(() => {
    if (!loaded) return;
    if (!didInit.current) {
      didInit.current = true;
      return;
    }
    (async () => {
      try {
        await setUserDoc(uid, "vocab-data", JSON.stringify({ decks, cards }));
      } catch (e) {
  console.error("Firebase vocab-data save error:", e);
}
    })();
  }, [decks, cards, loaded]);

  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        await setUserDoc(uid, "vocab-meta", JSON.stringify({ settings, reviewLog }));
      } catch (e) {}
    })();
  }, [settings, reviewLog, loaded]);

  function logProgress(correct) {
    const t = todayStr();
    setReviewLog((prev) => {
      const idx = prev.findIndex((r) => r.date === t);
      if (idx === -1) {
        return [...prev, { date: t, completed: 1, correct: correct ? 1 : 0, target: settings.dailyTarget }];
      }
      const copy = [...prev];
      copy[idx] = {
        ...copy[idx],
        completed: copy[idx].completed + 1,
        correct: (copy[idx].correct || 0) + (correct ? 1 : 0),
      };
      return copy;
    });
  }

  function addDeck(name) {
    const d = { id: makeUid(), name: name.trim() || "未命名字卡庫", createdAt: Date.now() };
    setDecks((prev) => [...prev, d]);
    return d.id;
  }
  function renameDeck(id, name) {
    setDecks((prev) => prev.map((d) => (d.id === id ? { ...d, name } : d)));
  }
  function deleteDeck(id) {
    setDecks((prev) => prev.filter((d) => d.id !== id));
    setCards((prev) => prev.filter((c) => c.deckId !== id));
    if (activeDeckId === id) setActiveDeckId(null);
  }

  function addCard(deckId, data) {
    const c = {
      id: makeUid(),
      deckId,
      word: data.word || "",
      pos: data.pos || "n.",
      conjugation: data.conjugation || "",
      meaning: data.meaning || "",
      example: data.example || "",
      exampleTranslation: data.exampleTranslation || "",
      note: data.note || "",
      youglishUrl: data.youglishUrl || "",
      box: 1,
      reviewCount: 0,
      correctCount: 0,
      lastReviewed: 0,
      createdAt: Date.now(),
    };
    setCards((prev) => [c, ...prev]);
  }
  function updateCard(id, patch) {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function deleteCard(id) {
    setCards((prev) => prev.filter((c) => c.id !== id));
  }

  function buildDailyQueue(mode) {
    const now = Date.now();
    // Spelling mode needs an example sentence to blank out. Prefer cards
    // that have one; only fall back to example-less cards if none exist.
    const withExample = cards.filter((c) => c.example && c.example.trim());
    const basePool = mode === "spelling" && withExample.length > 0 ? withExample : cards;

    const due = basePool.filter((c) => c.reviewCount > 0 && isDue(c, now));
    const news = basePool.filter((c) => c.reviewCount === 0);
    const weak = shuffle(due.filter((c) => getEffectiveBox(c, now) <= 2));
    const stale = shuffle(due.filter((c) => getEffectiveBox(c, now) >= 4));
    const normal = shuffle(due.filter((c) => getEffectiveBox(c, now) === 3));
    let pool = [...weak, ...stale, ...normal, ...shuffle(news)];

    // Top up with already-reviewed / not-yet-due cards so a review session
    // is always available and can be repeated as many times as you like.
    if (pool.length < settings.dailyTarget) {
      const usedIds = new Set(pool.map((c) => c.id));
      const rest = shuffle(basePool.filter((c) => !usedIds.has(c.id)));
      pool = [...pool, ...rest];
    }
    if (pool.length === 0) return [];
    return shuffle(pool.slice(0, Math.max(settings.dailyTarget, 1)));
  }
  function buildWeakQueue() {
    const now = Date.now();
    return shuffle(cards.filter((c) => c.reviewCount > 0 && getEffectiveBox(c, now) <= 2));
  }

  function startSelect() {
    setReviewStage("select");
    setTab("home");
  }
  function beginSession(mode, pool) {
    const q = pool.filter((c) => c.word); // need at least a word to review
    setReviewMode(mode);
    setQueue(q);
    setQIndex(0);
    setFlipped(false);
    setAnswered(false);
    setLastCorrect(null);
    setTypedAnswer("");
    setSessionStats({ correct: 0, total: 0 });
    setReviewStage(q.length > 0 ? "session" : "done");
  }

  function submitAnswer(correct) {
    const current = queue[qIndex];
    if (!current) return;
    setAnswered(true);
    setLastCorrect(correct);
    setFlipped(true);
    setCards((prev) =>
      prev.map((c) => {
        if (c.id !== current.id) return c;
        const newBox = correct ? Math.min(5, c.box + 1) : 1;
        return {
          ...c,
          box: newBox,
          reviewCount: c.reviewCount + 1,
          correctCount: c.correctCount + (correct ? 1 : 0),
          lastReviewed: Date.now(),
        };
      })
    );
    setSessionStats((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
    logProgress(correct);
  }
  function nextCard() {
    setFlipped(false);
    setAnswered(false);
    setLastCorrect(null);
    setTypedAnswer("");
    if (qIndex + 1 >= queue.length) {
      setReviewStage("done");
    } else {
      setQIndex((i) => i + 1);
    }
  }

  const totalCards = cards.length;
  const now = Date.now();
  const statusCounts = { new: 0, weak: 0, normal: 0, mastered: 0 };
  cards.forEach((c) => (statusCounts[cardStatus(c, now)] += 1));
  const reviewedCount = cards.filter((c) => c.reviewCount > 0).length;
  const masteredPct = reviewedCount > 0 ? Math.round((statusCounts.mastered / reviewedCount) * 100) : 0;

  return (
    <div style={{ minHeight: "100vh", background: PAGE_BG, color: INK, fontFamily: fontBody, paddingBottom: "2rem" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Special+Elite&family=Noto+Serif+TC:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        .paper-lines {
          background-image: repeating-linear-gradient(to bottom, transparent, transparent 27px, rgba(110,136,166,0.35) 27px, rgba(110,136,166,0.35) 28px);
        }
        .review-card { position: relative; }
        .word-input { font-family: ${fontBody}; background: ${PAPER}; border: 1px solid ${MUTED}; border-radius: 2px; padding: 8px 10px; color: ${INK}; width: 100%; outline: none; }
        .word-input:focus { border-color: ${RED}; }
        .tab-btn { font-family: ${fontDisplay}; letter-spacing: 0.04em; }
        .link-btn { font-size: 0.72rem; display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border: 1px solid ${MUTED}; border-radius: 20px; color: #6b5f45; text-decoration: none; cursor: pointer; background: transparent; }
        .link-btn:hover { border-color: ${RED}; color: ${RED}; }
      `}</style>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "1.5rem 1.25rem 0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 40, height: 40, border: `2px solid ${RED}`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(-6deg)", color: RED }}>
            <BookOpen size={20} />
          </div>
          <div>
            <div style={{ fontFamily: fontDisplay, fontSize: "1.4rem", letterSpacing: "0.05em" }}>背單字</div>
            <div style={{ fontSize: "0.7rem", color: "#6b5f45", fontFamily: fontDisplay }}>FRENCH VOCAB CATALOG</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: "1.25rem" }}>
          {[
            { id: "home", label: "首頁", icon: Home },
            { id: "library", label: "字卡庫", icon: Layers },
            { id: "settings", label: "設定", icon: SettingsIcon },
          ].map((t) => {
            const Icon = t.icon;
            const active = tab === t.id && reviewStage === null;
            return (
              <button
                key={t.id}
                className="tab-btn"
                onClick={() => {
                  setTab(t.id);
                  setReviewStage(null);
                }}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "10px 8px", background: active ? INK : "transparent", color: active ? PAPER : INK,
                  border: `1px solid ${INK}`, borderRadius: 3, cursor: "pointer", fontSize: "0.85rem",
                }}
              >
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "1.25rem" }}>
        {reviewStage !== null ? (
          <ReviewFlow
            reviewStage={reviewStage}
            reviewMode={reviewMode}
            queue={queue}
            qIndex={qIndex}
            flipped={flipped}
            answered={answered}
            lastCorrect={lastCorrect}
            typedAnswer={typedAnswer}
            setTypedAnswer={setTypedAnswer}
            sessionStats={sessionStats}
            submitAnswer={submitAnswer}
            nextCard={nextCard}
            onBack={() => setReviewStage(null)}
            onChooseMode={(mode, poolType) => {
              const pool = poolType === "weak" ? buildWeakQueue() : buildDailyQueue(mode);
              beginSession(mode, pool);
            }}
            dailyDueCount={buildDailyQueue().length}
            hasAnyCards={cards.length > 0}
          />
        ) : tab === "home" ? (
          <HomeView
            cards={cards}
            statusCounts={statusCounts}
            masteredPct={masteredPct}
            reviewedCount={reviewedCount}
            reviewLog={reviewLog}
            settings={settings}
            dailyQueueLen={buildDailyQueue().length}
            onStartDaily={startSelect}
            onWeakDrill={() => beginSession("flip", buildWeakQueue())}
          />
        ) : tab === "library" ? (
          <LibraryView
            decks={decks}
            cards={cards}
            activeDeckId={activeDeckId}
            setActiveDeckId={setActiveDeckId}
            addDeck={addDeck}
            renameDeck={renameDeck}
            deleteDeck={deleteDeck}
            addCard={addCard}
            updateCard={updateCard}
            deleteCard={deleteCard}
          />
        ) : (
          <SettingsView cards={cards} decks={decks} settings={settings} setSettings={setSettings} reviewLog={reviewLog} />
        )}
      </div>
    </div>
  );
}

// ---------- HOME ----------
function HomeView({ cards, statusCounts, masteredPct, reviewedCount, reviewLog, settings, dailyQueueLen, onStartDaily, onWeakDrill }) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY_MS);
    const ds = todayStr(d);
    const entry = reviewLog.find((r) => r.date === ds);
    const completed = entry ? entry.completed : 0;
    const target = entry ? entry.target : settings.dailyTarget;
    days.push({ ds, completed, target, ok: completed > 0, isToday: i === 0 });
  }
  const weekLabels = ["一", "二", "三", "四", "五", "六", "日"];

  return (
    <div>
      <SectionCard title="本週複習概況">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
          {days.map((d, i) => (
            <div key={d.ds} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 }}>
              <div
                style={{
                  width: 34, height: 34, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: d.ok ? "#dceada" : "#f2e2df",
                  color: d.ok ? GREEN : RED,
                  border: d.isToday ? `2px solid ${INK}` : "1px solid transparent",
                }}
              >
                {d.ok ? <Smile size={18} /> : <Frown size={18} />}
              </div>
              <div style={{ fontSize: "0.68rem", color: "#6b5f45", fontFamily: fontDisplay }}>
                {new Date(d.ds).toLocaleDateString("zh-TW", { weekday: "short" })}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="開始複習" accent={RED}>
        <p style={{ fontSize: "0.85rem", color: "#4a4030", marginTop: 0, marginBottom: 12 }}>
          今日建議複習 {dailyQueueLen} 張卡（依艾賓浩斯遺忘曲線，混合新卡、生疏卡與久未複習的精熟卡）
        </p>
        <button
          onClick={onStartDaily}
          disabled={dailyQueueLen === 0}
          style={{
            width: "100%", padding: "0.9rem", background: dailyQueueLen === 0 ? "#d8cba9" : INK, color: PAPER,
            border: "none", borderRadius: 3, fontFamily: fontDisplay, fontSize: "0.95rem",
            cursor: dailyQueueLen === 0 ? "not-allowed" : "pointer",
          }}
        >
          {dailyQueueLen === 0 ? "今日沒有待複習卡片" : `開始今日複習 (${dailyQueueLen})`}
        </button>
      </SectionCard>

      <SectionCard title="單字複習狀況">
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
          <div
            style={{
              width: 76, height: 76, borderRadius: "50%", flexShrink: 0,
              background: `conic-gradient(${GREEN} ${masteredPct * 3.6}deg, #ded2b3 0deg)`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: PAPER, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fontDisplay, fontSize: "1.1rem" }}>
              {masteredPct}%
            </div>
          </div>
          <div style={{ fontSize: "0.85rem", color: "#4a4030" }}>
            精通比例（已複習卡片中）<br />
            <span style={{ color: "#8a7b56", fontSize: "0.78rem" }}>{statusCounts.mastered} / {reviewedCount} 張已精通</span>
          </div>
        </div>

        <button
          onClick={onWeakDrill}
          disabled={statusCounts.weak === 0}
          style={{
            width: "100%", padding: "0.7rem", marginBottom: 14, background: PAPER, color: statusCounts.weak === 0 ? MUTED : RED,
            border: `1px solid ${statusCounts.weak === 0 ? MUTED : RED}`, borderRadius: 3, fontFamily: fontDisplay,
            cursor: statusCounts.weak === 0 ? "not-allowed" : "pointer",
          }}
        >
          複習去：加強不熟的 {statusCounts.weak} 張
        </button>

        {["mastered", "normal", "weak", "new"].map((k) => {
          const meta = STATUS_META[k];
          const count = statusCounts[k];
          const pct = cards.length > 0 ? (count / cards.length) * 100 : 0;
          return (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ width: 50, fontSize: "0.72rem", color: "#6b5f45", fontFamily: fontDisplay }}>{meta.label}</div>
              <div style={{ flex: 1, height: 10, background: "#ded2b3", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: meta.color }} />
              </div>
              <div style={{ width: 20, textAlign: "right", fontSize: "0.75rem" }}>{count}</div>
            </div>
          );
        })}
      </SectionCard>
    </div>
  );
}

function SectionCard({ title, accent = BLUE, children }) {
  return (
    <div style={{ background: PAPER, border: `1px solid ${MUTED}`, borderTop: `4px solid ${accent}`, borderRadius: 3, padding: "1.1rem", marginBottom: "1rem" }}>
      <div style={{ fontFamily: fontDisplay, fontSize: "1rem", marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

// ---------- LIBRARY ----------
function LibraryView({ decks, cards, activeDeckId, setActiveDeckId, addDeck, renameDeck, deleteDeck, addCard, updateCard, deleteCard }) {
  const [newDeckName, setNewDeckName] = useState("");
  const [editingDeckId, setEditingDeckId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [confirmDeleteDeck, setConfirmDeleteDeck] = useState(null);

  const activeDeck = decks.find((d) => d.id === activeDeckId);

  if (!activeDeck) {
    return (
      <div>
        <div style={{ display: "flex", gap: 8, marginBottom: "1rem" }}>
          <input
            className="word-input"
            placeholder="新字卡庫名稱，例如：DELF A2 單字"
            value={newDeckName}
            onChange={(e) => setNewDeckName(e.target.value)}
          />
          <button
            onClick={() => {
              if (!newDeckName.trim()) return;
              addDeck(newDeckName);
              setNewDeckName("");
            }}
            style={{ padding: "0 14px", background: INK, color: PAPER, border: "none", borderRadius: 3, display: "flex", alignItems: "center", gap: 6, fontFamily: fontDisplay, cursor: "pointer" }}
          >
            <Plus size={16} /> 建立
          </button>
        </div>

        {decks.length === 0 && (
          <div style={{ textAlign: "center", color: "#6b5f45", padding: "2rem 0", fontSize: "0.9rem" }}>
            還沒有字卡庫，先建立一個吧。
          </div>
        )}

        {decks.map((d) => {
          const count = cards.filter((c) => c.deckId === d.id).length;
          const editing = editingDeckId === d.id;
          return (
            <div
              key={d.id}
              style={{
                display: "flex", alignItems: "center", gap: 10, background: PAPER, border: `1px solid ${MUTED}`,
                borderLeft: `5px solid ${BLUE}`, borderRadius: 2, padding: "0.8rem 1rem", marginBottom: 8, cursor: editing ? "default" : "pointer",
              }}
              onClick={() => !editing && setActiveDeckId(d.id)}
            >
              <Folder size={18} color="#6b5f45" />
              {editing ? (
                <input
                  className="word-input"
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      renameDeck(d.id, editingName.trim() || d.name);
                      setEditingDeckId(null);
                    }
                  }}
                />
              ) : (
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{d.name}</div>
                  <div style={{ fontSize: "0.75rem", color: "#8a7b56" }}>{count} 張卡</div>
                </div>
              )}
              {editing ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    renameDeck(d.id, editingName.trim() || d.name);
                    setEditingDeckId(null);
                  }}
                  style={{ background: "none", border: "none", color: GREEN, cursor: "pointer" }}
                >
                  <Check size={16} />
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingDeckId(d.id);
                    setEditingName(d.name);
                  }}
                  style={{ background: "none", border: "none", color: "#8a7b56", cursor: "pointer" }}
                >
                  <Pencil size={15} />
                </button>
              )}
              {confirmDeleteDeck === d.id ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteDeck(d.id);
                    setConfirmDeleteDeck(null);
                  }}
                  style={{ background: RED, color: PAPER, border: "none", borderRadius: 2, padding: "4px 8px", fontSize: "0.72rem", cursor: "pointer" }}
                >
                  確定刪除
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDeleteDeck(d.id);
                  }}
                  style={{ background: "none", border: "none", color: "#8a7b56", cursor: "pointer" }}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <DeckDetail
      deck={activeDeck}
      cards={cards.filter((c) => c.deckId === activeDeck.id)}
      onBack={() => setActiveDeckId(null)}
      addCard={addCard}
      updateCard={updateCard}
      deleteCard={deleteCard}
    />
  );
}

function DeckDetail({ deck, cards, onBack, addCard, updateCard, deleteCard }) {
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const emptyForm = { word: "", pos: "n.", conjugation: "", meaning: "", example: "", exampleTranslation: "", note: "" };
  const [form, setForm] = useState(emptyForm);

  const filtered = cards.filter(
    (c) => c.word.toLowerCase().includes(search.toLowerCase()) || c.meaning.toLowerCase().includes(search.toLowerCase())
  );

  // Plain click handler (not tied to native <form> submit) so it always
  // fires reliably, including inside embedded/standalone webviews.
  function submit() {
    if (!form.word.trim() && !form.meaning.trim() && !form.example.trim()) {
      setShowAddForm(false);
      return;
    }
    if (editingId) {
      updateCard(editingId, form);
      setEditingId(null);
    } else {
     addCard(deck.id, {
  ...form,
  youglishUrl: form.word.trim()
    ? `https://youglish.com/pronounce/${encodeURIComponent(form.word.trim())}/french`
    : "",
});
    }
    setForm(emptyForm);
    setShowAddForm(false);
  }

  function startEdit(c) {
    setForm({
      word: c.word,
      pos: c.pos,
      conjugation: c.conjugation || "",
      meaning: c.meaning,
      example: c.example,
      exampleTranslation: c.exampleTranslation || "",
      note: c.note,
    });
    setEditingId(c.id);
    setShowAddForm(true);
  }

  const cambridgeUrl = form.word.trim()
    ? `https://dictionary.cambridge.org/dictionary/french-english/${encodeURIComponent(form.word.trim())}`
    : null;
  const youglishUrl = form.word.trim()
    ? `https://youglish.com/pronounce/${encodeURIComponent(form.word.trim())}/french`
    : null;

  return (
    <div>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "#6b5f45", cursor: "pointer", padding: 0, marginBottom: 10, fontSize: "0.85rem" }}>
        <ChevronLeft size={16} /> 返回字卡庫列表
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "1rem" }}>
        <FolderOpen size={20} color={BLUE} />
        <div style={{ fontFamily: fontDisplay, fontSize: "1.2rem" }}>{deck.name}</div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: "1rem" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#8a7b56" }} />
          <input className="word-input" style={{ paddingLeft: 32 }} placeholder="搜尋單字或意思..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button
          onClick={() => {
            setForm(emptyForm);
            setEditingId(null);
            setShowAddForm((v) => !v);
          }}
          style={{ padding: "0 14px", background: showAddForm ? INK : PAPER, color: showAddForm ? PAPER : INK, border: `1px solid ${INK}`, borderRadius: 3, display: "flex", alignItems: "center", gap: 6, fontFamily: fontDisplay, cursor: "pointer" }}
        >
          <Plus size={16} /> 新增
        </button>
      </div>

      {showAddForm && (
        <div style={{ background: PAPER, border: `1px solid ${MUTED}`, borderTop: `4px solid ${RED}`, borderRadius: 3, padding: "1rem", marginBottom: "1.25rem" }}>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: "0.75rem", color: "#6b5f45" }}>單字 / 片語 / 句子</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                className="word-input"
                value={form.word}
                onChange={(e) => setForm({ ...form, word: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="abondant"
              />
              <button type="button" onClick={() => speak(form.word, "fr-FR")} style={{ background: "none", border: `1px solid ${MUTED}`, borderRadius: 3, padding: "0 10px", cursor: "pointer", color: "#6b5f45" }}>
                <Volume2 size={16} />
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {cambridgeUrl && (
                <a className="link-btn" href={cambridgeUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={12} /> 查 Cambridge 字典
                </a>
              )}
              {youglishUrl && (
                <a className="link-btn" href={youglishUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={12} /> 查 YouGlish 發音影片
                </a>
              )}
            </div>
            {!form.word.trim() && (
              <div style={{ fontSize: "0.72rem", color: "#a89a76", marginTop: 4 }}>輸入單字後即可開啟查詢連結，查到後手動貼回下方欄位。</div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: "0.75rem", color: "#6b5f45" }}>詞性</label>
              <select className="word-input" value={form.pos} onChange={(e) => setForm({ ...form, pos: e.target.value })}>
                {POS_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: "0.75rem", color: "#6b5f45" }}>英文翻譯</label>
              <input className="word-input" value={form.meaning} onChange={(e) => setForm({ ...form, meaning: e.target.value })} placeholder="abundant" />
            </div>
          </div>

          {form.pos === "v." && (
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: "0.75rem", color: "#6b5f45" }}>動詞變化</label>
              <textarea className="word-input" rows={2} value={form.conjugation} onChange={(e) => setForm({ ...form, conjugation: e.target.value })} placeholder="je vais, tu vas, il va..." />
            </div>
          )}

          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: "0.75rem", color: "#6b5f45" }}>例句（拼字卡複習模式會用到）</label>
            <div style={{ display: "flex", gap: 6 }}>
              <textarea className="word-input" rows={2} value={form.example} onChange={(e) => setForm({ ...form, example: e.target.value })} placeholder="Cette région a des ressources abondantes." />
              <button type="button" onClick={() => speak(form.example, "fr-FR")} style={{ background: "none", border: `1px solid ${MUTED}`, borderRadius: 3, padding: "0 10px", cursor: "pointer", color: "#6b5f45", alignSelf: "flex-start" }}>
                <Volume2 size={16} />
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: "0.75rem", color: "#6b5f45" }}>例句英文翻譯（無法自動翻譯，請手動填寫；拼字卡練習時會自動顯示在挖空句子下方）</label>
            <textarea className="word-input" rows={2} value={form.exampleTranslation} onChange={(e) => setForm({ ...form, exampleTranslation: e.target.value })} placeholder="This region has abundant natural resources." />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: "0.75rem", color: "#6b5f45" }}>筆記</label>
            <textarea className="word-input" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="自由補充：用法、易混淆處..." />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={submit} style={{ padding: "8px 16px", background: INK, color: PAPER, border: "none", borderRadius: 3, fontFamily: fontDisplay, cursor: "pointer" }}>
              {editingId ? "儲存修改" : "加入字卡庫"}
            </button>
            <button type="button" onClick={() => { setShowAddForm(false); setEditingId(null); setForm(emptyForm); }} style={{ padding: "8px 16px", background: "transparent", color: INK, border: `1px solid ${MUTED}`, borderRadius: 3, cursor: "pointer" }}>
              取消
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", color: "#6b5f45", padding: "2rem 0", fontSize: "0.9rem" }}>這個字卡庫還沒有卡片。</div>
      )}

      {filtered.map((c) => {
        const meta = STATUS_META[cardStatus(c, Date.now())];
        const confirming = confirmDeleteId === c.id;
        return (
          <div key={c.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, background: PAPER, border: `1px solid ${MUTED}`, borderLeft: `5px solid ${meta.color}`, borderRadius: 2, padding: "0.7rem 0.9rem", marginBottom: 6 }}>
            <button onClick={() => speak(c.word, "fr-FR")} aria-label="發音" style={{ background: "none", border: "none", color: "#6b5f45", cursor: "pointer", padding: 4, marginTop: 2 }}>
              <Volume2 size={16} />
            </button>
            <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => startEdit(c)}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600 }}>{c.word || "（未命名）"}</span>
                <span style={{ fontSize: "0.7rem", color: "#8a7b56" }}>{c.pos}</span>
              </div>
              <div style={{ fontSize: "0.85rem", color: "#4a4030" }}>{c.meaning}</div>
              {c.example && <div style={{ fontSize: "0.78rem", color: "#8a7b56", fontStyle: "italic" }}>{c.example}</div>}
            </div>
            <div style={{ fontSize: "0.7rem", color: meta.color, fontFamily: fontDisplay, whiteSpace: "nowrap", marginTop: 3 }}>{meta.label}</div>
            <button onClick={() => startEdit(c)} aria-label="編輯" style={{ background: "none", border: "none", color: "#8a7b56", cursor: "pointer", padding: 4, marginTop: 2 }}>
              <Pencil size={15} />
            </button>
            {confirming ? (
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => deleteCard(c.id)} style={{ background: RED, color: PAPER, border: "none", borderRadius: 2, padding: "4px 8px", fontSize: "0.72rem", cursor: "pointer" }}>確定</button>
                <button onClick={() => setConfirmDeleteId(null)} style={{ background: "transparent", border: `1px solid ${MUTED}`, borderRadius: 2, padding: "4px 8px", fontSize: "0.72rem", cursor: "pointer" }}>取消</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDeleteId(c.id)} aria-label="刪除" style={{ background: "none", border: "none", color: "#8a7b56", cursor: "pointer", padding: 4, marginTop: 2 }}>
                <Trash2 size={15} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- SETTINGS ----------
function SettingsView({ cards, decks, settings, setSettings, reviewLog }) {
  const sorted = [...reviewLog].sort((a, b) => (a.date < b.date ? 1 : -1));
  let streak = 0;
  for (const r of sorted) {
    if (r.completed > 0) streak++;
    else break;
  }
  const totalReviewed = cards.reduce((sum, c) => sum + c.reviewCount, 0);

  const chartData = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY_MS);
    const ds = todayStr(d);
    const entry = reviewLog.find((r) => r.date === ds);
    const completed = entry ? entry.completed : 0;
    const correct = entry ? entry.correct || 0 : 0;
    const rate = completed > 0 ? Math.round((correct / completed) * 100) : null;
    chartData.push({ label: ds.slice(5), rate });
  }

  return (
    <div>
      <SectionCard title="每日複習目標">
        <label style={{ fontSize: "0.85rem", color: "#4a4030" }}>每天預設複習張數</label>
        <input
          type="number"
          min={1}
          max={200}
          className="word-input"
          style={{ marginTop: 6 }}
          value={settings.dailyTarget}
          onChange={(e) => setSettings({ ...settings, dailyTarget: Math.max(1, parseInt(e.target.value) || 1) })}
        />
      </SectionCard>

      <SectionCard title="成長軌跡" accent={GREEN}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: "0.75rem", color: "#6b5f45", marginBottom: 6 }}>近 14 天正確率（%）</div>
          <div style={{ width: "100%", height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#ded2b3" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#8a7b56" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#8a7b56" }} />
                <Tooltip
                  formatter={(v) => (v === null ? "沒有複習" : `${v}%`)}
                  contentStyle={{ background: PAPER, border: `1px solid ${MUTED}`, fontSize: "0.75rem" }}
                />
                <Line type="monotone" dataKey="rate" stroke={GREEN} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Stat label="總單字卡" value={cards.length} />
          <Stat label="累積複習次數" value={totalReviewed} />
          <Stat label="連續複習天數" value={streak} icon={<Flame size={16} color={RED} />} />
        </div>
      </SectionCard>
    </div>
  );
}
function Stat({ label, value, icon }) {
  return (
    <div style={{ background: "#f3ecd9", borderRadius: 3, padding: "0.8rem" }}>
      <div style={{ fontSize: "0.72rem", color: "#6b5f45", display: "flex", alignItems: "center", gap: 4 }}>{icon}{label}</div>
      <div style={{ fontFamily: fontDisplay, fontSize: "1.4rem" }}>{value}</div>
    </div>
  );
}

// ---------- REVIEW FLOW ----------
function ReviewFlow(props) {
  const { reviewStage, onBack } = props;
  if (reviewStage === "select") return <ModeSelect {...props} />;
  if (reviewStage === "session") return <ReviewSession {...props} />;
  if (reviewStage === "done") return <SessionDone {...props} />;
  return null;
}

function ModeSelect({ onChooseMode, onBack, dailyDueCount, hasAnyCards }) {
  const modes = [
    { id: "flip", title: "翻頁卡牌", desc: "看單字、聽發音，自我判斷 oui / non，翻面確認全部內容。" },
    { id: "audio", title: "純聽力", desc: "只播放發音，輸入英文翻譯，答對才算精通。" },
    { id: "spelling", title: "拼字卡", desc: "例句挖空只留首字母，句子下方附英文翻譯，拼出正確單字。" },
  ];
  return (
    <div>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "#6b5f45", cursor: "pointer", padding: 0, marginBottom: 14, fontSize: "0.85rem" }}>
        <ChevronLeft size={16} /> 返回首頁
      </button>
      {!hasAnyCards ? (
        <div style={{ textAlign: "center", color: "#6b5f45", padding: "2rem 0", fontSize: "0.9rem" }}>
          字卡庫裡還沒有任何卡片，先去新增幾張吧。
        </div>
      ) : (
        <>
          <div style={{ fontFamily: fontDisplay, fontSize: "1.1rem", marginBottom: 12 }}>選擇複習方式（本次 {dailyDueCount} 張，可無限次重複複習）</div>
          {modes.map((m) => (
            <div key={m.id} onClick={() => onChooseMode(m.id, "daily")} style={{ background: PAPER, border: `1px solid ${MUTED}`, borderLeft: `5px solid ${BLUE}`, borderRadius: 2, padding: "1rem", marginBottom: 10, cursor: "pointer" }}>
              <div style={{ fontFamily: fontDisplay, fontSize: "1rem", marginBottom: 4 }}>{m.title}</div>
              <div style={{ fontSize: "0.82rem", color: "#4a4030" }}>{m.desc}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function SessionDone({ sessionStats, onBack, onChooseMode, reviewMode, hasAnyCards }) {
  const pct = sessionStats.total > 0 ? Math.round((sessionStats.correct / sessionStats.total) * 100) : 0;
  return (
    <div style={{ background: PAPER, border: `1px solid ${MUTED}`, borderTop: `4px solid ${GREEN}`, borderRadius: 3, padding: "2rem 1.25rem", textAlign: "center" }}>
      <div style={{ fontFamily: fontDisplay, fontSize: "1.6rem", marginBottom: 6 }}>
        {sessionStats.total === 0 ? (hasAnyCards ? "沒有可複習的卡片" : "字卡庫是空的") : "複習完成"}
      </div>
      {sessionStats.total > 0 && (
        <div style={{ fontSize: "0.9rem", color: "#6b5f45", marginBottom: 16 }}>
          答對 {sessionStats.correct} / {sessionStats.total}（{pct}%）
        </div>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        {hasAnyCards && sessionStats.total > 0 && (
          <button onClick={() => onChooseMode(reviewMode, "daily")} style={{ padding: "10px 20px", background: GREEN, color: PAPER, border: "none", borderRadius: 3, fontFamily: fontDisplay, cursor: "pointer" }}>
            再複習一次
          </button>
        )}
        <button onClick={onBack} style={{ padding: "10px 20px", background: INK, color: PAPER, border: "none", borderRadius: 3, fontFamily: fontDisplay, cursor: "pointer" }}>
          返回首頁
        </button>
      </div>
    </div>
  );
}

function CardDetails({ card }) {
  return (
    <div style={{ textAlign: "left", paddingTop: "1.1rem", marginTop: "1.1rem", borderTop: `1px dashed ${MUTED}` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <div style={{ fontFamily: fontDisplay, fontSize: "1.3rem" }}>{card.word}</div>
        <span style={{ fontSize: "0.72rem", color: "#8a7b56" }}>{card.pos}</span>
        <button onClick={() => speak(card.word, "fr-FR")} style={{ background: "none", border: "none", color: "#6b5f45", cursor: "pointer", marginLeft: "auto" }}>
          <Volume2 size={16} />
        </button>
        {card.youglishUrl && (
          <a
            className="link-btn"
            href={card.youglishUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={12} /> 查 YouGlish
          </a>
        )}
      </div>
      <div style={{ fontSize: "1rem", marginBottom: 8 }}>{card.meaning || "（尚未填寫英文翻譯）"}</div>
      {card.pos === "v." && card.conjugation && (
        <div style={{ fontSize: "0.8rem", color: "#4a4030", marginBottom: 8 }}><b>動詞變化：</b>{card.conjugation}</div>
      )}
      {card.example && (
        <div style={{ fontSize: "0.85rem", color: "#4a4030", fontStyle: "italic", marginBottom: 4 }}>
          {card.example}
          <button onClick={() => speak(card.example, "fr-FR")} style={{ background: "none", border: "none", color: "#6b5f45", cursor: "pointer", marginLeft: 6, verticalAlign: "middle" }}>
            <Volume2 size={13} />
          </button>
        </div>
      )}
      {card.exampleTranslation && (
        <div style={{ fontSize: "0.8rem", color: "#8a7b56", marginBottom: 8 }}>例句翻譯：{card.exampleTranslation}</div>
      )}
      {card.note && <div style={{ fontSize: "0.78rem", color: "#8a7b56" }}><b>筆記：</b>{card.note}</div>}
    </div>
  );
}

function ReviewSession({ reviewMode, queue, qIndex, answered, lastCorrect, typedAnswer, setTypedAnswer, sessionStats, submitAnswer, nextCard, onBack }) {
  const current = queue[qIndex];
  useEffect(() => {
    if (!current) return;
    if (reviewMode === "audio" || reviewMode === "flip") speak(current.word, "fr-FR");
  }, [qIndex]); // eslint-disable-line

  if (!current) return null;

  function checkTyped() {
    const guess = typedAnswer.trim().toLowerCase();
    const correctAns = (reviewMode === "audio" ? current.meaning : current.word).trim().toLowerCase();
    const correct = guess.length > 0 && guess === correctAns;
    submitAnswer(correct);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "#6b5f45", marginBottom: 8, fontFamily: fontDisplay }}>
        <span>{qIndex + 1} / {queue.length}</span>
        <span>答對 {sessionStats.correct}</span>
      </div>

      {/* One single card that grows to fit everything — no forced height, no inner scrolling */}
      <div
        key={current.id + reviewMode}
        className="review-card paper-lines"
        style={{ background: PAPER, border: `1px solid ${MUTED}`, borderRadius: 4, padding: "1.5rem", marginBottom: "1.25rem", textAlign: "center" }}
      >
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: RED }} />

        {reviewMode === "flip" && (
          <>
            <div style={{ fontFamily: fontDisplay, fontSize: "2rem" }}>{current.word}</div>
            <button onClick={() => speak(current.word, "fr-FR")} style={{ marginTop: 14, background: "none", border: `1px solid ${MUTED}`, borderRadius: 20, padding: "6px 10px", cursor: "pointer", color: "#6b5f45", display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.75rem" }}>
              <Volume2 size={14} /> 再聽一次
            </button>
            {!answered && (
              <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "center" }}>
                <button onClick={() => submitAnswer(false)} style={{ padding: "0.7rem 1.4rem", background: PAPER, color: RED, border: `1px solid ${RED}`, borderRadius: 3, fontFamily: fontDisplay, cursor: "pointer" }}>Non</button>
                <button onClick={() => submitAnswer(true)} style={{ padding: "0.7rem 1.4rem", background: GREEN, color: PAPER, border: "none", borderRadius: 3, fontFamily: fontDisplay, cursor: "pointer" }}>Oui</button>
              </div>
            )}
          </>
        )}

        {reviewMode === "audio" && (
          <>
            <button onClick={() => speak(current.word, "fr-FR")} style={{ background: INK, color: PAPER, border: "none", borderRadius: "50%", width: 64, height: 64, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <Volume2 size={26} />
            </button>
            <div style={{ fontSize: "0.78rem", color: "#8a7b56", marginTop: 10 }}>點擊播放發音</div>
            {!answered && (
              <div style={{ marginTop: 18, width: "100%", maxWidth: 260, marginLeft: "auto", marginRight: "auto" }}>
                <input
                  className="word-input"
                  placeholder="輸入英文翻譯"
                  value={typedAnswer}
                  onChange={(e) => setTypedAnswer(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && checkTyped()}
                />
                <button onClick={checkTyped} style={{ marginTop: 8, width: "100%", padding: "0.6rem", background: INK, color: PAPER, border: "none", borderRadius: 3, fontFamily: fontDisplay, cursor: "pointer" }}>確認</button>
              </div>
            )}
          </>
        )}

        {reviewMode === "spelling" && (() => {
          const { display, extraBlank } = buildSpellingPrompt(current);
          return (
            <>
              <div style={{ fontSize: "1.1rem", lineHeight: 1.7 }}>{display}</div>
              {extraBlank && (
                <div style={{ fontSize: "0.85rem", color: "#4a4030", marginTop: 6 }}>
                  （在例句裡找不到這個字的原形，請直接拼出：<span style={{ fontFamily: fontDisplay }}>{extraBlank}</span>）
                </div>
              )}
              <div style={{ fontSize: "0.85rem", color: "#8a7b56", marginTop: 10 }}>
                句子英文翻譯：{current.exampleTranslation || current.meaning || "（尚未填寫，建議之後補上）"}
              </div>
              {!answered && (
                <div style={{ marginTop: 18, width: "100%", maxWidth: 260, marginLeft: "auto", marginRight: "auto" }}>
                  <input
                    className="word-input"
                    placeholder="拼出完整單字"
                    value={typedAnswer}
                    onChange={(e) => setTypedAnswer(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && checkTyped()}
                  />
                  <button onClick={checkTyped} style={{ marginTop: 8, width: "100%", padding: "0.6rem", background: INK, color: PAPER, border: "none", borderRadius: 3, fontFamily: fontDisplay, cursor: "pointer" }}>確認</button>
                </div>
              )}
            </>
          );
        })()}

        {answered && (
          <div style={{ marginTop: 16, fontFamily: fontDisplay, color: lastCorrect ? GREEN : RED, fontSize: "0.95rem" }}>
            {lastCorrect ? "答對了" : "還需要再加強"}
          </div>
        )}

        {answered && <CardDetails card={current} />}
      </div>

      {answered && (
        <button onClick={nextCard} style={{ width: "100%", padding: "0.85rem", background: INK, color: PAPER, border: "none", borderRadius: 3, fontFamily: fontDisplay, cursor: "pointer" }}>
          下一張
        </button>
      )}
      {!answered && (
        <button onClick={onBack} style={{ width: "100%", padding: "0.6rem", background: "transparent", color: "#8a7b56", border: `1px solid ${MUTED}`, borderRadius: 3, cursor: "pointer", fontSize: "0.82rem" }}>
          結束本次複習
        </button>
      )}
    </div>
  );
}
