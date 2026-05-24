import { useEffect, useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import { useWebSocketConfig } from '@/contexts/WebSocketConfigContext';
import { Card, Row, Col, Input, Button, Typography, Space, Descriptions, Switch, Tabs, Select, Modal, App, message } from 'antd';
import { EditOutlined, ReloadOutlined } from '@ant-design/icons';
import wsService from '@/services/websocket';
import {
  getSimSlotCmd, setSimSlotCmd, parseSimSlot,
  getHotSwapCmd, setHotSwapCmd, parseHotSwap,
  getAirplaneCmd, setAirplaneCmd, parseAirplane,
  getPinStatusCmd, setPinEnableCmd, setPinDisableCmd, parsePinStatus,
  parseATISystemInfo,
  getEthDriverCmd, setEthDriverCmd, parseEthDriverList, getPerfModeCmd, setPerfModeCmd, parsePerfMode, getResetFactoryCmd, getRebootCmd,
  getDmzStatusCmd, setDmzIpv4Cmd, disableDmzIpv4Cmd, parseDmzStatus, setDmzIpv6Cmd, disableDmzIpv6Cmd,
  setImeiCmd,
  getSystemInfoCmds, parseSystemInfoMulti
} from '@/utils/atModule';
import { modelToCommandGroup, SystemInfo, getRememberedCommandGroup, setRememberedCommandGroup } from '@/utils/atModule';
import { safeSendAT, resetGroupReady, getCurrentGroupAsync, ensureGroupReady } from '@/utils/atQueue';
import { useModel } from '@umijs/max';
import { useScrollReset } from '@/hooks/useScrollReset';

const { Text, Link } = Typography;

const WebSocketComponent = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const { ip, port } = useWebSocketConfig();

  useEffect(() => {
    if (ip && port && wsService.getStatus() !== 'open') {
      wsService.connect(`ws://${ip}:${port}`);
    }
  }, [ip, port]);

  return (
    <Card title="串口日志">
      <pre style={{ maxHeight: 400, overflow: 'auto', margin: 0 }}>
        {logs.join('\n')}
      </pre>
    </Card>
  );
};

export default () => {
  const { ip, port } = useWebSocketConfig();
  const { setInitialState } = useModel('@@initialState');

  // 使用滚动重置Hook
  useScrollReset();

  const [imei, setImei] = useState('');

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
  }, [ip, port]);

  return (
    <Row gutter={[16, 16]} align="stretch">
      <Col xs={24} md={12}>
        <ATServerConfig />
      </Col>
      <Col xs={24} md={12}>
        <SystemInfoCard onInfoChange={info => setImei(info.imei || '')} />
      </Col>
      <Col xs={24} md={12}>
        <ImeiEditCard imei={imei} />
      </Col>
      <Col xs={24} md={12}>
        <SimCardConfigCard />
      </Col>
      <Col xs={24} md={12}>
        <DeviceControlCard />
      </Col>
    </Row>
  );
};

