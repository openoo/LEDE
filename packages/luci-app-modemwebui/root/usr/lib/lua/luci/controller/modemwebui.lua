module("luci.controller.modemwebui", package.seeall)

function index()
	entry({"admin", "modem", "modemwebui"}, template("modemwebui/modemwebui"), _("RG500QEA_WebUI"), 10).leaf = true
end
