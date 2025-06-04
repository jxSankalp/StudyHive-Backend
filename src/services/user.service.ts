import { User } from "../models/User";
import { CreateUserParams, UpdateUserParams } from "../types/user";

export const createUserInDB = async (params: CreateUserParams) => {
    try {
        const { clerkId, email, username, photo } = params;
        const newUser = await User.create({ clerkId, email, username, photo });
        return newUser;
    } catch (error) {
        throw error;
    }
};

export const getUserByIdFromDB = async (id: string) => {
    try {
        return await User.findById(id);
    } catch (error) {
        throw error;
    }
};

export const updateUserInDB = async (id: string, params: UpdateUserParams) => {
    try {
        const { username, photo } = params;
        return await User.findByIdAndUpdate(id, { username, photo }, { new: true });
    } catch (error) {
        throw error;
    }
};

export const deleteUserFromDB = async (id: string) => {
    try {
        return await User.findByIdAndDelete(id);
    } catch (error) {
        throw error;
    }
};
