import express from "express";
import {
  addToGroup,
  createGroupChat,
  getAllChats,
  removeFromGroup,
  renameGroup,
} from "../controllers/chatController";

const router = express.Router();

router.get("/", getAllChats);
router.post("/", createGroupChat);
router.route("/rename").put(renameGroup);
router.route("/groupremove").put(removeFromGroup);
router.route("/groupadd").put(addToGroup);

export default router;
