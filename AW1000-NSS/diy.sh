#!/bin/bash
# 清除 feeds 中自带的 Argon，避免和 jerrykuku 的 master 版本冲突。
rm -rf package/feeds/luci/luci-theme-argon package/feeds/luci/luci-app-argon-config
git clone --depth=1 --branch=master https://github.com/jerrykuku/luci-theme-argon package/luci-theme-argon
git clone --depth=1 --branch=master https://github.com/jerrykuku/luci-app-argon-config package/luci-app-argon-config
git clone --depth=1 https://github.com/eamonxg/luci-theme-aurora package/luci-theme-aurora
git clone --depth=1 https://github.com/eamonxg/luci-app-aurora-config package/luci-app-aurora-config

# 独立引入需要的蜂窝网络、状态页和管理插件，不再使用 noobwrt-custom-feeds。
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
git clone --depth=1 https://github.com/sbwml/luci-app-ramfree.git package/custom-feeds/luci-app-ramfree
git clone --depth=1 https://github.com/4IceG/luci-app-modemdata package/custom-feeds/luci-app-modemdata
git clone --depth=1 https://github.com/destan19/OpenAppFilter package/custom-feeds/OpenAppFilter

# 默认后台地址
sed -i 's/192.168.1.1/192.168.123.1/g' package/base-files/files/bin/config_generate

# NSS 默认走 ECM/NSS 路径，关闭 firewall4 自带 flow offloading。
# 5G 模组由 QModem 自动创建蜂窝接口，编译时不预置 qosmio 示例接口。
mkdir -p files/etc/uci-defaults
cat > files/etc/uci-defaults/99-aw1000-nss-defaults << 'EOF'
#!/bin/sh

uci -q set pbuf.opt.memory_profile='auto'
uci -q set network.globals.packet_steering='0'
uci -q set firewall.@defaults[0].flow_offloading='0'
uci -q set firewall.@defaults[0].flow_offloading_hw='0'

for dev in $(uci -q show network | sed -n "s/^\(network\.[^.]*\)\.vlan_filtering='1'$/\1/p"); do
	uci -q delete "${dev}.vlan_filtering"
done

uci commit pbuf
uci commit network
uci commit firewall

exit 0
EOF

# 修改默认时间格式
autocore_index_files=$(find ./package/*/autocore/files/ -type f -name "index.htm" 2>/dev/null)
if [ -n "$autocore_index_files" ]; then
  sed -i 's/os.date()/os.date("%Y-%m-%d %H:%M:%S %A")/g' $autocore_index_files
fi
