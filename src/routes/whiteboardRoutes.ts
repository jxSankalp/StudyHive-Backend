import express from "express";
import {
  createWhiteboard,
  getWhiteboardsByChat,
  getWhiteboardById,
  updateWhiteboard,
} from "../controllers/whiteboardController";

const router = express.Router();

router.post("/", createWhiteboard);
router.get("/chat/:chatId", getWhiteboardsByChat);
router.get("/:id", getWhiteboardById);
router.put("/:id", updateWhiteboard);

export default router;
