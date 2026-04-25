"use strict";
// user.service.ts — deprecated after Supabase migration.
// All user DB logic is now directly in userController.ts using the Supabase client.
// This file is kept as a no-op stub to avoid breaking any old imports.
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUserFromDB = exports.updateUserInDB = exports.getUserByIdFromDB = exports.createUserInDB = void 0;
const createUserInDB = async (_params) => null;
exports.createUserInDB = createUserInDB;
const getUserByIdFromDB = async (_userId) => null;
exports.getUserByIdFromDB = getUserByIdFromDB;
const updateUserInDB = async (_userId, _params) => null;
exports.updateUserInDB = updateUserInDB;
const deleteUserFromDB = async (_userId) => null;
exports.deleteUserFromDB = deleteUserFromDB;
