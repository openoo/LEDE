#!/bin/sh
set -eu

# qosmio/openwrt-ipq 24.10-nss tracks OpenWrt 24.10 and may move to newer
# Linux 6.6 patch releases before all downstream NSS patches are refreshed.
# This refresh keeps the bonding-over-LAG NSS patch compatible with Linux
# 6.6.141 while preserving the upstream branch update flow.

patch_file="target/linux/qualcommax/patches-6.6/0600-4-qca-nss-ecm-support-net-bonding-over-LAG-interface.patch"

if [ ! -f "$patch_file" ]; then
	echo "==> 未找到 $patch_file，跳过 bonding LAG 补丁刷新"
	exit 0
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

old_ad="$tmp_dir/old-ad.patch"
new_ad="$tmp_dir/new-ad.patch"
old_xmit="$tmp_dir/old-xmit.patch"
new_xmit="$tmp_dir/new-xmit.patch"

cat > "$old_ad" <<'EOF'
@@ -2066,6 +2124,7 @@ static void ad_enable_collecting_distrib
 					      bool *update_slave_arr)
 {
 	if (port->aggregator->is_active) {
+		struct bond_cb *lag_cb_main; /* QCA NSS ECM bonding support */
 		slave_dbg(port->slave->bond->dev, port->slave->dev,
 			  "Enabling port %d (LAG %d)\n",
 			  port->actor_port_number,
EOF

cat > "$new_ad" <<'EOF'
@@ -2066,8 +2124,9 @@ static void ad_enable_collecting_distrib
 					      bool *update_slave_arr)
 {
 	struct aggregator *aggregator = rcu_dereference(port->aggregator);
 
 	if (aggregator->is_active) {
+		struct bond_cb *lag_cb_main; /* QCA NSS ECM bonding support */
 		slave_dbg(port->slave->bond->dev, port->slave->dev,
 			  "Enabling port %d (LAG %d)\n",
 			  port->actor_port_number,
EOF

cat > "$old_xmit" <<'EOF'
@@ -5496,8 +5789,9 @@ static netdev_tx_t __bond_start_xmit(str
 		return bond_xmit_roundrobin(skb, dev);
 	case BOND_MODE_ACTIVEBACKUP:
 		return bond_xmit_activebackup(skb, dev);
-	case BOND_MODE_8023AD:
 	case BOND_MODE_XOR:
+		return bond_xmit_xor(skb, dev); /* QCA NSS ECM bonding support */
+	case BOND_MODE_8023AD:
 		return bond_3ad_xor_xmit(skb, dev);
 	case BOND_MODE_BROADCAST:
 		return bond_xmit_broadcast(skb, dev);
EOF

cat > "$new_xmit" <<'EOF'
@@ -5496,11 +5789,11 @@ static netdev_tx_t __bond_start_xmit(str
 		return bond_xmit_roundrobin(skb, dev);
 	case BOND_MODE_ACTIVEBACKUP:
 		return bond_xmit_activebackup(skb, dev);
 	case BOND_MODE_8023AD:
 		if (bond_should_broadcast_neighbor(skb, dev))
 			return bond_xmit_broadcast(skb, dev, false);
-		fallthrough;
+		return bond_3ad_xor_xmit(skb, dev);
 	case BOND_MODE_XOR:
-		return bond_3ad_xor_xmit(skb, dev);
+		return bond_xmit_xor(skb, dev); /* QCA NSS ECM bonding support */
 	case BOND_MODE_BROADCAST:
 		return bond_xmit_broadcast(skb, dev, true);
EOF

python3 - "$patch_file" "$old_ad" "$new_ad" "$old_xmit" "$new_xmit" <<'PY'
import pathlib
import sys

patch = pathlib.Path(sys.argv[1])
text = patch.read_text()

replacements = [
    ("ad_enable_collecting_distributing", pathlib.Path(sys.argv[2]).read_text(), pathlib.Path(sys.argv[3]).read_text()),
    ("__bond_start_xmit", pathlib.Path(sys.argv[4]).read_text(), pathlib.Path(sys.argv[5]).read_text()),
]

changed = []
missing = []
for name, old, new in replacements:
    if old not in text:
        missing.append(name)
        continue
    text = text.replace(old, new, 1)
    changed.append(name)

if missing:
    print(f"ERROR: failed to refresh hunks: {', '.join(missing)}", file=sys.stderr)
    sys.exit(1)

patch.write_text(text)
print(f"refreshed hunks: {', '.join(changed)}")
PY

echo "==> 已刷新 qosmio bonding LAG NSS 补丁：$patch_file"
