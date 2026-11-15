import React, { useEffect, useRef, useState } from 'react';
import {
  GameEventPayload,
  NetworkRacerSnapshot,
  RaceInputState,
  RaceMatchSnapshot,
  RoomStatePayload,
} from '../../types/game';
import { sound } from '../../utils/audio';
import {
  Trophy,
  RefreshCw,
  Zap,
  Volume2,
  VolumeX,
  Shield,
  RotateCw,
  ArrowLeft,
} from 'lucide-react';

interface RacingGameProps {
  roomState: RoomStatePayload;
  raceStateRef: React.MutableRefObject<RaceMatchSnapshot | null>;
  raceHud: RaceMatchSnapshot | null;
  subscribeEvents: (cb: (ev: GameEventPayload) => void) => () => void;
  onSendInput: (input: RaceInputState) => void;
  onRematch: () => void;
  onBackToLobby: () => void;
  isVirtualRotated: boolean;
  onToggleRotate: () => void;
}

export const RacingGame: React.FC<RacingGameProps> = ({
  roomState,
  raceStateRef,
  raceHud,
  subscribeEvents,
  onSendInput,
  onRematch,
  onBackToLobby,
  isVirtualRotated,
  onToggleRotate,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(sound.getIsMuted());

  const keys = useRef<Record<string, boolean>>({});
  const touchInputs = useRef<RaceInputState>({
    gas: false,
    brake: false,
    left: false,
    right: false,
    drift: false,
    useItem: false,
  });
  const lastSentJson = useRef<string>('');

  const smoothRacersRef = useRef<Record<string, { x: number; y: number; angle: number }>>({});

  const syncAndEmitInput = () => {
    const k = keys.current;
    const t = touchInputs.current;
    const next: RaceInputState = {
      gas: Boolean(k['w'] || k['arrowup'] || t.gas),
      brake: Boolean(k['s'] || k['arrowdown'] || t.brake),
      left: Boolean(k['a'] || k['arrowleft'] || t.left),
      right: Boolean(k['d'] || k['arrowright'] || t.right),
      drift: Boolean(k[' '] || k['space'] || t.drift),
      useItem: Boolean(k['e'] || k['shift'] || t.useItem),
    };
    const serialized = JSON.stringify(next);
    if (serialized !== lastSentJson.current) {
      lastSentJson.current = serialized;
      onSendInput(next);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = true;
      keys.current[e.code.toLowerCase()] = true;
      syncAndEmitInput();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false;
      keys.current[e.code.toLowerCase()] = false;
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
      if (ev.kind === 'countdown') sound.playCountdown(Boolean(ev.isGo));
      else if (ev.kind === 'race_finish') sound.playKO();
      else if (ev.kind === 'race_boost' && ev.slot === roomState.yourSlot) sound.playBoost();
      else if (ev.kind === 'race_item' && ev.slot === roomState.yourSlot) sound.playJump();
      else if (ev.kind === 'race_hit' && ev.slot === roomState.yourSlot) sound.playHit();
    });
  }, [subscribeEvents, roomState.yourSlot]);

  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawTrackPath = () => {
      ctx.beginPath();
      ctx.moveTo(400, 110);
      ctx.lineTo(700, 110);
      ctx.quadraticCurveTo(840, 110, 840, 260);
      ctx.quadraticCurveTo(840, 440, 680, 440);
      ctx.quadraticCurveTo(480, 490, 300, 440);
      ctx.quadraticCurveTo(120, 440, 120, 260);
      ctx.quadraticCurveTo(120, 110, 400, 110);
      ctx.closePath();
    };

    const drawTrack = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = '#064e3b';
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = 'rgba(244, 114, 182, 0.2)';
      for (let i = 0; i < 20; i++) {
        const px = (i * 123) % w;
        const py = (i * 97) % h;
        ctx.beginPath();
        ctx.arc(px, py, 24, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.save();
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 110;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      drawTrackPath();
      ctx.stroke();

      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 98;
      drawTrackPath();
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 3;
      ctx.setLineDash([16, 16]);
      drawTrackPath();
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(400, 110);
      ctx.rotate(Math.PI / 2);
      for (let c = -45; c < 45; c += 15) {
        ctx.fillStyle = Math.floor(c / 15) % 2 === 0 ? '#ffffff' : '#0f172a';
        ctx.fillRect(c, -8, 15, 16);
      }
      ctx.restore();

      [
        { x: 480, y: 260 },
        { x: 340, y: 300 },
        { x: 620, y: 300 },
      ].forEach((t) => {
        ctx.save();
        ctx.fillStyle = '#f472b6';
        ctx.shadowColor = '#fb7185';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(t.x, t.y, 45, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#78350f';
        ctx.fillRect(t.x - 6, t.y + 10, 12, 35);
        ctx.restore();
      });
    };

    const drawKart = (racer: NetworkRacerSnapshot, sx: number, sy: number, sAngle: number) => {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(sAngle);

      if (racer.shieldTimer > 0) {
        ctx.beginPath();
        ctx.arc(0, 0, 28, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(56, 189, 248, 0.3)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fill();
      }

      if (racer.boostTimer > 0) {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(-20, -6);
        ctx.lineTo(-38 - Math.random() * 10, 0);
        ctx.lineTo(-20, 6);
        ctx.fill();
      }

      if (racer.isDrifting) {
        ctx.fillStyle = racer.driftCharge > 50 ? '#c084fc' : '#38bdf8';
        for (let s = 0; s < 3; s++) {
          ctx.beginPath();
          ctx.arc(-16 - Math.random() * 8, s % 2 === 0 ? -12 : 12, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-18, -16, 10, 6);
      ctx.fillRect(10, -16, 10, 6);
      ctx.fillRect(-18, 10, 10, 6);
      ctx.fillRect(10, 10, 10, 6);

      ctx.fillStyle = racer.color;
      ctx.beginPath();
      ctx.roundRect(-16, -11, 34, 22, 6);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-19, -13, 4, 26);

      ctx.fillStyle = racer.skinColor;
      ctx.beginPath();
      ctx.arc(2, 0, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = racer.hairColor;
      ctx.beginPath();
      ctx.arc(-1, 0, 8.5, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.fill();

      ctx.rotate(-sAngle);
      const isMe = racer.slot === roomState.yourSlot;
      if (isMe || racer.isHuman) {
        ctx.font = 'bold 12px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = isMe ? '#fbbf24' : '#ffffff';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 3;
        const label = isMe ? `${racer.playerName} (You)` : racer.playerName;
        ctx.strokeText(label, 0, -24);
        ctx.fillText(label, 0, -24);
      }

      ctx.restore();
    };

    const loop = (time: number) => {
      drawTrack();

      [
        { x: 480, y: 95, w: 46, h: 34 },
        { x: 480, y: 445, w: 46, h: 34 },
      ].forEach((pad) => {
        ctx.save();
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(pad.x - pad.w / 2, pad.y - pad.h / 2, pad.w, pad.h);
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(pad.x - 12, pad.y + 8);
        ctx.lineTo(pad.x, pad.y - 8);
        ctx.lineTo(pad.x + 12, pad.y + 8);
        ctx.fill();
        ctx.restore();
      });

      const snap = raceStateRef.current;
      if (snap) {
        snap.itemBoxes.forEach((box) => {
          if (!box.active) return;
          ctx.save();
          const bob = Math.sin(time * 0.006) * 4;
          ctx.translate(box.x, box.y + bob);
          ctx.rotate(time * 0.003);
          ctx.fillStyle = '#ec4899';
          ctx.fillRect(-12, -12, 24, 24);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.strokeRect(-12, -12, 24, 24);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 14px "Outfit", sans-serif';
          ctx.fillText('?', -4, 5);
          ctx.restore();
        });

        snap.obstacles.forEach((obs) => {
          ctx.save();
          if (obs.type === 'banana') {
            ctx.font = '20px serif';
            ctx.fillText('🍌', obs.x - 10, obs.y + 8);
          } else {
            ctx.fillStyle = '#f43f5e';
            ctx.beginPath();
            ctx.arc(obs.x, obs.y, 8, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        });

        snap.racers.forEach((r) => {
          if (!smoothRacersRef.current[r.id]) {
            smoothRacersRef.current[r.id] = { x: r.x, y: r.y, angle: r.angle };
          }
          const s = smoothRacersRef.current[r.id];
          s.x += (r.x - s.x) * 0.45;
          s.y += (r.y - s.y) * 0.45;
          let diff = r.angle - s.angle;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          s.angle += diff * 0.45;

          drawKart(r, s.x, s.y, s.angle);
        });
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [raceStateRef, roomState.yourSlot]);

  const setTouch = (key: keyof RaceInputState, val: boolean) => {
    touchInputs.current[key] = val;
    syncAndEmitInput();
  };

  const myRacer = raceHud?.racers.find((r) => r.slot === roomState.yourSlot);
  const rankNum = myRacer?.rank ?? 1;
  const lapNum = Math.min(3, myRacer?.currentLap ?? 1);
  const speedKmh = Math.round((myRacer?.speed ?? 0) * 20);
  const myItem = myRacer?.hasItem ?? null;

  const sortedRankings = raceHud ? [...raceHud.racers].sort((a, b) => a.rank - b.rank) : [];

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className={`${
        isVirtualRotated ? 'virtual-landscape' : 'fixed inset-0 w-screen h-dvh'
      } bg-slate-950 overflow-hidden select-none touch-none z-50 flex items-center justify-center`}
    >
      <canvas
        ref={canvasRef}
        width={960}
        height={540}
        className="w-full h-full object-contain"
      />

      {/* Minimal Top HUD */}
      <div className="absolute top-0 left-0 right-0 z-20 p-2 sm:p-4 flex items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={onBackToLobby}
            className="min-w-[40px] min-h-[40px] rounded-xl bg-slate-900/85 hover:bg-slate-800 border border-white/25 text-white flex items-center justify-center cursor-pointer"
            title="Back to Lobby"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="bg-slate-900/85 border-2 border-amber-400 px-3 py-1 rounded-xl flex items-center gap-2">
            <span className="text-lg sm:text-xl font-black text-amber-400">
              {rankNum === 1 ? '1ST' : rankNum === 2 ? '2ND' : rankNum === 3 ? '3RD' : '4TH'}
            </span>
            <span className="text-xs font-bold text-white truncate max-w-[90px]">
              {myRacer?.playerName || 'You'}
            </span>
          </div>
          <div className="bg-slate-900/85 border border-slate-700 px-3 py-1 rounded-xl text-xs sm:text-sm font-black text-white tabular-nums">
            Lap {lapNum}/3
          </div>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="hidden sm:flex bg-slate-900/85 border border-slate-700 px-3 py-1.5 rounded-xl font-mono text-sm font-black text-emerald-400 tabular-nums">
            {speedKmh} KM/H
          </div>
          <button
            type="button"
            onClick={onToggleRotate}
            className="min-w-[40px] min-h-[40px] rounded-xl bg-slate-900/85 hover:bg-slate-800 border border-white/25 text-amber-300 flex items-center justify-center cursor-pointer"
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
            className="min-w-[40px] min-h-[40px] rounded-xl bg-slate-900/85 hover:bg-slate-800 border border-white/25 text-white flex items-center justify-center cursor-pointer"
            title="Toggle Sound"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      </div>

      {/* Countdown */}
      {raceHud?.countdown && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/30 pointer-events-none">
          <h2 className="text-6xl sm:text-8xl font-black text-white italic drop-shadow-[0_6px_20px_rgba(244,63,94,0.9)]">
            {raceHud.countdown}
          </h2>
        </div>
      )}

      {/* Waiting for other human after crossing finish */}
      {myRacer?.finished && raceHud?.gameState === 'RACING' && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-slate-900/90 border border-amber-400 px-4 py-2 rounded-2xl text-sm font-bold text-amber-300">
          Finished #{myRacer.rank}! Waiting for other racer...
        </div>
      )}

      {/* Race Finished Overlay */}
      {raceHud?.gameState === 'FINISHED' && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md p-6 text-center">
          <Trophy className="w-12 h-12 text-amber-400 mb-2 animate-bounce" />
          <h2 className="text-3xl sm:text-4xl font-black text-white">
            Race Complete!
          </h2>
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-3 my-4">
            {sortedRankings.map((r, i) => (
              <div
                key={r.id}
                className="flex items-center justify-between py-2 border-b border-slate-800/70 last:border-b-0 text-xs sm:text-sm"
              >
                <div className="flex items-center gap-2.5">
                  <span className="font-black text-amber-400 w-5">#{i + 1}</span>
                  <span className="font-bold text-white">
                    {r.playerName}
                    {r.slot === roomState.yourSlot ? ' (You)' : ''}
                  </span>
                </div>
                <span className="font-mono text-slate-300 tabular-nums">
                  {r.bestLap < 999 ? `${r.bestLap.toFixed(2)}s` : '--'}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onRematch}
              className="min-h-[48px] px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-2xl shadow-lg flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" /> Race Again
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
        {/* Left: Steer Left / Right */}
        <div className="pointer-events-auto flex items-center gap-3">
          <button
            type="button"
            onPointerDown={(e) => { e.preventDefault(); setTouch('left', true); }}
            onPointerUp={() => setTouch('left', false)}
            onPointerCancel={() => setTouch('left', false)}
            onPointerLeave={() => setTouch('left', false)}
            className="game-touch-btn w-18 h-18 sm:w-20 sm:h-20 rounded-2xl bg-slate-900/65 active:bg-white/40 border-2 border-white/80 text-white font-black text-2xl flex items-center justify-center shadow-xl backdrop-blur-sm"
          >
            ◀
          </button>
          <button
            type="button"
            onPointerDown={(e) => { e.preventDefault(); setTouch('right', true); }}
            onPointerUp={() => setTouch('right', false)}
            onPointerCancel={() => setTouch('right', false)}
            onPointerLeave={() => setTouch('right', false)}
            className="game-touch-btn w-18 h-18 sm:w-20 sm:h-20 rounded-2xl bg-slate-900/65 active:bg-white/40 border-2 border-white/80 text-white font-black text-2xl flex items-center justify-center shadow-xl backdrop-blur-sm"
          >
            ▶
          </button>
        </div>

        {/* Right: Item, Drift, Brake, Gas */}
        <div className="pointer-events-auto flex items-end gap-2.5">
          {myItem && (
            <button
              type="button"
              onPointerDown={(e) => { e.preventDefault(); setTouch('useItem', true); }}
              onPointerUp={() => setTouch('useItem', false)}
              onPointerCancel={() => setTouch('useItem', false)}
              onPointerLeave={() => setTouch('useItem', false)}
              className="game-touch-btn w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-rose-500 border-2 border-white text-white flex items-center justify-center shadow-xl animate-pulse"
              title="Use Item"
            >
              {myItem === 'boost' && <Zap className="w-6 h-6 text-yellow-300" />}
              {myItem === 'shield' && <Shield className="w-6 h-6 text-cyan-200" />}
              {myItem === 'banana' && <span className="text-xl">🍌</span>}
              {myItem === 'rocket' && <span className="text-xl">🚀</span>}
            </button>
          )}
          <button
            type="button"
            onPointerDown={(e) => { e.preventDefault(); setTouch('drift', true); }}
            onPointerUp={() => setTouch('drift', false)}
            onPointerCancel={() => setTouch('drift', false)}
            onPointerLeave={() => setTouch('drift', false)}
            className="game-touch-btn w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-purple-600/85 active:bg-purple-500 border-2 border-white text-white font-black text-xs flex items-center justify-center shadow-xl backdrop-blur-sm"
          >
            DRIFT
          </button>
          <button
            type="button"
            onPointerDown={(e) => { e.preventDefault(); setTouch('brake', true); }}
            onPointerUp={() => setTouch('brake', false)}
            onPointerCancel={() => setTouch('brake', false)}
            onPointerLeave={() => setTouch('brake', false)}
            className="game-touch-btn w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-rose-600/85 active:bg-rose-500 border-2 border-white text-white font-black text-xs flex items-center justify-center shadow-xl backdrop-blur-sm"
          >
            BRAKE
          </button>
          <button
            type="button"
            onPointerDown={(e) => { e.preventDefault(); setTouch('gas', true); }}
            onPointerUp={() => setTouch('gas', false)}
            onPointerCancel={() => setTouch('gas', false)}
            onPointerLeave={() => setTouch('gas', false)}
            className="game-touch-btn w-18 h-18 sm:w-20 sm:h-20 rounded-2xl bg-emerald-500/90 active:bg-emerald-600 border-2 border-white text-white font-black text-sm flex items-center justify-center shadow-xl backdrop-blur-sm"
          >
            GAS
          </button>
        </div>
      </div>
    </div>
  );
};
