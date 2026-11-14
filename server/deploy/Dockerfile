# 剪藏服务镜像（阶段一 · 本地原型）
#
# 为什么直接跑 .ts：Node 24 原生支持类型剥离（type stripping），不需要额外构建步骤，
# 改完源码重启容器就生效。运行期只依赖 sanitize-html + htmlparser2 那几个包。
FROM node:24-alpine

WORKDIR /app

# 先装依赖（利用层缓存：源码改动不会重装依赖）
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

ENV NODE_ENV=production
# 数据目录（剪藏记录 SQLite + 快照）走卷挂载，容器删了数据还在
ENV KF_DATA_DIR=data
ENV KF_ASSETS_DIR=data/assets

EXPOSE 8787

# 健康检查用（alpine 自带 wget）
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1

CMD ["node", "src/clipServer.ts", "--port", "8787"]
