import express from "express";
import {
  createUser,
  getUserById,
  updateUser,
  deleteUser,
  searchUsers,
  getCurrentUser,
} from "../controllers/userController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = express.Router();

router.get("/me", authMiddleware, getCurrentUser);
router.post("/", createUser);
router.get("/search", authMiddleware, searchUsers);
router.get("/:id", authMiddleware, getUserById);
router.put("/:id", authMiddleware, updateUser);
router.delete("/:id", authMiddleware, deleteUser);

export default router;
