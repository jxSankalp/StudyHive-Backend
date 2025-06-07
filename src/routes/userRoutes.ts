import express from "express";
import {
  createUser,
  getUserById,
  updateUser,
  deleteUser,
  searchUsers,
} from "../controllers/userController";

const router = express.Router();

router.post("/", createUser);
router.get("/search", searchUsers);
router.get("/:id", getUserById);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);

export default router;
