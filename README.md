# N1 / K3 / AW1000 OpenWrt 构建配置

这是自用 OpenWrt 构建仓库，当前维护三类设备：

- 斐讯 N1：LEDE 线，面向 Amlogic 打包。
- 斐讯 K3：ImmortalWrt 24.10 线，输出原生 K3 固件。
- Arcadyan AW1000 / AW1K：qualcommax/ipq807x NSS 线，重点维护 5G 模组、NSS、QModem、LED 和 RG500QEA WebUI。

## 默认地址

| 设备 | 默认后台地址 | 说明 |
| --- | --- | --- |
| N1 | `10.10.10.1` | LEDE armsr 固件 |
| K3 | `10.10.10.1` | ImmortalWrt K3 固件 |
| AW1000 | `192.168.123.1` | AW1000 NSS 固件 |
| AW1000 不死鸟 U-Boot | `192.168.1.254` | 按住 Reset 上电，网线接 WAN 口 |

账号通常为 `root`。密码以具体固件配置为准。

## 工作流

| Workflow | 用途 | 上游 |
| --- | --- | --- |
| [.github/workflows/build-n1-openwrt.yml](.github/workflows/build-n1-openwrt.yml) | 编译 N1 OpenWrt | `coolsnowwolf/lede master` |
| [.github/workflows/build-k3-immortalwrt.yml](.github/workflows/build-k3-immortalwrt.yml) | 编译 K3 ImmortalWrt，矩阵输出两种 WiFi 固件 | `immortalwrt/immortalwrt openwrt-24.10` |
| [.github/workflows/build-aw1000-nss-lite.yml](.github/workflows/build-aw1000-nss-lite.yml) | 编译 AW1000 NSS Lite | `qosmio/openwrt-ipq 24.10-nss` |
| [.github/workflows/build-aw1000-libwrt-nss.yml](.github/workflows/build-aw1000-libwrt-nss.yml) | 编译 AW1000 LiBwrt NSS | `LiBwrt/openwrt-6.x main-nss` |

AW1000 两条线共用同一份 `AW1000-NSS/.config`、`AW1000-NSS/diy.sh`、`AW1000-NSS/files` 和本地 `packages`。区别主要是上游源码、NSS packages 来源和 LLVM BPF 工具链处理方式。

## AW1000 当前重点

AW1000 已经从早期单一 NSS 构建，整理成下面的结构：

- 目标设备：`qualcommax/ipq807x DEVICE_arcadyan_aw1000`
- 默认后台：`192.168.123.1`
- 默认 WiFi：
  - SSID：`AW1K`
  - 密码：`888888889`
  - 加密：WPA2-PSK AES
  - 5G：`radio0`，默认信道 `36`，`HE160`
- NSS：
  - 启用 QCA NSS、ECM、qca-nss-drv、qca-nss-dp、ath11k NSS WiFi
  - `CONFIG_NSS_DRV_RMNET_ENABLE=y`
  - 关闭 firewall4 software/hardware flow offloading，优先走 ECM/NSS
- 5G 模组：
  - 使用 QModem 管理 RG500Q-EA
  - 不再默认编译 `luci-app-modemband`、`luci-app-modemdata`、`luci-app-sms-tool-js`、`luci-app-3ginfo-lite`
  - 保留 `qfirehose`、`atinout`、`bandix`、`arwi-dashboard`、`quickfile`
- Web 后台：
  - LuCI 使用 nginx + uWSGI
  - quickfile 按官方方式配置 nginx LAN server，删除 80 -> 443 强制跳转
  - `uhttpd` 在 nginx 存在时禁用
- SmartDNS：
  - LiBwrt 线使用默认 feeds 中的 SmartDNS
  - NSS Lite 线可通过 `USE_PYMUMU_SMARTDNS=1` 使用 pymumu SmartDNS 包
