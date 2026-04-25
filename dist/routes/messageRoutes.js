"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const messageController_1 = require("../controllers/messageController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// Protect all routes
router.use(authMiddleware_1.authMiddleware);
router.route("/:chatId").get(messageController_1.allMessages);
router.route("/").post(messageController_1.sendMessage);
exports.default = router;
