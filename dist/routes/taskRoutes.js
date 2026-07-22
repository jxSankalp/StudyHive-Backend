"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const taskController_1 = require("../controllers/taskController");
const router = express_1.default.Router();
router.use(authMiddleware_1.authMiddleware);
router.get("/:chatId", taskController_1.listTasks);
router.post("/", taskController_1.createTask);
router.patch("/:taskId", taskController_1.updateTask);
router.delete("/:taskId", taskController_1.deleteTask);
exports.default = router;