- 编译：
  - 关闭 `CONFIG_CCACHE`
  - 编译使用 `make -j$(nproc) || make -j1 V=s`
  - Release 会上传固件、完整 `.config`、`diffconfig` 和 `sha256sums`

## AW1000 本地包

本仓库现在在 [packages](packages) 中维护本地包，AW1000 编译时由 `AW1000-NSS/diy.sh` 复制进 OpenWrt 源码：

| 包 | 说明 |
| --- | --- |
| [packages/luci-app-aw1k-led](packages/luci-app-aw1k-led) | AW1000 指示灯控制，已中文化并本地维护 |
| [packages/luci-app-modemwebui](packages/luci-app-modemwebui) | RG500QEA WebUI，包含闭源 `webuiserver` 后端和本地构建前端 |

### luci-app-aw1k-led

功能：

- 管理 Power、5G、Signal、WiFi、Internet、Phone 灯。
- 5G 灯按 SINR 判断质量。
- Signal 灯优先按 NR5G RSRP 判断，CSQ 只作为 4G/回退判断。
- Phone 灯只用于 USB 共享网络提示，检测到 Android/iPhone/随身 WiFi 等 USB 上网设备时点亮。
- 支持夜间模式。
- 开机自启：`/etc/rc.d/S99ledstatus`

### luci-app-modemwebui

功能：

- LuCI 菜单名：`RG500QEA_WebUI`
- LuCI 管理页使用标准 CBI 写法，不再使用手写 HTML 表单。
- 后端服务：`/usr/bin/webuiserver`
- init 脚本：`/etc/init.d/modemwebui`
- 进程守护：`/usr/bin/modemwebui-monitor.sh`
- WebUI 入口：`http://<路由器地址>:8001/`
- 前端源码目录：[modemwebui-src](modemwebui-src)

前端改动后需要：

```bash
cd modemwebui-src
npm run build
```

然后把 `modemwebui-src/dist` 同步到：

```text
packages/luci-app-modemwebui/root/www/webui/webui000/web
```

## AW1000 文件覆盖

[AW1000-NSS/files](AW1000-NSS/files) 里目前包含：

| 文件 | 作用 |
| --- | --- |
| `etc/uci-defaults/99-aw1000-nss-defaults` | 设置 WiFi、NSS 相关 UCI、关闭 flow offloading |
| `etc/uci-defaults/98-aw1000-web-defaults` | 按 quickfile 官方建议配置 nginx，禁用 uhttpd |
| `etc/hotplug.d/net/30-aw1000-usb-tether` | 自动识别 USB 共享网络接口，动态写入 `usbv4/usbv6` |

USB 共享网络自动识别支持：

```text
rndis_host
cdc_ether
cdc_ncm
cdc_mbim
ipheth
```

## AW1000 自定义脚本

[AW1000-NSS/scripts/update-feeds-conf.sh](AW1000-NSS/scripts/update-feeds-conf.sh)

- 在 `feeds update -a` 之前执行。
- 添加 PassWall 官方 feeds。
- 如设置 `NSS_PACKAGES_BRANCH`，则固定 `qosmio/nss-packages` 分支。

[AW1000-NSS/scripts/prepare-feeds.sh](AW1000-NSS/scripts/prepare-feeds.sh)

- 在 `feeds update -a` 之后、`feeds install -a` 之前执行。
- 替换 Go 工具链为 `sbwml/packages_lang_golang 26.x`。
- 可选替换 pymumu SmartDNS。
- 固定 `sms-tool` 到指定源码版本。
- 删除默认 feeds 中会被自定义包替换的源码。

[AW1000-NSS/diy.sh](AW1000-NSS/diy.sh)

- 在 `feeds install -a` 之后执行。
- 清理 `package/feeds` 中会冲突的链接。
- 克隆主题和自定义插件。
- 复制本地维护的 `luci-app-aw1k-led`、`luci-app-modemwebui`。
- 修改默认后台地址为 `192.168.123.1`。
- 调整 autocore 首页时间格式。

