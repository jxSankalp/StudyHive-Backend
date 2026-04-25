"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const notesController_1 = require("../controllers/notesController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// Protect all routes
router.use(authMiddleware_1.authMiddleware);
router.route("/").get(notesController_1.allNotes).post(notesController_1.createNote);
router.route("/:notesId").get(notesController_1.getNoteById).delete(notesController_1.deleteNote).put(notesController_1.updateNote);
exports.default = router;
