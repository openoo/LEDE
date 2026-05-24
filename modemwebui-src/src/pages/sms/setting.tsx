import { Row, Col, Form } from 'antd';
import { Card, Button, Input, Select, App, message, Row as AntdRow, Col as AntdCol, Radio, Tooltip, Tag, Divider, Descriptions, Switch, Progress, Space } from 'antd';
import { useEffect, useState } from 'react';
import wsService from '@/services/websocket';
import { useWebSocketConfig } from '@/contexts/WebSocketConfigContext';
import { getRememberedCommandGroup, setRememberedCommandGroup, parseATISystemInfo } from '@/utils/atModule';
import { getSmsEnableCmd, setSmsEnableCmd, parseSmsEnable } from '@/utils/atModule';
import { getSmsCenterCmd, setSmsCenterCmd, parseSmsCenter } from '@/utils/atModule';
import { getSmsStoreCmd, setSmsStoreCmd, parseSmsStore } from '@/utils/atModule';
import { safeSendAT, resetGroupReady, getCurrentGroupAsync, ensureGroupReady } from '@/utils/atQueue';
import { ReloadOutlined } from '@ant-design/icons';
import { useModel } from '@umijs/max';
import { useScrollReset } from '@/hooks/useScrollReset';
import { useResponsive } from '@/hooks/useResponsive';

export default function Sms() {
  const { ip, port } = useWebSocketConfig();
  const { setInitialState } = useModel('@@initialState');
  const [smsEnabled, setSmsEnabled] = useState<boolean | undefined>(undefined);

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
        <SmsSettingCard onSmsStatusChange={setSmsEnabled} />
      </Col>
      <Col xs={24} md={24}>
        <SmsCenterCard smsEnabled={smsEnabled} />
      </Col>
      <Col xs={24} md={24}>
        <SmsStoreCard />
      </Col>
    </Row>
  );
}

