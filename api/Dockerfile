FROM node:18-alpine

# 安装构建依赖和sqlite3
RUN apk add --no-cache make gcc g++ python3 py3-setuptools sqlite sqlite-dev

WORKDIR /app

# 复制package文件
COPY package*.json ./

# 删除现有的node_modules（如果有的话）并重新安装
RUN rm -rf node_modules package-lock.json && \
    npm install --build-from-source --sqlite=/usr

# 复制应用代码
COPY . .

# 创建必要的目录
RUN mkdir -p ../data logs/server

# 暴露端口
EXPOSE 8812

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8812/health || exit 1

# 启动应用
CMD ["npm", "start"]
