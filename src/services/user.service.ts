import { User } from "../models/userModel";
import { CreateUserParams, UpdateUserParams } from "../types/user";

export const createUserInDB = async (params: CreateUserParams) => {
  const { email, username, password, photo } = params;
  return await User.create({ email, username, password, photo });
};

export const getUserByIdFromDB = async (userId: string) => {
  return await User.findById(userId);
};

export const updateUserInDB = async (
  userId: string,
  params: UpdateUserParams
) => {
  const { username, photo } = params;
  return await User.findByIdAndUpdate(
    userId,
    { username, photo },
    { new: true }
  );
};

export const deleteUserFromDB = async (userId: string) => {
  return await User.findByIdAndDelete(userId);
};
