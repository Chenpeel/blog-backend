const PasswordCrypto = require("../utils/crypto");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const path = require("path");
const readline = require("readline");

class PasswordManager {
  static async initDatabase() {
    const dbPath = path.join(__dirname, "../../data/love_blog.db");
    console.log("数据库路径:", dbPath);

    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    return db;
  }

  // 设置情侣密码
  static async setCouplePassword(plainPassword) {
    const db = await this.initDatabase();

    try {
      // 验证密码强度
      const validation = PasswordCrypto.validatePasswordStrength(plainPassword);
      if (!validation.isValid) {
        console.log("❌ 密码不符合要求:");
        validation.errors.forEach((error) => console.log("  - " + error));
        return false;
      }

      const hashedPassword = await PasswordCrypto.hashPassword(plainPassword);

      // 更新数据库中的密码哈希
      await db.run(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
        ["couple_password_hash", hashedPassword, new Date().toISOString()],
      );

      // 清除旧的明文密码（如果存在）
      await db.run("DELETE FROM settings WHERE key = 'couple_password'");

      // 保存到密码历史
      await db.run(
        "INSERT INTO password_history (password_type, password_hash) VALUES (?, ?)",
        ["couple", hashedPassword],
      );

      console.log("✅ 情侣密码设置成功");
      console.log("密码哈希长度:", hashedPassword.length);
      return true;
    } catch (error) {
      console.error("❌ 设置情侣密码失败:", error.message);
      return false;
    } finally {
      await db.close();
    }
  }

  // 设置访客密码
  static async setVisitorPassword(plainPassword, expiryHours = 24) {
    const db = await this.initDatabase();

    try {
      // 验证密码强度
      const validation = PasswordCrypto.validatePasswordStrength(plainPassword);
      if (!validation.isValid) {
        console.log("❌ 密码不符合要求:");
        validation.errors.forEach((error) => console.log("  - " + error));
        return false;
      }

      const hashedPassword = await PasswordCrypto.hashPassword(plainPassword);
      const expiryTime = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

      // 更新访客密码哈希
      await db.run(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
        ["visitor_password_hash", hashedPassword, new Date().toISOString()],
      );

      // 设置过期时间
      await db.run(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
        [
          "visitor_password_expires",
          expiryTime.toISOString(),
          new Date().toISOString(),
        ],
      );

      // 清除旧的明文密码（如果存在）
      await db.run("DELETE FROM settings WHERE key = 'visitor_password'");

      // 保存到密码历史
      await db.run(
        "INSERT INTO password_history (password_type, password_hash) VALUES (?, ?)",
        ["visitor", hashedPassword],
      );

      console.log("✅ 访客密码设置成功");
      console.log(
        "过期时间:",
        expiryTime.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
      );
      console.log("有效期:", expiryHours + "小时");
      return true;
    } catch (error) {
      console.error("❌ 设置访客密码失败:", error.message);
      return false;
    } finally {
      await db.close();
    }
  }

  // 生成加密密钥
  static async generateEncryptionKey() {
    const db = await this.initDatabase();

    try {
      const encryptionKey = PasswordCrypto.generateEncryptionKey();

      await db.run(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
        ["encryption_key", encryptionKey, new Date().toISOString()],
      );

      console.log("✅ 前端加密密钥生成成功");
      console.log("密钥指纹:", encryptionKey.substring(0, 8) + "...");
      console.log("完整密钥已保存到数据库");
      return encryptionKey;
    } catch (error) {
      console.error("❌ 生成加密密钥失败:", error.message);
      return null;
    } finally {
      await db.close();
    }
  }

  // 查看当前密码状态
  static async showPasswordStatus() {
    const db = await this.initDatabase();

    try {
      console.log("\n=== 密码状态概览 ===");

      // 检查情侣密码
      const coupleHash = await db.get(
        "SELECT value, updated_at FROM settings WHERE key = 'couple_password_hash'",
      );

      if (coupleHash && coupleHash.value) {
        console.log("✅ 情侣密码: 已设置");
        console.log(
          "   更新时间:",
          new Date(coupleHash.updated_at).toLocaleString("zh-CN"),
        );
      } else {
        console.log("❌ 情侣密码: 未设置");
      }

      // 检查访客密码
      const visitorHash = await db.get(
        "SELECT value, updated_at FROM settings WHERE key = 'visitor_password_hash'",
      );

      const visitorExpiry = await db.get(
        "SELECT value FROM settings WHERE key = 'visitor_password_expires'",
      );

      if (visitorHash && visitorHash.value) {
        console.log("✅ 访客密码: 已设置");
        console.log(
          "   更新时间:",
          new Date(visitorHash.updated_at).toLocaleString("zh-CN"),
        );

        if (visitorExpiry && visitorExpiry.value) {
          const expiryTime = new Date(visitorExpiry.value);
          const now = new Date();
          const isExpired = now > expiryTime;

          console.log("   过期时间:", expiryTime.toLocaleString("zh-CN"));
          console.log("   状态:", isExpired ? "❌ 已过期" : "✅ 有效");

          if (!isExpired) {
            const hoursLeft = Math.ceil((expiryTime - now) / (1000 * 60 * 60));
            console.log("   剩余时间:", hoursLeft + "小时");
          }
        }
      } else {
        console.log("❌ 访客密码: 未设置");
      }

      // 检查加密密钥
      const encryptKey = await db.get(
        "SELECT value, updated_at FROM settings WHERE key = 'encryption_key'",
      );

      if (encryptKey && encryptKey.value) {
        console.log("✅ 加密密钥: 已生成");
        console.log("   密钥指纹:", encryptKey.value.substring(0, 8) + "...");
        console.log(
          "   生成时间:",
          new Date(encryptKey.updated_at).toLocaleString("zh-CN"),
        );
      } else {
        console.log("❌ 加密密钥: 未生成");
      }

      console.log("\n");
    } catch (error) {
      console.error("❌ 获取密码状态失败:", error.message);
    } finally {
      await db.close();
    }
  }

