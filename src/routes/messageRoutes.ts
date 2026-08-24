import express from "express";
import { allMessages, deleteMessage, getMessageById, sendMessage, toggleReaction, updateMessage } from "../controllers/messageController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = express.Router();

// Protect all routes
router.use(authMiddleware);

router.route("/:chatId").get(allMessages);
router.get("/:chatId/:messageId", getMessageById);
router.route("/").post(sendMessage);
router.patch("/:messageId", updateMessage);
router.delete("/:messageId", deleteMessage);
router.post("/:messageId/reactions", toggleReaction);

export default router;
