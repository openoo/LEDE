#!/bin/sh
set -eu

# 运行位置：OpenWrt 源码根目录；时机：./scripts/feeds update -a 之后、install -a 之前。

echo "==> 替换 Go 工具链"
rm -rf feeds/packages/lang/golang
git clone --depth=1 --branch=26.x https://github.com/sbwml/packages_lang_golang feeds/packages/lang/golang

if [ "${USE_PYMUMU_SMARTDNS:-0}" = "1" ]; then
	echo "==> 使用 pymumu SmartDNS 官方 OpenWrt 包和 LuCI 页面"
	rm -rf \
		feeds/packages/net/smartdns \
		feeds/packages/utils/smartdns \
		feeds/luci/applications/luci-app-smartdns
	git clone --depth=1 https://github.com/pymumu/openwrt-smartdns feeds/packages/net/smartdns
	git clone --depth=1 --branch=master https://github.com/pymumu/luci-app-smartdns feeds/luci/applications/luci-app-smartdns
	# openwrt-smartdns passes TARGET_CC into a shell environment assignment.
	# With ccache enabled, TARGET_CC contains a space ("ccache <triplet>-gcc");
	# without quotes the shell runs the cross compiler directly and ld tries to
	# read plugin/smartdns-ui as an input directory.
	sed -i 's/CC=$(TARGET_CC)[[:space:]]*\\/CC="$(TARGET_CC)" \\/' feeds/packages/net/smartdns/Makefile
fi

echo "==> 更新 sms-tool 到 obsy/sms_tool 最新源码版本"
sms_tool_makefile="feeds/packages/utils/sms-tool/Makefile"
if [ -f "$sms_tool_makefile" ]; then
	sms_tool_tmp="$(mktemp -d)"
	git clone --depth=1 https://github.com/obsy/sms_tool "$sms_tool_tmp"
	sms_tool_date="$(git -C "$sms_tool_tmp" log -1 --format=%cs)"
	sms_tool_version="$(git -C "$sms_tool_tmp" rev-parse HEAD)"
	rm -rf "$sms_tool_tmp"

	sed -i "s/^PKG_SOURCE_DATE:=.*/PKG_SOURCE_DATE:=$sms_tool_date/" "$sms_tool_makefile"
	sed -i "s/^PKG_SOURCE_VERSION:=.*/PKG_SOURCE_VERSION:=$sms_tool_version/" "$sms_tool_makefile"
	sed -i 's/^PKG_MIRROR_HASH:=.*/PKG_MIRROR_HASH:=skip/' "$sms_tool_makefile"

	echo "==> sms-tool 已更新"
	echo "    PKG_SOURCE_DATE: $sms_tool_date"
	echo "    PKG_SOURCE_VERSION: $sms_tool_version"
else
	echo "==> 未找到 $sms_tool_makefile，跳过 sms-tool 更新"
fi

echo "==> 清理默认 feed 中会被自定义仓库替换的源码"
rm -rf \
	feeds/luci/themes/luci-theme-argon \
	feeds/luci/applications/luci-app-argon-config \
	feeds/luci/applications/luci-app-passwall \
	feeds/luci/applications/luci-app-quickfile \
	feeds/packages/net/quickfile \
	feeds/packages/utils/quickfile
