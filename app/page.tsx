"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/** ===========================================
 * SprachenlernApp – Pro Version (Dynamic Sync)
 * - Dynamischer Download von Sprachpaketen
 * - Fortschritt Export/Import (Backup)
 * - SRS + Übungen + Gamification
 * =========================================== */

type View = "today" | "practice" | "profile" | "settings";
type ThemeMode = "light" | "dark";
type AppTheme = "ocean" | "sunset" | "lime" | "grape";
type Lang = "EN" | "ES" | "FR" | "RU";
type Level = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
type CardKind = "vocab" | "sentence";

type Card = {
  id: string;
  targetLang: Lang;
  kind: CardKind;
  front: string;
  back: string;
  example?: string;
  exampleTranslation?: string;
  due: number;
  intervalDays: number;
  ease: number;
  lapses: number;
  lastReviewed?: number;
};

type DailyStat = { reviewed: number; correct: number; wrong: number; minutes: number };

type Profile = {
  username: string;
  nativeLang: "DE";
  targetLang: Lang;
  level: Level;
  dailyGoal: number;
  xp: number;
  streak: number;
  bestStreak: number;
  lastActiveDay: string;
  createdAt: number;
};

type Achievement = {
  id: string;
  title: string;
  desc: string;
  icon: string;
  unlockedAt?: number;
};

type AppData = {
  cards: Card[];
  profile: Profile;
  achievements: Achievement[];
  dailyStatsByLang: Record<Lang, Record<string, DailyStat>>;
};

const STORAGE_KEY = "sprachapp_pro_v2";

/** ---------- API Simulation Data ---------- */
const PACKS_API: Record<Lang, any> = {
  EN: {
    vocab: [{ de: "laufen", x: "to run" }, { de: "essen", x: "to eat" }, { de: "Zeit", x: "time" }],
    sentences: [{ de: "Ich habe Zeit.", x: "I have time." }]
  },
  ES: {
    vocab: [{ de: "Hallo", x: "hola" }, { de: "bitte", x: "por favor" }, { de: "danke", x: "gracias" }],
    sentences: [{ de: "Gern geschehen.", x: "De nada." }]
  },
  FR: {
    vocab: [{ de: "Wasser", x: "eau" }, { de: "Brot", x: "pain" }],
    sentences: [{ de: "Ein Baguette, bitte.", x: "Une baguette, s'il vous plaît." }]
  },
  RU: {
    vocab: [{ de: "Haus", x: "дом" }, { de: "Freund", x: "друг" }],
    sentences: [{ de: "Wie geht es dir?", x: "Как дела?" }]
  }
};

/** ---------- Helpers ---------- */
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function todayKey(d = new Date()) { return d.toISOString().split('T')[0]; }
function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }

/** ---------- SRS Logic ---------- */
function schedule(card: Card, correct: boolean): Card {
  const now = Date.now();
  let ease = card.ease;
  let intervalDays = card.intervalDays;
  if (correct) {
    ease = clamp(ease + 0.1, 1.3, 2.8);
    intervalDays = intervalDays === 0 ? 1 : Math.round(intervalDays * ease);
  } else {
    ease = clamp(ease - 0.2, 1.3, 2.8);
    intervalDays = 0;
  }
  return { ...card, ease, intervalDays, due: now + (correct ? intervalDays : 0.1) * 86400000, lapses: correct ? card.lapses : card.lapses + 1, lastReviewed: now };
}