## AW1K 刷机攻略

新增目录：[AW1K刷机攻略](AW1K刷机攻略)

其中 [AW1K刷机攻略/README.md](AW1K刷机攻略/README.md) 已整理为简体中文刷机流程，包含：

- UART 接线和 PuTTY 参数
- TFTP 设置
- 500MB MIBIB 刷入
- 不死鸟 U-Boot 刷入
- factory 固件刷入
- 不死鸟 U-Boot 网页进入方式
- 关键文件 MD5

关键文件：

```text
aw1000-mibib.bin   500MB 大分区 MIBIB
500MB-mibib.bin    500MB 大分区 MIBIB，和 aw1000-mibib.bin 内容一致
uboot.bin          不死鸟 U-Boot
factory.bin        factory 固件
```

不死鸟 U-Boot 进入方式：

```text
网线接 AW1000 WAN 口
电脑在 192.168.1.0/24 网段
网关指向 192.168.1.254
按住 Reset 上电
访问 http://192.168.1.254
```

## N1

N1 构建目录：[N1-LEDE](N1-LEDE)

- 上游：`coolsnowwolf/lede master`
- 目标：`armsr/armv8 generic`
- 固件打包：`unifreq/openwrt_packit`
- 默认后台：`10.10.10.1`
- 主要插件：
  - PassWall
  - 晶晨宝盒 `luci-app-amlogic`
  - Samba4
  - WOL
  - TTYD
  - Turbo ACC
  - Argon / Aurora 主题
- USB 共享网络：
  - 已移除写死 `usb0`
  - 新增 [N1-LEDE/files/etc/hotplug.d/net/30-usb-tether](N1-LEDE/files/etc/hotplug.d/net/30-usb-tether)
  - 插入 USB 上网设备后自动识别真实接口并写入 `usbv4/usbv6`

## K3

K3 构建目录：[K3-ImmortalWrt](K3-ImmortalWrt)

- 上游：`immortalwrt/immortalwrt openwrt-24.10`
- 目标：`bcm53xx/generic DEVICE_phicomm_k3`
- 默认后台：`10.10.10.1`
- Workflow 矩阵输出：
  - `imm-wifi`：使用 ImmortalWrt 自带 K3 WiFi 固件，并保留 TX Power 脚本。
  - `factory-wifi-noset`：使用 K3 原厂 WiFi 固件，不启用 TX Power 脚本。
- 主要插件：
  - PassWall
  - K3 屏幕控制
  - Samba4
  - WOL
  - TTYD
  - Argon 主题
- USB 共享网络：
  - 已移除写死 `usb0`
  - 新增 [K3-ImmortalWrt/files/etc/hotplug.d/net/30-k3-usb-tether](K3-ImmortalWrt/files/etc/hotplug.d/net/30-k3-usb-tether)
  - 首次启动只创建 `usbv4/usbv6`，实际接口由 hotplug 自动检测

## 目录说明

```text
.
├── .github/workflows/              # GitHub Actions 构建流程
├── AW1000-NSS/                     # AW1000 共用配置、脚本和 files overlay
├── AW1K刷机攻略/                   # AW1000 初始刷机资料和教程
├── deps/                           # GitHub Actions 依赖列表
├── K3-ImmortalWrt/                 # K3 配置、脚本和 files overlay
├── modemwebui-src/                 # RG500QEA WebUI 前端源码
├── N1-LEDE/                        # N1 配置、脚本和 files overlay
└── packages/                       # 本地维护的 OpenWrt 包
```

## 常用维护命令

查看本地改动：

```bash
git status --short
```

查看 AW1000 本地包：

```bash
ls packages
```

构建 RG500QEA WebUI 前端：

```bash
cd modemwebui-src
npm run build
```

检查 AW1000 关键配置：

```bash
grep -E 'luci-app-modemwebui|luci-app-aw1k-led|qmodem|smartdns|NSS' AW1000-NSS/.config
```
