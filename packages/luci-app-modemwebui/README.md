# luci-app-modemwebui

AW1000 本地维护的 5G 模组 WebUI LuCI 插件。

这个包复用已验证可用的 `webuiserver` 二进制后端和 `webui000` 前端资源，只保留 Quectel RG/RM 系列模组路径，不包含其他模组分支的资源和自动识别逻辑。

## 安装内容

- `/usr/bin/webuiserver`
- `/etc/init.d/modemwebui`
- `/etc/uci-defaults/90-modemwebui`
- `/usr/lib/lua/luci/controller/modemwebui.lua`
- `/usr/lib/lua/luci/view/modemwebui/modemwebui.htm`
- `/www/webui/webui000`
- `/www/webui/webui000/web` 为自研 Bulma 前端，复用原 `webuiserver` 的原生 WebSocket AT 协议。

## 编译依赖

- `luci-base`
- `luci-compat`
- `tom_modem`

`tom_modem` 由 QModem 包提供，用于后端访问 RG500Q 系列模组 AT 通道。

## 后台入口

LuCI 菜单：

`调制解调器 -> RG500QEA_WebUI`

独立 WebUI：

`http://路由器IP:8001/`
