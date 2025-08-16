// src/routes/whiteboardRoutes.ts
import { Router } from "express";
import {
  createWhiteboard,
  getWhiteboardsByGroup,
  getWhiteboardById,
  saveWhiteboardState,
} from "../controllers/whiteBoardController";


const router = Router();

router.route("/").post(createWhiteboard);
router.route("/group/:groupId").get(getWhiteboardsByGroup);
router.route("/:id").get(getWhiteboardById);
router.route("/:id/save").put( saveWhiteboardState);

export default router;