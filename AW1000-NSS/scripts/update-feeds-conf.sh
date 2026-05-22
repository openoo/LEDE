#!/bin/sh
set -eu

# 运行位置：OpenWrt 源码根目录；时机：./scripts/feeds update -a 之前。

echo "==> 配置 PassWall 官方 feeds"
sed -i \
	-e '/Openwrt-Passwall\/openwrt-passwall.git/d' \
	-e '/Openwrt-Passwall\/openwrt-passwall-packages.git/d' \
	feeds.conf.default
sed -i '1isrc-git passwall_packages https://github.com/Openwrt-Passwall/openwrt-passwall-packages.git;main' feeds.conf.default
sed -i '1isrc-git passwall_luci https://github.com/Openwrt-Passwall/openwrt-passwall.git;main' feeds.conf.default

if [ -n "${NSS_PACKAGES_BRANCH:-}" ]; then
	echo "==> 固定 qosmio/nss-packages 分支：${NSS_PACKAGES_BRANCH}"
	sed -i -E "s|(src-git nss_packages https://github.com/qosmio/nss-packages.git)(;[^[:space:]]+)?|\\1;${NSS_PACKAGES_BRANCH}|" feeds.conf.default
fi

grep -n "passwall_.*Openwrt-Passwall" feeds.conf.default
grep -n "nss_packages.*qosmio/nss-packages" feeds.conf.default || true
