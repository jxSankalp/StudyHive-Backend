import express from "express";
import {
  addToGroup,
  createGroupChat,
  getAllChats,
  removeFromGroup,
  renameGroup,
} from "../controllers/chatController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = express.Router();

// Protect all routes with authentication
router.use(authMiddleware);

router.get("/", getAllChats);
router.post("/", createGroupChat);
router.route("/rename").put(renameGroup);
router.route("/groupremove").put(removeFromGroup);
router.route("/groupadd").put(addToGroup);

export default router;
