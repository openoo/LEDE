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
git clone --depth=1 https://github.com/eamonxg/luci-theme-aurora package/luci-theme-aurora
git clone --depth=1 https://github.com/eamonxg/luci-app-aurora-config package/luci-app-aurora-config

# K3 屏幕插件和驱动：参考 rmoyulong/Lite_OpenWrt 的 lede_k3.sh。
rm -rf package/lean/luci-app-k3screenctrl package/lean/k3screenctrl
git clone --depth=1 https://github.com/li1507/luci-app-k3screenctrl.git package/lean/luci-app-k3screenctrl
git clone --depth=1 https://github.com/li1507/k3screenctrl_build.git package/lean/k3screenctrl

# K3 无线固件：使用社区常用 69027 版，覆盖 Lean 自带固件包里的文件。
firmware="69027"
k3_firmware_url="https://github.com/li1507/Phicomm-k3-Wireless-Firmware/raw/master/brcmfmac4366c-pcie.bin.${firmware}"
k3_firmware_dir="package/lean/k3-brcmfmac4366c-firmware/files/lib/firmware/brcm"
mkdir -p "$k3_firmware_dir"
cat > package/lean/k3-brcmfmac4366c-firmware/Makefile <<'EOF'
include $(TOPDIR)/rules.mk

PKG_NAME:=k3-brcmfmac4366c-firmware
PKG_VERSION:=69027
PKG_RELEASE:=1

include $(INCLUDE_DIR)/package.mk

define Package/k3-brcmfmac4366c-firmware
  SECTION:=firmware
  CATEGORY:=Firmware
  TITLE:=PHICOMM K3 BCM4366C firmware
  DEPENDS:=@TARGET_bcm53xx
endef

define Build/Compile
endef

define Package/k3-brcmfmac4366c-firmware/install
	$(INSTALL_DIR) $(1)/lib/firmware/brcm
	$(INSTALL_DATA) ./files/lib/firmware/brcm/brcmfmac4366c-pcie.bin $(1)/lib/firmware/brcm/brcmfmac4366c-pcie.bin
endef

$(eval $(call BuildPackage,k3-brcmfmac4366c-firmware))
EOF
wget -nv "$k3_firmware_url" -O "$k3_firmware_dir/brcmfmac4366c-pcie.bin"

# Default IP
sed -i 's/192.168.1.1/10.10.10.1/g' package/base-files/files/bin/config_generate

# usbmuxd开机启动->ios设备通信
sed -i '/exit 0/i usbmuxd' package/base-files/files/etc/rc.local

#修改默认时间格式
autocore_index_files=$(find ./package/*/autocore/files/ -type f -name "index.htm" 2>/dev/null)
if [ -n "$autocore_index_files" ]; then
  sed -i 's/os.date()/os.date("%Y-%m-%d %H:%M:%S %A")/g' $autocore_index_files
fi
