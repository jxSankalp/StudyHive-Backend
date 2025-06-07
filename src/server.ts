import express from 'express';
import dotenv from 'dotenv';
import userRoutes from './routes/userRoutes';
import chatRoutes from './routes/chatRoutes';
import webhookRouter from './routes/webhooks';
import { clerkMiddleware } from "@clerk/express";
import { connectDB } from './config/db';

dotenv.config();

const app = express();

//Need to be before express.json() to ensure raw body is available for svix
app.use("/api/webhooks", webhookRouter);
app.use(clerkMiddleware());
app.use(express.json());

// Connect to DB
connectDB();

// Routes
app.use('/api/users', userRoutes);
app.use('/api/chat', chatRoutes);


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
