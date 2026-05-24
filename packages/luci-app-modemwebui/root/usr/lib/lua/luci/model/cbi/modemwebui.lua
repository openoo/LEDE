local sys = require "luci.sys"
local http = require "luci.http"

local function backend_running()
	return sys.call("pidof webuiserver >/dev/null 2>&1") == 0
end

local function guard_running()
	return sys.call("busybox pgrep -f '[m]odemwebui-monitor.sh' >/dev/null 2>&1") == 0
end

local function pid_text()
	return sys.exec("pidof webuiserver 2>/dev/null | tr '\\n' ' '"):gsub("^%s+", ""):gsub("%s+$", "")
end

local function service_apply()
	local enabled = m.uci:get("modemwebui", "settings", "enabled") or "1"
	local guard = m.uci:get("modemwebui", "settings", "guard_enabled") or "1"

	if enabled == "1" then
		sys.call("/etc/init.d/modemwebui enable >/dev/null 2>&1")
		sys.call("/etc/init.d/modemwebui restart >/dev/null 2>&1")
		if guard == "0" then
			sys.call("busybox pkill -f '[m]odemwebui-monitor.sh' >/dev/null 2>&1")
		end
	else
		sys.call("/etc/init.d/modemwebui stop >/dev/null 2>&1")
		sys.call("/etc/init.d/modemwebui disable >/dev/null 2>&1")
		sys.call("busybox pkill -f '[w]ebuiserver' >/dev/null 2>&1")
		sys.call("busybox pkill -f '[m]odemwebui-monitor.sh' >/dev/null 2>&1")
	end
end

m = Map("modemwebui", translate("RG500QEA_WebUI"), translate("管理 RG500Q-EA 模组 WebUI 后端服务。"))
m.on_after_commit = service_apply

s = m:section(NamedSection, "settings", "modemwebui", translate("运行状态"))
s.addremove = false
s.anonymous = true

o = s:option(DummyValue, "_backend", translate("后端进程"))
o.rawhtml = true
function o.cfgvalue()
	if backend_running() then
		return translate("运行中") .. " PID: " .. pid_text()
	end
	return translate("未运行")
end

o = s:option(DummyValue, "_boot", translate("开机自启"))
function o.cfgvalue()
	return sys.call("/etc/init.d/modemwebui enabled >/dev/null 2>&1") == 0 and translate("已启用") or translate("未启用")
end

o = s:option(DummyValue, "_guard_status", translate("进程守护"))
function o.cfgvalue()
	local guard = m.uci:get("modemwebui", "settings", "guard_enabled") or "1"
	if guard == "1" and guard_running() then
		return translate("守护中")
	elseif guard == "1" then
		return translate("已启用，守护进程未运行")
	end
	return translate("未启用")
end

s = m:section(NamedSection, "settings", "modemwebui", translate("服务设置"))
s.addremove = false
s.anonymous = true

o = s:option(Flag, "enabled", translate("启用后端服务"))
o.default = "1"
o.rmempty = false
o.description = translate("关闭后会停止 webuiserver，WebUI 页面将无法连接 AT 后端。")

o = s:option(Flag, "guard_enabled", translate("启用进程守护"))
o.default = "1"
o.rmempty = false
o.description = translate("若 webuiserver 异常退出，守护进程会自动重启后端服务。")

o = s:option(Button, "_restart", translate("重启后端"))
o.inputtitle = translate("重启后端")
o.inputstyle = "reload"
function o.write()
	sys.call("/etc/init.d/modemwebui restart >/dev/null 2>&1")
	http.redirect(http.getenv("REQUEST_URI"))
end

o = s:option(DummyValue, "_open", translate("打开 WebUI"))
o.rawhtml = true
function o.cfgvalue()
	return '<input type="button" class="cbi-button cbi-button-positive" value="' ..
		translate("打开 WebUI") ..
		'" onclick="window.open(window.location.protocol + \'//\' + window.location.hostname + \':8001/#/dashboard\', \'_blank\')" />'
end

return m
