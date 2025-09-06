const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");
const PasswordCrypto = require("../utils/crypto");
const { requireCoupleAuth, checkVisitorExpiry } = require("../middleware/auth");

// 获取密码状态 - 仅限情侣
router.get("/status", requireCoupleAuth, async (req, res) => {
  try {
    const status = {
      couplePassword: {
        isSet: false,
        updatedAt: null,
      },
      visitorPassword: {
        isSet: false,
        updatedAt: null,
        expiresAt: null,
        isExpired: false,
        hoursLeft: 0,
      },
      encryptionKey: {
        isSet: false,
        fingerprint: null,
        updatedAt: null,
      },
    };

    // 检查情侣密码
    const coupleHash = await global.db.get(
      "SELECT value, updated_at FROM settings WHERE key = 'couple_password_hash'",
    );

    if (coupleHash && coupleHash.value) {
      status.couplePassword.isSet = true;
      status.couplePassword.updatedAt = coupleHash.updated_at;
    }

    // 检查访客密码
    const visitorHash = await global.db.get(
      "SELECT value, updated_at FROM settings WHERE key = 'visitor_password_hash'",
    );

    const visitorExpiry = await global.db.get(
      "SELECT value FROM settings WHERE key = 'visitor_password_expires'",
    );

    if (visitorHash && visitorHash.value) {
      status.visitorPassword.isSet = true;
      status.visitorPassword.updatedAt = visitorHash.updated_at;

      if (visitorExpiry && visitorExpiry.value) {
        const expiryTime = new Date(visitorExpiry.value);
        const now = new Date();

        status.visitorPassword.expiresAt = expiryTime.toISOString();
        status.visitorPassword.isExpired = now > expiryTime;

        if (!status.visitorPassword.isExpired) {
          const hoursLeft = Math.ceil((expiryTime - now) / (1000 * 60 * 60));
          status.visitorPassword.hoursLeft = hoursLeft;
        }
      }
    }

    // 检查加密密钥
    const encryptKey = await global.db.get(
      "SELECT value, updated_at FROM settings WHERE key = 'encryption_key'",
    );

    if (encryptKey && encryptKey.value) {
      status.encryptionKey.isSet = true;
      status.encryptionKey.fingerprint = encryptKey.value.substring(0, 8);
      status.encryptionKey.updatedAt = encryptKey.updated_at;
    }

    res.json({
      success: true,
      status,
    });
  } catch (error) {
    logger.error("获取密码状态失败:", error);
    res.status(500).json({
      success: false,
      error: "获取状态失败",
    });
  }
});

// 修改情侣密码
router.put("/couple", requireCoupleAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: "当前密码和新密码都不能为空",
      });
    }

    // 验证当前密码
    const currentHash = await global.db.get(
      "SELECT value FROM settings WHERE key = 'couple_password_hash'",
    );

    if (!currentHash || !currentHash.value) {
      return res.status(400).json({
        success: false,
        error: "当前未设置密码",
      });
    }

    const isCurrentValid = await PasswordCrypto.verifyPassword(
      currentPassword,
      currentHash.value,
    );
    if (!isCurrentValid) {
      logger.warn("情侣密码修改失败 - 当前密码错误", {
        ip: req.ip,
      });
      return res.status(400).json({
        success: false,
        error: "当前密码错误",
      });
    }

    // 验证新密码强度
    const validation = PasswordCrypto.validatePasswordStrength(newPassword);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: "新密码不符合要求",
        details: validation.errors,
      });
    }

    // 生成新密码哈希
    const newHash = await PasswordCrypto.hashPassword(newPassword);

    // 更新数据库
    await global.db.run(
      "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
      ["couple_password_hash", newHash, new Date().toISOString()],
    );

    // 记录到历史
    await global.db.run(
      "INSERT INTO password_history (password_type, password_hash) VALUES (?, ?)",
      ["couple", newHash],
    );

    logger.info("情侣密码修改成功", {
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.json({
      success: true,
      message: "情侣密码修改成功",
    });
  } catch (error) {
    logger.error("修改情侣密码失败:", error);
    res.status(500).json({
      success: false,
      error: "修改密码失败",
    });
  }
});

