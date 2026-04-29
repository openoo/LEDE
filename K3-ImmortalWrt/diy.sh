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

# Add packages
mkdir -p package/lean
git clone --depth=1 https://github.com/eamonxg/luci-theme-aurora package/luci-theme-aurora
git clone --depth=1 https://github.com/eamonxg/luci-app-aurora-config package/luci-app-aurora-config

# K3 屏幕插件和驱动：参考 rmoyulong/Lite_OpenWrt 的 immortalwrt_k3.sh。
rm -rf package/lean/luci-app-k3screenctrl package/lean/k3screenctrl
git clone --depth=1 https://github.com/li1507/luci-app-k3screenctrl.git package/lean/luci-app-k3screenctrl
git clone --depth=1 https://github.com/li1507/k3screenctrl_build.git package/lean/k3screenctrl
# 禁用屏幕自动休眠。当前 K3 屏幕程序在 ImmortalWrt 24.10 下休眠后可能无法唤醒。
sed -i "s/option screen_time '30'/option screen_time '0'/g" package/lean/k3screenctrl/files/k3screenctrl
sed -i 's/\[ $m -lt 10 \] && m=10/[ "$m" != "0" ] \&\& [ "$m" -lt 10 ] \&\& m=10/g' package/lean/k3screenctrl/files/k3screenctrl.init
mkdir -p package/lean/k3screenctrl/patches
printf '%s\n' \
  '--- a/lib/k3screenctrl/port.sh' \
  '+++ b/lib/k3screenctrl/port.sh' \
  '@@ -2,9 +2,40 @@' \
  ' ' \
  ' print_eth_port_status() {' \
  '     local port=$1' \
  '+    local ifname' \
  ' ' \
  '-    # One `swconfig dev switch0 show` wastes more time than 4 `port show`' \
  '-    if [ -n "`swconfig dev switch0 port $port show | grep \"link:up\"`" ]; then' \
  '+    if command -v swconfig >/dev/null 2>&1 && swconfig dev switch0 show >/dev/null 2>&1; then' \
  '+        # One `swconfig dev switch0 show` wastes more time than 4 `port show`' \
  '+        if [ -n "`swconfig dev switch0 port $port show | grep \"link:up\"`" ]; then' \
  '+            echo 1' \
  '+        else' \
  '+            echo 0' \
  '+        fi' \
  '+        return' \
  '+    fi' \
  '+' \
  '+    # ImmortalWrt 24.10 uses DSA on K3. Physical ports are exposed as' \
  '+    # lan1/lan2/lan3/wan instead of legacy switch0 ports.' \
  '+    case "$port" in' \
  '+        1)' \
  '+            ifname="lan1"' \
  '+            ;;' \
  '+        0)' \
  '+            ifname="lan2"' \
  '+            ;;' \
  '+        2)' \
  '+            ifname="lan3"' \
  '+            ;;' \
  '+        3)' \
  '+            ifname="wan"' \
  '+            ;;' \
  '+        *)' \
  '+            ifname=""' \
  '+            ;;' \
  '+    esac' \
  '+' \
  '+    if [ -n "$ifname" ] && [ -r "/sys/class/net/$ifname/carrier" ] && \' \
  '+        [ "$(cat /sys/class/net/$ifname/carrier 2>/dev/null)" = "1" ]; then' \
  '         echo 1' \
  '     else' \
  '         echo 0' \
  '     fi' \
  ' }' > package/lean/k3screenctrl/patches/010-support-dsa-port-status.patch

# 可选 K3 原厂 WiFi 固件：效果较好，但该固件不能设置 WiFi 密码。
if [ "$K3_FACTORY_WIFI" = "true" ]; then
  if [ -d "package/firmware/brcmfmac4366c0-firmware-k3/files" ]; then
    k3_firmware_file="package/firmware/brcmfmac4366c0-firmware-k3/files/brcmfmac4366c-pcie.bin"
  elif [ -d "package/lean/k3-firmware/files" ]; then
    k3_firmware_file="package/lean/k3-firmware/files/brcmfmac4366c-pcie.bin"
  elif [ -d "package/lean/k3-brcmfmac4366c-firmware/files/lib/firmware/brcm" ]; then
    k3_firmware_file="package/lean/k3-brcmfmac4366c-firmware/files/lib/firmware/brcm/brcmfmac4366c-pcie.bin"
  else
    echo "K3 firmware package directory not found"
    exit 1
  fi
  wget -nv "https://raw.githubusercontent.com/yangxu52/Phicomm-k3-Wireless-Firmware/master/brcmfmac4366c-pcie.bin.k3" \
    -O "$k3_firmware_file"
fi

# Default IP
sed -i 's/192.168.1.1/10.10.10.1/g' package/base-files/files/bin/config_generate

# usbmuxd开机启动->ios设备通信
sed -i '/exit 0/i usbmuxd' package/base-files/files/etc/rc.local

#修改默认时间格式
autocore_index_files=$(find ./package/*/autocore/files/ -type f -name "index.htm" 2>/dev/null)
if [ -n "$autocore_index_files" ]; then
  sed -i 's/os.date()/os.date("%Y-%m-%d %H:%M:%S %A")/g' $autocore_index_files
fi
