// user.service.ts — deprecated after Supabase migration.
// All user DB logic is now directly in userController.ts using the Supabase client.
// This file is kept as a no-op stub to avoid breaking any old imports.

import { UpdateUserParams } from "../types/user";

export const createUserInDB = async (_params: any) => null;
export const getUserByIdFromDB = async (_userId: string) => null;
export const updateUserInDB = async (_userId: string, _params: UpdateUserParams) => null;
export const deleteUserFromDB = async (_userId: string) => null;
