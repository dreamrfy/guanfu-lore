# 剪藏服务（服务器端）部署说明

> 目标机器：腾讯云轻量 4C4G · Ubuntu 24.04 · Docker 已预装
> 目录约定：程序 `/opt/bijiapp`、凭证 `/etc/bijiapp`（600）、数据 `/opt/bijiapp/deploy/data`

## 组成

| 容器 | 干什么 | 对外 |
| --- | --- | --- |
| `bijiapp-clip` | 剪藏 HTTP 接口（`POST /api/clip`），带 Bearer Token | 只绑宿主 `127.0.0.1:8787`（对外由 Caddy 统一出入口） |
| `bijiapp-poll` | 微信客服轮询：每 5 分钟拉一次消息 → 抓正文 → 存 R2 | 不对外 |
| `bijiapp-caddy` | HTTPS 入口（Caddy 自动签证书） | `profile=public`，**有域名后再开** |

## 首次部署

```bash
# 1. 传代码（server/ 下的 src、package.json、deploy/）
scp -P 20001 -i <私钥> -r src deploy package.json package-lock.json ubuntu@<IP>:/tmp/bijiapp-new/

# 2. 换到正式目录（保留旧版备份）
sudo mv /opt/bijiapp/src /opt/bijiapp/src.bak-$(date +%F)
sudo mv /tmp/bijiapp-new/src /opt/bijiapp/src
sudo mv /tmp/bijiapp-new/deploy /opt/bijiapp/deploy   # 注意：目标目录已存在时要 mv 里面的文件
sudo install -m 644 /tmp/bijiapp-new/package.json /opt/bijiapp/package.json

# 3. 生成访问 Token（只落在服务器上）
openssl rand -hex 24 | sudo tee /etc/bijiapp/clip.token >/dev/null
sudo chmod 600 /etc/bijiapp/clip.token

# 4. 起服务
cd /opt/bijiapp && sudo docker compose -f deploy/compose.yml up -d --build
```

## 日常运维

```bash
cd /opt/bijiapp
sudo docker compose -f deploy/compose.yml ps          # 看状态
sudo docker compose -f deploy/compose.yml logs -f clip # 看剪藏日志
sudo docker compose -f deploy/compose.yml up -d --build # 改完代码后重建（build 不能省！）
```

> ⚠️ 只改 `src/` 里的代码时，必须带 `--build`：镜像里的代码是 build 时烤进去的，
> 不 rebuild 就会跑旧代码（踩过一次：改了监听地址但容器里还是旧的）。

## 打开公网入口（有了域名之后）

```bash
# 1. 域名 A 记录 → 服务器公网 IP
# 2. 设域名并起 Caddy（profile=public）
cd /opt/bijiapp
echo "CLIP_DOMAIN=clip.你的域名" | sudo tee -a /etc/bijiapp/caddy.env
CLIP_DOMAIN=clip.你的域名 sudo docker compose -f deploy/compose.yml --profile public up -d
# 3. 验证
curl -s https://clip.你的域名/api/health
```

Caddy 会自动申请并续期证书；`deploy/Caddyfile` 里已写好反向代理到 `clip:8787`。

## 本机怎么连（没有域名时）

```bash
# SSH 隧道：把 VPS 的 127.0.0.1:8787 映射到本机 8787
ssh -N -L 8787:127.0.0.1:8787 -p 20001 -i <私钥> ubuntu@<IP>
```

然后网页端「快速剪藏」里：服务地址填 `http://127.0.0.1:8787`，Token 填
`/etc/bijiapp/clip.token` 的内容（本机副本在 `E:\credentials\clip.token`）。

## 排错

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 容器一直 restarting，日志 `refusing unsafe path in KF_DATA_DIR` | 服务端只接受**仓库内相对路径** | `KF_DATA_DIR=data`、`KF_ASSETS_DIR=data/assets` |
| 容器 healthy 但宿主端口连不上 | 服务只听了容器内 127.0.0.1，Docker 转发打的是网卡地址 | 设 `CLIP_HOST=0.0.0.0` **并 rebuild** |
| 401 | 没带或带错 Token | 从 `/etc/bijiapp/clip.token` 取；客户端勾了「剪藏服务地址」里的 Token |
| poll 容器 unhealthy | 轮询容器不是 HTTP 服务 | compose 里已 `healthcheck.disable: true` |
