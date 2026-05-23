include $(TOPDIR)/rules.mk

PKG_NAME:=rg500q-at-webserver
PKG_VERSION:=0.1.0
PKG_RELEASE:=1

PKG_MAINTAINER:=AW1000 Local
PKG_LICENSE:=GPL-3.0-or-later

include $(INCLUDE_DIR)/package.mk

ifeq ($(CONFIG_ARCH),aarch64)
RUST_TARGET:=aarch64-unknown-linux-musl
else
RUST_TARGET:=unsupported
endif

define Package/rg500q-at-webserver
	SECTION:=net
	CATEGORY:=Network
	TITLE:=RG500Q AT WebSocket server
	DEPENDS:=+libgcc
endef

define Package/rg500q-at-webserver/description
	Lightweight Rust WebSocket server for Quectel RG500Q/RM5xxQ AT commands.
endef

define Build/Prepare
	$(call Build/Prepare/Default)
	$(CP) ./src $(PKG_BUILD_DIR)/
	$(CP) ./Cargo.toml $(PKG_BUILD_DIR)/
	$(CP) ./Cargo.lock $(PKG_BUILD_DIR)/
	$(INSTALL_DIR) $(PKG_BUILD_DIR)/.cargo
	printf '[target.$(RUST_TARGET)]\nlinker = "%s"\nar = "%s"\nrustflags = ["-C", "target-feature=-crt-static", "-C", "link-arg=-Wl,--gc-sections"]\n' \
		"$(TARGET_CC)" "$(TARGET_AR)" > $(PKG_BUILD_DIR)/.cargo/config.toml
endef

define Build/Compile
	[ "$(RUST_TARGET)" != "unsupported" ] || { \
		echo "rg500q-at-webserver only supports AW1000/aarch64 targets"; \
		exit 1; \
	}
	cd $(PKG_BUILD_DIR) && \
		CARGO_HOME="$(DL_DIR)/cargo" \
		CARGO_TARGET_DIR="$(PKG_BUILD_DIR)/target" \
		cargo build --release --locked --target $(RUST_TARGET)
endef

define Package/rg500q-at-webserver/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/target/$(RUST_TARGET)/release/rg500q-at-webserver $(1)/usr/bin/rg500q-at-webserver

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/etc/init.d/rg500q-at-webserver $(1)/etc/init.d/rg500q-at-webserver

	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/etc/config/rg500q-at-webserver $(1)/etc/config/rg500q-at-webserver

	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./files/etc/uci-defaults/90-rg500q-at-webserver $(1)/etc/uci-defaults/90-rg500q-at-webserver

	$(INSTALL_DIR) $(1)/www/cgi-bin
	$(INSTALL_BIN) ./files/www/cgi-bin/rg500q-ws-info $(1)/www/cgi-bin/rg500q-ws-info
endef

define Package/rg500q-at-webserver/conffiles
/etc/config/rg500q-at-webserver
endef

$(eval $(call BuildPackage,rg500q-at-webserver))
