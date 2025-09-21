require("dotenv").config();
const express = require("express");
const http = require("http");
const path = require("path");
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
const { initializeScheduler } = require("./services/followUpScheduler");

// --- Models ---
const User = require('./models/User');
const UserSession = require('./models/UserSession');

// --- Routes ---
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
const taskRoutes = require("./routes/taskRoutes");
const userRoutes = require('./routes/userRoutes');
const followUpTemplateRoutes = require("./routes/followUpTemplateRoutes");
const userStatusRoutes = require("./routes/userStatusRoutes"); // Correctly imported from routes
const shippingRoutes = require('./routes/shippingRoutes');
const leadRoutes = require("./routes/leadRoutes");

const app = express();
app.set('trust proxy', 1); 
const server = http.createServer(app);

// =====================
// Initialize Services
// =====================
const io = new Server(server, {
  path: "/socket.io",
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true
  },
});

const chatService = new ChatService(io);
initializeScheduler(chatService);
const statusCache = new Map();
initializeManager(io, statusCache, chatService);

// =====================
// Global Middlewares
// =====================
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 }));
app.use(express.json({ limit: "10mb" }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use((req, res, next) => {
  req.io = io;
  req.chatService = chatService;
  next();
});

// =====================
// Auth Middleware (The one and only)
// =====================
function authorize(roles = []) {
  return (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ ok: false, error: "No token provided" });
      }
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (!roles.includes(decoded.role)) {
        return res.status(403).json({ ok: false, error: "Forbidden: Insufficient role" });
      }
      
      req.user = decoded;
      next();
    } catch (err) {
      return res.status(401).json({ ok: false, error: "Invalid token" });
    }
  };
}


// ===================================================================
// ❗❗❗ CRITICAL FIX: API ROUTES ORGANIZATION ❗❗❗
// The order here is extremely important to prevent conflicts.
// ===================================================================

// --- 1. Public Routes (No Auth Needed) ---
app.get("/", (req, res) => res.json({ ok: true, service: "CRM Backend API" }));
app.use("/api/auth", authRoutes);

// --- 2. Super Admin Routes (Special Auth inside the file) ---
// This MUST come before any other general authenticated routes.
app.use("/api/super", superAdminRoutes);

// --- 3. General Authenticated Routes (For All Roles) ---
// These routes are used by everyone, so their auth logic should be simple.
app.use("/api/contacts", authorize(['admin', 'sales', 'marketing']), contactRoutes);
app.use("/api/messages", authorize(['admin', 'sales', 'marketing']), messageRoutes);

// --- 4. Role-Specific Routes ---
// These are now clearly separated and won't conflict with the Super Admin.

// Admin & Marketing
app.use("/api/expenses", authorize(['admin', 'marketing']), expenseRoutes);
app.use("/api/products", authorize(['admin', 'marketing']), productRoutes);
app.use("/api/reports", authorize(['admin', 'marketing']), reportRoutes);

// Admin Only
app.use("/api/notifications", authorize(['admin']), notificationRoutes);
app.use('/api/shipping', authorize(['admin']), shippingRoutes);
app.use('/api/users', authorize(['admin']), userRoutes);
app.use("/api/status", authorize(['admin']), userStatusRoutes);

// Admin & Sales
app.use("/api/canned-responses", authorize(['admin', 'sales']), cannedResponseRoutes);
app.use("/api/whatsapp", authorize(['admin', 'sales']), whatsappRoutes);
app.use("/api/tasks", authorize(['admin', 'sales']), taskRoutes);
app.use("/api/follow-up-templates", authorize(['admin', 'sales']), followUpTemplateRoutes);
app.use("/api/leads", authorize(['admin', 'sales']), leadRoutes);


// ======================
// Socket.io Auth & Logic
// ======================
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).lean();
      if (user) {
        socket.user = user;
        next();
      } else {
        next(new Error("Authentication error: User not found."));
      }
    } catch (e) {
      logger.warn(`Socket connection with invalid token.`);
      next(new Error("Authentication error: Invalid token."));
    }
  } else {
    next(new Error("Authentication error: No token provided."));
  }
});

