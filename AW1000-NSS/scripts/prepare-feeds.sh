#!/bin/sh
set -eu

# 运行位置：OpenWrt 源码根目录；时机：./scripts/feeds update -a 之后、install -a 之前。

echo "==> 替换 Go 工具链"
rm -rf feeds/packages/lang/golang
git clone --depth=1 --branch=26.x https://github.com/sbwml/packages_lang_golang feeds/packages/lang/golang

echo "==> 固定 sms-tool 源码版本"
sms_tool_makefile="feeds/packages/utils/sms-tool/Makefile"
if [ -f "$sms_tool_makefile" ]; then
	sed -i 's/^PKG_SOURCE_DATE:=.*/PKG_SOURCE_DATE:=2026-05-16/' "$sms_tool_makefile"
	sed -i 's/^PKG_SOURCE_VERSION:=.*/PKG_SOURCE_VERSION:=94899dc987d3a63bd04f8b8e25f6296381d76790/' "$sms_tool_makefile"
	sed -i 's/^PKG_MIRROR_HASH:=.*/PKG_MIRROR_HASH:=skip/' "$sms_tool_makefile"
fi

echo "==> 清理默认 feed 中会被自定义仓库替换的源码"
rm -rf \
	feeds/luci/themes/luci-theme-argon \
	feeds/luci/applications/luci-app-argon-config \
	feeds/luci/applications/luci-app-passwall \
	feeds/luci/applications/luci-app-quickfile \
	feeds/packages/net/quickfile \
	feeds/packages/utils/quickfile
