import { useEffect, useState } from "react";
import {
  useGetMe,
  useUpdateMe,
  useSetMyHashtags,
  useGetHashtagSuggestions,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Hash, Loader2, Save } from "lucide-react";

export default function Profile() {
  const qc = useQueryClient();
  const { data: me, isLoading } = useGetMe();
  const { data: suggested } = useGetHashtagSuggestions();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [custom, setCustom] = useState("");

  useEffect(() => {
    if (me) {
      setDisplayName(me.displayName);
      setBio(me.bio ?? "");
      setHashtags(me.hashtags);
    }
  }, [me]);

  const update = useUpdateMe({
    mutation: {
      onSuccess: () =>
        qc.invalidateQueries({ queryKey: getGetMeQueryKey() }),
    },
  });
  const setMine = useSetMyHashtags({
    mutation: {
      onSuccess: () =>
        qc.invalidateQueries({ queryKey: getGetMeQueryKey() }),
    },
  });

  if (isLoading || !me) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  function toggle(tag: string) {
    setHashtags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  function addCustom() {
    const tag = custom.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "");
    if (!tag) return;
    if (!hashtags.includes(tag)) setHashtags((p) => [...p, tag]);
    setCustom("");
  }

  const allTags = Array.from(
    new Set([...(suggested?.map((h) => h.tag) ?? []), ...hashtags]),
  );

  const initials = me.displayName
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16">
          {me.avatarUrl ? (
            <AvatarImage src={me.avatarUrl} alt={me.displayName} />
          ) : null}
          <AvatarFallback className="bg-violet-200 text-lg text-violet-700">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{me.displayName}</h1>
          <p className="text-slate-500">@{me.username}</p>
        </div>
      </div>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Profile</h2>
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
        <Button
          onClick={() =>
            update.mutate({ data: { displayName, bio: bio || null } })
          }
          disabled={update.isPending}
          className="bg-violet-600 hover:bg-violet-700"
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
          <p className="text-xs text-emerald-600">Saved!</p>
        )}
      </section>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">My hashtags</h2>
        <p className="text-sm text-slate-500">
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
                    ? "border-violet-600 bg-violet-600 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:text-violet-700",
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
          <Button variant="outline" onClick={addCustom} data-testid="button-add-profile-tag">
            Add
          </Button>
        </div>
        <Button
          onClick={() => setMine.mutate({ data: { hashtags } })}
          disabled={setMine.isPending || hashtags.length === 0}
          className="bg-violet-600 hover:bg-violet-700"
          data-testid="button-save-tags"
        >
          {setMine.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Save hashtags
        </Button>
        {setMine.isSuccess && (
          <p className="text-xs text-emerald-600">Saved!</p>
        )}
      </section>
    </div>
  );
}
