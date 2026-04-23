import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  useGetRoomMessages,
  useSendRoomMessage,
  useGetHashtag,
  useFollowHashtag,
  useUnfollowHashtag,
  getGetRoomMessagesQueryKey,
  getGetHashtagQueryKey,
  getGetMyFollowedHashtagsQueryKey,
  getGetRoomsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowLeft,
  Hash,
  Send,
  Star,
  Users,
  Loader2,
} from "lucide-react";

export default function RoomChat({ tag }: { tag: string }) {
  const cleanTag = decodeURIComponent(tag).toLowerCase().replace(/^#/, "");
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const messagesQ = useGetRoomMessages(cleanTag, {
    query: {
      queryKey: getGetRoomMessagesQueryKey(cleanTag),
      refetchInterval: 3000,
    },
  });
  const hashtagQ = useGetHashtag(cleanTag);
  const send = useSendRoomMessage({
    mutation: {
      onSuccess: () => {
        setDraft("");
        qc.invalidateQueries({
          queryKey: getGetRoomMessagesQueryKey(cleanTag),
        });
      },
    },
  });
  const follow = useFollowHashtag({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetHashtagQueryKey(cleanTag) });
        qc.invalidateQueries({ queryKey: getGetMyFollowedHashtagsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetRoomsQueryKey() });
      },
    },
  });
  const unfollow = useUnfollowHashtag({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetHashtagQueryKey(cleanTag) });
        qc.invalidateQueries({ queryKey: getGetMyFollowedHashtagsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetRoomsQueryKey() });
      },
    },
  });

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messagesQ.data?.length]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || send.isPending) return;
    send.mutate({ tag: cleanTag, data: { content } });
  }

  const detail = hashtagQ.data;

  return (
    <div className="flex h-[calc(100dvh-58px)] flex-col md:h-[100dvh]">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <Link href="/app/rooms" className="text-slate-500 hover:text-slate-900" data-testid="link-back-rooms">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 text-white">
          <Hash className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-slate-900">
            #{cleanTag}
          </p>
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <Users className="h-3 w-3" />
            {detail?.memberCount ?? 0} members
            {detail && detail.recentMessages > 0 && (
              <span className="rounded-full bg-pink-100 px-1.5 py-0.5 text-pink-700">
                {detail.recentMessages} new
              </span>
            )}
          </p>
        </div>
        {detail && (
          <Button
            size="sm"
            variant={detail.isFollowed ? "secondary" : "outline"}
            onClick={() =>
              detail.isFollowed
                ? unfollow.mutate({ tag: cleanTag })
                : follow.mutate({ tag: cleanTag })
            }
            data-testid="button-room-follow"
          >
            <Star
              className={[
                "mr-1 h-3.5 w-3.5",
                detail.isFollowed ? "fill-yellow-400 text-yellow-500" : "",
              ].join(" ")}
            />
            {detail.isFollowed ? "Following" : "Follow"}
          </Button>
        )}
      </header>

      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto bg-slate-50 px-4 py-6"
        data-testid="room-message-list"
      >
        {messagesQ.isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : messagesQ.data && messagesQ.data.length > 0 ? (
          <div className="mx-auto max-w-2xl space-y-4">
            {messagesQ.data.map((m) => (
              <div key={m.id} className="flex gap-3" data-testid={`msg-${m.id}`}>
                <Avatar className="h-9 w-9">
                  {m.senderAvatarUrl ? (
                    <AvatarImage src={m.senderAvatarUrl} alt={m.senderName} />
                  ) : null}
                  <AvatarFallback className="bg-violet-200 text-violet-700">
                    {m.senderName
                      .split(" ")
                      .map((s) => s[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      {m.senderName}
                    </p>
                    <span className="text-xs text-slate-400">
                      {new Date(m.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="mt-0.5 break-words text-sm text-slate-700">
                    {m.content}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-slate-500">
            Be the first to say something in #{cleanTag}!
          </div>
        )}
      </div>

      <form
        onSubmit={submit}
        className="flex items-center gap-2 border-t border-slate-200 bg-white p-3"
      >
        <Input
          placeholder={`Message #${cleanTag}…`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          data-testid="input-room-message"
        />
        <Button
          type="submit"
          disabled={!draft.trim() || send.isPending}
          className="bg-violet-600 hover:bg-violet-700"
          data-testid="button-send-room"
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
