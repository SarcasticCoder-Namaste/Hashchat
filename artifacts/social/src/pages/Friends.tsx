import { useLocation } from "wouter";
import {
  useGetMyFriends,
  useGetFriendRequests,
  useAcceptFriendRequest,
  useDeclineFriendRequest,
  useCancelFriendRequest,
  useUnfriend,
  useOpenConversation,
  getGetMyFriendsQueryKey,
  getGetFriendRequestsQueryKey,
  getDiscoverPeopleQueryKey,
  type MatchUser,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Hash,
  MessageCircle,
  UserPlus,
  Check,
  X,
  Loader2,
  UserMinus,
  Users,
} from "lucide-react";

function initialsFor(name: string) {
  return name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function useInvalidateFriends() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: getGetMyFriendsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetFriendRequestsQueryKey() });
    qc.invalidateQueries({ queryKey: getDiscoverPeopleQueryKey() });
  };
}

export default function Friends() {
  const friendsQ = useGetMyFriends({
    query: { queryKey: getGetMyFriendsQueryKey() },
  });
  const reqsQ = useGetFriendRequests({
    query: {
      queryKey: getGetFriendRequestsQueryKey(),
      refetchInterval: 15000,
    },
  });
  const incoming = reqsQ.data?.incoming ?? [];
  const outgoing = reqsQ.data?.outgoing ?? [];
  const friends = friendsQ.data ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <h1 className="text-3xl font-bold text-foreground">Friends</h1>
      <p className="mt-1 text-muted-foreground">
        Send friend requests to people you vibe with on HashChat.
      </p>

      <Tabs defaultValue="friends" className="mt-6">
        <TabsList>
          <TabsTrigger value="friends" data-testid="tab-friends">
            <Users className="mr-1.5 h-4 w-4" />
            Friends ({friends.length})
          </TabsTrigger>
          <TabsTrigger value="incoming" data-testid="tab-incoming">
            <UserPlus className="mr-1.5 h-4 w-4" />
            Requests ({incoming.length})
          </TabsTrigger>
          <TabsTrigger value="outgoing" data-testid="tab-outgoing">
            Sent ({outgoing.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="friends" className="mt-4">
          <UserList
            users={friends}
            loading={friendsQ.isLoading}
            empty="No friends yet — head to Discover and send a request."
            renderActions={(u) => (
              <FriendsActions user={u} />
            )}
          />
        </TabsContent>
        <TabsContent value="incoming" className="mt-4">
          <UserList
            users={incoming}
            loading={reqsQ.isLoading}
            empty="No incoming requests."
            renderActions={(u) => <IncomingActions user={u} />}
          />
        </TabsContent>
        <TabsContent value="outgoing" className="mt-4">
          <UserList
            users={outgoing}
            loading={reqsQ.isLoading}
            empty="You haven't sent any requests."
            renderActions={(u) => <OutgoingActions user={u} />}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UserList({
  users,
  loading,
  empty,
  renderActions,
}: {
  users: MatchUser[];
  loading: boolean;
  empty: string;
  renderActions: (u: MatchUser) => React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
      </div>
    );
  }
  if (users.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground">
        {empty}
      </div>
    );
  }
  return (
    <ul className="overflow-hidden rounded-xl border border-border bg-card">
      {users.map((u, i) => (
        <li
          key={u.id}
          className={[
            "flex items-center gap-3 p-4",
            i > 0 ? "border-t border-border" : "",
          ].join(" ")}
          data-testid={`friend-row-${u.username}`}
        >
          <Avatar className="h-11 w-11">
            {u.avatarUrl ? (
              <AvatarImage src={u.avatarUrl} alt={u.displayName} />
            ) : null}
            <AvatarFallback className="bg-primary/15 text-primary">
              {initialsFor(u.displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-foreground">
                {u.displayName}
              </p>
              {u.featuredHashtag && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
                  <Hash className="h-2.5 w-2.5" />
                  {u.featuredHashtag}
                </span>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              @{u.username}
              {u.sharedHashtags.length > 0 && (
                <> · {u.sharedHashtags.length} shared tags</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1.5">{renderActions(u)}</div>
        </li>
      ))}
    </ul>
  );
}

function FriendsActions({ user }: { user: MatchUser }) {
  const [, setLocation] = useLocation();
  const invalidate = useInvalidateFriends();
  const open = useOpenConversation({
    mutation: {
      onSuccess: (conv) => setLocation(`/app/messages/${conv.id}`),
    },
  });
  const unfriend = useUnfriend({ mutation: { onSuccess: invalidate } });
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => open.mutate({ data: { userId: user.id } })}
        disabled={open.isPending}
        data-testid={`button-message-${user.username}`}
      >
        <MessageCircle className="mr-1 h-3.5 w-3.5" />
        Message
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => unfriend.mutate({ id: user.id })}
        disabled={unfriend.isPending}
        data-testid={`button-unfriend-${user.username}`}
      >
        <UserMinus className="h-3.5 w-3.5" />
      </Button>
    </>
  );
}

function IncomingActions({ user }: { user: MatchUser }) {
  const invalidate = useInvalidateFriends();
  const accept = useAcceptFriendRequest({
    mutation: { onSuccess: invalidate },
  });
  const decline = useDeclineFriendRequest({
    mutation: { onSuccess: invalidate },
  });
  return (
    <>
      <Button
        size="sm"
        onClick={() => accept.mutate({ id: user.id })}
        disabled={accept.isPending}
        data-testid={`button-accept-${user.username}`}
      >
        <Check className="mr-1 h-3.5 w-3.5" />
        Accept
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => decline.mutate({ id: user.id })}
        disabled={decline.isPending}
        data-testid={`button-decline-${user.username}`}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </>
  );
}

function OutgoingActions({ user }: { user: MatchUser }) {
  const invalidate = useInvalidateFriends();
  const cancel = useCancelFriendRequest({
    mutation: { onSuccess: invalidate },
  });
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => cancel.mutate({ id: user.id })}
      disabled={cancel.isPending}
      data-testid={`button-cancel-${user.username}`}
    >
      Cancel request
    </Button>
  );
}

