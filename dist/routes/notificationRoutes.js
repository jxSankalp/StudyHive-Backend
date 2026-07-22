"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const notificationController_1 = require("../controllers/notificationController");
const router = express_1.default.Router();
router.use(authMiddleware_1.authMiddleware);
router.get("/", notificationController_1.listNotifications);
router.patch("/read-all", notificationController_1.markAllNotificationsRead);
router.patch("/:notificationId/read", notificationController_1.markNotificationRead);
exports.default = router;
