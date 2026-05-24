import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, Card, Col, Descriptions, Progress, Row, Space, Table, Tag, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ApartmentOutlined,
  CheckCircleOutlined,
  CloudServerOutlined,
  DashboardOutlined,
  ExperimentOutlined,
  FireOutlined,
  LockOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useWebSocketConfig } from '@/contexts/WebSocketConfigContext';
import wsService from '@/services/websocket';
import {
  getIpAddrCmd,
  getLockCellStatusCmd,
  getNetworkTypeCmd,
  getPdpActiveCmd,
  getPdpListCmd,
  getQCAINFOCmd,
  getQRSRPCmd,
  getQRSRQCmd,
  getQSINRCmd,
  getRegStatusCmd,
  getRSSICmd,
  getTempCmds,
  parseIpAddr,
  parseLockCellStatus,
  parseNetworkType,
  parsePdpActive,
  parsePdpList,
  parseQCAINFO,
  parseQRSRP,
  parseQRSRQ,
  parseQSINR,
  parseRegStatus,
  parseRSSI,
  parseTemp,
} from '@/utils/atModule';
import { ensureGroupReady, getCurrentGroupAsync, safeSendAT } from '@/utils/atQueue';
import { getSignalColor } from '@/utils/formatUtils';
import { useScrollReset } from '@/hooks/useScrollReset';

type Level = 'success' | 'warning' | 'error' | 'processing' | 'default';

type DiagnosticItem = {
  key: string;
  title: string;
  status: Level;
  value: string;
  detail: string;
};

type SignalState = {
  rsrp?: number;
  sinr?: number;
  rsrq?: number;
  csq?: number;
  csqDbm?: number | string;
};

const regStatusMap: Record<number, { text: string; status: Level; detail: string }> = {
  0: { text: '未注册，未搜索', status: 'warning', detail: '模组当前没有注册到网络，也没有主动搜索网络。' },
  1: { text: '已注册，本地网络', status: 'success', detail: '蜂窝网络注册正常。' },
  2: { text: '未注册，正在搜索', status: 'processing', detail: '模组正在搜索网络，短时间内可能正常。' },
  3: { text: '注册被拒', status: 'error', detail: '运营商或网络侧拒绝注册，建议检查 SIM、套餐、IMEI、锁频锁小区和网络模式。' },
  4: { text: '未知或超出覆盖', status: 'warning', detail: '注册状态未知，通常和弱覆盖、网络模式不匹配或基站不可用有关。' },
  5: { text: '已注册，漫游网络', status: 'success', detail: '蜂窝网络已注册到漫游网络。' },
  6: { text: '已注册，仅短信本地网络', status: 'warning', detail: '仅短信业务注册，数据业务可能不可用。' },
  7: { text: '已注册，仅短信漫游网络', status: 'warning', detail: '仅短信漫游注册，数据业务可能不可用。' },
  8: { text: '仅紧急业务', status: 'error', detail: '只能使用紧急业务，普通数据业务不可用。' },
  9: { text: '已注册，CSFB 非优先本地网络', status: 'warning', detail: '语音回落能力非优先，数据业务通常仍可用。' },
  10: { text: '已注册，CSFB 非优先漫游网络', status: 'warning', detail: '语音回落能力非优先且处于漫游网络。' },
};

const levelOrder: Record<Level, number> = {
  error: 4,
  warning: 3,
  processing: 2,
  success: 1,
  default: 0,
};

function tagColor(status: Level) {
  if (status === 'success') return 'success';
  if (status === 'warning') return 'warning';
  if (status === 'error') return 'error';
  if (status === 'processing') return 'processing';
  return 'default';
}

