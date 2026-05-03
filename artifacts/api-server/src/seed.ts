import {
  db,
  usersTable,
  hashtagsTable,
  userHashtagsTable,
  userFollowedHashtagsTable,
  conversationsTable,
  conversationMembersTable,
  messagesTable,
  reactionsTable,
} from "@workspace/db";

const SEED_USERS = [
  {
    id: "seed_maya_chen",
    username: "mayachen",
    displayName: "Maya Chen",
    bio: "Type system enjoyer. Builds tiny tools.",
    avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=maya",
    status: "online",
    tags: ["typescript", "rustlang", "vim", "specialtycoffee", "indiehackers"],
    follows: ["typescript", "rustlang", "minimaltech"],
  },
  {
    id: "seed_jordan_park",
    username: "jordanpark",
    displayName: "Jordan Park",
    bio: "Synth nerd. Modular at 2am.",
    avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=jordan",
    status: "online",
    tags: ["vintagesynths", "ambientmusic", "modular", "berlin", "coffee"],
    follows: ["vintagesynths", "ambientmusic"],
  },
  {
    id: "seed_riley_okafor",
    username: "rileyokafor",
    displayName: "Riley Okafor",
    bio: "Climbing 5.12s and writing about it.",
    avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=riley",
    status: "away",
    tags: ["climbing", "bouldering", "trailrunning", "books", "fiction"],
    follows: ["climbing", "trailrunning"],
  },
  {
    id: "seed_sofia_alvarez",
    username: "sofialvarez",
    displayName: "Sofia Alvarez",
    bio: "Pasta from scratch. Always.",
    avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=sofia",
    status: "online",
    tags: ["pasta", "homecooking", "natural wine".replace(/\s/g, ""), "florence", "books"],
    follows: ["homecooking", "naturalwine"],
  },
  {
    id: "seed_kenji_watanabe",
    username: "kenjiw",
    displayName: "Kenji Watanabe",
    bio: "Film photography. 35mm forever.",
    avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=kenji",
    status: "online",
    tags: ["filmphotography", "tokyo", "minimaltech", "ambientmusic"],
    follows: ["filmphotography", "tokyo"],
  },
  {
    id: "seed_amelia_brooks",
    username: "ameliab",
    displayName: "Amelia Brooks",
    bio: "Reading 100 books this year. On 47.",
    avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=amelia",
    status: "online",
    tags: ["books", "fiction", "scifi", "writing", "coffee"],
    follows: ["books", "scifi", "writing"],
  },
  {
    id: "seed_diego_morales",
    username: "diegom",
    displayName: "Diego Morales",
    bio: "Indie game dev. Pixels and physics.",
    avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=diego",
    status: "online",
    tags: ["gamedev", "pixelart", "godot", "indiehackers", "typescript"],
    follows: ["gamedev", "godot", "indiehackers"],
  },
  {
    id: "seed_priya_sharma",
    username: "priyas",
    displayName: "Priya Sharma",
    bio: "Tea, plants, and quiet mornings.",
    avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=priya",
    status: "online",
    tags: ["tea", "houseplants", "minimaltech", "writing", "books"],
    follows: ["tea", "houseplants", "books"],
  },
];

