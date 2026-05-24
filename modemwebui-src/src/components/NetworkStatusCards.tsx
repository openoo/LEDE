import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { App, Button, Card, Col, InputNumber, Row } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useWebSocketConfig } from '@/contexts/WebSocketConfigContext';
import wsService from '@/services/websocket';
import { ensureGroupReady, getCurrentGroupAsync, safeSendAT } from '@/utils/atQueue';
import {
  getIccidCmd,
  getImsiCmd,
  getOperatorCmd,
  getQCAINFOCmd,
  getSignedRateCmds,
  getSimNumCmd,
  getTempCmds,
  getVoltageCmd,
  parseIccid,
  parseImsi,
  parseOperator,
  parseQCAINFO,
  parseSignedRate,
  parseSimNum,
  parseTemp,
  parseVoltage,
} from '@/utils/atModule';
import { getLteBandByEarfcn, getNrBandByArfcn } from '@/utils/formatUtils';

export function NetworkSpeedCard() {
  // 共享数据状态
  const { ip, port } = useWebSocketConfig();
  const [signedRate, setSignedRate] = useState<any>(null);
  const [operator, setOperator] = useState<string>('');
  const [apn, setApn] = useState<string>('');

  // 查询签约速率和运营商
  const fetchSigned = async () => {
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const cmds = getSignedRateCmds(realGroup);
      const results = [];
      for (const cmd of cmds) {
        results.push(await safeSendAT(cmd));
      }
      const info = parseSignedRate(results, realGroup);
      setSignedRate(info);
      setApn(info?.apn || '');
    } catch { }
  };
  const fetchOperator = async () => {
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const cmds = getOperatorCmd(realGroup);
      const results = [];
      for (const cmd of cmds) {
        results.push(await safeSendAT(cmd));
      }
      setOperator(parseOperator(results, realGroup) || '');
    } catch { }
  };
  useEffect(() => {
    let cancel = false;
    const doQuery = () => {
      if (!cancel) {
        fetchSigned();
        fetchOperator();
      }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ip, port]);

  return (
    <Card
      className="my-card"
      title={
        <>
          <span>签约速率</span>
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
            展示运营商下发的签约上下行能力
          </span>
        </>
      }
      style={{ marginTop: 0 }}
      styles={{ body: { padding: 24 } }}
    >
      <CurrentNetworkCard signedRate={signedRate} operator={operator} apn={apn} />
    </Card>
  );
}

function CurrentNetworkCard({ signedRate, operator, apn }: { signedRate: any, operator: string, apn: string }) {
  const operatorIconMap: Record<string, string> = {
    中国移动: '/icons/china_mobile.png',
    中国联通: '/icons/china_unicom.png',
    中国电信: '/icons/china_telecom.png',
    中国广电: '/icons/china_broadcast.png',
  };
  const itemStyle: React.CSSProperties = {
    minWidth: 140,
    flex: '1 1 0',
    border: '1px solid var(--ant-color-border-secondary)',
    borderRadius: 10,
    padding: '10px 12px',
    background: 'var(--ant-color-bg-container)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 58,
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--ant-color-text-secondary)', marginBottom: 4 };
  const valueStyle: React.CSSProperties = { fontSize: 18, fontWeight: 700, lineHeight: 1.1 };

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', flexWrap: 'wrap' }}>
      <div style={itemStyle}>
        <div>
          <div style={labelStyle}>运营商</div>
          <div style={{ ...valueStyle, fontSize: 16 }}>{operator || '-'}</div>
        </div>
        {operatorIconMap[operator] && (
          <img src={operatorIconMap[operator]} alt={operator} style={{ width: 34, height: 34, flex: '0 0 auto' }} />
        )}
      </div>
      <div style={itemStyle}>
        <div>
          <div style={labelStyle}>上行速率</div>
          <div style={{ ...valueStyle, color: 'var(--ant-color-success)' }}>{signedRate?.up || '-'}</div>
        </div>
        <span style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', alignSelf: 'flex-end' }}>Mbps</span>
      </div>
      <div style={itemStyle}>
        <div>
          <div style={labelStyle}>下行速率</div>
          <div style={{ ...valueStyle, color: 'var(--ant-color-primary)' }}>{signedRate?.down || '-'}</div>
        </div>
        <span style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', alignSelf: 'flex-end' }}>Mbps</span>
      </div>
      <div style={itemStyle}>
        <div>
          <div style={labelStyle}>APN</div>
          <div style={{ ...valueStyle, fontSize: 15, wordBreak: 'break-all' }}>{apn || '-'}</div>
        </div>
      </div>
      <div style={itemStyle}>
        <div>
          <div style={labelStyle}>QCI</div>
          <div style={{ ...valueStyle, fontSize: 16 }}>等级 {signedRate?.downQci || '-'}</div>
        </div>
      </div>
    </div>
  );
}

