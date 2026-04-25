"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/whiteboardRoutes.ts
const express_1 = require("express");
const whiteBoardController_1 = require("../controllers/whiteBoardController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// Protect all routes
router.use(authMiddleware_1.authMiddleware);
router.route("/").post(whiteBoardController_1.createWhiteboard);
router.route("/group/:groupId").get(whiteBoardController_1.getWhiteboardsByGroup);
router.route("/:id").get(whiteBoardController_1.getWhiteboardById);
router.route("/:id/save").put(whiteBoardController_1.saveWhiteboardState);
exports.default = router;
