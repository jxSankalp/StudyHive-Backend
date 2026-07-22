"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canDeleteMessage = exports.canUpdateTaskStatus = exports.canEditTaskDetails = exports.canRemoveWorkspaceMember = exports.canChangeMemberRole = exports.canManageWorkspace = void 0;
const canManageWorkspace = (role) => role === "owner" || role === "admin";
exports.canManageWorkspace = canManageWorkspace;
const canChangeMemberRole = (actorRole, targetRole) => actorRole === "owner" && targetRole !== null && targetRole !== "owner";
exports.canChangeMemberRole = canChangeMemberRole;
const canRemoveWorkspaceMember = (actorRole, targetRole, removingSelf) => {
    if (removingSelf || targetRole === null || targetRole === "owner")
        return false;
    if (actorRole === "owner")
        return true;
    return actorRole === "admin" && targetRole === "member";
};
exports.canRemoveWorkspaceMember = canRemoveWorkspaceMember;
const canEditTaskDetails = (role, isCreator) => (0, exports.canManageWorkspace)(role) || isCreator;
exports.canEditTaskDetails = canEditTaskDetails;
const canUpdateTaskStatus = (role, isCreator, isAssignee) => (0, exports.canEditTaskDetails)(role, isCreator) || isAssignee;
exports.canUpdateTaskStatus = canUpdateTaskStatus;
const canDeleteMessage = (isSender, role) => isSender || (0, exports.canManageWorkspace)(role);
exports.canDeleteMessage = canDeleteMessage;
