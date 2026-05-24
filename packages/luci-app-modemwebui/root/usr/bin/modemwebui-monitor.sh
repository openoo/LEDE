#!/bin/sh

INTERVAL="$(uci -q get modemwebui.settings.guard_interval)"
[ -n "$INTERVAL" ] || INTERVAL=30

while true; do
	enabled="$(uci -q get modemwebui.settings.guard_enabled)"
	service_enabled="$(uci -q get modemwebui.settings.enabled)"

	if [ "$enabled" = "1" ] && [ "$service_enabled" != "0" ] && ! pidof webuiserver >/dev/null 2>&1; then
		logger -t modemwebui "webuiserver missing, restarting service"
		/etc/init.d/modemwebui restart >/dev/null 2>&1 &
		sleep 5
	fi

	sleep "$INTERVAL"
done
