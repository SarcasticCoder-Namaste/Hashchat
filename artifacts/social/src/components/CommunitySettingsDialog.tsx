import { type CommunityDetail } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ModerationPanel, ReportsPanel } from "./moderation-panels";

export function CommunitySettingsDialog({
  community,
  open,
  onOpenChange,
}: {
  community: CommunityDetail;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Community settings · {community.name}</DialogTitle>
          <DialogDescription>
            Manage moderators, slow mode, and review reports.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="moderation">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="moderation" data-testid="tab-community-moderation">
              Moderation
            </TabsTrigger>
            <TabsTrigger value="reports" data-testid="tab-community-reports">
              Reports
            </TabsTrigger>
          </TabsList>
          <TabsContent value="moderation" className="space-y-4 pt-4">
            <ModerationPanel
              scopeType="community"
              scopeKey={community.slug}
              canEditSettings={community.canEdit}
              canModerate={community.canModerate}
              slowModeSeconds={community.slowModeSeconds}
            />
          </TabsContent>
          <TabsContent value="reports" className="space-y-3 pt-4">
            <ReportsPanel
              scopeType="community"
              scopeKey={community.slug}
              canModerate={community.canModerate}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
