import { useEffect, useRef, useState } from 'react';
import { Card, Button, Input, Space, App, message, Modal } from 'antd';
import { getRememberedCommandGroup, setRememberedCommandGroup, parseATISystemInfo } from '@/utils/atModule';
import { safeSendAT, resetGroupReady, getCurrentGroupAsync, ensureGroupReady } from '@/utils/atQueue';
import { useWebSocketConfig } from '@/contexts/WebSocketConfigContext';
import wsService from '@/services/websocket';
import { SendOutlined } from '@ant-design/icons';
import { useModel } from '@umijs/max';
import { useScrollReset } from '@/hooks/useScrollReset';

const BASE_CMDS = [
  { label: '查询信号强度', value: 'AT+CSQ' },
  { label: '查询IMEI', value: 'AT+CGSN' },
  { label: '查询版本', value: 'ATI' },
  { label: '查询SIM卡状态', value: 'AT+CPIN?' },
  { label: '查询网络注册', value: 'AT+CREG?' },
  { label: '查询网络时间', value: 'AT+CCLK?' },
];

const QUECTEL_CMDS = [
  ...BASE_CMDS,
  { label: '当前服务小区', value: 'AT+QENG="servingcell"' },
  { label: '邻区扫描', value: 'AT+QENG="neighbourcell";+QNWCFG="nr5g_meas_info",1;+QNWCFG="nr5g_meas_info"' },
  { label: '4G 邻区', value: 'AT+QENG="neighbourcell"' },
  { label: '查询网络模式', value: 'AT+QNWPREFCFG="mode_pref"' },
  { label: '查询搜网顺序', value: 'AT+QNWPREFCFG="rat_acq_order"' },
  { label: '仅 5G', value: 'AT+QNWPREFCFG="mode_pref",NR5G' },
  { label: '仅 4G', value: 'AT+QNWPREFCFG="mode_pref",LTE' },
  { label: '自动模式', value: 'AT+QNWPREFCFG="mode_pref",NR5G:LTE:WCDMA' },
  { label: '查询服务类型', value: 'AT+QNWPREFCFG="srv_domain"' },
  { label: '仅上网', value: 'AT+QNWPREFCFG="srv_domain",1' },
  { label: '查询漫游', value: 'AT+QNWPREFCFG="roam_pref"' },
  { label: '允许漫游', value: 'AT+QNWPREFCFG="roam_pref",255' },
  { label: '清除 5G 锁小区', value: 'AT+QNWLOCK="common/5g",0' },
  { label: '清除 4G 锁小区', value: 'AT+QNWLOCK="common/4g",0' },
  { label: '5G 锁小区示例 30kHz', value: 'AT+QNWLOCK="common/5g",264,504990,30,41' },
  { label: '5G 锁小区示例 15kHz', value: 'AT+QNWLOCK="common/5g",167,504990,15,41' },
  { label: '4G 锁小区示例', value: 'AT+QNWLOCK="common/4g",1,1350,359' },
  { label: '外置 SIM', value: 'AT+QUIMSLOT=1' },
  { label: '内置 SIM', value: 'AT+QUIMSLOT=2' },
  { label: '查询网卡驱动', value: 'AT+QETH="eth_driver"' },
  { label: '重启模组', value: 'AT+CFUN=1,1' },
];

const COMMON_CMDS: Record<string, { label: string; value: string }[]> = {
  Fibocom_AT: [
    ...BASE_CMDS,
    { label: '查询基站信息', value: 'AT+GTCCINFO?' },
  ],
  FM350_AT: [
    ...BASE_CMDS,
    { label: '查询基站信息', value: 'AT+GTCCINFO?' },
  ],
  Quectel_AT: QUECTEL_CMDS,
  RM520NCN_AT: QUECTEL_CMDS,
  RM520NGL_AT: QUECTEL_CMDS,
};

