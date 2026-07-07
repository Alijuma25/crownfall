// ============================================================
// CROWNFALL — LobbyScreen.jsx  (WAR CHAMBER v3)
// Serious medieval strategy aesthetic.
// War room interior — command table, stone hall, campaign map.
// Not a castle exterior. Empire. Strategy. War.
// ============================================================

import { useState, useRef, useEffect } from 'react';
import { useGameStore }   from '../store/gameStore';
import { sendMsg }        from '../hooks/useGameSocket';

// ── Faction constants ───────────────────────────────────────────
// Official Crownfall empires — clockwise order on the board
const ALL_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'silver'];

// Heraldic faction colors — must look like the faction name
const COLOR_HEX = {
  red:    '#B22222',  // Crimson
  orange: '#CE8946',  // Bronze
  yellow: '#D4AF37',  // Gold
  green:  '#50C878',  // Emerald
  blue:   '#0F52BA',  // Sapphire
  silver: '#C4C4C4',  // Silver
};
const COLOR_DARK = {
  red:    '#6B1212',
  orange: '#7A4A1A',
  yellow: '#7A6200',
  green:  '#1A7040',
  blue:   '#072A6A',
  silver: '#6A6A6A',
};
const COLOR_LABEL = {
  red:'Crimson', orange:'Bronze', yellow:'Gold',
  green:'Emerald', blue:'Sapphire', silver:'Silver',
};

const DIFF_ORDER  = ['easy', 'medium', 'hard', 'impossible'];
const DIFF_LABELS = {
  easy:       'Peasant',
  medium:     'Knight',
  hard:       'Warlord',
  impossible: 'Conqueror',
};
const DIFF_DESC = {
  easy:       'Beginner difficulty. Designed for new commanders.',
  medium:     'Normal difficulty. For players who know the basics.',
  hard:       'Hard difficulty. For experienced strategists.',
  impossible: 'Expert difficulty. The ultimate challenge.',
};

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function randomColor()  { return ALL_COLORS[Math.floor(Math.random() * ALL_COLORS.length)]; }

