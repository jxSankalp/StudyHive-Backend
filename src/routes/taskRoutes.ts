import express from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { createTask, deleteTask, listTasks, updateTask } from "../controllers/taskController";

const router = express.Router();
router.use(authMiddleware);
router.get("/:chatId", listTasks);
router.post("/", createTask);
router.patch("/:taskId", updateTask);
router.delete("/:taskId", deleteTask);
export default router;