export const CarrierAggCard = forwardRef(function CarrierAggCard(props, ref) {
  const { ip, port } = useWebSocketConfig();
  const [loading, setLoading] = useState(true);
  const [carrierAgg, setCarrierAgg] = useState<any>(null);
  const { message } = App.useApp();
  // 将fetchAgg提升到这里
  const fetchAgg = async () => {
    setLoading(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const cmds = getQCAINFOCmd(realGroup) as any;
      const raws: string[] = [];
      for (const cmd of cmds) raws.push(await safeSendAT(cmd));
      setCarrierAgg(parseQCAINFO(raws, realGroup));
    } catch (e) {
      message.error('载波聚合查询失败: ' + e);
    }
    setLoading(false);
  };
  useImperativeHandle(ref, () => ({ refresh: fetchAgg }), [ip, port]);
  useEffect(() => {
    let cancel = false;
    if (wsService.getStatus && wsService.getStatus() === 'open') {
      fetchAgg();
    } else {
      wsService.addOnOpenCallback(fetchAgg);
    }
    return () => {
      cancel = true;
      wsService.removeOnOpenCallback(fetchAgg);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ip, port]);

  // 获取制式类型及Tag颜色
  function getCarrierTypeTag(data: any, bandNum4: any, bandNum5: any) {
    let type = '';
    let color = '';
    let colorBg = '';
    if (data.band) {
      const bandStr = String(data.band).toUpperCase();
      if (bandStr.includes('NR') || bandStr.includes('5G') || bandStr.startsWith('N')) {
        type = 'NR'; color = 'var(--ant-color-success)';
      } else if (bandStr.includes('LTE') || bandStr.includes('4G') || bandStr.startsWith('B')) {
        type = 'LTE'; color = 'var(--ant-color-primary)';
      }
    }
    if (!type && data.earfcn) {
      if (bandNum4) {
        type = 'NR'; color = 'var(--ant-color-success)'; colorBg = 'var(--ant-color-success-bg)';
      } else if (bandNum5) {
        type = 'LTE'; color = 'var(--ant-color-primary)'; colorBg = 'var(--ant-color-primary-bg)';
      }
    }
    return type ? <span style={{ color, background: colorBg, borderRadius: 4, fontSize: 12, padding: '1px 8px', marginLeft: 6 }}>{type}</span> : null;
  }

  // 获取频段类型及Tag颜色
  function getBandTag(data: any, bandNum4: any, bandNum5: any) {
    let bandStr = '';
    let color = '';
    if (data.earfcn) {
      if (bandNum4) {
        bandStr = 'N' + bandNum4; color = 'var(--ant-color-success)';
      } else if (bandNum5) {
        bandStr = 'B' + bandNum5; color = 'var(--ant-color-primary)';
      }
    }
    return bandStr ? <span style={{ color, border: `1px solid ${color}`, borderRadius: 4, fontSize: 12, padding: '0 6px', marginLeft: 12 }}>{bandStr}</span> : null;
  }

  // 新写法：两列8行grid，字段名和值上下排列，主载波蓝色标题，辅载波绿色标题，标题下分割线，宽度固定
  const renderCarrierCard = (title: string, data: any, isMain: boolean) => {
    if (!data) return null;
    const fieldMap: Record<string, string> = {
      // 频点/信道
      earfcn: '频点',
      narfcn: '频点',
      arfcn: '频点',
      // 带宽
      bw: '带宽',
      dl_bw: '下行带宽',
      ul_bw: '上行带宽',
      dl_bandwidth: '下行带宽',
      ul_bandwidth: '上行带宽',
      nr_dl_bandwidth: '下行带宽',
      nr_ul_bandwidth: '上行带宽',
      // 频率
      dl_freq: '下行频率',
      ul_freq: '上行频率',
      // 小区/物理ID
      cellId: '小区ID',
      pci: 'PCI',
      // Band
      band: 'Band',
      // MIMO
      dl_mimo: '下行MIMO层数',
      ul_mimo: '上行MIMO层数',
      // 调制方式
      dl_modulation: '下行调制方式',
      ul_modulation: '上行调制方式',
      // 信号
      rsrp: 'RSRP',
      rsrq: 'RSRQ',
      rssi: 'RSSI',
      sinr: 'SINR',
      rssnr: 'RSSNR',
      // 运营商/网络
      mcc: 'MCC',
      mnc: 'MNC',
      tac: 'TAC',
      lac: 'LAC',
      scs: 'SCS',
      // 载波聚合状态
      scell_state: '辅小区状态',
      scell_state_text: '辅小区状态',
      ul_configured: 'UL CA配置',
      ul_configured_text: 'UL CA配置',
      // 其他
      rat: '制式',
      duplex: '双工模式',
      cqi: 'CQI',
      tx_power: 'TX Power',
      rscp: 'RSCP',
      ecio: 'ECIO',
      phych: 'PHYSICAL CH',
      sf: 'SF',
      slot: 'SLOT',
      speech_code: 'Speech Code',
      com_mod: 'Com Mod',
    };
    // 只取前8个有值的字段，排除辅小区状态相关字段
    let keys = Object.keys(data).filter(k => 
      k !== 'scell_state' && 
      k !== 'scell_state_text' && 
      data[k] !== undefined && 
      data[k] !== ''
    );
    if (keys.length > 8 && keys.includes('band')) {
      keys = keys.filter(k => k !== 'band');
    }
    if (keys.length > 8 && keys.includes('bw')) {
      keys = keys.filter(k => k !== 'bw');
    }
    if (keys.length > 8 && keys.includes('rsrp')) {
      keys = keys.filter(k => k !== 'rsrp');
    }
    if (keys.length > 8 && keys.includes('rsrq')) {
      keys = keys.filter(k => k !== 'rsrq');
    }
    if (keys.length > 8 && keys.includes('rssi')) {
      keys = keys.filter(k => k !== 'rssi');
    }
    if (keys.length > 8 && keys.includes('sinr')) {
      keys = keys.filter(k => k !== 'sinr');
    }
    if (keys.length > 8 && keys.includes('cqi')) {
      keys = keys.filter(k => k !== 'cqi');
    }
    if (keys.length > 8 && keys.includes('rat')) {
      keys = keys.filter(k => k !== 'rat');
    }
    keys = keys.slice(0, 8);
    while (keys.length < 8) keys.push('');
    // 优化：只计算一次 bandNum4 和 bandNum5
    let bandNum4 = undefined, bandNum5 = undefined;
    if (data.earfcn) {
      const earfcn = Number(data.earfcn);
      bandNum4 = getNrBandByArfcn(earfcn);
      bandNum5 = getLteBandByEarfcn(earfcn);
    }
    return (
      <Card
        style={{
          flex: 1,
          height: '100%',
          borderRadius: 8,
          boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
          borderLeft: `3px solid ${isMain ? 'var(--ant-color-primary)' : 'var(--ant-color-success)'}`,
          borderRight: `1px solid var(--ant-color-fill-secondary)`,
          borderTop: `1px solid var(--ant-color-fill-secondary)`,
          borderBottom: `1px solid var(--ant-color-fill-secondary)`,
          background: 'var(--ant-color-bg-container)',
        }}
        variant="borderless"
        styles={{
          header: {
            background: isMain ? 'var(--ant-color-primary-bg)' : 'var(--ant-color-success-bg)',
            borderBottom: '1px solid var(--ant-color-fill-secondary)',
            minHeight: 42,
          },
          body: { padding: '12px 16px 10px' },
        }}
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: 14, color: isMain ? 'var(--ant-color-primary)' : '#00C853', marginRight: 12 }}>{title}</span>
              {getCarrierTypeTag(data, bandNum4, bandNum5)}
              {getBandTag(data, bandNum4, bandNum5)}
            </div>
            {/* 辅小区状态显示在右侧 */}
            {!isMain && (data.scell_state_text || data.scell_state) && (
              <div style={{ 
                fontSize: 12, 
                fontWeight: 500,
                color: 'var(--ant-color-text-secondary)',
                marginLeft: 8
              }}>
                状态: {data.scell_state_text || data.scell_state}
              </div>
            )}
          </div>
        }
        className="my-inline-card"
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '10px 16px',
          }}
        >
          {Array.from({ length: 8 }).map((_, idx) => {
            const k = keys[idx];
            let displayValue = k ? data[k] : '';
            
            // 特殊处理MCC和MNC的显示
            if (k === 'mcc' && data.mcc && data.mnc) {
              displayValue = `${data.mcc}-${data.mnc}`;
            } else if (k === 'mnc' && data.mcc && data.mnc) {
              // 如果MNC字段存在但MCC也存在，则跳过MNC的单独显示，因为已经在MCC中合并显示了
              return null;
            }
            
            return (
              <div key={idx} style={{ marginBottom: 3, marginTop: 3 }}>
                <div style={{ color: 'var(--ant-color-text-secondary)', fontSize: 12 }}>
                  {k ? (k === 'mcc' && data.mcc && data.mnc ? 'MCC-MNC' : fieldMap[k] || k) : ''}
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ant-color-text)' }}>{displayValue}</div>
              </div>
            );
          })}
        </div>
      </Card>
    );
  };

  // 最多3个小卡片，主载波+辅载波
  const cards = [];
  if (carrierAgg && carrierAgg.pcc) cards.push(renderCarrierCard('主载波', carrierAgg.pcc, true));
  if (carrierAgg && carrierAgg.scc && carrierAgg.scc.length > 0) {
    for (let i = 0; i < Math.min(2, carrierAgg.scc.length); i++) {
      cards.push(renderCarrierCard(`辅载波${i + 1}`, carrierAgg.scc[i], false));
    }
  }

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 16, fontWeight: 600, marginRight: 12 }}>载波聚合信息</span>
          <span style={{ color: 'var(--ant-color-text-secondary)', fontSize: 12 }}>展示主载波和辅载波的频点、频段、带宽与小区信息</span>
        </div>
      }
      styles={{
        header: { background: 'var(--ant-color-fill-tertiary)' },
        body: { padding: 16 },
      }}
      className="my-inline-card"
    >
      <Row gutter={[16, 16]}>
        {cards.length > 0
          ? cards.map((card, idx) => (
            <Col xs={24} md={8} key={idx}>
              {card}
            </Col>
          ))
          : <Col style={{ width: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <img src="/icons/zanwuxinxi.svg" alt="暂无信息" style={{ width: 128, height: 128, marginBottom: 8, marginLeft: 0, opacity: 0.6 }} />
              <div style={{ fontSize: 14, color: 'var(--ant-color-text-secondary)' }}>暂无载波聚合数据</div>
            </div>
          </Col>
        }
      </Row>
    </Card>
  );
});

