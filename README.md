# N1 LEDE / K3 ImmortalWrt / AW1000 NSS

斐讯 N1、斐讯 K3 和 Arcadyan AW1000 的自用 OpenWrt 构建配置。N1 保留 LEDE 线，K3 已切换到 ImmortalWrt 24.10 线，AW1000 使用 AgustinLorenzo main_nss 线。

## 基本信息

- 默认管理地址：`10.10.10.1`
- 默认账号：`root`
- 默认密码：`password`
- N1 Workflow：[build-n1-openwrt.yml](.github/workflows/build-n1-openwrt.yml)
- K3 Workflow：[build-k3-immortalwrt.yml](.github/workflows/build-k3-immortalwrt.yml)
- AW1000 Workflow：[build-aw1000-nss.yml](.github/workflows/build-aw1000-nss.yml)

## 源码和内核

N1：

- OpenWrt 源码：[coolsnowwolf/lede](https://github.com/coolsnowwolf/lede) `master`
- LuCI feed：构建时调整到 [coolsnowwolf/luci](https://github.com/coolsnowwolf/luci) `openwrt-25.12`
- 固件打包：[unifreq/openwrt_packit](https://github.com/unifreq/openwrt_packit)
- 设备 SOC：`s905d`
- 内核版本：`5.15.196`
- N1 内核来源：[breakingbadboy/OpenWrt kernel_stable](https://github.com/breakingbadboy/OpenWrt/releases/tag/kernel_stable)

K3：

- OpenWrt 源码：[immortalwrt/immortalwrt](https://github.com/immortalwrt/immortalwrt) `openwrt-24.10`
- 目标平台：`bcm53xx/generic`
- 固件格式：K3 原生 `trx`
- 内核版本：ImmortalWrt 24.10 bcm53xx 默认 6.6 系列
- K3 WiFi 普通版使用 ImmortalWrt 自带 `brcmfmac-firmware-4366c0-pcie-k3`
- K3 原厂 WiFi 版使用 [yangxu52/Phicomm-k3-Wireless-Firmware](https://github.com/yangxu52/Phicomm-k3-Wireless-Firmware) 的 `brcmfmac4366c-pcie.bin.k3`

AW1000：

- OpenWrt 源码：[AgustinLorenzo/openwrt](https://github.com/AgustinLorenzo/openwrt) `main_nss`
- 目标平台：`qualcommax/ipq807x`
- 设备：`arcadyan_aw1000`
- NSS/WiFi：启用 QCA NSS、ECM、ath11k NSS WiFi
- AW1000 额外插件：不再使用整包 noobwrt feed，改为按需拉取独立仓库
- QModem：直接使用 [FUjr/QModem](https://github.com/FUjr/QModem)

## N1 diy.sh

[N1-LEDE/diy.sh](N1-LEDE/diy.sh) 在 LEDE 源码拉取后执行，主要做这些事：

- 替换 Go 工具链为 [sbwml/packages_lang_golang](https://github.com/sbwml/packages_lang_golang) `26.x`，降低 PassWall 和现代 Go 插件编译失败概率
- 移除 feeds 中容易和新版 PassWall 冲突的旧核心包
- 引入新版 PassWall：
  - [Openwrt-Passwall/openwrt-passwall-packages](https://github.com/Openwrt-Passwall/openwrt-passwall-packages)
  - [Openwrt-Passwall/openwrt-passwall](https://github.com/Openwrt-Passwall/openwrt-passwall)
- 引入晶晨宝盒：[ophub/luci-app-amlogic](https://github.com/ophub/luci-app-amlogic)
- 引入 Aurora 主题和配置：
  - [eamonxg/luci-theme-aurora](https://github.com/eamonxg/luci-theme-aurora)
  - [eamonxg/luci-app-aurora-config](https://github.com/eamonxg/luci-app-aurora-config)
- 修改默认管理地址为 `10.10.10.1`
- 在 `rc.local` 中启动 `usbmuxd`，用于 iOS USB 共享网络相关通信
- 调整 autocore 首页时间显示格式

## K3 diy.sh

[K3-ImmortalWrt/diy.sh](K3-ImmortalWrt/diy.sh) 在 ImmortalWrt 源码拉取后执行，主要做这些事：

- 替换 Go 工具链为 [sbwml/packages_lang_golang](https://github.com/sbwml/packages_lang_golang) `26.x`
- 移除 feeds 中容易和新版 PassWall 冲突的旧核心包
- 引入新版 PassWall：
  - [Openwrt-Passwall/openwrt-passwall-packages](https://github.com/Openwrt-Passwall/openwrt-passwall-packages)
  - [Openwrt-Passwall/openwrt-passwall](https://github.com/Openwrt-Passwall/openwrt-passwall)
- 引入 Aurora 主题和配置：
  - [eamonxg/luci-theme-aurora](https://github.com/eamonxg/luci-theme-aurora)
  - [eamonxg/luci-app-aurora-config](https://github.com/eamonxg/luci-app-aurora-config)
- 引入 K3 屏幕插件和驱动：
  - [li1507/luci-app-k3screenctrl](https://github.com/li1507/luci-app-k3screenctrl)
  - [li1507/k3screenctrl_build](https://github.com/li1507/k3screenctrl_build)
- K3 处理方式参考 [rmoyulong/Lite_OpenWrt](https://github.com/rmoyulong/Lite_OpenWrt) 的 ImmortalWrt K3 构建思路
- 当 workflow 矩阵变量 `K3_FACTORY_WIFI=true` 时，下载 K3 原厂 WiFi 固件并覆盖源码中的 `brcmfmac4366c-pcie.bin`
- 修改默认管理地址为 `10.10.10.1`
- 在 `rc.local` 中启动 `usbmuxd`，用于 iOS USB 共享网络相关通信
- 调整 autocore 首页时间显示格式

## AW1000 diy.sh

[AW1000-NSS/diy.sh](AW1000-NSS/diy.sh) 在 AgustinLorenzo main_nss 源码拉取后执行，主要做这些事：

- 替换 Go 工具链为 [sbwml/packages_lang_golang](https://github.com/sbwml/packages_lang_golang) `26.x`
- 移除 feeds 中容易和新版 PassWall 冲突的旧核心包
- 引入新版 PassWall：
  - [Openwrt-Passwall/openwrt-passwall-packages](https://github.com/Openwrt-Passwall/openwrt-passwall-packages)
  - [Openwrt-Passwall/openwrt-passwall](https://github.com/Openwrt-Passwall/openwrt-passwall)
- 单独引入 AW1000 LED、QModem、3ginfo-lite、sms-tool-js、modemband、modemdata、atinout、Bandix、autocore、Arwi Dashboard、Ramfree 和 OpenAppFilter 等仓库
- `sms-tool` 使用 OpenWrt packages feed 中的标准包；`4IceG/luci-app-sms-tool-js`、`4IceG/luci-app-modemband` 都依赖这个包，来源对应 [obsy/sms_tool](https://github.com/obsy/sms_tool)
- `luci-app-bandix` 依赖 `bandix` 后端，因此同步引入 [timsaya/openwrt-bandix](https://github.com/timsaya/openwrt-bandix)
- QModem 优先，不默认启用 ModemManager 和依赖 ModemManager 的 `luci-app-sms-manager`，避免抢占模组端口
- 修改默认管理地址为 `10.10.10.1`
- 保留 USB 共享网络默认配置
- 写入 AW1000 NSS 默认设置，关闭 firewall4 flow offloading，优先走 ECM/NSS
- 调整 autocore 首页时间显示格式

## K3 双 WiFi 固件

K3 workflow 会同时构建两个固件：

- `k3-imm-wifi-*`：使用 ImmortalWrt 自带 K3 WiFi 固件，保留 `iwconfig` 开机设置 `wlan0/wlan1` 为 20 dBm
- `k3-factory-wifi-noset-*`：使用 K3 原厂 WiFi 固件，实测可启动、USB 共享和屏幕正常，但不能设置 WiFi 密码，不包含 `iwconfig` 功率脚本

## 主要插件

- PassWall：保留 Xray 和 Hysteria，关闭旧组件以减少下载和编译失败
- Aurora：当前唯一启用主题
- N1：保留晶晨宝盒、Turbo ACC
- K3：保留 K3 屏幕控制、Samba、WOL、TTYD、USB 共享网络支持；不启用 Turbo ACC 和 HomeProxy

## 目录说明

- [N1-LEDE/.config](N1-LEDE/.config)：N1 编译配置
- [N1-LEDE/diy.sh](N1-LEDE/diy.sh)：N1 自定义脚本
- [N1-LEDE/files](N1-LEDE/files)：N1 预置文件
- [K3-ImmortalWrt/.config](K3-ImmortalWrt/.config)：K3 编译配置
- [K3-ImmortalWrt/diy.sh](K3-ImmortalWrt/diy.sh)：K3 自定义脚本
- [K3-ImmortalWrt/files](K3-ImmortalWrt/files)：K3 预置文件
- [AW1000-NSS/.config](AW1000-NSS/.config)：AW1000 NSS 编译配置
- [AW1000-NSS/diy.sh](AW1000-NSS/diy.sh)：AW1000 自定义脚本
- [AW1000-NSS/files](AW1000-NSS/files)：AW1000 预置文件
- [deps/ubuntu.txt](deps/ubuntu.txt)：GitHub Actions 编译依赖
- [.github/workflows/build-n1-openwrt.yml](.github/workflows/build-n1-openwrt.yml)：N1 自动编译 workflow
- [.github/workflows/build-k3-immortalwrt.yml](.github/workflows/build-k3-immortalwrt.yml)：K3 自动编译 workflow
- [.github/workflows/build-aw1000-nss.yml](.github/workflows/build-aw1000-nss.yml)：AW1000 NSS 自动编译 workflow
