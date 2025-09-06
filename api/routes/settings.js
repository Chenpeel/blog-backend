const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");
const {
  requireAuth,
  requireCoupleAuth,
  checkVisitorExpiry,
} = require("../middleware/auth");

// 获取设置 - 根据用户权限返回不同的设置
router.get("/", requireAuth, checkVisitorExpiry, async (req, res) => {
  try {
    const userType = req.session.userType;

    // 获取所有设置
    const allSettings = await global.db.all(
      "SELECT key, value, description FROM settings",
    );

    // 根据用户类型过滤设置
    let settings = {};

    // 公开设置（所有认证用户都可以看到）
    const publicSettings = [
      "love_start_date",
      "couple_name_1",
      "couple_name_2",
      "couple_avatar_1",
      "couple_avatar_2",
    ];

    // 情侣专属设置
    const coupleOnlySettings = [
      "couple_password",
      "visitor_password",
      "visitor_password_expires",
    ];

    for (const setting of allSettings) {
      if (publicSettings.includes(setting.key)) {
        settings[setting.key] = setting.value;
      } else if (
        userType === "couple" &&
        coupleOnlySettings.includes(setting.key)
      ) {
        settings[setting.key] = setting.value;
      }
    }

    logger.debug(`向${userType}用户返回设置`, {
      settingsCount: Object.keys(settings).length,
    });

    res.json({
      success: true,
      settings,
      userType,
    });
  } catch (error) {
    logger.error("获取设置时发生错误:", error);
    res.status(500).json({
      success: false,
      error: "获取设置失败",
    });
  }
});

// 更新设置 - 仅限情侣用户
router.put("/", requireCoupleAuth, async (req, res) => {
  try {
    const { settings } = req.body;

    if (!settings || typeof settings !== "object") {
      return res.status(400).json({
        success: false,
        error: "设置数据格式不正确",
      });
    }

    // 允许更新的设置列表
    const allowedSettings = [
      "couple_password",
      "visitor_password",
      "visitor_password_expires",
      "love_start_date",
      "couple_name_1",
      "couple_name_2",
      "couple_avatar_1",
      "couple_avatar_2",
    ];

    const updates = [];
    for (const [key, value] of Object.entries(settings)) {
      if (allowedSettings.includes(key)) {
        updates.push({ key, value });
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: "没有有效的设置需要更新",
      });
    }

    // 批量更新设置
    for (const { key, value } of updates) {
      await global.db.run(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
        [key, value, new Date().toISOString()],
      );
    }

    logger.info("情侣用户更新了设置", {
      updatedKeys: updates.map((u) => u.key),
      ip: req.ip,
    });

    res.json({
      success: true,
      message: "设置更新成功",
      updatedCount: updates.length,
    });
  } catch (error) {
    logger.error("更新设置时发生错误:", error);
    res.status(500).json({
      success: false,
      error: "更新设置失败",
    });
  }
});

module.exports = router;
