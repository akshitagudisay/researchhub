import { useEffect, useRef, useState, useCallback } from "react";

export interface ActiveCollaborator {
  user_id: number;
  email: string;
  section: string | null;
  last_active: string;
}

export interface IncomingEdit {
  section: string;
  content: string;
  editor_id: number;
  editor_email: string;
}

export interface SectionConflict {
  section: string;
  editor_email: string;
}

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

interface UseManuscriptCollaborationOptions {
  projectId: number;
  token: string | null;
  enabled?: boolean;
}

interface UseManuscriptCollaborationResult {
  activeCollaborators: ActiveCollaborator[];
  incomingEdit: IncomingEdit | null;
  sectionConflict: SectionConflict | null;
  isConnected: boolean;
  autosaveStatus: AutosaveStatus;
  lastSaved: string | null;
  sendSectionFocus: (section: string) => void;
  sendSectionBlur: (section: string) => void;
  sendEdit: (section: string, content: string) => void;
  clearIncomingEdit: () => void;
  clearConflict: () => void;
}

const RECONNECT_DELAY = 3000;
const PING_INTERVAL = 25000;

export function useManuscriptCollaboration({
  projectId,
  token,
  enabled = true,
}: UseManuscriptCollaborationOptions): UseManuscriptCollaborationResult {
  const [activeCollaborators, setActiveCollaborators] = useState<ActiveCollaborator[]>([]);
  const [incomingEdit, setIncomingEdit] = useState<IncomingEdit | null>(null);
  const [sectionConflict, setSectionConflict] = useState<SectionConflict | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMounted = useRef(true);
  const pendingEdits = useRef<Map<string, string>>(new Map());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildUrl = useCallback(() => {
    if (!token) return null;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/api/ws/manuscript/${projectId}?token=${token}`;
  }, [projectId, token]);

  const connect = useCallback(() => {
    if (!enabled || !token) return;
    const url = buildUrl();
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
      }, PING_INTERVAL);
    };

    ws.onmessage = (event) => {
      if (!isMounted.current) return;
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case "init":
            setActiveCollaborators(data.active_collaborators ?? []);
            break;
          case "active_collaborators":
            setActiveCollaborators(data.users ?? []);
            break;
          case "edit":
            setIncomingEdit({
              section: data.section,
              content: data.content,
              editor_id: data.editor_id,
              editor_email: data.editor_email,
            });
            break;
          case "autosaved":
            setAutosaveStatus("saved");
            setLastSaved(data.timestamp);
            setTimeout(() => {
              if (isMounted.current) setAutosaveStatus("idle");
            }, 3000);
            break;
          case "section_conflict":
            setSectionConflict({ section: data.section, editor_email: data.editor_email });
            setTimeout(() => {
              if (isMounted.current) setSectionConflict(null);
            }, 5000);
            break;
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      if (!isMounted.current) return;
      setIsConnected(false);
      setActiveCollaborators([]);
      clearInterval(pingTimer.current!);
      if (enabled && isMounted.current) {
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
      }
    };

    ws.onerror = () => ws.close();
  }, [buildUrl, enabled, token]);

  useEffect(() => {
    isMounted.current = true;
    if (enabled && token) connect();
    return () => {
      isMounted.current = false;
      clearTimeout(reconnectTimer.current!);
      clearInterval(pingTimer.current!);
      clearTimeout(saveTimer.current!);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect, enabled, token, projectId]);

  const sendSectionFocus = useCallback((section: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "section_focus", section }));
    }
  }, []);

  const sendSectionBlur = useCallback((section: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "section_blur", section }));
    }
  }, []);

  const sendEdit = useCallback((section: string, content: string) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    setAutosaveStatus("saving");
    wsRef.current.send(JSON.stringify({ type: "edit", section, content }));
  }, []);

  const clearIncomingEdit = useCallback(() => setIncomingEdit(null), []);
  const clearConflict = useCallback(() => setSectionConflict(null), []);

  return {
    activeCollaborators,
    incomingEdit,
    sectionConflict,
    isConnected,
    autosaveStatus,
    lastSaved,
    sendSectionFocus,
    sendSectionBlur,
    sendEdit,
    clearIncomingEdit,
    clearConflict,
  };
}
