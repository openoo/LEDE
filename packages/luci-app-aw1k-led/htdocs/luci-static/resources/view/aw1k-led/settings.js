'use strict';
'require view';
'require form';
'require uci';
'require ui';
'require rpc';

var callServiceList = rpc.declare({
    object: 'service',
    method: 'list',
    params: ['name'],
    expect: { '': {} }
});

var callInitAction = rpc.declare({
    object: 'luci',
    method: 'setInitAction',
    params: ['name', 'action'],
    expect: { result: false }
});

function getServiceStatus() {
    return callServiceList('ledstatus').then(function(res) {
        try { return res['ledstatus']['instances']['instance1']['running']; }
        catch(e) { return false; }
    });
}

var callSignalStatus = rpc.declare({
    object: 'luci.aw1k-led',
    method: 'signal_status',
    expect: { '': {} }
});

/* ─── Color palette ────────────────────────────────────────────────────────
 * Each entry: { id, label, hex, r, g, b }
 * r/g/b are 0 or 1 — the physical LED channels on AW1000 (max_brightness=1)
 * ────────────────────────────────────────────────────────────────────────── */
var COLORS = [
    { id: 'off',     label: '关闭', hex: '#222222', r:0, g:0, b:0 },
    { id: 'red',     label: '红色', hex: '#ff3030', r:1, g:0, b:0 },
    { id: 'green',   label: '绿色', hex: '#22dd44', r:0, g:1, b:0 },
    { id: 'blue',    label: '蓝色', hex: '#3399ff', r:0, g:0, b:1 },
    { id: 'yellow',  label: '黄色', hex: '#ffdd00', r:1, g:1, b:0 },
    { id: 'cyan',    label: '青色', hex: '#00eedd', r:0, g:1, b:1 },
    { id: 'magenta', label: '品红', hex: '#dd44ff', r:1, g:0, b:1 },
    { id: 'white',   label: '白色', hex: '#ffffff', r:1, g:1, b:1 }
];

function colorById(id) {
    for (var i = 0; i < COLORS.length; i++)
        if (COLORS[i].id === id) return COLORS[i];
    return COLORS[0];
}

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

