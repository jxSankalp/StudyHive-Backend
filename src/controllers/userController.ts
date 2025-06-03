import { Request, Response } from 'express';
import { User } from '../models/User';
import { CreateUserParams, UpdateUserParams } from '../types/user';

export const createUser = async (req: Request, res: Response): Promise<void> => {
  const { clerkId, email, username, photo } = req.body as CreateUserParams;
  try {
    const newUser = await User.create({ clerkId, email, username, photo });
    res.status(201).json(newUser);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const getUserById = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const updateUser = async (req: Request, res: Response): Promise<void> => {
  const { username, photo } = req.body as UpdateUserParams;
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { username, photo },
      { new: true }
    );
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ message: 'User deleted successfully' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};
