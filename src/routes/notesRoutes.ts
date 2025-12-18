import express from "express";
import {
  allNotes,
  createNote,
  getNoteById,
  deleteNote,
  updateNote,
} from "../controllers/notesController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = express.Router();

// Protect all routes
router.use(authMiddleware);

router.route("/").get(allNotes).post(createNote);
router.route("/:notesId").get(getNoteById).delete(deleteNote).put(updateNote);

export default router;