const ATServerConfig = () => {
  const { ip, port, setConfig, isConfigLocked, swapTrafficStats, setSwapTrafficStats } = useWebSocketConfig();
  const [inputIp, setInputIp] = useState(ip);
  const [inputPort, setInputPort] = useState(port);
  const { message, modal } = App.useApp();

  // 关键：同步 context 变化到输入框
  useEffect(() => {
    setInputIp(ip);
    setInputPort(port);
  }, [ip, port]);

  return (
    <Card
      title="AT服务器配置"
      className="my-card"
      extra={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, color: 'var(--ant-color-text-secondary)' }}>上下行反转</span>
          <Switch
            checked={swapTrafficStats}
            onChange={(checked) => {
              setSwapTrafficStats(checked);
              message.success(checked ? '已开启反转上下行统计' : '已关闭反转上下行统计');
            }}
            // size="small"
          />
        </div>
      }
    >
      <div style={{ marginBottom: 16 }}>
        <div className="my-title">当前服务模式:
          <Link style={{ color: 'var(--ant-color-primary)', fontWeight: 'bold', marginLeft: 8 }}>串口AT</Link>
          <ReloadOutlined style={{ color: 'var(--ant-color-primary)', marginLeft: 8, cursor: 'pointer' }} />
        </div>
        <div className="my-tip">这里配置前端连接后端 AT 服务的地址和端口，页面上的查询、锁频、短信、模组设置都会通过这个服务发送 AT 命令。</div>
        <div className="my-tip" style={{ marginTop: 6 }}>上下行反转只影响页面流量统计展示，用于修正部分模组/固件把上传和下载计数反着返回的情况，不会修改模组网络参数。</div>
      </div>
      <Input
        value={inputIp}
        onChange={e => setInputIp(e.target.value)}
        style={{ marginBottom: 8 }}
        placeholder="IP地址"
        disabled={isConfigLocked}
      />
      <Input
        value={inputPort}
        onChange={e => setInputPort(e.target.value)}
        style={{ marginBottom: 8 }}
        placeholder="端口"
        disabled={isConfigLocked}
      />
      <Button
        type="primary"
        block
        size="large"
        className="my-btn"
        onClick={async () => {
          resetGroupReady();
          if (wsService.getStatus && wsService.getStatus() === 'open') {
            wsService.close && wsService.close();
            setTimeout(() => {
              setConfig(inputIp, inputPort);
              wsService.connect && wsService.connect(`ws://${inputIp}:${inputPort}`);
            }, 300);
          } else {
            setConfig(inputIp, inputPort);
            wsService.connect && wsService.connect(`ws://${inputIp}:${inputPort}`);
          }
          message.success('AT服务器配置已保存');
        }}
        disabled={isConfigLocked}
      >
        保存
      </Button>
      {isConfigLocked ? (
        <div style={{ color: 'red', marginTop: 8, marginBottom: 0, fontSize: 12 }}>
          config.json配置已启用，当前配置被锁定
        </div>
      ) : (
        <div className="my-tip">
          支持 IPv4（例如：192.168.1.1）和 IPv6（例如：2001:db8::1）地址
        </div>
      )}
    </Card>
  );
};

