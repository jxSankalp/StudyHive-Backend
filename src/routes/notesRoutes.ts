import express from "express";
import { allNotes, createNote, deleteNote, getNoteById  , } from "../controllers/notesController";

const router = express.Router();

router.route("/:notesId").get(getNoteById);
router.route("/").get(allNotes);
router.route("/").post(createNote);
router.route("/:notesId").delete(deleteNote);

export default router;
