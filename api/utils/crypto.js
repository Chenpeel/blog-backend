const crypto = require("crypto");
const bcrypt = require("bcrypt");
const logger = require("./logger");

// 密码哈希配置
const SALT_ROUNDS = 12; // bcrypt加盐轮数
const AES_ALGORITHM = "aes-256-gcm";

class PasswordCrypto {
  // 生成密码哈希
  static async hashPassword(plainPassword) {
    try {
      if (!plainPassword || plainPassword.length < 1) {
        throw new Error("密码不能为空");
      }

      const hash = await bcrypt.hash(plainPassword, SALT_ROUNDS);
      logger.debug("密码哈希生成成功");
      return hash;
    } catch (error) {
      logger.error("密码哈希生成失败:", error);
      throw new Error("密码哈希失败: " + error.message);
    }
  }

  // 验证密码
  static async verifyPassword(plainPassword, hashedPassword) {
    try {
      if (!plainPassword || !hashedPassword) {
        return false;
      }

      const isValid = await bcrypt.compare(plainPassword, hashedPassword);
      logger.debug("密码验证完成", { isValid });
      return isValid;
    } catch (error) {
      logger.error("密码验证失败:", error);
      return false;
    }
  }

  // 生成随机盐值
  static generateSalt(length = 32) {
    return crypto.randomBytes(length).toString("hex");
  }

  // AES加密（用于前端传输）
  static encrypt(text, key) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher("aes-256-cbc", key);

      let encrypted = cipher.update(text, "utf8", "hex");
      encrypted += cipher.final("hex");

      return {
        encrypted,
        iv: iv.toString("hex"),
      };
    } catch (error) {
      logger.error("AES加密失败:", error);
      throw new Error("数据加密失败");
    }
  }

  // AES解密
  static decrypt(encryptedData, key) {
    try {
      const { encrypted, iv } = encryptedData;
      const decipher = crypto.createDecipher("aes-256-cbc", key);

      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (error) {
      logger.error("AES解密失败:", error);
      throw new Error("数据解密失败");
    }
  }

  // 生成前端加密密钥
  static generateEncryptionKey() {
    return crypto.randomBytes(32).toString("hex");
  }

  // 验证密码强度
  static validatePasswordStrength(password) {
    const errors = [];

    if (!password) {
      errors.push("密码不能为空");
      return { isValid: false, errors };
    }

    if (password.length < 6) {
      errors.push("密码长度至少6个字符");
    }

    if (password.length > 100) {
      errors.push("密码长度不能超过100个字符");
    }

    // 可以添加更多密码策略
    // if (!/[A-Z]/.test(password)) {
    //   errors.push('密码需要包含大写字母');
    // }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  // 生成随机密码
  static generateRandomPassword(length = 12) {
    const charset =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";

    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(charset.length);
      password += charset[randomIndex];
    }

    return password;
  }
}

module.exports = PasswordCrypto;
