# N1 OpenWrt

基于 [coolsnowwolf/lede](https://github.com/coolsnowwolf/lede) 构建的斐讯 N1 自用精简固件配置。

当前目标是保持固件干净、功能明确：只保留日常主路由需要的组件，默认使用 PassWall 作为代理插件，主题使用 Aurora。

## 基本信息

- 设备：斐讯 N1
- 默认管理地址：`10.10.10.1`
- 默认账号：`root`
- 默认密码：`password`
- 构建方式：GitHub Actions 手动触发
- Workflow：[build-n1-openwrt.yml](.github/workflows/build-n1-openwrt.yml)

## 主要功能

- PassWall，保留 Xray 和 Hysteria 组件
- SmartDNS，包含 LuCI 管理页和 WebUI 仪表盘，默认不启用
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

## SmartDNS 配置

SmartDNS 已编入固件，并启用 WebUI 仪表盘；默认服务不启用，不会直接接管系统默认的 dnsmasq。

```config
CONFIG_PACKAGE_smartdns=y
CONFIG_PACKAGE_smartdns-ui=y
CONFIG_PACKAGE_luci-app-smartdns=y
CONFIG_PACKAGE_luci-app-smartdns_INCLUDE_smartdns_ui=y
```

如果后续在 LuCI 中把 SmartDNS 端口设置为 `53`，它会接管主 DNS；如果使用其他端口，则可以作为 dnsmasq 的上游 DNS。WebUI 默认端口通常为 `6080`，默认账号密码为 `admin` / `password`。

## 主题

当前只启用 Aurora：

```config
CONFIG_PACKAGE_luci-theme-aurora=y
CONFIG_PACKAGE_luci-app-aurora-config=y
```

主题源码来自：

- [eamonxg/luci-theme-aurora](https://github.com/eamonxg/luci-theme-aurora)
- [eamonxg/luci-app-aurora-config](https://github.com/eamonxg/luci-app-aurora-config)
- [peditx/luci-theme-peditx](https://github.com/peditx/luci-theme-peditx)：已加入备选并参与编译，可在 LuCI 后台切换；主题自带 `/etc/config/peditx` 配置

## 构建说明

进入 GitHub Actions，手动运行 `📦 编译 N1 OpenWrt`。

构建流程会：

1. 释放 GitHub Actions 编译空间
2. 克隆 LEDE master 源码
3. 将 LuCI feed 调整为 `openwrt-25.12`
4. 替换新版 Go 工具链
5. 引入新版 PassWall 源
6. 写入 N1 配置和自定义文件
7. 编译并使用 `openwrt_packit` 打包 N1 固件
8. 自动发布到 GitHub Release

## 目录说明

- `N1-LEDE/.config`：N1 固件编译配置
- `N1-LEDE/diy.sh`：自定义软件源、PassWall、主题和默认设置
- `N1-LEDE/files`：预置到固件里的配置文件
- `deps/ubuntu.txt`：GitHub Actions 编译依赖
- `.github/workflows/build-n1-openwrt.yml`：N1 自动编译 workflow

## 截图

![主页](/images/chrome_ov39v3vv6T.png)
![网络接口](/images/IDVMY33fsO.png)

## 致谢

- 源码基于 [coolsnowwolf/lede](https://github.com/coolsnowwolf/lede)
- 固件打包使用 [unifreq/openwrt_packit](https://github.com/unifreq/openwrt_packit)
- N1 内核来自 [breakingbadboy/OpenWrt](https://github.com/breakingbadboy/OpenWrt/releases/tag/kernel_stable)
- 原始项目参考 [fightroad/N1-OpenWrt](https://github.com/fightroad/N1-OpenWrt)
