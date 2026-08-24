import express from "express";
import { searchWorkspace } from "../controllers/searchController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = express.Router();
router.use(authMiddleware);
router.get("/:chatId", searchWorkspace);

export default router;
