// src/routes/whiteboardRoutes.ts
import { Router } from "express";
import {
  createWhiteboard,
  getWhiteboardsByGroup,
  getWhiteboardById,
  saveWhiteboardState,
} from "../controllers/whiteBoardController";
import { authMiddleware } from "../middleware/authMiddleware";


const router = Router();

// Protect all routes
router.use(authMiddleware);

router.route("/").post(createWhiteboard);
router.route("/group/:groupId").get(getWhiteboardsByGroup);
router.route("/:id").get(getWhiteboardById);
router.route("/:id/save").put( saveWhiteboardState);

export default router;