const SystemInfoCard = ({ onInfoChange }: { onInfoChange?: (info: SystemInfo) => void }) => {
  const { ip, port } = useWebSocketConfig();
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(false);
  // 记录已识别的命令族
  const [commandGroup, setCommandGroup] = useState<string>(() => getRememberedCommandGroup(ip, port) || 'Fibocom_AT');
  const [model, setModel] = useState<string>('');

  // const group = commandGroup;

  // 新的系统信息获取逻辑：
  async function fetchSystemInfo() {
    setLoading(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const atiRaw = await safeSendAT('ATI');
      const parsed = parseATISystemInfo(atiRaw);
      setModel(parsed.model);
      setCommandGroup(realGroup);
      setRememberedCommandGroup(ip, port, realGroup);
      const cmds = getSystemInfoCmds(realGroup);
      const raws = [atiRaw];
      for (let i = 1; i < cmds.length; i++) {
        raws.push(await safeSendAT(cmds[i]));
      }
      const info = parseSystemInfoMulti(raws, realGroup);
      setInfo(info);
      onInfoChange?.(info);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancel = false;
    const doQuery = () => { if (!cancel) fetchSystemInfo(); };
    if (wsService.getStatus && wsService.getStatus() === 'open') {
      doQuery();
    } else {
      wsService.addOnOpenCallback(doQuery);
    }
    return () => {
      cancel = true;
      wsService.removeOnOpenCallback(doQuery);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ip, port]);

  return (
    <Card
      title="系统信息"
      extra={<Button className="my-btn" size="small" loading={loading} onClick={() => fetchSystemInfo()} icon={<ReloadOutlined />}>刷新</Button>}
      className="my-card"
    >
      <Descriptions
        bordered
        column={1}
        styles={{
          label: { width: '40%' },
        }}
        className="custom-descriptions"
      >
        <Descriptions.Item label="制造商">{info?.manufacturer || '-'}</Descriptions.Item>
        <Descriptions.Item label="设备型号">{info?.model || '-'}</Descriptions.Item>
        <Descriptions.Item label="固件版本">{info?.firmware || '-'}</Descriptions.Item>
        <Descriptions.Item label="完整版本号">{info?.fullVersion || info?.firmware || '-'}</Descriptions.Item>
        <Descriptions.Item label="IMEI">{info?.imei || '-'}</Descriptions.Item>
      </Descriptions>
    </Card>
  );
};

const ImeiEditCard = ({ imei }: { imei: string }) => {
  const { ip, port } = useWebSocketConfig();
  const [imeiInput, setImeiInput] = useState(imei || '');
  const [remarkInput, setRemarkInput] = useState('');
  const [history, setHistory] = useState<{ remark: string; imei: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const { message, modal } = App.useApp();
  const historyKey = 'rg500q_imei_history';

  useEffect(() => {
    setImeiInput(imei || '');
  }, [imei]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(historyKey) || '[]');
      const merged = (Array.isArray(saved) ? saved : [])
        .filter((item, index, arr) => item?.imei && arr.findIndex(x => x.imei === item.imei) === index);
      setHistory(merged);
    } catch {
      setHistory([]);
    }
  }, []);

  const persistHistory = (items: { remark: string; imei: string }[]) => {
    setHistory(items);
    localStorage.setItem(historyKey, JSON.stringify(items));
  };

  const handleSaveHistory = () => {
    if (!/^\d{15}$/.test(imeiInput)) {
      message.warning('请输入15位数字IMEI');
      return;
    }
    const remark = remarkInput.trim() || `IMEI ${imeiInput.slice(-4)}`;
    const next = [{ remark, imei: imeiInput }, ...history.filter(item => item.imei !== imeiInput)];
    persistHistory(next);
    setRemarkInput('');
    message.success('IMEI记录已保存');
  };

  const handleImeiEdit = async () => {
    if (!/^\d{15}$/.test(imeiInput)) {
      message.warning('请输入15位数字IMEI');
      return;
    }
    setLoading(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      await safeSendAT(setImeiCmd(realGroup, imeiInput));
      message.success('IMEI修改命令已发送');
      if (remarkInput.trim()) {
        const next = [{ remark: remarkInput.trim(), imei: imeiInput }, ...history.filter(item => item.imei !== imeiInput)];
        persistHistory(next);
        setRemarkInput('');
      }
    } catch (e) {
      message.error('IMEI修改失败: ' + e);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Card
      className="my-card"
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <EditOutlined style={{ color: 'var(--ant-color-primary)' }} />
          <span>IMEI 修改</span>
        </span>
      }
      styles={{ body: { padding: 20 } }}
    >
      <div style={{
        border: '1px solid var(--ant-color-border-secondary)',
        borderRadius: 10,
        padding: 14,
        background: 'linear-gradient(135deg, var(--ant-color-bg-container), var(--ant-color-fill-quaternary))',
        marginBottom: 14,
      }}>
        <div style={{ fontSize: 13, color: 'var(--ant-color-text-secondary)', marginBottom: 6 }}>当前 IMEI</div>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>{imei || '-'}</div>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Input
          placeholder="请输入新的 IMEI（15 位数字）"
          value={imeiInput}
          onChange={e => setImeiInput(e.target.value.replace(/\D/g, '').slice(0, 15))}
          maxLength={15}
          disabled={loading}
          style={{ flex: 1, height: 40 }}
        />
        <Button
          type="primary"
          className="my-btn"
          loading={loading}
          onClick={handleImeiEdit}
          style={{ height: 40, minWidth: 108, fontWeight: 700 }}
        >
          应用修改
        </Button>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
        <Input
          placeholder="备注"
          value={remarkInput}
          onChange={e => setRemarkInput(e.target.value)}
          disabled={loading}
          style={{ flex: 1, height: 36 }}
        />
        <Button className="my-btn" onClick={handleSaveHistory} disabled={loading} style={{ height: 36 }}>
          保存记录
        </Button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {history.map(item => (
          <Button
            key={`${item.remark}-${item.imei}`}
            className="my-btn"
            size="small"
            onClick={() => {
              setImeiInput(item.imei);
              setRemarkInput(item.remark);
            }}
          >
            {item.remark}：{item.imei}
          </Button>
        ))}
      </div>
    </Card>
  );
};

