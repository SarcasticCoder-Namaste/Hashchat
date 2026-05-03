import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import hashtagsRouter from "./hashtags";
import discoveryRouter from "./discovery";
import conversationsRouter from "./conversations";
import messagesRouter from "./messages";
import roomsRouter from "./rooms";
import statsRouter from "./stats";
import friendsRouter from "./friends";
import adminRouter from "./admin";
import mvpRouter from "./mvp";
import reelsRouter from "./reels";
import storageRouter from "./storage";
import photosRouter from "./photos";
import callsRouter from "./calls";
import postsRouter from "./posts";
import analyticsRouter from "./analytics";
import pollsRouter from "./polls";
import linkPreviewRouter from "./linkPreview";
import socialRouter from "./social";
import gifsRouter from "./gifs";
import notificationsRouter from "./notifications";
import eventsRouter from "./events";
import communitiesRouter from "./communities";
import premiumRouter from "./premium";
import searchRouter from "./search";
import bookmarksRouter from "./bookmarks";
import preferencesRouter from "./preferences";
import pushRouter from "./push";
import walletsRouter from "./wallets";
import presenceRouter from "./presence";
import moderationRouter from "./moderation";
import tipsRouter from "./tips";
import boostsRouter from "./boosts";
import reactionsPremiumRouter from "./reactionsPremium";

const router: IRouter = Router();

router.use(healthRouter);
// friendsRouter must be registered BEFORE usersRouter so its specific
// /users/lookup and /users/by-code/:code routes win over /users/:id.
router.use(friendsRouter);
router.use(usersRouter);
router.use(hashtagsRouter);
router.use(discoveryRouter);
router.use(conversationsRouter);
router.use(messagesRouter);
router.use(roomsRouter);
router.use(statsRouter);
router.use(adminRouter);
router.use(mvpRouter);
router.use(reelsRouter);
router.use(storageRouter);
router.use(photosRouter);
router.use(callsRouter);
router.use(postsRouter);
router.use(analyticsRouter);
router.use(pollsRouter);
router.use(linkPreviewRouter);
router.use(socialRouter);
router.use(gifsRouter);
router.use(notificationsRouter);
router.use(eventsRouter);
router.use(communitiesRouter);
router.use(premiumRouter);
router.use(searchRouter);
router.use(bookmarksRouter);
router.use(preferencesRouter);
router.use(pushRouter);
// walletsRouter must be registered BEFORE usersRouter would normally be, but
// since friendsRouter already comes first and usersRouter handles /users/:id,
// we register walletsRouter here so its /users/:id/wallets is matched by the
// more specific path first.
router.use(walletsRouter);
router.use(presenceRouter);
router.use(moderationRouter);
router.use(tipsRouter);
router.use(boostsRouter);
router.use(reactionsPremiumRouter);

export default router;
