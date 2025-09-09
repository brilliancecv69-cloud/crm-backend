const Joi = require("joi");
const Task = require("../models/Task");
const Notification = require("../models/Notification");
const asyncHandler = require("../middlewares/asyncHandler");

// Joi validation schema for tasks created by admin
const taskCreateSchema = Joi.object({
  title: Joi.string().trim().required(),
  description: Joi.string().trim().allow("").optional(),
  assignedTo: Joi.string().hex().length(24).required(),
  dueDate: Joi.date().iso().optional(),
});

// --- ✅ START: NEW SCHEMA FOR SELF-CREATED TASKS ---
// Joi validation schema for tasks created by sales users for themselves
const taskSelfCreateSchema = Joi.object({
  title: Joi.string().trim().required(),
  description: Joi.string().trim().allow("").optional(),
  dueDate: Joi.date().iso().optional(),
});
// --- ✅ END: NEW SCHEMA ---

// Joi validation schema for updating a task
const taskUpdateSchema = Joi.object({
  title: Joi.string().trim().optional(),
  description: Joi.string().trim().allow("").optional(),
  status: Joi.string().valid('pending', 'completed').optional(),
  dueDate: Joi.date().iso().optional(),
  comment: Joi.string().trim().allow("").optional(),
}).min(1);

// Helper function to create and emit notifications
async function createAndNotify(req, userId, text, link) {
  try {
    const notification = await Notification.create({
      tenantId: req.user.tenantId,
      userId,
      text,
      link,
    });
    const io = req.app.get("io");
    if (io) {
      io.to(`user:${userId}`).emit("new_notification", notification);
    }
  } catch (error) {
    console.error("Failed to create notification:", error);
  }
}

// @desc    Create a new task (Admin)
exports.createTask = asyncHandler(async (req, res) => {
  const validatedData = await taskCreateSchema.validateAsync(req.body);
  const { tenantId, id: adminId } = req.user;

  const task = await Task.create({
    ...validatedData,
    tenantId,
    createdBy: adminId,
  });

  await createAndNotify(
    req,
    task.assignedTo,
    `New task assigned: "${task.title}"`,
    `/my-tasks`
  );

  const populatedTask = await task.populate([
    { path: 'assignedTo', select: 'name email' },
    { path: 'createdBy', select: 'name email' }
  ]);

  res.status(201).json({ ok: true, data: populatedTask });
});

// --- ✅ START: NEW FUNCTION FOR SELF-CREATED TASKS ---
/**
 * @desc    Create a new task for oneself (Sales)
 * @route   POST /api/tasks/my
 * @access  Private (Sales)
 */
exports.createSelfTask = asyncHandler(async (req, res) => {
    const validatedData = await taskSelfCreateSchema.validateAsync(req.body);
    const { tenantId, id: userId } = req.user;

    const task = await Task.create({
        ...validatedData,
        tenantId,
        createdBy: userId, // The creator is the user themselves
        assignedTo: userId, // The assigned user is also themselves
    });
    
    // We don't need to populate 'assignedTo' since it's the same as 'createdBy'
    const populatedTask = await task.populate('createdBy', 'name email');

    res.status(201).json({ ok: true, data: populatedTask });
});
// --- ✅ END: NEW FUNCTION ---

// @desc    List all tasks for the tenant (Admin view)
exports.listTasks = asyncHandler(async (req, res) => {
  const { tenantId } = req.user;
  const tasks = await Task.find({ tenantId })
    .populate('assignedTo', 'name email')
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 });
  res.json({ ok: true, data: tasks });
});

// @desc    Get tasks assigned to the current user
exports.getMyTasks = asyncHandler(async (req, res) => {
  const { tenantId, id: userId } = req.user;
  const tasks = await Task.find({ tenantId, assignedTo: userId })
    .populate('createdBy', 'name email')
    .sort({ dueDate: 1, createdAt: -1 });
  res.json({ ok: true, data: tasks });
});

// @desc    Update a task
exports.updateTask = asyncHandler(async (req, res) => {
  try {
    const validatedData = await taskUpdateSchema.validateAsync(req.body);
    const { tenantId, id: userId, role, name: userName } = req.user;

    const task = await Task.findById(req.params.id);

    if (!task) {
      res.status(404);
      throw new Error("Task not found");
    }

    // ✅ Debug يوضح الفرق بين tenantId في التاسك والتوكن
    console.log("DEBUG tenant check:", {
      taskTenant: String(task.tenantId),
      userTenant: String(tenantId),
      taskId: task._id.toString(),
      userId: userId
    });

    if (String(task.tenantId) !== String(tenantId)) {
      res.status(404);
      throw new Error("Task not found (tenant mismatch)");
    }

    if (role === 'sales' && String(task.assignedTo) !== String(userId)) {
      res.status(403);
      throw new Error("Not authorized to update this task");
    }

    const wasPending = task.status === 'pending';
    Object.assign(task, validatedData);

    if (!Array.isArray(task.comments)) {
      task.comments = [];
    }

    if (validatedData.comment && validatedData.comment.trim() !== "") {
      task.comments.push({
        user: userId,
        userName: userName || "Unknown",
        text: validatedData.comment,
      });
    }

    await task.save();

    if (wasPending && task.status === 'completed') {
      if (String(task.createdBy) !== String(task.assignedTo)) {
        await createAndNotify(
          req,
          task.createdBy,
          `Task completed by ${userName || "Sales User"}: "${task.title}"`,
          `/team/tasks`
        );
      }
    }

    const populatedTask = await task.populate([
      { path: 'assignedTo', select: 'name email' },
      { path: 'createdBy', select: 'name email' }
    ]);

    res.json({ ok: true, data: populatedTask });
  } catch (err) {
    console.error("❌ updateTask error:", err.message, err);
    res.status(500).json({ ok: false, message: "Failed to update task", error: err.message });
  }
});


// @desc    Delete a task
exports.deleteTask = asyncHandler(async (req, res) => {
  const { tenantId } = req.user;
  const task = await Task.findOneAndDelete({ _id: req.params.id, tenantId });

  if (!task) {
    res.status(404);
    throw new Error("Task not found");
  }

  res.json({ ok: true, data: { message: "Task deleted successfully" } });
});