const SimCardConfigCard = () => {
  const { ip, port } = useWebSocketConfig();
  const [simType, setSimType] = useState<'outer' | 'inner'>('outer');
  const [hotSwap, setHotSwap] = useState(true);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [airplane, setAirplane] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pinModal, setPinModal] = useState(false);
  const [pinMode, setPinMode] = useState<'enable' | 'disable'>('enable');
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [pinError, setPinError] = useState('');
  const { message } = App.useApp();

  // 获取命令族
  // const group = getRememberedCommandGroup(ip, port) || 'Quectel_AT';

  // 判断WebSocket是否已连接
  function isWsReady() {
    return wsService.getStatus && wsService.getStatus() === 'open';
  }

  // 查询所有状态
  const queryAll = async () => {
    if (!isWsReady()) {
      message.warning('网络未连接，请稍后重试');
      return;
    }
    setLoading(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const simMsg = await safeSendAT(getSimSlotCmd(realGroup));
      const slot = parseSimSlot(simMsg, realGroup);
      if (slot) setSimType(slot);
      const hotMsg = await safeSendAT(getHotSwapCmd(realGroup));
      const hot = parseHotSwap(hotMsg, realGroup);
      if (typeof hot === 'boolean') setHotSwap(hot);
      const airMsg = await safeSendAT(getAirplaneCmd(realGroup));
      const air = parseAirplane(airMsg, realGroup);
      if (typeof air === 'boolean') setAirplane(air);
      const pinMsg = await safeSendAT(getPinStatusCmd(realGroup));
      const pin = parsePinStatus(pinMsg, realGroup);
      if (typeof pin === 'boolean') setPinEnabled(pin);
    } catch (e) {
      message.error('AT命令查询失败: ' + e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancel = false;
    const doQuery = () => { if (!cancel) queryAll(); };
    if (wsService.getStatus && wsService.getStatus() === 'open') {
      doQuery();
    } else {
      wsService.addOnOpenCallback(doQuery);
    }
    return () => {
      cancel = true;
      wsService.removeOnOpenCallback(doQuery);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ip, port]);

  // 切换SIM卡槽
  const handleSimTypeChange = async (type: 'outer' | 'inner') => {
    if (loading) return;
    if (!isWsReady()) {
      message.warning('网络未连接，请稍后重试');
      return;
    }
    setLoading(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      await safeSendAT(setSimSlotCmd(realGroup, type));
      await queryAll();
    } catch (e) {
      message.error('切换SIM卡失败: ' + e);
    } finally {
      setLoading(false);
    }
  };
  // 切换热插拔
  const handleHotSwap = async (enable: boolean) => {
    if (loading) return;
    if (!isWsReady()) {
      message.warning('网络未连接，请稍后重试');
      return;
    }
    setLoading(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      await safeSendAT(setHotSwapCmd(realGroup, enable));
      await queryAll();
    } catch (e) {
      message.error('设置热插拔失败: ' + e);
    } finally {
      setLoading(false);
    }
  };
  // 切换飞行模式
  const handleAirplane = async (enable: boolean) => {
    if (loading) return;
    if (!isWsReady()) {
      message.warning('网络未连接，请稍后重试');
      return;
    }
    setLoading(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      await safeSendAT(setAirplaneCmd(realGroup, enable));
      await queryAll();
    } catch (e) {
      message.error('设置飞行模式失败: ' + e);
    } finally {
      setLoading(false);
    }
  };
  // PIN码弹窗
  const showPinModal = (mode: 'enable' | 'disable') => {
    if (loading) return;
    if (!isWsReady()) {
      message.warning('网络未连接，请稍后重试');
      return;
    }
    setPinMode(mode);
    setPin1('');
    setPin2('');
    setPinError('');
    setPinModal(true);
  };
  const handlePinOk = async () => {
    if (!/^\d{4,8}$/.test(pin1)) {
      setPinError('PIN码必须为4-8位数字');
      return;
    }
    if (pinMode === 'enable' && pin1 !== pin2) {
      setPinError('两次输入的PIN码不一致');
      return;
    }
    setPinError('');
    if (!isWsReady()) {
      setPinError('网络未连接，请稍后重试');
      return;
    }
    setLoading(true);
    try {
      if (pinMode === 'enable') {
        await ensureGroupReady(ip, port);
        const realGroup = await getCurrentGroupAsync(ip, port);
        await safeSendAT(setPinEnableCmd(realGroup, pin1));
      } else {
        await ensureGroupReady(ip, port);
        const realGroup = await getCurrentGroupAsync(ip, port);
        await safeSendAT(setPinDisableCmd(realGroup, pin1));
      }
      setPinModal(false);
      await queryAll();
    } catch (e) {
      setPinError('操作失败: ' + e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="SIM卡配置">
      <Descriptions
        bordered
        column={1}
        styles={{ label: { width: '20%' }, content: { fontSize: 14 } }}
        className="my-card"
      >
        <Descriptions.Item label="切换">
          <div>
            <Space.Compact style={{ width: '100%' }}>
              <Button
                type={simType === 'outer' ? 'primary' : 'default'}
                onClick={() => handleSimTypeChange('outer')}
                style={{ flex: 1 }}
                loading={loading}
                className="my-btn"
              >
                外置SIM卡
              </Button>
              <Button
                type={simType === 'inner' ? 'primary' : 'default'}
                onClick={() => handleSimTypeChange('inner')}
                style={{ flex: 1 }}
                loading={loading}
                className="my-btn"
              >
                内置SIM卡
              </Button>
            </Space.Compact>
            <div className="my-tip">
              切换SIM卡需要重启设备，请确保没有重要的网络操作正在进行
            </div>
          </div>
        </Descriptions.Item>
        <Descriptions.Item label="热插拔">
          <div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <Switch
                checked={hotSwap}
                loading={loading}
                onChange={handleHotSwap}
                style={{ marginRight: 8 }}
              />
              <span style={{ color: hotSwap ? 'var(--ant-color-primary)' : 'var(--ant-color-text-secondary)', marginRight: 16 }}>{hotSwap ? '已开启' : '已关闭'}</span>
            </div>
            <div className="my-tip">
              开启后可以在设备运行时插拔外置SIM卡
            </div>
          </div>
        </Descriptions.Item>
        <Descriptions.Item label="PIN码管理">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ marginRight: 0 }}>状态:</span>
              <span
                style={{
                  color: pinEnabled ? 'var(--ant-color-primary)' : 'var(--ant-color-text-secondary)',
                  marginLeft: 4,
                  marginRight: 0,
                }}
              >
                {pinEnabled ? '需要PIN码验证' : '无需PIN码验证'}
              </span>
            </div>
            <Button className="my-btn" type="primary" size="small" onClick={() => showPinModal(pinEnabled ? 'disable' : 'enable')} loading={loading} style={{ marginLeft: 'auto' }}>
              {pinEnabled ? '关闭PIN码' : '启用PIN码'}
            </Button>
          </div>
        </Descriptions.Item>
        <Descriptions.Item label="飞行模式">
          <div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <Switch
                checked={airplane}
                loading={loading}
                onChange={handleAirplane}
                style={{ marginRight: 8 }}
              />
              <span style={{ color: airplane ? 'var(--ant-color-primary)' : 'var(--ant-color-text-secondary)', marginRight: 16 }}>{airplane ? '已开启' : '已关闭'}</span>
            </div>
            <div className="my-tip">
              开启飞行模式将断开所有网络
            </div>
          </div>
        </Descriptions.Item>
      </Descriptions>
      <Modal
        open={pinModal}
        title={pinMode === 'enable' ? '启用PIN码' : '关闭PIN码'}
        onCancel={() => setPinModal(false)}
        onOk={handlePinOk}
        okText="确认"
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
        <div style={{ marginBottom: 8 }}>
          {pinMode === 'enable' ? '启用PIN码后，每次开机都需要验证' : '关闭PIN码后，开机无需验证'}
        </div>
        <Input.Password
          placeholder="请输入PIN码"
          value={pin1}
          onChange={e => setPin1(e.target.value)}
          maxLength={8}
          style={{ marginBottom: 8 }}
        />
        {pinMode === 'enable' && (
          <Input.Password
            placeholder="请再次输入PIN码"
            value={pin2}
            onChange={e => setPin2(e.target.value)}
            maxLength={8}
            style={{ marginBottom: 8 }}
          />
        )}
        <div style={{ background: 'var(--ant-color-warning-bg)', border: '1px solid var(--ant-color-warning-border)', color: 'var(--ant-color-warning)', borderRadius: 4, padding: 8, marginBottom: 8 }}>
          <b>重要提示</b>
          <ul style={{ margin: 0, paddingLeft: 20, listStyleType: 'disc' }}>
            <li>PIN码必须为4-8位数字</li>
          </ul>
        </div>
        {pinError && <div style={{ color: 'red', marginBottom: 8 }}>{pinError}</div>}
      </Modal>
    </Card>
  );
};

const DeviceControlCard = () => {
  const { ip, port } = useWebSocketConfig();
  // driverList类型声明允许有enabled属性
  const [driverList, setDriverList] = useState<{ label: string; value: string; enabled?: boolean }[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<string>('');
  const [perfMode, setPerfMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const { message, modal } = App.useApp();

  function isWsReady() {
    return wsService.getStatus && wsService.getStatus() === 'open';
  }

  // 查询所有状态
  const queryAll = async () => {
    if (!isWsReady()) {
      message.warning('网络未连接，请稍后重试');
      return;
    }
    setLoading(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const ethResp = await safeSendAT(getEthDriverCmd(realGroup));
      const drvList = parseEthDriverList(ethResp, realGroup);
      // 优先选中已启用的网卡
      const enabledDrv = drvList.find(d => d.enabled);
      setDriverList(drvList);
      setSelectedDriver(enabledDrv ? enabledDrv.value : (drvList[0]?.value || ''));
      const perfResp = await safeSendAT(getPerfModeCmd(realGroup));
      setPerfMode(parsePerfMode(perfResp, realGroup));
    } catch (e) {
      setDriverList([]);
      setSelectedDriver('');
      setPerfMode(false);
      message.error('AT命令查询失败: ' + e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancel = false;
    const doQuery = () => { if (!cancel) queryAll(); };
    if (wsService.getStatus && wsService.getStatus() === 'open') {
      doQuery();
    } else {
      wsService.addOnOpenCallback(doQuery);
    }
    return () => {
      cancel = true;
      wsService.removeOnOpenCallback(doQuery);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ip, port]);

  // 设置网卡驱动
  const handleSetDriver = async (drv: string) => {
    if (loading) return;
    if (!isWsReady()) {
      message.warning('网络未连接，请稍后重试');
      return;
    }
    setLoading(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      await safeSendAT(setEthDriverCmd(realGroup, drv));
      await queryAll();
      message.success('设置网卡驱动成功');
    } catch (e) {
      message.error('设置网卡驱动失败: ' + e);
    } finally {
      setLoading(false);
    }
  };
  // 设置性能模式
  const handleSetPerf = async (on: boolean) => {
    if (loading) return;
    if (!isWsReady()) {
      message.warning('网络未连接，请稍后重试');
      return;
    }
    setLoading(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      await safeSendAT(setPerfModeCmd(realGroup, on));
      await queryAll();
      message.success('设置性能模式成功');
    } catch (e) {
      message.error('设置性能模式失败: ' + e);
    } finally {
      setLoading(false);
    }
  };
  const executeReset = async () => {
    if (loading) return;
    if (!isWsReady()) {
      message.warning('网络未连接，请稍后重试');
      return;
    }
    setLoading(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      await safeSendAT(getResetFactoryCmd(realGroup));
      message.success('恢复出厂设置命令已发送');
    } catch (e) {
      message.error('恢复出厂设置失败: ' + e);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    if (loading) return;
    modal.confirm({
      title: '恢复出厂设置',
      content: '将清空模组配置，IMEI 等信息可能恢复为模组默认值。确定继续吗？',
      okText: '恢复出厂',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: executeReset,
    });
  };

  const executeReboot = async () => {
    if (loading) return;
    if (!isWsReady()) {
      message.warning('网络未连接，请稍后重试');
      return;
    }
    setLoading(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      await safeSendAT(getRebootCmd(realGroup));
      message.success('重启命令已发送');
    } catch (e) {
      message.error('重启失败: ' + e);
    } finally {
      setLoading(false);
    }
  };

  const handleReboot = () => {
    if (loading) return;
    modal.confirm({
      title: '重启模组',
      content: '重启期间会暂时断开与模组的通信，请等待连接自动恢复。',
      okText: '重启',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: executeReboot,
    });
  };

  return (
    <Card title="设备控制" className="my-card">
      <Descriptions bordered column={1} styles={{ label: { width: '30%' }, content: { fontSize: 14 } }}>
        <Descriptions.Item label={<span>网卡速率</span>}>
          <div style={{ marginBottom: 8 }}>
            <span style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ marginBottom: 0, fontWeight: 'bold', fontSize: 14 }}>当前配置：</span>
              <span style={{ color: 'var(--ant-color-success)', fontWeight: 'bold' }}>
                {driverList.find(d => d.value === selectedDriver)?.label || '-'}
              </span>
            </span>
            <div className="my-tip">
              修改网卡速率需要重启设备才生效
            </div>
          </div>
          <Select
            style={{ width: 240, marginTop: 8 }}
            value={selectedDriver || (driverList[0]?.value || undefined)}
            loading={loading}
            onChange={handleSetDriver}
            options={driverList}
            placeholder="请选择网卡驱动"
            disabled={loading || !driverList.length}
          />
        </Descriptions.Item>
        <Descriptions.Item label="性能模式">
          <div style={{ display: 'flex', alignItems: 'center', height: 26 }}>
            <Switch
              checked={perfMode}
              loading={loading}
              onChange={handleSetPerf}
              style={{ marginRight: 8 }}
            />
            <span style={{ color: perfMode ? 'var(--ant-color-primary)' : 'var(--ant-color-text-secondary)', marginRight: 16 }}>{perfMode ? '已开启' : '已关闭'}</span>
          </div>
        </Descriptions.Item>
        <Descriptions.Item label="恢复出厂设置">
          <Button className="my-btn" danger type="primary" onClick={handleReset} loading={loading} style={{ width: 140 }}>恢复出厂设置</Button>
        </Descriptions.Item>
        <Descriptions.Item label="模组重启">
          <Button className="my-btn" danger type="primary" onClick={handleReboot} loading={loading} style={{ width: 140 }}>重 启</Button>
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
};

const DmzConfigCard = () => {
  const { ip, port } = useWebSocketConfig();
  // const group = getRememberedCommandGroup(ip, port) || 'Quectel_AT';
  const [status, setStatus] = useState<'loading' | 'unset' | 'set' | 'error'>('loading');
  const [dmzIp, setDmzIp] = useState('');
  const [dmzIpv6, setDmzIpv6] = useState('');
  const [inputAddr, setInputAddr] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchStatus = async () => {
    setStatus('loading');
    setError('');
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const resp = await safeSendAT(getDmzStatusCmd(realGroup));
      const parsed = parseDmzStatus(resp, realGroup);
      if (parsed.ipv4.enabled && parsed.ipv4.ip) {
        setStatus('set');
        setDmzIp(parsed.ipv4.ip);
        setInputAddr(parsed.ipv4.ip);
      } else if (parsed.ipv6.enabled && parsed.ipv6.ip) {
        setStatus('set');
        setDmzIpv6(parsed.ipv6.ip);
        setInputAddr(parsed.ipv6.ip);
      } else {
        setStatus('unset');
        setDmzIp('');
        setDmzIpv6('');
        setInputAddr('');
      }
    } catch (e) {
      setStatus('error');
      setError('查询失败: ' + e);
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ip, port]);

  function isIpv4(addr: string) {
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(addr);
  }
  function isIpv6(addr: string) {
    return /^([\da-fA-F]{0,4}:){2,7}[\da-fA-F]{0,4}$/.test(addr);
  }

  const handleApply = async () => {
    setLoading(true);
    setError('');
    try {
      if (isIpv4(inputAddr)) {
        await ensureGroupReady(ip, port);
        const realGroup = await getCurrentGroupAsync(ip, port);
        await safeSendAT(setDmzIpv4Cmd(realGroup, inputAddr));
      } else if (isIpv6(inputAddr)) {
        await ensureGroupReady(ip, port);
        const realGroup = await getCurrentGroupAsync(ip, port);
        await safeSendAT(setDmzIpv6Cmd(realGroup, inputAddr));
      } else {
        setError('请输入合法的IPv4或IPv6地址');
        setLoading(false);
        return;
      }
      await fetchStatus();
    } catch (e) {
      setError('设置失败: ' + e);
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async () => {
    setLoading(true);
    setError('');
    try {
      if (dmzIp) {
        await ensureGroupReady(ip, port);
        const realGroup = await getCurrentGroupAsync(ip, port);
        await safeSendAT(disableDmzIpv4Cmd(realGroup));
      } else if (dmzIpv6) {
        await ensureGroupReady(ip, port);
        const realGroup = await getCurrentGroupAsync(ip, port);
        await safeSendAT(disableDmzIpv6Cmd(realGroup));
      } else {
        setError('当前无可禁用的DMZ主机');
        setLoading(false);
        return;
      }
      await fetchStatus();
    } catch (e) {
      setError('禁用失败: ' + e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="DMZ主机设置" extra={<Button className="my-btn" onClick={fetchStatus} loading={status === 'loading'} icon={<ReloadOutlined />}>刷新</Button>} className="my-card">
      <div className="my-title">
        当前状态: {status === 'set'
          ? <span style={{ color: 'var(--ant-color-success)' }}>已配置 ({dmzIp || dmzIpv6})</span>
          : status === 'unset'
            ? <span style={{ color: 'var(--ant-color-text-secondary)' }}>未配置</span>
            : <span style={{ color: 'red' }}>异常</span>}
      </div>
      <div className="my-tip" style={{ marginBottom: 16 }}>
        DMZ主机将完全暴露在公网中，请谨慎配置
      </div>
      <Input
        placeholder="请输入DMZ主机IP (支持IPv4/IPv6)"
        value={inputAddr}
        onChange={e => setInputAddr(e.target.value)}
        disabled={loading}
        style={{ width: '70%', marginRight: 8 }}
      />
      <Button className="my-btn" type="primary" onClick={handleApply} loading={loading} disabled={!inputAddr || loading} style={{ marginRight: 8 }}>应用</Button>
      <Button className="my-btn" danger onClick={handleDisable} loading={loading} disabled={status !== 'set' || loading}>禁用</Button>
      {error && <div style={{ color: 'red', marginTop: 8 }}>{error}</div>}
    </Card>
  );
};

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ant-color-text)', fontSize: 15 }}>
    <span style={{ color: 'var(--ant-color-text-secondary)' }}>{label}</span>
    <span>{value}</span>
  </div>
);
