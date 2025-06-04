import { Request, Response } from "express";
import {
  createUserInDB,
  getUserByIdFromDB,
  updateUserInDB,
  deleteUserFromDB,
} from "../services/user.service";
import { UpdateUserParams } from "../types/user";

export const createUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const newUser = await createUserInDB(req.body);
    res.status(201).json(newUser);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const getUserById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const user = await getUserByIdFromDB(req.params.id);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const updateUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const updatedUser = await updateUserInDB(
      req.params.id,
      req.body as UpdateUserParams
    );
    if (!updatedUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(updatedUser);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const deleteUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const deletedUser = await deleteUserFromDB(req.params.id);
    if (!deletedUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ message: "User deleted successfully" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};
