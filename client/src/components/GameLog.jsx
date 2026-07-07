// ============================================================
// CROWNFALL — GameLog.jsx  (REDESIGN v2)
// Scrolling event feed with color-coded categories, slide-in
// animation, and importance highlights. Capped at 12 entries.
// ============================================================

import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';

// Category → { icon, color, important }
// No emojis — text symbols only
const CATEGORY_STYLE = {
  roll:         { icon: '■',  color: 'var(--c-blue)',   important: false },
  move:         { icon: '→',  color: '#888',             important: false },
  kill:         { icon: '✕',  color: 'var(--c-red)',    important: true  },
  kill_general: { icon: '†',  color: 'var(--c-red)',    important: true  },
  prisoner:     { icon: '∞',  color: 'var(--c-orange)', important: true  },
  liberation:   { icon: '◇',  color: 'var(--c-green)',  important: true  },
  empire:       { icon: '▲',  color: 'var(--c-yellow)', important: true  },
  eliminated:   { icon: '✕',  color: 'var(--c-red)',    important: true  },
  bonus:        { icon: '+',  color: 'var(--c-silver)', important: false },
  retreat:      { icon: '←',  color: 'var(--c-orange)', important: false },
  turn:         { icon: '›',  color: '#555',             important: false },
  system:       { icon: '·',  color: '#555',             important: false },
  winner:       { icon: '★',  color: 'var(--c-yellow)', important: true  },
  info:         { icon: '·',  color: '#888',             important: false },
};

const MAX_ENTRIES = 12;

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

export default function GameLog() {
  const { gameState, error } = useGameStore();
  const scrollRef = useRef(null);

  const rawLog = gameState?.log ?? [];
  const entries = rawLog
    .map((e, i) => {
      if (typeof e === 'string') return { id: i, text: e, category: 'system', ts: null };
      return {
        id: i,
        text:     e.text     ?? String(e),
        category: e.category ?? 'system',
        ts:       e.ts ?? e.time ?? null,
      };
    })
    .slice(-MAX_ENTRIES);

  // Auto-scroll to bottom on new entry
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rawLog.length]);

  return (
    <div className="game-log">
      <div className="log-title">
        <span className="log-title-icon">■</span>
        BATTLE LOG
      </div>

      {error && (
        <div style={{
          margin: '4px 8px',
          padding: '6px 10px',
          background: 'rgba(255,59,59,0.15)',
          border: '1px solid var(--c-red)',
          borderRadius: 'var(--r-sm)',
          color: 'var(--c-red)',
          fontSize: '0.72rem',
        }}>
          ⚠ {error}
        </div>
      )}

      <div className="log-scroll" ref={scrollRef}>
        {entries.length === 0 && (
          <div className="log-empty">Waiting for battle…</div>
        )}
        {rawLog.length > MAX_ENTRIES && (
          <div style={{
            fontSize: '0.62rem',
            color: 'rgba(255,255,255,0.25)',
            textAlign: 'center',
            padding: '2px 0 6px',
          }}>
            — {rawLog.length - MAX_ENTRIES} earlier events —
          </div>
        )}
        {entries.map((entry) => {
          const style = CATEGORY_STYLE[entry.category] ?? CATEGORY_STYLE.system;
          return (
            <div
              key={entry.id}
              className={`log-entry${style.important ? ' log-entry--important' : ''}`}
              style={{ '--log-color': style.color }}
            >
              <span className="log-icon">{style.icon}</span>
              <span className="log-text">{entry.text}</span>
              {entry.ts && (
                <span className="log-time">{formatTime(entry.ts)}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
