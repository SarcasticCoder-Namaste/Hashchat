import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  boolean,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  bannerUrl: text("banner_url"),
  pronouns: text("pronouns"),
  location: text("location"),
  website: text("website"),
  statusEmoji: text("status_emoji"),
  statusText: text("status_text"),
  status: text("status").notNull().default("online"),
  featuredHashtag: text("featured_hashtag"),
  discriminator: text("discriminator"),
  friendCode: text("friend_code"),
  role: text("role").notNull().default("user"),
  mvpPlan: boolean("mvp_plan").notNull().default(false),
  verified: boolean("verified").notNull().default(false),
  premiumUntil: timestamp("premium_until", { withTimezone: true }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  bannedAt: timestamp("banned_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  uniqueIndex("users_discriminator_unique").on(t.discriminator),
  uniqueIndex("users_friend_code_unique").on(t.friendCode),
]);

export const hashtagsTable = pgTable("hashtags", {
  tag: text("tag").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userHashtagsTable = pgTable(
  "user_hashtags",
  {
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tag: text("tag")
      .notNull()
      .references(() => hashtagsTable.tag, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tag] })],
);

export const userFollowedHashtagsTable = pgTable(
  "user_followed_hashtags",
  {
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tag: text("tag")
      .notNull()
      .references(() => hashtagsTable.tag, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tag] })],
);

export const conversationsTable = pgTable(
  "conversations",
  {
    id: serial("id").primaryKey(),
    userAId: text("user_a_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    userBId: text("user_b_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    backgroundUrl: text("background_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("conversations_pair").on(t.userAId, t.userBId)],
);

export const conversationBackgroundsTable = pgTable(
  "conversation_backgrounds",
  {
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversationsTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    backgroundUrl: text("background_url").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] })],
);

export const conversationReadsTable = pgTable(
  "conversation_reads",
  {
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversationsTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastReadMessageId: integer("last_read_message_id"),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] })],
);

export const conversationTypingTable = pgTable(
  "conversation_typing",
  {
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversationsTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] })],
);

export const roomTypingTable = pgTable(
  "room_typing",
  {
    tag: text("tag")
      .notNull()
      .references(() => hashtagsTable.tag, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tag, t.userId] })],
);

export const messagesTable = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id").references(
      () => conversationsTable.id,
      { onDelete: "cascade" },
    ),
    roomTag: text("room_tag").references(() => hashtagsTable.tag, {
      onDelete: "cascade",
    }),
    senderId: text("sender_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    imageUrl: text("image_url"),
    audioUrl: text("audio_url"),
    audioWaveform: text("audio_waveform"),
    replyToId: integer("reply_to_id"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("messages_conversation_idx").on(t.conversationId, t.createdAt),
    index("messages_room_idx").on(t.roomTag, t.createdAt),
  ],
);

export const mvpCodesTable = pgTable("mvp_codes", {
  code: text("code").primaryKey(),
  createdBy: text("created_by")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  redeemedBy: text("redeemed_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
  note: text("note"),
});

export const reactionsTable = pgTable(
  "reactions",
  {
    messageId: integer("message_id")
      .notNull()
      .references(() => messagesTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId, t.emoji] })],
);

export const postReactionsTable = pgTable(
  "post_reactions",
  {
    postId: integer("post_id")
      .notNull()
      .references(() => postsTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId, t.emoji] })],
);

