import express from "express";
import {
  createUser,
  getUserById,
  updateUser,
  deleteUser,
  searchUsers,
  getCurrentUser,
} from "../controllers/userController";

const router = express.Router();

router.get("/me", getCurrentUser);
router.post("/", createUser);
router.get("/search", searchUsers);
router.get("/:id", getUserById);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);

export default router;