const ROOM_SEEDS: { tag: string; messages: { senderId: string; content: string }[] }[] = [
  {
    tag: "typescript",
    messages: [
      { senderId: "seed_maya_chen", content: "satisfies has changed how I write configs forever." },
      { senderId: "seed_diego_morales", content: "agreed. const assertions + satisfies = chef's kiss" },
      { senderId: "seed_maya_chen", content: "anyone using ts-reset? worth it?" },
      { senderId: "seed_diego_morales", content: "yes — Array.includes returning never[] alone is worth the install" },
    ],
  },
  {
    tag: "vintagesynths",
    messages: [
      { senderId: "seed_jordan_park", content: "finally got the OB-X8 patched into my eurorack. it's glorious." },
      { senderId: "seed_kenji_watanabe", content: "share a clip when you can — I'm saving for one" },
      { senderId: "seed_jordan_park", content: "will do. it pairs disgustingly well with the Mutable Rings" },
    ],
  },
  {
    tag: "specialtycoffee",
    messages: [
      { senderId: "seed_maya_chen", content: "trying a Yirgacheffe from Onyx today. blueberries for days." },
      { senderId: "seed_amelia_brooks", content: "what brew method?" },
      { senderId: "seed_maya_chen", content: "v60, 1:16, 95C. 3:15 total." },
    ],
  },
  {
    tag: "books",
    messages: [
      { senderId: "seed_amelia_brooks", content: "just finished Piranesi. couldn't put it down." },
      { senderId: "seed_riley_okafor", content: "Susanna Clarke is on another level. JSAMN next?" },
      { senderId: "seed_priya_sharma", content: "JSAMN is my comfort book. 1000 pages of joy." },
    ],
  },
  {
    tag: "climbing",
    messages: [
      { senderId: "seed_riley_okafor", content: "sent my first 5.12a yesterday. legs still shaking." },
      { senderId: "seed_jordan_park", content: "huge! what was the route?" },
      { senderId: "seed_riley_okafor", content: "Yellow Wall at Smith Rock. felt like flying." },
    ],
  },
  {
    tag: "homecooking",
    messages: [
      { senderId: "seed_sofia_alvarez", content: "fresh tagliatelle, brown butter, sage. 12 minutes flat." },
      { senderId: "seed_priya_sharma", content: "the brown butter trick is criminally underrated" },
    ],
  },
  {
    tag: "filmphotography",
    messages: [
      { senderId: "seed_kenji_watanabe", content: "Portra 400 in Tokyo at golden hour > everything." },
      { senderId: "seed_amelia_brooks", content: "saving up for a Leica M6. talk me out of it." },
      { senderId: "seed_kenji_watanabe", content: "I won't. it's the best decision I've made." },
    ],
  },
  {
    tag: "gamedev",
    messages: [
      { senderId: "seed_diego_morales", content: "shipped a playable demo of my pixel-art platformer today!" },
      { senderId: "seed_maya_chen", content: "link?? I want to play" },
      { senderId: "seed_diego_morales", content: "DM coming your way" },
    ],
  },
  {
    tag: "ambientmusic",
    messages: [
      { senderId: "seed_jordan_park", content: "rediscovered Music for Airports today. perfect rainy morning record." },
      { senderId: "seed_kenji_watanabe", content: "Eno is eternal. have you heard the Loraine James reworks?" },
      { senderId: "seed_jordan_park", content: "yes!! she did them justice" },
    ],
  },
];

