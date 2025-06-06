import { Request, Response } from "express";
import dotenv from "dotenv";
import {
  createUserInDB,
  deleteUserFromDB,
  updateUserInDB,
} from "../services/user.service";
const express = require("express");
const router = express.Router();
const { Webhook } = require("svix");
const bodyParser = require("body-parser");
const { clerkClient } = require("@clerk/clerk-sdk-node");

dotenv.config();

const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SIGNING_SECRET;

if (!WEBHOOK_SECRET) {
  throw new Error("Missing Clerk webhook signing secret");
}

// This must be raw!
router.post(
  "/",
  bodyParser.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    const svix = new Webhook(WEBHOOK_SECRET);

    let evt;
    try {
      const payload = req.body;
      const headers = req.headers;
      evt = svix.verify(payload, headers);
    } catch (err) {
      console.error("❌ Webhook verification failed:", err);
      return res.status(400).json({ error: "Invalid signature" });
    }

    try {
      const { id, type: eventType, data } = evt;

      // Handle user.created
      if (eventType === "user.created") {
        const { id, email_addresses, username } = data;

        const newUser = await createUserInDB({
          clerkId: id,
          email: email_addresses[0]?.email_address || "",
          username: username || "",
        });

        await clerkClient.users.updateUserMetadata(id, {
          publicMetadata: {
            userId: newUser._id,
          },
        });

        return res.status(200).json({ message: "User created", user: newUser });
      }

      // Handle user.updated
      if (eventType === "user.updated") {
        const { id, image_url, username } = data;

        const updatedUser = await updateUserInDB(id, {
          username: username || "",
          photo: image_url || "",
        });

        return res
          .status(200)
          .json({ message: "User updated", user: updatedUser });
      }

      // Handle user.deleted
      if (eventType === "user.deleted") {
        const userId1 = data.id || "";
        const deletedUser = await deleteUserFromDB(userId1);

        return res
          .status(200)
          .json({ message: "User deleted", user: deletedUser });
      }

      // Event not handled
      return res.status(200).json({ message: "Event type not handled" });
    } catch (err) {
      console.error("❌ Error handling webhook:", err);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

export default router;
