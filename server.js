require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken"); // ✅ **الإضافة الأولى هنا**

const logger = require("./utils/logger");
const connectDB = require("./config/db");
const errorHandler = require("./middlewares/errorHandler");

// 🟢 Routes
const authRoutes = require("./routes/authRoutes");
const contactRoutes = require("./routes/contactRoutes");
const messageRoutes = require("./routes/messageRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const productRoutes = require("./routes/productRoutes");
const cannedResponseRoutes = require("./routes/cannedResponseRoutes");
const superAdminRoutes = require("./routes/superAdminRoutes");
const reportRoutes = require("./routes/reportRoutes");
const notificationRoutes = require("./routes/notificationRoutes");

// 🟢 RabbitMQ Service
const { connectRabbitMQ } = require("./services/rabbitmqService");

const app = express();
const server = http.createServer(app);

// =====================
// Socket.io Setup
// =====================
const io = new Server(server, {
  path: "/socket.io",
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    methods: ["GET", "POST", "PATCH", "DELETE"],
    credentials: true,
  },
});

exports.io = io; // ✅ **الإضافة الثانية هنا** (لإتاحة io في ملفات أخرى)

// Middlewares
app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));
app.use(helmet());
app.use(rateLimit({ windowMs: 60 * 1000, max: 500 }));

// جعل io متاحاً في كل مكان
app.set("io", io);

// =====================
// Routes
// =====================
app.get("/", (req, res) => res.json({ ok: true, service: "CRM Backend API" }));

app.use("/api/auth", authRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/products", productRoutes);
app.use("/api/canned-responses", cannedResponseRoutes);
app.use("/api/super", superAdminRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/notifications", notificationRoutes);

// ======================
// 🔵 Socket.io connection + status cache
// ======================
let waStatusMap = {};

io.on("connection", (socket) => {
  logger.info("🔌 Client connected via Socket.io", { id: socket.id });
  
  // ✅✅✅ **بداية التعديل الرئيسي** ✅✅✅
  // الانضمام لغرفة المستخدم لإرسال إشعارات خاصة له
  try {
    const token = socket.handshake.auth.token;
    if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.id) {
            socket.join(`user:${decoded.id}`);
            logger.info(`📡 Socket ${socket.id} joined user room: user:${decoded.id}`);
        }
    }
  } catch (e) {
      logger.warn(`Socket connection from unauthenticated user: ${e.message}`);
  }
  // ✅✅✅ **نهاية التعديل الرئيسي** ✅✅✅

  // 🟢 Event: join tenant room
  socket.on("join", ({ tenantId }) => {
    if (!tenantId) return;
    socket.join(`tenant:${tenantId}`);
    logger.info(`📡 Socket ${socket.id} joined tenant room: tenant:${tenantId}`);
  });

  // 🟢 استقبل wa:status مباشرة من الـ listener socket
  socket.on("wa:status", (payload) => {
    const { tenantId, state } = payload;
    if (!tenantId) return;

    waStatusMap[tenantId] = payload;
    logger.info(`📥 [wa:status] tenant ${tenantId} → ${state}`);

    io.to(`tenant:${tenantId}`).emit("wa:status", payload);
    logger.info(`📤 [wa:status] broadcasted to tenant:${tenantId}`);
  });

  socket.on("disconnect", (reason) => {
    logger.warn("❌ Client disconnected", { id: socket.id, reason });
  });
});

// 🟢 Endpoint يرجع حالة Tenant واحد
app.get("/api/whatsapp/status/:tenantId", (req, res) => {
  const { tenantId } = req.params;
  const status =
    waStatusMap[tenantId] || { ready: false, state: "disconnected", lastUpdated: new Date() };

  logger.info(`📡 GET /status/${tenantId} → ${status.state}`);

  res.json({
    ok: true,
    status: {
      ...status,
      tenantId,
    },
  });
});

// 🟢 Endpoint يرجع كل الحالات
app.get("/api/whatsapp/status", (req, res) => {
  logger.info("📡 GET /status (all tenants)");
  res.json({ ok: true, status: waStatusMap });
});

// 🟢 Endpoint لتحديث الحالة (Backup من الـ listener API call)
app.post("/api/whatsapp/push-status", (req, res) => {
  const payload = req.body;
  const { tenantId, state } = payload;

  logger.info(`📩 push-status received → tenant ${tenantId} → ${state}`);

  if (tenantId) {
    waStatusMap[tenantId] = payload;
    io.to(`tenant:${tenantId}`).emit("wa:status", payload);
    logger.info(`📤 push-status broadcasted to tenant:${tenantId}`);
  }

  res.json({ ok: true });
});

// Error Handler
app.use(errorHandler);

// =====================
// Start Server
// =====================
(async () => {
  await connectDB(process.env.MONGO_URI);
  await connectRabbitMQ(io);

  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    logger.info(`🚀 API Server is live on port ${PORT}`);
  });
})();