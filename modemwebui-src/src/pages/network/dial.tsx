import { useEffect, useState } from 'react';
import { Card, Input, Button, Select, Switch, Row, Col, Alert, Descriptions, Tag, Tooltip, Table, Space, Form, Modal, App } from 'antd';
import { PlusOutlined, ExclamationCircleOutlined, InfoCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { getAutoDialStatusCmd, setAutoDialCmd, parseAutoDialStatus, getApnCmd, setApnCmd, parseApn } from '@/utils/atModule';
import { getRememberedCommandGroup, setRememberedCommandGroup, parseATISystemInfo } from '@/utils/atModule';
import wsService from '@/services/websocket';
import { useWebSocketConfig } from '@/contexts/WebSocketConfigContext';
import { safeSendAT, resetGroupReady, getCurrentGroupAsync, ensureGroupReady } from '@/utils/atQueue';
import { Row as AntdRow } from 'antd';
import { InfoCircleFilled } from '@ant-design/icons';
import { getDialModeCmd, setDialModeCmd, parseDialMode, getDialModeOptions } from '@/utils/atModule';
import { getUsbModeCmd, setUsbModeCmd, parseUsbMode, getUsbModeOptions } from '@/utils/atModule';
import { getPdpListCmd, getPdpActiveCmd, setPdpCmd, deletePdpCmd, activatePdpCmd, deactivatePdpCmd, parsePdpList, parsePdpActive } from '@/utils/atModule';
import { useModel } from '@umijs/max';
import { getPdpAuthCmd, setPdpAuthCmd, parsePdpAuth } from '@/utils/atModule';
import { useScrollReset } from '@/hooks/useScrollReset';

const AUTH_OPTIONS = [
  { label: '无认证', value: 'none' },
  { label: 'PAP认证', value: 'pap' },
  { label: 'CHAP认证', value: 'chap' },
];

export default function DialPage() {
  const { ip, port } = useWebSocketConfig();
  const { setInitialState } = useModel('@@initialState');
  const [group, setGroup] = useState('Quectel_AT');
  const { message } = App.useApp();

  // 使用滚动重置Hook
  useScrollReset();

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

  return (
    <Row gutter={[16, 16]} align="stretch">
      <Col xs={24} md={24}>
        <DialCard />
      </Col>
      <Col xs={24} md={12}>
        <DialModeCard />
      </Col>
      <Col xs={24} md={12}>
        <UsbModeCard />
      </Col>
      <Col xs={24} md={24}>
        <PDPContextCard />
      </Col>
    </Row>
  );
}

function DialCard() {
  const pdpTypeMap: { [key: string]: string } = {
    IP: 'IPv4',
    IPV6: 'IPv6',
    IPV4V6: 'IPv4/IPv6',
  };
  const { ip, port } = useWebSocketConfig();
  const [autoDial, setAutoDial] = useState(false);
  const [autoDialLoading, setAutoDialLoading] = useState(false);
  const [apn, setApn] = useState('');
  const [apnStatus, setApnStatus] = useState('未设置');
  const [apnLoading, setApnLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authType, setAuthType] = useState('none');
  const [saving, setSaving] = useState(false);
  const [pdpType, setPdpType] = useState('');
  const { message } = App.useApp();

  // 查询自动拨号和APN
  const fetchStatus = async () => {
    setAutoDialLoading(true);
    setApnLoading(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const resp = await safeSendAT(getAutoDialStatusCmd(realGroup));
      setAutoDial(parseAutoDialStatus(resp, realGroup));
    } catch { setAutoDial(false); }
    setAutoDialLoading(false);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const resp = await safeSendAT(getApnCmd(realGroup));
      const parsed = parseApn(resp, realGroup);
      setApn(parsed.apn);
      setApnStatus(parsed.apn ? '已设置' : '未设置');
      setPdpType(parsed.pdpType || '');
    } catch { setApn(''); setApnStatus('未设置'); setPdpType(''); }
    setApnLoading(false);
    // 查询用户名、密码、认证方式
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const resp = await safeSendAT(getPdpAuthCmd(realGroup, 1));
      const parsed = parsePdpAuth(resp, realGroup);
      setUsername(parsed.username);
      setPassword(parsed.password);
      setAuthType(parsed.authType === 1 ? 'pap' : parsed.authType === 2 ? 'chap' : 'none');
    } catch { setUsername(''); setPassword(''); setAuthType('none'); }
  };

  useEffect(() => {
    let cancel = false;
    const doQuery = () => { if (!cancel) fetchStatus(); };
    if (wsService.getStatus && wsService.getStatus() === 'open') {
      doQuery();
    } else {
      wsService.addOnOpenCallback(doQuery);
    }
    return () => {
      cancel = true;
      wsService.removeOnOpenCallback(doQuery);
    };
  }, [ip, port]);

  // 保存
  const handleSave = async () => {
    setSaving(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const cmds = setAutoDialCmd(realGroup, autoDial);
      for (const cmd of cmds) {
        await safeSendAT(cmd);
      }
      await safeSendAT(setApnCmd(realGroup, apn));
      // 新增：保存用户名、密码、认证方式
      const authTypeNum = authType === 'pap' ? 1 : authType === 'chap' ? 2 : 0;
      await safeSendAT(setPdpAuthCmd(realGroup, 1, authTypeNum, username, password));
      message.success('APN设置已保存');
      fetchStatus();
    } catch (e) {
      message.error('保存失败: ' + e);
    } finally {
      setSaving(false);
    }
  };

  // 自动拨号开关切换立即生效
  const handleAutoDialChange = async (checked: boolean) => {
    setAutoDialLoading(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const cmds = setAutoDialCmd(realGroup, checked);
      for (const cmd of cmds) {
        await safeSendAT(cmd);
      }
      setAutoDial(checked);
      message.success(`自动拨号已${checked ? '开启' : '关闭'}`);
    } catch (e) {
      setAutoDial(prev => !checked); // 回滚
      message.error('切换自动拨号失败: ' + e);
    } finally {
      setAutoDialLoading(false);
    }
  };

  return (
    <Card
      title={
        <AntdRow align="middle" justify="space-between">
          <span style={{ display: 'flex', alignItems: 'center', fontSize: 16 }}>
            自动拨号
            <Tooltip title="开启后设备将自动保持网络连接，建议保持开启状态">
              <InfoCircleOutlined style={{ color: 'var(--ant-color-primary)', marginLeft: 6, fontSize: 16, verticalAlign: 'middle', cursor: 'pointer' }} />
            </Tooltip>
          </span>
          <Switch checked={autoDial} loading={autoDialLoading} onChange={handleAutoDialChange} />
        </AntdRow>
      }
      className="my-card"
    >
      <Descriptions
        bordered column={2}
        styles={{
          label: { width: '26%' },
          content: { fontSize: 14 }
        }}>
        <Descriptions.Item label={<span style={{}}>拨号状态</span>}>
          <Tag color={autoDial ? 'green' : 'orange'} style={{ fontSize: 12, padding: '0 6px' }}>{autoDial ? '已开启' : '已关闭'}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label={<span style={{}}>协议类型</span>}>
          {pdpTypeMap[pdpType] || pdpType || '-'}
        </Descriptions.Item>
      </Descriptions>
      <Descriptions
        bordered column={1}
        styles={{
          label: { width: '30%' },
          content: { fontSize: 14 }
        }}
        style={{ borderTop: 0, marginTop: 16 }}>
        <Descriptions.Item label={<span style={{}}>APN</span>}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Tag
              color={apnStatus === '已设置' ? 'green' : '#d9d9d9'}
              style={{
                marginRight: 8,
                borderRadius: 4,
                fontSize: 12,
                padding: '0 16px',
                border: apnStatus === '已设置' ? '1px solid var(--ant-color-success)' : '1px solid var(--ant-color-fill-tertiary)',
                background: apnStatus === '已设置' ? 'var(--ant-color-success-bg)' : 'var(--ant-color-fill-tertiary)',
                color: apnStatus === '已设置' ? 'var(--ant-color-success)' : 'var(--ant-color-text)',
              }}
            >
              {apnStatus}
            </Tag>
            <Input value={apn} onChange={e => setApn(e.target.value)} placeholder="请输入APN" style={{ width: '100%', marginLeft: 8 }} />
          </div>
        </Descriptions.Item>
        <Descriptions.Item label={<span style={{}}>用户名</span>}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Tag
              color={username ? 'green' : '#d9d9d9'}
              style={{
                marginRight: 8,
                borderRadius: 4,
                fontSize: 12,
                padding: '0 16px',
                border: username ? '1px solid var(--ant-color-success)' : '1px solid var(--ant-color-fill-tertiary)',
                background: username ? 'var(--ant-color-success-bg)' : 'var(--ant-color-fill-tertiary)',
                color: username ? 'var(--ant-color-success)' : 'var(--ant-color-text)',
              }}
            >
              {username ? '已设置' : '未设置'}
            </Tag>
            <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="请输入用户名（可选）" style={{ width: '100%', marginLeft: 8 }} />
          </div>
        </Descriptions.Item>
        <Descriptions.Item label={<span style={{}}>密码</span>}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Tag
              color={password ? 'green' : '#d9d9d9'}
              style={{
                marginRight: 8,
                borderRadius: 4,
                fontSize: 12,
                padding: '0 16px',
                border: password ? '1px solid var(--ant-color-success)' : '1px solid var(--ant-color-fill-tertiary)',
                background: password ? 'var(--ant-color-success-bg)' : 'var(--ant-color-fill-tertiary)',
                color: password ? 'var(--ant-color-success)' : 'var(--ant-color-text)',
              }}
            >
              {password ? '已设置' : '未设置'}
            </Tag>
            <Input.Password value={password} onChange={e => setPassword(e.target.value)} placeholder="请输入密码（可选）" style={{ width: '100%', marginLeft: 8 }} />
          </div>
        </Descriptions.Item>
        <Descriptions.Item label={<span style={{}}>认证方式</span>}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Tag
              color={authType !== 'none' ? 'green' : '#d9d9d9'}
              style={{
                marginRight: 8,
                borderRadius: 4,
                fontSize: 12,
                padding: '0 16px',
                border: authType !== 'none' ? '1px solid var(--ant-color-success)' : '1px solid var(--ant-color-fill-tertiary)',
                background: authType !== 'none' ? 'var(--ant-color-success-bg)' : 'var(--ant-color-fill-tertiary)',
                color: authType !== 'none' ? 'var(--ant-color-success)' : 'var(--ant-color-text)',
              }}
            >
              {authType !== 'none' ? '已设置' : '无认证'}
            </Tag>
            <Select value={authType} onChange={setAuthType} options={AUTH_OPTIONS} style={{ width: '100%', marginLeft: 8 }} />
          </div>
        </Descriptions.Item>
      </Descriptions>
      {/* 注意事项自定义提示 */}
      <div
        style={{
          background: 'var(--ant-color-info-bg)',
          border: '1px solid var(--ant-color-primary-border)',
          borderRadius: 8,
          padding: '16px 16px 4px 16px',
          margin: '24px 0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              minWidth: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="16" fill="#1886FF" />
              <rect x="14.25" y="8.5" width="3.5" height="3.5" rx="1.75" fill="#fff" />
              <rect x="14.25" y="13" width="3.5" height="12" rx="1.75" fill="#fff" />
            </svg>
          </div>
          <span style={{ fontSize: 16, marginLeft: 10 }}>注意事项</span>
        </div>
        <ul style={{
          marginLeft: 40,
          paddingLeft: 18,
          listStyleType: 'disc',
          color: 'var(--ant-color-text)',
        }}>
          <li>APN 设置将影响设备的网络连接方式</li>
          <li>如无特殊要求，认证方式请保持“无认证”</li>
          <li>修改 APN 设置后可能需要重新进行网络连接</li>
        </ul>
      </div>
      <Button
        type="primary"
        block
        className="my-btn"
        loading={saving}
        onClick={handleSave}
      >保存APN设置</Button>
    </Card>
  );
}

function DialModeCard() {
  const [mode, setMode] = useState<number>(0);
  const { ip, port } = useWebSocketConfig();
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<number | null>(null);
  const [modeOptions, setModeOptions] = useState<{ label: string; value: number }[]>([]);
  const { message } = App.useApp();

  // 根据值获取对应的标签
  const getModeLabel = (value: number) => {
    const option = modeOptions.find(opt => opt.value === value);
    return option ? option.label : '未知模式';
  };

  // 加载拨号模式选项
  useEffect(() => {
    const loadOptions = async () => {
      try {
        await ensureGroupReady(ip, port);
        const realGroup = await getCurrentGroupAsync(ip, port);
        const options = getDialModeOptions(realGroup);
        setModeOptions(options);
      } catch (e) {
        console.error('加载拨号模式选项失败:', e);
        // 设置默认选项
        setModeOptions([
          { label: 'USB模式', value: 0 },
          { label: '转网口模式', value: 1 }
        ]);
      }
    };

    if (wsService.getStatus && wsService.getStatus() === 'open') {
      loadOptions();
    } else {
      wsService.addOnOpenCallback(loadOptions);
    }
  }, [ip, port]);

  // 查询当前模式
  useEffect(() => {
    let cancel = false;
    const doQuery = async () => {
      setLoading(true);
      try {
        await ensureGroupReady(ip, port);
        const realGroup = await getCurrentGroupAsync(ip, port);
        const cmds = getDialModeCmd(realGroup);
        let result = '';
        for (const cmd of cmds) {
          if (cancel) return;
          const resp = await safeSendAT(cmd);
          result += resp + '\n';
        }
        const parsed = parseDialMode(result, realGroup);
        if (parsed) setMode(parsed);
      } catch { }
      setLoading(false);
    };
    if (wsService.getStatus && wsService.getStatus() === 'open') {
      doQuery();
    } else {
      wsService.addOnOpenCallback(doQuery);
    }
    return () => {
      cancel = true;
      wsService.removeOnOpenCallback(doQuery);
    };
  }, [ip, port]);
  // 选择切换
  const handleChange = (val: number) => {
    setPendingMode(val);
    setModalOpen(true);
  };
  // 确认切换
  const handleConfirm = async () => {
    if (pendingMode === null || pendingMode === mode) { setModalOpen(false); return; }
    setLoading(true);
    setModalOpen(false);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const cmds = setDialModeCmd(realGroup, pendingMode);
      for (const cmd of cmds) {
        await safeSendAT(cmd);
      }
      setMode(pendingMode);
      message.success('拨号方式已切换');
    } catch (e) {
      message.error('切换失败: ' + e);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Card className="my-card" title={<span>拨号方式设置 <Tooltip title="USB模式适用于通过USB接口进行网络连接的场景，转网口模式适用于转网口进行网络连接的场景"><InfoCircleOutlined style={{ color: 'var(--ant-color-primary)', marginLeft: 6 }} /></Tooltip></span>} >
      <div style={{ borderRadius: 8, overflow: 'hidden' }}>
        <Descriptions bordered column={1}
          styles={{
            label: { width: '30%' },
            content: { fontSize: 14 }
          }}>
          <Descriptions.Item label={<span style={{}}>拨号方式</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <Tag color="blue" style={{ marginBottom: 8 }}>
                {getModeLabel(mode)}
              </Tag>
              <Select
                value={mode}
                options={modeOptions}
                style={{ width: '100%' }}
                onChange={handleChange}
                loading={loading}
                disabled={loading}
              />
            </div>
          </Descriptions.Item>
        </Descriptions>
      </div>
      <Modal
        open={modalOpen}
        title={<span style={{ fontWeight: 600, fontSize: 16 }}>修改拨号方式</span>}
        onCancel={() => setModalOpen(false)}
        onOk={handleConfirm}
        okText="确认修改"
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
        confirmLoading={loading}
      >
        <div style={{ background: 'var(--ant-color-warning-bg)', border: '1px solid var(--ant-color-warning-border)', color: 'var(--ant-color-warning)', borderRadius: 4, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 500, fontSize: 16, marginBottom: 8 }}><InfoCircleOutlined style={{ color: 'var(--ant-color-warning)', marginRight: 8 }} />确认修改拨号方式?</div>
          <div style={{ marginBottom: 8 }}>当前拨号方式: {getModeLabel(mode)}</div>
          <div style={{ marginBottom: 8 }}>修改为: {pendingMode !== null ? getModeLabel(pendingMode) : '未知模式'}</div>
          <div style={{ fontWeight: 500, margin: '8px 0 4px 0' }}>请注意：</div>
          <ul style={{ margin: 0, paddingLeft: 20, listStyleType: 'disc' }}>
            <li>修改拨号方式后，需要重新开启自动拨号才能生效</li>
            <li>修改过程中可能会导致网络连接临时中断</li>
          </ul>
        </div>
      </Modal>
    </Card>
  );
}

// 新增 UsbModeCard 组件
function UsbModeCard() {
  const { ip, port } = useWebSocketConfig();
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<number | null>(null);
  const [currentMode, setCurrentMode] = useState<number | null>(null);
  const { message } = App.useApp();
  const [modeOptions, setModeOptions] = useState<{ label: string; value: number }[]>([]);

  useEffect(() => {
    const fetchOptions = async () => {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      setModeOptions(getUsbModeOptions(realGroup));
    };
    fetchOptions();
    return () => {
      // 这里没有副作用需要清理
    };
  }, [ip, port]);

  // 查询当前模式
  useEffect(() => {
    let cancel = false;
    const fetchMode = async () => {
      setLoading(true);
      try {
        await ensureGroupReady(ip, port);
        const realGroup = await getCurrentGroupAsync(ip, port);
        const cmd = getUsbModeCmd(realGroup);
        const resp = await safeSendAT(cmd);
        const mode = parseUsbMode(resp, realGroup);
        if (mode !== undefined) setCurrentMode(mode);
      } catch { }
      setLoading(false);
    };
    if (wsService.getStatus && wsService.getStatus() === 'open') {
      fetchMode();
    } else {
      wsService.addOnOpenCallback(fetchMode);
    }
    return () => {
      cancel = true;
      wsService.removeOnOpenCallback(fetchMode);
    };
  }, [ip, port]);

  // 切换
  const handleChange = (val: number) => {
    setPendingMode(val);
    setModalOpen(true);
  };
  // 确认切换
  const handleConfirm = async () => {
    if (pendingMode == null || pendingMode === currentMode) { setModalOpen(false); return; }
    setLoading(true);
    setModalOpen(false);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const cmd = setUsbModeCmd(realGroup, pendingMode);
      await safeSendAT(cmd);
      setCurrentMode(pendingMode);
      message.success('USB端口模式已切换');
    } catch (e) {
      message.error('切换失败: ' + e);
    } finally {
      setLoading(false);
    }
  };
  // 当前模式名称
  const currentLabel = modeOptions.find(opt => opt.value === currentMode)?.label || '未知模式';

  return (
    <Card className="my-card" title={<span>USB端口模式 <Tooltip title="不同模式适用于不同操作系统和驱动，切换后需重启设备或重新插拔USB"><InfoCircleOutlined style={{ color: 'var(--ant-color-primary)', marginLeft: 6 }} /></Tooltip></span>}>
      <div style={{ borderRadius: 8 }}>
        <Descriptions
          bordered column={1}
          styles={{
            label: { width: '30%' },
            content: { fontSize: 14 }
          }}>
          <Descriptions.Item label={<span style={{}}>当前模式</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <Tag color="blue" style={{ marginBottom: 8 }}>{currentLabel}</Tag>
              <Select
                value={currentMode}
                options={modeOptions}
                style={{ width: '100%' }}
                onChange={handleChange}
                loading={loading}
                disabled={loading}
                placeholder="请选择USB端口模式"
              />
            </div>
          </Descriptions.Item>
        </Descriptions>
      </div>
      <Modal
        open={modalOpen}
        title={<span style={{ fontWeight: 600, fontSize: 16 }}>修改USB端口模式</span>}
        onCancel={() => setModalOpen(false)}
        onOk={handleConfirm}
        okText="确认修改"
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
        confirmLoading={loading}
      >
        <div style={{ background: 'var(--ant-color-warning-bg)', border: '1px solid var(--ant-color-warning-border)', color: 'var(--ant-color-warning)', borderRadius: 4, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 500, fontSize: 16, marginBottom: 8 }}><InfoCircleOutlined style={{ color: 'var(--ant-color-warning)', marginRight: 8 }} />确认修改USB端口模式?</div>
          <div style={{ marginBottom: 8 }}>当前模式: {currentLabel}</div>
          <div style={{ marginBottom: 8 }}>修改为: {modeOptions.find(opt => opt.value === pendingMode)?.label || ''}</div>
          <div style={{ fontWeight: 500, margin: '8px 0 4px 0' }}>请注意：</div>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>切换后需重启设备或重新插拔USB接口</li>
            <li>部分模式可能需要安装对应驱动</li>
          </ul>
        </div>
      </Modal>
    </Card>
  );
}

// 新增 PDPContextCard 组件
function PDPContextCard() {
  const { ip, port } = useWebSocketConfig();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [activeMap, setActiveMap] = useState<Record<number, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form] = Form.useForm();
  const [lastQuery, setLastQuery] = useState<string>('');
  const { message } = App.useApp();

  const pdpTypeOptions = [
    { label: 'IPv4', value: 'IP' },
    { label: 'IPv6', value: 'IPV6' },
    { label: 'IPv4/IPv6', value: 'IPV4V6' },
  ];

  // PDP数据压缩和头压缩选项及说明
  const dataCompOptions = [
    { label: '禁用', value: 0 },
    { label: 'V.42bis', value: 1 },
    { label: 'V.44', value: 2 },
  ];
  const dataCompTip = '0: 禁用, 1: V.42bis, 2: V.44';
  const headCompOptions = [
    { label: '禁用', value: 0 },
    { label: 'RFC1144', value: 1 },
    { label: 'RFC2507', value: 2 },
    { label: 'RFC3095', value: 3 },
  ];
  const headCompTip = '0: 禁用, 1: RFC1144, 2: RFC2507, 3: RFC3095';

  // 协议类型中英文映射
  const pdpTypeMap: { [key: string]: string } = {
    IP: 'IPv4',
    IPV6: 'IPv6',
    IPV4V6: 'IPv4/IPv6',
  };

  // 查询PDP列表和激活状态
  const fetchData = async () => {
    setLoading(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const listCmd = getPdpListCmd(realGroup);
      const activeCmd = getPdpActiveCmd(realGroup);
      const listResp = await safeSendAT(listCmd);
      const activeResp = await safeSendAT(activeCmd);
      const pdpList = parsePdpList(listResp, realGroup);
      const active = parsePdpActive(activeResp, realGroup);
      setData(pdpList);
      setActiveMap(active);
      setLastQuery(new Date().toLocaleTimeString());
    } catch (e) {
      message.error('查询失败: ' + e);
    }
    setLoading(false);
  };

  useEffect(() => {
    let cancel = false;
    const doQuery = () => { if (!cancel) fetchData(); };
    if (wsService.getStatus && wsService.getStatus() === 'open') {
      doQuery();
    } else {
      wsService.addOnOpenCallback(doQuery);
    }
    return () => {
      cancel = true;
      wsService.removeOnOpenCallback(doQuery);
    };
  }, [ip, port]);

  // 编辑/新增弹窗
  const openEdit = (record?: any) => {
    setEditing(record || { cid: '', type: 'IPV4V6', apn: '', addr: '', dataComp: undefined, headComp: undefined });
    setModalOpen(true);
    setTimeout(() => {
      form.setFieldsValue(record || { cid: '', type: 'IPV4V6', apn: '', addr: '', dataComp: undefined, headComp: undefined });
    }, 0);
  };
  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    form.resetFields();
  };
  // 提交
  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const cmd = setPdpCmd(realGroup, values);
      await safeSendAT(cmd);
      message.success('操作成功');
      closeModal();
      fetchData();
    } catch (e) {
      message.error('操作失败: ' + e);
    }
  };
  // 删除
  const handleDelete = (cid: number) => {
    Modal.confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: `确定要删除 CID=${cid} 的 PDP 上下文吗？`,
      onOk: async () => {
        try {
          await ensureGroupReady(ip, port);
          const realGroup = await getCurrentGroupAsync(ip, port);
          const cmd = deletePdpCmd(realGroup, cid);
          await safeSendAT(cmd);
          message.success('删除成功');
          fetchData();
        } catch (e) {
          message.error('删除失败: ' + e);
        }
      },
    });
  };
  // 激活/去激活
  const handleActivate = async (cid: number, active: boolean) => {
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const cmd = active ? deactivatePdpCmd(realGroup, cid) : activatePdpCmd(realGroup, cid);
      await safeSendAT(cmd);
      message.success(active ? '去激活成功' : '激活成功');
      fetchData();
    } catch (e) {
      message.error('操作失败: ' + e);
    }
  };

  const columns = [
    { title: 'CID', dataIndex: 'cid', key: 'cid', width: 60 },
    { title: '协议类型', dataIndex: 'type', key: 'type', width: 120, render: (v: string) => pdpTypeMap[v] || v },
    { title: 'APN', dataIndex: 'apn', key: 'apn', width: 120, render: (v: string) => v || '-' },
    { title: '状态', key: 'status', width: 100, render: (_: any, r: any) => <Tag color={activeMap[r.cid] ? 'green' : ''}>{activeMap[r.cid] ? '已激活' : '未激活'}</Tag> },
    {
      title: '操作', key: 'action', width: 180, render: (_: any, r: any) => (
        <Space>
          <a style={{ marginRight: 16 }} onClick={() => openEdit(r)}>编辑</a>
          <a style={{ color: 'red', marginRight: 16 }} onClick={() => handleDelete(r.cid)}>删除</a>
          <a onClick={() => handleActivate(r.cid, !!activeMap[r.cid])}>{activeMap[r.cid] ? '去激活' : '激活'}</a>
        </Space>
      )
    },
  ];

  return (
    <Card className="my-card"
      title={<span>PDP 上下文管理 <Tooltip title="PDP上下文用于配置APN等参数，通常无需频繁更改"><InfoCircleOutlined style={{ color: 'var(--ant-color-primary)', marginLeft: 6 }} /></Tooltip></span>}
      extra={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
          <span style={{ color: 'var(--ant-color-text-secondary)' }}>上次查询: {lastQuery}</span>
          <Button className="my-btn" type="primary" icon={<ReloadOutlined />} size="small" onClick={fetchData}>
            刷新状态
          </Button>
        </div>
      }
    >
      <Table
        rowKey="cid"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={false}
        style={{ marginBottom: 16 }}
      />
      <Button className="my-btn" type="primary" icon={<PlusOutlined />} onClick={() => openEdit()} style={{ marginTop: 8 }}>添加 PDP 上下文</Button>
      <Modal
        open={modalOpen}
        title={<span style={{ fontWeight: 600, fontSize: 18 }}>编辑 PDP 上下文{editing && editing.cid !== '' ? ` (CID: ${editing.cid})` : ''}</span>}
        onCancel={closeModal}
        onOk={handleOk}
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
        destroyOnHidden
      >
        <Alert type="info" showIcon style={{ marginTop: 16, marginBottom: 16 }} message={<div><b>提示</b><br />CID 和协议类型为必填项，APN 和其他项为可选项。如无特殊需求，APN 可不填，设备将使用默认值。</div>} />
        <Form form={form} layout="vertical" initialValues={editing || {}} preserve={false}>
          <Form.Item label="CID" name="cid" rules={[{ required: true, message: '请输入CID' }]}>
            <Input disabled={!!editing && editing.cid !== ''} />
          </Form.Item>
          <Form.Item label="协议类型" name="type" rules={[{ required: true, message: '请选择协议类型' }]}>
            <Select options={pdpTypeOptions} />
          </Form.Item>
          <Form.Item label="APN" name="apn">
            <Input placeholder="可选" />
          </Form.Item>
          <Form.Item label="PDP 地址" name="addr">
            <Input placeholder="PDP 地址（可选）" />
          </Form.Item>
          {/* 数据压缩和头压缩同一行 */}
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label={<span>数据压缩 <Tooltip title={dataCompTip}><InfoCircleOutlined style={{ marginLeft: 4 }} /></Tooltip></span>} name="dataComp">
                <Select allowClear options={dataCompOptions} placeholder="可选" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={<span>头压缩 <Tooltip title={headCompTip}><InfoCircleOutlined style={{ marginLeft: 4 }} /></Tooltip></span>} name="headComp">
                <Select allowClear options={headCompOptions} placeholder="可选" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Card>
  );
}
