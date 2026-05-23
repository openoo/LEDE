# rg500q-at-webserver

`rg500q-at-webserver` 是面向 Quectel RG500Q/RM5xxQ 系列模组的轻量 Rust WebSocket AT 后端。

它只包含 RG500Q/RM5xxQ 相关逻辑，不包含 MT5700 相关代码、配置或命名。

## 功能

- WebSocket 监听，默认端口 `8765`
- 默认 AT 串口 `/dev/ttyUSB2`
- 支持通用 AT 命令透传
- 支持 RG500Q 常用动作：
  - 当前小区信息
  - 邻区扫描
  - 查询/设置网络模式
  - 查询/设置网络优先级
  - 查询/设置漫游
  - 查询/设置服务类型
  - 查询/设置 SIM 卡槽
  - 锁定 5G 小区
  - 锁定 4G 小区
  - 清除 5G/4G 小区锁定
  - 模组重启

## WebSocket 消息

通用 AT：

```json
{"id":"1","action":"at","cmd":"AT+QENG=\"servingcell\""}
```

当前小区：

```json
{"id":"2","action":"serving_cell"}
```

邻区扫描：

```json
{"id":"3","action":"neighbor_cells"}
```

锁 5G 小区：

```json
{"id":"4","action":"lock_5g_cell","pci":264,"arfcn":504990,"scs":30,"band":41}
```

锁 4G 小区：

```json
{"id":"5","action":"lock_4g_cell","earfcn":1350,"pci":359}
```

清除锁定：

```json
{"id":"6","action":"clear_lock","rat":"5g"}
```

返回格式：

```json
{"id":"1","ok":true,"action":"at","raw":"...","cmd":"AT+..."}
```

## 配置

`/etc/config/rg500q-at-webserver`

```text
config rg500q-at-webserver 'config'
	option enabled '1'
	option listen_host '0.0.0.0'
	option websocket_port '8765'
	option serial_port '/dev/ttyUSB2'
	option serial_baudrate '115200'
	option serial_timeout_ms '2500'
	option auth_key ''
```

## 编译目标

AW1000 的 OpenWrt target 为：

```text
CONFIG_TARGET_qualcommax=y
CONFIG_TARGET_qualcommax_ipq807x=y
CONFIG_TARGET_qualcommax_ipq807x_DEVICE_arcadyan_aw1000=y
```

该机型 CPU 为 aarch64/Cortex-A53，因此本包使用 Rust target：

```text
aarch64-unknown-linux-musl
```

OpenWrt 编译时会通过 `TARGET_CC` / `TARGET_AR` 调用当前固件工具链链接，不应上传 Windows 本机编译出的 `.exe`。

## 前端获取 WS 地址

```text
/cgi-bin/rg500q-ws-info
```

## 常用命令

```sh
/etc/init.d/rg500q-at-webserver restart
logread -e rg500q-at-webserver
```
