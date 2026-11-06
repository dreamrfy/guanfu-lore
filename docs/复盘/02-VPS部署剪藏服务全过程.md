# 复盘：VPS 从零部署剪藏服务全过程（用户亲手操作实录）

> 时间：2026-11-06｜特点：**用户逐步亲手操作 + AI 逐词教学**，所有报错都是真实踩出来的。服务器：腾讯云轻量 4核4G（109 元/年，上海，Ubuntu 24.04）。

## 0. 为什么选 VPS（决策回顾）

CloudBase 免费版 3 秒墙实测零入库后重新决策。对比了 CloudBase 个人版（240/年）、境内轻量 VPS（99~199/年）、RackNerd 境外机（~130/年）、家里旧电脑（0 元但 3 天窗口致命）。**选境内轻量**：一半价钱 + 顺带学 Docker/Linux + 代码零重写。配置选 **2核4G** 而非 2核2G：剪藏 80M + Halo 700M + ZCode Agent 0.6~1.2G 三租户同住，2G 会爆。

## 1. 机器规格核对（买前买后都量一遍）

- 实际到手：4 核 / 3.6G 内存 / 40G 盘（32G 可用）/ Ubuntu 24.04.4；
- 腾讯云镜像自带：**1.9G swap**（省一步）、**Docker 已预装**（省一步）、腾讯监控四件套（barad/sgagent/YunJing/tat 共 ~150MB——**决定不卸**：换控制台监控图+基础入侵防护，性价比合适）。

## 2. SSH 加固实录（用户亲手，含真实报错）

标准流程：**生成密钥对 → 传公钥 → 验证密钥登录 → 改端口 → 禁密码 → 关旧端口**。顺序错了会把自己锁外面。

### 用户真实踩的坑（每个都是教学点）

| 坑 | 现象 | 教训 |
| --- | --- | --- |
| 在服务器上生成了密钥 | `ssh-keygen` 敲在 `ubuntu@` 提示符下 | **私钥的家在自己电脑**；服务器上生成的是"反向钥匙"，白干 |
| CMD 里用 `~` | `Saving key failed: No such file or directory` | `~` 是 bash 语法，CMD 不展开 → **Linux 命令统一去 Git Bash 跑** |
| 命令开头多打 `~` | `bash: ~ssh: command not found` | 手滑多字符；↑ 上箭头调历史命令改 |
| 改了端口连不上 | `Connection refused` | **防火墙放行要先行**，且服务器侧还没改配置时新端口必然 refused |
| 改了配置端口还是不通 | （AI 诊断）`ss -tlnp` 显示 SSH 仍只听 22 | **Ubuntu 24.04 的 `ssh.socket` 机制绕过了 sshd_config**！解法：`systemctl disable --now ssh.socket` → `restart ssh` → `enable ssh`。新版系统的坑，老教程全没有 |

### 最终形态

- 端口 **20001**（原则：躲开知名端口 1-1023、烂大街的 2222/8080、未来自用的 8000-11000；选 5 位数+自己好记；**端口只降噪，安全靠密钥**）；
- **仅密钥登录**（`PasswordAuthentication no`），密码永久失效；
- 旧 22 端口服务器+防火墙**双侧关闭**；
- **重启验证**：`sudo reboot` 后 SSH 自动恢复——服务器重启是常态，入口自愈能力必须提前验证。

### systemd 定时任务（比 cron 现代的方案）

成对文件：`bijiapp-poll.service`（Type=oneshot，干活的）+ `bijiapp-poll.timer`（OnCalendar 每 5 分 + **Persistent=true 错过补跑**）。启用三连：`daemon-reload` → `enable --now timer` → `list-timers` 验证。

## 3. 剪藏服务部署实录

- **目录哲学**：程序 `/opt/bijiapp`（自己装的大型软件惯例位）、凭证 `/etc/bijiapp`（配置的家，**chmod 600**）、与程序目录分离——误打包程序目录也漏不了秘密；
- **上传**：`scp -P 20001 -i 私钥 -r src package.json`（⚠️ scp 端口是大写 -P，ssh 是小写 -p，历史不一致）；Git Bash 里 Windows 路径写 `/e/...`；
- **凭证注入**：systemd `Environment=KF_SECRETS_FILE=...` + `EnvironmentFile=/etc/bijiapp/r2.env`（R2 四项）；
- **入口适配**：云函数版 main() 是"等人调用"的，VPS 直跑没有调用者 → 新增 `src/cloud/vpsPoll.ts`（直接运行入口，调 main 输出 JSON 统计；云函数走垫片不受影响）。**教训：改源码要走本机改→测试→scp 上传的正路，别在服务器上 sed 拼**（AI 被安全钩子拦了 4 次，最终回到正路）。

## 4. 端到端验收（systemd 真实输出）

```
22 条消息 → 19 解析 → 1 幂等跳过 → 18 入库
complete 7 / partial 8 / failed 3（3 失败=平台风控与消息老化，正常损耗）
图片 58/58 全部成功进 R2
耗时 128 秒，游标推进，"拉取完成"
```

对比：CloudBase 同批消息 **0 篇入库**。**这是路线选择的最终判决数据。**

## 5. 全套年成本

| 项 | 费用 |
| --- | --- |
| VPS 4核4G（首年促销） | 109 元 |
| COS 50GB 备份包（异地备份仓） | 1 元 |
| R2 存储+流量 | 0 元（占用 <0.1%） |
| **合计** | **110 元/年** |

## 6. 日常运维速查（给未来的自己）

```bash
ssh -p 20001 -i ~/.ssh/vps_bijiapp ubuntu@<IP>     # 连服务器
systemctl status bijiapp-poll                       # 看服务状态
sudo journalctl -u bijiapp-poll -n 20 -o cat        # 看最近日志
sudo systemctl start bijiapp-poll.service           # 手动触发一轮
sudo reboot                                         # 重启（SSH 会自愈）
```
凭证轮换：改 `E:\credentials\` 对应文件 + VPS `/etc/bijiapp/` 对应文件，下一轮自动生效。
