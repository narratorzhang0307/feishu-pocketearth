#!/usr/bin/env bash
# 在线部署：本机构建 → 推送 Pocket Earth Qwen 决赛版 → pm2 原子重启。
# 只更新决赛站点 `pocketearth`，不触碰服务器上的其他 Pocket Earth 历史进程。
#
# 用法：
#   PEM=/path/to/key.pem REMOTE=root@<server-ip> ./deploy/online/deploy.sh
# 可选：
#   APP_DIR（远程目录，默认 ~/pocketearth）  APP_NAME（pm2 名，默认 pocketearth）
set -euo pipefail

PEM="${PEM:?请设置 PEM=部署私钥路径}"
REMOTE="${REMOTE:?请设置 REMOTE=root@服务器IP}"
APP_DIR="${APP_DIR:-~/pocketearth}"
APP_NAME="${APP_NAME:-pocketearth}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SSH=(ssh -i "$PEM" -o StrictHostKeyChecking=no)

chmod 600 "$PEM"
cd "$ROOT"

echo "==> 本机构建 dist ..."
npm run build:release

echo "==> 推送 dist + Qwen 服务端到 $REMOTE:$APP_DIR ..."
"${SSH[@]}" "$REMOTE" "mkdir -p $APP_DIR/dist $APP_DIR/server $APP_DIR/knowledge"
# 两阶段推送，且不删旧资源（修「部署即白屏」）：
#   ① 先推 assets——新旧 hash 的 chunk 并存，挂着不刷新的旧壳照样能取到自己的 chunk；
#   ② 再推 index.html/sw.js 等——切换瞬间新壳的资源已全部就位，没有 404 窗口。
# 旧 chunk 常年累积体积很小；真要清理，手动删 30 天前的 assets 即可。
rsync -az -e "ssh -i $PEM -o StrictHostKeyChecking=no" \
  dist/assets "$REMOTE:$APP_DIR/dist/"
rsync -az -e "ssh -i $PEM -o StrictHostKeyChecking=no" \
  dist server.mjs server "$REMOTE:$APP_DIR/"
rsync -az -e "ssh -i $PEM -o StrictHostKeyChecking=no" \
  knowledge/travel-place-sources.mjs "$REMOTE:$APP_DIR/knowledge/"

echo "==> 远程提示 .env（首次需手动创建；只使用 DASHSCOPE_API_KEY）"
"${SSH[@]}" "$REMOTE" "[ -f $APP_DIR/.env ] && echo '已存在 .env' || echo '⚠️  $APP_DIR/.env 不存在，请先创建（见 deploy/online/README.md）'"

echo "==> pm2 拉起/重启 ..."
"${SSH[@]}" "$REMOTE" "cd $APP_DIR && (pm2 restart $APP_NAME --update-env || pm2 start server.mjs --name $APP_NAME) && (pm2 delete ${APP_NAME}-knowledge >/dev/null 2>&1 || true) && pm2 save"

echo "==> 远程自测："
"${SSH[@]}" "$REMOTE" "sleep 1; curl -s http://127.0.0.1:\$(grep -E '^API_PORT=' $APP_DIR/.env | cut -d= -f2)/healthz || true"
echo ""
echo "部署完成。若已配好 nginx + 证书，访问你的域名即可。"
