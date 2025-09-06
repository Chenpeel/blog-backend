#!/bin/bash

# N1盒子博客API部署脚本

set -e

echo "🚀 开始部署博客API到N1盒子..."

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查环境
check_environment() {
    echo -e "${YELLOW}📋 检查环境...${NC}"

    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker 未安装${NC}"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        echo -e "${RED}❌ Docker Compose 未安装${NC}"
        exit 1
    fi

    echo -e "${GREEN}✅ Docker 环境检查通过${NC}"
}

# 创建必要的目录
create_directories() {
    echo -e "${YELLOW}📁 创建必要目录...${NC}"
    mkdir -p data
    mkdir -p logs/server
    mkdir -p logs/nginx
    mkdir -p nginx/ssl
    echo -e "${GREEN}✅ 目录创建完成${NC}"
}

# 检查环境变量文件
check_env_file() {
    echo -e "${YELLOW}🔧 检查环境配置...${NC}"

    if [ ! -f ".env.production" ]; then
        echo -e "${RED}❌ .env.production 文件不存在${NC}"
        echo -e "${YELLOW}请根据 .env.production.example 创建配置文件${NC}"
        exit 1
    fi

    # 检查关键环境变量
    if ! grep -q "SESSION_SECRET=" .env.production || grep -q "your_very_long_random_secret" .env.production; then
        echo -e "${RED}❌ 请设置强随机的 SESSION_SECRET${NC}"
        exit 1
    fi

    if ! grep -q "REDIS_PASSWORD=" .env.production || grep -q "your_strong_redis_password" .env.production; then
        echo -e "${RED}❌ 请设置强随机的 REDIS_PASSWORD${NC}"
        exit 1
    fi

    echo -e "${GREEN}✅ 环境配置检查通过${NC}"
}

# 停止现有服务
stop_existing_services() {
    echo -e "${YELLOW}🛑 停止现有服务...${NC}"
    docker-compose -f docker-compose.prod.yml down 2>/dev/null || true
    echo -e "${GREEN}✅ 现有服务已停止${NC}"
}

# 构建和启动服务
deploy_services() {
    echo -e "${YELLOW}🔨 构建并启动服务...${NC}"

    # 加载环境变量
    export $(grep -v '^#' .env.production | xargs)

    # 构建并启动
    docker-compose -f docker-compose.prod.yml up -d --build

    echo -e "${GREEN}✅ 服务部署完成${NC}"
}

# 等待服务启动
wait_for_services() {
    echo -e "${YELLOW}⏳ 等待服务启动...${NC}"

    # 等待API服务
    for i in {1..30}; do
        if curl -s http://localhost:8812/health > /dev/null; then
            echo -e "${GREEN}✅ API服务启动成功${NC}"
            break
        fi
        echo "等待API服务启动... ($i/30)"
        sleep 2
    done

    # 检查所有服务状态
    echo -e "${YELLOW}📊 服务状态:${NC}"
    docker-compose -f docker-compose.prod.yml ps
}

# 显示部署信息
show_deployment_info() {
    echo -e "\n${GREEN}🎉 部署完成!${NC}"
    echo -e "${YELLOW}📋 服务信息:${NC}"
    echo "• API服务: http://localhost:8812"
    echo "• Nginx代理: http://localhost:80"
    echo "• 健康检查: http://localhost/health"
    echo "• Redis: localhost:6379 (仅本地访问)"

    echo -e "\n${YELLOW}📝 常用命令:${NC}"
    echo "• 查看日志: docker-compose -f docker-compose.prod.yml logs -f"
    echo "• 重启服务: docker-compose -f docker-compose.prod.yml restart"
    echo "• 停止服务: docker-compose -f docker-compose.prod.yml down"
    echo "• 更新服务: ./deploy.sh"

    echo -e "\n${YELLOW}📁 重要目录:${NC}"
    echo "• 数据目录: ./data"
    echo "• 日志目录: ./logs"
    echo "• Nginx配置: ./nginx/nginx.conf"
}

# 主函数
main() {
    check_environment
    create_directories
    check_env_file
    stop_existing_services
    deploy_services
    wait_for_services
    show_deployment_info
}

# 运行主函数
main
