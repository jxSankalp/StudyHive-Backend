import express from "express";
import { allMessages, sendMessage } from "../controllers/messageController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = express.Router();

// Protect all routes
router.use(authMiddleware);

router.route("/:chatId").get(allMessages);
router.route("/").post(sendMessage);

export default router;