// ── War Room SVG Background ─────────────────────────────────────
// Interior of a stone war chamber — heavy columns, campaign map table,
// heraldic banners, candle braziers. No cartoon castle.
function WarRoomScene() {
  return (
    <svg className="lob-castle-svg" viewBox="0 0 1400 580"
      preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <defs>
        {/* Stone floor gradient */}
        <linearGradient id="wr-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#1c1510" />
          <stop offset="100%" stopColor="#0d0a07" />
        </linearGradient>
        {/* Back wall */}
        <linearGradient id="wr-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#100c08" />
          <stop offset="100%" stopColor="#180f0a" />
        </linearGradient>
        {/* Table top */}
        <linearGradient id="wr-table" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#3a2510" />
          <stop offset="100%" stopColor="#1e1408" />
        </linearGradient>
        {/* Parchment map */}
        <linearGradient id="wr-parch" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"  stopColor="#8B7240" />
          <stop offset="40%" stopColor="#7A6030" />
          <stop offset="100%" stopColor="#5A4020" />
        </linearGradient>
        {/* Column gradient */}
        <linearGradient id="wr-col" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"  stopColor="#0e0a06" />
          <stop offset="40%" stopColor="#1e1610" />
          <stop offset="100%" stopColor="#0a0806" />
        </linearGradient>
        {/* Brazier glow */}
        <radialGradient id="wr-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stopColor="rgba(255,165,0,0.5)" />
          <stop offset="60%" stopColor="rgba(200,80,0,0.15)" />
          <stop offset="100%" stopColor="rgba(150,40,0,0)" />
        </radialGradient>
        {/* Window light */}
        <radialGradient id="wr-winlight" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stopColor="rgba(180,140,60,0.18)" />
          <stop offset="100%" stopColor="rgba(100,60,20,0)" />
        </radialGradient>
        {/* Map territory fills */}
        <radialGradient id="wr-terr1" cx="30%" cy="40%" r="50%">
          <stop offset="0%"  stopColor="rgba(100,60,20,0.6)" />
          <stop offset="100%" stopColor="rgba(60,30,10,0)" />
        </radialGradient>
      </defs>

      {/* ── Back wall — rough stone blocks ── */}
      <rect x="0" y="0" width="1400" height="580" fill="url(#wr-wall)" />
      {/* Stone block rows on back wall */}
      {[0,1,2,3,4,5,6].map(row => (
        Array.from({length: 14 + (row%2)}, (_, col) => {
          const bw = row%2 === 0 ? 100 : 108;
          const offset = row%2 === 0 ? 0 : -4;
          return (
            <rect key={`${row}-${col}`}
              x={offset + col*bw} y={row*48}
              width={bw-2} height={46}
              fill="none"
              stroke="rgba(0,0,0,0.35)"
              strokeWidth="1.5" />
          );
        })
      ))}

      {/* ── Three arched windows (back wall) ── */}
      {[350, 700, 1050].map((wx, i) => (
        <g key={i}>
          {/* Window recess */}
          <rect x={wx-55} y={20} width={110} height={240} rx={55} fill="#06040200" />
          {/* Window arch (deep recess) */}
          <path d={`M${wx-50},260 L${wx-50},80 A50,50 0 0 1 ${wx+50},80 L${wx+50},260 Z`}
            fill="#04030100" />
          {/* Light coming through */}
          <path d={`M${wx-50},260 L${wx-50},80 A50,50 0 0 1 ${wx+50},80 L${wx+50},260 Z`}
            fill="rgba(100,80,30,0.08)" />
          {/* Window frame */}
          <path d={`M${wx-50},260 L${wx-50},80 A50,50 0 0 1 ${wx+50},80 L${wx+50},260`}
            fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="3" />
          {/* Iron cross bars */}
          <line x1={wx} y1={100} x2={wx} y2={255} stroke="rgba(0,0,0,0.6)" strokeWidth="2.5" />
          <line x1={wx-46} y1={165} x2={wx+46} y2={165} stroke="rgba(0,0,0,0.6)" strokeWidth="2.5" />
          {/* Glow from outside */}
          <ellipse cx={wx} cy={165} rx={56} ry={90} fill="url(#wr-winlight)" />
        </g>
      ))}

      {/* ── Heraldic banner — left ── */}
      <rect x="100" y="10" width="6" height="260" fill="#2a1a08" />
      <polygon points="103,10 150,10 150,180 103,210" fill="#5A0A0A"
        className="lob-flag" style={{ transformOrigin:'103px 10px' }} />
      <line x1="118" y1="40" x2="146" y2="40" stroke="rgba(200,160,0,0.5)" strokeWidth="1.5" />
      <line x1="118" y1="70" x2="146" y2="70" stroke="rgba(200,160,0,0.5)" strokeWidth="1.5" />
      <line x1="118" y1="100" x2="146" y2="100" stroke="rgba(200,160,0,0.5)" strokeWidth="1.5" />
      <rect x="118" y="50" width="28" height="28" fill="none"
        stroke="rgba(200,160,0,0.4)" strokeWidth="1" />

      {/* ── Heraldic banner — right ── */}
      <rect x="1294" y="10" width="6" height="260" fill="#2a1a08" />
      <polygon points="1297,10 1250,10 1250,180 1297,210" fill="#0A0A5A"
        className="lob-flag lob-flag--r" style={{ transformOrigin:'1297px 10px' }} />
      <line x1="1254" y1="40" x2="1282" y2="40" stroke="rgba(200,160,0,0.5)" strokeWidth="1.5" />
      <line x1="1254" y1="70" x2="1282" y2="70" stroke="rgba(200,160,0,0.5)" strokeWidth="1.5" />
      <line x1="1254" y1="100" x2="1282" y2="100" stroke="rgba(200,160,0,0.5)" strokeWidth="1.5" />
      <rect x="1254" y="50" width="28" height="28" fill="none"
        stroke="rgba(200,160,0,0.4)" strokeWidth="1" />

      {/* ── Large heraldic banner — center wall ── */}
      <rect x="697" y="0" width="6" height="200" fill="#2a1a08" />
      <polygon points="700,0 755,0 755,150 700,180 645,150 645,0"
        fill="#3A0A0A" className="lob-flag" style={{ transformOrigin:'700px 0px' }} />
      {/* Crown symbol on center banner */}
      <polygon points="700,40 712,60 724,40 718,70 682,70 688,40 700,40"
        fill="rgba(200,160,0,0.4)" />
      <rect x="680" y="68" width="40" height="8" rx="2" fill="rgba(200,160,0,0.35)" />

      {/* ── Heavy stone columns (foreground) ── */}
      {[80, 320, 1080, 1320].map((cx, i) => (
        <g key={i}>
          {/* Column shaft */}
          <rect x={cx-28} y={0} width={56} height={580} fill="url(#wr-col)" />
          {/* Column edge highlight */}
          <rect x={cx-28} y={0} width={3} height={580} fill="rgba(255,255,255,0.03)" />
          {/* Capital top */}
          <rect x={cx-36} y={0} width={72} height={24} fill="#0e0a06" />
          <rect x={cx-38} y={0} width={76} height={8}  fill="#0c0908" />
          {/* Stone joint lines */}
          {[80,160,240,320,400,480].map(y => (
            <line key={y} x1={cx-28} y1={y} x2={cx+28} y2={y}
              stroke="rgba(0,0,0,0.4)" strokeWidth="1" />
          ))}
        </g>
      ))}

      {/* ── Stone floor (perspective) ── */}
      <polygon points="0,430 1400,430 1400,580 0,580" fill="url(#wr-floor)" />
      {/* Floor perspective lines */}
      {[0,1,2,3,4,5,6,7,8].map(i => (
        <line key={i}
          x1={700} y1={430}
          x2={i * (1400/8)} y2={580}
          stroke="rgba(0,0,0,0.3)" strokeWidth="1" />
      ))}
      {/* Floor horizontal seams */}
      {[450, 480, 515, 555].map((y, i) => (
        <line key={i} x1={0} y1={y} x2={1400} y2={y}
          stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
      ))}

      {/* ── Campaign table ── */}
      {/* Table legs */}
      {[360, 560, 840, 1040].map((x, i) => (
        <rect key={i} x={x-12} y={490} width={24} height={90} fill="#1a1006" />
      ))}
      {/* Table surface — thick oak top */}
      <rect x="340" y="435" width="720" height="65" rx="4" fill="#261808" />
      <rect x="344" y="437" width="712" height="59" rx="3" fill="url(#wr-table)" />
      {/* Table edge highlight */}
      <rect x="344" y="437" width="712" height="3" rx="2" fill="rgba(255,255,255,0.05)" />
      {/* Table wood grain */}
      {[0,1,2,3,4,5].map(i => (
        <line key={i} x1={350} y1={440+i*9} x2={1050} y2={440+i*9}
          stroke="rgba(0,0,0,0.15)" strokeWidth="1" />
      ))}

      {/* ── Parchment map on table ── */}
      <rect x="370" y="440" width="660" height="50" rx="2" fill="url(#wr-parch)" opacity="0.85" />
      {/* Map border */}
      <rect x="370" y="440" width="660" height="50" rx="2"
        fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="1.5" />
      {/* Map territory lines */}
      <line x1="520" y1="440" x2="500" y2="490" stroke="rgba(0,0,0,0.3)" strokeWidth="1" />
      <line x1="700" y1="440" x2="700" y2="490" stroke="rgba(0,0,0,0.3)" strokeWidth="1" />
      <line x1="880" y1="440" x2="900" y2="490" stroke="rgba(0,0,0,0.3)" strokeWidth="1" />
      <line x1="520" y1="465" x2="880" y2="465" stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
      {/* Territory markers (small circles) */}
      {[[440,458],[540,450],[610,470],[700,455],[790,470],[860,450],[980,458]].map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r="4"
          fill={['#8B1A1A','#5A3010','#1A3A6A','#3A1A6A','#1A4A30','#6A5010','#6A2010'][i]}
          stroke="rgba(0,0,0,0.5)" strokeWidth="1" />
      ))}
      {/* Compass rose on map */}
      <g transform="translate(950,462)">
        <line x1="0" y1="-12" x2="0" y2="12" stroke="rgba(0,0,0,0.4)" strokeWidth="1.2" />
        <line x1="-12" y1="0" x2="12" y2="0" stroke="rgba(0,0,0,0.4)" strokeWidth="1.2" />
        <polygon points="0,-12 3,-4 -3,-4" fill="rgba(0,0,0,0.35)" />
        <circle cx="0" cy="0" r="3" fill="rgba(0,0,0,0.3)" />
      </g>

      {/* ── Braziers — left and right of table ── */}
      {[280, 1120].map((bx, i) => (
        <g key={i}>
          {/* Glow */}
          <ellipse cx={bx} cy={420} rx={90} ry={70} fill="url(#wr-glow)" />
          {/* Stand */}
          <rect x={bx-4} y={420} width={8} height={70} fill="#1e1408" />
          <rect x={bx-16} y={485} width={32} height={6} rx="2" fill="#1e1408" />
          {/* Bowl */}
          <path d={`M${bx-22},420 Q${bx-24},406 ${bx},404 Q${bx+24},406 ${bx+22},420 Z`}
            fill="#2a1a08" />
          {/* Fire */}
          <g className="lob-flame">
            <ellipse cx={bx}   cy={408} rx={14} ry={10} fill="#B03000" opacity="0.9" />
            <ellipse cx={bx-3} cy={400} rx={9}  ry={8}  fill="#D05000" opacity="0.85" />
            <ellipse cx={bx+2} cy={393} rx={6}  ry={6}  fill="#E08000" opacity="0.8" />
            <ellipse cx={bx}   cy={388} rx={4}  ry={5}  fill="#F0B000" opacity="0.7" />
            <ellipse cx={bx}   cy={384} rx={2}  ry={3}  fill="#FFE060" opacity="0.6" />
          </g>
        </g>
      ))}

      {/* ── Scattered campaign items on table ── */}
      {/* Scroll left */}
      <ellipse cx="390" cy="463" rx="14" ry="7" fill="#5A4020" opacity="0.6" />
      <rect x="380" y="456" width="20" height="14" rx="7" fill="#6A4A28" opacity="0.55" />
      {/* Scroll right */}
      <ellipse cx="1010" cy="460" rx="14" ry="7" fill="#5A4020" opacity="0.6" />
      <rect x="1000" y="453" width="20" height="14" rx="7" fill="#6A4A28" opacity="0.55" />
      {/* Candle */}
      <rect x="695" y="434" width="10" height="16" fill="#D4B860" opacity="0.5" />
      <rect x="697" y="430" width="6" height="6" fill="#F0D070" opacity="0.4" />
    </svg>
  );
}

