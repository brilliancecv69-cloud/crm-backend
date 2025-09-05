require("dotenv").config();
const express = require("express");
const http = require("http"); // ✅ تم تصحيح هذا السطر
const path = require("path"); // ✅ تم تصحيح هذا السطر
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const logger = require("./utils/logger");
const connectDB = require("./config/db");
const errorHandler = require("./middlewares/errorHandler");
const { initializeManager } = require("./listener");
const { connectRabbitMQ } = require("./services/rabbitmqService");
const ChatService = require("./services/chatService");

// Routes
const authRoutes = require("./routes/authRoutes");
const contactRoutes = require("./routes/contactRoutes");
const messageRoutes = require("./routes/messageRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const productRoutes = require("./routes/productRoutes");
const cannedResponseRoutes = require("./routes/cannedResponseRoutes");
const superAdminRoutes = require("./routes/superAdminRoutes");
const reportRoutes = require("./routes/reportRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const whatsappRoutes = require("./routes/whatsappRoutes");

const app = express();
const server = http.createServer(app);

// =====================
// Initialize Services
// =====================
const io = new Server(server, {
  path: "/socket.io",
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true // ✅✅✅ هذا هو السطر المطلوب إضافته
  },
});

const chatService = new ChatService(io);
const statusCache = new Map();
initializeManager(io, statusCache, chatService);

// =====================
// Global Middlewares
// =====================
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 }));
app.use(express.json({ limit: "10mb" }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads'))); // Note: corrected path for static files

// Attach services to request object
app.use((req, res, next) => {
  req.io = io;
  req.chatService = chatService;
  next();
});

// =====================
// API Routes
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
app.use("/api/whatsapp", whatsappRoutes);
app.use('/api/shipping', require('./routes/shippingRoutes'));
// ======================
// Socket.io Auth & Logic
// ======================
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
    } catch (e) {
      logger.warn(`Socket connection with invalid token.`);
    }
  }
  next();
});

io.on("connection", (socket) => {
  logger.info("🔌 Client connected via Socket.io", { id: socket.id });
  
  if (socket.user) {
    socket.join(`user:${socket.user.id}`);
    socket.join(`tenant:${socket.user.tenantId}`);
    logger.info(`📡 Socket ${socket.id} joined rooms for user: ${socket.user.id}`);

    const tenantIdStr = String(socket.user.tenantId);
    if (statusCache.has(tenantIdStr)) {
      socket.emit("wa:status", statusCache.get(tenantIdStr));
    }
  }

  socket.on("disconnect", (reason) => {
    logger.warn("❌ Client disconnected", { id: socket.id, reason });
  });
});

// =====================
// Error Handling
// =====================
app.use(errorHandler);

// =====================
// Start Server
// =====================
async function startServer() {
  try {
    await connectDB(process.env.MONGO_URI);
    await connectRabbitMQ(io);

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      logger.info(`🚀 API Server is live on port ${PORT} in ${process.env.NODE_ENV} mode.`);
    });
  } catch (error) {
    logger.error("💥 Failed to start server:", error);
    process.exit(1);
  }
}

startServer();