export default function ATDebug() {
  const { ip, port } = useWebSocketConfig();
  const { setInitialState } = useModel('@@initialState');
  const [cmd, setCmd] = useState('');
  const [log, setLog] = useState('');
  const [loading, setLoading] = useState(false);
  const [group, setGroup] = useState<string>(() => getRememberedCommandGroup(ip, port) || 'Fibocom_AT');
  const logRef = useRef<any>(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveCmd, setSaveCmd] = useState('');
  const [saveNote, setSaveNote] = useState('');
  const [savedCmds, setSavedCmds] = useState<{ cmd: string; note: string }[]>([]);
  const { message } = App.useApp();

  // 使用滚动重置Hook
  useScrollReset();

  // 加载本地保存命令
  useEffect(() => {
    const arr = localStorage.getItem('at_saved_cmds');
    if (arr) setSavedCmds(JSON.parse(arr));
  }, []);
  // 保存到本地
  const saveToLocal = (arr: { cmd: string; note: string }[]) => {
    setSavedCmds(arr);
    localStorage.setItem('at_saved_cmds', JSON.stringify(arr));
  };

  // 保存命令按钮
  const handleSaveCmd = () => {
    if (!cmd.trim()) {
      message.warning('请输入要保存的AT指令');
      return;
    }
    setSaveCmd(cmd);
    setSaveNote('');
    setSaveModalOpen(true);
  };
  const handleSaveModalOk = () => {
    if (!saveCmd.trim()) {
      message.warning('命令不能为空');
      return;
    }
    if (savedCmds.some(item => item.cmd.trim() === saveCmd.trim())) {
      setSaveModalOpen(false);
      setTimeout(() => {
        message.warning('该命令已存在');
      }, 200);
      return;
    }
    const arr = [...savedCmds, { cmd: saveCmd.trim(), note: saveNote.trim() }];
    saveToLocal(arr);
    setSaveModalOpen(false);
  };
  const handleSaveModalCancel = () => setSaveModalOpen(false);
  const handleDeleteSaved = (idx: number) => {
    const arr = savedCmds.slice();
    arr.splice(idx, 1);
    saveToLocal(arr);
  };
  const handleClickSaved = (item: { cmd: string; note: string }) => setCmd(item.cmd);

  // 主动连接WebSocket并检测命令族
  useEffect(() => {
    if (ip && port && wsService.getStatus() !== 'open') {
      wsService.connect(`ws://${ip}:${port}`);
    }
    const setTitle = async () => {
      await ensureGroupReady(ip, port);
      const atiRaw = await safeSendAT('ATI');
      const { model } = parseATISystemInfo(atiRaw);
      setInitialState((prev: any) => ({
        ...prev,
        dynamicTitle: model ? `${model}` : 'RG500Q-EA',
      }));
    };
    setTitle();
    return () => {
      // 这里没有副作用需要清理
    };
  }, [ip, port]);

  useEffect(() => {
    // 滚动到底部
    if (logRef.current && logRef.current.resizableTextArea && logRef.current.resizableTextArea.textArea) {
      logRef.current.resizableTextArea.textArea.scrollTop = logRef.current.resizableTextArea.textArea.scrollHeight;
    }
  }, [log]);

  useEffect(() => {
    // 检查并连接WebSocket
    const url = `ws://${ip}:${port}`;
    if (wsService.getStatus() !== 'open' && wsService.getStatus() !== 'connecting') {
      wsService.connect(url);
    }
  }, [ip, port]);

  const handleSend = async () => {
    if (!cmd.trim()) return;
    setLoading(true);
    setLog(l => l + (l ? '\n' : '') + '> ' + cmd);
    try {
      const resp = await safeSendAT(cmd);
      setLog(l => l + '\n' + resp.trim());
    } catch (e: any) {
      message.error('发送失败: ' + e);
      setLog(l => l + '\n[ERROR] ' + e);
    } finally {
      setLoading(false);
      setCmd(''); // 发送后清空输入框
    }
  };

  const handleCommonCmd = (value: string) => {
    setCmd(value);
  };

  const handleClearLog = () => setLog('');

  return (
    <Card className="my-card" title="AT调试终端" >
      <Input.TextArea
        ref={logRef}
        value={log}
        readOnly
        rows={14}
        className="custom-scrollbar"
        style={{ fontSize: 15, marginBottom: 16, background: 'var(--ant-color-fill-tertiary)', resize: 'vertical' }}
      />
      <div style={{ display: 'flex', width: '100%', marginBottom: 32, marginTop: 16 }}>
        <Input
          value={cmd}
          onChange={e => setCmd(e.target.value)}
          placeholder="输入AT指令"
          onPressEnter={e => { if (!e.shiftKey) { e.preventDefault(); handleSend(); } }}
          disabled={loading}
          style={{ flex: 1, minWidth: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
          allowClear
        />
        <Button
          type="primary"
          className="my-btn"
          icon={<SendOutlined />}
          onClick={handleSend}
          loading={loading}
          disabled={!cmd.trim()}
          style={{ borderRadius: 0 }}
        >发送</Button>
        <Button
          className="my-btn"
          onClick={() => { setLog(''); setCmd(''); }}
          disabled={loading}
          style={{ borderRadius: 0 }}
        >清空</Button>
        <Button
          className="my-btn"
          onClick={handleSaveCmd}
          disabled={loading}
          style={{ borderTopRightRadius: 4, borderBottomRightRadius: 4, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
        >保存命令</Button>
      </div>
      <div style={{ background: 'var(--ant-color-bg-container)', border: '1px solid var(--ant-color-fill-secondary)', borderRadius: 8, padding: '0px 12px 12px', marginBottom: 0 }}>
        <div style={{ fontWeight: 'bold', fontSize: 14, display: 'flex', alignItems: 'center', height: 36, lineHeight: '36px' }}>常用命令</div>
        <div style={{ borderBottom: '1px solid var(--ant-color-fill-secondary)', margin: '0 -12px 8px -12px' }} />
        <div>
          <Space wrap size={12}>
            {(COMMON_CMDS[group] || COMMON_CMDS['Fibocom_AT']).map(item => (
              <Button
                key={item.value}
                onClick={() => handleCommonCmd(item.value)}
                type="default"
                style={{
                  borderRadius: 5,
                  borderColor: 'var(--ant-color-border)',
                  background: 'var(--ant-color-bg-container)',
                  color: 'var(--ant-color-text)',
                  height: 32,
                  fontSize: 14,
                  boxShadow: 'none',
                  marginTop: 4,
                  padding: '0px 16px',
                  transition: 'border-color 0.2s, background 0.2s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--ant-color-primary)';
                  e.currentTarget.style.background = 'var(--ant-color-primary-bg)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--ant-color-border)';
                  e.currentTarget.style.background = 'var(--ant-color-bg-container)';
                }}
              >{item.label}</Button>
            ))}
          </Space>
        </div>
      </div>
      {/* 已保存命令部分 */}
      {savedCmds.length > 0 && (
        <div style={{ background: 'var(--ant-color-bg-container)', border: '1px solid var(--ant-color-fill-secondary)', borderRadius: 8, padding: '0px 12px 12px', margin: '24px 0 0 0' }}>
          <div style={{ fontWeight: 'bold', fontSize: 14, display: 'flex', alignItems: 'center', height: 36, lineHeight: '36px' }}>已保存的命令</div>
          <div style={{ borderBottom: '1px solid var(--ant-color-fill-secondary)', margin: '0 -12px 8px -12px' }} />
          <div>
            <Space wrap size={16}>
              {savedCmds.map((item, idx) => (
                <span key={item.cmd + idx} style={{ display: 'inline-flex', alignItems: 'center', marginTop: 4 }}>
                  <Button
                    type="default"
                    style={{
                      borderTopRightRadius: 0,
                      borderBottomRightRadius: 0,
                      borderColor: 'var(--ant-color-border)',
                      borderRight: '1px solid var(--ant-color-error)', // 默认红色
                      fontWeight: 400,
                      fontSize: 14,
                      color: 'var(--ant-color-text)',
                      background: 'var(--ant-color-bg-container)',
                      transition: 'border-color 0.2s',
                    }}
                    onClick={() => handleClickSaved(item)}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'var(--ant-color-primary)';
                      e.currentTarget.style.background = 'var(--ant-color-primary-bg)';
                      e.currentTarget.style.borderRight = '1px solid var(--ant-color-primary)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--ant-color-border)';
                      e.currentTarget.style.background = 'var(--ant-color-bg-container)';
                      e.currentTarget.style.borderRight = '1px solid var(--ant-color-error)';
                    }}
                  >
                    {item.note || item.cmd}
                  </Button>
                  <Button
                    type="default"
                    danger
                    size="middle"
                    style={{
                      borderTopLeftRadius: 0,
                      borderBottomLeftRadius: 0,
                      borderLeft: 0,
                      color: 'var(--ant-color-error)',
                      borderColor: 'var(--ant-color-error)',
                      background: 'var(--ant-color-bg-container)',
                      minWidth: 60,
                    }}
                    onClick={() => handleDeleteSaved(idx)}
                  >删除</Button>
                </span>
              ))}
            </Space>
          </div>
        </div>
      )}
      <div style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 14, marginTop: 24 }}>
        提示：输入AT指令后按回车键或点击发送按钮发送指令。使用清空按钮可以清除输入或日志。
      </div>
      {/* 保存命令弹窗 */}
      <Modal
        open={saveModalOpen}
        title={<span style={{ fontWeight: 600, fontSize: 18 }}>保存AT命令</span>}
        onCancel={handleSaveModalCancel}
        onOk={handleSaveModalOk}
        okText="确定"
        cancelText="取消"
        styles={{
          footer: {
            textAlign: 'right'
          }
        }}
        okButtonProps={{
          className: 'my-btn',
          type: 'primary'
        }}
        cancelButtonProps={{
          className: 'my-btn'
        }}
      >
        <Input
          value={saveCmd}
          onChange={e => setSaveCmd(e.target.value)}
          style={{ marginBottom: 16, fontSize: 16 }}
          placeholder="AT命令"
        />
        <Input
          value={saveNote}
          onChange={e => setSaveNote(e.target.value)}
          style={{ fontSize: 15 }}
          placeholder="请输入命令备注"
        />
      </Modal>
    </Card>
  );
}
