import { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetMe,
  useGetMyFriends,
  useGetFriendRequests,
  useAcceptFriendRequest,
  useDeclineFriendRequest,
  useCancelFriendRequest,
  useUnfriend,
  useOpenConversation,
  useSendFriendRequest,
  lookupUserByCode,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { PresenceAvatar, UserNameLine } from "@/components/UserBadge";
import {
  MessageCircle,
  UserPlus,
  Check,
  X,
  Loader2,
  UserMinus,
  Users,
  Search,
  Copy,
  Hash,
  Sparkles,
} from "lucide-react";

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
  const meQ = useGetMe();
  const me = meQ.data;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <h1 className="text-3xl font-bold text-foreground">Friends</h1>
      <p className="mt-1 text-muted-foreground">
        Send friend requests to people you vibe with on HashChat.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {me && <YourCodeCard username={me.username} discriminator={me.discriminator ?? null} />}
        <FindByCodeCard />
      </div>

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
        <motion.li
          key={u.id}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.03, duration: 0.2 }}
          className={[
            "flex items-center gap-3 p-4",
            i > 0 ? "border-t border-border" : "",
          ].join(" ")}
          data-testid={`friend-row-${u.username}`}
        >
          <PresenceAvatar
            displayName={u.displayName}
            avatarUrl={u.avatarUrl}
            lastSeenAt={u.lastSeenAt}
          />
          <UserNameLine
            displayName={u.displayName}
            username={u.username}
            discriminator={u.discriminator}
            role={u.role}
            mvpPlan={u.mvpPlan}
            featuredHashtag={u.featuredHashtag}
            className="flex-1"
          />
          <div className="flex items-center gap-1.5">{renderActions(u)}</div>
        </motion.li>
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


function YourCodeCard({ username, discriminator }: { username: string; discriminator: string | null }) {
  const { toast } = useToast();
  const code = `${username}${discriminator ? `#${discriminator}` : ""}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast({ title: "Copied!", description: "Friend code copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Sparkles className="h-4 w-4" />
        Your friend code
      </div>
      <div className="mt-2 flex items-center gap-2">
        <code
          data-testid="text-my-friend-code"
          className="flex-1 truncate rounded-lg bg-muted px-3 py-2 font-mono text-sm"
        >
          {code}
        </code>
        <Button
          size="sm"
          variant="secondary"
          onClick={copy}
          data-testid="button-copy-code"
        >
          <Copy className="mr-1.5 h-4 w-4" />
          Copy
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Share this so friends can find you instantly.
      </p>
    </div>
  );
}

function FindByCodeCard() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<MatchUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const sendReq = useSendFriendRequest();
  const invalidate = useInvalidateFriends();
  const { toast } = useToast();

  const search = async () => {
    const q = code.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const user = await lookupUserByCode({ code: q });
      setResult(user);
    } catch (e) {
      const data = (e as { data?: { error?: string } })?.data;
      const status = (e as { status?: number })?.status;
      const msg =
        data?.error ??
        (status === 404 ? "No user found with that code" : "Search failed — try again");
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const add = async () => {
    if (!result) return;
    try {
      await sendReq.mutateAsync({ id: result.id });
      toast({ title: "Request sent!", description: `Friend request sent to ${result.displayName ?? result.username}.` });
      invalidate();
      setResult({ ...result, friendStatus: "request_sent" });
    } catch {
      toast({ title: "Could not send request", variant: "destructive" });
    }
  };

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Hash className="h-4 w-4" />
        Add by friend code
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
        className="mt-2 flex items-center gap-2"
      >
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="username#1234"
          data-testid="input-friend-code"
          className="font-mono text-sm"
        />
        <Button
          type="submit"
          size="sm"
          disabled={loading || !code.trim()}
          data-testid="button-search-code"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </form>
      {error && (
        <p className="mt-2 text-xs text-destructive" data-testid="text-search-error">
          {error}
        </p>
      )}
      {result && (
        <div
          className="mt-3 flex items-center gap-3 rounded-lg border bg-muted/40 p-2"
          data-testid="card-search-result"
        >
          <PresenceAvatar
            displayName={result.displayName ?? result.username}
            avatarUrl={result.avatarUrl ?? null}
            lastSeenAt={result.lastSeenAt ?? null}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <UserNameLine
              displayName={result.displayName ?? result.username}
              username={result.username}
              discriminator={result.discriminator ?? null}
              role={result.role ?? null}
              mvpPlan={result.mvpPlan ?? null}
              featuredHashtag={result.featuredHashtag ?? null}
              showHandle={false}
            />
            <div className="truncate text-xs text-muted-foreground font-mono">
              @{result.username}
              {result.discriminator ? `#${result.discriminator}` : ""}
            </div>
          </div>
          {result.friendStatus === "friends" ? (
            <span className="text-xs text-muted-foreground">Already friends</span>
          ) : result.friendStatus === "request_sent" ? (
            <span className="text-xs text-muted-foreground">Request sent</span>
          ) : result.friendStatus === "request_received" ? (
            <span className="text-xs text-muted-foreground">Check Requests tab</span>
          ) : (
            <Button
              size="sm"
              onClick={add}
              disabled={sendReq.isPending}
              data-testid="button-add-result"
            >
              <UserPlus className="mr-1.5 h-4 w-4" />
              Add
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
