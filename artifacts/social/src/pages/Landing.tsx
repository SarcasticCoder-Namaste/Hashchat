import { Link } from "wouter";
import {
  useGetOverviewStats,
  useGetTrendingHashtags,
} from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Hash,
  Sparkles,
  MessageCircle,
  Users,
  ArrowRight,
  Film,
  Smile,
  TrendingUp,
  ShieldCheck,
} from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Landing() {
  const { data: stats } = useGetOverviewStats();
  const { data: trending } = useGetTrendingHashtags({ limit: 12 });

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-violet-500/10 via-background to-pink-500/10">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link
          href="/"
          className="flex items-center gap-2"
          data-testid="link-landing-logo"
        >
          <img
            src={`${basePath}/logo.svg`}
            alt="HashChat"
            className="h-9 w-9"
          />
          <span className="text-xl font-bold tracking-tight text-foreground">
            HashChat
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/sign-in">
            <Button variant="ghost" data-testid="link-signin">
              Sign in
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button
              data-testid="link-signup"
              className="bg-primary hover:bg-primary/90"
            >
              Get started
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-12 pb-16 md:pt-20 md:pb-24">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-card px-3 py-1 text-xs font-medium text-primary shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />
              Hashtag-driven social chat
            </div>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-foreground md:text-6xl">
              Chat with people who{" "}
              <span className="bg-gradient-to-r from-violet-600 to-pink-600 bg-clip-text text-transparent">
                actually get it
              </span>
              .
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              Pick the hashtags you live and breathe. We'll match you with
              like-minded people, drop you into the right rooms, and keep you
              looped in on what's trending.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/sign-up">
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                  <Button
                    size="lg"
                    className="bg-primary hover:bg-primary/90"
                    data-testid="cta-signup"
                  >
                    Start chatting <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </motion.div>
              </Link>
              <Link href="/sign-in">
                <Button size="lg" variant="outline" data-testid="cta-signin">
                  I already have an account
                </Button>
              </Link>
            </div>

            {stats && (
              <div className="mt-10 grid max-w-md grid-cols-3 gap-4 text-sm">
                <Stat
                  label="Members"
                  value={stats.userCount}
                  icon={<Users className="h-4 w-4" />}
                />
                <Stat
                  label="Hashtags"
                  value={stats.hashtagCount}
                  icon={<Hash className="h-4 w-4" />}
                />
                <Stat
                  label="Messages"
                  value={stats.messageCount}
                  icon={<MessageCircle className="h-4 w-4" />}
                />
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-primary/10"
          >
            <p className="text-sm font-semibold text-foreground">
              Trending right now
            </p>
            <p className="text-xs text-muted-foreground">
              Hot rooms across HashChat
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {trending?.map((t, i) => (
                <motion.span
                  key={t.tag}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.04 }}
                  className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-500/20 to-pink-500/20 px-3 py-1.5 text-sm font-medium text-primary"
                  data-testid={`landing-trend-${t.tag}`}
                >
                  <Hash className="h-3.5 w-3.5" />
                  {t.tag}
                  <span className="ml-1 text-xs text-violet-600">
                    {t.recentMessages}↑
                  </span>
                </motion.span>
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
                title="Reels feed"
                desc="Short videos baked into your scroll."
                icon={<Film className="h-4 w-4" />}
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Why HashChat */}
      <section className="border-t border-border/60 bg-card/40 py-16 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Why HashChat
            </p>
            <h2 className="mt-2 text-3xl font-bold text-foreground md:text-4xl">
              Built around what you love
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
              Friend lists, DMs, hashtag rooms, online presence, reels — all
              wired together by your interests instead of who you happened to
              meet first.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <PillarCard
              icon={<Sparkles className="h-5 w-5" />}
              title="Match by interest"
              desc="Smart matches surface people who share the most hashtags with you, not noise from random algorithms."
            />
            <PillarCard
              icon={<MessageCircle className="h-5 w-5" />}
              title="DMs + rooms"
              desc="Slide into private DMs, jump into hashtag rooms, react with emojis, and reply in threads."
            />
            <PillarCard
              icon={<TrendingUp className="h-5 w-5" />}
              title="Always live"
              desc="See who's online with presence dots, follow trending tags, and keep up with what's exploding right now."
            />
            <PillarCard
              icon={<Film className="h-5 w-5" />}
              title="Reels built in"
              desc="A vertical YouTube Shorts feed lives in your sidebar. No app switching."
            />
            <PillarCard
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Moderated"
              desc="Real moderators, not bots. Bad actors get banned fast so the vibe stays good."
            />
            <PillarCard
              icon={<Smile className="h-5 w-5" />}
              title="Beautifully crafted"
              desc="Light + dark themes, smooth animations, and zero clutter. It just feels nice."
            />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-4xl px-6 py-20 text-center">
        <h2 className="text-3xl font-bold text-foreground md:text-4xl">
          Your tribe is waiting.
        </h2>
        <p className="mt-3 text-muted-foreground">
          It takes 30 seconds to sign up and pick your first hashtags.
        </p>
        <div className="mt-6 flex justify-center">
          <Link href="/sign-up">
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
              <Button
                size="lg"
                className="bg-primary hover:bg-primary/90"
                data-testid="cta-bottom-signup"
              >
                Create your account <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </motion.div>
          </Link>
        </div>
      </section>

      <footer className="border-t border-border/60 bg-card/40 py-6 text-center text-xs text-muted-foreground">
        Built with care • HashChat
      </footer>
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
    <div
      className="rounded-lg border border-border bg-card p-3"
      data-testid={`stat-${label.toLowerCase()}`}
    >
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

function PillarCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-pink-500/20 text-primary">
        {icon}
      </div>
      <h3 className="mt-3 text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </motion.div>
  );
}