async function main() {
  console.log("Seeding HashChat...");

  const allTags = new Set<string>();
  for (const u of SEED_USERS) {
    for (const t of u.tags) allTags.add(t);
    for (const t of u.follows) allTags.add(t);
  }
  for (const r of ROOM_SEEDS) allTags.add(r.tag);

  await db
    .insert(hashtagsTable)
    .values(Array.from(allTags).map((tag) => ({ tag })))
    .onConflictDoNothing();

  await db
    .insert(usersTable)
    .values(
      SEED_USERS.map(({ tags, follows, ...rest }) => rest),
    )
    .onConflictDoNothing();

  for (const u of SEED_USERS) {
    await db
      .insert(userHashtagsTable)
      .values(u.tags.map((tag) => ({ userId: u.id, tag })))
      .onConflictDoNothing();
    await db
      .insert(userFollowedHashtagsTable)
      .values(u.follows.map((tag) => ({ userId: u.id, tag })))
      .onConflictDoNothing();
  }

  for (const room of ROOM_SEEDS) {
    let i = 0;
    for (const m of room.messages) {
      const createdAt = new Date(Date.now() - (room.messages.length - i) * 5 * 60 * 1000);
      await db
        .insert(messagesTable)
        .values({ roomTag: room.tag, senderId: m.senderId, content: m.content, createdAt });
      i++;
    }
  }

  // A couple of DM conversations
  const [convo1] = await db
    .insert(conversationsTable)
    .values({
      kind: "direct",
      userAId: "seed_jordan_park",
      userBId: "seed_maya_chen",
      creatorId: "seed_jordan_park",
    })
    .onConflictDoNothing()
    .returning();
  const [convo2] = await db
    .insert(conversationsTable)
    .values({
      kind: "direct",
      userAId: "seed_amelia_brooks",
      userBId: "seed_riley_okafor",
      creatorId: "seed_amelia_brooks",
    })
    .onConflictDoNothing()
    .returning();

  if (convo1) {
    await db
      .insert(conversationMembersTable)
      .values([
        { conversationId: convo1.id, userId: "seed_jordan_park" },
        { conversationId: convo1.id, userId: "seed_maya_chen" },
      ])
      .onConflictDoNothing();
  }
  if (convo2) {
    await db
      .insert(conversationMembersTable)
      .values([
        { conversationId: convo2.id, userId: "seed_amelia_brooks" },
        { conversationId: convo2.id, userId: "seed_riley_okafor" },
      ])
      .onConflictDoNothing();
  }

  // A small group chat seed.
  const [groupConvo] = await db
    .insert(conversationsTable)
    .values({
      kind: "group",
      title: "Coffee Crew",
      creatorId: "seed_maya_chen",
    })
    .returning();
  if (groupConvo) {
    await db
      .insert(conversationMembersTable)
      .values([
        { conversationId: groupConvo.id, userId: "seed_maya_chen" },
        { conversationId: groupConvo.id, userId: "seed_jordan_park" },
        { conversationId: groupConvo.id, userId: "seed_amelia_brooks" },
      ])
      .onConflictDoNothing();
    await db.insert(messagesTable).values([
      {
        conversationId: groupConvo.id,
        senderId: "seed_maya_chen",
        kind: "system",
        content: "created the group",
        createdAt: new Date(Date.now() - 90 * 60 * 1000),
      },
      {
        conversationId: groupConvo.id,
        senderId: "seed_jordan_park",
        content: "anyone going to the new roastery on Friday?",
        createdAt: new Date(Date.now() - 80 * 60 * 1000),
      },
      {
        conversationId: groupConvo.id,
        senderId: "seed_amelia_brooks",
        content: "I'm in! 5pm?",
        createdAt: new Date(Date.now() - 70 * 60 * 1000),
      },
    ]);
  }

  if (convo1) {
    await db.insert(messagesTable).values([
      { conversationId: convo1.id, senderId: "seed_jordan_park", content: "saw you mention the Yirgacheffe — try it as an espresso shot, you'll thank me", createdAt: new Date(Date.now() - 30 * 60 * 1000) },
      { conversationId: convo1.id, senderId: "seed_maya_chen", content: "wait really? I always pour-over single origins", createdAt: new Date(Date.now() - 25 * 60 * 1000) },
      { conversationId: convo1.id, senderId: "seed_jordan_park", content: "trust me. lower temp, finer grind, 22g out", createdAt: new Date(Date.now() - 20 * 60 * 1000) },
    ]);
  }
  if (convo2) {
    await db.insert(messagesTable).values([
      { conversationId: convo2.id, senderId: "seed_amelia_brooks", content: "what climbing book would you recommend for someone who's never climbed?", createdAt: new Date(Date.now() - 60 * 60 * 1000) },
      { conversationId: convo2.id, senderId: "seed_riley_okafor", content: "Alone on the Wall by Alex Honnold. it's not technical, it's about why we climb.", createdAt: new Date(Date.now() - 55 * 60 * 1000) },
    ]);
  }

  // A few reactions
  const recentMsgs = await db.select().from(messagesTable).limit(20);
  if (recentMsgs.length >= 2) {
    await db
      .insert(reactionsTable)
      .values([
        { messageId: recentMsgs[0].id, userId: "seed_diego_morales", emoji: "🔥" },
        { messageId: recentMsgs[1].id, userId: "seed_maya_chen", emoji: "💯" },
        { messageId: recentMsgs[1].id, userId: "seed_amelia_brooks", emoji: "💯" },
      ])
      .onConflictDoNothing();
  }

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
