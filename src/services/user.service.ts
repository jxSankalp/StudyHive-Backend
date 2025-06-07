import { User } from "../models/userModel";
import { CreateUserParams, UpdateUserParams } from "../types/user";

export const createUserInDB = async (params: CreateUserParams) => {
  const { clerkId, email, username, photo } = params;
  return await User.create({ clerkId, email, username, photo });
};

export const getUserByIdFromDB = async (clerkId: string) => {
  return await User.findOne({ clerkId });
};

export const updateUserInDB = async (
  clerkId: string,
  params: UpdateUserParams
) => {
  const { username, photo } = params;
  return await User.findOneAndUpdate(
    { clerkId },
    { username, photo },
    { new: true }
  );
};

export const deleteUserFromDB = async (clerkId: string) => {
  return await User.findOneAndDelete({ clerkId });
};
