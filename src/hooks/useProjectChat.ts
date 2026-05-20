import { useEffect, useRef, useState, useCallback } from "react";

export interface ChatMessage {
  id: number;
  project_id: number;
  sender_id: number;
  sender_email: string;
  content: string;
  created_at: string;
}

export interface OnlineUser {
  id: number;
  email: string;
}

interface UseProjectChatOptions {
  projectId: number;
  token: string | null;
  enabled?: boolean;
}

interface UseProjectChatResult {
  messages: ChatMessage[];
  onlineUsers: OnlineUser[];
  typingUsers: OnlineUser[];
  isConnected: boolean;
  isLoadingHistory: boolean;
  sendMessage: (content: string) => void;
  sendTyping: (isTyping: boolean) => void;
  unreadCount: number;
  markRead: () => void;
}

const RECONNECT_DELAY_MS = 3000;
const PING_INTERVAL_MS = 25000;

export function useProjectChat({
  projectId,
  token,
  enabled = true,
}: UseProjectChatOptions): UseProjectChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [typingUsers, setTypingUsers] = useState<OnlineUser[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isChatVisible, setIsChatVisible] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMounted = useRef(true);
  const visibleRef = useRef(isChatVisible);
  // Track highest known message id to avoid duplicates when WS sends history
  const highestIdRef = useRef(0);

  visibleRef.current = isChatVisible;

  // ── REST history fetch (primary, runs on mount) ──────────────────────────
  useEffect(() => {
    if (!token || !enabled) {
      setIsLoadingHistory(false);
      return;
    }

    setIsLoadingHistory(true);

    fetch(`/api/projects/${projectId}/messages?token=${token}&limit=100`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ChatMessage[]) => {
        if (!isMounted.current) return;
        setMessages(data);
        if (data.length > 0) {
          highestIdRef.current = Math.max(...data.map((m) => m.id));
        }
      })
      .catch(() => {
        // silently fail — WS history will fill in
      })
      .finally(() => {
        if (isMounted.current) setIsLoadingHistory(false);
      });
  }, [projectId, token, enabled]);

  // ── WebSocket connection ──────────────────────────────────────────────────
  const buildWsUrl = useCallback(() => {
    if (!token) return null;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    return `${proto}//${host}/api/ws/chat/${projectId}?token=${token}`;
  }, [projectId, token]);

  const connect = useCallback(() => {
    if (!enabled || !token) return;

    const url = buildWsUrl();
    if (!url) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMounted.current) return;
      setIsConnected(true);
      pingTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      if (!isMounted.current) return;
      try {
        const data = JSON.parse(event.data);

        if (data.type === "history") {
          // WS history: only add messages we don't already have from REST
          const incoming: ChatMessage[] = data.messages ?? [];
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newOnes = incoming.filter((m) => !existingIds.has(m.id));
            if (newOnes.length === 0) return prev;
            const merged = [...prev, ...newOnes].sort(
              (a, b) =>
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
            highestIdRef.current = Math.max(highestIdRef.current, ...merged.map((m) => m.id));
            return merged;
          });
        } else if (data.type === "message") {
          const msg: ChatMessage = {
            id: data.id,
            project_id: data.project_id,
            sender_id: data.sender_id,
            sender_email: data.sender_email,
            content: data.content,
            created_at: data.created_at,
          };
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            highestIdRef.current = Math.max(highestIdRef.current, msg.id);
            return [...prev, msg];
          });
          if (!visibleRef.current) {
            setUnreadCount((n) => n + 1);
          }
        } else if (data.type === "online_users") {
          setOnlineUsers(data.users ?? []);
        } else if (data.type === "typing") {
          setTypingUsers(data.users ?? []);
        }
        // pong — no-op
      } catch {
        // ignore JSON parse errors
      }
    };

    ws.onclose = () => {
      if (!isMounted.current) return;
      setIsConnected(false);
      setOnlineUsers([]);
      clearInterval(pingTimer.current!);
      if (enabled && isMounted.current) {
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [buildWsUrl, enabled, token]);

  useEffect(() => {
    isMounted.current = true;
    if (enabled && token) {
      connect();
    }
    return () => {
      isMounted.current = false;
      clearTimeout(reconnectTimer.current!);
      clearInterval(pingTimer.current!);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, enabled, token, projectId]);

  const sendMessage = useCallback((content: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "message", content }));
    }
  }, []);

  const sendTyping = useCallback((isTyping: boolean) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "typing", is_typing: isTyping }));
    }
  }, []);

  const markRead = useCallback(() => {
    setUnreadCount(0);
    setIsChatVisible(true);
  }, []);

  return {
    messages,
    onlineUsers,
    typingUsers,
    isConnected,
    isLoadingHistory,
    sendMessage,
    sendTyping,
    unreadCount,
    markRead,
  };
}