function signalText(value: number | undefined, type: 'rsrp' | 'sinr' | 'rsrq') {
  if (value === undefined || Number.isNaN(value)) return { text: '未知', status: 'default' as Level };
  if (type === 'rsrp') {
    if (value >= -85) return { text: '极佳', status: 'success' as Level };
    if (value >= -95) return { text: '良好', status: 'success' as Level };
    if (value >= -105) return { text: '一般', status: 'warning' as Level };
    return { text: '较差', status: 'error' as Level };
  }
  if (type === 'sinr') {
    if (value >= 20) return { text: '极佳', status: 'success' as Level };
    if (value >= 10) return { text: '良好', status: 'success' as Level };
    if (value >= 0) return { text: '一般', status: 'warning' as Level };
    return { text: '较差', status: 'error' as Level };
  }
  if (value >= -10) return { text: '极佳', status: 'success' as Level };
  if (value >= -15) return { text: '良好', status: 'success' as Level };
  if (value >= -20) return { text: '一般', status: 'warning' as Level };
  return { text: '较差', status: 'error' as Level };
}

function splitIp(info: any) {
  const rawValues = [info?.ipv4, info?.ipv6Hex, info?.ipv6]
    .filter(Boolean)
    .flatMap(value => String(value).split(',').map(item => item.trim()).filter(Boolean));
  return {
    ipv4: rawValues.find(value => value.includes('.')),
    ipv6: rawValues.find(value => value.includes(':')),
  };
}

function formatLock(lockInfo: any) {
  if (!lockInfo || lockInfo.mode === '0') {
    return { text: '未锁小区', status: 'success' as Level, detail: '当前没有启用小区锁定，模组可自动选择可用小区。' };
  }
  if (lockInfo.rat === 'nr') {
    return {
      text: '已锁 5G 小区',
      status: 'warning' as Level,
      detail: `PCI ${lockInfo.pci || '-'}，ARFCN ${lockInfo.freq || '-'}，SCS ${lockInfo.subcarrierSpacing === 0 ? '15 kHz' : '30 kHz'}，N${lockInfo.band || '-'}`,
    };
  }
  return {
    text: '已锁 4G 小区',
    status: 'warning' as Level,
    detail: `PCI ${lockInfo.pci || '-'}，EARFCN ${lockInfo.freq || '-'}，B${lockInfo.band || '-'}`,
  };
}

