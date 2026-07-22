export type WorkspaceRole = "owner" | "admin" | "member" | null;

export const canManageWorkspace = (role: WorkspaceRole): boolean =>
  role === "owner" || role === "admin";

export const canChangeMemberRole = (
  actorRole: WorkspaceRole,
  targetRole: WorkspaceRole
): boolean => actorRole === "owner" && targetRole !== null && targetRole !== "owner";

export const canRemoveWorkspaceMember = (
  actorRole: WorkspaceRole,
  targetRole: WorkspaceRole,
  removingSelf: boolean
): boolean => {
  if (removingSelf || targetRole === null || targetRole === "owner") return false;
  if (actorRole === "owner") return true;
  return actorRole === "admin" && targetRole === "member";
};

export const canEditTaskDetails = (
  role: WorkspaceRole,
  isCreator: boolean
): boolean => canManageWorkspace(role) || isCreator;

export const canUpdateTaskStatus = (
  role: WorkspaceRole,
  isCreator: boolean,
  isAssignee: boolean
): boolean => canEditTaskDetails(role, isCreator) || isAssignee;

export const canDeleteMessage = (isSender: boolean, role: WorkspaceRole): boolean =>
  isSender || canManageWorkspace(role);