function SmsSettingCard({ onSmsStatusChange }: { onSmsStatusChange: (enabled: boolean | undefined) => void }) {
  const { ip, port } = useWebSocketConfig();
  const [enabled, setEnabled] = useState<boolean | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();

  // 查询短信功能状态
  const fetchStatus = async () => {
    setLoading(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const raw = await safeSendAT(getSmsEnableCmd(realGroup));
      const val = parseSmsEnable(raw, realGroup);
      setEnabled(val);
      onSmsStatusChange(val);
    } catch (e) {
      message.error('获取短信功能状态失败');
    }
    setLoading(false);
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

  // 切换短信功能
  const handleSwitch = async (checked: boolean) => {
    setLoading(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      await safeSendAT(setSmsEnableCmd(realGroup, checked));
      const raw = await safeSendAT(getSmsEnableCmd(realGroup));
      const val = parseSmsEnable(raw, realGroup);
      setEnabled(val);
      onSmsStatusChange(val);
      if (val === checked) {
        message.success(checked ? '短信功能已开启' : '短信功能已关闭');
      } else {
        message.error('设置失败');
      }
    } catch (e) {
      message.error('设置短信功能失败');
    }
    setLoading(false);
  };

  return (
    <Card
      className="my-card"
      title={<b>短信功能</b>}
      extra={<Button className="my-btn" size="small" loading={loading} onClick={fetchStatus} icon={<ReloadOutlined />}>刷新</Button>}
      styles={{ body: { padding: 24, borderRadius: 12 } }}
    >
      <Descriptions bordered column={2} styles={{ label: { width: '42%' }, content: { fontSize: 14 } }}>
        <Descriptions.Item label={<span style={{ marginLeft: 8 }}>短信开关</span>}>
          <span style={{ display: 'flex', alignItems: 'center', marginBottom: 6, marginTop: 6 }}>
            <Switch
              checked={!!enabled}
              loading={loading}
              onChange={handleSwitch}
              style={{ marginRight: 12 }}
            />
            <span style={{ color: enabled ? 'var(--ant-color-primary)' : 'var(--ant-color-text-secondary)', fontWeight: 'bold', fontSize: 14 }}>{enabled ? '已开启' : '已关闭'}</span>
          </span>
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
}

function SmsCenterCard({ smsEnabled }: { smsEnabled?: boolean }) {
  const { ip, port } = useWebSocketConfig();
  const [smsc, setSmsc] = useState('');
  const [smscLoading, setSmscLoading] = useState(false);
  const [smscInput, setSmscInput] = useState('');
  const { message } = App.useApp();
  const { isMobile } = useResponsive();

  // 查询短信中心号码
  const fetchSmsc = async () => {
    setSmscLoading(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const raw = await safeSendAT(getSmsCenterCmd(realGroup));
      const num = parseSmsCenter(raw, realGroup) || '';
      setSmsc(num);
      setSmscInput(num);
    } catch (e) {
      message.error('获取短信中心号码失败');
    }
    setSmscLoading(false);
  };

  useEffect(() => {
    let cancel = false;
    const doQuery = () => { if (!cancel) fetchSmsc(); };
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

  // 设置短信中心号码
  const handleSaveSmsc = async () => {
    setSmscLoading(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const raw = await safeSendAT(setSmsCenterCmd(realGroup, smscInput.trim()));
      const num = parseSmsCenter(raw, realGroup) || smscInput.trim();
      setSmsc(num);
      setSmscInput(num);
      message.success('短信中心号码已保存');
    } catch (e) {
      message.error('设置短信中心号码失败');
    }
    setSmscLoading(false);
  };

  return (
    <Card
      className="my-card"
      title={<b>短信中心设置</b>}
      extra={<Button className="my-btn" size="small" loading={smscLoading} onClick={fetchSmsc} icon={<ReloadOutlined />}>刷新</Button>}
      styles={{ body: { padding: 24 } }}
    >
      <Descriptions bordered column={2} styles={{ label: { width: '32%' }, content: { fontSize: 14 } }}>
        <Descriptions.Item label={<span style={{ marginLeft: 8 }}>短信中心号码</span>}>
          <span style={{ display: 'flex', alignItems: 'center', marginBottom: 4, marginTop: 4 }}>
            <Space.Compact style={{ display: 'flex', alignItems: 'center' }}>
              <Input
                value={smscInput}
                onChange={e => setSmscInput(e.target.value)}
                style={{ 
                  width: isMobile ? '100%' : 360, 
                  borderTopRightRadius: 0, 
                  borderBottomRightRadius: 0,
                  height: 32
                }}
                disabled={smscLoading || smsEnabled === false}
                placeholder="请输入短信中心号码"
              />
              <Button
                type="primary"
                htmlType="button"
                loading={smscLoading}
                onClick={handleSaveSmsc}
                disabled={!smscInput.trim() || smsEnabled === false}
                style={{ 
                  borderTopLeftRadius: 0, 
                  borderBottomLeftRadius: 0, 
                  minWidth: 60, 
                  padding: '0 16px',
                  height: 32,
                  borderLeft: 'none',
                  boxShadow: 'none'
                }}
              >保存</Button>
            </Space.Compact>
          </span>
          {smsEnabled === false && (
            <div style={{ color: 'var(--ant-color-text-secondary)', fontSize: 12, marginTop: 4 }}>
              (请先开启短信功能)
            </div>
          )}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
}

function SmsStoreCard() {
  const { ip, port } = useWebSocketConfig();
  const [store, setStore] = useState<'SM' | 'ME'>('SM');
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeData, setStoreData] = useState<{ read: any, write: any, status: any }>({ read: { used: 0, total: 0 }, write: { used: 0, total: 0 }, status: { used: 0, total: 0 } });
  const [pendingStore, setPendingStore] = useState<'SM' | 'ME'>('SM');
  const { message } = App.useApp();

  // 查询存储位置和用量
  const fetchStore = async () => {
    setStoreLoading(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const cmds = getSmsStoreCmd(realGroup);
      let raws = '';
      for (const cmd of cmds) {
        raws += await safeSendAT(cmd);
      }
      const parsed = parseSmsStore(raws, realGroup);
      setStoreData(parsed);
      // 只要有SM就优先SM，否则ME
      const storeVal = parsed.rawArr && parsed.rawArr[1] ? parsed.rawArr[1].replace(/"/g, '') as 'SM' | 'ME' : 'SM';
      setStore(storeVal);
      setPendingStore(storeVal);
    } catch (e) {
      message.error('获取存储信息失败');
    }
    setStoreLoading(false);
  };

  useEffect(() => {
    let cancel = false;
    const doQuery = () => { if (!cancel) fetchStore(); };
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

  // 设置存储位置
  const handleSaveStore = async () => {
    setStoreLoading(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const raw = await safeSendAT(setSmsStoreCmd(realGroup, pendingStore));
      const parsed = parseSmsStore(raw, realGroup);
      setStoreData(parsed);
      setStore(pendingStore);
      message.success('存储位置已保存');
    } catch (e) {
      message.error('设置存储位置失败');
    }
    setStoreLoading(false);
  };

  return (
    <Card
      className="my-card"
      title={<b>存储设置</b>}
      extra={<Button className="my-btn" size="small" loading={storeLoading} onClick={fetchStore} icon={<ReloadOutlined />}>刷新</Button>}
      styles={{ body: { padding: 24 } }}
    >
      <div style={{ marginBottom: 16, fontSize: 14 }}>
        存储位置：
        <Radio.Group
          value={pendingStore}
          onChange={e => setPendingStore(e.target.value)}
          style={{ marginLeft: 12 }}
          disabled={storeLoading}
        >
          <Radio value="SM">SIM卡</Radio>
          <Radio value="ME">模组</Radio>
        </Radio.Group>
      </div>
      <Descriptions bordered column={1} styles={{ label: { width: '46%' }, content: { fontSize: 14 } }}>
        {[{ label: '读取存储', key: 'read' }, { label: '写入存储', key: 'write' }, { label: '接收存储', key: 'status' }].map(item => {
          const d = storeData[item.key as 'read' | 'write' | 'status'] || { used: 0, total: 0 };
          const percent = d.total ? Math.round((d.used / d.total) * 100) : 0;
          return (
            <Descriptions.Item key={item.key} label={<span style={{ marginLeft: 8 }}>{item.label}</span>}>
              <div style={{ width: '100%' }}>
                <div style={{ color: 'var(--ant-color-text-secondary)', fontSize: 12, marginBottom: 4, marginLeft: 8 }}>已使用 {d.used}/{d.total}</div>
                <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  <div style={{ flex: 1, marginRight: 16, marginLeft: 8 }}>
                    <div style={{ height: 8, background: 'var(--ant-color-fill-tertiary)', borderRadius: 6, position: 'relative', width: '100%' }}>
                      <div style={{ height: 8, borderRadius: 6, background: 'var(--ant-color-primary)', width: `${percent}%`, transition: 'width 0.3s' }} />
                    </div>
                  </div>
                  <span style={{ color: 'var(--ant-color-text-secondary)', fontSize: 14, minWidth: 32 }}>{percent}%</span>
                </div>
              </div>
            </Descriptions.Item>
          );
        })}
      </Descriptions>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <Button className="my-btn" type="primary" style={{ marginLeft: 24 }} loading={storeLoading} onClick={handleSaveStore} disabled={pendingStore === store}>保存存储设置</Button>
      </div>
    </Card>
  );
}