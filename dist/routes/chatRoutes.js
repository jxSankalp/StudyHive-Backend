"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const chatController_1 = require("../controllers/chatController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// Protect all routes with authentication
router.use(authMiddleware_1.authMiddleware);
router.get("/", chatController_1.getAllChats);
router.get("/:chatId/stats", chatController_1.getChatStats);
router.get("/:chatId/reads", chatController_1.getChatReadReceipts);
router.post("/:chatId/read", chatController_1.markChatRead);
router.post("/", chatController_1.createGroupChat);
router.route("/rename").put(chatController_1.renameGroup);
router.route("/groupremove").put(chatController_1.removeFromGroup);
router.route("/groupadd").put(chatController_1.addToGroup);
router.route("/role").put(chatController_1.updateMemberRole);
exports.default = router;
