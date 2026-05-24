import { Row, Col, Form, App } from 'antd';
import { Card, Button, Input, Select, message, Row as AntdRow, Col as AntdCol, Radio, Tooltip, Tag, Divider, Descriptions } from 'antd';
import { useEffect, useState } from 'react';
import wsService from '@/services/websocket';
import { useWebSocketConfig } from '@/contexts/WebSocketConfigContext';
import { parseATISystemInfo } from '@/utils/atModule';
import { getLockCellCmd, getLockCellStatusCmd, parseLockCellStatus } from '@/utils/atModule';
import { safeSendAT, resetGroupReady, getCurrentGroupAsync, ensureGroupReady } from '@/utils/atQueue';
import { GlobalOutlined, InfoCircleOutlined, ReloadOutlined, SafetyCertificateOutlined, SaveOutlined, SwapOutlined } from '@ant-design/icons';
import { getBandSupportCmd, parseBandSupport, setBandSupportCmd, restoreBandCmd } from '@/utils/atModule';
import { getBandQueryCmd, parseBandQuery } from '@/utils/atModule';
import { getNeighbourCellCmd, parseNeighbourCell } from '@/utils/atModule';
import {
  getRatOrderCmd, setRatOrderCmd, parseRatOrder,
  getRoamPrefCmd, setRoamPrefCmd, parseRoamPref,
  getSrvDomainCmd, setSrvDomainCmd, parseSrvDomain,
} from '@/utils/atModule';
import { parseLockCellBand } from '@/utils/formatUtils';
import { useModel } from '@umijs/max';
import { useScrollReset } from '@/hooks/useScrollReset';
import { useResponsive } from '@/hooks/useResponsive';
import React from 'react';

export default function NetworkConfig() {
  const { ip, port } = useWebSocketConfig();
  const { setInitialState } = useModel('@@initialState');
  const [isQuectel, setIsQuectel] = useState<boolean>(false);

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

  useEffect(() => {
    const checkGroup = async () => {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      // 判定包含模式：rm后跟任意3位数字（不区分大小写），例如 RM500、RM520 等
      const isRmXXX = !!(realGroup && /rm\d{3}/i.test(realGroup));
      setIsQuectel(isRmXXX);
    };
    checkGroup();
    return () => {
      // 这里没有副作用需要清理
    };
  }, [ip, port]);

  return (
    <Row gutter={[16, 16]} align="stretch">
      <Col xs={24} md={24}>
        <NetSystemConfigCard />
      </Col>
      <Col xs={24} md={24}>
        <BandSupportCard />
      </Col>
      <Col xs={24} md={24}>
        <NeighbourCellCard />
      </Col>
      <Col xs={24} md={24}>
        <LockCellCard isQuectel={isQuectel} />
      </Col>
    </Row>
  );
}

const MODE_OPTIONS = [
  { label: '仅5G', value: '5g', desc: '只允许注册 NR5G 网络，适合 5G 信号稳定且不需要回落时使用。', icon: '5G' },
  { label: '仅4G', value: '4g', desc: '只允许注册 LTE 网络，适合 5G 不稳定或需要降低功耗时使用。', icon: '4G' },
  { label: '仅3G', value: '3g', desc: '只允许注册 WCDMA 网络，一般仅用于兼容或排障。', icon: '3G' },
  { label: '自动', value: 'auto', desc: '允许模组按网络环境自动选择 5G / 4G / 3G。', icon: 'AUTO' },
] as const;

const ROAM_OPTIONS = [
  { label: '仅使用本地网络', value: false },
  { label: '允许使用漫游网络（可能产生额外费用）', value: true },
];

const SRV_OPTIONS = [
  { label: '仅支持通话功能', value: 0 },
  { label: '仅支持上网功能', value: 1 },
  { label: '同时支持通话和上网', value: 2 },
];

type NetworkMode = typeof MODE_OPTIONS[number]['value'];

