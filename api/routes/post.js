const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");
const {
  requireAuth,
  requireCoupleAuth,
  checkVisitorExpiry,
} = require("../middleware/auth");

// 获取帖子列表 - 根据用户权限过滤
router.get("/", requireAuth, checkVisitorExpiry, async (req, res) => {
  try {
    const { page = 1, limit = 20, author_id } = req.query;
    const userType = req.session.userType;
    const offset = (page - 1) * limit;

    let whereClause = "";
    let params = [];

    // 根据用户类型过滤可见性
    if (userType === "visitor") {
      whereClause = "WHERE p.visibility = 'public'";
    } else if (userType === "couple") {
      whereClause = "WHERE 1=1"; // 情侣可以看到所有帖子
    }

    // 如果指定了作者ID，添加过滤条件
    if (author_id) {
      whereClause +=
        (whereClause.includes("WHERE") ? " AND" : "WHERE") + " p.author_id = ?";
      params.push(author_id);
    }

    // 添加分页参数
    params.push(parseInt(limit), parseInt(offset));

    const query = `
      SELECT
        p.id, p.title, p.content, p.author_id, p.visibility,
        p.post_type, p.images, p.created_at, p.updated_at,
        u.username as author_name, u.avatar_qq as author_avatar
      FROM posts p
      LEFT JOIN users u ON p.author_id = u.id
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const posts = await global.db.all(query, params);

    // 获取总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM posts p
      ${whereClause.replace("LIMIT ? OFFSET ?", "")}
    `;
    const countParams = params.slice(0, -2); // 移除limit和offset参数
    const { total } = await global.db.get(countQuery, countParams);

    logger.debug(`向${userType}用户返回帖子列表`, {
      postsCount: posts.length,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });

    res.json({
      success: true,
      posts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
      userType,
    });
  } catch (error) {
    logger.error("获取帖子列表时发生错误:", error);
    res.status(500).json({
      success: false,
      error: "获取帖子失败",
    });
  }
});

// 获取单个帖子
router.get("/:id", requireAuth, checkVisitorExpiry, async (req, res) => {
  try {
    const { id } = req.params;
    const userType = req.session.userType;

    const post = await global.db.get(
      `
      SELECT
        p.id, p.title, p.content, p.author_id, p.visibility,
        p.post_type, p.images, p.created_at, p.updated_at,
        u.username as author_name, u.avatar_qq as author_avatar
      FROM posts p
      LEFT JOIN users u ON p.author_id = u.id
      WHERE p.id = ?
    `,
      [id],
    );

    if (!post) {
      return res.status(404).json({
        success: false,
        error: "帖子不存在",
      });
    }

    // 检查访问权限
    if (userType === "visitor" && post.visibility === "private") {
      return res.status(403).json({
        success: false,
        error: "无权访问此帖子",
      });
    }

    res.json({
      success: true,
      post,
    });
  } catch (error) {
    logger.error("获取帖子详情时发生错误:", error);
    res.status(500).json({
      success: false,
      error: "获取帖子失败",
    });
  }
});

// 创建新帖子 - 仅限情侣用户
router.post("/", requireCoupleAuth, async (req, res) => {
  try {
    const {
      title,
      content,
      author_id,
      visibility = "public",
      post_type = "text",
      images,
    } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: "帖子内容不能为空",
      });
    }

    if (!author_id) {
      return res.status(400).json({
        success: false,
        error: "必须指定作者",
      });
    }

    // 验证可见性值
    if (!["public", "private"].includes(visibility)) {
      return res.status(400).json({
        success: false,
        error: "可见性参数无效",
      });
    }

    const result = await global.db.run(
      `
      INSERT INTO posts (title, content, author_id, visibility, post_type, images, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        title || "",
        content,
        author_id,
        visibility,
        post_type,
        images ? JSON.stringify(images) : null,
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );

    logger.info("创建新帖子", {
      postId: result.lastID,
      authorId: author_id,
      visibility,
      ip: req.ip,
    });

    res.status(201).json({
      success: true,
      message: "帖子创建成功",
      postId: result.lastID,
    });
  } catch (error) {
    logger.error("创建帖子时发生错误:", error);
    res.status(500).json({
      success: false,
      error: "创建帖子失败",
    });
  }
});

// 更新帖子 - 仅限情侣用户
router.put("/:id", requireCoupleAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, visibility, post_type, images } = req.body;

    // 检查帖子是否存在
    const existingPost = await global.db.get(
      "SELECT id FROM posts WHERE id = ?",
      [id],
    );
    if (!existingPost) {
      return res.status(404).json({
        success: false,
        error: "帖子不存在",
      });
    }

    const updates = [];
    const params = [];

    if (title !== undefined) {
      updates.push("title = ?");
      params.push(title);
    }
    if (content !== undefined) {
      updates.push("content = ?");
      params.push(content);
    }
    if (visibility !== undefined) {
      if (!["public", "private"].includes(visibility)) {
        return res.status(400).json({
          success: false,
          error: "可见性参数无效",
        });
      }
      updates.push("visibility = ?");
      params.push(visibility);
    }
    if (post_type !== undefined) {
      updates.push("post_type = ?");
      params.push(post_type);
    }
    if (images !== undefined) {
      updates.push("images = ?");
      params.push(images ? JSON.stringify(images) : null);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: "没有需要更新的内容",
      });
    }

    updates.push("updated_at = ?");
    params.push(new Date().toISOString());
    params.push(id);

    await global.db.run(
      `
      UPDATE posts SET ${updates.join(", ")} WHERE id = ?
    `,
      params,
    );

    logger.info("更新帖子", {
      postId: id,
      updates: updates,
      ip: req.ip,
    });

    res.json({
      success: true,
      message: "帖子更新成功",
    });
  } catch (error) {
    logger.error("更新帖子时发生错误:", error);
    res.status(500).json({
      success: false,
      error: "更新帖子失败",
    });
  }
});

// 删除帖子 - 仅限情侣用户
router.delete("/:id", requireCoupleAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await global.db.run("DELETE FROM posts WHERE id = ?", [id]);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: "帖子不存在",
      });
    }

    logger.info("删除帖子", {
      postId: id,
      ip: req.ip,
    });

    res.json({
      success: true,
      message: "帖子删除成功",
    });
  } catch (error) {
    logger.error("删除帖子时发生错误:", error);
    res.status(500).json({
      success: false,
      error: "删除帖子失败",
    });
  }
});

module.exports = router;
