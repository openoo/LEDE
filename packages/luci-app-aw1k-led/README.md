# luci-app-aw1k-led

`luci-app-aw1k-led` 是为 Arcadyan AW1000 定制的 OpenWrt 指示灯控制插件，用于根据 5G 模组状态、移动网络连接、WiFi 状态、USB 共享网络插拔和夜间模式控制机身指示灯。

本包只针对 AW1000 的 LED 命名和硬件布局维护，不建议直接用于其他设备。

本地维护版本基于原项目 [`nooblk-98/luci-app-aw1k-led`](https://github.com/nooblk-98/luci-app-aw1k-led) 修改，感谢原作者提供 AW1000 指示灯控制的基础实现。

## 主要功能

- `5G` RGB 指示灯：根据 NR5G `SINR` 判断 5G 连接质量。
- `Signal` RGB 指示灯：优先根据 NR5G `RSRP` 判断 5G 信号强度，无法读取时回退到 `CSQ`。
- `Internet` 绿灯：移动网络有默认路由时常亮，未连接时闪烁。
- `WiFi` 绿灯：无线启用时常亮，关闭时熄灭。
- `Phone` 绿灯：用于 USB 共享网络提示，检测到安卓/iPhone/随身 WiFi 等 USB 上网设备时点亮，设备移除或关闭此选项时熄灭。
- 夜间模式：按设定时间关闭状态灯，保留 Power 灯常亮；不接管 Phone 灯。
- LuCI 页面：在 `系统 -> AW1000 指示灯` 中配置阈值、颜色、夜间模式和 Phone 灯提示。
- 当前信号状态：阈值页面可刷新读取真实 AT 返回，显示当前制式、SINR、RSRP、CSQ 和原始 AT 结果。

## 指示灯映射

| 指示灯 | sysfs 名称 | 用途 |
| --- | --- | --- |
| 5G RGB | `red:5g` / `green:5g` / `blue:5g` | 5G SINR 信号质量 |
| Signal RGB | `red:signal` / `green:signal` / `blue:signal` | NR5G RSRP 或 CSQ 信号强度 |
| Internet | `green:internet` | 移动网络连接状态 |
| WiFi | `green:wifi` | WiFi 启用状态 |
| Power | `green:power` | 电源灯，夜间模式下保持常亮 |
| Phone | `green:phone` | USB 共享网络设备插拔提示 |

AW1000 的 `Phone` 灯是单色硬件，当前只能控制绿色通道，不能自定义为红色、蓝色或 RGB 混色。

## 信号阈值说明

### 5G SINR 信号质量

`SINR` 用于判断 5G 连接质量，数值越高越好。默认分档：

| 分档 | 默认阈值 |
| --- | --- |
| 极佳 | `>= 20 dB` |
| 良好 | `>= 10 dB` |
| 一般 | `>= 0 dB` |
| 较弱 | `< 0 dB` |

### NR5G RSRP 信号强度

`RSRP` 用于判断 5G 信号强度，单位为 `dBm`，数值越接近 0 越强，例如 `-80` 强于 `-100`。默认分档：

| 分档 | 默认阈值 |
| --- | --- |
| 极佳 | `>= -80 dBm` |
| 良好 | `>= -90 dBm` |
| 一般 | `>= -100 dBm` |
| 较弱 | `< -100 dBm` |

### CSQ 回退阈值

`CSQ` 仅在无法读取 NR5G RSRP 时使用，用于粗略判断蜂窝信号强度；4G 模式下也通过它检测信号强度。CSQ 数值越大信号越强，`99` 表示未知，不代表信号很强。

默认分档：

| 分档 | 默认阈值 |
| --- | --- |
| 极佳 | `>= 20` |
| 良好 | `>= 14` |
| 一般 | `>= 10` |
| 较弱 | `< 10` |

## 编译依赖

OpenWrt/ImmortalWrt/LibWrt 编译时需要确保以下包可用：

| 依赖 | 用途 |
| --- | --- |
| `luci-base` | LuCI 页面、JS view、菜单和 UCI 配置界面 |
| `sms-tool` | 通过 AT 命令读取 `QCSQ`、`QENG`、`CSQ` 等模组状态 |

`rpcd`、`ubus`、`uci`、`jshn.sh`、`procd`、`hotplug`、`awk`、`sed`、`grep` 等为 OpenWrt/LuCI 基础环境组件，通常会随系统和 LuCI 自动带入。

在 `.config` 中启用：

```text
CONFIG_PACKAGE_luci-app-aw1k-led=y
```

如果你的源码树里有多个 `sms-tool` 变体，请确认最终固件内存在可执行文件：

```sh
which sms_tool
```

本插件默认使用 `/dev/ttyUSB2` 作为 AT 端口，可在 LuCI 页面中修改。

## OpenWrt 版本兼容

本包使用 LuCI JavaScript view、`menu.d` 菜单、`rpcd` 后端和标准 `/etc/init.d` 服务脚本，目标是同时兼容：

- OpenWrt 24.x / ImmortalWrt 24.x：使用 `opkg` 包管理。
- OpenWrt 25.x / apk 构建线：使用 `apk` 包管理。

源码编译时不依赖 OpenWrt 25.x 专属接口，也没有保留旧版 Lua controller。只要源码树提供 `luci-base` 和 `sms-tool`，两条构建线都应该可以正常编译和使用。

## 安装到固件

建议将本包放入源码树的自定义包目录，例如：

```text
package/custom-feeds/luci-app-aw1k-led
```

然后执行：

```sh
make menuconfig
make defconfig
make package/luci-app-aw1k-led/compile V=s
```

编译进固件后，首次启动会通过 `uci-defaults` 自动启用并启动 `ledstatus` 服务。

## 运行时服务

主要文件：

| 文件 | 作用 |
| --- | --- |
| `/etc/config/ledstatus` | 插件配置 |
| `/etc/init.d/ledstatus` | 指示灯服务 |
| `/usr/bin/led-status-check.sh` | 主检测脚本 |
| `/usr/bin/led-status-check-daemon.sh` | 周期检测守护脚本 |
| `/usr/bin/led-night-mode.sh` | 夜间模式控制 |
| `/usr/bin/aw1000-phone-led-sync.sh` | Phone 灯 USB 共享状态同步 |
| `/etc/hotplug.d/net/31-aw1000-phone-led` | 网络设备插拔触发 Phone 灯同步 |
| `/usr/libexec/rpcd/luci.aw1k-led` | LuCI 页面调用的 rpcd 后端 |

常用命令：

```sh
/etc/init.d/ledstatus restart
/usr/bin/led-status-check.sh
/usr/bin/aw1000-phone-led-sync.sh
ubus call luci.aw1k-led signal_status
```

## Phone 灯逻辑

Phone 灯不再表示 5G 模组状态，也不受夜间模式接管。它只表示外接 USB 共享网络设备状态。

会点亮 Phone 灯的常见驱动：

- `rndis_host`
- `cdc_ether`
- `cdc_ncm`
- `cdc_mbim`
- `ipheth`

内置 RG500Q 模组的 `wwan0` / `wwan0_1` 会被忽略，避免和外接 USB 共享网络混淆。

## 许可证

GPL-3.0-or-later
