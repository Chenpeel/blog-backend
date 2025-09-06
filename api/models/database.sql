-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    avatar_qq VARCHAR(20),
    role TEXT CHECK(role IN ('couple', 'visitor')) DEFAULT 'visitor',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 帖子表
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title VARCHAR(200),
    content TEXT NOT NULL,
    author_id INTEGER NOT NULL,
    visibility TEXT CHECK(visibility IN ('public', 'private')) DEFAULT 'public',
    post_type TEXT CHECK(post_type IN ('text', 'image', 'video')) DEFAULT 'text',
    images TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (author_id) REFERENCES users(id)
);

-- 设置表
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 密码历史表（新增）
CREATE TABLE IF NOT EXISTS password_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    password_type TEXT CHECK(password_type IN ('couple', 'visitor')) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 更新设置数据 - 使用哈希密码
INSERT OR IGNORE INTO settings (key, value, description) VALUES
('couple_password_hash', '', '情侣专属密码哈希'),
('visitor_password_hash', '', '访客密码哈希'),
('visitor_password_expires', '', '访客密码过期时间'),
('love_start_date', '2025-06-12', '相爱开始日期'),
('couple_avatar_1', '', '情侣头像1的QQ号'),
('couple_avatar_2', '', '情侣头像2的QQ号'),
('couple_name_1', '用户1', '情侣姓名1'),
('couple_name_2', '用户2', '情侣姓名2'),
('encryption_key', '', '前端加密密钥');

-- 移除旧的明文密码设置（如果存在）
DELETE FROM settings WHERE key IN ('couple_password', 'visitor_password');

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_posts_visibility ON posts(visibility);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);
CREATE INDEX IF NOT EXISTS idx_password_history_type ON password_history(password_type);
CREATE INDEX IF NOT EXISTS idx_password_history_created ON password_history(created_at DESC);
