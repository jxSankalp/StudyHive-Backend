import { Router } from "express";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents,
  updateCalendarEvent,
} from "../controllers/calendarController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();
router.use(authMiddleware);
router.get("/", listCalendarEvents);
router.post("/", createCalendarEvent);
router.put("/:eventId", updateCalendarEvent);
router.delete("/:eventId", deleteCalendarEvent);

export default router;
