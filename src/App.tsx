import React, { useState, useEffect, useCallback } from 'react';
import { useMultiplayerRoom } from './hooks/useMultiplayerRoom';
import { HomeEntry } from './components/lobby/HomeEntry';
import { RoomLobby } from './components/lobby/RoomLobby';
import { FightingGame } from './components/fighting/FightingGame';
import { RacingGame } from './components/racing/RacingGame';

const NAME_STORAGE_KEY = 'chibi_player_name_v1';

export default function App() {
  const {
    status,
    roomState,
    error,
    notice,
    clearError,
    fightStateRef,
    raceStateRef,
    fightHud,
    raceHud,
    subscribeEvents,
    createRoom,
    joinRoom,
    selectGender,
    setMode,
    startGame,
    rematch,
    backToLobby,
    leaveRoom,
    sendFightInput,
    sendRaceInput,
  } = useMultiplayerRoom();

  const [savedName, setSavedName] = useState<string>(() => {
    try {
      return localStorage.getItem(NAME_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });

  const [initialRoomCode] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    return (params.get('room') || '').toUpperCase();
  });

  const [isVirtualRotated, setIsVirtualRotated] = useState<boolean>(false);

  const requestLandscapeFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen().catch(() => {});
      }
      const screenAny = screen as unknown as {
        orientation?: { lock?: (mode: string) => Promise<void> };
      };
      if (screenAny.orientation?.lock) {
        await screenAny.orientation.lock('landscape').catch(() => {});
      }
    } catch {
      // ignore if browser blocks orientation lock
    }
  }, []);

  const handleToggleRotate = useCallback(async () => {
    await requestLandscapeFullscreen();
    // If device is still portrait (e.g. iOS Safari or OS rotation locked), toggle CSS virtual landscape
    const isCurrentlyPortrait = window.innerHeight > window.innerWidth;
    if (isCurrentlyPortrait || isVirtualRotated) {
      setIsVirtualRotated((prev) => !prev);
    }
  }, [isVirtualRotated, requestLandscapeFullscreen]);

  // Reset virtual rotation if user physically rotates device to landscape or exits game
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > window.innerHeight && isVirtualRotated) {
        setIsVirtualRotated(false);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isVirtualRotated]);

  useEffect(() => {
    if (!roomState || roomState.phase !== 'PLAYING') {
      setIsVirtualRotated(false);
    }
  }, [roomState]);

  const handleCreateRoom = (name: string, solo = false) => {
    try {
      localStorage.setItem(NAME_STORAGE_KEY, name);
    } catch {
      // ignore
    }
    setSavedName(name);
    createRoom(name, solo);
  };

  const handleJoinRoom = (name: string, code: string) => {
    try {
      localStorage.setItem(NAME_STORAGE_KEY, name);
    } catch {
      // ignore
    }
    setSavedName(name);
    joinRoom(name, code);
  };

  const handleStartGame = async () => {
    await requestLandscapeFullscreen();
    if (window.innerHeight > window.innerWidth && window.innerWidth < 900) {
      setIsVirtualRotated(true);
    }
    startGame();
  };

  // 1. Entry Screen: Ask Name & Create / Join Room
  if (!roomState) {
    return (
      <HomeEntry
        initialName={savedName}
        initialRoomCode={initialRoomCode}
        status={status}
        error={error}
        onClearError={clearError}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
      />
    );
  }

  // 2. Room Lobby: Show Room Code, Player Names, Select Boy or Girl Character
  if (roomState.phase === 'LOBBY') {
    return (
      <RoomLobby
        roomState={roomState}
        notice={notice}
        onSelectGender={selectGender}
        onSetMode={setMode}
        onStartGame={handleStartGame}
        onLeaveRoom={leaveRoom}
      />
    );
  }

  // 3. Full-Screen Game View: ONLY the game is displayed
  if (roomState.gameMode === 'racing') {
    return (
      <RacingGame
        roomState={roomState}
        raceStateRef={raceStateRef}
        raceHud={raceHud}
        subscribeEvents={subscribeEvents}
        onSendInput={sendRaceInput}
        onRematch={rematch}
        onBackToLobby={backToLobby}
        isVirtualRotated={isVirtualRotated}
        onToggleRotate={handleToggleRotate}
      />
    );
  }

  return (
    <FightingGame
      roomState={roomState}
      fightStateRef={fightStateRef}
      fightHud={fightHud}
      subscribeEvents={subscribeEvents}
      onSendInput={sendFightInput}
      onRematch={rematch}
      onBackToLobby={backToLobby}
      isVirtualRotated={isVirtualRotated}
      onToggleRotate={handleToggleRotate}
    />
  );
}
