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
  const [unreadCount, setUnreadCount] = useState(0);
  const [isChatVisible, setIsChatVisible] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMounted = useRef(true);
  const visibleRef = useRef(isChatVisible);

  visibleRef.current = isChatVisible;

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
          setMessages(data.messages ?? []);
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
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      if (!isMounted.current) return;
      setIsConnected(false);
      clearInterval(pingTimer.current!);
      if (enabled) {
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
    sendMessage,
    sendTyping,
    unreadCount,
    markRead,
  };
}
