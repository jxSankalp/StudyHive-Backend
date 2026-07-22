"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const fileController_1 = require("../controllers/fileController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.use(authMiddleware_1.authMiddleware);
router.post("/upload-url", fileController_1.createChatFileUpload);
router.post("/:fileId/complete", fileController_1.completeChatFileUpload);
router.delete("/:fileId", fileController_1.deleteChatFileUpload);
exports.default = router;
