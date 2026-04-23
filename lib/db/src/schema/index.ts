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
  status: text("status").notNull().default("online"),
  featuredHashtag: text("featured_hashtag"),
  discriminator: text("discriminator"),
  role: text("role").notNull().default("user"),
  mvpPlan: boolean("mvp_plan").notNull().default(false),
  bannedAt: timestamp("banned_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [uniqueIndex("users_discriminator_unique").on(t.discriminator)]);

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
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] })],
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
