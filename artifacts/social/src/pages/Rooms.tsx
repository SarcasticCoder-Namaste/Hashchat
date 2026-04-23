import { Link } from "wouter";
import {
  useGetRooms,
  useGetTrendingRooms,
} from "@workspace/api-client-react";
import { Hash, MessageCircle, Users, Loader2, Sparkles } from "lucide-react";

export default function Rooms() {
  const myRooms = useGetRooms();
  const trending = useGetTrendingRooms({ limit: 10 });

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-6 md:px-8 md:py-10">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Hashtag rooms</h1>
        <p className="mt-1 text-slate-600">
          Live group chats around your favorite topics.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Your rooms</h2>
        {myRooms.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        ) : myRooms.data && myRooms.data.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {myRooms.data.map((r) => (
              <RoomCard key={r.tag} r={r} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-slate-500">
            Pick or follow some hashtags to see rooms here.
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-pink-600" />
          <h2 className="text-lg font-semibold text-slate-900">
            Discover trending rooms
          </h2>
        </div>
        {trending.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {trending.data?.map((r) => <RoomCard key={r.tag} r={r} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function RoomCard({
  r,
}: {
  r: {
    tag: string;
    memberCount: number;
    messageCount: number;
    recentMessages: number;
    lastMessage?: { content: string; senderName: string } | null;
  };
}) {
  return (
    <Link href={`/app/rooms/${encodeURIComponent(r.tag)}`} className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md" data-testid={`room-${r.tag}`}>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 text-white">
            <Hash className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-slate-900">
              #{r.tag}
            </p>
            <p className="flex items-center gap-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" /> {r.memberCount}
              </span>
              <span className="inline-flex items-center gap-1">
                <MessageCircle className="h-3 w-3" /> {r.messageCount}
              </span>
              {r.recentMessages > 0 && (
                <span className="rounded-full bg-pink-100 px-1.5 py-0.5 text-pink-700">
                  {r.recentMessages} new
                </span>
              )}
            </p>
          </div>
        </div>
        {r.lastMessage && (
          <p className="mt-3 line-clamp-2 text-sm text-slate-600">
            <span className="font-medium text-slate-900">
              {r.lastMessage.senderName}:
            </span>{" "}
            {r.lastMessage.content}
          </p>
        )}
      </Link>
  );
}
