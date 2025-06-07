import express from "express";
import { createGroupChat, getAllChats, getChatById } from "../controllers/chatController";

const router = express.Router();

router.get("/", getAllChats);
router.post("/", createGroupChat);
router.get("/:id", getChatById);
// router.route("/:id/rename").put (renameGroup);
// router.route("/:id/groupremove").put(removeFromGroup);
// router.route("/:id/groupadd").put(addToGroup);

export default router;