// ── Floating embers ────────────────────────────────────────────
function LobParticles() {
  const pts = useRef(
    Array.from({length:22}, (_,i) => ({
      id: i,
      left:  `${8 + Math.random() * 84}%`,
      size:  `${1.5 + Math.random() * 3.5}px`,
      dur:   `${10 + Math.random() * 14}s`,
      delay: `${Math.random() * 12}s`,
      drift: `${(Math.random() - 0.5) * 50}px`,
      color: [
        'rgba(180,130,30,0.65)','rgba(160,80,0,0.55)',
        'rgba(200,110,0,0.45)','rgba(140,50,0,0.45)',
      ][i % 4],
    }))
  ).current;
  return (
    <div className="lob-particles" aria-hidden="true">
      {pts.map(p => (
        <div key={p.id} className="lob-particle" style={{
          left: p.left, width: p.size, height: p.size,
          '--lob-dur': p.dur, '--lob-delay': p.delay,
          '--lob-drift': p.drift, '--lob-pcolor': p.color,
        }} />
      ))}
    </div>
  );
}

// ── Mist ───────────────────────────────────────────────────────
function LobMist() {
  return (
    <div className="lob-mist" aria-hidden="true">
      <div className="lob-mist-a" />
      <div className="lob-mist-b" />
    </div>
  );
}

