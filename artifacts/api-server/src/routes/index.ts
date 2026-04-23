import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import hashtagsRouter from "./hashtags";
import discoveryRouter from "./discovery";
import conversationsRouter from "./conversations";
import messagesRouter from "./messages";
import roomsRouter from "./rooms";
import statsRouter from "./stats";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(hashtagsRouter);
router.use(discoveryRouter);
router.use(conversationsRouter);
router.use(messagesRouter);
router.use(roomsRouter);
router.use(statsRouter);

export default router;
