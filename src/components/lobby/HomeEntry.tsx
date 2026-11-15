import React, { useState, useEffect } from 'react';
import { Users, Plus, LogIn, Bot, Download } from 'lucide-react';
import type { SocketStatus } from '../../hooks/useMultiplayerRoom';

interface HomeEntryProps {
  initialName: string;
  initialRoomCode: string;
  status: SocketStatus;
  error: string | null;
  onClearError: () => void;
  onCreateRoom: (name: string, solo?: boolean) => void;
  onJoinRoom: (name: string, code: string) => void;
}

export const HomeEntry: React.FC<HomeEntryProps> = ({
  initialName,
  initialRoomCode,
  status,
  error,
  onClearError,
  onCreateRoom,
  onJoinRoom,
}) => {
  const [name, setName] = useState(initialName);
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (initialRoomCode) {
      setRoomCode(initialRoomCode);
    }
  }, [initialRoomCode]);

  const validateName = (): string | null => {
    const trimmed = name.trim();
    if (!trimmed) {
      setLocalError('Please enter your name first.');
      return null;
    }
    setLocalError(null);
    return trimmed;
  };

  const handleCreate = (solo: boolean) => {
    const validName = validateName();
    if (!validName) return;
    onCreateRoom(validName, solo);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const validName = validateName();
    if (!validName) return;
    const cleanCode = roomCode.trim().toUpperCase();
    if (cleanCode.length < 4) {
      setLocalError('Enter the 5-digit room code from your friend.');
      return;
    }
    onJoinRoom(validName, cleanCode);
  };

  const displayError = localError || error;

  return (
    <div className="min-h-dvh w-full bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col gap-6">
        {/* Game Title */}
        <div className="text-center">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
            Chibi Clash &amp; Drift
          </h1>
          <p className="text-sm text-slate-400 mt-1.5">
            Enter your name to create a room or join a friend
          </p>
        </div>

        {/* Name Input */}
        <div className="flex flex-col gap-2">
          <label htmlFor="player-name" className="text-xs font-semibold text-slate-300">
            Your Name
          </label>
          <input
            id="player-name"
            type="text"
            maxLength={16}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (localError) setLocalError(null);
              if (error) onClearError();
            }}
            placeholder="Enter your name..."
            className="w-full min-h-[48px] bg-slate-950 border border-slate-700 rounded-2xl px-4 py-3 text-base font-semibold text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition-colors"
            autoFocus
          />
        </div>

        {displayError && (
          <div className="bg-rose-950/60 border border-rose-500/50 text-rose-200 text-xs font-medium px-4 py-3 rounded-xl">
            {displayError}
          </div>
        )}

        {/* Create Room Button */}
        <button
          type="button"
          onClick={() => handleCreate(false)}
          disabled={status !== 'connected'}
          className="w-full min-h-[52px] bg-rose-500 hover:bg-rose-600 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-base rounded-2xl shadow-lg shadow-rose-500/20 transition-all flex items-center justify-center gap-2.5 cursor-pointer"
        >
          <Plus className="w-5 h-5" />
          Create Room (2 Players)
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <div className="h-px flex-1 bg-slate-800" />
          <span>or join with code</span>
          <div className="h-px flex-1 bg-slate-800" />
        </div>

        {/* Join Room Form */}
        <form onSubmit={handleJoin} className="flex gap-2.5">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={roomCode}
            onChange={(e) => {
              setRoomCode(e.target.value.toUpperCase());
              if (localError) setLocalError(null);
              if (error) onClearError();
            }}
            placeholder="Room Code"
            className="flex-1 min-w-0 min-h-[48px] bg-slate-950 border border-slate-700 rounded-2xl px-4 py-3 text-base font-mono font-bold tracking-widest text-center text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
          />
          <button
            type="submit"
            disabled={status !== 'connected'}
            className="min-h-[48px] px-5 bg-slate-800 hover:bg-slate-700 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-sm rounded-2xl border border-slate-700 transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            <LogIn className="w-4 h-4 text-cyan-400" />
            Join
          </button>
        </form>

        {/* Quick Solo Option + ZIP Download */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs">
          <button
            type="button"
            onClick={() => handleCreate(true)}
            disabled={status !== 'connected'}
            className="min-h-[44px] px-3 py-2 text-slate-300 hover:text-white font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Bot className="w-4 h-4 text-amber-400" />
            Play Solo vs CPU
          </button>

          <a
            href="/chibi-game-website.zip"
            download="chibi-game-website.zip"
            className="min-h-[44px] px-3 py-2 text-slate-400 hover:text-rose-300 font-medium flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-4 h-4" />
            Download ZIP
          </a>
        </div>

        {status !== 'connected' && (
          <div className="flex items-center justify-center gap-2 text-xs text-amber-400">
            <Users className="w-3.5 h-3.5 animate-pulse" />
            <span>Connecting to multiplayer server...</span>
          </div>
        )}
      </div>
    </div>
  );
};