// 设置/修改访客密码
router.put("/visitor", requireCoupleAuth, async (req, res) => {
  try {
    const { password, expiryHours = 24 } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        error: "访客密码不能为空",
      });
    }

    // 验证密码强度
    const validation = PasswordCrypto.validatePasswordStrength(password);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: "密码不符合要求",
        details: validation.errors,
      });
    }

    // 验证有效期
    if (expiryHours < 1 || expiryHours > 168) {
      // 最长7天
      return res.status(400).json({
        success: false,
        error: "有效期必须在1-168小时之间",
      });
    }

    // 生成密码哈希
    const hash = await PasswordCrypto.hashPassword(password);
    const expiryTime = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    // 更新数据库
    await global.db.run(
      "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
      ["visitor_password_hash", hash, new Date().toISOString()],
    );

    await global.db.run(
      "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
      [
        "visitor_password_expires",
        expiryTime.toISOString(),
        new Date().toISOString(),
      ],
    );

    // 记录到历史
    await global.db.run(
      "INSERT INTO password_history (password_type, password_hash) VALUES (?, ?)",
      ["visitor", hash],
    );

    logger.info("访客密码设置成功", {
      expiryHours,
      expiresAt: expiryTime.toISOString(),
      ip: req.ip,
    });

    res.json({
      success: true,
      message: "访客密码设置成功",
      expiresAt: expiryTime.toISOString(),
      expiryHours,
    });
  } catch (error) {
    logger.error("设置访客密码失败:", error);
    res.status(500).json({
      success: false,
      error: "设置密码失败",
    });
  }
});

// 生成随机访客密码
router.post("/visitor/generate", requireCoupleAuth, async (req, res) => {
  try {
    const { expiryHours = 24, length = 8 } = req.body;

    // 验证参数
    if (expiryHours < 1 || expiryHours > 168) {
      return res.status(400).json({
        success: false,
        error: "有效期必须在1-168小时之间",
      });
    }

    if (length < 6 || length > 20) {
      return res.status(400).json({
        success: false,
        error: "密码长度必须在6-20字符之间",
      });
    }

    // 生成随机密码
    const randomPassword = PasswordCrypto.generateRandomPassword(length);
    const hash = await PasswordCrypto.hashPassword(randomPassword);
    const expiryTime = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    // 更新数据库
    await global.db.run(
      "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
      ["visitor_password_hash", hash, new Date().toISOString()],
    );

    await global.db.run(
      "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
      [
        "visitor_password_expires",
        expiryTime.toISOString(),
        new Date().toISOString(),
      ],
    );

    // 记录到历史
    await global.db.run(
      "INSERT INTO password_history (password_type, password_hash) VALUES (?, ?)",
      ["visitor", hash],
    );

    logger.info("随机访客密码生成成功", {
      expiryHours,
      passwordLength: length,
      expiresAt: expiryTime.toISOString(),
      ip: req.ip,
    });

    res.json({
      success: true,
      message: "随机访客密码生成成功",
      password: randomPassword, // 只在生成时返回明文密码
      expiresAt: expiryTime.toISOString(),
      expiryHours,
    });
  } catch (error) {
    logger.error("生成随机访客密码失败:", error);
    res.status(500).json({
      success: false,
      error: "生成密码失败",
    });
  }
});

// 撤销访客密码
router.delete("/visitor", requireCoupleAuth, async (req, res) => {
  try {
    // 清除访客密码
    await global.db.run(
      "DELETE FROM settings WHERE key IN ('visitor_password_hash', 'visitor_password_expires')",
    );

    logger.info("访客密码已撤销", {
      ip: req.ip,
    });

    res.json({
      success: true,
      message: "访客密码已撤销",
    });
  } catch (error) {
    logger.error("撤销访客密码失败:", error);
    res.status(500).json({
      success: false,
      error: "撤销密码失败",
    });
  }
});

// 获取密码历史（最近10条）
router.get("/history", requireCoupleAuth, async (req, res) => {
  try {
    const history = await global.db.all(`
      SELECT password_type, created_at
      FROM password_history
      ORDER BY created_at DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      history: history.map((item) => ({
        type: item.password_type,
        createdAt: item.created_at,
        displayName: item.password_type === "couple" ? "情侣密码" : "访客密码",
      })),
    });
  } catch (error) {
    logger.error("获取密码历史失败:", error);
    res.status(500).json({
      success: false,
      error: "获取历史失败",
    });
  }
});

module.exports = router;