return view.extend({
    load: function() {
        return Promise.all([
            uci.load('ledstatus'),
            getServiceStatus()
        ]);
    },

    render: function(data) {
        var running = data[1];
        var m, s, o;

        m = new form.Map('ledstatus', _('AW1000 指示灯状态'),
            _('配置 Arcadyan AW1000 路由器的指示灯行为。服务状态：') +
            (running
                ? '<span style="color:#2dce89;font-weight:bold">' + _('运行中') + '</span>'
                : '<span style="color:#f5365c;font-weight:bold">' + _('已停止') + '</span>'));

        s = m.section(form.NamedSection, 'settings', 'ledstatus');
        s.anonymous = true;
        s.addremove = false;

        s.tab('general',    _('常规'));
        s.tab('thresholds', _('阈值'));
        s.tab('colors',     _('灯光颜色'));
        s.tab('nightmode',  _('夜间模式'));

        /* ══════════════════════════════════════════════════════════════════
         * TAB: General
         * ══════════════════════════════════════════════════════════════════ */
        o = s.taboption('general', form.Flag, 'enabled', _('启用指示灯服务'));
        o.rmempty = false; o.default = '1';

        o = s.taboption('general', form.Value, 'interval',
            _('检测间隔'), _('每次更新指示灯之间的秒数（5-300）'));
        o.datatype = 'range(5,300)'; o.placeholder = '20'; o.rmempty = false;

        o = s.taboption('general', form.Value, 'modem_port',
            _('模组 AT 端口'), _('用于发送 AT 命令的串口，例如 /dev/ttyUSB2'));
        o.placeholder = '/dev/ttyUSB2'; o.rmempty = false;

        o = s.taboption('general', form.DummyValue, '_svc_ctrl', _('服务控制'));
        o.rawhtml = true;
        o.default = '<button type="button" class="btn cbi-button cbi-button-action" id="aw1k-restart-btn">' +
                    _('重启指示灯服务') + '</button>' +
                    '<span id="aw1k-restart-status" style="margin-left:12px;font-size:13px"></span>';

        /* ══════════════════════════════════════════════════════════════════
         * TAB: Thresholds
         * ══════════════════════════════════════════════════════════════════ */
        o = s.taboption('thresholds', form.DummyValue, '_signal_live', '');
        o.rawhtml = true;
        o.default = [
            '<div style="border:1px solid var(--border-color,#d8d8d8);border-radius:6px;padding:12px 14px;margin:0 0 16px;color:var(--text-color,inherit)">',
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">',
            '<h5 style="margin:0">当前信号状态</h5>',
            '<button type="button" class="btn cbi-button cbi-button-action" id="aw1k-refresh-signal-btn">刷新</button>',
            '</div>',
            '<div id="aw1k-signal-live" style="margin-top:10px;color:#888;font-size:13px">点击刷新读取当前 AT 返回。</div>',
            '</div>'
        ].join('');

        o = s.taboption('thresholds', form.DummyValue, '_5g_hdr', '');
        o.rawhtml = true;
        o.default = '<h5 style="margin:0 0 4px">5G SINR 信号质量阈值</h5>' +
                    '<p style="color:#888;font-size:12px;margin:0 0 10px">' +
                    '用于判断 5G 连接质量。SINR 越高越好，通常 ≥20 极佳，10~20 良好，0~10 一般，低于 0 较弱。颜色在 <b>灯光颜色</b> 标签页设置。</p>';

        o = s.taboption('thresholds', form.Value, 'sinr_excellent',
            _('5G 极佳（≥）'), _('SINR 大于等于此值'));
        o.datatype = 'integer'; o.placeholder = '20';

        o = s.taboption('thresholds', form.Value, 'sinr_good',
            _('5G 良好（≥）'), _('SINR 大于等于此值'));
        o.datatype = 'integer'; o.placeholder = '10';

        o = s.taboption('thresholds', form.Value, 'sinr_average',
            _('5G 一般（≥）'), _('SINR 大于等于此值'));
        o.datatype = 'integer'; o.placeholder = '0';

        o = s.taboption('thresholds', form.DummyValue, '_rsrp_hdr', '');
        o.rawhtml = true;
        o.default = '<h5 style="margin:16px 0 4px">NR5G RSRP 信号阈值</h5>' +
                    '<p style="color:#888;font-size:12px;margin:0 0 10px">' +
                    '用于判断 5G 信号强度。RSRP 单位为 dBm，数值越接近 0 越强，例如 -80 强于 -100。颜色在 <b>灯光颜色</b> 标签页设置。</p>';

        o = s.taboption('thresholds', form.Value, 'rsrp_excellent',
            _('信号极佳（≥）'), _('NR5G RSRP 大于等于此值'));
        o.datatype = 'integer'; o.placeholder = '-80';

        o = s.taboption('thresholds', form.Value, 'rsrp_good',
            _('信号良好（≥）'), _('NR5G RSRP 大于等于此值'));
        o.datatype = 'integer'; o.placeholder = '-90';

        o = s.taboption('thresholds', form.Value, 'rsrp_average',
            _('信号一般（≥）'), _('NR5G RSRP 大于等于此值'));
        o.datatype = 'integer'; o.placeholder = '-100';

        o = s.taboption('thresholds', form.DummyValue, '_csq_hdr', '');
        o.rawhtml = true;
        o.default = '<h5 style="margin:16px 0 4px">CSQ 回退阈值</h5>' +
                    '<p style="color:#888;font-size:12px;margin:0 0 10px">' +
                    '仅在无法读取 NR5G RSRP 时使用，用于粗略判断蜂窝信号强度；4G 模式下也通过它检测信号强度。CSQ 数值越大信号越强，99 表示未知。</p>';

        o = s.taboption('thresholds', form.Value, 'csq_excellent',
            _('CSQ 极佳（≥）'), _('CSQ 大于等于此值'));
        o.datatype = 'range(0,31)'; o.placeholder = '20';

        o = s.taboption('thresholds', form.Value, 'csq_good',
            _('CSQ 良好（≥）'), _('CSQ 大于等于此值'));
        o.datatype = 'range(0,31)'; o.placeholder = '14';

        o = s.taboption('thresholds', form.Value, 'csq_average',
            _('CSQ 一般（≥）'), _('CSQ 大于等于此值'));
        o.datatype = 'range(0,31)'; o.placeholder = '10';

        o = s.taboption('thresholds', form.DummyValue, '_phone_hdr', '');
        o.rawhtml = true;
        o.default = [
            '<h5 style="margin:16px 0 4px">Phone 灯</h5>',
            '<p style="color:#888;font-size:12px;margin:0 0 10px">',
            'Phone 灯只用于 USB 共享网络提示。检测到安卓/iPhone/随身 WiFi 等 USB 上网设备时点亮，设备移除或关闭此选项时熄灭。',
            '</p>'
        ].join('');

        o = s.taboption('thresholds', form.Flag, 'phone_usb_tether_enabled',
            _('启用 Phone 灯 USB 共享提示'), _('开启后，Phone 灯会随 USB 共享网络设备插拔自动亮灭。'));
        o.rmempty = false;
        o.default = '1';

        /* ══════════════════════════════════════════════════════════════════
         * TAB: LED Colors
         * ══════════════════════════════════════════════════════════════════ */
        function pickerRow(uciKey, label, desc, currentColor) {
            var swatches = COLORS.map(function(c) {
                var sel = c.id === currentColor
                    ? 'outline:3px solid #5e72e4;outline-offset:2px;transform:scale(1.18);z-index:1;'
                    : '';
                return '<span data-key="' + uciKey + '" data-color="' + c.id + '" title="' + c.label + '" ' +
                    'onclick="awLkPick(this)" ' +
                    'style="display:inline-block;width:30px;height:30px;border-radius:50%;cursor:pointer;' +
                    'background:' + c.hex + ';border:2px solid rgba(0,0,0,0.18);position:relative;' +
                    'transition:transform .12s,outline .12s;' + sel + '"></span>';
            }).join('');

            return '<tr><td style="padding:6px 14px 6px 0;white-space:nowrap;font-size:13px;vertical-align:middle">' +
                '<b>' + label + '</b>' +
                (desc ? '<br><span style="color:#999;font-size:11px">' + desc + '</span>' : '') +
                '</td><td style="padding:6px 0;vertical-align:middle">' +
                '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
                '<div id="aw1k-prev-' + uciKey + '" style="width:36px;height:36px;border-radius:8px;' +
                'flex-shrink:0;border:2px solid rgba(0,0,0,0.15);background:' + colorById(currentColor).hex + '"></div>' +
                '<div style="display:flex;gap:5px;flex-wrap:wrap">' + swatches + '</div>' +
                '<span id="aw1k-lbl-' + uciKey + '" style="font-size:13px;color:#888;min-width:52px">' +
                colorById(currentColor).label + '</span>' +
                '</div></td></tr>';
        }

        o = s.taboption('colors', form.DummyValue, '_colors_ui', '');
        o.rawhtml = true;

        o.cfgvalue = function(section_id) {
            var g = function(k, d) { return uci.get('ledstatus', section_id, k) || d; };

            var rows5g = [
                pickerRow('color_5g_excellent', '5G 极佳', 'SINR 达到极佳阈值', g('color_5g_excellent','green')),
                pickerRow('color_5g_good',      '5G 良好', 'SINR 达到良好阈值', g('color_5g_good','blue')),
                pickerRow('color_5g_average',   '5G 一般', 'SINR 达到一般阈值', g('color_5g_average','yellow')),
                pickerRow('color_5g_poor',      '5G 较差', 'SINR 低于一般阈值时闪烁', g('color_5g_poor','magenta')),
                pickerRow('color_5g_none',      '5G 无信号', '未检测到 NR5G 小区', g('color_5g_none','red'))
            ].join('');

            var rowsSig = [
                pickerRow('color_sig_excellent', '信号极佳', 'RSRP/CSQ 达到极佳阈值', g('color_sig_excellent','green')),
                pickerRow('color_sig_good',      '信号良好', 'RSRP/CSQ 达到良好阈值', g('color_sig_good','blue')),
                pickerRow('color_sig_average',   '信号一般', 'RSRP/CSQ 达到一般阈值', g('color_sig_average','yellow')),
                pickerRow('color_sig_weak',      '信号较弱', '低于一般阈值时闪烁', g('color_sig_weak','magenta')),
                pickerRow('color_sig_offline',   '信号离线', '移动网络未连接', g('color_sig_offline','red'))
            ].join('');

            return [
                '<div style="max-width:700px">',
                '<h5 style="margin:0 0 2px">5G SINR 指示灯颜色</h5>',
                '<p style="color:#888;font-size:12px;margin:0 0 10px">由 red:5g、green:5g、blue:5g 三个通道组合，可使用 8 种颜色。</p>',
                '<table style="border-collapse:collapse;width:100%">', rows5g, '</table>',
                '<h5 style="margin:16px 0 2px">信号强度指示灯颜色</h5>',
                '<p style="color:#888;font-size:12px;margin:0 0 10px">由 red:signal、green:signal、blue:signal 三个通道组合。</p>',
                '<table style="border-collapse:collapse;width:100%">', rowsSig, '</table>',
                '</div>'
            ].join('');
        };
        o.write = function() {};

        /* ══════════════════════════════════════════════════════════════════
         * TAB: Night Mode
         * ══════════════════════════════════════════════════════════════════ */
        o = s.taboption('nightmode', form.Value, 'night_start',
            _('开始时间'), _('夜间模式开始时间（HH:MM），例如 21:00'));
        o.placeholder = '21:00'; o.rmempty = false;
        o.validate = function(section_id, value) {
            if (!/^\d{1,2}:\d{2}$/.test(value)) return _('请使用 HH:MM 格式');
            var p = value.split(':');
            if (+p[0] > 23 || +p[1] > 59) return _('时间无效');
            return true;
        };

        o = s.taboption('nightmode', form.Value, 'night_end',
            _('结束时间'), _('夜间模式结束时间（HH:MM），例如 07:00'));
        o.placeholder = '07:00'; o.rmempty = false;
        o.validate = function(section_id, value) {
            if (!/^\d{1,2}:\d{2}$/.test(value)) return _('请使用 HH:MM 格式');
            var p = value.split(':');
            if (+p[0] > 23 || +p[1] > 59) return _('时间无效');
            return true;
        };

        o = s.taboption('nightmode', form.DummyValue, '_night_ctrl', _('夜间模式'));
        o.rawhtml = true;
        o.default = [
            '<button type="button" class="btn cbi-button cbi-button-action" id="aw1k-night-enable-btn">',
            _('启用夜间模式'), '</button>',
            '&nbsp;',
            '<button type="button" class="btn cbi-button cbi-button-negative" id="aw1k-night-disable-btn">',
            _('禁用夜间模式'), '</button>',
            '<span id="aw1k-night-status" style="margin-left:12px;font-size:13px"></span>'
        ].join('');

        o = s.taboption('nightmode', form.DummyValue, '_night_info', '');
        o.rawhtml = true;
        o.default = [
            '<div style="border:1px solid var(--border-color,#d8d8d8);border-radius:6px;padding:12px 16px;margin:8px 0 0;font-size:13px;color:var(--text-color,inherit)">',
            '<b style="color:var(--text-color,inherit)">' + _('夜间模式行为') + '</b><br>',
            '<ul style="margin:6px 0 0 16px;padding:0;color:var(--text-color,inherit)">',
            '<li>' + _('启用后会立即关闭所有状态灯，并写入每日定时任务') + '</li>',
            '<li>' + _('到达开始时间会自动进入夜间模式，到达结束时间会自动恢复') + '</li>',
            '<li>' + _('禁用后会清理定时任务，并恢复指示灯服务') + '</li>',
            '<li>' + _('夜间模式不接管 Phone 灯，Phone 灯仍用于 USB 共享网络插拔提示') + '</li>',
            '</ul></div>'
        ].join('');

        /* ════════════════════════════════════════════════════════════════════
         * RENDER + wire up interactive buttons
         * ════════════════════════════════════════════════════════════════════ */
        var callNightEnable = rpc.declare({
            object: 'luci.aw1k-led',
            method: 'night_enable',
            expect: { '': {} }
        });

        var callNightDisable = rpc.declare({
            object: 'luci.aw1k-led',
            method: 'night_disable',
            expect: { '': {} }
        });

        return m.render().then(function(node) {

            window.awLkPick = function(el) {
                var key = el.dataset.key;
                node.querySelectorAll('[data-key="' + key + '"]').forEach(function(sw) {
                    sw.style.outline = ''; sw.style.outlineOffset = ''; sw.style.transform = '';
                });
                el.style.outline = '3px solid #5e72e4'; el.style.outlineOffset = '2px'; el.style.transform = 'scale(1.18)';
                var hexMap   = { off:'#222222',red:'#ff3030',green:'#22dd44',blue:'#3399ff',yellow:'#ffdd00',cyan:'#00eedd',magenta:'#dd44ff',white:'#ffffff' };
                var labelMap = { off:'关闭',red:'红色',green:'绿色',blue:'蓝色',yellow:'黄色',cyan:'青色',magenta:'品红',white:'白色' };
                var p = node.querySelector('#aw1k-prev-' + key); if (p) p.style.background = hexMap[el.dataset.color] || '#888';
                var l = node.querySelector('#aw1k-lbl-'  + key); if (l) l.textContent = labelMap[el.dataset.color] || el.dataset.color;
            };

            /* ── Restart button ── */
            var restartBtn    = node.querySelector('#aw1k-restart-btn');
            var restartStatus = node.querySelector('#aw1k-restart-status');
            if (restartBtn) {
                restartBtn.addEventListener('click', function() {
                    restartBtn.disabled = true;
                    restartStatus.textContent = _('正在重启...');
                    restartStatus.style.color = '#888';
                    callInitAction('ledstatus', 'restart').then(function() {
                        restartStatus.textContent = _('重启成功。');
                        restartStatus.style.color = '#2dce89';
                    }).catch(function(e) {
                        restartStatus.textContent = _('错误：') + e.message;
                        restartStatus.style.color = '#f5365c';
                    }).finally(function() { restartBtn.disabled = false; });
                });
            }

            /* ── Night Mode buttons ── */
            var nightEnableBtn  = node.querySelector('#aw1k-night-enable-btn');
            var nightDisableBtn = node.querySelector('#aw1k-night-disable-btn');
            var nightStatus     = node.querySelector('#aw1k-night-status');

            function nightModeCall(rpcFn, successMsg) {
                nightEnableBtn.disabled  = true;
                nightDisableBtn.disabled = true;
                nightStatus.textContent  = _('请稍候...');
                nightStatus.style.color  = '#888';
                rpcFn().then(function() {
                    nightStatus.textContent = successMsg;
                    nightStatus.style.color = '#2dce89';
                }).catch(function(e) {
                    nightStatus.textContent = _('错误：') + (e.message || e);
                    nightStatus.style.color = '#f5365c';
                }).finally(function() {
                    nightEnableBtn.disabled  = false;
                    nightDisableBtn.disabled = false;
                });
            }

            if (nightEnableBtn)  nightEnableBtn.addEventListener('click',  function() { nightModeCall(callNightEnable,  _('夜间模式已启用，定时任务已设置。')); });
            if (nightDisableBtn) nightDisableBtn.addEventListener('click', function() { nightModeCall(callNightDisable, _('夜间模式已禁用，指示灯已恢复。')); });

            var signalBtn = node.querySelector('#aw1k-refresh-signal-btn');
            var signalBox = node.querySelector('#aw1k-signal-live');

            function renderSignalStatus(res) {
                var rows = [
                    ['AT 端口', res.port || '未知'],
                    ['当前制式', res.rat || '未知'],
                    ['SINR 信号质量', (res.sinr || '未知') + (res.sinr && res.sinr !== '未知' ? ' dB' : '') + ' / ' + (res.quality || '未知')],
                    ['RSRP 信号强度', (res.rsrp || '未知') + (res.rsrp && res.rsrp !== '未知' ? ' dBm' : '') + ' / ' + (res.strength || '未知')],
                    ['CSQ 回退值', res.csq_display || res.csq || '未知']
                ];
                var html = [
                    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:10px">'
                ];
                rows.forEach(function(row) {
                    html.push(
                        '<div style="border:1px solid var(--border-color,#ddd);border-radius:6px;padding:8px 10px">',
                        '<div style="font-size:12px;color:#888">', esc(row[0]), '</div>',
                        '<div style="font-size:15px;font-weight:600;color:var(--text-color,inherit)">', esc(row[1]), '</div>',
                        '</div>'
                    );
                });
                html.push('</div>');
                html.push(
                    '<details style="font-size:12px;color:#888">',
                    '<summary style="cursor:pointer">原始 AT 返回</summary>',
                    '<pre style="white-space:pre-wrap;word-break:break-word;margin:8px 0 0;padding:8px;border:1px solid var(--border-color,#ddd);border-radius:6px;color:var(--text-color,inherit)">',
                    'AT+QCSQ\n', esc(res.qcsq_raw || ''), '\n\n',
                    'AT+QENG="servingcell"\n', esc(res.qeng_raw || ''), '\n\n',
                    'AT+CSQ\n', esc(res.csq_raw || ''),
                    '</pre></details>'
                );
                signalBox.innerHTML = html.join('');
            }

            function refreshSignalStatus() {
                if (!signalBtn || !signalBox)
                    return;
                signalBtn.disabled = true;
                signalBox.innerHTML = '<span style="color:#888">正在读取模组 AT 状态...</span>';
                callSignalStatus().then(renderSignalStatus).catch(function(e) {
                    signalBox.innerHTML = '<span style="color:#f5365c">读取失败：' + esc(e.message || e) + '</span>';
                }).finally(function() {
                    signalBtn.disabled = false;
                });
            }

            if (signalBtn)
                signalBtn.addEventListener('click', refreshSignalStatus);
            refreshSignalStatus();

            return node;
        });
    },

    handleSave: function(ev) {
        /* Save color picker selections into UCI before the standard save */
        var COLOR_KEYS = [
            'color_5g_excellent','color_5g_good','color_5g_average','color_5g_poor','color_5g_none',
            'color_sig_excellent','color_sig_good','color_sig_average','color_sig_weak','color_sig_offline'
        ];
        COLOR_KEYS.forEach(function(k) {
            var sel = document.querySelector('[data-key="' + k + '"][style*="scale"]');
            if (sel) uci.set('ledstatus', 'settings', k, sel.dataset.color);
        });

        return view.prototype.handleSave.call(this, ev);
    },

    handleSaveApply: function(ev) {
        return this.handleSave(ev).then(function() {
            return ui.changes.apply();
        }).then(function() {
            return callInitAction('ledstatus', 'restart');
        });
    },

    handleReset: function(ev) {
        var DEFAULTS = {
            color_5g_excellent:  'green',
            color_5g_good:       'blue',
            color_5g_average:    'yellow',
            color_5g_poor:       'magenta',
            color_5g_none:       'red',
            color_sig_excellent: 'green',
            color_sig_good:      'blue',
            color_sig_average:   'yellow',
            color_sig_weak:      'magenta',
            color_sig_offline:   'red'
        };
        Object.keys(DEFAULTS).forEach(function(k) {
            uci.set('ledstatus', 'settings', k, DEFAULTS[k]);
        });
        return view.prototype.handleReset.call(this, ev);
    }
});
