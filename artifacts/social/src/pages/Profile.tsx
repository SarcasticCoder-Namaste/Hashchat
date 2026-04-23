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
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Kbd } from "@/components/ui/kbd";
import { ProfileGallery } from "@/components/ProfileGallery";
import { useToast } from "@/hooks/use-toast";
import { PREF_KEYS, usePref } from "@/lib/preferences";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
} from "lucide-react";
import { ImageUploadButton } from "@/components/ImageUploadButton";

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

      <Tabs defaultValue="profile">
        <TabsList className="grid h-auto w-full grid-cols-4 gap-1 p-1 sm:grid-cols-8">
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

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <ImageLucide className="h-3.5 w-3.5 text-primary" /> Banner image
            </Label>
            <p className="text-xs text-muted-foreground">
              A wide cover photo shown at the top of your profile.
            </p>
            <div className="flex items-start gap-3">
              <div
                className="relative h-20 w-40 overflow-hidden rounded-lg border border-border bg-gradient-to-br from-violet-500/30 via-fuchsia-500/20 to-pink-500/30"
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
              <div className="flex flex-col gap-1.5">
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
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Camera className="h-3.5 w-3.5 text-primary" /> Avatar
            </Label>
            <div className="flex items-center gap-3">
              <Avatar className="h-16 w-16">
                {avatarUrl ? (
                  <AvatarImage src={avatarUrl} alt={displayName} />
                ) : null}
                <AvatarFallback className="bg-primary/15 text-lg text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-1.5">
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

        <TabsContent value="chat" className="mt-4">
          <ChatPrefsTab />
        </TabsContent>

        <TabsContent value="gallery" className="mt-4">
          <ProfileGallery />
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
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Appearance</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Pick a theme — six light palettes and four dark ones. Saved on this device.
          </p>
        </div>
        <span className="hidden rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground sm:inline-block">
          {themes.length} themes
        </span>
      </div>
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
    </div>
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
  const [sound, setSound] = usePref<boolean>(PREF_KEYS.notifSound, true);
  const [mentions, setMentions] = usePref<boolean>(
    PREF_KEYS.notifMentions,
    true,
  );
  const [friendReqs, setFriendReqs] = usePref<boolean>(
    PREF_KEYS.notifFriendRequests,
    true,
  );
  const [marketing, setMarketing] = usePref<boolean>(
    PREF_KEYS.notifMarketing,
    false,
  );
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported",
  );

  async function requestBrowserPerm() {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPerm(result);
    if (result === "granted") {
      new Notification("HashChat notifications enabled", {
        body: "We'll let you know when something needs your attention.",
        icon: `${basePath}/logo.png`,
      });
      toast({ title: "Notifications on", description: "You're all set." });
    } else if (result === "denied") {
      toast({
        title: "Notifications blocked",
        description:
          "Update your browser site settings to allow notifications.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Notifications</h2>
          <p className="text-sm text-muted-foreground">
            Choose what nudges you and how. Saved on this device.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-primary/30 bg-gradient-to-r from-violet-500/10 to-pink-500/10 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Bell className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              Browser notifications
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Status:{" "}
              <span className="font-medium text-foreground">
                {perm === "granted"
                  ? "Allowed"
                  : perm === "denied"
                    ? "Blocked"
                    : perm === "unsupported"
                      ? "Not supported in this browser"
                      : "Not asked yet"}
              </span>
            </p>
          </div>
          {perm !== "granted" && perm !== "unsupported" && (
            <Button
              size="sm"
              onClick={requestBrowserPerm}
              data-testid="button-request-notif-perm"
            >
              Enable
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <PrefRow
          title="Sound on new message"
          description="Play a soft chime when a new message arrives in an open chat."
          checked={sound}
          onCheckedChange={setSound}
          testId="switch-notif-sound"
        />
        <PrefRow
          title="@mentions"
          description="Highlight messages and rooms where someone @-mentions you."
          checked={mentions}
          onCheckedChange={setMentions}
          testId="switch-notif-mentions"
        />
        <PrefRow
          title="Friend requests"
          description="Surface incoming friend requests in your inbox."
          checked={friendReqs}
          onCheckedChange={setFriendReqs}
          testId="switch-notif-friends"
        />
        <PrefRow
          title="Product updates"
          description="Occasional emails about new HashChat features."
          checked={marketing}
          onCheckedChange={setMarketing}
          testId="switch-notif-marketing"
        />
      </div>
    </div>
  );
}

function PrivacyTab() {
  const [online, setOnline] = usePref<boolean>(PREF_KEYS.privShowOnline, true);
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
          description="Let people see a green dot when you're active."
          checked={online}
          onCheckedChange={setOnline}
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