export default function AdvancedDiagnostics() {
  const { ip, port } = useWebSocketConfig();
  const { message } = App.useApp();
  const { token } = theme.useToken();
  useScrollReset();

  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState('');
  const [networkType, setNetworkType] = useState('');
  const [regStatus, setRegStatus] = useState<number | undefined>(undefined);
  const [signal, setSignal] = useState<SignalState>({});
  const [pdpList, setPdpList] = useState<any[]>([]);
  const [activeMap, setActiveMap] = useState<Record<number, boolean>>({});
  const [ipInfo, setIpInfo] = useState<{ ipv4?: string; ipv6?: string }>({});
  const [carrierAgg, setCarrierAgg] = useState<any>(null);
  const [temps, setTemps] = useState<any[]>([]);
  const [lockInfo, setLockInfo] = useState<any>(null);
  const mountedRef = useRef(true);

  const fetchAll = async () => {
    setLoading(true);
    try {
      await ensureGroupReady(ip, port);
      const group = await getCurrentGroupAsync(ip, port);

      const netRaw = await safeSendAT(getNetworkTypeCmd(group));
      const regCmds = getRegStatusCmd(group);
      let nextReg: number | undefined;
      for (const cmd of regCmds) {
        const raw = await safeSendAT(cmd);
        const parsed = parseRegStatus(raw, group);
        if (parsed !== undefined) {
          nextReg = parsed;
          break;
        }
      }

      const rsrpRaw = await safeSendAT(getQRSRPCmd(group));
      const sinrRaw = await safeSendAT(getQSINRCmd(group));
      const rsrqRaw = await safeSendAT(getQRSRQCmd(group));
      const csqRaw = await safeSendAT(getRSSICmd(group));

      const pdpRaw = await safeSendAT(getPdpListCmd(group));
      const activeRaw = await safeSendAT(getPdpActiveCmd(group));

      const ipCmds = getIpAddrCmd(group);
      let ipRaw = '';
      for (const cmd of ipCmds) ipRaw += `${await safeSendAT(cmd)}\n`;

      const qcaRaws: string[] = [];
      for (const cmd of getQCAINFOCmd(group)) qcaRaws.push(await safeSendAT(cmd));

      const tempRaws: string[] = [];
      for (const cmd of getTempCmds(group)) tempRaws.push(await safeSendAT(cmd));

      const lockCmds = getLockCellStatusCmd(group);
      let lockRaw = '';
      for (const cmd of lockCmds) lockRaw += `${await safeSendAT(cmd)}\n`;

      if (!mountedRef.current) return;
      setNetworkType(parseNetworkType(netRaw, group) || '');
      setRegStatus(nextReg);
      const csq = parseRSSI(csqRaw, group) as { rssi?: number; dBm?: number | string };
      setSignal({
        rsrp: parseQRSRP(rsrpRaw, group)?.value,
        sinr: parseQSINR(sinrRaw, group)?.value,
        rsrq: parseQRSRQ(rsrqRaw, group)?.value,
        csq: csq.rssi,
        csqDbm: csq.dBm,
      });
      setPdpList(parsePdpList(pdpRaw, group));
      setActiveMap(parsePdpActive(activeRaw, group));
      setIpInfo(splitIp(parseIpAddr(ipRaw, group)));
      setCarrierAgg(parseQCAINFO(qcaRaws, group));
      setTemps(parseTemp(tempRaws, group).filter((item: any) => item.value > 0 && item.value < 150));
      setLockInfo(parseLockCellStatus(lockRaw, group));
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (e) {
      message.error(`诊断刷新失败: ${e}`);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    const doQuery = () => fetchAll();
    if (wsService.getStatus && wsService.getStatus() === 'open') {
      doQuery();
    } else {
      wsService.addOnOpenCallback(doQuery);
    }
    return () => {
      mountedRef.current = false;
      wsService.removeOnOpenCallback(doQuery);
    };
  }, [ip, port]);

  const diagnostics = useMemo<DiagnosticItem[]>(() => {
    const reg = regStatus !== undefined ? regStatusMap[regStatus] : undefined;
    const rsrp = signalText(signal.rsrp, 'rsrp');
    const sinr = signalText(signal.sinr, 'sinr');
    const rsrq = signalText(signal.rsrq, 'rsrq');
    const activeCid = pdpList.filter(item => activeMap[item.cid]);
    const maxTemp = temps.length ? Math.max(...temps.map(item => item.value)) : undefined;
    const tempStatus: Level = maxTemp === undefined ? 'default' : maxTemp >= 75 ? 'error' : maxTemp >= 55 ? 'warning' : 'success';
    const lock = formatLock(lockInfo);
    const hasCarrier = Boolean(carrierAgg?.pcc);
    const hasIpv4 = Boolean(ipInfo.ipv4);
    const hasIpv6 = Boolean(ipInfo.ipv6);

    return [
      {
        key: 'reg',
        title: '网络注册',
        status: reg?.status || 'default',
        value: reg?.text || '未知',
        detail: reg?.detail || '暂未读取到注册状态。',
      },
      {
        key: 'rat',
        title: '当前制式',
        status: networkType ? 'success' : 'default',
        value: networkType || '未知',
        detail: networkType ? '模组已经返回当前接入制式。' : '暂未读取到当前网络制式。',
      },
      {
        key: 'signal',
        title: '信号质量',
        status: [rsrp.status, sinr.status, rsrq.status].sort((a, b) => levelOrder[b] - levelOrder[a])[0],
        value: `RSRP ${rsrp.text} / SINR ${sinr.text} / RSRQ ${rsrq.text}`,
        detail: `RSRP ${signal.rsrp ?? '未知'} dBm，SINR ${signal.sinr ?? '未知'} dB，RSRQ ${signal.rsrq ?? '未知'} dB。`,
      },
      {
        key: 'pdp',
        title: 'PDP 数据会话',
        status: activeCid.length ? 'success' : 'error',
        value: activeCid.length ? `已激活 ${activeCid.length} 个 CID` : '未激活',
        detail: activeCid.length ? `已激活 CID：${activeCid.map(item => item.cid).join('、')}。` : '没有检测到已激活 PDP，会导致数据网络不可用。',
      },
      {
        key: 'ip',
        title: 'IP 地址',
        status: hasIpv4 || hasIpv6 ? (hasIpv6 ? 'success' : 'warning') : 'error',
        value: hasIpv6 ? 'IPv4/IPv6 可用' : hasIpv4 ? '仅 IPv4' : '未获取 IP',
        detail: `IPv4：${ipInfo.ipv4 || '未知'}；IPv6：${ipInfo.ipv6 || '未知'}。`,
      },
      {
        key: 'carrier',
        title: '载波聚合',
        status: hasCarrier ? 'success' : 'default',
        value: hasCarrier ? `主载波${carrierAgg?.scc?.length ? ` + ${carrierAgg.scc.length} 个辅载波` : ''}` : '暂无载波信息',
        detail: hasCarrier ? `主载波频段：${carrierAgg.pcc?.band || '-'}，频点：${carrierAgg.pcc?.earfcn || '-'}。` : '未读取到 QCAINFO 主载波信息。',
      },
      {
        key: 'temp',
        title: '模组温度',
        status: tempStatus,
        value: maxTemp === undefined ? '未知' : `${maxTemp} ℃`,
        detail: maxTemp === undefined ? '暂未读取到温度。' : maxTemp >= 75 ? '温度偏高，建议检查散热。' : maxTemp >= 55 ? '温度略高，长时间高负载时建议关注。' : '温度正常。',
      },
      {
        key: 'lock',
        title: '锁定限制',
        status: lock.status,
        value: lock.text,
        detail: lock.detail,
      },
    ];
  }, [activeMap, carrierAgg, ipInfo, lockInfo, networkType, pdpList, regStatus, signal, temps]);

  const worst = [...diagnostics].sort((a, b) => levelOrder[b.status] - levelOrder[a.status])[0];

  const pdpColumns: ColumnsType<any> = [
    { title: 'CID', dataIndex: 'cid', width: 70 },
    { title: '协议类型', dataIndex: 'type', render: value => value || '-' },
    { title: 'APN', dataIndex: 'apn', render: value => value || '-' },
    { title: '激活状态', dataIndex: 'cid', render: cid => <Tag color={activeMap[cid] ? 'success' : 'default'}>{activeMap[cid] ? '已激活' : '未激活'}</Tag> },
    { title: '固定地址', dataIndex: 'addr', render: value => value || '-' },
  ];

  const tempColumns: ColumnsType<any> = [
    { title: '模块', dataIndex: 'name', render: (value, record) => `${value}${record.description ? `（${record.description}）` : ''}` },
    {
      title: '温度',
      dataIndex: 'value',
      width: 120,
      render: value => <Tag color={value >= 75 ? 'error' : value >= 55 ? 'warning' : 'success'}>{value} ℃</Tag>,
    },
  ];

  return (
    <Card
      className="my-card"
      title={
        <Space>
          <ExperimentOutlined />
          <span>诊断 / 高级信息</span>
          {lastRefresh && <Tag color="processing">最后刷新 {lastRefresh}</Tag>}
        </Space>
      }
      extra={<Button className="my-btn" icon={<ReloadOutlined />} loading={loading} onClick={fetchAll}>刷新诊断</Button>}
    >
      <Alert
        type={worst?.status === 'error' ? 'error' : worst?.status === 'warning' ? 'warning' : 'success'}
        showIcon
        style={{ marginBottom: 16 }}
        message={worst?.status === 'error' ? '检测到需要处理的问题' : worst?.status === 'warning' ? '检测到需要关注的项目' : '当前关键状态正常'}
        description={worst ? `${worst.title}：${worst.value}。${worst.detail}` : '暂无诊断结果。'}
      />

      <Row gutter={[16, 16]}>
        {diagnostics.map(item => (
          <Col xs={24} md={12} xl={6} key={item.key}>
            <Card
              className="my-inline-card"
              style={{ height: '100%', borderTop: `3px solid ${item.status === 'error' ? token.colorError : item.status === 'warning' ? token.colorWarning : item.status === 'success' ? token.colorSuccess : token.colorBorder}` }}
              styles={{ body: { minHeight: 118 } }}
            >
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                  <span style={{ fontWeight: 600 }}>{item.title}</span>
                  <Tag color={tagColor(item.status)}>{item.value}</Tag>
                </Space>
                <div style={{ color: token.colorTextSecondary, lineHeight: 1.6 }}>{item.detail}</div>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card className="my-inline-card" title={<><DashboardOutlined /> 信号原始指标</>}>
            <Row gutter={[16, 16]}>
              {[
                { label: 'RSRP 参考信号接收功率', value: signal.rsrp, unit: 'dBm', type: 'rsrp' as const },
                { label: 'SINR 信噪比', value: signal.sinr, unit: 'dB', type: 'sinr' as const },
                { label: 'RSRQ 参考信号接收质量', value: signal.rsrq, unit: 'dB', type: 'rsrq' as const },
              ].map(item => {
                const s = signalText(item.value, item.type);
                return (
                  <Col span={8} key={item.label}>
                    <div style={{ fontSize: 12, color: token.colorTextSecondary }}>{item.label}</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: getSignalColor(item.value, item.type) }}>{item.value ?? '-'}</div>
                    <Tag color={tagColor(s.status)}>{s.text}</Tag>
                    <span style={{ marginLeft: 6, color: token.colorTextSecondary }}>{item.unit}</span>
                  </Col>
                );
              })}
            </Row>
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>CSQ 回退信号强度</span>
                <span>{signal.csq ?? '未知'} / {signal.csqDbm ?? '未知'} dBm</span>
              </div>
              <Progress percent={signal.csq !== undefined && signal.csq !== 99 ? Math.round(signal.csq / 31 * 100) : 0} showInfo={false} />
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card className="my-inline-card" title={<><ApartmentOutlined /> 小区与载波</>}>
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="主载波频段">{carrierAgg?.pcc?.band || '-'}</Descriptions.Item>
              <Descriptions.Item label="主载波频点">{carrierAgg?.pcc?.earfcn || carrierAgg?.pcc?.arfcn || '-'}</Descriptions.Item>
              <Descriptions.Item label="主载波 PCI">{carrierAgg?.pcc?.pci || '-'}</Descriptions.Item>
              <Descriptions.Item label="主载波带宽">{carrierAgg?.pcc?.bw || carrierAgg?.pcc?.dl_bw || '-'}</Descriptions.Item>
              <Descriptions.Item label="辅载波数量">{carrierAgg?.scc?.length || 0}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card className="my-inline-card" title={<><CloudServerOutlined /> PDP / IP 诊断</>}>
            <Descriptions bordered column={1} size="small" style={{ marginBottom: 12 }}>
              <Descriptions.Item label="IPv4 地址">{ipInfo.ipv4 || '未知'}</Descriptions.Item>
              <Descriptions.Item label="IPv6 地址">{ipInfo.ipv6 || '未知'}</Descriptions.Item>
            </Descriptions>
            <Table size="small" rowKey="cid" columns={pdpColumns} dataSource={pdpList} pagination={false} />
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card className="my-inline-card" title={<><FireOutlined /> 温度与限制</>}>
            <Descriptions bordered column={1} size="small" style={{ marginBottom: 12 }}>
              <Descriptions.Item label={<><LockOutlined /> 锁定状态</>}>{formatLock(lockInfo).text}</Descriptions.Item>
              <Descriptions.Item label={<><CheckCircleOutlined /> 注册状态</>}>{regStatus !== undefined ? regStatusMap[regStatus]?.text || `未知状态 ${regStatus}` : '未知'}</Descriptions.Item>
              <Descriptions.Item label={<><WarningOutlined /> 当前制式</>}>{networkType || '未知'}</Descriptions.Item>
            </Descriptions>
            <Table size="small" rowKey={(record) => `${record.name}-${record.description}`} columns={tempColumns} dataSource={temps} pagination={false} />
          </Card>
        </Col>
      </Row>
    </Card>
  );
}
