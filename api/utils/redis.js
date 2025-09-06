const { createClient } = require("redis");
const HISTORY_EXPIRATION = 60 * 60 * 1; // 1h 过期时间

// 创建Redis客户端
const client = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

// 连接错误处理
client.on("error", (err) => {
  console.error("Redis连接错误:", err);
});

// 连接成功日志
client.on("connect", () => {
  console.log("已连接到Redis服务器");
});

// 初始化连接
async function connect() {
  if (!client.isOpen) {
    await client.connect();
  }
}

// 保存用户对话历史
async function saveUserHistory(userId, history) {
  try {
    await connect();
    const key = `chat:history:${userId}`;
    await client.set(key, JSON.stringify(history));
    await client.expire(key, HISTORY_EXPIRATION);
    return true;
  } catch (error) {
    console.error("保存用户历史记录失败:", error);
    return false;
  }
}

// 获取用户对话历史
async function getUserHistory(userId) {
  try {
    await connect();
    const key = `chat:history:${userId}`;
    const history = await client.get(key);
    return history ? JSON.parse(history) : [];
  } catch (error) {
    console.error("获取用户历史记录失败:", error);
    return [];
  }
}

// 清除用户对话历史
async function clearUserHistory(userId) {
  try {
    await connect();
    const key = `chat:history:${userId}`;
    await client.del(key);
    return true;
  } catch (error) {
    console.error("清除用户历史记录失败:", error);
    return false;
  }
}

module.exports = {
  client,
  saveUserHistory,
  getUserHistory,
  clearUserHistory,
};
