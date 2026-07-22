"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteTask = exports.updateTask = exports.createTask = exports.listTasks = void 0;
const access_1 = require("../lib/access");
const supabase_1 = require("../lib/supabase");
const socket_1 = require("../socket");
const permissions_1 = require("../lib/permissions");
const TASK_SELECT = `id, chat_id, title, description, status, priority, due_at, assignee_id, created_by_id, completed_at, created_at, updated_at,
  assignee:profiles!tasks_assignee_id_fkey ( id, username, email, photo ),
  created_by:profiles!tasks_created_by_id_fkey ( id, username, email, photo )`;
const mapTask = (task) => ({
    id: task.id,
    chatId: task.chat_id,
    title: task.title,
    description: task.description ?? "",
    status: task.status,
    priority: task.priority,
    dueAt: task.due_at,
    assigneeId: task.assignee_id,
    createdById: task.created_by_id,
    completedAt: task.completed_at,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    assignee: task.assignee,
    createdBy: task.created_by,
});
const validAssignee = async (chatId, assigneeId) => !assigneeId || (0, access_1.isChatMember)(chatId, assigneeId);
const listTasks = async (req, res) => {
    const userId = req.user?.userId;
    const { chatId } = req.params;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        if (!(await (0, access_1.isChatMember)(chatId, userId))) {
            res.status(403).json({ error: "Access denied" });
            return;
        }
        const { data, error } = await supabase_1.supabase.from("tasks").select(TASK_SELECT).eq("chat_id", chatId).order("created_at", { ascending: false });
        if (error)
            throw error;
        res.json({ tasks: (data ?? []).map((task) => mapTask(task)) });
    }
    catch (error) {
        console.error("[listTasks]", error);
        res.status(500).json({ error: "Failed to load tasks" });
    }
};
exports.listTasks = listTasks;
const createTask = async (req, res) => {
    const userId = req.user?.userId;
    const chatId = typeof req.body.chatId === "string" ? req.body.chatId : "";
    const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
    const description = typeof req.body.description === "string" ? req.body.description.trim() : "";
    const priority = ["low", "medium", "high"].includes(req.body.priority) ? req.body.priority : "medium";
    const assigneeId = typeof req.body.assigneeId === "string" && req.body.assigneeId ? req.body.assigneeId : null;
    const dueAt = typeof req.body.dueAt === "string" && req.body.dueAt ? new Date(req.body.dueAt) : null;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (!chatId || !title || title.length > 160 || description.length > 4000 || (dueAt && Number.isNaN(dueAt.getTime()))) {
        res.status(400).json({ error: "Valid chatId, title, description, and due date are required" });
        return;
    }
    try {
        if (!(await (0, access_1.isChatMember)(chatId, userId))) {
            res.status(403).json({ error: "Access denied" });
            return;
        }
        if (!(await validAssignee(chatId, assigneeId))) {
            res.status(400).json({ error: "Assignee must be a workspace member" });
            return;
        }
        const { data, error } = await supabase_1.supabase.from("tasks").insert({ chat_id: chatId, title, description: description || null, priority, due_at: dueAt?.toISOString() ?? null, assignee_id: assigneeId, created_by_id: userId }).select(TASK_SELECT).single();
        if (error)
            throw error;
        const mapped = mapTask(data);
        if (assigneeId && assigneeId !== userId) {
            const notification = { user_id: assigneeId, chat_id: chatId, type: "task_assigned", title: `Task assigned: ${title}`, body: description.slice(0, 300) || null, entity_type: "task", entity_id: String(data.id) };
            const { data: createdNotification } = await supabase_1.supabase.from("notifications").insert(notification).select().single();
            if (createdNotification)
                (0, socket_1.notifyUsers)([assigneeId], { ...createdNotification, chatId, entityType: "task", entityId: data.id });
        }
        res.status(201).json({ task: mapped });
    }
    catch (error) {
        console.error("[createTask]", error);
        res.status(500).json({ error: "Failed to create task" });
    }
};
exports.createTask = createTask;
const updateTask = async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        const { data: existing, error: findError } = await supabase_1.supabase.from("tasks").select("id, chat_id, title, description, created_by_id, assignee_id, status").eq("id", req.params.taskId).maybeSingle();
        if (findError)
            throw findError;
        if (!existing) {
            res.status(404).json({ error: "Task not found" });
            return;
        }
        const role = await (0, access_1.getChatRole)(existing.chat_id, userId);
        if (!role) {
            res.status(403).json({ error: "Access denied" });
            return;
        }
        const canManage = (0, permissions_1.canEditTaskDetails)(role, existing.created_by_id === userId);
        const updates = { updated_at: new Date().toISOString() };
        if (req.body.status !== undefined) {
            if (!["todo", "in_progress", "done"].includes(req.body.status) || !(0, permissions_1.canUpdateTaskStatus)(role, existing.created_by_id === userId, existing.assignee_id === userId)) {
                res.status(403).json({ error: "You cannot update this task status" });
                return;
            }
            updates.status = req.body.status;
            updates.completed_at = req.body.status === "done" ? new Date().toISOString() : null;
        }
        if (req.body.title !== undefined || req.body.description !== undefined || req.body.priority !== undefined || req.body.dueAt !== undefined || req.body.assigneeId !== undefined) {
            if (!canManage) {
                res.status(403).json({ error: "Only an admin or task creator can edit task details" });
                return;
            }
            if (req.body.title !== undefined) {
                const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
                if (!title || title.length > 160) {
                    res.status(400).json({ error: "Invalid title" });
                    return;
                }
                updates.title = title;
            }
            if (req.body.description !== undefined) {
                if (typeof req.body.description !== "string" || req.body.description.length > 4000) {
                    res.status(400).json({ error: "Invalid description" });
                    return;
                }
                updates.description = req.body.description.trim() || null;
            }
            if (req.body.priority !== undefined) {
                if (!["low", "medium", "high"].includes(req.body.priority)) {
                    res.status(400).json({ error: "Invalid priority" });
                    return;
                }
                updates.priority = req.body.priority;
            }
            if (req.body.dueAt !== undefined) {
                const due = req.body.dueAt ? new Date(req.body.dueAt) : null;
                if (due && Number.isNaN(due.getTime())) {
                    res.status(400).json({ error: "Invalid due date" });
                    return;
                }
                updates.due_at = due?.toISOString() ?? null;
            }
            if (req.body.assigneeId !== undefined) {
                const assigneeId = typeof req.body.assigneeId === "string" && req.body.assigneeId ? req.body.assigneeId : null;
                if (!(await validAssignee(existing.chat_id, assigneeId))) {
                    res.status(400).json({ error: "Assignee must be a workspace member" });
                    return;
                }
                updates.assignee_id = assigneeId;
            }
        }
        if (Object.keys(updates).length === 1) {
            res.status(400).json({ error: "No changes provided" });
            return;
        }
        const { data, error } = await supabase_1.supabase.from("tasks").update(updates).eq("id", existing.id).select(TASK_SELECT).single();
        if (error)
            throw error;
        const updatedAssigneeId = typeof updates.assignee_id === "string" ? updates.assignee_id : null;
        if (updatedAssigneeId && updatedAssigneeId !== existing.assignee_id && updatedAssigneeId !== userId) {
            const notification = {
                user_id: updatedAssigneeId,
                chat_id: existing.chat_id,
                type: "task_assigned",
                title: `Task assigned: ${String(data.title)}`,
                body: typeof data.description === "string" ? data.description.slice(0, 300) : null,
                entity_type: "task",
                entity_id: String(data.id),
            };
            const { data: createdNotification, error: notificationError } = await supabase_1.supabase.from("notifications").insert(notification).select().single();
            if (notificationError)
                console.error("[updateTask] notification insert failed", notificationError);
            else if (createdNotification)
                (0, socket_1.notifyUsers)([updatedAssigneeId], { ...createdNotification, chatId: existing.chat_id, entityType: "task", entityId: data.id });
        }
        res.json({ task: mapTask(data) });
    }
    catch (error) {
        console.error("[updateTask]", error);
        res.status(500).json({ error: "Failed to update task" });
    }
};
exports.updateTask = updateTask;
const deleteTask = async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        const { data: task, error } = await supabase_1.supabase.from("tasks").select("id, chat_id, created_by_id").eq("id", req.params.taskId).maybeSingle();
        if (error)
            throw error;
        if (!task) {
            res.status(404).json({ error: "Task not found" });
            return;
        }
        const role = await (0, access_1.getChatRole)(task.chat_id, userId);
        if (task.created_by_id !== userId && role !== "owner" && role !== "admin") {
            res.status(403).json({ error: "Only an admin or task creator can delete it" });
            return;
        }
        const { error: deleteError } = await supabase_1.supabase.from("tasks").delete().eq("id", task.id);
        if (deleteError)
            throw deleteError;
        res.json({ message: "Task deleted" });
    }
    catch (error) {
        console.error("[deleteTask]", error);
        res.status(500).json({ error: "Failed to delete task" });
    }
};
exports.deleteTask = deleteTask;
