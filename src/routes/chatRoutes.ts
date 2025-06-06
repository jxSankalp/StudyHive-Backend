import express from "express";
import { getAllChats, getChatById } from "../controllers/chatController";

const router = express.Router();

router.get("/", getAllChats);
router.get("/:id", getChatById);

export default router;
