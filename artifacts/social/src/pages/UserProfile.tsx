import { Link } from "wouter";
import { useGetUser, useGetMe } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PostFeed } from "@/components/PostFeed";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function UserProfile({ id }: { id: string }) {
  const userQ = useGetUser(id);
  const meQ = useGetMe();
  const meId = meQ.data?.id ?? null;
  const u = userQ.data;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-2">
        <Link
          href="/app/discover"
          className="text-muted-foreground hover:text-foreground"
          data-testid="link-back-discover"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <p className="text-sm font-semibold">Profile</p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {userQ.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
          </div>
        ) : !u ? (
          <div className="flex justify-center py-8 text-sm text-muted-foreground">
            User not found.
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-4">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
              <Avatar className="h-16 w-16">
                {u.avatarUrl ? <AvatarImage src={u.avatarUrl} alt={u.displayName} /> : null}
                <AvatarFallback className="bg-primary/15 text-primary">
                  {u.displayName
                    .split(" ")
                    .map((s) => s[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold">{u.displayName}</p>
                <p className="truncate text-sm text-muted-foreground">@{u.username}</p>
              </div>
            </div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Posts
            </h2>
            <PostFeed
              scope={{ kind: "user", userId: id }}
              meId={meId}
              emptyMessage="This user hasn't posted yet."
            />
          </div>
        )}
      </div>
    </div>
  );
}
