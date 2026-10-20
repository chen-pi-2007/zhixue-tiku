#!/bin/bash
# 在服务器上部署 / 更新同步服务（root 运行）：bash deploy.sh 域名
# 先把 sync_server.py 和本脚本传到 /root/zhixue-sync-upload/。不动 nginx 里已有的站点，只加一个 zhixue 站点。
set -euo pipefail
DOMAIN="${1:?用法：bash deploy.sh 域名}"
SRC=/root/zhixue-sync-upload
DIR=/opt/zhixue-sync

id zxsync >/dev/null 2>&1 || useradd --system --home-dir "$DIR" --shell /usr/sbin/nologin zxsync
mkdir -p "$DIR"
install -m 644 "$SRC/sync_server.py" "$DIR/sync_server.py"
chown -R zxsync:zxsync "$DIR"
chmod 750 "$DIR"

cat > /etc/systemd/system/zhixue-sync.service <<EOF
[Unit]
Description=zhixue-tiku sync server
After=network.target

[Service]
User=zxsync
Group=zxsync
WorkingDirectory=$DIR
Environment=ZX_SYNC_DB=$DIR/sync.db
ExecStart=/usr/bin/python3 $DIR/sync_server.py serve --port 8790 --host 127.0.0.1
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$DIR
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/nginx/sites-available/zhixue <<EOF
# 智学题库 账号同步（内测）。EdgeOne 回源到本机 80，按域名进这里，再转给只听 127.0.0.1 的同步服务。
# 网页版：js / css / 题库地址带 ?v=内容版本，同一个地址内容永远不变，EdgeOne 和浏览器都长期缓存（弱网下不用每次回源）；
# 页面、sw.js、content.json 不带 ?v=，每次都问一下有没有新的（没变只回 304）
map \$arg_v \$zx_web_cc {
    ""      "no-cache";
    default "public, max-age=31536000, immutable";
}
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    client_max_body_size 16m;

    location /v1/ {
        proxy_pass http://127.0.0.1:8790;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_read_timeout 60s;
    }
    # 网页版（web/deploy_web.sh 部署到 /opt/zhixue-web；那个脚本也会重写这个文件，两边的 nginx 配置保持一样）
    gzip on;
    gzip_types application/json application/javascript text/css image/svg+xml;
    gzip_min_length 1024;
    # 跳转只写路径（/web/），不然 nginx 会拼成 http://，经 EdgeOne 再跳一次 https
    absolute_redirect off;
    location = /web {
        return 301 /web/;
    }
    location /web/ {
        alias /opt/zhixue-web/;
        index index.html;
        location /web/media/ {
            alias /opt/zhixue-web/media/;
            add_header Cache-Control "public, max-age=604800";
        }
        add_header Cache-Control \$zx_web_cc;
    }
    location / {
        return 302 /web/;
    }
}
EOF
ln -sf /etc/nginx/sites-available/zhixue /etc/nginx/sites-enabled/zhixue

systemctl daemon-reload
systemctl enable --now zhixue-sync
systemctl restart zhixue-sync
nginx -t
systemctl reload nginx
sleep 1
curl -s -H "Host: $DOMAIN" http://127.0.0.1/v1/ping; echo
systemctl is-active zhixue-sync
