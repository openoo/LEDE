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

# Add packages
git clone --depth=1 https://github.com/ophub/luci-app-amlogic package/amlogic
git clone --depth=1 https://github.com/eamonxg/luci-theme-aurora package/luci-theme-aurora
git clone --depth=1 https://github.com/eamonxg/luci-app-aurora-config package/luci-app-aurora-config
git clone --depth=1 --branch=master https://github.com/jerrykuku/luci-theme-argon package/luci-theme-argon
git clone --depth=1 --branch=master https://github.com/jerrykuku/luci-app-argon-config package/luci-app-argon-config

# Default IP
sed -i 's/192.168.1.1/10.10.10.1/g' package/base-files/files/bin/config_generate

#修改默认时间格式
autocore_index_files=$(find ./package/*/autocore/files/ -type f -name "index.htm" 2>/dev/null)
if [ -n "$autocore_index_files" ]; then
  sed -i 's/os.date()/os.date("%Y-%m-%d %H:%M:%S %A")/g' $autocore_index_files
fi

