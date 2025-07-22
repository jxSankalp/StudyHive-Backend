import { StreamClient } from "@stream-io/node-sdk";
import dotenv from "dotenv";

dotenv.config();

export const streamClient = new StreamClient(
  process.env.STREAM_API_KEY!,
  process.env.STREAM_API_SECRET!,
  {
    timeout: 3000,
  }
);
