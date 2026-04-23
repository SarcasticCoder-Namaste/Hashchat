import { useState } from "react";
import { useInitiateCall } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { CallModal } from "@/components/CallModal";
import { Phone, Video, Loader2 } from "lucide-react";

export function CallButton({
  conversationId,
  roomTag,
  kind,
  testId,
}: {
  conversationId?: number;
  roomTag?: string;
  kind: "voice" | "video";
  testId: string;
}) {
  const [activeCallId, setActiveCallId] = useState<number | null>(null);
  const initiate = useInitiateCall({
    mutation: {
      onSuccess: (call) => {
        setActiveCallId(call.id);
      },
    },
  });

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={initiate.isPending}
        onClick={() =>
          initiate.mutate({
            data: {
              kind,
              conversationId: conversationId ?? null,
              roomTag: roomTag ?? null,
            },
          })
        }
        data-testid={testId}
        aria-label={`Start ${kind} call`}
      >
        {initiate.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : kind === "video" ? (
          <Video className="h-4 w-4" />
        ) : (
          <Phone className="h-4 w-4" />
        )}
      </Button>
      {activeCallId != null && (
        <CallModal
          callId={activeCallId}
          withVideo={kind === "video"}
          onClose={() => setActiveCallId(null)}
        />
      )}
    </>
  );
}