export function TempMonitorCard() {
  const { ip, port } = useWebSocketConfig();
  const [loading, setLoading] = useState(false);
  const [firstLoad, setFirstLoad] = useState(true);
  const [temps, setTemps] = useState<{ name: string, description: string, value: number }[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(3);
  const intervalRef = useRef<any>(null);

  const fetchTemps = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const cmds = getTempCmds(realGroup);
      const results = [];
      for (const cmd of cmds) {
        results.push(await safeSendAT(cmd));
      }
      setTemps(parseTemp(results, realGroup));
    } catch { }
    if (showLoading) setLoading(false);
    setFirstLoad(false);
  };

  useEffect(() => {
    if (!autoRefresh) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => fetchTemps(false), refreshInterval * 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, refreshInterval, ip, port]);

  useEffect(() => {
    let cancel = false;
    const doQuery = () => {
      if (!cancel) fetchTemps(true);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ip, port]);

  // 过滤无效温度（如<=0或超出常见范围）
  const validTemps = temps.filter(item => item.value > 0 && item.value < 150);

  return (
    <Card
      className="my-card"
      style={{ background: 'var(--ant-color-bg-container)', boxShadow: '0 2px 8px var(--ant-color-fill-tertiary)' }}
      title={
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontWeight: 'bold', fontSize: 16 }}>模组温度监控</span>
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
            5G模组各功能模块温度状态
          </span>
        </span>
      }
      extra={
        !autoRefresh ? (
          <Button
            className="my-btn"
            type="default"
            style={{ borderRadius: 6, padding: '0 18px', height: 32, fontSize: 14, fontWeight: 500, marginLeft: 8, borderColor: 'var(--ant-color-primary)', color: 'var(--ant-color-primary)', background: 'var(--ant-color-bg-container)' }}
            onClick={() => setAutoRefresh(true)}
          >
            自动刷新
          </Button>
        ) : (
          <button
            className="my-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              border: '1px solid var(--ant-color-primary)',
              borderRadius: 6,
              padding: '0 12px',
              height: 32,
              background: 'var(--ant-color-info-bg)',
              boxSizing: 'border-box',
              userSelect: 'none',
              color: 'var(--ant-color-primary)',
              fontWeight: 500,
              fontSize: 14,
              outline: 'none',
              transition: 'background 0.2s, border 0.2s',
            }}
            type="button"
          >
            <span
              style={{ marginRight: 0, cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); setAutoRefresh(false); }}
            >
              自动刷新
            </span>
            <InputNumber
              min={2}
              max={60}
              value={refreshInterval}
              onChange={v => setRefreshInterval(Number(v) || 3)}
              style={{
                width: 52,
                height: '100%',
                border: 'none',
                background: 'transparent',
                color: 'var(--ant-color-primary)',
                fontSize: 14,
                textAlign: 'left',
                margin: '0px',
                outline: 'none',
                boxShadow: 'none',
                lineHeight: '24px',
                padding: 0,
              }}
              className="transparent-input-number"
            />
            <span style={{ marginLeft: 2, lineHeight: '24px' }} onClick={e => { e.stopPropagation(); setAutoRefresh(false); }}>秒</span>
          </button>
        )
      }
      loading={loading && firstLoad}
    >
      <Row gutter={[16, 16]}>
        {validTemps.length === 0 ? (
          <div style={{
            gridColumn: '1 / -1',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            padding: '0px 0'
          }}>
            <img src="/icons/zanwuxinxi.svg" alt="暂无温度数据" style={{ width: 128, height: 128, marginBottom: 8, opacity: 0.6 }} />
            <div style={{ fontSize: 14, color: 'var(--ant-color-text-secondary)' }}>暂无温度数据</div>
          </div>
        ) : validTemps.map((item, idx) => {
          let color = 'var(--ant-color-success)'; // 绿色
          if (item.value > 75) color = 'var(--ant-color-error)'; // 红色
          else if (item.value > 55) color = 'var(--ant-color-warning)'; // 橙色
          return (
            <Col xs={24} sm={12} md={8} lg={6} xl={6} key={item.name + idx}>
              <Card
                className="my-inline-card"
                style={{ borderRadius: 8, boxShadow: '0px 2px 8px var(--ant-color-fill-secondary)', marginBottom: 0, border: '1px solid var(--ant-color-fill-secondary)', minHeight: 12 }}
                styles={{ body: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', padding: 0 } }}
              >
                <div
                  style={{ color: 'var(--ant-color-text-secondary)', fontSize: 14, marginBottom: 2, marginLeft: 8 }}
                >
                  {item.name}
                  {item.description ? <span style={{ color: 'var(--ant-color-text-secondary)', fontSize: 12, marginLeft: 0 }}>（{item.description}）</span> : null}
                </div>
                <div style={{ fontSize: 28, color, fontWeight: 500, alignSelf: 'center' }}>{item.value}<span style={{ fontSize: 18, color: 'var(--ant-color-text-secondary)', marginLeft: 4 }}>℃</span></div>
              </Card>
            </Col>
          );
        })
        }
      </Row>
    </Card>
  );
}