  // 测试密码验证
  static async testPassword(password, type = "couple") {
    const db = await this.initDatabase();

    try {
      const hashKey =
        type === "couple" ? "couple_password_hash" : "visitor_password_hash";
      const result = await db.get("SELECT value FROM settings WHERE key = ?", [
        hashKey,
      ]);

      if (!result || !result.value) {
        console.log(`❌ ${type === "couple" ? "情侣" : "访客"}密码未设置`);
        return false;
      }

      const isValid = await PasswordCrypto.verifyPassword(
        password,
        result.value,
      );
      console.log(
        `${isValid ? "✅" : "❌"} ${type === "couple" ? "情侣" : "访客"}密码验证${isValid ? "成功" : "失败"}`,
      );
      return isValid;
    } catch (error) {
      console.error("❌ 测试密码失败:", error.message);
      return false;
    } finally {
      await db.close();
    }
  }

  // 交互式密码设置
  static async interactiveSetup() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const question = (prompt) =>
      new Promise((resolve) => {
        rl.question(prompt, resolve);
      });

    try {
      console.log("\n=== 恋爱博客密码设置向导 ===\n");

      // 设置情侣密码
      const couplePassword = await question("请输入情侣密码: ");
      if (couplePassword) {
        await this.setCouplePassword(couplePassword);
      }

      // 设置访客密码
      const visitorPassword = await question("请输入访客密码: ");
      if (visitorPassword) {
        const hoursInput = await question("访客密码有效期（小时，默认24）: ");
        const hours = parseInt(hoursInput) || 24;
        await this.setVisitorPassword(visitorPassword, hours);
      }

      // 生成加密密钥
      const generateKey = await question("是否生成新的加密密钥？(y/N): ");
      if (
        generateKey.toLowerCase() === "y" ||
        generateKey.toLowerCase() === "yes"
      ) {
        await this.generateEncryptionKey();
      }

      console.log("\n=== 设置完成 ===");
      await this.showPasswordStatus();
    } catch (error) {
      console.error("❌ 交互式设置失败:", error.message);
    } finally {
      rl.close();
    }
  }
}

// 命令行工具
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  async function runCommand() {
    switch (command) {
      case "set-couple":
        const couplePassword = args[1];
        if (!couplePassword) {
          console.log("用法: node password-manager.js set-couple <密码>");
          process.exit(1);
        }
        await PasswordManager.setCouplePassword(couplePassword);
        break;

      case "set-visitor":
        const visitorPassword = args[1];
        const hours = parseInt(args[2]) || 24;
        if (!visitorPassword) {
          console.log(
            "用法: node password-manager.js set-visitor <密码> [过期小时数]",
          );
          process.exit(1);
        }
        await PasswordManager.setVisitorPassword(visitorPassword, hours);
        break;

      case "generate-key":
        await PasswordManager.generateEncryptionKey();
        break;

      case "status":
        await PasswordManager.showPasswordStatus();
        break;

      case "test-couple":
        const testCouplePassword = args[1];
        if (!testCouplePassword) {
          console.log("用法: node password-manager.js test-couple <密码>");
          process.exit(1);
        }
        await PasswordManager.testPassword(testCouplePassword, "couple");
        break;

      case "test-visitor":
        const testVisitorPassword = args[1];
        if (!testVisitorPassword) {
          console.log("用法: node password-manager.js test-visitor <密码>");
          process.exit(1);
        }
        await PasswordManager.testPassword(testVisitorPassword, "visitor");
        break;

      case "setup":
        await PasswordManager.interactiveSetup();
        break;

      default:
        console.log(`
🔐 恋爱博客密码管理工具

用法:
  node password-manager.js <命令> [参数]

命令:
  set-couple <密码>           设置情侣密码
  set-visitor <密码> [小时]   设置访客密码（默认24小时过期）
  generate-key               生成前端加密密钥
  status                     查看密码状态
  test-couple <密码>         测试情侣密码
  test-visitor <密码>        测试访客密码
  setup                      交互式设置向导

示例:
  node password-manager.js set-couple "ILoveYou2024"
  node password-manager.js set-visitor "TempPass123" 12
  node password-manager.js generate-key
  node password-manager.js status
  node password-manager.js setup
        `);
    }
  }

  runCommand().catch((error) => {
    console.error("执行命令时发生错误:", error.message);
    process.exit(1);
  });
}

module.exports = PasswordManager;