export const mentionsTable = pgTable(
  "mentions",
  {
    id: serial("id").primaryKey(),
    mentionerId: text("mentioner_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    mentionedUserId: text("mentioned_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(),
    targetId: integer("target_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("mentions_target_idx").on(t.targetType, t.targetId),
    index("mentions_mentioned_idx").on(t.mentionedUserId, t.createdAt),
  ],
);

export const notificationsTable = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    recipientId: text("recipient_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => usersTable.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull(),
    targetType: text("target_type"),
    targetId: integer("target_id"),
    targetTextId: text("target_text_id"),
    snippet: text("snippet"),
    extra: text("extra"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("notifications_recipient_idx").on(t.recipientId, t.createdAt),
    index("notifications_unread_idx").on(t.recipientId, t.readAt),
  ],
);

export const notificationMutesTable = pgTable(
  "notification_mutes",
  {
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    sourceKey: text("source_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.sourceType, t.sourceKey] }),
    index("notification_mutes_user_idx").on(t.userId),
  ],
);

export const friendshipsTable = pgTable(
  "friendships",
  {
    requesterId: text("requester_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    addresseeId: text("addressee_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.requesterId, t.addresseeId] })],
);

export const userPhotosTable = pgTable(
  "user_photos",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    imageUrl: text("image_url").notNull(),
    caption: text("caption"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("user_photos_user_idx").on(t.userId, t.createdAt)],
);

export const callsTable = pgTable(
  "calls",
  {
    id: serial("id").primaryKey(),
    initiatorId: text("initiator_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    conversationId: integer("conversation_id").references(
      () => conversationsTable.id,
      { onDelete: "cascade" },
    ),
    roomTag: text("room_tag").references(() => hashtagsTable.tag, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull().default("video"),
    status: text("status").notNull().default("ringing"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [index("calls_status_idx").on(t.status, t.startedAt)],
);

export const callParticipantsTable = pgTable(
  "call_participants",
  {
    callId: integer("call_id")
      .notNull()
      .references(() => callsTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    state: text("state").notNull().default("invited"),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.callId, t.userId] })],
);

export const callSignalsTable = pgTable(
  "call_signals",
  {
    id: serial("id").primaryKey(),
    callId: integer("call_id")
      .notNull()
      .references(() => callsTable.id, { onDelete: "cascade" }),
    fromUserId: text("from_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    toUserId: text("to_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: text("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("call_signals_target_idx").on(t.toUserId, t.callId, t.id)],
);

export const postsTable = pgTable(
  "posts",
  {
    id: serial("id").primaryKey(),
    authorId: text("author_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("posts_author_idx").on(t.authorId, t.createdAt)],
);

export const postHashtagsTable = pgTable(
  "post_hashtags",
  {
    postId: integer("post_id")
      .notNull()
      .references(() => postsTable.id, { onDelete: "cascade" }),
    tag: text("tag")
      .notNull()
      .references(() => hashtagsTable.tag, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.tag] }),
    index("post_hashtags_tag_idx").on(t.tag),
  ],
);

export const postMediaTable = pgTable(
  "post_media",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .notNull()
      .references(() => postsTable.id, { onDelete: "cascade" }),
    imageUrl: text("image_url").notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("post_media_post_idx").on(t.postId, t.position)],
);

export const pollsTable = pgTable(
  "polls",
  {
    id: serial("id").primaryKey(),
    roomTag: text("room_tag")
      .notNull()
      .references(() => hashtagsTable.tag, { onDelete: "cascade" }),
    creatorId: text("creator_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("polls_room_idx").on(t.roomTag, t.createdAt)],
);

export const pollOptionsTable = pgTable(
  "poll_options",
  {
    id: serial("id").primaryKey(),
    pollId: integer("poll_id")
      .notNull()
      .references(() => pollsTable.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("poll_options_poll_idx").on(t.pollId, t.position)],
);

export const pollVotesTable = pgTable(
  "poll_votes",
  {
    pollId: integer("poll_id")
      .notNull()
      .references(() => pollsTable.id, { onDelete: "cascade" }),
    optionId: integer("option_id")
      .notNull()
      .references(() => pollOptionsTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.pollId, t.userId] })],
);

export const messageAttachmentsTable = pgTable(
  "message_attachments",
  {
    id: serial("id").primaryKey(),
    messageId: integer("message_id")
      .notNull()
      .references(() => messagesTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    url: text("url").notNull(),
    title: text("title"),
    description: text("description"),
    thumbnailUrl: text("thumbnail_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("message_attachments_message_idx").on(t.messageId)],
);

export const linkPreviewsTable = pgTable("link_previews", {
  url: text("url").primaryKey(),
  resolvedUrl: text("resolved_url").notNull(),
  title: text("title"),
  description: text("description"),
  thumbnailUrl: text("thumbnail_url"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userFollowsTable = pgTable(
  "user_follows",
  {
    followerId: text("follower_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    followeeId: text("followee_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followeeId] }),
    index("user_follows_followee_idx").on(t.followeeId),
  ],
);

export const userBlocksTable = pgTable(
  "user_blocks",
  {
    blockerId: text("blocker_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    blockedId: text("blocked_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    index("user_blocks_blocked_idx").on(t.blockedId),
  ],
);

export const userMutesTable = pgTable(
  "user_mutes",
  {
    muterId: text("muter_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    mutedId: text("muted_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.muterId, t.mutedId] })],
);

export const hashtagMutesTable = pgTable(
  "hashtag_mutes",
  {
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tag: text("tag")
      .notNull()
      .references(() => hashtagsTable.tag, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tag] })],
);

export const eventsTable = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    roomTag: text("room_tag")
      .notNull()
      .references(() => hashtagsTable.tag, { onDelete: "cascade" }),
    creatorId: text("creator_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("events_room_idx").on(t.roomTag, t.startsAt)],
);

export const eventRsvpsTable = pgTable(
  "event_rsvps",
  {
    eventId: integer("event_id")
      .notNull()
      .references(() => eventsTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] })],
);

export const hashtagMetricsDailyTable = pgTable(
  "hashtag_metrics_daily",
  {
    tag: text("tag")
      .notNull()
      .references(() => hashtagsTable.tag, { onDelete: "cascade" }),
    day: text("day").notNull(),
    posts: integer("posts").notNull().default(0),
    messages: integer("messages").notNull().default(0),
    newMembers: integer("new_members").notNull().default(0),
    newFollowers: integer("new_followers").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tag, t.day] }),
    index("hashtag_metrics_daily_day_idx").on(t.day),
  ],
);

export const communitiesTable = pgTable(
  "communities",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    bannerUrl: text("banner_url"),
    creatorId: text("creator_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("communities_slug_unique").on(t.slug)],
);

export const communityHashtagsTable = pgTable(
  "community_hashtags",
  {
    communityId: integer("community_id")
      .notNull()
      .references(() => communitiesTable.id, { onDelete: "cascade" }),
    tag: text("tag")
      .notNull()
      .references(() => hashtagsTable.tag, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.communityId, t.tag] }),
    index("community_hashtags_tag_idx").on(t.tag),
  ],
);

