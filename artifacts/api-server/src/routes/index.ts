import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pagesRouter from "./pages";
import slotsRouter from "./slots";
import authRouter from "./auth";
import organiserRouter from "./organiser";
import invitesRouter from "./invites";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pagesRouter);
router.use(slotsRouter);
router.use(authRouter);
router.use(organiserRouter);
router.use(invitesRouter);

export default router;
