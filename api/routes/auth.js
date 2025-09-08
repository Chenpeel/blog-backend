const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");
const PasswordCrypto = require("../utils/crypto");
const { checkVisitorExpiry } = require("../middleware/auth");

// 登录验证
router.post("/login", async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        error: "密码不能为空",
      });
    }

    // 从数据库获取哈希密码设置
    const couplePasswordResult = await global.db.get(
      "SELECT value FROM settings WHERE key = 'couple_password_hash'",
    );
    const visitorPasswordResult = await global.db.get(
      "SELECT value FROM settings WHERE key = 'visitor_password_hash'",
    );

    const couplePasswordHash = couplePasswordResult?.value || "";
    const visitorPasswordHash = visitorPasswordResult?.value || "";

    let userType = null;
    let loginSuccess = false;

    // 检查情侣密码
    if (
      couplePasswordHash &&
      (await PasswordCrypto.verifyPassword(password, couplePasswordHash))
    ) {
      userType = "couple";
      loginSuccess = true;
      logger.info("情侣用户登录成功", {
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
    }
    // 检查访客密码
    else if (
      visitorPasswordHash &&
      (await PasswordCrypto.verifyPassword(password, visitorPasswordHash))
    ) {
      userType = "visitor";
      loginSuccess = true;
      logger.info("访客用户登录成功", {
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
    }

    if (!loginSuccess) {
      logger.warn("登录失败 - 密码错误", {
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
      return res.status(401).json({
        success: false,
        error: "密码错误",
      });
    }

    // 设置会话
    req.session.authenticated = true;
    req.session.userType = userType;
    req.session.loginTime = new Date().toISOString();

    // 如果是访客，检查过期时间
    if (userType === "visitor") {
      const expiryResult = await global.db.get(
        "SELECT value FROM settings WHERE key = 'visitor_password_expires'",
      );

      if (expiryResult && expiryResult.value) {
        const expiryTime = new Date(expiryResult.value);
        const now = new Date();

        if (now > expiryTime) {
          return res.status(401).json({
            success: false,
            error: "访客权限已过期",
          });
        }

        req.session.expiryTime = expiryTime.toISOString();
      }
    }

    res.json({
      success: true,
      user: {
        type: userType,
      },
      message: `${userType === "couple" ? "情侣" : "访客"}登录成功`,
      expiryTime: req.session.expiryTime || null,
    });
  } catch (error) {
    logger.error("登录过程中发生错误:", error);
    res.status(500).json({
      success: false,
      error: "服务器错误",
    });
  }
});

// 检查登录状态
router.get("/status", checkVisitorExpiry, (req, res) => {
  if (req.session && req.session.authenticated) {
    res.json({
      success: true,
      user: {
        type: req.session.userType,
      },
      loginTime: req.session.loginTime,
      expiryTime: req.session.expiryTime || null,
    });
  } else {
    res.json({
      success: false,
      authenticated: false,
    });
  }
});

// 退出登录
router.post("/logout", (req, res) => {
  const userType = req.session?.userType;

  req.session.destroy((err) => {
    if (err) {
      logger.error("退出登录时销毁会话失败:", err);
      return res.status(500).json({
        success: false,
        error: "退出登录失败",
      });
    }

    logger.info(`${userType || "未知"}用户退出登录`, {
      ip: req.ip,
    });

    res.json({
      success: true,
      message: "已退出登录",
    });
  });
});

module.exports = router;
