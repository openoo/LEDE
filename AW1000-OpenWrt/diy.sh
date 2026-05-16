#!/bin/bash
# 使用新版 Go 工具链，减少 PassWall 和现代插件编译失败概率。
rm -rf feeds/packages/lang/golang
git clone --depth=1 --branch=26.x https://github.com/sbwml/packages_lang_golang feeds/packages/lang/golang

# 新版 PassWall 按官方推荐方式引入，先清掉 feeds 里容易冲突的旧核心包。
rm -rf feeds/packages/net/{xray-core,v2ray-geodata,sing-box,chinadns-ng,dns2socks,hysteria,ipt2socks,microsocks,naiveproxy,shadowsocks-libev,shadowsocks-rust,shadowsocksr-libev,simple-obfs,tcping,trojan-plus,tuic-client,v2ray-plugin,xray-plugin,geoview,shadow-tls}
rm -rf feeds/luci/applications/luci-app-passwall
rm -rf package/passwall-packages package/passwall-luci
git clone --depth=1 https://github.com/Openwrt-Passwall/openwrt-passwall-packages package/passwall-packages
git clone --depth=1 https://github.com/Openwrt-Passwall/openwrt-passwall package/passwall-luci

# 清除 feeds 中自带的 Argon，避免和 jerrykuku 的 master 版本冲突。
rm -rf feeds/luci/themes/luci-theme-argon feeds/luci/applications/luci-app-argon-config
git clone --depth=1 --branch=master https://github.com/jerrykuku/luci-theme-argon package/luci-theme-argon
git clone --depth=1 --branch=master https://github.com/jerrykuku/luci-app-argon-config package/luci-app-argon-config

# 独立引入需要的蜂窝网络、状态页和管理插件，不再使用 noobwrt-custom-feeds。
rm -rf package/custom-feeds
mkdir -p package/custom-feeds
git clone --depth=1 https://github.com/obsy/modemdata package/custom-feeds/obsy-modemdata
git clone --depth=1 https://github.com/FUjr/QModem package/custom-feeds/qmodem
sed -i 's/default PACKAGE_luci-app-qmodem_INCLUDE_vendor-qmi-wwan/default PACKAGE_luci-app-qmodem_INCLUDE_generic-qmi-wwan/' package/custom-feeds/qmodem/luci/luci-app-qmodem/Makefile
git clone --depth=1 https://github.com/4IceG/luci-app-modemband package/custom-feeds/luci-app-modemband
git clone --depth=1 https://github.com/4IceG/luci-app-atinout package/custom-feeds/luci-app-atinout
git clone --depth=1 https://github.com/nooblk-98/luci-app-3ginfo-lite package/custom-feeds/luci-app-3ginfo-lite
git clone --depth=1 https://github.com/nooblk-98/luci-app-aw1k-led package/custom-feeds/luci-app-aw1k-led
git clone --depth=1 https://github.com/4IceG/luci-app-sms-tool-js package/custom-feeds/luci-app-sms-tool-js
git clone --depth=1 https://github.com/timsaya/openwrt-bandix package/custom-feeds/openwrt-bandix
git clone --depth=1 https://github.com/timsaya/luci-app-bandix package/custom-feeds/luci-app-bandix
git clone --depth=1 https://github.com/sbwml/autocore-arm package/custom-feeds/autocore-arm
git clone --depth=1 https://github.com/derisamedia/luci-app-arwi-dashboard package/custom-feeds/luci-app-arwi-dashboard
git clone --depth=1 https://github.com/sbwml/luci-app-ramfree.git package/custom-feeds/luci-app-ramfree
git clone --depth=1 https://github.com/4IceG/luci-app-modemdata package/custom-feeds/luci-app-modemdata
git clone --depth=1 https://github.com/destan19/OpenAppFilter package/custom-feeds/OpenAppFilter

# 使用 OpenWrt 标准 sms-tool 包，但跟进 obsy/sms_tool 的最新源码。
sms_tool_makefile="feeds/packages/utils/sms-tool/Makefile"
if [ -f "$sms_tool_makefile" ]; then
  sed -i 's/^PKG_SOURCE_DATE:=.*/PKG_SOURCE_DATE:=2026-05-16/' "$sms_tool_makefile"
  sed -i 's/^PKG_SOURCE_VERSION:=.*/PKG_SOURCE_VERSION:=94899dc987d3a63bd04f8b8e25f6296381d76790/' "$sms_tool_makefile"
  sed -i 's/^PKG_MIRROR_HASH:=.*/PKG_MIRROR_HASH:=skip/' "$sms_tool_makefile"
fi

# Default IP
sed -i 's/192.168.1.1/10.10.10.1/g' package/base-files/files/bin/config_generate

# AW1000 默认无线区域和系统日志级别。
mkdir -p files/etc/uci-defaults
cat > files/etc/uci-defaults/99-aw1000-defaults << 'EOF'
#!/bin/sh

uci -q set wireless.radio0.country='US'
uci -q set wireless.radio1.country='US'
uci -q set wireless.radio2.country='US'
uci -q set wireless.radio1.disabled='0'
uci -q set wireless.radio2.disabled='0'
uci -q set firewall.@defaults[0].flow_offloading='1'
uci -q set system.@system[0].cronloglevel='7'
uci commit wireless
uci commit firewall
uci commit system

exit 0
EOF

# 修改默认时间格式
autocore_index_files=$(find ./package/*/autocore/files/ -type f -name "index.htm" 2>/dev/null)
if [ -n "$autocore_index_files" ]; then
  sed -i 's/os.date()/os.date("%Y-%m-%d %H:%M:%S %A")/g' $autocore_index_files
fi
