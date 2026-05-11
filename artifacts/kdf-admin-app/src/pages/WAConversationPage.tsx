import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/App";
import { ArrowLeft, Send, RefreshCw, Bot, User } from "lucide-react";

function timeStr(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function dateSep(dateStr: string) {
  try {
    const d   = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return d.toLocaleDateString([], { day: "numeric", month: "short" });
  } catch { return ""; }
}

export default function WAConversationPage({ params }: { params: { phone: string } }) {
  const { token } = useAuth();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const phone = params.phone;
  const [reply, setReply] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: msgs = [], isLoading, refetch, isFetching } = useQuery<any[]>({
    queryKey: ["wa-conversation-msgs", phone],
    queryFn: () =>
      fetch(`/api/admin/whatsapp/conversations/${phone}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()),
    refetchInterval: 15_000,
    select: (d: any) => Array.isArray(d) ? d : (d?.messages ?? d?.data ?? []),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      const r = await fetch(`/api/admin/whatsapp/conversations/${phone}/reply`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wa-conversation-msgs", phone] });
      setReply("");
    },
  });

  const handleSend = () => {
    const text = reply.trim();
    if (!text || sendMutation.isPending) return;
    sendMutation.mutate(text);
  };

  const custName = msgs.find((m: any) => m.direction === "in")?.from_name ?? phone;

  let lastDate = "";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="h-14 bg-card border-b border-border flex items-center gap-3 px-4 sticky top-0 z-20 shadow-sm">
        <button
          onClick={() => navigate("/wa")}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-muted transition shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{custName}</p>
          <p className="text-[10px] text-muted-foreground">{phone}</p>
        </div>
        <button onClick={() => refetch()} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-muted transition">
          <RefreshCw className={`w-4 h-4 text-muted-foreground ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-3 py-4 space-y-1 pb-24">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Loading messages…</p>
          </div>
        ) : msgs.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground text-sm">No messages yet</div>
        ) : (
          msgs.map((m: any, i: number) => {
            const isOut      = m.direction === "out";
            const body       = m.content ?? m.body ?? m.message ?? "";
            const msgDate    = dateSep(m.created_at ?? "");
            const showSep    = msgDate !== lastDate;
            if (showSep) lastDate = msgDate;

            return (
              <div key={m.id ?? i}>
                {showSep && (
                  <div className="flex items-center gap-2 my-3">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-[10px] text-muted-foreground font-medium px-2">{msgDate}</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}
                <div className={`flex ${isOut ? "justify-end" : "justify-start"} mb-1`}>
                  <div className={`max-w-[80%] ${isOut ? "items-end" : "items-start"} flex flex-col`}>
                    {/* Bot/agent label */}
                    {isOut && (m.is_bot || m.agent_name) && (
                      <div className={`flex items-center gap-1 mb-0.5 ${isOut ? "flex-row-reverse" : "flex-row"}`}>
                        {m.is_bot
                          ? <><Bot className="w-3 h-3 text-primary" /><span className="text-[9px] text-primary">AI Bot</span></>
                          : <><User className="w-3 h-3 text-muted-foreground" /><span className="text-[9px] text-muted-foreground">{m.agent_name}</span></>
                        }
                      </div>
                    )}
                    <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed break-words ${
                      isOut
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-card border border-border text-foreground rounded-tl-sm"
                    }`}>
                      {body || <span className="italic text-xs opacity-60">[media]</span>}
                    </div>
                    <span className="text-[9px] text-muted-foreground mt-0.5 px-1">
                      {timeStr(m.created_at ?? "")}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </main>

      {/* Reply bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-sm border-t border-border px-3 py-3 flex items-end gap-2">
        <textarea
          value={reply}
          onChange={e => setReply(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Type a reply…"
          rows={1}
          className="flex-1 min-h-[40px] max-h-28 resize-none rounded-xl bg-muted border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={handleSend}
          disabled={!reply.trim() || sendMutation.isPending}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40 transition active:scale-95 shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
