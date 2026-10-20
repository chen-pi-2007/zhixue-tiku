#!/bin/bash
# 在服务器上部署 / 更新网页版（root 运行）：bash deploy_web.sh 域名
# 先把 _build/zhixue-web.tar.gz 和本脚本传到 /root/zhixue-web-upload/。
# 网页版放在 /opt/zhixue-web/，nginx 的 zhixue 站点（同步服务那个，syncserver/deploy.sh 建的）里加 /web/。
set -euo pipefail
DOMAIN="${1:?用法：bash deploy_web.sh 域名}"
SRC=/root/zhixue-web-upload
DIR=/opt/zhixue-web

# 先解压到新文件夹再整个换上，换的那一下之前的访问还是旧版，不会读到一半新一半旧
rm -rf "$DIR.new"
mkdir -p "$DIR.new"
tar -xzf "$SRC/zhixue-web.tar.gz" -C "$DIR.new" --strip-components=1
chmod -R a+rX "$DIR.new"
rm -rf "$DIR.old"
[ -d "$DIR" ] && mv "$DIR" "$DIR.old"
mv "$DIR.new" "$DIR"
rm -rf "$DIR.old"

cat > /etc/nginx/sites-available/zhixue <<EOF
# 智学题库：账号同步（/v1/）和网页版（/web/）。EdgeOne 回源到本机 80，按域名进这里。
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

    gzip on;
    gzip_types application/json application/javascript text/css image/svg+xml;
    gzip_min_length 1024;
    # 跳转只写路径（/web/），不然 nginx 会拼成 http://，经 EdgeOne 再跳一次 https
    absolute_redirect off;

    location /v1/ {
        proxy_pass http://127.0.0.1:8790;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_read_timeout 60s;
    }
    location = /web {
        return 301 /web/;
    }
    location /web/ {
        alias $DIR/;
        index index.html;
        # 图片不会变，缓存 7 天
        location /web/media/ {
            alias $DIR/media/;
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
nginx -t
systemctl reload nginx
sleep 1
echo -n "网页版："; curl -s -o /dev/null -w "%{http_code}\n" -H "Host: $DOMAIN" http://127.0.0.1/web/
echo -n "同步服务："; curl -s -H "Host: $DOMAIN" http://127.0.0.1/v1/ping; echo
