// chat-api/routes/chat.js
const express = require("express");
const router = express.Router();
const { OpenAI } = require("openai");
const fs = require("fs");
const { resetSession } = require("../utils/session");
const path = require("path");
const logger = require("../utils/logger");
const {
  getUserHistory,
  saveUserHistory,
  clearUserHistory,
} = require("../utils/redis");

// 初始化OpenAI客户端
const openai = new OpenAI({
  baseURL: process.env.DEEPSEEK_API_URL || "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

// 读取纳西妲角色设定
let naxidaSystemPrompt = "";
try {
  naxidaSystemPrompt = fs.readFileSync(
    path.join(__dirname, "naxida.txt"),
    "utf8",
  );
  logger.debug("已加载纳西妲角色设定文件");
} catch (error) {
  logger.error("无法读取纳西妲角色设定文件:", {
    error: error.message,
    stack: error.stack,
  });
  naxidaSystemPrompt =
    "你是纳西妲，草之神，小吉祥草王，拥有丰富的知识，语气温柔可爱又睿智。";
  logger.info("使用默认纳西妲角色设定");
}

// 聊天API
router.post("/", async (req, res) => {
  try {
    const {
      message,
      userId = "anonymous",
      character = "naxida",
      timestamp,
      userTimezone,
    } = req.body;

    logger.info(`收到来自用户 ${userId} 的聊天请求`, {
      character,
      messageLength: message ? message.length : 0,
    });

    if (!message) {
      logger.warn("收到空消息请求", { userId });
      return res.status(400).json({ success: false, error: "消息不能为空" });
    }

    // 从Redis获取用户聊天历史
    let chatHistory = await getUserHistory(userId);
    logger.debug(`用户 ${userId} 的聊天历史记录数量: ${chatHistory.length}`);

    // 限制历史记录长度以避免token超限
    if (chatHistory.length > 10) {
      logger.debug(`裁剪用户 ${userId} 的聊天历史记录`);
      chatHistory = chatHistory.slice(-10);
    }

    // 获取当前时间信息（优先使用上海时区）
    // 如果提供了timestamp，创建Date对象；否则使用当前时间
    let now;
    if (timestamp) {
      now = new Date(timestamp);
    } else {
      now = new Date(); // 这将使用服务器设置的Asia/Shanghai时区
    }

    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const dayOfWeek = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];

    // 格式化时间字符串，用于系统提示
    const timeInfo = `当前时间是: ${year}年${month}月${day}日 星期${dayOfWeek} ${hours}:${minutes.toString().padStart(2, "0")} (北京/上海时间)`;
    logger.debug(`生成时间信息: ${timeInfo}`);

    // 将时间信息添加到系统提示中
    const systemPromptWithTime = `${naxidaSystemPrompt}\n\n${timeInfo}\n请在回答关于当前时间的问题时，使用上面提供的准确时间。`;

    // 构建消息历史
    const messages = [
      { role: "system", content: systemPromptWithTime },
      ...chatHistory,
      { role: "user", content: message },
    ];

    logger.debug(`准备向API发送请求`, {
      messagesCount: messages.length,
      model: "deepseek-chat",
    });

    // 调用API
    const completion = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages: messages,
      temperature: 0.7,
      max_tokens: 2000,
    });

    const reply = completion.choices[0].message.content;
    logger.debug(`收到API回复`, { replyLength: reply.length });

    // 更新聊天历史并存储到Redis
    chatHistory.push({ role: "user", content: message });
    chatHistory.push({ role: "assistant", content: reply });
    await saveUserHistory(userId, chatHistory);
    logger.debug(`已更新用户 ${userId} 的聊天历史`);

    // 返回响应
    res.json({
      success: true,
      reply,
      character,
      serverTime: now.toISOString(), // 返回服务器时间供客户端参考
    });
    logger.info(`成功回复用户 ${userId} 的请求`);
  } catch (error) {
    logger.error("聊天API错误:", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      error: "处理请求时发生错误",
      details: error.message,
    });
  }
});

// 清除聊天历史
router.post("/clear", async (req, res) => {
  const { userId = "anonymous" } = req.body;
  logger.info(`清除用户 ${userId} 的聊天历史`);

  try {
    const newSessionId = await resetSession(userId);
    logger.info(`用户 ${userId} 聊天历史已重置`, { newSessionId });

    res.json({
      success: true,
      message: "聊天已重置",
      newSessionId,
    });
  } catch (error) {
    logger.error(`重置用户 ${userId} 聊天历史失败:`, {
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      error: "重置聊天历史时发生错误",
      details: error.message,
    });
  }
});

module.exports = router;
