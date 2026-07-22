import express from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../controllers/notificationController";
const router = express.Router();
router.use(authMiddleware);
router.get("/", listNotifications);
router.patch("/read-all", markAllNotificationsRead);
router.patch("/:notificationId/read", markNotificationRead);
export default router;