// ── Difficulty picker tooltip ──────────────────────────────────
function DiffPicker({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);
  return (
    <div className="diff-picker" ref={ref}>
      <button className="diff-picker-btn" onClick={() => setOpen(v => !v)} disabled={disabled}>
        <span className="diff-picker-label">{DIFF_LABELS[value] ?? 'Knight'}</span>
        <span className="diff-picker-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="diff-picker-dropdown">
          {DIFF_ORDER.map(d => (
            <button key={d}
              className={`diff-picker-opt${value===d?' diff-picker-opt--sel':''}`}
              onClick={() => { onChange(d); setOpen(false); }}>
              <span className="diff-picker-opt-name">{DIFF_LABELS[d]}</span>
              <span className="diff-picker-opt-desc">{DIFF_DESC[d]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── How to Play modal ──────────────────────────────────────────
function HtpModal({ onClose }) {
  return (
    <div className="htp-backdrop" onClick={onClose}>
      <div className="htp-modal" onClick={e => e.stopPropagation()}>
        <button className="htp-close" onClick={onClose}>✕</button>
        <h2 className="htp-title">LAWS OF CROWNFALL</h2>
        <p className="htp-tagline">6 pieces. One board. Last empire standing.</p>
        <div className="htp-content">
          <h3>OBJECTIVE</h3>
          <p>Be the last player with all <strong>6 of your original pieces</strong> still alive. Losing your General marks you as <em>Fallen</em> — your pieces can still be captured but your empire is gone.</p>

          <h3>YOUR PIECES (6 per player)</h3>
          <ul>
            <li><strong>General ×1</strong> — Your leader. If killed, your empire collapses: home pieces become prisoners of the killer, their enslaved prisoners are also inherited, and on-board pieces go free.</li>
            <li><strong>Spy ×2</strong> — Can use D1 or D2 (the two lowest dice).</li>
            <li><strong>Soldier ×3</strong> — Can only use D1 (the lowest die).</li>
          </ul>

          <h3>EACH TURN: ROLL / PICK / MOVE</h3>
          <p>You roll 3 dice, sorted lowest to highest: D1, D2, D3. General can use any die, Spy uses D1 or D2, Soldier uses D1 only. <strong>You move exactly 1 piece per turn.</strong></p>

          <h3>60-SECOND TURN TIMER</h3>
          <p>You have <strong>60 seconds</strong> for your entire turn (roll + pick + move). If time runs out, the game plays the worst possible move for you.</p>

          <h3>HOME AND ENTRY</h3>
          <p>All pieces start at Home off the board. To enter, you need a roll containing a <strong>1 or 6</strong>.</p>

          <h3>COMBAT</h3>
          <p>Land on an enemy piece to destroy it. Pieces are permanently eliminated. Each kill earns a <strong>bonus turn</strong> (capped at 1).</p>

          <h3>RETREAT (DIE = 3)</h3>
          <p>If one of your pieces is inside your color zone, assigning die=3 lets you retreat it back to any Home you control.</p>

          <h3>EMPIRE CONQUEST</h3>
          <p>Kill an enemy's General to seize their empire. Their home pieces become your prisoners, their enslaved prisoners also become yours, and their on-board pieces go free.</p>

          <h3>ENSLAVE (DIE = 4)</h3>
          <p>If you roll a 4 and a free or enslaved enemy piece exists, you can enslave it — it moves under your control.</p>

          <h3>ESCAPE (DIE = 4)</h3>
          <p>If you roll a 4 and one of your pieces is enslaved, you can free it.</p>

          <h3>TURN ORDER</h3>
          <p>Crimson goes first, then clockwise: Crimson → Bronze → Gold → Emerald → Sapphire → Silver. This order is fixed regardless of who created the room.</p>
        </div>
      </div>
    </div>
  );
}

// ── Color faction crest picker ─────────────────────────────────
function CrestPicker({ selected, taken = [], onPick, label = 'CHOOSE YOUR FACTION' }) {
  return (
    <div className="lob-field">
      {label && <label className="lob-flabel">{label}</label>}
      <div className="lob-crests">
        {ALL_COLORS.map(c => {
          const isTaken = taken.includes(c) && c !== selected;
          const isSel   = c === selected;
          const hex  = COLOR_HEX[c];
          const dark = COLOR_DARK[c];
          return (
            <button key={c}
              className={`lob-crest${isSel?' lob-crest--sel':''}${isTaken?' lob-crest--taken':''}`}
              onClick={() => !isTaken && onPick(c)}
              disabled={isTaken}
              title={COLOR_LABEL[c]}
              style={{ '--lc': hex, '--ld': dark }}
            >
              <svg viewBox="-10 -13 20 26" width="34" height="38">
                <defs>
                  <linearGradient id={`lcg-${c}`} x1="0" y1="0" x2="0.4" y2="1">
                    <stop offset="0%"   stopColor={hex} />
                    <stop offset="100%" stopColor={dark} />
                  </linearGradient>
                </defs>
                <path d="M0,-12 L9.5,-5.5 L9.5,5 L0,12 L-9.5,5 L-9.5,-5.5 Z"
                  fill={isTaken ? '#1a1208' : `url(#lcg-${c})`}
                  stroke={isSel ? '#D4AA30' : isTaken ? '#2a1e10' : `${hex}50`}
                  strokeWidth={isSel ? 1.5 : 1} />
                {isSel && (
                  <path d="M0,-12 L9.5,-5.5 L9.5,5 L0,12 L-9.5,5 L-9.5,-5.5 Z"
                    fill="none" stroke="rgba(212,170,48,0.35)" strokeWidth="0.6" />
                )}
              </svg>
              <span className="lob-crest-lbl">
                {COLOR_LABEL[c].slice(0,3).toUpperCase()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Home screen ────────────────────────────────────────────────
function HomeScreen({ onOnline, onLocal, onBrowse, onHtp }) {
  return (
    <div className="lob-home">
      <div className="lob-logo-wrap">
        <img src="/logo.png" alt="CROWNFALL" className="lob-logo" />
        <p className="lob-tagline">CONQUER · ENSLAVE · REIGN</p>
      </div>

      <nav className="lob-nav">
        <button className="lob-nbtn lob-nbtn--hi" onClick={onOnline}>
          <svg className="lob-nicon" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5"/>
            <line x1="2" y1="10" x2="18" y2="10" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M10 2 Q14 6.5 14 10 Q14 13.5 10 18" stroke="currentColor" strokeWidth="1.2" fill="none"/>
            <path d="M10 2 Q6 6.5 6 10 Q6 13.5 10 18"  stroke="currentColor" strokeWidth="1.2" fill="none"/>
          </svg>
          <span>PLAY ONLINE</span>
        </button>
        <button className="lob-nbtn" onClick={onBrowse}>
          <svg className="lob-nicon" viewBox="0 0 20 20" fill="none">
            <rect x="2" y="4" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.4"/>
            <line x1="2" y1="8" x2="18" y2="8" stroke="currentColor" strokeWidth="1.2"/>
            <line x1="6" y1="12" x2="10" y2="12" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
          <span>BROWSE ROOMS</span>
        </button>
        <button className="lob-nbtn" onClick={onLocal}>
          <svg className="lob-nicon" viewBox="0 0 20 20" fill="none">
            <rect x="1" y="7" width="18" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M5 7V4Q5 2 7 2H13Q15 2 15 4V7" stroke="currentColor" strokeWidth="1.4"/>
            <circle cx="10" cy="12" r="2" fill="currentColor"/>
          </svg>
          <span>LOCAL PLAY</span>
        </button>
        <button className="lob-nbtn" onClick={onHtp}>
          <svg className="lob-nicon" viewBox="0 0 20 20" fill="none">
            <rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.4"/>
            <line x1="6" y1="7"  x2="14" y2="7"  stroke="currentColor" strokeWidth="1.2"/>
            <line x1="6" y1="10" x2="14" y2="10" stroke="currentColor" strokeWidth="1.2"/>
            <line x1="6" y1="13" x2="11" y2="13" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
          <span>HOW TO PLAY</span>
        </button>
      </nav>

    </div>
  );
}

// ── Browse public rooms ────────────────────────────────────────
function BrowseScreen({ wsRef, onBack, onJoin }) {
  const { publicRooms, connected } = useGameStore();
  const [name,  setName]  = useState('');
  const [color, setColor] = useState(null);

  useEffect(() => {
    if (connected) sendMsg(wsRef.current, { type: 'LIST_ROOMS' });
  }, [connected]);

  function join(roomId) {
    const c = color ?? randomColor();
    const n = name.trim() || COLOR_LABEL[c] || capitalize(c);
    sendMsg(wsRef.current, { type:'JOIN_ROOM', roomId, playerName:n, preferredColor:c });
  }

  return (
    <div className="lob-setup-bg">
      <div className="lob-panel lob-panel--wide">
        <button className="lob-back" onClick={onBack}>← BACK</button>
        <div className="lob-ph">
          <div className="lob-phr" />
          <h2 className="lob-ptitle">OPEN BATTLEFIELDS</h2>
          <div className="lob-phr" />
        </div>
        <p className="lob-psub">Join a public room or go back to create your own</p>

        <div className="lob-field">
          <label className="lob-flabel">YOUR COMMANDER NAME</label>
          <input className="lob-finput"
            placeholder="Enter your name… (blank = random)"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={16}
            autoFocus />
        </div>

        <CrestPicker selected={color} taken={[]} onPick={setColor} label="YOUR FACTION" />

        <div className="lob-roomlist">
          {publicRooms.length === 0 ? (
            <div className="lob-roomlist-empty">
              <span>No open battlefields found.</span>
            </div>
          ) : (
            publicRooms.map(room => (
              <div key={room.id} className="lob-roomrow">
                <div className="lob-roomrow-info">
                  <span className="lob-roomrow-host">{room.hostName}</span>
                  <span className="lob-roomrow-code">{room.id}</span>
                  <span className="lob-roomrow-count">
                    {room.playerCount} / {room.maxPlayers} commanders
                  </span>
                </div>
                <button className="lob-abtn lob-abtn--gold lob-abtn--sm"
                  onClick={() => join(room.id)}
                  disabled={!connected || room.playerCount >= room.maxPlayers}>
                  {room.playerCount >= room.maxPlayers ? 'FULL' : 'JOIN'}
                </button>
              </div>
            ))
          )}
        </div>

        <div className="lob-browse-foot">
          <button className="lob-abtn lob-abtn--ghost"
            onClick={() => sendMsg(wsRef.current, { type:'LIST_ROOMS' })}
            disabled={!connected}>
            ↻ REFRESH
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Commander setup ────────────────────────────────────────────
function SetupScreen({ mode, wsRef, onBack }) {
  const { connected } = useGameStore();
  const [name,      setName]      = useState('');
  const [color,     setColor]     = useState(null);
  const [code,      setCode]      = useState('');
  const [isPublic,  setIsPublic]  = useState(false);
  const codeRef = useRef(null);

  function rc() {
    const c = color ?? randomColor();
    const n = name.trim() || COLOR_LABEL[c] || capitalize(c);
    return { name: n, color: c };
  }
  function create() {
    const { name: n, color: c } = rc();
    // Local rooms are always private and flagged isLocal
    sendMsg(wsRef.current, { type:'CREATE_ROOM', playerName:n, preferredColor:c,
      isPublic: mode === 'local' ? false : isPublic,
      isLocal:  mode === 'local' });
  }
  function join() {
    if (!code.trim()) { codeRef.current?.focus(); return; }
    const { name: n, color: c } = rc();
    sendMsg(wsRef.current, { type:'JOIN_ROOM', roomId:code.toUpperCase().trim(), playerName:n, preferredColor:c });
  }

  return (
    <div className="lob-setup-bg">
      <div className="lob-panel">
        <button className="lob-back" onClick={onBack}>← BACK</button>

        <div className="lob-ph">
          <div className="lob-phr" />
          <h2 className="lob-ptitle">
            {mode === 'online' ? 'ONLINE BATTLE' : 'LOCAL BATTLE'}
          </h2>
          <div className="lob-phr" />
        </div>
        <p className="lob-psub">
          {mode === 'online'
            ? 'Create a room or join with a code'
            : 'Create a room and add bots or local players'}
        </p>

        <div className="lob-field">
          <label className="lob-flabel">COMMANDER NAME</label>
          <input className="lob-finput"
            placeholder="Enter your name… (blank = random)"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key==='Enter' && create()}
            maxLength={16}
            autoFocus />
        </div>

        <CrestPicker selected={color} taken={[]} onPick={setColor} />

        {mode === 'online' && (
          <div className="lob-public-toggle">
            <button
              className={`lob-toggle-btn${isPublic ? ' lob-toggle-btn--on' : ''}`}
              onClick={() => setIsPublic(v => !v)}>
              <span className="lob-toggle-track">
                <span className="lob-toggle-thumb" />
              </span>
              <span className="lob-toggle-lbl">
                {isPublic ? 'PUBLIC ROOM — listed in Browse' : 'PRIVATE ROOM — invite only'}
              </span>
            </button>
          </div>
        )}

        {mode === 'local' && (
          <>
            <button className="lob-abtn lob-abtn--pri"
              onClick={create} disabled={!connected}>
              {connected ? 'CREATE GAME' : 'CONNECTING…'}
            </button>
            <p className="lob-hint">Add bots or local players after creating</p>
          </>
        )}

        {mode === 'online' && (
          <div className="lob-online">
            <button className="lob-abtn lob-abtn--pri"
              onClick={create} disabled={!connected}>
              {connected ? 'CREATE ROOM' : 'CONNECTING…'}
            </button>
            <div className="lob-or">
              <div className="lob-orline" /><span>OR</span><div className="lob-orline" />
            </div>
            <div className="lob-joinrow">
              <input ref={codeRef} className="lob-codeinput"
                placeholder="ROOM CODE"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                maxLength={6} />
              <button className="lob-abtn lob-abtn--gold"
                onClick={join} disabled={!connected||!code.trim()}>
                JOIN
              </button>
            </div>
            <p className="lob-hint">Invite friends with your room code</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tiny crown for host badge ──────────────────────────────────
function HostCrown() {
  return (
    <svg width="14" height="11" viewBox="-7 -5 14 11" aria-hidden="true">
      <polygon points="-6,4 -6,-4 -2,0 0,-5 2,0 6,-4 6,4" fill="#D4AA30"/>
      <rect x="-7" y="3" width="14" height="3" rx="1" fill="#D4AA30"/>
    </svg>
  );
}

// ── Lobby war chamber ──────────────────────────────────────────
function LobbyRoom({ wsRef }) {
  const { myPlayerIds, roomId, lobbyPlayers, hostId, isPublic, isLocalRoom } = useGameStore();
  const [addingLocal, setAddingLocal] = useState(false);
  const [localName,   setLocalName]   = useState('');
  const [localColor,  setLocalColor]  = useState(null);
  const [showHtp,     setShowHtp]     = useState(false);

  const isHost = myPlayerIds.includes(hostId) ||
    (!hostId && lobbyPlayers[0] && myPlayerIds.includes(lobbyPlayers[0].id));
  const isFull = lobbyPlayers.length >= 6;

  // Get colors taken by other lobby players (excluding any localColor candidate)
  const takenColors = lobbyPlayers.map(p => p.color);

  const addLocal = () => {
    // Pick color: prefer user-selected → first free → fallback random
    const clr = localColor ??
      ALL_COLORS.find(c => !takenColors.includes(c)) ??
      randomColor();
    const nm = localName.trim() || capitalize(clr);
    sendMsg(wsRef.current, { type:'ADD_LOCAL_PLAYER', playerName: nm, preferredColor: clr });
    setLocalName(''); setLocalColor(null); setAddingLocal(false);
  };

  return (
    <div className="lob-room">
      {showHtp && <HtpModal onClose={() => setShowHtp(false)} />}

      {/* Room header */}
      <header className="lob-rhead">
        <button className="lob-back" onClick={() => window.location.reload()}>← LEAVE</button>
        <span className="lob-rtitle">WAR CHAMBER</span>
        {roomId && (
          isLocalRoom ? (
            <div className="lob-rcode-block">
              <span className="lob-rcode-lbl">MODE</span>
              <span className="lob-rcode lob-rcode--local">LOCAL</span>
            </div>
          ) : (
            <div className="lob-rcode-block">
              <span className="lob-rcode-lbl">ROOM</span>
              <span className="lob-rcode">{roomId}</span>
            </div>
          )
        )}
        {/* Public/private toggle — only for online rooms, host only */}
        {isHost && roomId && !isLocalRoom && (
          <button
            className={`lob-public-badge${isPublic ? ' lob-public-badge--on' : ''}`}
            onClick={() => sendMsg(wsRef.current, { type:'SET_PUBLIC', isPublic: !isPublic })}
            title={isPublic ? 'Click to make private' : 'Click to make public'}>
            {isPublic ? '◉ PUBLIC' : '◯ PRIVATE'}
          </button>
        )}
        <button className="lob-htplink" onClick={() => setShowHtp(true)}>RULES</button>
      </header>

      {/* Commander banners */}
      <div className="lob-banners-outer">
        <div className="lob-banners">
          {lobbyPlayers.map((p, idx) => {
            const isMe      = myPlayerIds.includes(p.id);
            const isH       = p.id === hostId;
            const canRemove = isHost && !isMe && p.id !== hostId;
            const canClr    = isHost || isMe;
            const hex  = COLOR_HEX[p.color] ?? '#888';
            const dark = COLOR_DARK[p.color] ?? '#444';

            return (
              <div key={p.id}
                className={`lob-banner${isMe?' lob-banner--me':''}`}
                style={{ animationDelay:`${idx*0.08}s`, '--lc':hex, '--ld':dark }}
              >
                {/* Colored top strip */}
                <div className="lob-bstrip"
                  style={{ background:`linear-gradient(180deg,${hex},${dark})` }}>
                  {isH && <div className="lob-bcrown"><HostCrown /></div>}
                </div>

                {/* Avatar */}
                <div className="lob-bavatar"
                  style={{ background:`linear-gradient(135deg,${hex},${dark})`, boxShadow:`0 0 18px ${hex}40` }}>
                  {p.name.charAt(0).toUpperCase()}
                  {isMe && <div className="lob-bring" style={{ borderColor:hex }} />}
                </div>

                {/* Name + tags */}
                <div className="lob-bname" style={{ color: hex }}>{p.name}</div>
                <div className="lob-btags">
                  {isH   && <span className="lob-btag lob-btag--host">HOST</span>}
                  {isMe  && !p.isBot && <span className="lob-btag lob-btag--you">YOU</span>}
                  {p.isBot   && <span className="lob-btag lob-btag--bot">BOT</span>}
                  {p.isLocal && !p.isBot && <span className="lob-btag lob-btag--loc">LOCAL</span>}
                </div>

                {/* Faction label */}
                <div className="lob-bfaction" style={{ color: hex }}>
                  {COLOR_LABEL[p.color] ?? p.color}
                </div>

                {/* Color picker */}
                {canClr && (
                  <div className="lob-bclr">
                    <div className="lob-bclr-dot" style={{ background:hex }}>
                      <select className="lob-bclr-sel" value={p.color}
                        onChange={e => sendMsg(wsRef.current,
                          { type:'CHANGE_COLOR', targetPlayerId:p.id, color:e.target.value })}>
                        {ALL_COLORS.map(c => {
                          const taken = lobbyPlayers.some(lp => lp.color===c && lp.id!==p.id);
                          return (
                            <option key={c} value={c} disabled={taken}>
                              {COLOR_LABEL[c]}{taken?' (taken)':''}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                )}

                {/* Bot difficulty */}
                {p.isBot && isHost && (
                  <DiffPicker
                    value={p.difficulty ?? 'medium'}
                    onChange={d => sendMsg(wsRef.current,
                      { type:'SET_BOT_DIFFICULTY', botPlayerId:p.id, difficulty:d })}
                  />
                )}

                {/* Remove */}
                {canRemove && (
                  <button className="lob-bremove"
                    onClick={() => sendMsg(wsRef.current,
                      { type:'REMOVE_PLAYER', targetPlayerId:p.id })}>
                    ✕
                  </button>
                )}
              </div>
            );
          })}

          {/* Empty placeholder slots */}
          {lobbyPlayers.length < 6 &&
            Array.from({length: Math.min(2, 6-lobbyPlayers.length)}, (_,i) => (
              <div key={`emp-${i}`} className="lob-banner lob-banner--empty">
                <div className="lob-bstrip lob-bstrip--empty" />
                <div className="lob-bavatar lob-bavatar--empty">?</div>
                <div className="lob-bname lob-bname--empty">AWAITING</div>
              </div>
            ))
          }
        </div>
      </div>

      {/* Footer controls */}
      <footer className="lob-rfoot">
        {isHost && !isFull && (
          <div className="lob-addrow">
            <button className="lob-addbt"
              onClick={() => sendMsg(wsRef.current, { type:'ADD_BOT', difficulty:'medium' })}>
              + ADD BOT
            </button>
            {/* ADD LOCAL only available for local (hot-seat) rooms */}
            {isLocalRoom && (
              <button className="lob-addbt"
                onClick={() => setAddingLocal(v => !v)}>
                {addingLocal ? '− CANCEL' : '+ ADD LOCAL'}
              </button>
            )}
          </div>
        )}

        {addingLocal && isLocalRoom && (
          <div className="lob-localform">
            <div className="lob-localrow">
              <input className="lob-localinput"
                placeholder="Name… (blank = auto)"
                value={localName}
                onChange={e => setLocalName(e.target.value)}
                onKeyDown={e => e.key==='Enter' && addLocal()}
                maxLength={16} autoFocus />
              <button className="lob-abtn lob-abtn--gold" onClick={addLocal}>ADD</button>
            </div>
            <CrestPicker
              selected={localColor}
              taken={takenColors}
              onPick={setLocalColor}
              label={null}
            />
          </div>
        )}

        <div className="lob-startrow">
          {isHost ? (
            <button className="lob-startbt"
              onClick={() => sendMsg(wsRef.current, { type:'START_GAME' })}
              disabled={lobbyPlayers.length < 2}>
              {lobbyPlayers.length < 2
                ? 'NEED AT LEAST 2 COMMANDERS'
                : `BEGIN THE BATTLE — ${lobbyPlayers.length} COMMANDERS`}
            </button>
          ) : (
            <p className="lob-waiting">Waiting for the host to begin the battle…</p>
          )}
        </div>
      </footer>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────
export default function LobbyScreen({ wsRef }) {
  const { myPlayerIds, roomId } = useGameStore();
  const inRoom = myPlayerIds.length > 0 && roomId;

  const [screen,    setScreen]    = useState('home'); // 'home' | 'setup' | 'browse'
  const [setupMode, setSetupMode] = useState('local');
  const [showHtp,   setShowHtp]   = useState(false);

  return (
    <div className="lob-screen">
      <WarRoomScene />
      <LobMist />
      <LobParticles />

      {showHtp && !inRoom && <HtpModal onClose={() => setShowHtp(false)} />}

      {inRoom && <LobbyRoom wsRef={wsRef} />}

      {!inRoom && screen === 'home' && (
        <HomeScreen
          onOnline={() => { setSetupMode('online'); setScreen('setup'); }}
          onLocal={()  => { setSetupMode('local');  setScreen('setup'); }}
          onBrowse={() => setScreen('browse')}
          onHtp={() => setShowHtp(true)}
        />
      )}

      {!inRoom && screen === 'setup' && (
        <SetupScreen
          mode={setupMode}
          wsRef={wsRef}
          onBack={() => setScreen('home')}
        />
      )}

      {!inRoom && screen === 'browse' && (
        <BrowseScreen
          wsRef={wsRef}
          onBack={() => setScreen('home')}
        />
      )}
    </div>
  );
}
