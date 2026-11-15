import React, { useEffect, useRef, useState } from 'react';
import {
  FightInputState,
  FightMatchSnapshot,
  GameEventPayload,
  RoomStatePayload,
} from '../../types/game';
import { getCharacterForSlot } from '../../data/roster';
import { sound } from '../../utils/audio';
import { FighterState, drawFighter } from './fighterRenderer';
import {
  Volume2,
  VolumeX,
  RefreshCw,
  Trophy,
  RotateCw,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';

interface FightingGameProps {
  roomState: RoomStatePayload;
  fightStateRef: React.MutableRefObject<FightMatchSnapshot | null>;
  fightHud: FightMatchSnapshot | null;
  subscribeEvents: (cb: (ev: GameEventPayload) => void) => () => void;
  onSendInput: (input: FightInputState) => void;
  onRematch: () => void;
  onBackToLobby: () => void;
  isVirtualRotated: boolean;
  onToggleRotate: () => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
}

interface FloatingText {
  id: number;
  text: string;
  x: number;
  y: number;
  color: string;
  alpha: number;
}

export const FightingGame: React.FC<FightingGameProps> = ({
  roomState,
  fightStateRef,
  fightHud,
  subscribeEvents,
  onSendInput,
  onRematch,
  onBackToLobby,
  isVirtualRotated,
  onToggleRotate,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(sound.getIsMuted());

  const keysPressed = useRef<Record<string, boolean>>({});
  const touchState = useRef<FightInputState>({
    left: false,
    right: false,
    up: false,
    down: false,
    punch: false,
    kick: false,
    guard: false,
    super: false,
  });

  const lastSentJson = useRef<string>('');
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const screenShakeRef = useRef<number>(0);
  const petalsRef = useRef<
    Array<{ x: number; y: number; vx: number; vy: number; rot: number; size: number }>
  >([]);

  // Smooth interpolated positions
  const smoothPosRef = useRef<Record<1 | 2, { x: number; y: number }>>({
    1: { x: 280, y: 440 },
    2: { x: 680, y: 440 },
  });

  useEffect(() => {
    const list = [];
    for (let i = 0; i < 32; i++) {
      list.push({
        x: Math.random() * 960,
        y: Math.random() * 540,
        vx: 0.4 + Math.random() * 1.1,
        vy: 0.9 + Math.random() * 1.3,
        rot: Math.random() * Math.PI * 2,
        size: 5 + Math.random() * 5,
      });
    }
    petalsRef.current = list;
  }, []);

  const syncAndEmitInput = () => {
    const k = keysPressed.current;
    const t = touchState.current;
    const next: FightInputState = {
      left: Boolean(k['a'] || k['arrowleft'] || t.left),
      right: Boolean(k['d'] || k['arrowright'] || t.right),
      up: Boolean(k['w'] || k['arrowup'] || t.up),
      down: Boolean(k['s'] || k['arrowdown'] || t.down),
      punch: Boolean(k['j'] || k['z'] || t.punch),
      kick: Boolean(k['k'] || k['x'] || t.kick),
      guard: Boolean(k['l'] || k['c'] || t.guard),
      super: Boolean(k['u'] || k[' '] || k['space'] || t.super),
    };
    const serialized = JSON.stringify(next);
    if (serialized !== lastSentJson.current) {
      lastSentJson.current = serialized;
      onSendInput(next);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keysPressed.current[e.key.toLowerCase()] = true;
      keysPressed.current[e.code.toLowerCase()] = true;
      syncAndEmitInput();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysPressed.current[e.key.toLowerCase()] = false;
      keysPressed.current[e.code.toLowerCase()] = false;
      syncAndEmitInput();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [onSendInput]);

  useEffect(() => {
    return subscribeEvents((ev) => {
      if (ev.kind === 'fight_punch') sound.playPunch();
      else if (ev.kind === 'fight_kick') sound.playKick();
      else if (ev.kind === 'fight_jump') sound.playJump();
      else if (ev.kind === 'countdown') sound.playCountdown(Boolean(ev.isGo));
      else if (ev.kind === 'fight_ko') sound.playKO();
      else if (ev.kind === 'fight_super') {
        sound.playSuper();
        screenShakeRef.current = ev.shake || 14;
        if (ev.x !== undefined && ev.y !== undefined) {
          for (let i = 0; i < 22; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 5;
            particlesRef.current.push({
              x: ev.x,
              y: ev.y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              size: 3 + Math.random() * 4,
              color: ev.color || '#f43f5e',
              alpha: 1,
              decay: 0.04,
            });
          }
        }
      } else if (ev.kind === 'fight_block') {
        sound.playBlock();
        if (ev.x !== undefined && ev.y !== undefined) {
          floatingTextsRef.current.push({
            id: Math.random(),
            text: ev.text || 'BLOCK!',
            x: ev.x,
            y: ev.y,
            color: ev.color || '#38bdf8',
            alpha: 1,
          });
        }
      } else if (ev.kind === 'fight_hit') {
        sound.playPunch();
        screenShakeRef.current = ev.shake || 6;
        if (ev.x !== undefined && ev.y !== undefined) {
          for (let i = 0; i < 14; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 5;
            particlesRef.current.push({
              x: ev.x,
              y: ev.y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              size: 3 + Math.random() * 4,
              color: '#ef4444',
              alpha: 1,
              decay: 0.045,
            });
          }
          floatingTextsRef.current.push({
            id: Math.random(),
            text: ev.text || '-14',
            x: ev.x,
            y: ev.y,
            color: ev.color || '#f43f5e',
            alpha: 1,
          });
        }
      }
    });
  }, [subscribeEvents]);

  // 60fps Canvas Render Loop
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawArenaBackground = (time: number, groundY: number) => {
      const w = canvas.width;
      const h = canvas.height;
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
      skyGrad.addColorStop(0, '#fbcfe8');
      skyGrad.addColorStop(0.4, '#f472b6');
      skyGrad.addColorStop(0.7, '#f9a8d4');
      skyGrad.addColorStop(1, '#fed7aa');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = 'rgba(244, 114, 182, 0.35)';
      ctx.beginPath();
      ctx.arc(120, groundY - 140, 140, 0, Math.PI * 2);
      ctx.arc(840, groundY - 140, 150, 0, Math.PI * 2);
      ctx.arc(480, groundY - 120, 110, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.strokeStyle = '#fda4af';
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.moveTo(480, groundY - 190);
      ctx.bezierCurveTo(480, groundY - 240, 420, groundY - 260, 420, groundY - 210);
      ctx.bezierCurveTo(420, groundY - 160, 480, groundY - 120, 480, groundY - 90);
      ctx.bezierCurveTo(480, groundY - 120, 540, groundY - 160, 540, groundY - 210);
      ctx.bezierCurveTo(540, groundY - 260, 480, groundY - 240, 480, groundY - 190);
      ctx.stroke();

      for (let a = 0; a < 24; a++) {
        const angle = (a / 24) * Math.PI * 2;
        const flowerX = 480 + Math.cos(angle) * 75;
        const flowerY = groundY - 190 + Math.sin(angle) * 60;
        ctx.fillStyle = a % 2 === 0 ? '#fb7185' : '#ffffff';
        ctx.beginPath();
        ctx.arc(flowerX, flowerY, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#854d0e';
      ctx.fillRect(430, groundY - 60, 100, 8);
      ctx.fillRect(435, groundY - 78, 90, 6);
      ctx.fillRect(440, groundY - 52, 6, 26);
      ctx.fillRect(514, groundY - 52, 6, 26);
      ctx.restore();

      const lanternPulse = Math.sin(time * 0.004) * 4;
      [360, 600].forEach((lx) => {
        const glowGrad = ctx.createRadialGradient(lx, groundY - 160, 4, lx, groundY - 160, 36 + lanternPulse);
        glowGrad.addColorStop(0, 'rgba(254, 240, 138, 0.8)');
        glowGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(lx, groundY - 160, 36 + lanternPulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#451a03';
        ctx.fillRect(lx - 12, groundY - 176, 24, 6);
        ctx.fillRect(lx - 12, groundY - 146, 24, 6);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(lx - 10, groundY - 170, 20, 24);
      });

      const floorGrad = ctx.createLinearGradient(0, groundY, 0, h);
      floorGrad.addColorStop(0, '#c4b5fd');
      floorGrad.addColorStop(0.3, '#a78bfa');
      floorGrad.addColorStop(1, '#7c3aed');
      ctx.fillStyle = floorGrad;
      ctx.fillRect(0, groundY, w, h - groundY);

      ctx.strokeStyle = 'rgba(109, 40, 217, 0.35)';
      ctx.lineWidth = 2;
      for (let row = 0; row < 5; row++) {
        const yLine = groundY + row * 24;
        ctx.beginPath();
        ctx.moveTo(0, yLine);
        ctx.lineTo(w, yLine);
        ctx.stroke();

        const offset = (row % 2) * 40;
        for (let col = -40; col < w + 40; col += 70) {
          ctx.beginPath();
          ctx.moveTo(col + offset, yLine);
          ctx.lineTo(col + offset, yLine + 24);
          ctx.stroke();
        }
      }

      petalsRef.current.forEach((petal) => {
        ctx.save();
        ctx.translate(petal.x, petal.y);
        ctx.rotate(petal.rot);
        ctx.fillStyle = 'rgba(255, 182, 193, 0.85)';
        ctx.beginPath();
        ctx.ellipse(0, 0, petal.size, petal.size * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        petal.x += petal.vx;
        petal.y += petal.vy;
        petal.rot += 0.02;

        if (petal.y > h) {
          petal.y = -10;
          petal.x = Math.random() * w;
        }
        if (petal.x > w) petal.x = 0;
      });
    };

    const drawNameTag = (x: number, y: number, name: string, isMe: boolean) => {
      ctx.save();
      ctx.font = 'bold 14px "Outfit", sans-serif';
      const label = isMe ? `${name} (You)` : name;
      const textWidth = ctx.measureText(label).width;
      const boxW = textWidth + 16;
      const boxH = 22;
      const boxX = x - boxW / 2;
      const boxY = y - 148;

      ctx.fillStyle = isMe ? 'rgba(225, 29, 72, 0.88)' : 'rgba(15, 23, 42, 0.82)';
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 8);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, boxY + boxH / 2);
      ctx.restore();
    };

    const loop = (time: number) => {
      const groundY = 440;
      ctx.save();

      if (screenShakeRef.current > 0) {
        ctx.translate(
          (Math.random() - 0.5) * screenShakeRef.current,
          (Math.random() - 0.5) * screenShakeRef.current
        );
        screenShakeRef.current = Math.max(0, screenShakeRef.current - 0.8);
      }

      drawArenaBackground(time, groundY);

      const snap = fightStateRef.current;
      if (snap) {
        snap.fighters.forEach((f) => {
          const smooth = smoothPosRef.current[f.slot];
          smooth.x += (f.x - smooth.x) * 0.45;
          smooth.y += (f.y - smooth.y) * 0.45;

          const char = getCharacterForSlot(f.gender, f.slot, f.playerName);
          const fighterState: FighterState = {
            x: smooth.x,
            y: smooth.y,
            vx: f.vx,
            vy: f.vy,
            width: 60,
            height: 120,
            facing: f.facing,
            isGrounded: f.isGrounded,
            action: f.action,
            actionTimer: f.actionTimer,
            actionDuration: f.actionDuration,
            health: f.health,
            maxHealth: f.maxHealth,
            superMeter: f.superMeter,
            isBlocking: f.isBlocking,
            comboCount: 0,
            comboResetTimer: 0,
            hitStun: f.hitStun,
            character: char,
            isAI: false,
          };

          drawFighter(ctx, fighterState, groundY, time);
          drawNameTag(smooth.x, smooth.y, f.playerName, f.slot === roomState.yourSlot);
        });
      }

      particlesRef.current.forEach((p) => {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= p.decay;
      });
      particlesRef.current = particlesRef.current.filter((p) => p.alpha > 0);

      floatingTextsRef.current.forEach((ft) => {
        ctx.save();
        ctx.font = 'bold 20px "Outfit", sans-serif';
        ctx.fillStyle = ft.color;
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 3;
        ctx.globalAlpha = ft.alpha;
        ctx.strokeText(ft.text, ft.x, ft.y);
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
        ft.y -= 1.2;
        ft.alpha -= 0.025;
      });
      floatingTextsRef.current = floatingTextsRef.current.filter((ft) => ft.alpha > 0);

      ctx.restore();
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [fightStateRef, roomState.yourSlot]);

  const setTouch = (key: keyof FightInputState, val: boolean) => {
    touchState.current[key] = val;
    syncAndEmitInput();
  };

  const f1 = fightHud?.fighters[0];
  const f2 = fightHud?.fighters[1];
  const p1HpPct = f1 ? Math.max(0, Math.round((f1.health / f1.maxHealth) * 100)) : 100;
  const p2HpPct = f2 ? Math.max(0, Math.round((f2.health / f2.maxHealth) * 100)) : 100;
  const myFighter = fightHud?.fighters.find((f) => f.slot === roomState.yourSlot);
  const mySuper = myFighter?.superMeter ?? 0;

  const winnerFighter =
    fightHud?.winnerSlot && fightHud.fighters.find((f) => f.slot === fightHud.winnerSlot);

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className={`${
        isVirtualRotated ? 'virtual-landscape' : 'fixed inset-0 w-screen h-dvh'
      } bg-slate-950 overflow-hidden select-none touch-none z-50 flex items-center justify-center`}
    >
      {/* Full-Screen Game Canvas */}
      <canvas
        ref={canvasRef}
        width={960}
        height={540}
        className="w-full h-full object-contain"
      />

      {/* Minimal Top HUD Overlay */}
      <div className="absolute top-0 left-0 right-0 z-20 p-2 sm:p-4 flex items-start justify-between gap-2 sm:gap-4 pointer-events-none">
        {/* P1 Health & Name */}
        <div className="flex-1 min-w-0 max-w-[40%]">
          <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-white drop-shadow mb-1">
            <span className="truncate">
              {f1?.playerName || 'Player 1'}
              {roomState.yourSlot === 1 ? ' (You)' : ''}
              {f1 && f1.roundsWon > 0 && (
                <span className="ml-1.5 text-amber-300">{'★'.repeat(f1.roundsWon)}</span>
              )}
            </span>
            <span className="font-mono text-emerald-300 tabular-nums ml-2">{p1HpPct}%</span>
          </div>
          <div className="w-full h-3 sm:h-4 bg-slate-900/85 rounded-full border-2 border-white/90 p-0.5 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-green-500 transition-all duration-100"
              style={{ width: `${p1HpPct}%` }}
            />
          </div>
          <div className="mt-1 h-1.5 w-full bg-slate-900/80 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-100 ${
                (f1?.superMeter || 0) >= 100 ? 'bg-rose-400 animate-pulse' : 'bg-rose-500'
              }`}
              style={{ width: `${f1?.superMeter || 0}%` }}
            />
          </div>
        </div>

        {/* Center Timer + Compact Utility Controls */}
        <div className="flex flex-col items-center shrink-0">
          <div className="flex items-center gap-1.5 pointer-events-auto">
            <button
              type="button"
              onClick={onBackToLobby}
              className="min-w-[40px] min-h-[40px] rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-white/25 text-white flex items-center justify-center cursor-pointer"
              title="Back to Lobby"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="px-3 py-1.5 rounded-xl bg-rose-600/90 border-2 border-white text-white font-mono font-black text-base sm:text-xl tabular-nums shadow-lg">
              {fightHud?.timeLeft ?? 99}
            </div>
            <button
              type="button"
              onClick={onToggleRotate}
              className="min-w-[40px] min-h-[40px] rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-white/25 text-amber-300 flex items-center justify-center cursor-pointer"
              title="Rotate & Fullscreen"
            >
              <RotateCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                const next = !isMuted;
                sound.setMuted(next);
                setIsMuted(next);
              }}
              className="min-w-[40px] min-h-[40px] rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-white/25 text-white flex items-center justify-center cursor-pointer"
              title="Toggle Sound"
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            </button>
          </div>
        </div>

        {/* P2 Health & Name */}
        <div className="flex-1 min-w-0 max-w-[40%]">
          <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-white drop-shadow mb-1 flex-row-reverse">
            <span className="truncate text-right">
              {f2 && f2.roundsWon > 0 && (
                <span className="mr-1.5 text-amber-300">{'★'.repeat(f2.roundsWon)}</span>
              )}
              {f2?.playerName || 'Player 2'}
              {roomState.yourSlot === 2 ? ' (You)' : ''}
            </span>
            <span className="font-mono text-emerald-300 tabular-nums mr-2">{p2HpPct}%</span>
          </div>
          <div className="w-full h-3 sm:h-4 bg-slate-900/85 rounded-full border-2 border-white/90 p-0.5 overflow-hidden flex flex-row-reverse">
            <div
              className="h-full rounded-full bg-gradient-to-l from-emerald-400 to-green-500 transition-all duration-100"
              style={{ width: `${p2HpPct}%` }}
            />
          </div>
          <div className="mt-1 h-1.5 w-full bg-slate-900/80 rounded-full overflow-hidden flex flex-row-reverse">
            <div
              className={`h-full transition-all duration-100 ${
                (f2?.superMeter || 0) >= 100 ? 'bg-rose-400 animate-pulse' : 'bg-rose-500'
              }`}
              style={{ width: `${f2?.superMeter || 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Countdown / K.O. Banner */}
      {fightHud && fightHud.countdownText && fightHud.matchState !== 'FIGHTING' && fightHud.matchState !== 'MATCH_OVER' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/25 pointer-events-none">
          <h2 className="text-5xl sm:text-7xl font-black text-white italic tracking-wider drop-shadow-[0_6px_16px_rgba(244,63,94,0.9)]">
            {fightHud.countdownText}
          </h2>
        </div>
      )}

      {/* Match Over Overlay */}
      {fightHud?.matchState === 'MATCH_OVER' && winnerFighter && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-slate-950/85 backdrop-blur-md p-6 text-center">
          <Trophy className="w-14 h-14 text-amber-400 mb-2 animate-bounce" />
          <h2 className="text-3xl sm:text-5xl font-black text-white">
            {winnerFighter.playerName} Wins!
          </h2>
          <div className="flex items-center gap-3 mt-6">
            <button
              type="button"
              onClick={onRematch}
              className="min-h-[48px] px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-2xl shadow-lg flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" /> Play Again
            </button>
            <button
              type="button"
              onClick={onBackToLobby}
              className="min-h-[48px] px-5 py-3 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-2xl border border-slate-700 cursor-pointer"
            >
              Lobby
            </button>
          </div>
        </div>
      )}

      {/* Easy Mobile Thumb Controls */}
      <div className="absolute bottom-3 left-3 right-3 sm:bottom-5 sm:left-6 sm:right-6 z-20 flex items-end justify-between pointer-events-none">
        {/* Left Thumb Cluster: Move Left / Right + Jump / Crouch */}
        <div className="pointer-events-auto flex flex-col items-center gap-2">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onPointerDown={(e) => { e.preventDefault(); setTouch('up', true); }}
              onPointerUp={() => setTouch('up', false)}
              onPointerCancel={() => setTouch('up', false)}
              onPointerLeave={() => setTouch('up', false)}
              className="game-touch-btn w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-slate-900/65 active:bg-purple-500/80 border-2 border-white/80 text-white font-black text-lg flex items-center justify-center shadow-xl backdrop-blur-sm"
            >
              ▲
            </button>
            <button
              type="button"
              onPointerDown={(e) => { e.preventDefault(); setTouch('down', true); }}
              onPointerUp={() => setTouch('down', false)}
              onPointerCancel={() => setTouch('down', false)}
              onPointerLeave={() => setTouch('down', false)}
              className="game-touch-btn w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-slate-900/65 active:bg-slate-700 border-2 border-white/80 text-white font-black text-lg flex items-center justify-center shadow-xl backdrop-blur-sm"
            >
              ▼
            </button>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onPointerDown={(e) => { e.preventDefault(); setTouch('left', true); }}
              onPointerUp={() => setTouch('left', false)}
              onPointerCancel={() => setTouch('left', false)}
              onPointerLeave={() => setTouch('left', false)}
              className="game-touch-btn w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-slate-900/65 active:bg-white/40 border-2 border-white/80 text-white font-black text-2xl flex items-center justify-center shadow-xl backdrop-blur-sm"
            >
              ◀
            </button>
            <button
              type="button"
              onPointerDown={(e) => { e.preventDefault(); setTouch('right', true); }}
              onPointerUp={() => setTouch('right', false)}
              onPointerCancel={() => setTouch('right', false)}
              onPointerLeave={() => setTouch('right', false)}
              className="game-touch-btn w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-slate-900/65 active:bg-white/40 border-2 border-white/80 text-white font-black text-2xl flex items-center justify-center shadow-xl backdrop-blur-sm"
            >
              ▶
            </button>
          </div>
        </div>

        {/* Right Thumb Cluster: Guard, Kick, Punch, Super */}
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          {mySuper >= 100 && (
            <button
              type="button"
              onPointerDown={(e) => { e.preventDefault(); setTouch('super', true); }}
              onPointerUp={() => setTouch('super', false)}
              onPointerCancel={() => setTouch('super', false)}
              onPointerLeave={() => setTouch('super', false)}
              className="game-touch-btn px-5 h-14 rounded-full bg-gradient-to-r from-rose-500 to-amber-500 border-2 border-white text-white font-black text-sm flex items-center justify-center gap-1.5 shadow-xl animate-pulse"
            >
              <Sparkles className="w-5 h-5" /> SUPER
            </button>
          )}
          <div className="flex items-end gap-2.5">
            <button
              type="button"
              onPointerDown={(e) => { e.preventDefault(); setTouch('guard', true); }}
              onPointerUp={() => setTouch('guard', false)}
              onPointerCancel={() => setTouch('guard', false)}
              onPointerLeave={() => setTouch('guard', false)}
              className="game-touch-btn w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-amber-500/80 active:bg-amber-600 border-2 border-white text-white font-black text-xs flex items-center justify-center shadow-xl backdrop-blur-sm"
            >
              GUARD
            </button>
            <button
              type="button"
              onPointerDown={(e) => { e.preventDefault(); setTouch('kick', true); }}
              onPointerUp={() => setTouch('kick', false)}
              onPointerCancel={() => setTouch('kick', false)}
              onPointerLeave={() => setTouch('kick', false)}
              className="game-touch-btn w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-cyan-500/85 active:bg-cyan-600 border-2 border-white text-white font-black text-sm flex items-center justify-center shadow-xl backdrop-blur-sm"
            >
              KICK
            </button>
            <button
              type="button"
              onPointerDown={(e) => { e.preventDefault(); setTouch('punch', true); }}
              onPointerUp={() => setTouch('punch', false)}
              onPointerCancel={() => setTouch('punch', false)}
              onPointerLeave={() => setTouch('punch', false)}
              className="game-touch-btn w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-rose-500/90 active:bg-rose-600 border-2 border-white text-white font-black text-sm flex items-center justify-center shadow-xl backdrop-blur-sm"
            >
              PUNCH
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
