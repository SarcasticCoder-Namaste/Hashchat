import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  lookupUserByFriendCode,
  useSendFriendRequest,
  useAcceptFriendRequest,
  useCancelFriendRequest,
  useOpenConversation,
  getDiscoverPeopleQueryKey,
  getGetMyFriendsQueryKey,
  getGetFriendRequestsQueryKey,
  type MatchUser,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PresenceAvatar, UserNameLine } from "@/components/UserBadge";
import { FriendCodeScanDialog } from "@/components/FriendCodeScanDialog";
import {
  Search,
  Hash,
  UserPlus,
  UserCheck,
  Check,
  MessageCircle,
  Loader2,
  X,
  Camera,
} from "lucide-react";

type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; user: MatchUser }
  | { status: "not_found" };

export function FriendCodeSearch({
  variant = "header",
  initialCode,
  autoLookup = false,
}: {
  variant?: "header" | "block";
  initialCode?: string;
  autoLookup?: boolean;
}) {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(initialCode ?? "");
  const [state, setState] = useState<LookupState>({ status: "idle" });
  const [scanOpen, setScanOpen] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getDiscoverPeopleQueryKey() });
    qc.invalidateQueries({ queryKey: getGetMyFriendsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetFriendRequestsQueryKey() });
  };

  const sendReq = useSendFriendRequest({
    mutation: {
      onSuccess: (_d, vars) => {
        invalidate();
        if (state.status === "found" && state.user.id === vars.id) {
          setState({
            status: "found",
            user: { ...state.user, friendStatus: "request_sent" },
          });
        }
      },
    },
  });
  const cancelReq = useCancelFriendRequest({
    mutation: {
      onSuccess: (_d, vars) => {
        invalidate();
        if (state.status === "found" && state.user.id === vars.id) {
          setState({
            status: "found",
            user: { ...state.user, friendStatus: "none" },
          });
        }
      },
    },
  });
  const acceptReq = useAcceptFriendRequest({
    mutation: {
      onSuccess: (_d, vars) => {
        invalidate();
        if (state.status === "found" && state.user.id === vars.id) {
          setState({
            status: "found",
            user: { ...state.user, friendStatus: "friends" },
          });
        }
      },
    },
  });
  const openConv = useOpenConversation({
    mutation: {
      onSuccess: (conv) => {
        setOpen(false);
        setLocation(`/app/messages/${conv.id}`);
      },
    },
  });

  function normalizeForRequest(raw: string): string {
    return raw
      .toUpperCase()
      .replace(/^#/, "")
      .replace(/[^A-Z0-9]/g, "");
  }

  const runLookupFor = useCallback(async (raw: string) => {
    const normalized = raw
      .toUpperCase()
      .replace(/^#/, "")
      .replace(/[^A-Z0-9]/g, "");
    if (!normalized) return;
    setState({ status: "loading" });
    try {
      const user = await lookupUserByFriendCode(
        encodeURIComponent(normalized),
      );
      setState({ status: "found", user });
    } catch {
      setState({ status: "not_found" });
    }
  }, []);

  async function runLookup() {
    await runLookupFor(code);
  }

  function reset() {
    setCode("");
    setState({ status: "idle" });
  }

  function handleScanned(scannedCode: string) {
    setScanOpen(false);
    setCode(scannedCode);
    runLookupFor(scannedCode);
  }

  useEffect(() => {
    if (autoLookup && initialCode && state.status === "idle") {
      runLookupFor(initialCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLookup, initialCode]);

  function renderResult() {
    if (state.status === "loading") {
      return (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      );
    }
    if (state.status === "not_found") {
      return (
        <div
          className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center text-sm text-muted-foreground"
          data-testid="friend-code-not-found"
        >
          No user found for that code.
        </div>
      );
    }
    if (state.status === "found") {
      const u = state.user;
      const fs = u.friendStatus ?? "none";
      const busy =
        sendReq.isPending ||
        cancelReq.isPending ||
        acceptReq.isPending ||
        openConv.isPending;
      return (
        <div
          className="rounded-lg border border-border bg-card p-3"
          data-testid={`friend-code-result-${u.username}`}
        >
          <div className="flex items-center gap-3">
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
              verified={u.verified}
              className="flex-1"
            />
          </div>
          {u.bio && (
            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
              {u.bio}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 min-w-0"
              onClick={() => openConv.mutate({ data: { userId: u.id } })}
              disabled={busy}
              data-testid="friend-code-message"
            >
              <MessageCircle className="mr-1 h-3.5 w-3.5" /> Message
            </Button>
            {fs === "friends" ? (
              <Button
                size="sm"
                variant="secondary"
                disabled
                className="flex-1 min-w-0"
                data-testid="friend-code-status"
              >
                <UserCheck className="mr-1 h-3.5 w-3.5" /> Friends
              </Button>
            ) : fs === "request_sent" ? (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 min-w-0"
                onClick={() => cancelReq.mutate({ id: u.id })}
                disabled={busy}
                data-testid="friend-code-status"
              >
                Requested
              </Button>
            ) : fs === "request_received" ? (
              <Button
                size="sm"
                className="flex-1 min-w-0"
                onClick={() => acceptReq.mutate({ id: u.id })}
                disabled={busy}
                data-testid="friend-code-status"
              >
                <Check className="mr-1 h-3.5 w-3.5" /> Accept
              </Button>
            ) : (
              <Button
                size="sm"
                className="flex-1 min-w-0"
                onClick={() => sendReq.mutate({ id: u.id })}
                disabled={busy}
                data-testid="friend-code-status"
              >
                <UserPlus className="mr-1 h-3.5 w-3.5" /> Add Friend
              </Button>
            )}
          </div>
        </div>
      );
    }
    return (
      <p className="px-1 py-3 text-center text-xs text-muted-foreground">
        Paste a friend code like{" "}
        <span className="font-mono text-foreground">#A7K-92QX</span> to find
        someone.
      </p>
    );
  }

  if (variant === "block") {
    return (
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2 text-sm font-semibold text-foreground">
          <span className="flex items-center gap-1.5">
            <Hash className="h-4 w-4 text-primary" /> Find by friend code
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setScanOpen(true)}
            data-testid="button-friend-code-scan-block"
          >
            <Camera className="mr-1.5 h-3.5 w-3.5" /> Scan QR
          </Button>
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            runLookup();
          }}
        >
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="#A7K-92QX"
            autoComplete="off"
            spellCheck={false}
            className="font-mono uppercase"
            data-testid="input-friend-code-search"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!code.trim() || state.status === "loading"}
            data-testid="button-friend-code-search"
          >
            {state.status === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
          {(state.status === "found" || state.status === "not_found") && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={reset}
              data-testid="button-friend-code-reset"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </form>
        <div className="mt-3">{renderResult()}</div>
        <FriendCodeScanDialog
          open={scanOpen}
          onOpenChange={setScanOpen}
          onDetected={handleScanned}
        />
      </div>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          data-testid="button-open-friend-code-search"
        >
          <Hash className="h-4 w-4" />
          <span className="hidden sm:inline">Find by code</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Find friend by code
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => setScanOpen(true)}
            data-testid="button-friend-code-scan-header"
          >
            <Camera className="mr-1 h-3.5 w-3.5" /> Scan
          </Button>
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            runLookup();
          }}
        >
          <Input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="#A7K-92QX"
            autoComplete="off"
            spellCheck={false}
            className="font-mono uppercase"
            data-testid="input-friend-code-search"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!code.trim() || state.status === "loading"}
            data-testid="button-friend-code-search"
          >
            {state.status === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </form>
        <div className="mt-3">{renderResult()}</div>
      </PopoverContent>
      <FriendCodeScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        onDetected={handleScanned}
      />
    </Popover>
  );
}
