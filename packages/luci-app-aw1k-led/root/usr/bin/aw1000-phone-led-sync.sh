#!/bin/sh

PHONE_LED="/sys/class/leds/green:phone"

set_phone_led() {
	[ -d "$PHONE_LED" ] || exit 0
	echo none > "$PHONE_LED/trigger"
	echo "$1" > "$PHONE_LED/brightness"
}

is_usb_tether_interface() {
	local iface="$1"
	local device_path driver

	case "$iface" in
		""|lo|br-*|lan*|wan|wwan*|phy*-ap*|gre*|gretap*|erspan*|miireg|bonding_masters)
			return 1
			;;
	esac

	device_path="$(readlink -f "/sys/class/net/${iface}/device" 2>/dev/null)"
	case "$device_path" in
		*'/usb'*) ;;
		*) return 1 ;;
	esac

	driver="$(sed -n 's/^DRIVER=//p' "/sys/class/net/${iface}/device/uevent" 2>/dev/null | head -n1)"
	case "$driver" in
		rndis_host|cdc_ether|cdc_ncm|cdc_mbim|ipheth)
			return 0
			;;
	esac

	return 1
}

[ "$(uci -q get ledstatus.settings.phone_usb_tether_enabled)" = "0" ] && {
	set_phone_led 0
	exit 0
}

configured_device="$(uci -q get network.usbv4.device)"
if is_usb_tether_interface "$configured_device"; then
	set_phone_led 1
	exit 0
fi

for netdev in /sys/class/net/*; do
	iface="${netdev##*/}"
	if is_usb_tether_interface "$iface"; then
		set_phone_led 1
		exit 0
	fi
done

set_phone_led 0
