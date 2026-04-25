import { type ReactNode } from "react";
import { Link } from "wouter";

export type MentionedUserShape = {
  id: string;
  username: string;
  displayName: string;
};

const TOKEN_RE = /(@[a-zA-Z0-9_]{2,30}|#[a-zA-Z0-9]+|https?:\/\/[^\s]+)/g;

export function renderRichContent(
  content: string,
  mentions?: MentionedUserShape[],
): ReactNode {
  const known = new Map(
    (mentions ?? []).map((m) => [m.username.toLowerCase(), m]),
  );
  const parts = content.split(TOKEN_RE);
  return parts.map((p, i) => {
    if (!p) return null;
    if (p.startsWith("@")) {
      const u = p.slice(1).toLowerCase();
      const m = known.get(u);
      if (m) {
        return (
          <Link
            key={i}
            href={`/app/u/${m.username}`}
            className="font-medium text-primary hover:underline"
            data-testid={`mention-link-${m.username}`}
          >
            @{m.username}
          </Link>
        );
      }
      return (
        <span key={i} className="font-medium text-primary/80">
          {p}
        </span>
      );
    }
    if (p.startsWith("#")) {
      const tag = p.slice(1).toLowerCase();
      return (
        <Link
          key={i}
          href={`/app/r/${tag}`}
          className="text-primary hover:underline"
          data-testid={`link-tag-${tag}`}
        >
          {p}
        </Link>
      );
    }
    if (/^https?:\/\//i.test(p)) {
      return (
        <a
          key={i}
          href={p}
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline break-all"
        >
          {p}
        </a>
      );
    }
    return <span key={i}>{p}</span>;
  });
}
