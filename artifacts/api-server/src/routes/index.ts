import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pagesRouter from "./pages";
import slotsRouter from "./slots";
import calendarRouter from "./calendar";
import authRouter from "./auth";
import organiserRouter from "./organiser";
import crisisRouter from "./crisis";
import invitesRouter from "./invites";
import manageRouter from "./manage";
import optoutRouter from "./optout";
import pilotRouter from "./pilot";
import giftsRouter from "./gifts";
import giftCardsRouter from "./giftCards";
import stripeRouter from "./stripe";
import internalRouter from "./internal";
import adminStatsRouter from "./adminStats";
import devRouter from "./dev";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pagesRouter);
router.use(slotsRouter);
router.use(calendarRouter);
router.use(authRouter);
router.use(organiserRouter);
router.use(crisisRouter);
router.use(invitesRouter);
router.use(manageRouter);
router.use(optoutRouter);
router.use(pilotRouter);
router.use(giftsRouter);
router.use(giftCardsRouter);
router.use(stripeRouter);
router.use(internalRouter);
router.use(adminStatsRouter);

// Scaffolding for testing the fulfilment flow before Item 2 exists. Never
// mounted in production, so the route simply does not exist on Railway.
if (process.env.NODE_ENV !== "production") {
  router.use(devRouter);
}

export default router;
