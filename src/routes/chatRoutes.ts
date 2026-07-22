import express from "express";
import {
  addToGroup,
  createGroupChat,
  getAllChats,
  getChatStats,
  getChatReadReceipts,
  markChatRead,
  removeFromGroup,
  renameGroup,
  updateMemberRole,
} from "../controllers/chatController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = express.Router();

// Protect all routes with authentication
router.use(authMiddleware);

router.get("/", getAllChats);
router.get("/:chatId/stats", getChatStats);
router.get("/:chatId/reads", getChatReadReceipts);
router.post("/:chatId/read", markChatRead);
router.post("/", createGroupChat);
router.route("/rename").put(renameGroup);
router.route("/groupremove").put(removeFromGroup);
router.route("/groupadd").put(addToGroup);
router.route("/role").put(updateMemberRole);

export default router;
