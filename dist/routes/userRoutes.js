"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const userController_1 = require("../controllers/userController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.get("/me", authMiddleware_1.authMiddleware, userController_1.getCurrentUser);
router.get("/me/stats", authMiddleware_1.authMiddleware, userController_1.getUserStats);
router.get("/search", authMiddleware_1.authMiddleware, userController_1.searchUsers);
router.get("/:id", authMiddleware_1.authMiddleware, userController_1.getUserById);
router.put("/:id", authMiddleware_1.authMiddleware, userController_1.updateUser);
router.delete("/:id", authMiddleware_1.authMiddleware, userController_1.deleteUser);
exports.default = router;
