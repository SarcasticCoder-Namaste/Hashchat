import { useEffect, useMemo, useState } from "react";
import { useClerk } from "@clerk/react";
import {
  useGetMe,
  useUpdateMe,
  useSetMyHashtags,
  useGetHashtagSuggestions,
  useRedeemMvpCode,
  useGetConversations,
  useGetMyFriends,
  useGetMyFollowedHashtags,
  useGetMyPhotos,
  useGetMyFriendCode,
  useRegenerateMyFriendCode,
  useGetMyBlocksAndMutes,
  useUnblockUser,
  useUnmuteUser,
  useMuteHashtag,
  useUnmuteHashtag,
  getGetMeQueryKey,
  getGetMyFriendCodeQueryKey,
  getGetMyBlocksAndMutesQueryKey,
  getGetMyRelationshipsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Kbd } from "@/components/ui/kbd";
import { ProfileGallery } from "@/components/ProfileGallery";
import { useToast } from "@/hooks/use-toast";
import { PREF_KEYS, usePref } from "@/lib/preferences";
import { useTranslation, SUPPORTED_LOCALES } from "@/lib/i18n";
import {
  getReducedMotionPref,
  setReducedMotionPref,
} from "@/hooks/useReducedMotion";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Hash,
  Loader2,
  Save,
  User as UserIcon,
  Palette,
  LogOut,
  Sparkles,
  Check,
  ImageIcon,
  Bell,
  Lock,
  MessageSquare,
  Link2,
  Keyboard,
  MessageCircle,
  Users,
  Image as ImageLucide,
  AlertTriangle,
  MapPin,
  Globe,
  Smile,
  Camera,
  Circle,
  Ban,
  EyeOff,
  ShieldOff,
  QrCode,
  Search,
} from "lucide-react";
import { ImageUploadButton } from "@/components/ImageUploadButton";
import { FriendCodeQRDialog } from "@/components/FriendCodeQRDialog";
import { WalletConnectSection } from "@/components/WalletConnectSection";
import { Wallet as WalletIcon } from "lucide-react";
import {
  ACCENTS,
  applyAccentToDocument,
  readStoredAccent,
} from "@/lib/serverPreferences";
import { useTier } from "@/hooks/useTier";
import {
  subscribeToPush,
  unsubscribeFromPush,
  isPushSupported,
} from "@/lib/pushSubscription";
import {
  useGetMyPreferences,
  useUpdateMyPreferences,
} from "@workspace/api-client-react";
import {
  BANNER_PRESETS,
  AVATAR_EMOJIS,
  bannerPresetToUrl,
  avatarPresetToUrl,
} from "@/lib/avatarPresets";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Settings() {
  const qc = useQueryClient();
  const { signOut } = useClerk();
  const { data: me, isLoading } = useGetMe();
  const { data: suggested } = useGetHashtagSuggestions();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [statusEmoji, setStatusEmoji] = useState("");
  const [statusText, setStatusText] = useState("");
  const [presence, setPresence] = useState("online");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [featuredHashtag, setFeaturedHashtag] = useState<string | null>(null);
  const [custom, setCustom] = useState("");

  useEffect(() => {
    if (me) {
      setDisplayName(me.displayName);
      setBio(me.bio ?? "");
      setPronouns(me.pronouns ?? "");
      setLocation(me.location ?? "");
      setWebsite(me.website ?? "");
      setStatusEmoji(me.statusEmoji ?? "");
      setStatusText(me.statusText ?? "");
      setPresence(me.status ?? "online");
      setAvatarUrl(me.avatarUrl ?? null);
      setBannerUrl(me.bannerUrl ?? null);
      setHashtags(me.hashtags);
      setFeaturedHashtag(me.featuredHashtag ?? null);
    }
  }, [me]);

  const update = useUpdateMe({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetMeQueryKey() }),
    },
  });
  const setMine = useSetMyHashtags({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetMeQueryKey() }),
    },
  });

  const allTags = useMemo(
    () =>
      Array.from(
        new Set([
          ...(suggested?.map((h) => h.tag) ?? []),
          ...hashtags,
        ]),
      ),
    [suggested, hashtags],
  );

  if (isLoading || !me) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
      </div>
    );
  }

  function toggle(tag: string) {
    setHashtags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
    if (featuredHashtag === tag && hashtags.includes(tag)) {
      // if removing, also clear featured if it was set
      setFeaturedHashtag(null);
    }
  }

  function addCustom() {
    const tag = custom
      .trim()
      .toLowerCase()
      .replace(/^#/, "")
      .replace(/\s+/g, "");
    if (!tag) return;
    if (!hashtags.includes(tag)) setHashtags((p) => [...p, tag]);
    setCustom("");
  }

  const initials = me.displayName
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div
          className="relative h-32 w-full bg-gradient-to-br from-violet-500/30 via-fuchsia-500/20 to-pink-500/30 md:h-40"
          style={
            bannerUrl
              ? {
                  backgroundImage: `url(${bannerUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
          data-testid="profile-banner"
        />
        <div className="relative px-4 pb-4 pt-0 md:px-6 md:pb-6">
          <div className="-mt-10 flex items-end gap-4 md:-mt-12">
            <div className="relative">
              <Avatar className="h-20 w-20 ring-4 ring-card md:h-24 md:w-24">
                {avatarUrl ? (
                  <AvatarImage src={avatarUrl} alt={me.displayName} />
                ) : null}
                <AvatarFallback className="bg-primary/15 text-2xl text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span
                className={[
                  "absolute bottom-1 right-1 h-4 w-4 rounded-full ring-2 ring-card",
                  presence === "online"
                    ? "bg-emerald-500"
                    : presence === "away"
                    ? "bg-amber-500"
                    : presence === "busy"
                    ? "bg-rose-500"
                    : "bg-muted-foreground/40",
                ].join(" ")}
                aria-label={`Status: ${presence}`}
                data-testid="profile-presence-dot"
              />
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-bold text-foreground">
                  {me.displayName}
                </h1>
                {me.featuredHashtag && (
                  <span
                    className="inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r from-violet-500/20 to-pink-500/20 px-2 py-0.5 text-xs font-semibold text-foreground"
                    data-testid="profile-featured-hashtag"
                  >
                    <Hash className="h-3 w-3" />
                    {me.featuredHashtag}
                  </span>
                )}
                {me.pronouns && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {me.pronouns}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                @{me.username}
                {me.discriminator && (
                  <span className="ml-1 text-muted-foreground/70">
                    #{me.discriminator}
                  </span>
                )}
              </p>
            </div>
          </div>
          {(me.statusEmoji || me.statusText) && (
            <div
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm text-foreground"
              data-testid="profile-custom-status"
            >
              {me.statusEmoji && <span>{me.statusEmoji}</span>}
              {me.statusText && <span>{me.statusText}</span>}
            </div>
          )}
          {me.bio && (
            <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm text-foreground/90">
              {me.bio}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {me.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {me.location}
              </span>
            )}
            {me.website && (
              <a
                href={me.website.startsWith("http") ? me.website : `https://${me.website}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
                data-testid="profile-website"
              >
                <Globe className="h-3 w-3" /> {me.website.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>
          {(me.role === "admin" ||
            me.role === "moderator" ||
            me.mvpPlan) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {me.role === "admin" && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                  Admin
                </span>
              )}
              {me.role === "moderator" && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300">
                  Moderator
                </span>
              )}
              {me.mvpPlan && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r from-violet-500/30 to-pink-500/30 px-2 py-0.5 text-[10px] font-semibold text-foreground">
                  <Sparkles className="h-2.5 w-2.5" /> MVP
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <FriendCodeCard />

      <Tabs defaultValue="profile">
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1 p-1 sm:grid-cols-10">
          <TabsTrigger
            value="profile"
            data-testid="tab-profile"
            className="flex flex-col items-center gap-1 px-1 py-2 text-[11px] sm:flex-row sm:gap-1.5 sm:text-xs"
          >
            <UserIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">Profile</span>
          </TabsTrigger>
          <TabsTrigger
            value="hashtags"
            data-testid="tab-hashtags"
            className="flex flex-col items-center gap-1 px-1 py-2 text-[11px] sm:flex-row sm:gap-1.5 sm:text-xs"
          >
            <Hash className="h-4 w-4 shrink-0" />
            <span className="truncate">Tags</span>
          </TabsTrigger>
          <TabsTrigger
            value="appearance"
            data-testid="tab-appearance"
            className="flex flex-col items-center gap-1 px-1 py-2 text-[11px] sm:flex-row sm:gap-1.5 sm:text-xs"
          >
            <Palette className="h-4 w-4 shrink-0" />
            <span className="truncate">Theme</span>
          </TabsTrigger>
          <TabsTrigger
            value="notifications"
            data-testid="tab-notifications"
            className="flex flex-col items-center gap-1 px-1 py-2 text-[11px] sm:flex-row sm:gap-1.5 sm:text-xs"
          >
            <Bell className="h-4 w-4 shrink-0" />
            <span className="truncate">Alerts</span>
          </TabsTrigger>
          <TabsTrigger
            value="privacy"
            data-testid="tab-privacy"
            className="flex flex-col items-center gap-1 px-1 py-2 text-[11px] sm:flex-row sm:gap-1.5 sm:text-xs"
          >
            <Lock className="h-4 w-4 shrink-0" />
            <span className="truncate">Privacy</span>
          </TabsTrigger>
          <TabsTrigger
            value="blocks"
            data-testid="tab-blocks"
            className="flex flex-col items-center gap-1 px-1 py-2 text-[11px] sm:flex-row sm:gap-1.5 sm:text-xs"
          >
            <ShieldOff className="h-4 w-4 shrink-0" />
            <span className="truncate">Blocks</span>
          </TabsTrigger>
          <TabsTrigger
            value="chat"
            data-testid="tab-chat"
            className="flex flex-col items-center gap-1 px-1 py-2 text-[11px] sm:flex-row sm:gap-1.5 sm:text-xs"
          >
            <MessageSquare className="h-4 w-4 shrink-0" />
            <span className="truncate">Chat</span>
          </TabsTrigger>
          <TabsTrigger
            value="gallery"
            data-testid="tab-gallery"
            className="flex flex-col items-center gap-1 px-1 py-2 text-[11px] sm:flex-row sm:gap-1.5 sm:text-xs"
          >
            <ImageIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">Photos</span>
          </TabsTrigger>
          <TabsTrigger
            value="wallets"
            data-testid="tab-wallets"
            className="flex flex-col items-center gap-1 px-1 py-2 text-[11px] sm:flex-row sm:gap-1.5 sm:text-xs"
          >
            <WalletIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">Wallets</span>
          </TabsTrigger>
          <TabsTrigger
            value="account"
            data-testid="tab-account"
            className="flex flex-col items-center gap-1 px-1 py-2 text-[11px] sm:flex-row sm:gap-1.5 sm:text-xs"
          >
            <UserIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">Account</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="profile"
          className="mt-4 space-y-5 rounded-xl border border-border bg-card p-5 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-foreground">
            Public profile
          </h2>

          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between gap-2">
              <Label className="flex items-center gap-1.5">
                <ImageLucide className="h-3.5 w-3.5 text-primary" /> Banner
              </Label>
              <div className="flex items-center gap-1">
                <ImageUploadButton
                  testId="button-upload-banner"
                  onUploaded={(url) => setBannerUrl(url)}
                />
                {bannerUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setBannerUrl(null)}
                    data-testid="button-clear-banner"
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
            <div
              className="h-24 w-full overflow-hidden rounded-lg border border-border bg-gradient-to-br from-violet-500/30 via-fuchsia-500/20 to-pink-500/30"
              style={
                bannerUrl
                  ? {
                      backgroundImage: `url(${bannerUrl})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }
                  : undefined
              }
              data-testid="banner-preview"
            />
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                Pick a preset gradient
              </p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                {BANNER_PRESETS.map((p) => {
                  const url = bannerPresetToUrl(p);
                  const active = bannerUrl === url;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setBannerUrl(url)}
                      className={[
                        "relative h-10 overflow-hidden rounded-md ring-offset-2 ring-offset-card transition",
                        active ? "ring-2 ring-primary" : "ring-1 ring-border hover:ring-foreground/30",
                      ].join(" ")}
                      style={{
                        background: `linear-gradient(135deg, ${p.from}, ${p.to})`,
                      }}
                      title={p.name}
                      aria-label={`Banner preset ${p.name}`}
                      data-testid={`banner-preset-${p.id}`}
                    >
                      {active && (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <Check className="h-4 w-4 text-white drop-shadow" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between gap-2">
              <Label className="flex items-center gap-1.5">
                <Camera className="h-3.5 w-3.5 text-primary" /> Avatar
              </Label>
              <div className="flex items-center gap-1">
                <ImageUploadButton
                  testId="button-upload-avatar"
                  onUploaded={(url) => setAvatarUrl(url)}
                />
                {avatarUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setAvatarUrl(null)}
                    data-testid="button-clear-avatar"
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                {avatarUrl ? (
                  <AvatarImage src={avatarUrl} alt={displayName} />
                ) : null}
                <AvatarFallback className="bg-primary/15 text-lg text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <p className="text-xs text-muted-foreground">
                Upload your own photo or pick a fun emoji avatar from the
                presets below.
              </p>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                Emoji avatars
              </p>
              <div className="grid grid-cols-8 gap-2">
                {AVATAR_EMOJIS.map((emoji, idx) => {
                  const preset = BANNER_PRESETS[idx % BANNER_PRESETS.length];
                  const url = avatarPresetToUrl(emoji, preset);
                  const active = avatarUrl === url;
                  return (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setAvatarUrl(url)}
                      className={[
                        "relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full text-2xl ring-offset-2 ring-offset-card transition",
                        active ? "ring-2 ring-primary" : "ring-1 ring-border hover:ring-foreground/30",
                      ].join(" ")}
                      style={{
                        background: `linear-gradient(135deg, ${preset.from}, ${preset.to})`,
                      }}
                      title={emoji}
                      aria-label={`Emoji avatar ${emoji}`}
                      data-testid={`avatar-preset-${emoji}`}
                    >
                      <span className="leading-none">{emoji}</span>
                      {active && (
                        <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="h-2.5 w-2.5" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={50}
                data-testid="input-display-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pronouns">Pronouns</Label>
              <Input
                id="pronouns"
                value={pronouns}
                onChange={(e) => setPronouns(e.target.value)}
                placeholder="she/her, he/him, they/them…"
                maxLength={32}
                data-testid="input-pronouns"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell people what you're into…"
              rows={3}
              maxLength={300}
              data-testid="input-bio"
            />
            <p className="text-right text-xs text-muted-foreground/70">
              {bio.length}/300
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="location" className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-primary" /> Location
              </Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Earth"
                maxLength={64}
                data-testid="input-location"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website" className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-primary" /> Website
              </Label>
              <Input
                id="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://example.com"
                maxLength={200}
                data-testid="input-website"
              />
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
            <Label className="flex items-center gap-1.5">
              <Smile className="h-3.5 w-3.5 text-primary" /> Custom status
            </Label>
            <p className="text-xs text-muted-foreground">
              A short message that appears next to your name across the app.
            </p>
            <div className="flex items-stretch gap-2">
              <Input
                value={statusEmoji}
                onChange={(e) => setStatusEmoji(e.target.value.slice(0, 4))}
                placeholder="😎"
                className="w-16 text-center text-lg"
                data-testid="input-status-emoji"
              />
              <Input
                value={statusText}
                onChange={(e) => setStatusText(e.target.value)}
                placeholder="What are you up to?"
                maxLength={80}
                className="flex-1"
                data-testid="input-status-text"
              />
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[
                { e: "🌴", t: "On vacation" },
                { e: "💻", t: "Heads down coding" },
                { e: "🎧", t: "In the zone" },
                { e: "☕", t: "Coffee break" },
                { e: "🌙", t: "Sleeping" },
                { e: "🎮", t: "Gaming" },
              ].map((p) => (
                <button
                  key={p.t}
                  type="button"
                  onClick={() => {
                    setStatusEmoji(p.e);
                    setStatusText(p.t);
                  }}
                  className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground hover:bg-accent"
                  data-testid={`preset-status-${p.t.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {p.e} {p.t}
                </button>
              ))}
              {(statusEmoji || statusText) && (
                <button
                  type="button"
                  onClick={() => {
                    setStatusEmoji("");
                    setStatusText("");
                  }}
                  className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent"
                  data-testid="button-clear-status"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Circle className="h-3.5 w-3.5 text-primary" /> Presence
            </Label>
            <div className="flex flex-wrap gap-2">
              {[
                { v: "online", label: "Online", dot: "bg-emerald-500" },
                { v: "away", label: "Away", dot: "bg-amber-500" },
                { v: "busy", label: "Do not disturb", dot: "bg-rose-500" },
                { v: "invisible", label: "Invisible", dot: "bg-muted-foreground/40" },
              ].map((p) => {
                const active = presence === p.v;
                return (
                  <button
                    key={p.v}
                    type="button"
                    onClick={() => setPresence(p.v)}
                    className={[
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:bg-accent",
                    ].join(" ")}
                    data-testid={`presence-${p.v}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${p.dot}`} />
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Featured hashtag
            </Label>
            <p className="text-xs text-muted-foreground">
              Pick one of your tags to show next to your name across HashChat.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setFeaturedHashtag(null)}
                data-testid="featured-none"
                className={[
                  "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium",
                  featuredHashtag === null
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-accent",
                ].join(" ")}
              >
                None
              </button>
              {hashtags.map((t) => {
                const active = featuredHashtag === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFeaturedHashtag(t)}
                    data-testid={`featured-${t}`}
                    className={[
                      "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-foreground hover:bg-accent",
                    ].join(" ")}
                  >
                    <Hash className="h-3 w-3" />
                    {t}
                    {active && <Check className="ml-0.5 h-3 w-3" />}
                  </button>
                );
              })}
              {hashtags.length === 0 && (
                <p className="text-xs text-muted-foreground/70">
                  Add some hashtags first.
                </p>
              )}
            </div>
          </div>
          <Button
            onClick={() =>
              update.mutate({
                data: {
                  displayName,
                  bio: bio || null,
                  pronouns: pronouns || null,
                  location: location || null,
                  website: website || null,
                  statusEmoji: statusEmoji || null,
                  statusText: statusText || null,
                  status: presence,
                  avatarUrl: avatarUrl,
                  bannerUrl: bannerUrl,
                  featuredHashtag: featuredHashtag,
                },
              })
            }
            disabled={update.isPending}
            data-testid="button-save-profile"
          >
            {update.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save profile
          </Button>
          {update.isSuccess && (
            <p className="text-xs text-emerald-500">Saved!</p>
          )}
        </TabsContent>

        <TabsContent
          value="hashtags"
          className="mt-4 space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-foreground">My hashtags</h2>
          <p className="text-sm text-muted-foreground">
            {hashtags.length} selected — these power your matches and rooms.
          </p>
          <div className="flex flex-wrap gap-2">
            {allTags.map((tag) => {
              const active = hashtags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggle(tag)}
                  data-testid={`profile-tag-${tag}`}
                  className={[
                    "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:bg-accent",
                  ].join(" ")}
                >
                  <Hash className="h-3 w-3" /> {tag}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Add your own…"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
              }}
              data-testid="input-profile-tag"
            />
            <Button
              variant="outline"
              onClick={addCustom}
              data-testid="button-add-profile-tag"
            >
              Add
            </Button>
          </div>
          <Button
            onClick={() => setMine.mutate({ data: { hashtags } })}
            disabled={setMine.isPending || hashtags.length === 0}
            data-testid="button-save-tags"
          >
            {setMine.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Save hashtags
          </Button>
          {setMine.isSuccess && (
            <p className="text-xs text-emerald-500">Saved!</p>
          )}
        </TabsContent>

        <TabsContent value="appearance" className="mt-4">
          <AppearanceTab />
        </TabsContent>

        <TabsContent value="notifications" className="mt-4">
          <NotificationsTab />
        </TabsContent>

        <TabsContent value="privacy" className="mt-4">
          <PrivacyTab />
        </TabsContent>

        <TabsContent value="blocks" className="mt-4">
          <BlocksMutesTab />
        </TabsContent>

        <TabsContent value="chat" className="mt-4">
          <ChatPrefsTab />
        </TabsContent>

        <TabsContent value="gallery" className="mt-4">
          <ProfileGallery />
        </TabsContent>

        <TabsContent value="wallets" className="mt-4">
          <WalletConnectSection />
        </TabsContent>

        <TabsContent value="account" className="mt-4 space-y-4">
          <AccountTab
            username={me.username}
            discriminator={me.discriminator}
            createdAt={me.createdAt}
            mvpPlan={me.mvpPlan}
            onSignOut={() => signOut({ redirectUrl: basePath || "/" })}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MvpRedeemSection({ isMvp }: { isMvp: boolean }) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const redeem = useRedeemMvpCode({
    mutation: {
      onSuccess: () => {
        setMsg("MVP unlocked! 🎉");
        setCode("");
        qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      },
      onError: (err: unknown) => {
        const e = err as { status?: number };
        if (e?.status === 409) setMsg("That code has already been used.");
        else if (e?.status === 404) setMsg("That code isn't valid.");
        else setMsg("Couldn't redeem. Try again.");
      },
    },
  });

  if (isMvp) {
    return (
      <div className="rounded-lg border border-primary/30 bg-gradient-to-r from-violet-500/10 to-pink-500/10 p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> MVP plan active
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Thanks for being a HashChat MVP.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <p className="text-sm font-semibold text-foreground">
        Have an MVP code?
      </p>
      <p className="text-xs text-muted-foreground">
        Redeem it to unlock your MVP badge across HashChat.
      </p>
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setMsg(null);
          }}
          placeholder="Paste your code"
          data-testid="input-mvp-code"
        />
        <Button
          onClick={() =>
            redeem.mutate({ data: { code: code.trim() } })
          }
          disabled={!code.trim() || redeem.isPending}
          data-testid="button-redeem-mvp"
        >
          {redeem.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Redeem
        </Button>
      </div>
      {msg && (
        <p
          className="text-xs text-muted-foreground"
          data-testid="mvp-redeem-msg"
        >
          {msg}
        </p>
      )}
    </div>
  );
}

function AppearanceTab() {
  const { theme, setTheme, themes } = useTheme();
  const [accent, setAccent] = useState<string>(() => readStoredAccent());
  const updatePrefs = useUpdateMyPreferences();
  const { isPremium } = useTier();

  function chooseAccent(id: string) {
    // Custom accent colors are a Premium perk; the "default" swatch stays
    // available to everyone so free users have a working accent.
    if (id !== "default" && !isPremium) return;
    setAccent(id);
    applyAccentToDocument(id);
    updatePrefs.mutate({ data: { accent: id } });
  }

  function chooseTheme(id: typeof theme) {
    setTheme(id);
    updatePrefs.mutate({ data: { theme: id } });
  }

  return (
    <div className="space-y-6 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Appearance</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Pick a theme and an accent color. Synced across your devices.
          </p>
        </div>
        <span className="hidden rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground sm:inline-block">
          {themes.length} themes
        </span>
      </div>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Accent color
        </h3>
        <div className="flex flex-wrap gap-2" data-testid="accent-grid">
          {ACCENTS.map((a) => {
            const active = accent === a.id;
            const locked = a.id !== "default" && !isPremium;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => chooseAccent(a.id)}
                data-testid={`accent-${a.id}`}
                aria-label={a.label}
                title={locked ? `${a.label} (Premium)` : a.label}
                disabled={locked}
                className={[
                  "relative h-9 w-9 overflow-hidden rounded-full border-2 transition-all",
                  active
                    ? "border-foreground ring-2 ring-primary/40"
                    : "border-border hover:scale-105",
                  locked ? "opacity-40 grayscale cursor-not-allowed hover:scale-100" : "",
                ].join(" ")}
                style={{ background: a.swatch }}
              >
                {active && (
                  <Check className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow" />
                )}
              </button>
            );
          })}
        </div>
        {!isPremium && (
          <p className="mt-2 text-xs text-muted-foreground" data-testid="accent-premium-hint">
            Custom accent colors are a Premium perk.{" "}
            <a href={`${basePath}/premium`} className="font-medium text-primary hover:underline">
              Upgrade to unlock
            </a>
            .
          </p>
        )}
      </section>

      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Theme
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {themes.map((t) => {
          const active = theme === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              data-testid={`appearance-${t.id}`}
              className={[
                "group relative flex items-center gap-3 overflow-hidden rounded-xl border p-3 text-left transition-all",
                active
                  ? "border-primary bg-primary/5 ring-2 ring-primary/40"
                  : "border-border hover:bg-accent/50",
              ].join(" ")}
            >
              <div
                className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border shadow-inner"
                style={{ background: t.swatch.bg }}
              >
                <span
                  className="absolute bottom-1.5 left-1.5 h-3.5 w-3.5 rounded-full border border-white/20"
                  style={{ background: t.swatch.primary }}
                />
                <span
                  className="absolute bottom-1.5 left-6 h-3.5 w-3.5 rounded-full border border-white/20"
                  style={{ background: t.swatch.accent }}
                />
                <span
                  className="absolute right-1 top-1 rounded-sm px-1 py-0.5 text-[8px] font-bold uppercase"
                  style={{
                    background: t.isDark ? "rgba(255,255,255,.12)" : "rgba(0,0,0,.08)",
                    color: t.isDark ? "rgba(255,255,255,.85)" : "rgba(0,0,0,.6)",
                  }}
                >
                  {t.isDark ? "Dark" : "Light"}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {t.label}
                  </span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {t.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <LanguageAndMotionSection />
    </div>
  );
}

function LanguageAndMotionSection() {
  const { locale, setLocale, t } = useTranslation();
  const [motionPref, setMotionPrefState] = useState<"system" | "always">(
    () => getReducedMotionPref(),
  );
  return (
    <section className="space-y-4 border-t border-border pt-5">
      <div>
        <h3 className="mb-1 text-sm font-semibold text-foreground">
          {t("settings.language")}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t("settings.languageDescription")}
        </p>
        <div className="mt-2">
          <Select
            value={locale}
            onValueChange={(v) => setLocale(v as "en" | "es")}
          >
            <SelectTrigger
              className="w-full sm:w-72"
              data-testid="select-language"
              aria-label={t("settings.language")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_LOCALES.map((l) => (
                <SelectItem
                  key={l.code}
                  value={l.code}
                  data-testid={`option-language-${l.code}`}
                >
                  {t(l.nameKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <h3 className="mb-1 text-sm font-semibold text-foreground">
          {t("settings.reducedMotion")}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t("settings.reducedMotionDescription")}
        </p>
        <div className="mt-2">
          <Select
            value={motionPref}
            onValueChange={(v) => {
              const next = v as "system" | "always";
              setMotionPrefState(next);
              setReducedMotionPref(next);
            }}
          >
            <SelectTrigger
              className="w-full sm:w-72"
              data-testid="select-reduced-motion"
              aria-label={t("settings.reducedMotion")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system" data-testid="option-motion-system">
                {t("settings.followSystem")}
              </SelectItem>
              <SelectItem value="always" data-testid="option-motion-always">
                {t("settings.alwaysOn")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </section>
  );
}

function PrefRow({
  title,
  description,
  checked,
  onCheckedChange,
  testId,
  disabled,
  badge,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  testId: string;
  disabled?: boolean;
  badge?: string;
}) {
  const id = `pref-${testId}`;
  const descId = `${id}-desc`;
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-border bg-background/40 p-3 hover:bg-accent/30"
    >
      <div className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          {title}
          {badge && (
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-foreground">
              {badge}
            </span>
          )}
        </span>
        <span
          id={descId}
          className="mt-0.5 block text-xs text-muted-foreground"
        >
          {description}
        </span>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={title}
        aria-describedby={descId}
        data-testid={testId}
      />
    </label>
  );
}

function NotificationsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [sound, setSound] = usePref<boolean>(PREF_KEYS.notifSound, true);
  const { data: prefs, isLoading } = useGetMyPreferences();
  const updatePrefs = useUpdateMyPreferences({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/me/preferences"] }),
    },
  });
  const [busy, setBusy] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported",
  );
  const pushSupported = isPushSupported();

  function setPref(field: string, value: boolean) {
    updatePrefs.mutate({ data: { [field]: value } as any });
  }

  async function enablePush() {
    setBusy(true);
    try {
      const result = await subscribeToPush();
      if (!result.ok) {
        toast({
          title: "Couldn't enable push",
          description: result.message ?? "Unknown error",
          variant: "destructive",
        });
        return;
      }
      setPerm("granted");
      qc.invalidateQueries({ queryKey: ["/api/me/preferences"] });
      toast({ title: "Push notifications on", description: "We'll ping this device." });
    } finally {
      setBusy(false);
    }
  }

  async function disablePush() {
    setBusy(true);
    try {
      await unsubscribeFromPush();
      qc.invalidateQueries({ queryKey: ["/api/me/preferences"] });
      toast({ title: "Push notifications off" });
    } finally {
      setBusy(false);
    }
  }

  if (isLoading || !prefs) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading notification settings…
        </div>
      </div>
    );
  }

  const pushOn = prefs.pushEnabled && perm === "granted";

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Notifications</h2>
        <p className="text-sm text-muted-foreground">
          Choose what nudges you and how. Synced across your devices.
        </p>
      </div>

      <div className="rounded-lg border border-primary/30 bg-gradient-to-r from-violet-500/10 to-pink-500/10 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Bell className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Browser push</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {!pushSupported
                ? "Not supported in this browser."
                : pushOn
                  ? `Enabled on ${prefs.pushSubscriptionCount} device${prefs.pushSubscriptionCount === 1 ? "" : "s"}.`
                  : perm === "denied"
                    ? "Blocked — update your browser site settings to allow."
                    : "Off on this device."}
            </p>
          </div>
          {pushSupported &&
            (pushOn ? (
              <Button
                size="sm"
                variant="outline"
                onClick={disablePush}
                disabled={busy}
                data-testid="button-push-disable"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Disable"}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={enablePush}
                disabled={busy || perm === "denied"}
                data-testid="button-push-enable"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Enable"}
              </Button>
            ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Email
          {!prefs.emailEnabled && (
            <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal normal-case text-muted-foreground">
              Add an email in your account to enable
            </span>
          )}
        </h3>
        <div className="space-y-2">
          <PrefRow
            title="Mentions"
            description="Email me when someone @mentions me."
            checked={prefs.emailMentions}
            onCheckedChange={(v) => setPref("emailMentions", v)}
            disabled={!prefs.emailEnabled}
            testId="switch-email-mentions"
          />
          <PrefRow
            title="Replies"
            description="Email me when someone replies to my messages or threads."
            checked={prefs.emailReplies}
            onCheckedChange={(v) => setPref("emailReplies", v)}
            disabled={!prefs.emailEnabled}
            testId="switch-email-replies"
          />
          <PrefRow
            title="Direct messages"
            description="Email me when I get a new DM."
            checked={prefs.emailDms}
            onCheckedChange={(v) => setPref("emailDms", v)}
            disabled={!prefs.emailEnabled}
            testId="switch-email-dms"
          />
          <PrefRow
            title="Follows & friend requests"
            description="Email me when someone follows me or sends a friend request."
            checked={prefs.emailFollows}
            onCheckedChange={(v) => setPref("emailFollows", v)}
            disabled={!prefs.emailEnabled}
            testId="switch-email-follows"
          />
          <PrefRow
            title="Reactions"
            description="Email me when someone reacts to my message or post."
            checked={prefs.emailReactions}
            onCheckedChange={(v) => setPref("emailReactions", v)}
            disabled={!prefs.emailEnabled}
            testId="switch-email-reactions"
          />
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Browser push
        </h3>
        <div className="space-y-2">
          <PrefRow
            title="Mentions"
            description="Push me when someone @mentions me."
            checked={prefs.pushMentions}
            onCheckedChange={(v) => setPref("pushMentions", v)}
            disabled={!pushOn}
            testId="switch-push-mentions"
          />
          <PrefRow
            title="Replies"
            description="Push me when someone replies."
            checked={prefs.pushReplies}
            onCheckedChange={(v) => setPref("pushReplies", v)}
            disabled={!pushOn}
            testId="switch-push-replies"
          />
          <PrefRow
            title="Direct messages"
            description="Push me when I get a new DM."
            checked={prefs.pushDms}
            onCheckedChange={(v) => setPref("pushDms", v)}
            disabled={!pushOn}
            testId="switch-push-dms"
          />
          <PrefRow
            title="Follows & friend requests"
            description="Push me when someone follows me or sends a friend request."
            checked={prefs.pushFollows}
            onCheckedChange={(v) => setPref("pushFollows", v)}
            disabled={!pushOn}
            testId="switch-push-follows"
          />
          <PrefRow
            title="Reactions"
            description="Push me when someone reacts."
            checked={prefs.pushReactions}
            onCheckedChange={(v) => setPref("pushReactions", v)}
            disabled={!pushOn}
            testId="switch-push-reactions"
          />
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          In-app
        </h3>
        <PrefRow
          title="Sound on new message"
          description="Play a soft chime when a new message arrives in an open chat."
          checked={sound}
          onCheckedChange={setSound}
          testId="switch-notif-sound"
        />
      </div>
    </div>
  );
}

function PrivacyTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const meQ = useGetMe();
  const updateMe = useUpdateMe({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      },
      onError: (e: unknown) => {
        toast({
          title: "Couldn't update privacy",
          description: e instanceof Error ? e.message : "Try again.",
          variant: "destructive",
        });
      },
    },
  });
  const showOnline = !(meQ.data?.hidePresence ?? false);
  const setShowOnline = (next: boolean) => {
    updateMe.mutate({ data: { hidePresence: !next } });
  };
  const [strangers, setStrangers] = usePref<boolean>(
    PREF_KEYS.privDmsFromStrangers,
    true,
  );
  const [reads, setReads] = usePref<boolean>(PREF_KEYS.privReadReceipts, true);
  const [searchable, setSearchable] = usePref<boolean>(
    PREF_KEYS.privProfileSearchable,
    true,
  );
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Privacy</h2>
        <p className="text-sm text-muted-foreground">
          Control who can find you and reach out.
        </p>
      </div>
      <div className="space-y-2">
        <PrefRow
          title="Show online status"
          description="Let people see a green dot and your active room when you're active."
          checked={showOnline}
          onCheckedChange={setShowOnline}
          testId="switch-priv-online"
        />
        <PrefRow
          title="DMs from non-friends"
          description="Allow people who share a hashtag with you to send the first message."
          checked={strangers}
          onCheckedChange={setStrangers}
          testId="switch-priv-strangers"
        />
        <PrefRow
          title="Read receipts"
          description="Show others when you've seen their messages."
          checked={reads}
          onCheckedChange={setReads}
          testId="switch-priv-reads"
        />
        <PrefRow
          title="Show in discovery"
          description="Appear in suggested-people lists for matching hashtags."
          checked={searchable}
          onCheckedChange={setSearchable}
          testId="switch-priv-search"
        />
      </div>
    </div>
  );
}

type BlocksMutesSort = "newest" | "oldest" | "alpha";

function sortUserList<
  T extends { displayName: string; username: string; actedAt: string },
>(list: readonly T[], sort: BlocksMutesSort): T[] {
  const arr = [...list];
  if (sort === "alpha") {
    arr.sort((a, b) =>
      (a.displayName || a.username).localeCompare(
        b.displayName || b.username,
        undefined,
        { sensitivity: "base" },
      ),
    );
  } else if (sort === "oldest") {
    arr.sort((a, b) => a.actedAt.localeCompare(b.actedAt));
  } else {
    arr.sort((a, b) => b.actedAt.localeCompare(a.actedAt));
  }
  return arr;
}

function sortHashtagList<T extends { tag: string; actedAt: string }>(
  list: readonly T[],
  sort: BlocksMutesSort,
): T[] {
  const arr = [...list];
  if (sort === "alpha") {
    arr.sort((a, b) =>
      a.tag.localeCompare(b.tag, undefined, { sensitivity: "base" }),
    );
  } else if (sort === "oldest") {
    arr.sort((a, b) => a.actedAt.localeCompare(b.actedAt));
  } else {
    arr.sort((a, b) => b.actedAt.localeCompare(a.actedAt));
  }
  return arr;
}

function BlocksMutesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useGetMyBlocksAndMutes();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<BlocksMutesSort>("newest");

  const normalizedSearch = search.trim().toLowerCase();
  const matchesUser = (u: { displayName: string; username: string }) => {
    if (!normalizedSearch) return true;
    return (
      u.displayName.toLowerCase().includes(normalizedSearch) ||
      u.username.toLowerCase().includes(normalizedSearch)
    );
  };
  const matchesTag = (h: { tag: string }) => {
    if (!normalizedSearch) return true;
    const q = normalizedSearch.startsWith("#")
      ? normalizedSearch.slice(1)
      : normalizedSearch;
    return h.tag.toLowerCase().includes(q);
  };

  const blockedView = useMemo(() => {
    if (!data) return [];
    return sortUserList(data.blocked.filter(matchesUser), sort);
  }, [data, normalizedSearch, sort]);
  const mutedView = useMemo(() => {
    if (!data) return [];
    return sortUserList(data.muted.filter(matchesUser), sort);
  }, [data, normalizedSearch, sort]);
  const mutedHashtagsView = useMemo(() => {
    if (!data) return [];
    return sortHashtagList(data.mutedHashtags.filter(matchesTag), sort);
  }, [data, normalizedSearch, sort]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetMyBlocksAndMutesQueryKey() });
    qc.invalidateQueries({ queryKey: getGetMyRelationshipsQueryKey() });
  };
  const unblock = useUnblockUser({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Unblocked" });
      },
    },
  });
  const unmute = useUnmuteUser({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Unmuted" });
      },
    },
  });
  const unmuteTag = useUnmuteHashtag({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Hashtag unmuted" });
      },
    },
  });
  const [tagInput, setTagInput] = useState("");
  const muteTag = useMuteHashtag({
    mutation: {
      onSuccess: () => {
        invalidate();
        setTagInput("");
        toast({ title: "Hashtag muted" });
      },
      onError: () => {
        toast({
          title: "Couldn't mute hashtag",
          description: "Please try again.",
          variant: "destructive",
        });
      },
    },
  });
  const normalizedTag = tagInput
    .trim()
    .replace(/^#+/, "")
    .toLowerCase()
    .replace(/\s+/g, "");
  const handleMuteTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!normalizedTag || muteTag.isPending) return;
    muteTag.mutate({ tag: normalizedTag });
  };

  if (isLoading || !data) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-border bg-card">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <ShieldOff className="h-4 w-4 text-primary" /> Blocks &amp; mutes
          </h2>
          <p className="text-sm text-muted-foreground">
            Review who you've blocked or muted, and undo any of these actions
            at any time.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, @username, or #hashtag"
              className="pl-9"
              data-testid="input-blocks-mutes-search"
              aria-label="Search blocks and mutes"
            />
          </div>
          <Select
            value={sort}
            onValueChange={(v) => setSort(v as BlocksMutesSort)}
          >
            <SelectTrigger
              className="sm:w-[180px]"
              data-testid="select-blocks-mutes-sort"
              aria-label="Sort blocks and mutes"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest" data-testid="sort-option-newest">
                Newest first
              </SelectItem>
              <SelectItem value="oldest" data-testid="sort-option-oldest">
                Oldest first
              </SelectItem>
              <SelectItem value="alpha" data-testid="sort-option-alpha">
                A → Z
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Ban className="h-4 w-4 text-destructive" /> Blocked accounts
          </h3>
          <span
            className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            data-testid="blocks-count"
          >
            {normalizedSearch
              ? `${blockedView.length} / ${data.blocked.length}`
              : data.blocked.length}
          </span>
        </div>
        {data.blocked.length === 0 ? (
          <p
            className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground"
            data-testid="blocks-empty"
          >
            You haven't blocked anyone. Blocked accounts won't be able to find
            or message you.
          </p>
        ) : blockedView.length === 0 ? (
          <p
            className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground"
            data-testid="blocks-empty"
          >
            No blocked accounts match "{search}".
          </p>
        ) : (
          <ul className="divide-y divide-border" data-testid="blocks-list">
            {blockedView.map((u) => (
              <BlockMuteUserRow
                key={u.id}
                user={u}
                actionLabel="Unblock"
                testIdPrefix="block"
                disabled={unblock.isPending}
                onAction={() => unblock.mutate({ id: u.id })}
                confirm={{
                  title: `Unblock @${u.username}?`,
                  description:
                    "They will be able to find and message you again.",
                  actionLabel: "Unblock",
                }}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <EyeOff className="h-4 w-4 text-amber-500" /> Muted accounts
          </h3>
          <span
            className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            data-testid="mutes-count"
          >
            {normalizedSearch
              ? `${mutedView.length} / ${data.muted.length}`
              : data.muted.length}
          </span>
        </div>
        {data.muted.length === 0 ? (
          <p
            className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground"
            data-testid="mutes-empty"
          >
            You haven't muted anyone. Muting hides their posts without
            blocking them.
          </p>
        ) : mutedView.length === 0 ? (
          <p
            className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground"
            data-testid="mutes-empty"
          >
            No muted accounts match "{search}".
          </p>
        ) : (
          <ul className="divide-y divide-border" data-testid="mutes-list">
            {mutedView.map((u) => (
              <BlockMuteUserRow
                key={u.id}
                user={u}
                actionLabel="Unmute"
                testIdPrefix="mute"
                disabled={unmute.isPending}
                onAction={() => unmute.mutate({ id: u.id })}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Hash className="h-4 w-4 text-primary" /> Muted hashtags
          </h3>
          <span
            className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            data-testid="muted-tags-count"
          >
            {normalizedSearch
              ? `${mutedHashtagsView.length} / ${data.mutedHashtags.length}`
              : data.mutedHashtags.length}
          </span>
        </div>
        <form
          onSubmit={handleMuteTag}
          className="mb-3 flex items-center gap-2"
          data-testid="form-mute-hashtag"
        >
          <div className="relative flex-1">
            <Hash className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="Mute a hashtag (e.g. politics)"
              className="pl-7"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={muteTag.isPending}
              data-testid="input-mute-hashtag"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={!normalizedTag || muteTag.isPending}
            data-testid="button-mute-hashtag"
          >
            {muteTag.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Mute"
            )}
          </Button>
        </form>
        {data.mutedHashtags.length === 0 ? (
          <p
            className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground"
            data-testid="muted-tags-empty"
          >
            No muted hashtags. Mute a hashtag from any room to hide its posts
            from your feeds.
          </p>
        ) : mutedHashtagsView.length === 0 ? (
          <p
            className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground"
            data-testid="muted-tags-empty"
          >
            No muted hashtags match "{search}".
          </p>
        ) : (
          <ul
            className="flex flex-wrap gap-2"
            data-testid="muted-tags-list"
          >
            {mutedHashtagsView.map((h) => (
              <li
                key={h.tag}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 py-1 pl-3 pr-1 text-sm text-foreground"
                data-testid={`muted-tag-${h.tag}`}
              >
                <span className="inline-flex items-center gap-1">
                  <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                  {h.tag}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 rounded-full px-2 text-xs"
                  disabled={unmuteTag.isPending}
                  onClick={() => unmuteTag.mutate({ tag: h.tag })}
                  data-testid={`button-unmute-tag-${h.tag}`}
                >
                  Unmute
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function BlockMuteUserRow({
  user,
  actionLabel,
  testIdPrefix,
  disabled,
  onAction,
  confirm,
}: {
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string | null;
    discriminator?: string | null;
  };
  actionLabel: string;
  testIdPrefix: string;
  disabled: boolean;
  onAction: () => void;
  confirm?: { title: string; description: string; actionLabel?: string };
}) {
  const initials = (user.displayName || user.username || "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <li
      className="flex items-center gap-3 py-3"
      data-testid={`${testIdPrefix}-row-${user.id}`}
    >
      <Avatar className="h-10 w-10 shrink-0">
        {user.avatarUrl ? (
          <AvatarImage src={user.avatarUrl} alt={user.displayName} />
        ) : null}
        <AvatarFallback className="bg-primary/15 text-primary">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {user.displayName}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          @{user.username}
          {user.discriminator && (
            <span className="ml-1 text-muted-foreground/70">
              #{user.discriminator}
            </span>
          )}
        </p>
      </div>
      {confirm ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              data-testid={`button-${testIdPrefix}-action-${user.id}`}
            >
              {actionLabel}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent
            data-testid={`dialog-${testIdPrefix}-confirm-${user.id}`}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
              <AlertDialogDescription>
                {confirm.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                data-testid={`button-${testIdPrefix}-cancel-${user.id}`}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={onAction}
                data-testid={`button-${testIdPrefix}-confirm-${user.id}`}
              >
                {confirm.actionLabel ?? actionLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={onAction}
          data-testid={`button-${testIdPrefix}-action-${user.id}`}
        >
          {actionLabel}
        </Button>
      )}
    </li>
  );
}

function ChatPrefsTab() {
  const [compact, setCompact] = usePref<boolean>(PREF_KEYS.chatCompact, false);
  const [enterToSend, setEnterToSend] = usePref<boolean>(
    PREF_KEYS.chatEnterToSend,
    true,
  );
  const [seconds, setSeconds] = usePref<boolean>(
    PREF_KEYS.chatShowSeconds,
    false,
  );
  const [autoplay, setAutoplay] = usePref<boolean>(
    PREF_KEYS.chatAutoplayMedia,
    true,
  );
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Chat preferences
        </h2>
        <p className="text-sm text-muted-foreground">
          Tweak how conversations look and feel.
        </p>
      </div>

      <div className="space-y-2">
        <PrefRow
          title="Compact density"
          description="Tighter message bubbles — fit more on screen. Applies instantly."
          checked={compact}
          onCheckedChange={setCompact}
          testId="switch-chat-compact"
          badge="Live"
        />
        <PrefRow
          title="Enter to send"
          description="Pressing Enter sends your message. Turn off to add line breaks instead."
          checked={enterToSend}
          onCheckedChange={setEnterToSend}
          testId="switch-chat-enter"
        />
        <PrefRow
          title="Show seconds in timestamps"
          description="Display HH:MM:SS instead of HH:MM under each message."
          checked={seconds}
          onCheckedChange={setSeconds}
          testId="switch-chat-seconds"
        />
        <PrefRow
          title="Autoplay shared media"
          description="Automatically play GIFs and videos shared in chats."
          checked={autoplay}
          onCheckedChange={setAutoplay}
          testId="switch-chat-autoplay"
        />
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Keyboard className="h-3.5 w-3.5 text-primary" /> Keyboard shortcuts
        </p>
        <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
          <li className="flex items-center justify-between">
            <span>Send message</span>
            <span className="flex items-center gap-1">
              <Kbd>Enter</Kbd>
            </span>
          </li>
          <li className="flex items-center justify-between">
            <span>New line in message</span>
            <span className="flex items-center gap-1">
              <Kbd>Shift</Kbd> <span>+</span> <Kbd>Enter</Kbd>
            </span>
          </li>
          <li className="flex items-center justify-between">
            <span>Cancel reply / close menu</span>
            <Kbd>Esc</Kbd>
          </li>
          <li className="flex items-center justify-between">
            <span>Back to list</span>
            <Kbd>Backspace</Kbd>
          </li>
        </ul>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof MessageCircle;
  label: string;
  value: number | string;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm lift">
      <div
        className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg ${tone}`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function AccountTab({
  username,
  discriminator,
  createdAt,
  mvpPlan,
  onSignOut,
}: {
  username: string;
  discriminator: string | null | undefined;
  createdAt: string;
  mvpPlan: boolean;
  onSignOut: () => void;
}) {
  const { toast } = useToast();
  const conversations = useGetConversations();
  const friends = useGetMyFriends();
  const followed = useGetMyFollowedHashtags();
  const photos = useGetMyPhotos();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const profileUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${basePath}/u/${username}`
      : "";

  async function copyProfileLink() {
    try {
      await navigator.clipboard.writeText(profileUrl);
      toast({ title: "Link copied", description: profileUrl });
    } catch {
      toast({
        title: "Couldn't copy",
        description: "Long-press the URL above to copy it manually.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={MessageCircle}
          label="Conversations"
          value={conversations.data?.length ?? "—"}
          tone="bg-violet-500/15 text-violet-600 dark:text-violet-300"
        />
        <StatCard
          icon={Users}
          label="Friends"
          value={friends.data?.length ?? "—"}
          tone="bg-pink-500/15 text-pink-600 dark:text-pink-300"
        />
        <StatCard
          icon={Hash}
          label="Rooms followed"
          value={followed.data?.length ?? "—"}
          tone="bg-orange-500/15 text-orange-600 dark:text-orange-300"
        />
        <StatCard
          icon={ImageLucide}
          label="Photos"
          value={photos.data?.length ?? "—"}
          tone="bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
        />
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">Account</h2>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Username</p>
          <p className="font-medium text-foreground">
            @{username}
            {discriminator && (
              <span className="ml-1 text-muted-foreground/70">
                #{discriminator}
              </span>
            )}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Profile link</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="flex-1 truncate rounded-md bg-muted px-3 py-2 text-xs text-foreground">
              {profileUrl}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={copyProfileLink}
              data-testid="button-copy-profile-link"
            >
              <Link2 className="mr-1.5 h-3.5 w-3.5" /> Copy
            </Button>
          </div>
        </div>
        <MvpRedeemSection isMvp={mvpPlan} />
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Member since</p>
          <p className="font-medium text-foreground">
            {new Date(createdAt).toLocaleDateString(undefined, {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="border-t border-border pt-4">
          <Button
            variant="outline"
            onClick={onSignOut}
            data-testid="button-signout-settings"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <h2 className="text-base font-semibold text-foreground">
            Danger zone
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Deleting your account permanently removes your messages, friends, and
          photos from HashChat. This action cannot be undone.
        </p>
        {confirmingDelete ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() =>
                toast({
                  title: "Deletion requested",
                  description:
                    "We've recorded your request. Email support@hashchat.app to confirm.",
                })
              }
              data-testid="button-confirm-delete-account"
            >
              Yes, delete my account
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingDelete(false)}
              data-testid="button-cancel-delete-account"
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirmingDelete(true)}
            data-testid="button-delete-account"
          >
            Delete my account
          </Button>
        )}
      </div>
    </div>
  );
}

function FriendCodeCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useGetMyFriendCode();
  const [regenerating, setRegenerating] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const regen = useRegenerateMyFriendCode({
    mutation: {
      onMutate: () => setRegenerating(true),
      onSettled: () => setRegenerating(false),
      onSuccess: (resp) => {
        qc.setQueryData(getGetMyFriendCodeQueryKey(), resp);
        qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
        toast({
          title: "New friend code generated",
          description: resp.friendCode ?? "",
        });
      },
    },
  });
  const code = data?.friendCode ?? null;

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(`#${code}`);
      toast({ title: "Friend code copied", description: `#${code}` });
    } catch {
      toast({ title: "Couldn't copy code", variant: "destructive" });
    }
  }

  return (
    <div
      className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-violet-500/10 via-card to-pink-500/10 p-5 shadow-sm"
      data-testid="profile-friend-code-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Your friend code
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Share this with friends so they can find you instantly.
          </p>
        </div>
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : code ? (
          <div
            className="flex items-center gap-1 rounded-xl bg-background/70 px-3 py-2 font-mono text-lg font-bold tracking-wider text-foreground shadow-inner ring-1 ring-border"
            data-testid="profile-friend-code-value"
          >
            <Hash className="h-4 w-4 text-primary" />
            <span>{code}</span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">Unavailable</span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="default"
          onClick={copyCode}
          disabled={!code}
          data-testid="button-copy-friend-code"
        >
          <Link2 className="mr-1.5 h-3.5 w-3.5" /> Copy code
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setQrOpen(true)}
          disabled={!code}
          data-testid="button-show-friend-code-qr"
        >
          <QrCode className="mr-1.5 h-3.5 w-3.5" /> Show QR
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => regen.mutate()}
          disabled={regenerating || !code}
          data-testid="button-regenerate-friend-code"
        >
          {regenerating ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          )}
          Regenerate
        </Button>
      </div>
      {code && (
        <FriendCodeQRDialog
          code={code}
          open={qrOpen}
          onOpenChange={setQrOpen}
        />
      )}
    </div>
  );
}
