import express from "express";
import { createVideoCall, generateUserToken, getMeetingsForChat } from "../controllers/videoController";

const router = express.Router();

router.post("/create-call", createVideoCall); // /api/video/create-call
router.post("/get-token", generateUserToken); // /api/video/get-token
router.get("/:chatId", getMeetingsForChat); 
export default router;
