# N1 OpenWrt

基于 [coolsnowwolf/lede](https://github.com/coolsnowwolf/lede) 构建的斐讯 N1 自用精简固件配置。

当前目标是保持固件干净、功能明确：只保留日常主路由需要的组件，默认使用 PassWall 作为代理插件，主题使用 Aurora。

## 基本信息

- 设备：斐讯 N1
- 默认管理地址：`10.10.10.1`
- 默认账号：`root`
- 默认密码：`password`
- 构建方式：GitHub Actions 手动触发
- N1 Workflow：[build-n1-openwrt.yml](.github/workflows/build-n1-openwrt.yml)
- K3 Workflow：[build-k3-openwrt.yml](.github/workflows/build-k3-openwrt.yml)

## 主要功能

- PassWall，保留 Xray 和 Hysteria 组件
- Aurora 主题和配置插件
- 晶晨宝盒，方便后续在线升级
- IPv6 基础支持
- USB 网络共享，支持手机 USB 共享网络
- Samba、WOL、TTYD 等常用插件
- Turbo ACC 网络加速插件

## PassWall 配置

PassWall 使用新版官方源引入，并保留 Xray 和 Hysteria：

```config
CONFIG_PACKAGE_luci-app-passwall=y
CONFIG_PACKAGE_xray-core=y
CONFIG_PACKAGE_luci-app-passwall_INCLUDE_Xray=y
CONFIG_PACKAGE_hysteria=y
CONFIG_PACKAGE_luci-app-passwall_INCLUDE_Hysteria=y
```

已显式关闭会触发旧包下载的组件，例如 Haproxy、Shadowsocks、ShadowsocksR、Simple Obfs、Trojan Plus、V2ray Plugin。

## 主题

当前只启用 Aurora：

```config
CONFIG_PACKAGE_luci-theme-aurora=y
CONFIG_PACKAGE_luci-app-aurora-config=y
```

主题源码来自：

- [eamonxg/luci-theme-aurora](https://github.com/eamonxg/luci-theme-aurora)
- [eamonxg/luci-app-aurora-config](https://github.com/eamonxg/luci-app-aurora-config)

## 构建说明

进入 GitHub Actions，按设备手动运行对应 workflow：

- N1：`📦 编译 N1 OpenWrt`
- K3：`📦 编译 K3 OpenWrt`

N1 构建流程会：

1. 释放 GitHub Actions 编译空间
2. 克隆 LEDE master 源码
3. 将 LuCI feed 调整为 `openwrt-25.12`
4. 替换新版 Go 工具链
5. 引入新版 PassWall 源
6. 写入 N1 配置和自定义文件
7. 编译并使用 `openwrt_packit` 打包 N1 固件
8. 自动发布到 GitHub Release

K3 构建流程复用同一套 LEDE master 和 LuCI `openwrt-25.12` 源，直接编译 `bcm53xx/generic` 的 K3 `trx` 固件，不使用 Amlogic 打包器。
K3 会按社区方案替换 li1507 的屏幕插件/驱动，无线固件使用 LEDE 自带的 `k3wifi` 包。
K3 保留正常路由器的 WAN/LAN 交换机布局，USB 共享网络通过 uci-defaults 追加 `usbv4/usbv6` 到 wan 区。
K3 预置 `iwconfig`，开机后将 `wlan0/wlan1` 发射功率固定为 20 dBm；无线地区、149+ 信道和 80 MHz 频宽建议在 LuCI 中手动设置。

## 目录说明

- `N1-LEDE/.config`：N1 固件编译配置
- `N1-LEDE/diy.sh`：自定义软件源、PassWall、主题和默认设置
- `N1-LEDE/files`：预置到固件里的配置文件
- `K3-LEDE/.config`：K3 固件编译配置
- `K3-LEDE/diy.sh`：K3 自定义软件源、PassWall、主题和默认设置
- `K3-LEDE/files`：K3 启动时追加 USB 共享网络接口的预置脚本
- `deps/ubuntu.txt`：GitHub Actions 编译依赖
- `.github/workflows/build-n1-openwrt.yml`：N1 自动编译 workflow
- `.github/workflows/build-k3-openwrt.yml`：K3 自动编译 workflow

## 截图

![主页](/images/chrome_ov39v3vv6T.png)
![网络接口](/images/IDVMY33fsO.png)

## 致谢

- 源码基于 [coolsnowwolf/lede](https://github.com/coolsnowwolf/lede)
- 固件打包使用 [unifreq/openwrt_packit](https://github.com/unifreq/openwrt_packit)
- N1 内核来自 [breakingbadboy/OpenWrt](https://github.com/breakingbadboy/OpenWrt/releases/tag/kernel_stable)
- 原始项目参考 [fightroad/N1-OpenWrt](https://github.com/fightroad/N1-OpenWrt)
