import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pagesRouter from "./pages";
import slotsRouter from "./slots";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pagesRouter);
router.use(slotsRouter);

export default router;
