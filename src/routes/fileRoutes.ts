import express from "express";
import { completeChatFileUpload, createChatFileUpload, deleteChatFileUpload } from "../controllers/fileController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = express.Router();
router.use(authMiddleware);
router.post("/upload-url", createChatFileUpload);
router.post("/:fileId/complete", completeChatFileUpload);
router.delete("/:fileId", deleteChatFileUpload);

export default router;
