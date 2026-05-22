#!/bin/sh
set -eu

# 运行位置：OpenWrt 源码根目录；时机：make defconfig 之后。

for config_symbol in \
	CONFIG_PACKAGE_smartdns=y \
	CONFIG_PACKAGE_smartdns-ui=y \
	CONFIG_PACKAGE_luci-app-smartdns=y
do
	if ! grep -qxF "$config_symbol" .config; then
		echo "defconfig 后缺少配置：$config_symbol" >&2
		exit 1
	fi
done

grep -E 'CONFIG_PACKAGE_(smartdns|smartdns-ui|luci-app-smartdns)=' .config