io.on("connection", async (socket) => {
    logger.info("🔌 Client connected via Socket.io", { id: socket.id, userId: socket.user._id });

    try {
        // --- START: MODIFIED SESSION LOGIC ---
        const SESSION_REUSE_THRESHOLD = 15 * 60 * 1000; // 15 minutes in milliseconds

        const connectionCount = (onlineUsers.get(socket.user._id.toString()) || 0) + 1;
        onlineUsers.set(socket.user._id.toString(), connectionCount);

        if (connectionCount === 1) {
            const latestSession = await UserSession.findOne({ userId: socket.user._id }).sort({ loginTime: -1 });
            const now = new Date();

            // Check if a recent, closed session exists and can be reopened
            if (latestSession && latestSession.logoutTime && (now - new Date(latestSession.logoutTime)) < SESSION_REUSE_THRESHOLD) {
                // Reuse the existing session
                logger.info(`♻️ Reusing recent session for user`, { userId: socket.user._id, sessionId: latestSession._id });
                latestSession.logoutTime = null; // Clear the logout time
                latestSession.duration = 0;      // Reset duration calculation
                await latestSession.save();
                socket.sessionId = latestSession._id;
            } else {
                // Create a new session if no recent one is found
                logger.info(`✅ Creating a new session for user`, { userId: socket.user._id });
                const newSession = new UserSession({
                    userId: socket.user._id,
                    tenantId: socket.user.tenantId,
                    loginTime: now,
                });
                await newSession.save();
                socket.sessionId = newSession._id;
            }

            // Update user's online status
            await User.findByIdAndUpdate(socket.user._id, { isOnline: true, lastSeen: now });

            socket.to(`tenant:${socket.user.tenantId}`).emit("user:status_change", {
                userId: socket.user._id,
                isOnline: true,
            });
            logger.info(`✅ User is now ONLINE`, { userId: socket.user._id });

        } else {
            // This is for subsequent connections (e.g., another tab) while already online
            const latestSession = await UserSession.findOne({ userId: socket.user._id, logoutTime: null }).sort({ loginTime: -1 });
            if (latestSession) socket.sessionId = latestSession._id;
        }
        // --- END: MODIFIED SESSION LOGIC ---

    } catch (error) {
        logger.error("Error handling socket connection:", error);
    }

    socket.join(`user:${socket.user._id}`);
    socket.join(`tenant:${socket.user.tenantId}`);
    logger.info(`📡 Socket ${socket.id} joined rooms for user: ${socket.user._id}`);

    const tenantIdStr = String(socket.user.tenantId);
    if (statusCache.has(tenantIdStr)) {
        socket.emit("wa:status", statusCache.get(tenantIdStr));
    }

    socket.on("disconnect", async (reason) => {
        logger.warn("❌ Client disconnected", { id: socket.id, reason, userId: socket.user._id });

        try {
            const currentCount = onlineUsers.get(socket.user._id.toString()) || 0;
            const newCount = Math.max(0, currentCount - 1);

            if (newCount === 0) {
                onlineUsers.delete(socket.user._id.toString());

                const logoutTime = new Date();

                if (socket.sessionId) {
                    const session = await UserSession.findById(socket.sessionId);
                    if (session) {
                        session.logoutTime = logoutTime;
                        // Important: Make sure loginTime is a Date object before subtracting
                        const loginTime = new Date(session.loginTime);
                        session.duration = (logoutTime - loginTime) / 1000; // duration in seconds
                        await session.save();
                    }
                }

                await User.findByIdAndUpdate(socket.user._id, { isOnline: false, lastSeen: logoutTime });

                socket.to(`tenant:${socket.user.tenantId}`).emit("user:status_change", {
                    userId: socket.user._id,
                    isOnline: false,
                    lastSeen: logoutTime,
                });
                logger.info(`⭕ User is now OFFLINE`, { userId: socket.user._id });
            } else {
                onlineUsers.set(socket.user._id.toString(), newCount);
            }
        } catch (error) {
            logger.error("Error handling socket disconnection:", error);
        }
    });
});
// =====================
// Error Handling
// =====================
app.use(errorHandler);

// =====================
// Start Server
// =====================
const onlineUsers = new Map();
async function startServer() {
  try {
    await connectDB(process.env.MONGO_URI);
    await connectRabbitMQ(io, chatService);
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
