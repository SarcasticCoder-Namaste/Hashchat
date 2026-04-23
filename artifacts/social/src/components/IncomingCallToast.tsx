import { useState } from "react";
import {
  useGetIncomingCalls,
  useLeaveCall,
  getGetIncomingCallsQueryKey,
  type Call,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { CallModal } from "@/components/CallModal";
import { Phone, PhoneOff, Video } from "lucide-react";

export function IncomingCallToast() {
  const [activeCall, setActiveCall] = useState<{ id: number; withVideo: boolean } | null>(null);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const incoming = useGetIncomingCalls({
    query: { queryKey: getGetIncomingCallsQueryKey(), refetchInterval: 4000 },
  });

  const leave = useLeaveCall();

  const calls = (incoming.data ?? []).filter(
    (c: Call) => !dismissed.has(c.id) && (!activeCall || activeCall.id !== c.id),
  );

  function decline(call: Call) {
    setDismissed((s) => new Set(s).add(call.id));
    leave.mutate({ id: call.id });
  }

  function accept(call: Call) {
    setActiveCall({ id: call.id, withVideo: call.kind === "video" });
  }

  return (
    <>
      <div className="pointer-events-none fixed bottom-6 right-6 z-40 flex flex-col gap-3">
        {calls.map((c: Call) => {
          const initiator = c.participants.find((p) => p.userId === c.initiatorId);
          return (
            <div
              key={c.id}
              className="pointer-events-auto w-80 rounded-xl border border-border bg-card p-4 shadow-lg"
              data-testid={`incoming-call-${c.id}`}
            >
              <div className="flex items-center gap-2">
                {c.kind === "video" ? (
                  <Video className="h-4 w-4 text-primary" />
                ) : (
                  <Phone className="h-4 w-4 text-primary" />
                )}
                <p className="text-sm font-semibold text-foreground">
                  Incoming {c.kind} call
                </p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                from {initiator?.displayName ?? "Someone"}
                {c.roomTag ? ` · #${c.roomTag}` : ""}
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => accept(c)}
                  data-testid={`button-accept-call-${c.id}`}
                >
                  <Phone className="mr-1.5 h-3.5 w-3.5" />
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => decline(c)}
                  data-testid={`button-decline-call-${c.id}`}
                >
                  <PhoneOff className="mr-1.5 h-3.5 w-3.5" />
                  Decline
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      {activeCall && (
        <CallModal
          callId={activeCall.id}
          withVideo={activeCall.withVideo}
          onClose={() => setActiveCall(null)}
        />
      )}
    </>
  );
}
