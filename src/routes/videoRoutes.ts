import express from "express";
import { createVideoCall, generateUserToken, getMeetingsForChat } from "../controllers/videoController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = express.Router();

// Protect all routes
router.use(authMiddleware);

router.post("/create-call", createVideoCall); // /api/meet/create-call
router.post("/get-token", generateUserToken); // /api/meet/get-token
router.get("/:chatId", getMeetingsForChat); 
export default router;
