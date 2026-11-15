import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Swords,
  Car,
  Play,
  ArrowLeft,
  Share2,
  User,
} from 'lucide-react';
import type { CharacterGender, GameMode, RoomStatePayload } from '../../types/game';
import { BOY_CHARACTER, GIRL_CHARACTER } from '../../data/roster';
import { drawCharacterAvatarToCanvas } from '../../utils/characterGenerator';

interface RoomLobbyProps {
  roomState: RoomStatePayload;
  notice: string | null;
  onSelectGender: (gender: CharacterGender) => void;
  onSetMode: (mode: GameMode) => void;
  onStartGame: () => void;
  onLeaveRoom: () => void;
}

const CharacterPortrait: React.FC<{ gender: CharacterGender }> = ({ gender }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const char = gender === 'girl' ? GIRL_CHARACTER : BOY_CHARACTER;
    drawCharacterAvatarToCanvas(ctx, char, 160, 160);
  }, [gender]);

  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={160}
      className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-2 border-white/80 shadow-lg bg-slate-950"
    />
  );
};

export const RoomLobby: React.FC<RoomLobbyProps> = ({
  roomState,
  notice,
  onSelectGender,
  onSetMode,
  onStartGame,
  onLeaveRoom,
}) => {
  const [copied, setCopied] = useState(false);

  const me = roomState.players.find((p) => p.slot === roomState.yourSlot);
  const other = roomState.players.find((p) => p.slot !== roomState.yourSlot);
  const selectedGender: CharacterGender = me?.gender || 'boy';

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomState.roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleShareLink = async () => {
    const shareUrl = `${window.location.origin}?room=${roomState.roomCode}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join my Chibi Clash & Drift Room!',
          text: `Enter room code ${roomState.roomCode} to play with me!`,
          url: shareUrl,
        });
        return;
      } catch {
        // fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-dvh w-full bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-2xl flex flex-col gap-5">
        {/* Top Row: Back & Room Code */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <button
            type="button"
            onClick={onLeaveRoom}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Leave
          </button>

          {!roomState.isSolo && (
            <div className="flex items-center gap-2">
              <div className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 flex items-center gap-2.5">
                <span className="text-xs text-slate-400 font-medium">Room</span>
                <span className="font-mono text-lg font-black tracking-widest text-amber-400 tabular-nums">
                  {roomState.roomCode}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyCode}
                className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                title="Copy Room Code"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <button
                type="button"
                onClick={handleShareLink}
                className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                title="Share Invite Link"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>
          )}

          {roomState.isSolo && (
            <span className="text-xs font-semibold text-amber-400">
              Solo Practice vs CPU
            </span>
          )}
        </div>

        {notice && (
          <div className="bg-amber-950/50 border border-amber-500/40 text-amber-200 text-xs px-4 py-2.5 rounded-xl">
            {notice}
          </div>
        )}

        {/* Players Status Strip */}
        <div className="grid grid-cols-2 gap-3">
          {/* Player 1 */}
          <div className={`p-3.5 rounded-2xl border ${roomState.yourSlot === 1 ? 'bg-slate-950 border-rose-500/70' : 'bg-slate-950/70 border-slate-800'}`}>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Player 1 {roomState.yourSlot === 1 ? '(You)' : ''}</span>
              <span className="capitalize font-semibold text-slate-300">
                {roomState.players[0]?.gender || 'boy'}
              </span>
            </div>
            <div className="font-bold text-base text-white truncate flex items-center gap-1.5">
              <User className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="truncate">{roomState.players[0]?.name || 'Player 1'}</span>
            </div>
          </div>

          {/* Player 2 */}
          <div className={`p-3.5 rounded-2xl border ${roomState.yourSlot === 2 ? 'bg-slate-950 border-cyan-500/70' : 'bg-slate-950/70 border-slate-800'}`}>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Player 2 {roomState.yourSlot === 2 ? '(You)' : ''}</span>
              {other && (
                <span className="capitalize font-semibold text-slate-300">
                  {other.gender}
                </span>
              )}
            </div>
            {other ? (
              <div className="font-bold text-base text-white truncate flex items-center gap-1.5">
                <User className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="truncate">{other.name}</span>
              </div>
            ) : (
              <div className="text-sm font-medium text-slate-400 animate-pulse truncate">
                Waiting for friend...
              </div>
            )}
          </div>
        </div>

        {/* Select Character: Boy or Girl */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold text-white">
              Select Character for <span className="text-rose-400">{me?.name}</span>
            </h2>
            <span className="text-xs text-slate-400">Boy or Girl</span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {/* Boy Card */}
            <button
              type="button"
              onClick={() => onSelectGender('boy')}
              className={`p-4 rounded-2xl border-2 flex flex-col items-center text-center gap-2.5 transition-all active:scale-[0.98] cursor-pointer ${
                selectedGender === 'boy'
                  ? 'bg-blue-950/40 border-blue-500 shadow-lg shadow-blue-500/15'
                  : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
              }`}
            >
              <CharacterPortrait gender="boy" />
              <div>
                <div className="font-black text-base sm:text-lg text-white">Boy</div>
                <div className="text-xs text-blue-300 font-medium">Kenji · Karate Brawler</div>
              </div>
              {selectedGender === 'boy' && (
                <span className="text-xs font-bold text-blue-300">Selected</span>
              )}
            </button>

            {/* Girl Card */}
            <button
              type="button"
              onClick={() => onSelectGender('girl')}
              className={`p-4 rounded-2xl border-2 flex flex-col items-center text-center gap-2.5 transition-all active:scale-[0.98] cursor-pointer ${
                selectedGender === 'girl'
                  ? 'bg-pink-950/40 border-pink-500 shadow-lg shadow-pink-500/15'
                  : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
              }`}
            >
              <CharacterPortrait gender="girl" />
              <div>
                <div className="font-black text-base sm:text-lg text-white">Girl</div>
                <div className="text-xs text-pink-300 font-medium">Hana · Blossom Striker</div>
              </div>
              {selectedGender === 'girl' && (
                <span className="text-xs font-bold text-pink-300">Selected</span>
              )}
            </button>
          </div>
        </div>

        {/* Game Mode Selector */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-slate-400">Select Game</span>
          <div className="grid grid-cols-2 gap-2.5 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
            <button
              type="button"
              onClick={() => onSetMode('fighting')}
              className={`min-h-[46px] rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                roomState.gameMode === 'fighting'
                  ? 'bg-rose-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Swords className="w-4 h-4" />
              Fighting
            </button>
            <button
              type="button"
              onClick={() => onSetMode('racing')}
              className={`min-h-[46px] rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                roomState.gameMode === 'racing'
                  ? 'bg-amber-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Car className="w-4 h-4" />
              Racing
            </button>
          </div>
        </div>

        {/* Start Game Button */}
        <button
          type="button"
          onClick={onStartGame}
          className="w-full min-h-[54px] bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 active:scale-[0.98] text-white font-black text-base sm:text-lg rounded-2xl shadow-xl shadow-rose-500/25 transition-all flex items-center justify-center gap-2.5 cursor-pointer"
        >
          <Play className="w-5 h-5 fill-current" />
          {other ? 'Start Game (Full Screen)' : 'Start vs CPU (or Wait for Friend)'}
        </button>
      </div>
    </div>
  );
};
