import { Link } from "wouter";
import { useGetOverviewStats, useGetTrendingHashtags } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Hash, Sparkles, MessageCircle, Users, ArrowRight } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Landing() {
  const { data: stats } = useGetOverviewStats();
  const { data: trending } = useGetTrendingHashtags({ limit: 8 });

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-violet-500/10 via-background to-pink-500/10">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2" data-testid="link-landing-logo">
            <img src={`${basePath}/logo.svg`} alt="HashChat" className="h-9 w-9" />
            <span className="text-xl font-bold tracking-tight text-foreground">
              HashChat
            </span>
          </Link>
        <div className="flex items-center gap-2">
          <Link href="/sign-in">
              <Button variant="ghost" data-testid="link-signin">Sign in</Button>
            </Link>
          <Link href="/sign-up">
              <Button data-testid="link-signup" className="bg-primary hover:bg-primary/90">
                Get started
              </Button>
            </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pt-12 pb-16 md:pt-20 md:pb-24">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-card px-3 py-1 text-xs font-medium text-primary shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />
              Hashtag-driven social chat
            </div>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-foreground md:text-6xl">
              Find your tribe through{" "}
              <span className="bg-gradient-to-r from-violet-600 to-pink-600 bg-clip-text text-transparent">
                #hashtags
              </span>
              .
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              Pick the topics you love. We'll match you with like-minded people, drop
              you into the right rooms, and keep you in the loop on what's trending.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/sign-up">
                  <Button size="lg" className="bg-primary hover:bg-primary/90" data-testid="cta-signup">
                    Start chatting <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              <Link href="/sign-in">
                  <Button size="lg" variant="outline" data-testid="cta-signin">
                    I already have an account
                  </Button>
                </Link>
            </div>

            {stats && (
              <div className="mt-10 grid max-w-md grid-cols-3 gap-4 text-sm">
                <Stat label="Members" value={stats.userCount} icon={<Users className="h-4 w-4" />} />
                <Stat label="Hashtags" value={stats.hashtagCount} icon={<Hash className="h-4 w-4" />} />
                <Stat label="Messages" value={stats.messageCount} icon={<MessageCircle className="h-4 w-4" />} />
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-xl shadow-primary/10">
            <p className="text-sm font-semibold text-foreground">Trending right now</p>
            <p className="text-xs text-muted-foreground">Hot rooms across HashChat</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {trending?.map((t) => (
                <span
                  key={t.tag}
                  className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-500/20 to-pink-500/20 px-3 py-1.5 text-sm font-medium text-primary"
                  data-testid={`landing-trend-${t.tag}`}
                >
                  <Hash className="h-3.5 w-3.5" />
                  {t.tag}
                  <span className="ml-1 text-xs text-violet-600">
                    {t.recentMessages}↑
                  </span>
                </span>
              ))}
              {!trending && (
                <div className="h-32 w-full animate-pulse rounded-lg bg-muted" />
              )}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <FeatureCard
                title="Smart matches"
                desc="Meet people who share your hashtags."
                icon={<Sparkles className="h-4 w-4" />}
              />
              <FeatureCard
                title="Real-time DMs"
                desc="Send messages, react with emojis."
                icon={<MessageCircle className="h-4 w-4" />}
              />
              <FeatureCard
                title="Hashtag rooms"
                desc="Drop into chats around any topic."
                icon={<Hash className="h-4 w-4" />}
              />
              <FeatureCard
                title="Follow trends"
                desc="See what's blowing up in real time."
                icon={<Users className="h-4 w-4" />}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3" data-testid={`stat-${label.toLowerCase()}`}>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-1 text-xl font-bold text-foreground">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function FeatureCard({
  title,
  desc,
  icon,
}: {
  title: string;
  desc: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
    </div>
  );
}
