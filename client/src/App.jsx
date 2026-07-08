// ============================================================
// CROWNFALL — App.jsx  (REDESIGN v2)
// New game screen: HUD, 3-col layout, conquest/kill overlays,
// confetti winner screen.
// ============================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { useGameSocket, sendMsg } from './hooks/useGameSocket';
import { useGameStore } from './store/gameStore';
import LobbyScreen  from './components/LobbyScreen';
import Board        from './components/Board';
import DicePanel    from './components/DicePanel';
import PlayerPanel  from './components/PlayerPanel';
import Graveyard    from './components/Graveyard';
import GameLog      from './components/GameLog';

// Official Crownfall faction colors: Crimson, Bronze, Gold, Emerald, Sapphire, Silver
const COLOR_HEX = {
  red:    '#B22222',  // Crimson
  orange: '#CE8946',  // Bronze
  yellow: '#D4AF37',  // Gold
  green:  '#50C878',  // Emerald
  blue:   '#0F52BA',  // Sapphire
  silver: '#C4C4C4',  // Silver
};
const PHASE_LABEL = {
  ROLL: 'ROLL', ASSIGN: 'PICK PIECE',
  MOVE: 'MOVE', GAME_OVER: 'GAME OVER',
};

// ── Turn timer (60s countdown, auto-skip on 0) ───────────────
const TURN_LIMIT = 60;

function TurnTimer({ activePlayerId, turnCount, phase, wsRef, isMyTurn }) {
  const startRef    = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const sentRef     = useRef(false);

  // Reset when turn changes OR when a bonus turn starts (turnCount increments both)
  useEffect(() => {
    startRef.current = Date.now();
    setElapsed(0);
    sentRef.current  = false;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [activePlayerId, turnCount]); // reset on new player AND on bonus turns

  // Auto-skip when countdown hits 0 on my turn
  useEffect(() => {
    if (!isMyTurn || sentRef.current) return;
    if (elapsed >= TURN_LIMIT) {
      sentRef.current = true;
      sendMsg(wsRef.current, { type: 'TIMEOUT_SKIP' });
    }
  }, [elapsed, isMyTurn, wsRef]);

  if (phase === 'GAME_OVER') return null;

  const remaining = Math.max(0, TURN_LIMIT - elapsed);
  const warn  = remaining <= 10;
  const pulse = remaining <= 5 && isMyTurn;
  const mins  = Math.floor(remaining / 60);
  const secs  = remaining % 60;
  const label = mins > 0
    ? `${mins}:${String(secs).padStart(2,'0')}`
    : `${secs}s`;

  return (
    <span className={`hud-timer${warn ? ' hud-timer--warn' : ''}${pulse ? ' hud-timer--pulse' : ''}`}>
      {label}
    </span>
  );
}

// ── Total game timer ─────────────────────────────────────────
function GameTimer({ gameStartedAt }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!gameStartedAt) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - gameStartedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [gameStartedAt]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return (
    <span className="hud-game-timer">
      {mins}:{String(secs).padStart(2,'0')}
    </span>
  );
}

// ── Kill flash ───────────────────────────────────────────────
function KillFlash({ log }) {
  const [flash, setFlash] = useState(false);
  const prevLen = useRef(log?.length ?? 0);
  useEffect(() => {
    if (!log || log.length <= prevLen.current) { prevLen.current = log?.length ?? 0; return; }
    const fresh = log.slice(prevLen.current);
    prevLen.current = log.length;
    if (fresh.some(e => typeof e === 'object' && (e.category === 'kill' || e.category === 'kill_general'))) {
      setFlash(true);
      setTimeout(() => setFlash(false), 400);
    }
  }, [log?.length]);
  return flash ? <div className="screen-flash" /> : null;
}

// ── Conquest banner ──────────────────────────────────────────
function ConquestBanner({ log }) {
  const [banner,  setBanner]  = useState(null);
  const [exiting, setExiting] = useState(false);
  const timer   = useRef(null);
  const prevLen = useRef(log?.length ?? 0);

  useEffect(() => {
    if (!log || log.length <= prevLen.current) { prevLen.current = log?.length ?? 0; return; }
    const fresh = log.slice(prevLen.current);
    prevLen.current = log.length;
    const ev = fresh.reverse().find(e => typeof e === 'object' && e.category === 'empire');
    if (!ev) return;
    clearTimeout(timer.current);
    setExiting(false);
    setBanner(ev.text);
    timer.current = setTimeout(() => {
      setExiting(true);
      timer.current = setTimeout(() => { setBanner(null); setExiting(false); }, 350);
    }, 3000);
  }, [log?.length]);

  if (!banner) return null;
  return (
    <div className={`conquest-overlay${exiting ? ' out' : ''}`}>
      <div className="conquest-banner">
        <div className="conquest-label">EMPIRE FALLEN</div>
        <div className="conquest-text">{banner}</div>
      </div>
    </div>
  );
}

