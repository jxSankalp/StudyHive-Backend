"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const videoController_1 = require("../controllers/videoController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// Protect all routes
router.use(authMiddleware_1.authMiddleware);
router.post("/create-call", videoController_1.createVideoCall); // /api/meet/create-call
router.post("/get-token", videoController_1.generateUserToken); // /api/meet/get-token
router.get("/:chatId", videoController_1.getMeetingsForChat);
exports.default = router;
