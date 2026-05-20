import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { type ChatMessage, type OnlineUser, useProjectChat } from "@/hooks/useProjectChat";
import { Button } from "@/components/ui/button";
import { Send, Wifi, WifiOff, X, MessageSquare, Loader2 } from "lucide-react";

interface ChatSidebarProps {
  projectId: number;
  onClose: () => void;
  onUnreadChange: (count: number) => void;
}

function getInitials(email: string): string {
  const name = email.split("@")[0];
  return name.slice(0, 2).toUpperCase();
}

function avatarColor(email: string): string {
  const colors = [
    "bg-violet-500",
    "bg-blue-500",
    "bg-teal-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-rose-500",
    "bg-indigo-500",
    "bg-cyan-500",
  ];
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = (hash * 31 + email.charCodeAt(i)) & 0xffffffff;
  }
  return colors[Math.abs(hash) % colors.length];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return (
    d.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
}

function groupMessages(messages: ChatMessage[]) {
  const groups: {
    senderId: number;
    senderEmail: string;
    messages: ChatMessage[];
  }[] = [];
  for (const msg of messages) {
    const last = groups[groups.length - 1];
    if (last && last.senderId === msg.sender_id) {
      last.messages.push(msg);
    } else {
      groups.push({
        senderId: msg.sender_id,
        senderEmail: msg.sender_email,
        messages: [msg],
      });
    }
  }
  return groups;
}

export default function ChatSidebar({
  projectId,
  onClose,
  onUnreadChange,
}: ChatSidebarProps) {
  const { token, user } = useAuth();
  const {
    messages,
    onlineUsers,
    typingUsers,
    isConnected,
    isLoadingHistory,
    sendMessage,
    sendTyping,
    unreadCount,
    markRead,
  } = useProjectChat({ projectId, token, enabled: true });

  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasTypingRef = useRef(false);

  useEffect(() => {
    markRead();
  }, [markRead]);

  useEffect(() => {
    onUnreadChange(unreadCount);
  }, [unreadCount, onUnreadChange]);

  // Auto-scroll on new messages or typing indicator
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUsers]);

  const handleTyping = useCallback(() => {
    if (!wasTypingRef.current) {
      wasTypingRef.current = true;
      sendTyping(true);
    }
    clearTimeout(typingTimerRef.current!);
    typingTimerRef.current = setTimeout(() => {
      wasTypingRef.current = false;
      sendTyping(false);
    }, 2000);
  }, [sendTyping]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || !isConnected) return;
    clearTimeout(typingTimerRef.current!);
    wasTypingRef.current = false;
    sendTyping(false);
    sendMessage(text);
    setInput("");
  }, [input, isConnected, sendMessage, sendTyping]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const otherTyping = typingUsers.filter((u) => u.id !== user?.id);
  const grouped = groupMessages(messages);

  return (
    <div className="w-72 flex-shrink-0 border-l bg-card flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm text-foreground">Team Chat</span>
          {isConnected ? (
            <span title="Connected" className="flex items-center gap-1">
              <Wifi className="w-3.5 h-3.5 text-emerald-500" />
            </span>
          ) : (
            <span title="Reconnecting…" className="flex items-center gap-1">
              <WifiOff className="w-3.5 h-3.5 text-muted-foreground animate-pulse" />
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Online collaborators */}
      <div className="px-4 py-2 border-b flex-shrink-0 bg-muted/40">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
          Online · {onlineUsers.length}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {onlineUsers.length === 0 && (
            <span className="text-[11px] text-muted-foreground italic">
              {isConnected ? "Only you" : "Connecting…"}
            </span>
          )}
          {onlineUsers.map((u) => (
            <div key={u.id} title={u.email} className="flex items-center gap-1">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold ${avatarColor(u.email)}`}
              >
                {getInitials(u.email)}
              </div>
              <span className="text-[11px] text-muted-foreground max-w-[80px] truncate">
                {u.email.split("@")[0]}
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            </div>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 min-h-0">
        {isLoadingHistory ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-xs">Loading messages…</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              No messages yet. Say hello!
            </p>
          </div>
        ) : (
          grouped.map((group, gi) => {
            const isMe = group.senderId === user?.id;
            return (
              <div
                key={gi}
                className={`flex gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}
              >
                {/* Avatar */}
                <div
                  title={group.senderEmail}
                  className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold self-end ${avatarColor(group.senderEmail)}`}
                >
                  {getInitials(group.senderEmail)}
                </div>

                {/* Bubble group */}
                <div
                  className={`flex flex-col gap-0.5 max-w-[75%] ${
                    isMe ? "items-end" : "items-start"
                  }`}
                >
                  {!isMe && (
                    <span className="text-[10px] text-muted-foreground px-1 truncate max-w-full">
                      {group.senderEmail.split("@")[0]}
                    </span>
                  )}
                  {group.messages.map((msg, mi) => (
                    <div key={msg.id} className="flex flex-col gap-0.5">
                      <div
                        className={`px-3 py-1.5 rounded-2xl text-sm leading-relaxed break-words ${
                          isMe
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-muted text-foreground rounded-bl-sm"
                        }`}
                      >
                        {msg.content}
                      </div>
                      {mi === group.messages.length - 1 && (
                        <span
                          className={`text-[10px] text-muted-foreground px-1 ${
                            isMe ? "text-right" : "text-left"
                          }`}
                        >
                          {formatTime(msg.created_at)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}

        {/* Typing indicator */}
        {otherTyping.length > 0 && (
          <div className="flex gap-2 items-end">
            <div
              className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold ${avatarColor(otherTyping[0].email)}`}
            >
              {getInitials(otherTyping[0].email)}
            </div>
            <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" />
            </div>
            <span className="text-[10px] text-muted-foreground self-center">
              {otherTyping.map((u) => u.email.split("@")[0]).join(", ")}
              {otherTyping.length === 1 ? " is typing…" : " are typing…"}
            </span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t flex-shrink-0 bg-card">
        {!isConnected && (
          <div className="flex items-center gap-1.5 text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mb-2">
            <WifiOff className="w-3 h-3 flex-shrink-0" />
            <span>Reconnecting… messages will send when connected.</span>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              handleTyping();
            }}
            onKeyDown={handleKeyDown}
            placeholder={isLoadingHistory ? "Loading…" : "Message teammates…"}
            disabled={isLoadingHistory}
            rows={1}
            className="flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 min-h-[38px] max-h-[120px] overflow-y-auto"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <Button
            size="icon"
            className="h-9 w-9 rounded-xl flex-shrink-0"
            onClick={handleSend}
            disabled={!isConnected || !input.trim() || isLoadingHistory}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
