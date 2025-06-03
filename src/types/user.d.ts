export type CreateUserParams = {
  clerkId: string;
  email: string;
  username: string;
  photo?: string;
};

export type UpdateUserParams = {
  username: string;
  photo?: string;
};
