#!/bin/bash
set -euo pipefail

# 运行位置：OpenWrt 源码根目录；时机：feeds install -a 之后。
# 本脚本只处理本项目自定义包和轻量源码修补，不再生成固件内置文件。

echo "==> 清理 package/feeds 中会被自定义包替换的链接"
rm -rf \
	package/feeds/luci/luci-app-3ginfo-lite \
	package/feeds/luci/luci-app-atinout \
	package/feeds/luci/luci-app-aw1k-led \
	package/feeds/luci/luci-app-bandix \
	package/feeds/luci/luci-app-modemband \
	package/feeds/luci/luci-app-modemdata \
	package/feeds/luci/luci-app-passwall \
	package/feeds/luci/luci-app-qfirehose \
	package/feeds/luci/luci-app-qmodem \
	package/feeds/luci/luci-app-qmodem-hc \
	package/feeds/luci/luci-app-qmodem-monitor \
	package/feeds/luci/luci-app-qmodem-mwan \
	package/feeds/luci/luci-app-qmodem-next \
	package/feeds/luci/luci-app-qmodem-sms \
	package/feeds/luci/luci-app-qmodem-ttl \
	package/feeds/luci/luci-app-qmodem-ttlfw4 \
	package/feeds/luci/luci-app-quickfile \
	package/feeds/luci/luci-app-sms-tool-js \
	package/feeds/packages/atinout \
	package/feeds/packages/modemband \
	package/feeds/packages/modemdata \
	package/feeds/packages/openwrt-bandix \
	package/feeds/packages/qfirehose \
	package/feeds/packages/quickfile \
	package/feeds/packages/qmodem \
	package/feeds/packages/sms_forwarder \
	package/feeds/packages/sms_forwarder_next

echo "==> 引入自定义主题"
rm -rf \
	package/luci-theme-argon \
	package/luci-app-argon-config \
	package/luci-theme-aurora \
	package/luci-app-aurora-config
git clone --depth=1 --branch=master https://github.com/jerrykuku/luci-theme-argon package/luci-theme-argon
git clone --depth=1 --branch=master https://github.com/jerrykuku/luci-app-argon-config package/luci-app-argon-config
git clone --depth=1 https://github.com/eamonxg/luci-theme-aurora package/luci-theme-aurora
git clone --depth=1 https://github.com/eamonxg/luci-app-aurora-config package/luci-app-aurora-config

echo "==> 引入 AW1000、蜂窝网络、状态页和管理插件"
rm -rf package/custom-feeds
mkdir -p package/custom-feeds
git clone --depth=1 https://github.com/obsy/modemdata package/custom-feeds/obsy-modemdata
git clone --depth=1 https://github.com/obsy/modemband package/custom-feeds/obsy-modemband
git clone --depth=1 https://github.com/FUjr/QModem package/custom-feeds/qmodem
git clone --depth=1 https://github.com/4IceG/luci-app-modemband package/custom-feeds/luci-app-modemband
git clone --depth=1 https://github.com/4IceG/luci-app-atinout package/custom-feeds/luci-app-atinout
git clone --depth=1 https://github.com/nooblk-98/luci-app-3ginfo-lite package/custom-feeds/luci-app-3ginfo-lite
git clone --depth=1 https://github.com/nooblk-98/luci-app-aw1k-led package/custom-feeds/luci-app-aw1k-led
git clone --depth=1 https://github.com/4IceG/luci-app-sms-tool-js package/custom-feeds/luci-app-sms-tool-js
git clone --depth=1 https://github.com/4IceG/luci-app-qfirehose.git package/custom-feeds/luci-app-qfirehose
git clone --depth=1 https://github.com/timsaya/openwrt-bandix package/custom-feeds/openwrt-bandix
git clone --depth=1 https://github.com/timsaya/luci-app-bandix package/custom-feeds/luci-app-bandix
git clone --depth=1 https://github.com/sbwml/autocore-arm package/custom-feeds/autocore-arm
git clone --depth=1 https://github.com/derisamedia/luci-app-arwi-dashboard package/custom-feeds/luci-app-arwi-dashboard
git clone --depth=1 https://github.com/4IceG/luci-app-modemdata package/custom-feeds/luci-app-modemdata
git clone --depth=1 https://github.com/sbwml/luci-app-quickfile package/custom-feeds/luci-app-quickfile

echo "==> 设置默认后台地址"
sed -i 's/192.168.1.1/192.168.123.1/g' package/base-files/files/bin/config_generate

echo "==> 修正 autocore 默认时间格式"
autocore_index_files=$(find ./package/*/autocore/files/ -type f -name "index.htm" 2>/dev/null || true)
if [ -n "$autocore_index_files" ]; then
	sed -i 's/os.date()/os.date("%Y-%m-%d %H:%M:%S %A")/g' $autocore_index_files
fi
