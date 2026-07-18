import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pagesRouter from "./pages";
import slotsRouter from "./slots";
import authRouter from "./auth";
import organiserRouter from "./organiser";
import invitesRouter from "./invites";
import pilotRouter from "./pilot";
import giftsRouter from "./gifts";
import stripeRouter from "./stripe";
import internalRouter from "./internal";
import devRouter from "./dev";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pagesRouter);
router.use(slotsRouter);
router.use(authRouter);
router.use(organiserRouter);
router.use(invitesRouter);
router.use(pilotRouter);
router.use(giftsRouter);
router.use(stripeRouter);
router.use(internalRouter);

// Scaffolding for testing the fulfilment flow before Item 2 exists. Never
// mounted in production, so the route simply does not exist on Railway.
if (process.env.NODE_ENV !== "production") {
  router.use(devRouter);
}

export default router;
