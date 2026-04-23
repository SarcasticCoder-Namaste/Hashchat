import { useEffect, useMemo, useState } from "react";
import { useClerk } from "@clerk/react";
import {
  useGetMe,
  useUpdateMe,
  useSetMyHashtags,
  useGetHashtagSuggestions,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  Sun,
  Moon,
  Monitor,
  Check,
} from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Settings() {
  const qc = useQueryClient();
  const { signOut } = useClerk();
  const { data: me, isLoading } = useGetMe();
  const { data: suggested } = useGetHashtagSuggestions();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [featuredHashtag, setFeaturedHashtag] = useState<string | null>(null);
  const [custom, setCustom] = useState("");

  useEffect(() => {
    if (me) {
      setDisplayName(me.displayName);
      setBio(me.bio ?? "");
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
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16">
          {me.avatarUrl ? (
            <AvatarImage src={me.avatarUrl} alt={me.displayName} />
          ) : null}
          <AvatarFallback className="bg-primary/15 text-lg text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
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
          </div>
          <p className="text-muted-foreground">@{me.username}</p>
        </div>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile" data-testid="tab-profile">
            <UserIcon className="mr-1.5 h-4 w-4" /> Profile
          </TabsTrigger>
          <TabsTrigger value="hashtags" data-testid="tab-hashtags">
            <Hash className="mr-1.5 h-4 w-4" /> Hashtags
          </TabsTrigger>
          <TabsTrigger value="appearance" data-testid="tab-appearance">
            <Palette className="mr-1.5 h-4 w-4" /> Appearance
          </TabsTrigger>
          <TabsTrigger value="account" data-testid="tab-account">
            Account
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="profile"
          className="mt-4 space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-foreground">
            Public profile
          </h2>
          <div className="space-y-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              data-testid="input-display-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell people what you're into…"
              rows={3}
              data-testid="input-bio"
            />
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

        <TabsContent
          value="account"
          className="mt-4 space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-foreground">Account</h2>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Username</p>
            <p className="font-medium text-foreground">@{me.username}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Member since</p>
            <p className="font-medium text-foreground">
              {new Date(me.createdAt).toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
          <div className="border-t border-border pt-4">
            <Button
              variant="outline"
              onClick={() => signOut({ redirectUrl: basePath || "/" })}
              data-testid="button-signout-settings"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  const options = [
    { id: "light", label: "Light", icon: Sun },
    { id: "dark", label: "Dark", icon: Moon },
    { id: "system", label: "System", icon: Monitor },
  ] as const;
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">Appearance</h2>
      <p className="text-sm text-muted-foreground">
        Pick how HashChat looks. System follows your device setting.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {options.map(({ id, label, icon: Icon }) => {
          const active = theme === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTheme(id)}
              data-testid={`appearance-${id}`}
              className={[
                "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors",
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-foreground hover:bg-accent",
              ].join(" ")}
            >
              <Icon className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">{label}</span>
              {active && (
                <span className="inline-flex items-center gap-1 text-xs text-primary">
                  <Check className="h-3 w-3" /> Active
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
