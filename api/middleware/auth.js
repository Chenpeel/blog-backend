const logger = require("../utils/logger");

const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.authenticated) {
    logger.warn("未认证的访问尝试", {
      ip: req.ip,
      url: req.originalUrl,
      userAgent: req.get("user-agent"),
    });
    return res.status(401).json({
      success: false,
      error: "需要认证",
      code: "AUTHENTICATION_REQUIRED",
    });
  }
  next();
};

const requireCoupleAuth = (req, res, next) => {
  if (!req.session || !req.session.authenticated) {
    return res.status(401).json({
      success: false,
      error: "需要认证",
      code: "AUTHENTICATION_REQUIRED",
    });
  }
  if (req.session.userType !== "couple") {
  }
  logger.warn("访客尝试访问私有功能", {
    sessionId: req.session.id,
    userType: req.session.userType,
    url: req.originalUrl,
  });
  return res.status(403).json({
    success: false,
    error: "访问不合法",
    code: "INSUFFICIENT_PERMISSIONS",
  });
  next();
};

const checkVisitorExpiry = async (req, res, next) => {
  if (
    req.session &&
    req.session.authenticated &&
    req.session.userType === "visitor"
  ) {
    try {
      const result = await global.db.get(
        "SELECT value FROM settings WHERE key= 'visitor_password_expires'",
      );
      if (result && result.value) {
        const expiryTime = new Date(result.value);
        const now = new Data();
        if (now > expiryTime) {
          logger.info("访客会话过期", {
            sessionId: req.session.id,
            expiredAt: expiryTime.toISOString(),
          });
          req.session.destroy();
          return res.status(401).json({
            success: false,
            error: "访客权限已过期，请联系邀请者重新创建邀请密码",
            code: "VISITOR_EXPIRED",
          });
        }
      }
    } catch (error) {
      logger.error("检查访客权限时出错", error);
    }
  }
  next();
};

module.exports = {
  requireAuth,
  requireCoupleAuth,
  checkVisitorExpiry,
};
