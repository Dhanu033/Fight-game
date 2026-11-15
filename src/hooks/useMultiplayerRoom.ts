import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CharacterGender,
  FightInputState,
  FightMatchSnapshot,
  GameEventPayload,
  GameMode,
  RaceInputState,
  RaceMatchSnapshot,
  RoomStatePayload,
} from '../types/game';

export type SocketStatus = 'connecting' | 'connected' | 'disconnected';

export function useMultiplayerRoom() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const [status, setStatus] = useState<SocketStatus>('connecting');
  const [roomState, setRoomState] = useState<RoomStatePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fightStateRef = useRef<FightMatchSnapshot | null>(null);
  const raceStateRef = useRef<RaceMatchSnapshot | null>(null);
  const [fightHud, setFightHud] = useState<FightMatchSnapshot | null>(null);
  const [raceHud, setRaceHud] = useState<RaceMatchSnapshot | null>(null);

  const eventListenersRef = useRef<Set<(ev: GameEventPayload) => void>>(new Set());

  const subscribeEvents = useCallback((cb: (ev: GameEventPayload) => void) => {
    eventListenersRef.current.add(cb);
    return () => {
      eventListenersRef.current.delete(cb);
    };
  }, []);

  const connect = useCallback(() => {
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    setStatus('connecting');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      setError(null);
    };

    ws.onmessage = (e) => {
      let msg: { type: string; payload?: unknown; message?: string; name?: string };
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }

      if (msg.type === 'room_state') {
        const payload = msg.payload as RoomStatePayload;
        setRoomState(payload);
        setError(null);
        if (payload.phase === 'LOBBY') {
          fightStateRef.current = null;
          raceStateRef.current = null;
          setFightHud(null);
          setRaceHud(null);
        }
      } else if (msg.type === 'error') {
        setError(msg.message || 'Connection error');
      } else if (msg.type === 'opponent_left') {
        setNotice(`${msg.name || 'Other player'} left the room.`);
        setTimeout(() => setNotice(null), 4000);
      } else if (msg.type === 'fight_state') {
        const snap = msg.payload as FightMatchSnapshot;
        fightStateRef.current = snap;
        setFightHud(snap);
      } else if (msg.type === 'race_state') {
        const snap = msg.payload as RaceMatchSnapshot;
        raceStateRef.current = snap;
        setRaceHud(snap);
      } else if (msg.type === 'game_event') {
        const ev = msg.payload as GameEventPayload;
        eventListenersRef.current.forEach((cb) => cb(ev));
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = window.setTimeout(() => {
        connect();
      }, 1500);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((data: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    } else {
      setError('Connecting to server... Please try again.');
    }
  }, []);

  const createRoom = useCallback(
    (name: string, solo: boolean = false) => {
      setError(null);
      send({ type: 'create_room', name, solo });
    },
    [send]
  );

  const joinRoom = useCallback(
    (name: string, roomCode: string) => {
      setError(null);
      send({ type: 'join_room', name, roomCode });
    },
    [send]
  );

  const selectGender = useCallback(
    (gender: CharacterGender) => {
      send({ type: 'select_gender', gender });
    },
    [send]
  );

  const setMode = useCallback(
    (gameMode: GameMode) => {
      send({ type: 'set_mode', gameMode });
    },
    [send]
  );

  const startGame = useCallback(() => {
    send({ type: 'start_game' });
  }, [send]);

  const rematch = useCallback(() => {
    send({ type: 'rematch' });
  }, [send]);

  const backToLobby = useCallback(() => {
    send({ type: 'back_to_lobby' });
  }, [send]);

  const leaveRoom = useCallback(() => {
    send({ type: 'leave_room' });
    setRoomState(null);
    fightStateRef.current = null;
    raceStateRef.current = null;
    setFightHud(null);
    setRaceHud(null);
  }, [send]);

  const sendFightInput = useCallback(
    (input: FightInputState) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'fight_input', input }));
      }
    },
    []
  );

  const sendRaceInput = useCallback(
    (input: RaceInputState) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'race_input', input }));
      }
    },
    []
  );

  return {
    status,
    roomState,
    error,
    notice,
    clearError: () => setError(null),
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
  };
}
