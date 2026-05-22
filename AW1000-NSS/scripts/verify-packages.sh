#!/bin/sh
set -eu

# 运行位置：OpenWrt 源码根目录；用于尽早发现关键包被默认 feed 或 diy.sh 误删。

for package_path in \
	package/feeds/packages/smartdns \
	package/feeds/luci/luci-app-smartdns
do
	if [ ! -e "$package_path" ]; then
		echo "缺少关键包：$package_path" >&2
		exit 1
	fi
done

echo "SmartDNS 包链接检查通过"