// ── Skip notice banner (reads from Zustand store, not gameState) ──
function SkipNoticeBanner({ myPlayerIds }) {
  const skipNotice = useGameStore(s => s.skipNotice);
  const [visible, setVisible]   = useState(false);
  const [exiting, setExiting]   = useState(false);
  const [current, setCurrent]   = useState(null);
  const prevKey = useRef(null);

  useEffect(() => {
    if (!skipNotice) return;
    const key = `${skipNotice.playerId}-${skipNotice.dice?.join(',')}`;
    if (key === prevKey.current) return;
    prevKey.current = key;
    setCurrent(skipNotice);
    setExiting(false);
    setVisible(true);
    const t1 = setTimeout(() => setExiting(true), 3200);
    const t2 = setTimeout(() => { setVisible(false); setExiting(false); }, 3550);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [skipNotice]);

  if (!visible || !current) return null;
  const isMe    = myPlayerIds.includes(current.playerId);
  const who     = isMe ? 'YOU' : (current.playerName ?? '').toUpperCase();
  const dice    = (current.dice ?? []).join('  ');
  const timeout = !!current.timeout;

  return (
    <div className={`skip-notice${timeout ? ' skip-notice--timeout' : ''}${exiting ? ' out' : ''}`}>
      <div className="skip-notice-label">{timeout ? 'TIMED OUT' : 'ROLLED'}</div>
      {dice && <div className="skip-notice-dice">[{dice}]</div>}
      <div className="skip-notice-text">
        {isMe
          ? 'NO VALID MOVES — YOUR TURN IS SKIPPED'
          : `${who} — NO VALID MOVES, SKIPPED`}
      </div>
    </div>
  );
}

// ── Mobile detection ─────────────────────────────────────────
function useMobile() {
  const [mob, setMob] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setMob(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return mob;
}

// ── Mobile game screen ────────────────────────────────────────
// Completely separate DOM from desktop — no CSS conflicts.
// Layout: compact HUD → board (flex:1) → tab bar → bottom panel
function MobileGameScreen({ wsRef }) {
  const [tab, setTab] = useState('dice');

  const gameState    = useGameStore(s => s.gameState);
  const myPlayerIds  = useGameStore(s => s.myPlayerIds);
  const isMyTurnFn   = useGameStore(s => s.isMyTurn);
  const activeLocFn  = useGameStore(s => s.activeLocalPlayerId);

  if (!gameState) return null;
  const { players, phase, activePlayerId, bonusTurnQueue, winner, log, gameStartedAt, turnCount } = gameState;
  const activePlayer  = players[activePlayerId];
  const activeHex     = COLOR_HEX[activePlayer?.color] ?? '#ffffff';
  const isMyTurn      = isMyTurnFn();
  const isHotSeat     = myPlayerIds.length > 1;
  const activeLocalId = activeLocFn();
  const showHandoff   = isHotSeat && isMyTurn && activeLocalId;
  const diceAlert     = isMyTurn && phase !== 'GAME_OVER';

  // Auto-switch to dice tab when turn changes to this player
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (isMyTurn) setTab('dice'); }, [activePlayerId]);

  return (
    <div className="mob-screen">
      {/* Overlays — same as desktop */}
      <KillFlash log={log} />
      <ConquestBanner log={log} />
      <SkipNoticeBanner myPlayerIds={myPlayerIds} />
      {winner && <WinnerOverlay winner={winner} players={players} wsRef={wsRef} />}

      {/* Hot-seat handoff */}
      {showHandoff && (
        <div className="hotseat-banner" style={{ fontSize:'0.78rem', padding:'5px 12px' }}>
          <strong style={{ color: activeHex }}>{activePlayer?.name}</strong> — PASS THE DEVICE
        </div>
      )}

      {/* ── Compact HUD ── */}
      <div className="mob-hud">
        <div className="mob-hud-left">
          <span className="mob-hud-dot"
            style={{ background: activeHex, boxShadow: `0 0 6px ${activeHex}` }} />
          <span className="mob-hud-name" style={{ color: activeHex }}>
            {isMyTurn ? 'Your Turn' : (activePlayer?.name ?? '…')}
          </span>
          {activePlayer?.isBot && <span className="hud-bot-tag">BOT</span>}
        </div>
        <div className="mob-hud-right">
          {bonusTurnQueue > 0 && (
            <span className="hud-bonus-pill">+{bonusTurnQueue}</span>
          )}
          <span className={`hud-phase-pill${isMyTurn ? ' my-turn' : ''}`}>
            {PHASE_LABEL[phase] ?? phase}
          </span>
          <TurnTimer
            activePlayerId={activePlayerId}
            turnCount={turnCount}
            phase={phase}
            wsRef={wsRef}
            isMyTurn={isMyTurn}
          />
          {activePlayer?.isBot && (
            <button className="mob-skip-btn"
              onClick={() => sendMsg(wsRef.current, { type:'SKIP_BOT_TURN' })}>
              Skip
            </button>
          )}
          <button className="mob-leave-btn" onClick={() => window.location.reload()}>✕</button>
        </div>
      </div>

      {/* ── Board — takes all remaining vertical space ── */}
      <div className="mob-board-area">
        <div className="mob-board-inner">
          <Board wsRef={wsRef} />
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="mob-tabbar">
        <button
          className={`mob-tab${tab === 'dice' ? ' mob-tab--active' : ''}`}
          onClick={() => setTab('dice')}
        >
          DICE {diceAlert && <span className="mob-tab-dot" />}
        </button>
        <button
          className={`mob-tab${tab === 'empires' ? ' mob-tab--active' : ''}`}
          onClick={() => setTab('empires')}
        >
          EMPIRES
        </button>
        <button
          className={`mob-tab${tab === 'log' ? ' mob-tab--active' : ''}`}
          onClick={() => setTab('log')}
        >
          LOG
        </button>
      </div>

      {/* ── Bottom panel ── */}
      <div className="mob-panel">
        {tab === 'dice' && (
          <div className="mob-panel-dice">
            <DicePanel wsRef={wsRef} />
          </div>
        )}
        {tab === 'empires' && (
          <div className="mob-panel-empires">
            <PlayerPanel />
            <Graveyard />
          </div>
        )}
        {tab === 'log' && (
          <div className="mob-panel-log">
            <GameLog />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Confetti ────────────────────────────────────────────────
function Confetti() {
  const pieces = useRef(
    Array.from({ length: 60 }, (_, i) => ({
      id: i,
      left:  `${Math.random() * 100}%`,
      w:     `${6 + Math.random() * 10}px`,
      h:     `${8 + Math.random() * 14}px`,
      dur:   `${2.5 + Math.random() * 2}s`,
      delay: `${Math.random() * 1.5}s`,
      color: ['#D4AF37','#B22222','#CE8946','#50C878','#0F52BA','#C4C4C4'][i % 6],
    }))
  ).current;
  return (
    <>
      {pieces.map(p => (
        <div key={p.id} className="confetti-piece" style={{
          '--w': p.w, '--h': p.h, '--dur': p.dur,
          '--delay': p.delay, '--color': p.color,
          left: p.left, width: p.w, height: p.h,
        }} />
      ))}
    </>
  );
}

// ── Winner overlay ───────────────────────────────────────────
function WinnerOverlay({ winner, players, wsRef }) {
  const player = players[winner];
  const hex    = COLOR_HEX[player?.color] ?? '#FFD700';
  return (
    <div className="winner-overlay">
      <Confetti />
      <div className="winner-card">
        {/* Crown SVG instead of emoji */}
        <svg width="64" height="48" viewBox="-32 -24 64 48" style={{ overflow:'visible', marginBottom:4 }}>
          <defs>
            <radialGradient id="crownGrad" cx="50%" cy="30%">
              <stop offset="0%" stopColor="#FFE870" />
              <stop offset="100%" stopColor="#C9A227" />
            </radialGradient>
          </defs>
          <filter id="crownGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <g filter="url(#crownGlow)">
            <rect x="-22" y="6" width="44" height="10" rx="2" fill="url(#crownGrad)" />
            <polygon points="-20,6 -20,-18 -8,-6 0,-22 8,-6 20,-18 20,6" fill="url(#crownGrad)" />
            <circle cx="-20" cy="-18" r="4" fill="#FFE870" />
            <circle cx="20" cy="-18" r="4" fill="#FFE870" />
            <circle cx="0" cy="-22" r="5" fill="#FFE870" />
          </g>
        </svg>
        <div className="winner-title" style={{ color: hex }}>Victory</div>
        <div className="winner-player" style={{ color: hex }}>{player?.name}</div>
        <div className="winner-subtitle">has conquered the realm</div>
        <div className="winner-btns">
          <button className="winner-btn" onClick={() => sendMsg(wsRef.current, { type: 'RESTART_GAME' })}>
            Play Again
          </button>
          <button className="winner-btn winner-btn--secondary" onClick={() => sendMsg(wsRef.current, { type: 'RETURN_TO_LOBBY' })}>
            Return to Lobby
          </button>
          <button className="winner-btn winner-btn--ghost" onClick={() => window.location.reload()}>
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────
export default function App() {
  const wsRef        = useGameSocket();
  const gameState    = useGameStore(s => s.gameState);
  const myPlayerIds  = useGameStore(s => s.myPlayerIds);
  const isMyTurnFn   = useGameStore(s => s.isMyTurn);
  const activeLocFn  = useGameStore(s => s.activeLocalPlayerId);
  const isMobile     = useMobile();

  if (!gameState) return <LobbyScreen wsRef={wsRef} />;

  // Mobile gets its own layout — desktop is completely untouched
  if (isMobile) return <MobileGameScreen wsRef={wsRef} />;

  const { players, phase, activePlayerId, bonusTurnQueue, winner, log, turnCount, gameStartedAt } = gameState;
  const activePlayer  = players[activePlayerId];
  const activeHex     = COLOR_HEX[activePlayer?.color] ?? '#ffffff';
  const isMyTurn      = isMyTurnFn();
  const isHotSeat     = myPlayerIds.length > 1;
  const activeLocalId = activeLocFn();
  const showHandoff   = isHotSeat && isMyTurn && activeLocalId;

  return (
    <div className="game-screen">
      {/* Overlays */}
      <KillFlash log={log} />
      <ConquestBanner log={log} />
      <SkipNoticeBanner myPlayerIds={myPlayerIds} />
      {winner && <WinnerOverlay winner={winner} players={players} wsRef={wsRef} />}

      {/* Hot seat banner */}
      {showHandoff && (
        <div className="hotseat-banner">
          <span>
            <strong style={{ color: activeHex }}>{activePlayer?.name}</strong> — PASS THE DEVICE
          </span>
        </div>
      )}

      {/* HUD */}
      <header className="game-hud">
        <div className="hud-logo-wrap">
          <img src="/logo.png" alt="Crownfall" className="hud-logo" />
          <span className="hud-logo-name">CROWNFALL</span>
        </div>

        <span className="hud-sep" />

        <span className={`hud-phase-pill${isMyTurn ? ' my-turn' : ''}`}>
          {PHASE_LABEL[phase] ?? phase}
        </span>

        {bonusTurnQueue > 0 && (
          <span className="hud-bonus-pill">+{bonusTurnQueue}</span>
        )}

        <div className="hud-active-player">
          <span className="hud-player-dot" style={{ background: activeHex, boxShadow: `0 0 6px ${activeHex}` }} />
          <span className="hud-player-name" style={{ color: activeHex }}>
            {isMyTurn ? 'Your Turn' : (activePlayer?.name ?? '…')}
          </span>
          {activePlayer?.isBot && <span className="hud-bot-tag">BOT</span>}
        </div>

        {turnCount > 0 && (
          <span className="hud-turn-num">T{turnCount}</span>
        )}

        {/* Per-turn countdown — 60s */}
        <TurnTimer
          activePlayerId={activePlayerId}
          turnCount={turnCount}
          phase={phase}
          wsRef={wsRef}
          isMyTurn={isMyTurn}
        />

        {/* Total game clock */}
        {gameStartedAt && <GameTimer gameStartedAt={gameStartedAt} />}

        <div className="hud-spacer" />

        {activePlayer?.isBot && (
          <button className="hud-skip-btn"
            onClick={() => sendMsg(wsRef.current, { type: 'SKIP_BOT_TURN' })}>
            Skip Bot
          </button>
        )}

        <button className="hud-leave-btn" onClick={() => window.location.reload()}>
          Leave
        </button>
      </header>

      {/* Main 3-col layout */}
      <main className="game-main">
        {/* Left: Players */}
        <aside className="game-left">
          <PlayerPanel />
          <Graveyard />
        </aside>

        {/* Center: Board */}
        <section className="game-center">
          <div className="game-board-wrap">
            <Board wsRef={wsRef} />
          </div>
        </section>

        {/* Right: Dice + Log */}
        <aside className="game-right">
          <DicePanel wsRef={wsRef} />
          <GameLog />
        </aside>
      </main>
    </div>
  );
}
