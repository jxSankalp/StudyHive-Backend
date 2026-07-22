const test = require("node:test");
const assert = require("node:assert/strict");
const {
  canChangeMemberRole,
  canDeleteMessage,
  canEditTaskDetails,
  canManageWorkspace,
  canRemoveWorkspaceMember,
  canUpdateTaskStatus,
} = require("../dist/lib/permissions.js");

test("owners and admins manage workspaces, members and non-members do not", () => {
  assert.equal(canManageWorkspace("owner"), true);
  assert.equal(canManageWorkspace("admin"), true);
  assert.equal(canManageWorkspace("member"), false);
  assert.equal(canManageWorkspace(null), false);
});

test("only owners can promote or demote a non-owner member", () => {
  assert.equal(canChangeMemberRole("owner", "member"), true);
  assert.equal(canChangeMemberRole("owner", "admin"), true);
  assert.equal(canChangeMemberRole("admin", "member"), false);
  assert.equal(canChangeMemberRole("owner", "owner"), false);
});

test("owners may remove admins or members but never themselves or an owner", () => {
  assert.equal(canRemoveWorkspaceMember("owner", "admin", false), true);
  assert.equal(canRemoveWorkspaceMember("owner", "member", false), true);
  assert.equal(canRemoveWorkspaceMember("owner", "member", true), false);
  assert.equal(canRemoveWorkspaceMember("owner", "owner", false), false);
});

test("admins may remove members but not admins", () => {
  assert.equal(canRemoveWorkspaceMember("admin", "member", false), true);
  assert.equal(canRemoveWorkspaceMember("admin", "admin", false), false);
});

test("members and non-members cannot remove workspace members", () => {
  assert.equal(canRemoveWorkspaceMember("member", "member", false), false);
  assert.equal(canRemoveWorkspaceMember(null, "member", false), false);
});

test("task details are editable by admins or the creator", () => {
  assert.equal(canEditTaskDetails("admin", false), true);
  assert.equal(canEditTaskDetails("member", true), true);
  assert.equal(canEditTaskDetails("member", false), false);
});

test("task status is also editable by the assignee", () => {
  assert.equal(canUpdateTaskStatus("member", false, true), true);
  assert.equal(canUpdateTaskStatus("member", false, false), false);
});

test("messages are deletable only by sender or workspace management", () => {
  assert.equal(canDeleteMessage(true, "member"), true);
  assert.equal(canDeleteMessage(false, "admin"), true);
  assert.equal(canDeleteMessage(false, "owner"), true);
  assert.equal(canDeleteMessage(false, "member"), false);
  assert.equal(canDeleteMessage(false, null), false);
});