export function BasicInfoCard() {
  const { ip, port } = useWebSocketConfig();
  const [loading, setLoading] = useState(false);
  const [iccid, setIccid] = useState<string | undefined>(undefined);
  const [imsi, setImsi] = useState<string | undefined>(undefined);
  const [simNum, setSimNum] = useState<string | undefined>(undefined);
  const [voltage, setVoltage] = useState<number | undefined>(undefined);
  const [imei, setImei] = useState<string | undefined>(undefined);
  const { message } = App.useApp();

  const fetchBasicInfo = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const iccidCmd = getIccidCmd(realGroup);
      const imsiCmd = getImsiCmd(realGroup);
      const simNumCmd = getSimNumCmd(realGroup);
      const voltageCmd = getVoltageCmd(realGroup);
      const iccidRaw = await safeSendAT(iccidCmd);
      const imsiRaw = await safeSendAT(imsiCmd);
      const simNumRaw = await safeSendAT(simNumCmd);
      const voltageRaw = await safeSendAT(voltageCmd);
      const imeiRaw = await safeSendAT('AT+CGSN');
      setIccid(parseIccid(iccidRaw, realGroup));
      setImsi(parseImsi(imsiRaw, realGroup));
      setSimNum(parseSimNum(simNumRaw, realGroup));
      setVoltage(parseVoltage(voltageRaw, realGroup));
      setImei((imeiRaw.match(/\b\d{14,17}\b/) || [])[0]);
    } catch (e) {
      message.error('获取系统信息失败: ' + e);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    let cancel = false;
    const doQuery = () => {
      if (!cancel) fetchBasicInfo(true);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ip, port]);

  return (
    <Card
      title="基本信息"
      extra={<Button className="my-btn" size="small" loading={loading} onClick={() => fetchBasicInfo(true)} icon={<ReloadOutlined />}>刷新</Button>}
      className="my-card"
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} md={6}>
          <div style={{
            border: '1px solid var(--ant-color-border)',
            borderRadius: 8,
            padding: '12px 16px',
            background: 'var(--ant-color-bg-container)'
          }}>
            <div style={{ color: 'var(--ant-color-text-secondary)', fontSize: 14, marginBottom: 0 }}>SIM卡号码</div>
            <div style={{ color: 'var(--ant-color-primary)', fontSize: 16, fontWeight: 500 }}>{simNum || '-'}</div>
          </div>
        </Col>
        <Col xs={24} md={6}>
          <div style={{
            border: '1px solid var(--ant-color-border)',
            borderRadius: 8,
            padding: '12px 16px',
            background: 'var(--ant-color-bg-container)'
          }}>
            <div style={{ color: 'var(--ant-color-text-secondary)', fontSize: 14, marginBottom: 0 }}>国际移动用户识别码</div>
            <div style={{ color: 'var(--ant-color-primary)', fontSize: 16, fontWeight: 500 }}>{imsi || '-'}</div>
          </div>
        </Col>
        <Col xs={24} md={6}>
          <div style={{
            border: '1px solid var(--ant-color-border)',
            borderRadius: 8,
            padding: '12px 16px',
            background: 'var(--ant-color-bg-container)'
          }}>
            <div style={{ color: 'var(--ant-color-text-secondary)', fontSize: 14, marginBottom: 0 }}>集成电路卡识别码</div>
            <div style={{ color: 'var(--ant-color-primary)', fontSize: 16, fontWeight: 500 }}>{iccid || '-'}</div>
          </div>
        </Col>
        <Col xs={24} md={6}>
          <div style={{
            border: '1px solid var(--ant-color-border)',
            borderRadius: 8,
            padding: '12px 16px',
            background: 'var(--ant-color-bg-container)'
          }}>
            <div style={{ color: 'var(--ant-color-text-secondary)', fontSize: 14, marginBottom: 0 }}>模组电压</div>
            <div style={{ color: 'var(--ant-color-primary)', fontSize: 16, fontWeight: 500 }}>{voltage ? `${voltage} V` : '-'}</div>
          </div>
        </Col>
        <Col xs={24} md={6}>
          <div style={{
            border: '1px solid var(--ant-color-border)',
            borderRadius: 8,
            padding: '12px 16px',
            background: 'var(--ant-color-bg-container)'
          }}>
            <div style={{ color: 'var(--ant-color-text-secondary)', fontSize: 14, marginBottom: 0 }}>IMEI</div>
            <div style={{ color: 'var(--ant-color-primary)', fontSize: 16, fontWeight: 500 }}>{imei || '-'}</div>
          </div>
        </Col>
      </Row>
    </Card>
  );
}
