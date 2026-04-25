import express from "express";
import {
  createVideoCall,
  generateUserToken,
  getMeetingsForChat,
  updateMeetingStatus,
} from "../controllers/videoController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

router.post("/create-call", createVideoCall);       // POST /api/meet/create-call
router.post("/get-token", generateUserToken);        // POST /api/meet/get-token
router.get("/:chatId", getMeetingsForChat);          // GET  /api/meet/:chatId
router.patch("/:meetingId/status", updateMeetingStatus); // PATCH /api/meet/:meetingId/status

export default router;
