module("luci.controller.modemwebui", package.seeall)

function index()
	entry({"admin", "modem", "modemwebui"}, cbi("modemwebui", {autoapply = true}), _("RG500QEA_WebUI"), 10).leaf = true
end
