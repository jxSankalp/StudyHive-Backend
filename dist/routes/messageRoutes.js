"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const messageController_1 = require("../controllers/messageController");
const aiDigestController_1 = require("../controllers/aiDigestController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// Protect all routes
router.use(authMiddleware_1.authMiddleware);
router.route("/:chatId").get(messageController_1.allMessages);
router.post("/:chatId/catch-up", aiDigestController_1.createCatchUpDigest);
router.get("/:chatId/:messageId", messageController_1.getMessageById);
router.route("/").post(messageController_1.sendMessage);
router.patch("/:messageId", messageController_1.updateMessage);
router.delete("/:messageId", messageController_1.deleteMessage);
router.post("/:messageId/reactions", messageController_1.toggleReaction);
exports.default = router;