/** ---------- Audio Feedback ---------- */
function playTone(type: "good" | "bad") {
  if (typeof window === "undefined") return;
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(type === "good" ? 880 : 220, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
  o.connect(g); g.connect(ctx.destination);
  o.start(); o.stop(ctx.currentTime + 0.2);
}

/** ---------- Main Page ---------- */
export default function Page() {
  const [data, setData] = useState<AppData | null>(null);
  const [view, setView] = useState<View>("today");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Load Initial Data
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setData(JSON.parse(saved));
    } else {
      const initial: AppData = {
        cards: [],
        profile: { username: "User", nativeLang: "DE", targetLang: "EN", level: "BEGINNER", dailyGoal: 10, xp: 0, streak: 0, bestStreak: 0, lastActiveDay: todayKey(), createdAt: Date.now() },
        achievements: [{ id: "welcome", title: "Willkommen", desc: "Erste Sprache geladen", icon: "🚀" }],
        dailyStatsByLang: { EN: {}, ES: {}, FR: {}, RU: {} }
      };
      setData(initial);
    }
  }, []);

  // Save Data on change
  useEffect(() => { if (data) localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }, [data]);

  const downloadLanguagePack = async (lang: Lang) => {
    setIsDownloading(true);
    setDownloadProgress(0);

    // Simulation: Pakete "herunterladen"
    for (let i = 0; i <= 100; i += 5) {
      await new Promise(r => setTimeout(r, 80));
      setDownloadProgress(i);
    }

    const pack = PACKS_API[lang];
    const newCards: Card[] = [
      ...pack.vocab.map((v: any) => ({ id: uid(), targetLang: lang, kind: "vocab", front: v.de, back: v.x, due: Date.now(), intervalDays: 0, ease: 2.0, lapses: 0 })),
      ...pack.sentences.map((s: any) => ({ id: uid(), targetLang: lang, kind: "sentence", front: s.de, back: s.x, due: Date.now(), intervalDays: 0, ease: 2.0, lapses: 0 }))
    ];

    setData(prev => {
      if (!prev) return prev;
      // Verhindere Duplikate
      const existing = new Set(prev.cards.map(c => `${c.targetLang}-${c.front}`));
      const filtered = newCards.filter(c => !existing.has(`${c.targetLang}-${c.front}`));
      return { ...prev, cards: [...prev.cards, ...filtered], profile: { ...prev.profile, targetLang: lang } };
    });

    setIsDownloading(false);
  };

  const handleReview = (correct: boolean) => {
    if (!data || !nextCard) return;
    playTone(correct ? "good" : "bad");
    const updatedCards = data.cards.map(c => c.id === nextCard.id ? schedule(c, correct) : c);
    const today = todayKey();
    const lang = data.profile.targetLang;
    
    setData(prev => {
      if (!prev) return null;
      const stats = { ...prev.dailyStatsByLang };
      const dayStat = stats[lang][today] || { reviewed: 0, correct: 0, wrong: 0, minutes: 0 };
      stats[lang][today] = { ...dayStat, reviewed: dayStat.reviewed + 1, correct: dayStat.correct + (correct ? 1 : 0) };
      return { ...prev, cards: updatedCards, profile: { ...prev.profile, xp: prev.profile.xp + (correct ? 10 : 2) }, dailyStatsByLang: stats };
    });
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sprachapp_backup_${todayKey()}.json`;
    a.click();
  };

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target?.result as string);
        setData(imported);
        alert("Backup erfolgreich geladen!");
      } catch { alert("Fehler beim Import!"); }
    };
    reader.readAsText(file);
  };

  if (!data) return null;

  const currentLang = data.profile.targetLang;
  const dueCards = data.cards.filter(c => c.targetLang === currentLang && c.due <= Date.now());
  const nextCard = dueCards[0];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 pb-20">
      
      {/* DOWNLOAD OVERLAY */}
      {isDownloading && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/90 p-6 text-center backdrop-blur-sm">
          <div className="mb-6 text-6xl animate-pulse">🌍</div>
          <h2 className="text-2xl font-black text-white mb-2">Sprachpaket {currentLang} wird geladen...</h2>
          <div className="w-full max-w-xs h-4 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${downloadProgress}%` }} />
          </div>
          <p className="mt-3 font-mono text-indigo-400">{downloadProgress}% geladen</p>
        </div>
      )}

      {/* HEADER */}
      <header className="p-6 flex justify-between items-center border-b border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 sticky top-0 backdrop-blur-md z-10">
        <div>
          <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
            <span className="text-2xl">🦉</span> {view.toUpperCase()}
          </h1>
          <div className="text-xs font-bold text-slate-500 uppercase">{currentLang} Kurs</div>
        </div>
        <div className="bg-orange-500/10 text-orange-600 px-3 py-1 rounded-full font-bold text-sm">
          🔥 {data.profile.streak}
        </div>
      </header>

      <main className="max-w-xl mx-auto p-6">
        
        {/* TODAY VIEW */}
        {view === "today" && (
          <div className="space-y-6">
            <div className="bg-indigo-600 rounded-3xl p-6 text-white shadow-xl shadow-indigo-500/20">
              <div className="text-sm font-bold opacity-80 uppercase tracking-widest">XP Fortschritt</div>
              <div className="text-4xl font-black my-1">{data.profile.xp} <span className="text-lg font-normal">XP</span></div>
              <div className="h-2 w-full bg-white/20 rounded-full mt-4">
                <div className="h-full bg-white rounded-full" style={{ width: `${(data.profile.xp % 100)}%` }} />
              </div>
            </div>

            {nextCard ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2.5rem] p-8 shadow-sm text-center">
                <div className="text-xs font-bold text-slate-400 uppercase mb-8">Wie sagt man auf {currentLang}?</div>
                <div className="text-4xl font-black mb-12">{nextCard.front}</div>
                <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => handleReview(false)} className="py-4 rounded-2xl bg-rose-500 text-white font-bold shadow-lg shadow-rose-500/30">✖ Nein</button>
                  <button onClick={() => handleReview(true)} className="py-4 rounded-2xl bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-500/30">✔ Ja</button>
                </div>
                <button 
                  onClick={() => alert(`Lösung: ${nextCard.back}`)}
                  className="mt-6 text-sm font-bold text-indigo-500"
                >Lösung anzeigen</button>
              </div>
            ) : (
              <div className="text-center p-12 bg-slate-100 dark:bg-slate-900/30 rounded-[2.5rem] border-2 border-dashed border-slate-300 dark:border-slate-800">
                <div className="text-4xl mb-4">🎉</div>
                <h3 className="text-xl font-bold">Alles erledigt!</h3>
                <p className="text-slate-500 text-sm mt-2">Du hast alle Karten für heute wiederholt.</p>
                <button onClick={() => downloadLanguagePack(currentLang)} className="mt-6 bg-slate-900 dark:bg-white dark:text-slate-900 text-white px-6 py-3 rounded-full font-bold">Neue Karten laden</button>
              </div>
            )}
          </div>
        )}

        {/* SETTINGS VIEW */}
        {view === "settings" && (
          <div className="space-y-4">
            <section className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800">
              <h3 className="font-bold mb-4">Sprache wechseln</h3>
              <div className="grid grid-cols-2 gap-2">
                {(["EN", "ES", "FR", "RU"] as Lang[]).map(l => (
                  <button 
                    key={l}
                    onClick={() => downloadLanguagePack(l)}
                    className={`p-4 rounded-2xl font-bold border-2 transition-all ${currentLang === l ? "border-indigo-500 bg-indigo-500/10 text-indigo-600" : "border-slate-100 dark:border-slate-800"}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </section>

            <section className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800">
              <h3 className="font-bold mb-4">Fortschritt sichern</h3>
              <div className="space-y-3">
                <button onClick={exportData} className="w-full p-4 rounded-2xl bg-slate-100 dark:bg-slate-800 font-bold flex items-center justify-between">
                  <span>Backup exportieren</span>
                  <span>📥</span>
                </button>
                <label className="w-full p-4 rounded-2xl bg-slate-100 dark:bg-slate-800 font-bold flex items-center justify-between cursor-pointer">
                  <span>Backup laden</span>
                  <span>📤</span>
                  <input type="file" accept=".json" onChange={importData} className="hidden" />
                </label>
              </div>
            </section>
          </div>
        )}

        {/* PROFILE VIEW (Placeholder) */}
        {view === "profile" && (
           <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] text-center border border-slate-200 dark:border-slate-800">
             <div className="w-24 h-24 bg-gradient-to-tr from-indigo-500 to-fuchsia-500 rounded-full mx-auto mb-4 flex items-center justify-center text-4xl shadow-xl">👤</div>
             <h2 className="text-2xl font-black">{data.profile.username}</h2>
             <p className="text-slate-500 font-bold uppercase text-xs tracking-widest mt-1">Level {Math.floor(data.profile.xp / 100) + 1} Philologe</p>
             <div className="mt-8 grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                  <div className="text-2xl font-black">{data.cards.length}</div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Karten</div>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                  <div className="text-2xl font-black">{data.profile.bestStreak}</div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Rekord</div>
                </div>
             </div>
           </div>
        )}

      </main>

      {/* NAVIGATION */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800 p-4 flex justify-around items-center z-50">
        {(["today", "profile", "settings"] as View[]).map(v => (
          <button 
            key={v}
            onClick={() => setView(v)}
            className={`p-2 transition-all ${view === v ? "text-indigo-500 scale-110" : "text-slate-400"}`}
          >
            <span className="text-2xl">
              {v === "today" ? "📚" : v === "profile" ? "👤" : "⚙️"}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}
