include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-modemwebui
PKG_VERSION:=1.0.0
PKG_RELEASE:=4

PKG_MAINTAINER:=AW1000 local build
PKG_LICENSE:=Unknown

LUCI_TITLE:=RG500QEA_WebUI
LUCI_DEPENDS:=+luci-base +luci-compat +tom_modem
PKGARCH:=aarch64_cortex-a53

include $(TOPDIR)/feeds/luci/luci.mk

define Package/$(PKG_NAME)/description
LuCI launcher and bundled binary backend for Quectel RG500Q-EA modem WebUI.
endef

define Package/$(PKG_NAME)/conffiles
/etc/config/modemwebui
/www/webui/webui000/config.json
endef

define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) ./root/usr/bin/webuiserver $(1)/usr/bin/webuiserver
	$(INSTALL_BIN) ./root/usr/bin/modemwebui-monitor.sh $(1)/usr/bin/modemwebui-monitor.sh

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./root/etc/init.d/modemwebui $(1)/etc/init.d/modemwebui
	$(INSTALL_DIR) $(1)/etc/rc.d
	$(LN) ../init.d/modemwebui $(1)/etc/rc.d/S99modemwebui
	$(LN) ../init.d/modemwebui $(1)/etc/rc.d/K10modemwebui

	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./root/etc/uci-defaults/90-modemwebui $(1)/etc/uci-defaults/90-modemwebui

	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./root/etc/config/modemwebui $(1)/etc/config/modemwebui

	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/controller
	$(INSTALL_DATA) ./root/usr/lib/lua/luci/controller/modemwebui.lua $(1)/usr/lib/lua/luci/controller/modemwebui.lua
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/model/cbi
	$(INSTALL_DATA) ./root/usr/lib/lua/luci/model/cbi/modemwebui.lua $(1)/usr/lib/lua/luci/model/cbi/modemwebui.lua

	$(CP) ./root/www $(1)/
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