export const communityMembersTable = pgTable(
  "community_members",
  {
    communityId: integer("community_id")
      .notNull()
      .references(() => communitiesTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.communityId, t.userId] }),
    index("community_members_user_idx").on(t.userId),
  ],
);

export const roomVisibilityTable = pgTable("room_visibility", {
  tag: text("tag")
    .primaryKey()
    .references(() => hashtagsTable.tag, { onDelete: "cascade" }),
  isPrivate: boolean("is_private").notNull().default(false),
  ownerId: text("owner_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const roomMembersTable = pgTable(
  "room_members",
  {
    tag: text("tag")
      .notNull()
      .references(() => hashtagsTable.tag, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tag, t.userId] }),
    index("room_members_user_idx").on(t.userId),
  ],
);

export const roomInvitesTable = pgTable(
  "room_invites",
  {
    code: text("code").primaryKey(),
    tag: text("tag")
      .notNull()
      .references(() => hashtagsTable.tag, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    maxUses: integer("max_uses"),
    useCount: integer("use_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("room_invites_tag_idx").on(t.tag)],
);

export const roomJoinRequestsTable = pgTable(
  "room_join_requests",
  {
    tag: text("tag")
      .notNull()
      .references(() => hashtagsTable.tag, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: text("decided_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    primaryKey({ columns: [t.tag, t.userId] }),
    index("room_join_requests_status_idx").on(t.tag, t.status),
  ],
);

export const subscriptionsTable = pgTable("subscriptions", {
  userId: text("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  plan: text("plan").notNull().default("premium"),
  status: text("status").notNull().default("inactive"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const solanaWalletsTable = pgTable(
  "solana_wallets",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    publicKey: text("public_key").notNull(),
    label: text("label"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("solana_wallets_pubkey_unique").on(t.publicKey),
    index("solana_wallets_user_idx").on(t.userId),
  ],
);

export const solanaWalletChallengesTable = pgTable(
  "solana_wallet_challenges",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    publicKey: text("public_key").notNull(),
    nonce: text("nonce").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("solana_wallet_challenges_user_idx").on(t.userId, t.publicKey),
  ],
);

export type SolanaWallet = typeof solanaWalletsTable.$inferSelect;
export type SolanaWalletChallenge =
  typeof solanaWalletChallengesTable.$inferSelect;

export type Event = typeof eventsTable.$inferSelect;
export type EventRsvp = typeof eventRsvpsTable.$inferSelect;
export type HashtagMetricsDaily = typeof hashtagMetricsDailyTable.$inferSelect;
export type Community = typeof communitiesTable.$inferSelect;
export type CommunityHashtag = typeof communityHashtagsTable.$inferSelect;
export type CommunityMember = typeof communityMembersTable.$inferSelect;
export type RoomVisibility = typeof roomVisibilityTable.$inferSelect;
export type RoomMember = typeof roomMembersTable.$inferSelect;
export type RoomInvite = typeof roomInvitesTable.$inferSelect;
export type RoomJoinRequest = typeof roomJoinRequestsTable.$inferSelect;
export type Subscription = typeof subscriptionsTable.$inferSelect;

export const bookmarksTable = pgTable(
  "bookmarks",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    targetId: integer("target_id").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("bookmarks_user_target_unique").on(
      t.userId,
      t.kind,
      t.targetId,
    ),
    index("bookmarks_user_idx").on(t.userId, t.createdAt),
  ],
);

export const userPreferencesTable = pgTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  theme: text("theme").notNull().default("light"),
  accent: text("accent").notNull().default("default"),
  emailMentions: boolean("email_mentions").notNull().default(true),
  emailReplies: boolean("email_replies").notNull().default(true),
  emailDms: boolean("email_dms").notNull().default(true),
  emailFollows: boolean("email_follows").notNull().default(false),
  emailReactions: boolean("email_reactions").notNull().default(false),
  pushMentions: boolean("push_mentions").notNull().default(true),
  pushReplies: boolean("push_replies").notNull().default(true),
  pushDms: boolean("push_dms").notNull().default(true),
  pushFollows: boolean("push_follows").notNull().default(true),
  pushReactions: boolean("push_reactions").notNull().default(false),
  emailAddress: text("email_address"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pushSubscriptionsTable = pgTable(
  "push_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("push_subscriptions_endpoint_unique").on(t.endpoint),
    index("push_subscriptions_user_idx").on(t.userId),
  ],
);

export const notificationDeliveriesTable = pgTable(
  "notification_deliveries",
  {
    id: serial("id").primaryKey(),
    notificationId: integer("notification_id")
      .notNull()
      .references(() => notificationsTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    status: text("status").notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("notification_deliveries_notif_idx").on(t.notificationId),
    index("notification_deliveries_user_idx").on(t.userId, t.createdAt),
  ],
);

export type Bookmark = typeof bookmarksTable.$inferSelect;
export type UserPreferences = typeof userPreferencesTable.$inferSelect;
export type PushSubscription = typeof pushSubscriptionsTable.$inferSelect;
export type NotificationDelivery =
  typeof notificationDeliveriesTable.$inferSelect;

export type Post = typeof postsTable.$inferSelect;
export type PostMedia = typeof postMediaTable.$inferSelect;
export type Poll = typeof pollsTable.$inferSelect;
export type PollOption = typeof pollOptionsTable.$inferSelect;
export type PollVote = typeof pollVotesTable.$inferSelect;
export type MessageAttachment = typeof messageAttachmentsTable.$inferSelect;
export type UserFollow = typeof userFollowsTable.$inferSelect;
export type UserBlock = typeof userBlocksTable.$inferSelect;
export type UserMute = typeof userMutesTable.$inferSelect;
export type HashtagMute = typeof hashtagMutesTable.$inferSelect;
export type Notification = typeof notificationsTable.$inferSelect;
export type MvpCode = typeof mvpCodesTable.$inferSelect;
export type UserPhoto = typeof userPhotosTable.$inferSelect;
export type Call = typeof callsTable.$inferSelect;
export type CallParticipant = typeof callParticipantsTable.$inferSelect;
export type CallSignal = typeof callSignalsTable.$inferSelect;
export type Friendship = typeof friendshipsTable.$inferSelect;
export type User = typeof usersTable.$inferSelect;
export type Hashtag = typeof hashtagsTable.$inferSelect;
export type UserHashtag = typeof userHashtagsTable.$inferSelect;
export type Conversation = typeof conversationsTable.$inferSelect;
export type Message = typeof messagesTable.$inferSelect;
export type Reaction = typeof reactionsTable.$inferSelect;
