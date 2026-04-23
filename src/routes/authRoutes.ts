import { Router } from "express";
import { getMe, upsertProfile } from "../controllers/authController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

router.get("/me", authMiddleware, getMe);
router.post("/profile", authMiddleware, upsertProfile);

export default router;