function NetSystemConfigCard() {
  const { ip, port } = useWebSocketConfig();
  const { message } = App.useApp();
  const [networkMode, setNetworkMode] = useState<NetworkMode>('auto');
  const [roamPref, setRoamPref] = useState(false);
  const [srvDomain, setSrvDomain] = useState<number>(2);
  const [initialNetworkMode, setInitialNetworkMode] = useState<NetworkMode>('auto');
  const [initialRoamPref, setInitialRoamPref] = useState(false);
  const [initialSrvDomain, setInitialSrvDomain] = useState<number>(2);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const modeToRatOrder = (mode: NetworkMode) => {
    if (mode === '5g') return ['NR5G'];
    if (mode === '4g') return ['LTE'];
    if (mode === '3g') return ['WCDMA'];
    return ['NR5G', 'LTE', 'WCDMA'];
  };

  const ratOrderToMode = (rat: string[]): NetworkMode => {
    if (rat.length === 1 && rat[0] === 'NR5G') return '5g';
    if (rat.length === 1 && rat[0] === 'LTE') return '4g';
    if (rat.length === 1 && rat[0] === 'WCDMA') return '3g';
    return 'auto';
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const ratResp = await safeSendAT(getRatOrderCmd(realGroup));
      const roamResp = await safeSendAT(getRoamPrefCmd(realGroup));
      const srvResp = await safeSendAT(getSrvDomainCmd(realGroup));
      const parsedMode = ratOrderToMode(parseRatOrder(ratResp, realGroup));
      const parsedRoam = parseRoamPref(roamResp, realGroup);
      const parsedSrv = parseSrvDomain(srvResp, realGroup);
      setNetworkMode(parsedMode);
      setInitialNetworkMode(parsedMode);
      setRoamPref(parsedRoam);
      setInitialRoamPref(parsedRoam);
      setSrvDomain(parsedSrv);
      setInitialSrvDomain(parsedSrv);
    } catch (e) {
      message.error('读取网络系统配置失败: ' + e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancel = false;
    const doQuery = () => { if (!cancel) fetchAll(); };
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

  const isDirty = networkMode !== initialNetworkMode || roamPref !== initialRoamPref || srvDomain !== initialSrvDomain;
  const selectedMode = MODE_OPTIONS.find(item => item.value === networkMode) || MODE_OPTIONS[3];

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      await safeSendAT(setRatOrderCmd(realGroup, modeToRatOrder(networkMode)));
      await safeSendAT(setRoamPrefCmd(realGroup, roamPref));
      await safeSendAT(setSrvDomainCmd(realGroup, srvDomain));
      setInitialNetworkMode(networkMode);
      setInitialRoamPref(roamPref);
      setInitialSrvDomain(srvDomain);
      message.success('网络系统配置已保存');
    } catch (e) {
      message.error('保存失败: ' + e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <GlobalOutlined style={{ color: 'var(--ant-color-primary)' }} />
          <span style={{ lineHeight: '32px' }}>网络系统配置</span>
          <span
            style={{
              background: 'var(--ant-color-fill-tertiary)',
              borderRadius: 4,
              padding: '0 8px',
              height: 24,
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: 12,
              color: 'var(--ant-color-text-secondary)',
              fontWeight: 'normal',
            }}
          >
            网络模式、漫游和服务类型
          </span>
        </span>
      }
      extra={<Button className="my-btn" onClick={fetchAll} loading={loading} icon={<ReloadOutlined />}>刷新</Button>}
      className="my-card"
      styles={{ body: { padding: 20 } }}
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={15}>
          <div style={{
            border: '1px solid var(--ant-color-border-secondary)',
            borderRadius: 10,
            padding: 14,
            background: 'linear-gradient(135deg, var(--ant-color-bg-container), var(--ant-color-fill-quaternary))',
            height: '100%',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>网络模式</div>
                <div style={{ color: 'var(--ant-color-text-secondary)', fontSize: 13, marginTop: 2 }}>
                  当前策略：{selectedMode.label}
                </div>
              </div>
              <Tag color={networkMode === 'auto' ? 'blue' : 'green'} style={{ marginRight: 0, fontWeight: 600 }}>
                {selectedMode.icon}
              </Tag>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: 10 }}>
              {MODE_OPTIONS.map(item => {
                const active = networkMode === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setNetworkMode(item.value)}
                    disabled={loading || saving}
                    style={{
                      border: active ? '1px solid var(--ant-color-primary)' : '1px solid var(--ant-color-border-secondary)',
                      background: active ? 'var(--ant-color-primary-bg)' : 'var(--ant-color-bg-container)',
                      color: active ? 'var(--ant-color-primary)' : 'var(--ant-color-text)',
                      borderRadius: 8,
                      height: 64,
                      cursor: loading || saving ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'column',
                      gap: 4,
                      fontWeight: 700,
                      boxShadow: active ? '0 6px 16px rgba(22,119,255,0.14)' : 'none',
                      transition: 'all 0.2s',
                    }}
                  >
                    <span style={{ fontSize: 12, opacity: 0.75 }}>{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ marginTop: 12, color: 'var(--ant-color-text-secondary)', fontSize: 13 }}>
              {selectedMode.desc}
            </div>
          </div>
        </Col>
        <Col xs={24} lg={9}>
          <Row gutter={[12, 12]}>
            <Col xs={24}>
              <div style={{ border: '1px solid var(--ant-color-border-secondary)', borderRadius: 10, padding: 14, background: 'var(--ant-color-bg-container)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <SwapOutlined style={{ color: 'var(--ant-color-primary)' }} />
                  <span style={{ fontWeight: 700 }}>漫游设置</span>
                </div>
                <Select style={{ width: '100%' }} value={roamPref} onChange={setRoamPref} options={ROAM_OPTIONS} loading={loading} disabled={saving} />
              </div>
            </Col>
            <Col xs={24}>
              <div style={{ border: '1px solid var(--ant-color-border-secondary)', borderRadius: 10, padding: 14, background: 'var(--ant-color-bg-container)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <SafetyCertificateOutlined style={{ color: 'var(--ant-color-success)' }} />
                  <span style={{ fontWeight: 700 }}>服务类型</span>
                </div>
                <Select style={{ width: '100%' }} value={srvDomain} onChange={setSrvDomain} options={SRV_OPTIONS} loading={loading} disabled={saving} />
              </div>
            </Col>
          </Row>
        </Col>
        <Col xs={24}>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            block
            onClick={handleSaveAll}
            loading={saving}
            disabled={!isDirty || loading || saving}
            style={{ height: 40, borderRadius: 8, fontWeight: 700 }}
          >
            应用配置
          </Button>
        </Col>
      </Row>
    </Card>
  );
}

function BandSupportCard() {
  const { ip, port } = useWebSocketConfig();
  const [loading, setLoading] = useState(false);
  // 合并后的频段列表
  const [bandList, setBandList] = useState<number[]>([]);
  // 选择框状态
  const [bandSelect4g, setBandSelect4g] = useState<number[]>([]);
  const [bandSelect5g, setBandSelect5g] = useState<number[]>([]);
  // 支持的频段选项
  const [lteOptions, setLteOptions] = useState<{ label: string, value: number }[]>([]);
  const [nrOptions, setNrOptions] = useState<{ label: string, value: number }[]>([]);
  const { message } = App.useApp();

  // 查询频段
  const fetchBandSupport = async () => {
    setLoading(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      // 查询支持频段
      let supportBands: number[] = [];
      try {
        const supportCmd = getBandQueryCmd(realGroup);
        const supportRaw = await safeSendAT(supportCmd);
        supportBands = parseBandQuery(supportRaw, realGroup);
      } catch { }
      // 4G: 101~199, 5G: 以50开头
      const lteSupport = supportBands.filter(b => b >= 101 && b < 200).map(b => b - 100);
      const nrSupport = supportBands.filter(b => String(b).startsWith('50')).map(b => Number(String(b).slice(2)));
      setLteOptions(lteSupport.map(b => ({ label: `B${b}`, value: b })));
      setNrOptions(nrSupport.map(b => ({ label: `N${b}`, value: b })));

      // 查询当前配置
      const cmds = getBandSupportCmd(realGroup);
      let resp = '';
      for (const cmd of cmds) {
        resp += (await safeSendAT(cmd)) + '\n';
      }
      const bands: number[] = parseBandSupport(resp, realGroup);
      setBandList(bands);
      // 4G: 101~199, 5G: 以50开头
      const lte = bands.filter(b => b >= 101 && b < 200).map(b => b - 100); // 还原为B后数字
      const nr = bands.filter(b => String(b).startsWith('50')).map(b => Number(String(b).slice(2))); // 还原为N后数字
      setBandSelect4g(lte);
      setBandSelect5g(nr);
    } catch {
      setBandList([]);
      setBandSelect4g([]);
      setBandSelect5g([]);
      setLteOptions([]);
      setNrOptions([]);
    }
    setLoading(false);
  };
  useEffect(() => {
    let cancel = false;
    const doQuery = () => { if (!cancel) fetchBandSupport(); };
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

  // 设置频段
  const handleSetBand = async () => {
    setLoading(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      // 合并4G/5G频段编码
      const bands: number[] = [
        ...bandSelect4g.map(b => b + 100), // 4G编码
        ...bandSelect5g.map(b => Number('50' + b)), // 5G编码
      ];
      const cmds = setBandSupportCmd(realGroup, bands);
      for (const cmd of Array.isArray(cmds) ? cmds : [cmds]) {
        await safeSendAT(cmd);
      }
      message.success('频段设置成功');
      fetchBandSupport();
    } catch (e) {
      message.error('设置失败: ' + e);
    }
    setLoading(false);
  };
  // 恢复出厂频段
  const handleRestoreBand = async () => {
    setLoading(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      await safeSendAT(restoreBandCmd(realGroup));
      message.success('已恢复出厂频段');
      fetchBandSupport();
    } catch (e) {
      message.error('恢复失败: ' + e);
    }
    setLoading(false);
  };

  // 展示时区分4G/5G
  const band4g = bandList.filter(b => b >= 101 && b < 200).map(b => b - 100);
  const band5g = bandList.filter(b => String(b).startsWith('50')).map(b => Number(String(b).slice(2)));

  return (
    <Card
      title={
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ lineHeight: '32px' }}>锁频段配置</span>
          <span
            style={{
              background: 'var(--ant-color-fill-tertiary)',
              borderRadius: 4,
              padding: '0 8px',
              height: 24,
              display: 'inline-flex',
              alignItems: 'center',
              marginLeft: 12,
              fontSize: 12,
              color: 'var(--ant-color-text-secondary)',
              fontWeight: 'normal',
              lineHeight: '32px',
            }}
          >
            设备支持的4G/5G频段列表
          </span>
        </span>
      }
      loading={loading}
      className="my-card"
    >
      <div style={{ marginBottom: 0 }}>
        <Descriptions
          bordered
          column={1}
          styles={{ label: { width: 80, fontSize: 16 }, content: { fontSize: 16 } }}
          style={{ marginBottom: 0 }}
        >
          <Descriptions.Item label="4G">
            {band4g.length > 0
              ? band4g.map(b => (
                <Tag color="blue" key={b} style={{ fontSize: 16, padding: '0px 12px', lineHeight: '28px', marginBottom: 3, marginTop: 3 }}>
                  {`B${b}`}
                </Tag>
              ))
              : <span style={{ color: 'var(--ant-color-text-secondary)' }}>无</span>
            }
          </Descriptions.Item>
          <Descriptions.Item label="5G">
            {band5g.length > 0
              ? band5g.map(b => (
                <Tag color="green" key={b} style={{ fontSize: 16, padding: '0px 12px', lineHeight: '28px', marginBottom: 3, marginTop: 3 }}>
                  {`N${b}`}
                </Tag>
              ))
              : <span style={{ color: 'var(--ant-color-text-secondary)' }}>无</span>
            }
          </Descriptions.Item>
        </Descriptions>
      </div>

      <Form layout="vertical" style={{}}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Form.Item label="4G频段选择" style={{ width: '100%', fontSize: 14, marginTop: 16, marginBottom: 0 }}>
              <Select
                mode="multiple"
                value={bandSelect4g}
                onChange={setBandSelect4g}
                style={{ width: '100%' }}
                options={lteOptions}
                placeholder="请选择4G频段"
              />
            </Form.Item>
          </Col>
          <Col flex="auto">
            <Form.Item label="5G频段选择" style={{ width: '100%', fontSize: 14, marginTop: 16, marginBottom: 0 }}>
              <Select
                mode="multiple"
                value={bandSelect5g}
                onChange={setBandSelect5g}
                style={{ width: '100%' }}
                options={nrOptions}
                placeholder="请选择5G频段"
              />
            </Form.Item>
          </Col>
        </Row>
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', marginTop: 16 }}>
          <Button className="my-btn" onClick={handleRestoreBand} danger size="small" style={{ marginRight: 8 }}>恢复出厂</Button>
          <Button className="my-btn" onClick={handleSetBand} type="primary" size="small">设置配置</Button>
        </div>
      </Form>
    </Card>
  );
}

function LockCellCard({ isQuectel }: { isQuectel: boolean }): React.ReactNode {
  const { ip, port } = useWebSocketConfig();
  const [loading, setLoading] = useState(false);
  const [querying, setQuerying] = useState(false);
  // mode类型改为 '0' | '1'
  const [mode, setMode] = useState<'0' | '1'>('0'); // 0=关闭，1=开启
  const [rat, setRat] = useState<'lte' | 'nr'>('lte');
  const [lockType, setLockType] = useState('pci');
  const [pci, setPci] = useState('');
  const [freq, setFreq] = useState('');
  const [subcarrierSpacing, setSubcarrierSpacing] = useState(0); // 0=15kHz, 1=30kHz
  const [band, setBand] = useState<number | undefined>(undefined);
  const [desc, setDesc] = useState('');
  const { message } = App.useApp();

  // 频率间隔选项
  const subcarrierOptions = [
    { label: '15kHz', value: 0 },
    { label: '30kHz', value: 1 },
  ];

  // 频点输入后自动判断4G/5G及band
  useEffect(() => {
    if (freq) {
      const bandInfo = parseLockCellBand(Number(freq));
      setRat(bandInfo.lteOrNr);
      setBand(bandInfo.band);
    } else {
      setBand(undefined);
    }
  }, [freq]);

  // 查询当前锁小区配置
  const fetchCurrentConfig = async () => {
    setQuerying(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const cmds = getLockCellStatusCmd(realGroup);
      let resp = '';
      for (const cmd of cmds) {
        resp += (await safeSendAT(cmd)) + '\n';
      }
      // 解析resp，填充表单
      const parsed = parseLockCellStatus(resp, realGroup);
      if (parsed) {
        setMode(parsed.mode);
        setRat(parsed.rat);
        setLockType('pci'); // 目前只支持锁PCI
        setFreq(parsed.freq);
        setPci(parsed.pci);
        setSubcarrierSpacing(parsed.subcarrierSpacing);
        setBand(parsed.band);
        setDesc('');
      } else {
        setDesc('未查到锁小区配置');
      }
    } catch (e) {
      message.error('查询失败: ' + e);
    }
    setQuerying(false);
  };

  useEffect(() => {
    let cancel = false;
    const doQuery = () => { if (!cancel) fetchCurrentConfig(); };
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

  // 设置锁小区
  const handleSet = async () => {
    if (mode === '1') {
      if (!pci || !freq) {
        message.error('请填写PCI和频点');
        return;
      }
      if (!band) {
        message.error('频点无效或不支持');
        return;
      }
    }
    setLoading(true);
    try {
      const params = {
        mode,
        lteOrNr: rat,
        pci,
        earfcn: rat === 'lte' ? freq : undefined,
        arfcn: rat === 'nr' ? freq : undefined,
        subcarrierSpacing: isQuectel && rat === 'nr' ? (subcarrierSpacing === 0 ? 15 : 30) : undefined,
        band,
      };
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const cmds = getLockCellCmd(realGroup, params);
      for (const cmd of cmds) {
        await safeSendAT(cmd);
      }
    } catch (e) {
      message.error('设置失败: ' + e);
    }
    setLoading(false);
  };

  // 关闭锁小区
  const handleClose = async () => {
    setLoading(true);
    try {
      const params = { mode: '0', lteOrNr: rat };
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const cmds = getLockCellCmd(realGroup, params);
      for (const cmd of cmds) {
        await safeSendAT(cmd);
      }
    } catch (e) {
      message.error('关闭失败: ' + e);
    }
    fetchCurrentConfig();
    setLoading(false);
  };

  // 查询参数范围
  const handleQueryRange = () => {
    message.info('频点范围请参考频段表，PCI范围0-1007');
  };

  // 表单布局
  return (
    <Card
      title={
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ lineHeight: '32px' }}>锁小区配置</span>
          <span
            style={{
              background: 'var(--ant-color-fill-tertiary)',
              borderRadius: 4,
              padding: '0 8px',
              height: 24,
              display: 'inline-flex',
              alignItems: 'center',
              marginLeft: 12,
              fontSize: 12,
              color: 'var(--ant-color-text-secondary)',
              fontWeight: 'normal',
              lineHeight: '32px',
            }}
          >
            强制UE注册特定的小区（单个小区锁定）
          </span>
        </span>
      }
      loading={loading}
      className="my-card"
    >
      <Form layout="vertical">
        <Row gutter={[16, 16]}>
          <Col span={12} style={{ }}>
            <Form.Item label="功能开关" required>
              <Select
                value={mode}
                onChange={v => setMode(v as '0' | '1')}
                options={[{ label: '打开', value: '1' }, { label: '关闭', value: '0' }]}
                style={{ width: '100%' }}
              />
            </Form.Item>
            {/* 只有mode为'1'时才显示后续配置 */}
            {mode === '1' && (
              <>
                <Form.Item label="加锁类型" required>
                  <Select
                    value={lockType}
                    onChange={setLockType}
                    options={[
                      { label: '锁PCI', value: 'pci' },
                      { label: '锁频点', value: 'earfcn' }, // 假设你有锁频点类型
                    ]}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
                {/* 只有锁类型为pci时才显示PCI输入框 */}
                {lockType === 'pci' && (
                  <Form.Item label="物理小区ID (PCI) - NR: 0-1007" required help={<span style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>锁PCI模式：指定要锁定的物理小区ID</span>}>
                    <Input
                      value={pci}
                      onChange={e => setPci(e.target.value.replace(/\D/g, ''))}
                      placeholder="输入目标PCI值"
                    />
                  </Form.Item>
                )}
              </>
            )}
          </Col>
          {/* 右侧内容同理，mode === 1 时才显示 */}
          {mode === '1' && (
            <Col span={12}>
              <Form.Item label="制式 (RAT)" required>
                <Select
                  value={rat}
                  onChange={v => setRat(v)}
                  options={[{ label: 'LTE', value: 'lte' }, { label: 'NR', value: 'nr' }]}
                  style={{ width: '100%' }}
                />
              </Form.Item>
              <Form.Item label="频点 (EARFCN)" required help={<span style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>锁PCI模式：指定频点下的目标PCI</span>}>
                <Input
                  value={freq}
                  onChange={e => setFreq(e.target.value.replace(/\D/g, ''))}
                  placeholder="输入频点值"
                  disabled={mode !== '1'}
                />
              </Form.Item>
              {isQuectel && rat === 'nr' && (
                <Form.Item label="子载波间隔" required>
                  <Select
                    value={subcarrierSpacing}
                    onChange={setSubcarrierSpacing}
                    options={subcarrierOptions}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              )}
            </Col>
          )}
        </Row>
        {/* 下面的按钮区等也要加mode === 1判断 */}
        {/* 按钮区无论mode为何都显示 */}
        <Row>
          <Col span={24}>
            <div style={{ margin: '16px 0 8px 0', color: 'var(--ant-color-warning)', fontSize: 14 }}>{desc || (band ? `当前识别为 ${rat === 'lte' ? '4G' : '5G'} Band ${band}` : '')}</div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
              <Button className="my-btn" type="primary" icon={<InfoCircleOutlined />} loading={loading} onClick={handleSet} disabled={mode === '1' && ((lockType === 'pci' && (!pci || !freq)) || (lockType === 'earfcn' && !freq))}>
                设置配置
              </Button>
              <Button className="my-btn" icon={<InfoCircleOutlined />} loading={querying} onClick={fetchCurrentConfig}>
                查询当前配置
              </Button>
              <Button className="my-btn" danger icon={<InfoCircleOutlined />} onClick={handleClose}>
                关闭锁小区
              </Button>
              <Button className="my-btn" onClick={handleQueryRange}>
                查询参数范围
              </Button>
            </div>
          </Col>
        </Row>
      </Form>
    </Card>
  );
}

function NeighbourCellCard() {
  const { ip, port } = useWebSocketConfig();
  const [loading, setLoading] = useState(false);
  const [cells, setCells] = useState<any[]>([]);
  const [cellScsMap, setCellScsMap] = useState<Record<string, 15 | 30>>({});
  const { message } = App.useApp();
  const { isMobile } = useResponsive();

  const fetchCells = async () => {
    setLoading(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const cmds = getNeighbourCellCmd(realGroup);
      let resp = '';
      for (const cmd of cmds) {
        resp += (await safeSendAT(cmd)) + '\n';
      }
      setCells(parseNeighbourCell(resp, realGroup));
    } catch {
      setCells([]);
    }
    setLoading(false);
  };
  useEffect(() => {
    let cancel = false;
    const doQuery = () => { if (!cancel) fetchCells(); };
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

  // 信号质量颜色
  const getColor = (val: number | undefined, type: 'rsrp' | 'rsrq' | 'rssi' | 'sinr') => {
    if (val === undefined) return 'var(--ant-color-fill-tertiary)';
    if (type === 'rsrp') {
      if (val > -80) return 'var(--ant-color-success)'; // 优秀
      if (val > -95) return 'var(--ant-color-primary)'; // 良好
      if (val > -110) return 'var(--ant-color-warning)'; // 一般
      return 'var(--ant-color-error)';
    }
    if (type === 'rsrq') {
      if (val > -10) return 'var(--ant-color-success)'; // 优秀
      if (val > -15) return 'var(--ant-color-primary)'; // 良好
      if (val > -20) return 'var(--ant-color-warning)'; // 一般
      return 'var(--ant-color-error)';
    }
    if (type === 'rssi') {
      if (val > -60) return 'var(--ant-color-success)'; // 优秀
      if (val > -70) return 'var(--ant-color-primary)'; // 良好
      if (val > -80) return 'var(--ant-color-warning)'; // 一般
      return 'var(--ant-color-error)';
    }
    if (type === 'sinr') {
      if (val > 20) return 'var(--ant-color-success)'; // 优秀
      if (val > 10) return 'var(--ant-color-primary)'; // 良好
      if (val > 0) return 'var(--ant-color-warning)'; // 一般
      return 'var(--ant-color-error)';
    }
    return 'var(--ant-color-fill-tertiary)';
  };
  const getDesc = (val: number | undefined, type: 'rsrp' | 'rsrq' | 'rssi' | 'sinr') => {
    if (val === undefined) return '';
    if (type === 'rsrp') {
      if (val > -80) return '（优秀）';
      if (val > -95) return '（良好）';
      if (val > -110) return '（一般）';
      return '（较差）';
    }
    if (type === 'rsrq') {
      if (val > -10) return '（优秀）';
      if (val > -15) return '（良好）';
      if (val > -20) return '（一般）';
      return '（较差）';
    }
    if (type === 'rssi') {
      if (val > -60) return '（优秀）';
      if (val > -70) return '（良好）';
      if (val > -80) return '（一般）';
      return '（较差）';
    }
    if (type === 'sinr') {
      if (val > 20) return '（优秀）';
      if (val > 10) return '（良好）';
      if (val > 0) return '（一般）';
      return '（较差）';
    }
    return '';
  };
  return (
    <Card
      className="my-card"
      title={<span>邻区扫描 <Tooltip
        styles={{ body: { maxWidth: 320 } }}
        title={<div style={{ fontSize: 14, lineHeight: 1.7 }}>
          <div>先在上方设置并锁定目标频点，再进行邻区扫描，可以更容易找到需要的小区</div>
          <div style={{ margin: '8px 0 0 0', fontWeight: 'bold' }}>4G建议值：</div>
          <ul style={{ margin: 0, paddingLeft: 20, listStyleType: 'disc' }}>
            <li>信号强度(RSRP) &gt; -100dBm</li>
            <li>信号质量(RSRQ) &gt; -15dB</li>
          </ul>
          <div style={{ margin: '8px 0 0 0', fontWeight: 'bold' }}>5G建议值：</div>
          <ul style={{ margin: 0, paddingLeft: 20, listStyleType: 'disc' }}>
            <li>信号强度(RSRP) &gt; -110dBm</li>
            <li>信号质量(RSRQ) &gt; -18dB</li>
            <li>信噪比(SINR) &gt; 0dB</li>
          </ul>
        </div>}
      ><InfoCircleOutlined /></Tooltip></span>}
      extra={<Button className="my-btn" type="primary" onClick={fetchCells} loading={loading}>扫描邻区</Button>}
    >
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 16,
        width: '100%',
        justifyContent: 'start'
      }}>
        {cells.length === 0 && <div style={{
          gridColumn: '1 / -1',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0px 0'
        }}>
          <img src="/icons/zanwuxinxi.svg" alt="暂无邻区数据" style={{ width: 128, height: 128, marginBottom: 8, opacity: 0.6 }} />
          <div style={{ fontSize: 14, color: 'var(--ant-color-text-secondary)' }}>暂无邻区数据</div>
        </div>}
        {cells.filter(cell => cell.pci !== -1).map((cell, idx) => {
          const isNr = String(cell.rat || '').toLowerCase().includes('nr');
          const cellKey = `${cell.rat}-${cell.earfcn}-${cell.pci}-${idx}`;
          const selectedScs = cellScsMap[cellKey] || 30;
          return (
          <div
            key={cellKey}
            style={{
              background: 'var(--ant-color-fill-tertiary)', // 更淡底色
              borderRadius: 6,
              padding: '2px 10px 10px 10px', // 四周一致
              boxShadow: '0 1px 4px var(--ant-color-fill-tertiary)',
              marginBottom: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              minWidth: isMobile ? 'auto' : 240,
              maxWidth: isMobile ? 'none' : 280,
              width: '100%',
              justifyContent: 'center',
            }}
            className="my-inline-div"
          >
            <div style={{ fontWeight: 'bold', fontSize: 14, color: 'var(--ant-color-primary)', marginBottom: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <span style={{ padding: 0 }}>{cell.rat} {cell.band ? (cell.rat.startsWith('N') || cell.rat === 'NR5G' || cell.rat === 'NR' ? `n${cell.band}` : `B${cell.band}`) : ''}</span>
              <Button
                className="my-btn"
                type="link"
                style={{ color: 'var(--ant-color-primary)', fontWeight: 'bold', fontSize: 14, padding: 0 }}
                onClick={async () => {
                  // 锁定小区逻辑，参数取自cell
                  try {
                    const params = {
                      mode: '1',
                      lteOrNr: isNr ? 'nr' : 'lte',
                      pci: cell.pci,
                      earfcn: isNr ? undefined : cell.earfcn,
                      arfcn: isNr ? cell.earfcn : undefined,
                      subcarrierSpacing: isNr ? selectedScs : undefined,
                      band: cell.band,
                    };
                    await ensureGroupReady(ip, port);
                    const realGroup = await getCurrentGroupAsync(ip, port);
                    const cmds = getLockCellCmd(realGroup, params);
                    for (const cmd of cmds) {
                      const resp = await safeSendAT(cmd);
                      if (/\+CME ERROR|\bERROR\b|\bBUSY\b/i.test(resp)) {
                        throw resp.trim() || 'AT命令执行失败';
                      }
                    }
                    message.success('锁定小区成功');
                  } catch (e) {
                    message.error('锁定失败: ' + e);
                  }
                }}
              >锁定</Button>
            </div>
            <div style={{ fontSize: 12, marginBottom: 4, width: '100%', textAlign: 'left' }}>PCI: {cell.pci} | {cell.earfcn}</div>
            {isNr && (
              <div
                style={{
                  width: '100%',
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', whiteSpace: 'nowrap' }}>
                  SCS
                </div>
                <Radio.Group
                  size="small"
                  value={selectedScs}
                  onChange={e => setCellScsMap(prev => ({ ...prev, [cellKey]: e.target.value }))}
                  optionType="button"
                  buttonStyle="solid"
                  style={{ display: 'flex', flex: 1, justifyContent: 'flex-end' }}
                >
                  {[15, 30].map(value => (
                    <Radio.Button
                      key={value}
                      value={value}
                      style={{
                        minWidth: 64,
                        textAlign: 'center',
                        fontWeight: selectedScs === value ? 700 : 500,
                      }}
                    >
                      {value} kHz
                    </Radio.Button>
                  ))}
                </Radio.Group>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'stretch', width: '100%' }}>
              {/* 信号行整体左右对齐，彩色块高度统一 */}
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 0, width: '100%' }}>
                <span style={{ width: 32, fontSize: 12, textAlign: 'left', marginRight: 8 }}>RSRP:</span>
                <span style={{ background: getColor(cell.rsrp, 'rsrp'), color: '#fff', borderRadius: 2, flex: 1, padding: '0', fontSize: 12, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {cell.rsrp !== undefined ? `${cell.rsrp}dBm` : '-'} {getDesc(cell.rsrp, 'rsrp')}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 0, width: '100%' }}>
                <span style={{ width: 32, fontSize: 12, textAlign: 'left', marginRight: 8 }}>RSRQ:</span>
                <span style={{ background: getColor(cell.rsrq, 'rsrq'), color: '#fff', borderRadius: 2, flex: 1, padding: '0', fontSize: 12, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {cell.rsrq !== undefined ? `${cell.rsrq}dB` : '-'} {getDesc(cell.rsrq, 'rsrq')}
                </span>
              </div>
              {/* SINR和RSSI合并显示：优先SINR，无则RSSI，都无则不显示 */}
              {cell.sinr !== undefined ? (
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 0, width: '100%' }}>
                  <span style={{ width: 32, fontSize: 12, textAlign: 'left', marginRight: 8 }}>SINR:</span>
                  <span style={{ background: getColor(cell.sinr, 'sinr'), color: '#fff', borderRadius: 2, flex: 1, padding: '0', fontSize: 12, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {`${cell.sinr}dB`} {getDesc(cell.sinr, 'sinr')}
                  </span>
                </div>
              ) : cell.rssi !== undefined ? (
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 0, width: '100%' }}>
                  <span style={{ width: 32, fontSize: 12, textAlign: 'left', marginRight: 8 }}>RSSI:</span>
                  <span style={{ background: getColor(cell.rssi, 'rssi'), color: '#fff', borderRadius: 2, flex: 1, padding: '0', fontSize: 12, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {`${cell.rssi}dBm`} {getDesc(cell.rssi, 'rssi')}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
          );
        })}
      </div>
    </Card>
  );
} 
