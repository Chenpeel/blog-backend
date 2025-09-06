const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
require("dotenv").config();

const { client: redisClient } = require("./utils/redis");
const logger = require("./utils/logger");

// 创建 Express 应用
const app = express();
const PORT = process.env.PORT || 8812;

// 数据库初始化
let db;

async function initDatabase() {
  try {
    // 确保data目录存在
    const dataDir = path.join(__dirname, "../data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    db = await open({
      filename: path.join(dataDir, "love_blog.db"),
      driver: sqlite3.Database,
    });

    // 执行数据库初始化脚本
    const initScript = fs.readFileSync(
      path.join(__dirname, "models/database.sql"),
      "utf8",
    );
    await db.exec(initScript);

    logger.info("数据库初始化成功");

    // 将数据库实例传递给全局
    global.db = db;
  } catch (error) {
    logger.error("数据库初始化失败:", error);
    process.exit(1);
  }
}

// 安全中间件配置
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  }),
);

// CORS配置
app.use(
  cors({
    origin: [
      "https://love.oooo.blog",
      "https://oooo.blog",
      "http://localhost:3000",
      "http://localhost:5173", // Vite开发服务器
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Origin"],
    credentials: true,
  }),
);

// 会话配置
app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      "your-very-long-random-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24小时
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
  }),
);

// 限制请求频率
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 200, // 增加到200个请求
  standardHeaders: true,
  legacyHeaders: false,
  message: "请求频率过高，请稍后再试。",
});

app.use("/api", apiLimiter);

// 解析请求体
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// 静态文件服务（可选）
app.use("/public", express.static(path.join(__dirname, "public")));

// 日志中间件
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.get("user-agent"),
  });
  next();
});

// API路由
app.use("/api/chat", require("./routes/chat")); // 现有聊天功能
app.use("/api/auth", require("./routes/auth")); // 认证API
app.use("/api/posts", require("./routes/post")); // 帖子API
app.use("/api/settings", require("./routes/settings")); // 设置API

// 健康检查
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// 根路径
app.get("/", (req, res) => {
  res.json({
    message: "API",
    version: "1.0.0",
    endpoints: [
      "/api/auth/*",
      "/api/chat/*",
      "/api/posts/*",
      "/api/settings/*",
      "/health",
    ],
  });
});

// 404处理
app.use((req, res) => {
  logger.warn(`404 Not Found: ${req.originalUrl}`);
  res.status(404).json({ error: "Not found", success: false });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  logger.error("应用错误", { error: err.message, stack: err.stack });
  res.status(500).json({ error: "服务器内部错误", success: false });
});

// 启动服务器
async function startServer() {
  await initDatabase();

  app.listen(PORT, "0.0.0.0", () => {
    logger.info(`恋爱博客后端服务已启动，运行于端口 ${PORT}`);
    logger.info(`数据库文件: ${path.join(__dirname, "../data/love_blog.db")}`);

    // 服务器启动后再尝试连接Redis（可选）
    initRedis();
  });
}

async function initRedis() {
  try {
    if (redisClient && typeof redisClient.connect === "function") {
      await redisClient.connect();
      logger.info("Redis连接成功");
    }
  } catch (error) {
    logger.error("Redis连接失败:", error);
    logger.info("应用将以无Redis模式启动");
  }
}

// 优雅关闭
process.on("SIGTERM", async () => {
  logger.info("收到SIGTERM信号，开始优雅关闭...");
  if (db) {
    await db.close();
  }
  if (redisClient) {
    await redisClient.quit();
  }
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("收到SIGINT信号，开始优雅关闭...");
  if (db) {
    await db.close();
  }
  if (redisClient) {
    await redisClient.quit();
  }
  process.exit(0);
});

startServer().catch((error) => {
  logger.error("启动服务器失败:", error);
  process.exit(1);
});
