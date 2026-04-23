import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  useGetConversationMessages,
  useSendConversationMessage,
  useGetConversations,
  getGetConversationMessagesQueryKey,
  getGetConversationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Send, Loader2, Hash } from "lucide-react";

export default function ConversationChat({ id }: { id: number }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);

  const convs = useGetConversations();
  const conv = convs.data?.find((c) => c.id === id);

  const msgs = useGetConversationMessages(id, {
    query: {
      queryKey: getGetConversationMessagesQueryKey(id),
      refetchInterval: 2500,
    },
  });
  const send = useSendConversationMessage({
    mutation: {
      onSuccess: () => {
        setDraft("");
        qc.invalidateQueries({
          queryKey: getGetConversationMessagesQueryKey(id),
        });
        qc.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
      },
    },
  });

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [msgs.data?.length]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || send.isPending) return;
    send.mutate({ id, data: { content } });
  }

  const initials =
    conv?.otherUser.displayName
      .split(" ")
      .map((s) => s[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ?? "?";

  return (
    <div className="flex h-[calc(100dvh-58px)] flex-col md:h-[100dvh]">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <Link href="/app/messages" className="text-slate-500 hover:text-slate-900" data-testid="link-back-messages">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        {conv ? (
          <>
            <Avatar className="h-10 w-10">
              {conv.otherUser.avatarUrl ? (
                <AvatarImage
                  src={conv.otherUser.avatarUrl}
                  alt={conv.otherUser.displayName}
                />
              ) : null}
              <AvatarFallback className="bg-violet-200 text-violet-700">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-slate-900">
                {conv.otherUser.displayName}
              </p>
              <p className="truncate text-xs text-slate-500">
                @{conv.otherUser.username}
              </p>
            </div>
            {conv.otherUser.sharedHashtags.length > 0 && (
              <div className="hidden items-center gap-1 sm:flex">
                {conv.otherUser.sharedHashtags.slice(0, 3).map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-0.5 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700"
                  >
                    <Hash className="h-3 w-3" />
                    {t}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500">Loading…</p>
        )}
      </header>

      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto bg-slate-50 px-4 py-6"
        data-testid="conv-message-list"
      >
        {msgs.isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : msgs.data && msgs.data.length > 0 ? (
          <div className="mx-auto flex max-w-2xl flex-col gap-2">
            {msgs.data.map((m) => {
              const mine = m.senderId !== conv?.otherUser.id;
              return (
                <div
                  key={m.id}
                  className={[
                    "flex",
                    mine ? "justify-end" : "justify-start",
                  ].join(" ")}
                  data-testid={`dm-${m.id}`}
                >
                  <div
                    className={[
                      "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                      mine
                        ? "rounded-br-md bg-violet-600 text-white"
                        : "rounded-bl-md bg-white text-slate-800",
                    ].join(" ")}
                  >
                    <p className="break-words">{m.content}</p>
                    <p
                      className={[
                        "mt-1 text-[10px]",
                        mine ? "text-violet-100" : "text-slate-400",
                      ].join(" ")}
                    >
                      {new Date(m.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-slate-500">
            Say hi to start the conversation 👋
          </div>
        )}
      </div>

      <form
        onSubmit={submit}
        className="flex items-center gap-2 border-t border-slate-200 bg-white p-3"
      >
        <Input
          placeholder="Type a message…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          data-testid="input-dm-message"
        />
        <Button
          type="submit"
          disabled={!draft.trim() || send.isPending}
          className="bg-violet-600 hover:bg-violet-700"
          data-testid="button-send-dm"
        >
          {send.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </div>
  );
}
