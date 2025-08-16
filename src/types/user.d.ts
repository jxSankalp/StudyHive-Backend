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

export type User = {
  _id: string;
  clerkId: string;
  email: string;
  username: string;
  photo?: string;
  chats: string[] | Chat[];
};

export type Chat = {
  _id: string;
  chatName: string;
  description?: string;
  users: string[] | User[];
  latestMessage?: string | Message;
  groupAdmin: string | User;
  createdAt: Date;
  updatedAt: Date;
};

export type Message = {
  _id: string;
  sender: string | User;
  content: string;
  chat: string | Chat;
  readBy: string[] | User[];
  createdAt: Date;
  updatedAt: Date;
};


export type Whiteboard = {
  _id: string;
  name: string;
  groupId: string;
  createdBy: {
    _id: string;
    username: string;
  };
  data: any; // Stores the canvas state (e.g., JSON representation)
  createdAt: string;
  updatedAt: string;
};
