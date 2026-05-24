import React, { useState, useEffect, useRef } from 'react';
import { Row, Col, Card, Progress, App, Button, InputNumber, Alert, Tag, theme, Descriptions, Space } from 'antd';
import {
    SignalFilled,
    ThunderboltOutlined,
    CloudOutlined,
    ReloadOutlined,
    DashboardOutlined,
    GlobalOutlined,
    ApartmentOutlined
} from '@ant-design/icons';
import { useWebSocketConfig } from '@/contexts/WebSocketConfigContext';
import {
    getQRSRPCmd, parseQRSRP, getQSINRCmd, parseQSINR, getQRSRQCmd, parseQRSRQ,
    getRealtimeRateCmd, parseRealtimeRate, getTrafficStatCmds, parseTrafficStat, resetTrafficStatCmds,
    getOperatorCmd, parseOperator,
    getNetworkTypeCmd, parseNetworkType, getRegStatusCmd, parseRegStatus,
    getIpAddrCmd, parseIpAddr
} from '@/utils/atModule';
import { parseATISystemInfo } from '@/utils/atModule';
import { safeSendAT, ensureGroupReady, getCurrentGroupAsync } from '@/utils/atQueue';
import wsService from '@/services/websocket';
import { useModel } from '@umijs/max';
import { formatSpeed, formatBytes, getOperatorName, getSignalColor, getSignalLevel } from '@/utils/formatUtils';
import { useScrollReset } from '@/hooks/useScrollReset';
import { BasicInfoCard, CarrierAggCard, NetworkSpeedCard, TempMonitorCard } from '@/components/NetworkStatusCards';

type NetworkDetails = {
    type?: string;
    operatorCode?: string;
    band?: string;
    channel?: string;
};

type IpInfo = {
    ipv4?: string;
    ipv6?: string;
    ipv6Hex?: string;
};

const parseNetworkDetails = (raw: string): NetworkDetails => {
    const m = raw.match(/\+QNWINFO:\s*"([^"]*)","([^"]*)","([^"]*)",?([^,\r\n]*)?/);
    if (!m) return {};
    return {
        type: m[1],
        operatorCode: m[2],
        band: m[3],
        channel: m[4]?.trim(),
    };
};

const splitIpAddresses = (info: IpInfo | null): { ipv4?: string; ipv6?: string } => {
    if (!info) return {};
    const rawValues = [info.ipv4, info.ipv6Hex, info.ipv6]
        .filter(Boolean)
        .flatMap(value => String(value).split(',').map(item => item.trim()).filter(Boolean));

    return {
        ipv4: rawValues.find(value => value.includes('.')),
        ipv6: rawValues.find(value => value.includes(':')),
    };
};

export default function Dashboard() {
    const { ip, port, swapTrafficStats } = useWebSocketConfig();
    const { message, modal } = App.useApp();
    const { token } = theme.useToken();

    // 使用滚动重置Hook
    useScrollReset();

    const [loading, setLoading] = useState(true);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [refreshInterval, setRefreshInterval] = useState(3);
    const intervalRef = useRef<any>(null);
    const unmountedRef = useRef(false); // 新增
    const { setInitialState } = useModel('@@initialState');

    // 数据状态
    const [signalData, setSignalData] = useState<any>(null);
    const [speedData, setSpeedData] = useState<any>(null);
    const [trafficData, setTrafficData] = useState<any>(null);
    const [resetTrafficLoading, setResetTrafficLoading] = useState(false);
    const [operator, setOperator] = useState<string>('');
    const [networkType, setNetworkType] = useState<string>('');
    const [networkTypeColor, setNetworkTypeColor] = useState<string>('var(--ant-color-warning)');
    const [regStatus, setRegStatus] = useState<number | undefined>(undefined);
    const [networkDetails, setNetworkDetails] = useState<NetworkDetails>({});
    const [ipInfo, setIpInfo] = useState<IpInfo | null>(null);

    // 设置网络类型及其颜色
    const setNetworkTypeWithColor = (netType: string) => {
        setNetworkType(netType);

        let color = 'gold';

        if (netType && netType.toUpperCase().includes('NR')) {
            color = 'green';
        } else if (netType && netType.toUpperCase().includes('LTE')) {
            color = 'blue';
        }

        setNetworkTypeColor(color);
    };

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

    // 获取信号数据
    const fetchSignalData = async () => {
        if (unmountedRef.current) return;
        try {
            await ensureGroupReady(ip, port);
            if (unmountedRef.current) return;
            const realGroup = await getCurrentGroupAsync(ip, port);
            if (unmountedRef.current) return;

            const qrsrp = await safeSendAT(getQRSRPCmd(realGroup));
            const qsinr = await safeSendAT(getQSINRCmd(realGroup));
            const qrsrq = await safeSendAT(getQRSRQCmd(realGroup));
            if (unmountedRef.current) return;

            const rsrpResult = parseQRSRP(qrsrp, realGroup);
            const sinrResult = parseQSINR(qsinr, realGroup);
            const rsrqResult = parseQRSRQ(qrsrq, realGroup);

            const signalInfo = {
                rsrp: rsrpResult?.value,
                sinr: sinrResult?.value,
                rsrq: rsrqResult?.value,
                timestamp: new Date().getTime()
            };

            if (unmountedRef.current) return;
            setSignalData(signalInfo);
        } catch (error) {
            if (!unmountedRef.current) console.error('获取信号数据失败:', error);
        }
    };

    // 获取网速数据
    const fetchSpeedData = async () => {
        if (unmountedRef.current) return;
        try {
            await ensureGroupReady(ip, port);
            if (unmountedRef.current) return;
            const realGroup = await getCurrentGroupAsync(ip, port);
            if (unmountedRef.current) return;

            const rateCmd = getRealtimeRateCmd(realGroup);
            const rateRaw = await safeSendAT(rateCmd);
            if (unmountedRef.current) return;
            const rateInfo = parseRealtimeRate(rateRaw, realGroup);
            if (rateInfo) {
                const speedInfo = {
                    up: rateInfo.up,
                    down: rateInfo.down,
                    timestamp: new Date().getTime()
                };
                if (unmountedRef.current) return;
                setSpeedData(speedInfo);
            }
        } catch (error) {
            if (!unmountedRef.current) console.error('获取网速数据失败:', error);
        }
    };

    // 获取流量数据
    const fetchTrafficData = async () => {
        if (unmountedRef.current) return;
        try {
            await ensureGroupReady(ip, port);
            if (unmountedRef.current) return;
            const realGroup = await getCurrentGroupAsync(ip, port);
            if (unmountedRef.current) return;

            const cmds = getTrafficStatCmds(realGroup);
            const results = [];
            for (const cmd of cmds) {
                results.push(await safeSendAT(cmd));
                if (unmountedRef.current) return;
            }
            const trafficInfo = parseTrafficStat(results, realGroup, swapTrafficStats);
            if (unmountedRef.current) return;
            setTrafficData(trafficInfo);
        } catch (error) {
            if (!unmountedRef.current) console.error('获取流量数据失败:', error);
        }
    };

    const executeResetTrafficData = async () => {
        if (resetTrafficLoading) return;
        setResetTrafficLoading(true);
        try {
            await ensureGroupReady(ip, port);
            const realGroup = await getCurrentGroupAsync(ip, port);
            const cmds = resetTrafficStatCmds(realGroup);
            for (const cmd of cmds) {
                const resp = await safeSendAT(cmd);
                if (/\+CME ERROR|\bERROR\b|\bBUSY\b/i.test(resp)) {
                    throw resp.trim() || 'AT命令执行失败';
                }
            }
            message.success('流量统计已重置');
            await fetchTrafficData();
        } catch (error) {
            message.error('重置流量统计失败: ' + error);
        } finally {
            setResetTrafficLoading(false);
        }
    };

    const handleResetTrafficData = () => {
        if (resetTrafficLoading) return;
        modal.confirm({
            title: '重置流量统计',
            content: '确定要清空模组累计上传和下载流量统计吗？此操作会直接发送 AT 重置命令。',
            okText: '重置',
            cancelText: '取消',
            okButtonProps: { danger: true },
            onOk: executeResetTrafficData,
        });
    };

    // 获取运营商信息
    const fetchOperatorInfo = async () => {
        if (unmountedRef.current) return;
        try {
            await ensureGroupReady(ip, port);
            if (unmountedRef.current) return;
            const realGroup = await getCurrentGroupAsync(ip, port);
            if (unmountedRef.current) return;
            const cmds = getOperatorCmd(realGroup);
            const results = [];
            for (const cmd of cmds) {
                results.push(await safeSendAT(cmd));
                if (unmountedRef.current) return;
            }
            if (unmountedRef.current) return;
            const operatorInfo = parseOperator(results, realGroup);
            if (unmountedRef.current) return;
            setOperator(operatorInfo || '');
        } catch (error) {
            if (!unmountedRef.current) console.error('获取运营商信息失败:', error);
        }
    };

    // 获取网络类型和注册状态
    const fetchNetworkInfo = async () => {
        if (unmountedRef.current) return;
        try {
            await ensureGroupReady(ip, port);
            if (unmountedRef.current) return;
            const realGroup = await getCurrentGroupAsync(ip, port);
            if (unmountedRef.current) return;

            const netTypeRaw = await safeSendAT(getNetworkTypeCmd(realGroup));
            if (unmountedRef.current) return;
            const regStatusCmds = getRegStatusCmd(realGroup);
            let regStatusRaw = undefined;
            for (const cmd of regStatusCmds) {
                const raw = await safeSendAT(cmd);
                if (unmountedRef.current) return;
                regStatusRaw = parseRegStatus(raw, realGroup);
                if (regStatusRaw) {
                    break;
                }
            }

            setNetworkDetails(parseNetworkDetails(netTypeRaw));
            setNetworkTypeWithColor(parseNetworkType(netTypeRaw, realGroup) ?? '');
            setRegStatus(regStatusRaw);
        } catch (error) {
            if (!unmountedRef.current) console.error('获取网络信息失败:', error);
        }
    };

    // 获取 IP 地址和公网定位信息
    const fetchIpInfo = async () => {
        if (unmountedRef.current) return;
        try {
            await ensureGroupReady(ip, port);
            if (unmountedRef.current) return;
            const realGroup = await getCurrentGroupAsync(ip, port);
            if (unmountedRef.current) return;

            const cmds = getIpAddrCmd(realGroup);
            let raw = '';
            for (const cmd of cmds) {
                raw += await safeSendAT(cmd);
                if (unmountedRef.current) return;
            }

            const parsed = parseIpAddr(raw, realGroup);
            setIpInfo(parsed);
        } catch (error) {
            if (!unmountedRef.current) console.error('获取IP信息失败:', error);
            setIpInfo(null);
        }
    };

    // 刷新所有数据
    const refreshAllData = async (includeStatic = true) => {
        if (unmountedRef.current) return;
        if (includeStatic) setLoading(true);
        try {
            const fetchList = [
                fetchSignalData,
                fetchSpeedData,
                fetchTrafficData,
                fetchNetworkInfo,
                ...(includeStatic ? [fetchOperatorInfo, fetchIpInfo] : [])
            ];
            for (const fetchFn of fetchList) {
                // eslint-disable-next-line no-await-in-loop
                await fetchFn();
                // 分帧，给主线程喘息机会
                // eslint-disable-next-line no-await-in-loop
                await new Promise(res => setTimeout(res, 0));
            }
        } catch (error) {
            if (!unmountedRef.current) message.error('数据刷新失败');
        }
        if (unmountedRef.current) return;
        if (includeStatic) setLoading(false);
    };

    // 自动刷新逻辑
    useEffect(() => {
        unmountedRef.current = false;
        if (!autoRefresh) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            return;
        }
        intervalRef.current = setInterval(() => {
            refreshAllData(false);
        }, refreshInterval * 1000);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            intervalRef.current = null;
            unmountedRef.current = true;
            setLoading(false);
        };
    }, [autoRefresh, refreshInterval, ip, port]);

    // 初始加载
    useEffect(() => {
        unmountedRef.current = false;
        let cancel = false;
        const doQuery = () => {
            if (!cancel) {
                refreshAllData();
                setAutoRefresh(true);
            }
        };
        if (wsService.getStatus && wsService.getStatus() === 'open') {
            doQuery();
        } else {
            wsService.addOnOpenCallback(doQuery);
        }
        // 卸载时移除 onOpen 回调，防止回调堆积，并清空历史数据，异步分批清理
        return () => {
            cancel = true;
            unmountedRef.current = true;
            setAutoRefresh(false); // 提前关闭自动刷新
            wsService.clearAllATListeners();
            wsService.removeOnOpenCallback(doQuery);
        };
    }, [ip, port]);

    // 获取网络状态信息
    const getNetworkStatusInfo = () => {
        const regStatusMap: Record<number, { text: string, color: string, status: 'success' | 'warning' | 'error' }> = {
            0: { text: '未注册，未搜索', color: 'var(--ant-color-error)', status: 'error' },
            1: { text: '已注册，本地网络', color: 'var(--ant-color-success)', status: 'success' },
            2: { text: '未注册，正在搜索', color: 'var(--ant-color-warning)', status: 'warning' },
            3: { text: '注册被拒', color: 'var(--ant-color-error)', status: 'error' },
            4: { text: '未知（超出网络覆盖）', color: 'var(--ant-color-error)', status: 'error' },
            5: { text: '已注册，漫游网络', color: 'var(--ant-color-success)', status: 'success' },
            6: { text: '已注册SMS only本地网络', color: 'var(--ant-color-success)', status: 'success' },
            7: { text: '已注册SMS only漫游网络', color: 'var(--ant-color-success)', status: 'success' },
            8: { text: '仅用于紧急承载服务', color: 'var(--ant-color-warning)', status: 'warning' },
            9: { text: '注册CSFB不优先本地网络', color: 'var(--ant-color-warning)', status: 'warning' },
            10: { text: '注册CSFB不优先漫游网络', color: 'var(--ant-color-warning)', status: 'warning' },
        };
        return regStatusMap[regStatus ?? 0] || { text: '未知', color: token.colorText, status: 'warning' };
    };

    const networkStatusInfo = getNetworkStatusInfo();
    const displayIp = splitIpAddresses(ipInfo);

    return (
        <Card
            style={{ minHeight: 'calc(100vh - 48px)' }}
            className="my-card"
            title={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, padding: '0 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 0 }}>
                        <h2 style={{ marginRight: 16, marginBottom: 0 }}>
                            <DashboardOutlined style={{ marginRight: 8 }} />
                            概览信息
                        </h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                            {networkType && (
                                <Tag
                                    color={networkTypeColor}
                                    style={{
                                        fontSize: 14,
                                        padding: '1px 6px'
                                    }}
                                >
                                    {networkType}
                                </Tag>
                            )}
                            <Tag color={networkStatusInfo.status === 'success' ? 'success' : networkStatusInfo.status === 'warning' ? 'warning' : 'error'} style={{ fontSize: 14, padding: '1px 6px' }}>{networkStatusInfo.text}</Tag>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 0, padding: '8px 0' }}>
                        <Button
                            type="default"
                            className="my-btn"
                            icon={<ReloadOutlined />}
                            onClick={() => refreshAllData()}
                            loading={loading}
                        >
                            刷新
                        </Button>
                        {!autoRefresh ? (
                            <Button
                                className="my-btn"
                                type="default"
                                style={{ borderRadius: 6, padding: '0 18px', height: 32, fontSize: 14, fontWeight: 500, marginLeft: 8, borderColor: 'var(--ant-color-primary)', color: 'var(--ant-color-primary)' }}
                                onClick={() => setAutoRefresh(true)}
                            >
                                自动刷新
                            </Button>
                        ) : (
                            <Space.Compact>
                                <Button
                                    className="my-btn"
                                    type="primary"
                                    onClick={() => setAutoRefresh(false)}
                                    style={{ fontWeight: 500, height: 32 }}
                                >
                                    自动刷新
                                </Button>
                                <InputNumber
                                    min={2}
                                    max={60}
                                    value={refreshInterval}
                                    onChange={v => setRefreshInterval(Number(v) || 3)}
                                    controls
                                    size="middle"
                                    style={{ width: 58, height: 32 }}
                                />
                                <Button
                                    className="my-btn"
                                    style={{
                                        height: 32,
                                        padding: '0 10px',
                                        color: 'var(--ant-color-text-secondary)',
                                        cursor: 'default',
                                    }}
                                >
                                    秒
                                </Button>
                            </Space.Compact>
                        )}
                    </div>
                </div>
            }
        >

            {/* 网络状态警告 */}
            {/* {regStatus !== 1 && regStatus !== 5 && regStatus !== 6 && regStatus !== 7 && (
                <Alert
                    message="网络连接异常"
                    description={networkStatusInfo.text}
                    type={networkStatusInfo.status}
                    showIcon
                    style={{ marginBottom: 16, marginTop: 0 }}
                />
            )} */}

            {/* 信号质量卡片 */}
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                <Col xs={24} lg={8}>
                    <Card
                        title={
                            <span>
                                <SignalFilled style={{ marginRight: 8, color: token.colorPrimary }} />
                                信号质量
                            </span>
                        }
                        style={{ height: 220 }}
                        className="my-inline-card"
                    >
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            height: '100%',
                            padding: '10px 0'
                        }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                flex: 1
                            }}>
                                <Progress
                                    type="circle"
                                    percent={signalData?.rsrp ? Math.max(0, Math.min(100, Math.round((signalData.rsrp + 120) * 100 / 40))) : 0}
                                    format={percent => (
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{
                                                fontSize: 40,
                                                fontWeight: 'bold',
                                                color: getSignalColor(signalData?.rsrp, 'rsrp'),
                                                lineHeight: 1.2,
                                                marginBottom: 4
                                            }}>
                                                {signalData?.rsrp || '-'}
                                            </div>
                                            <div style={{
                                                fontSize: 14,
                                                color: token.colorTextSecondary,
                                            }}>
                                                dBm
                                            </div>
                                        </div>
                                    )}
                                    strokeColor={getSignalColor(signalData?.rsrp, 'rsrp')}
                                    size={140}
                                    strokeWidth={8}
                                />
                            </div>
                            {operator && (
                                <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '0 16px',
                                    borderLeft: `1px solid ${token.colorBorderSecondary}`,
                                    height: '100%',
                                    minWidth: '40%'
                                }}>
                                    {/* 运营商图标 */}
                                    {operator === '中国移动' && <img src="/icons/china_mobile.png" alt="中国移动" style={{ width: 64, height: 64, marginBottom: 8 }} />}
                                    {operator === '中国联通' && <img src="/icons/china_unicom.png" alt="中国联通" style={{ width: 64, height: 64, marginBottom: 8 }} />}
                                    {operator === '中国电信' && <img src="/icons/china_telecom.png" alt="中国电信" style={{ width: 64, height: 64, marginBottom: 8 }} />}
                                    {operator === '中国广电' && <img src="/icons/china_broadcast.png" alt="中国广电" style={{ width: 64, height: 64, marginBottom: 8 }} />}
                                    <div style={{
                                        fontSize: 16,
                                        color: token.colorTextSecondary,
                                        textAlign: 'center',
                                        lineHeight: 1.2
                                    }}>
                                        {operator}
                                    </div>
                                </div>
                            )}
                        </div>
                    </Card>
                </Col>
                <Col xs={24} lg={8}>
                    <Card
                        title={
                            <span>
                                <ThunderboltOutlined style={{ marginRight: 8, color: token.colorSuccess }} />
                                实时网速
                            </span>
                        }
                        className="my-inline-card"
                        style={{ height: 220 }}
                    >
                        <div
                            style={{
                                width: '100%',
                                height: 156,
                                display: 'flex',
                                alignItems: 'stretch',
                                justifyContent: 'center',
                                padding: '6px 6px',
                                boxSizing: 'border-box',
                            }}
                        >
                            <div style={{
                                display: 'flex',
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'stretch',
                                width: '100%',
                                gap: 16,
                                height: '100%',
                            }}>
                                {/* 上行速率小卡片 */}
                                <div style={{
                                    flex: 1,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'center',
                                    borderRadius: 8,
                                    height: '100%',
                                    background: 'var(--ant-color-fill-tertiary)',
                                    padding: '16px 16px',
                                    boxSizing: 'border-box',
                                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <span style={{ fontSize: 18, fontWeight: 600, color: token.colorText }}>上行速率</span>
                                        <img src="/icons/up_speed.svg" alt="上行速率" style={{ width: 36, height: 36, marginLeft: 12 }} />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-start', marginTop: 2 }}>
                                        <span style={{ fontSize: 32, fontWeight: 700, color: token.colorSuccess, lineHeight: 1 }}>
                                            {formatSpeed(speedData?.up || 0).split(' ')[0]}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-start', marginTop: 2 }}>
                                        <span style={{ fontSize: 16, fontWeight: 400, color: token.colorText, marginLeft: 0 }}>
                                            {formatSpeed(speedData?.up || 0).split(' ')[1] || 'B/s'}
                                        </span>
                                    </div>
                                </div>
                                {/* 下行速率小卡片 */}
                                <div style={{
                                    flex: 1,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'center',
                                    background: 'var(--ant-color-fill-tertiary)',
                                    borderRadius: 8,
                                    height: '100%',
                                    padding: '16px 16px',
                                    boxSizing: 'border-box',
                                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <span style={{ fontSize: 18, fontWeight: 600, color: token.colorText }}>下行速率</span>
                                        <img src="/icons/down_speed.svg" alt="下行速率" style={{ width: 36, height: 36, marginLeft: 12 }} />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-start', marginTop: 2 }}>
                                        <span style={{ fontSize: 32, fontWeight: 700, color: token.colorPrimary, lineHeight: 1 }}>
                                            {formatSpeed(speedData?.down || 0).split(' ')[0]}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-start', marginTop: 2 }}>
                                        <span style={{ fontSize: 16, fontWeight: 400, color: token.colorText, marginLeft: 0 }}>
                                            {formatSpeed(speedData?.down || 0).split(' ')[1] || 'B/s'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>
                </Col>
                <Col xs={24} lg={8}>
                    <Card
                        title={
                            <span>
                                <CloudOutlined style={{ marginRight: 8, color: token.colorWarning }} />
                                流量统计
                            </span>
                        }
                        extra={
                            <Button
                                className="my-btn"
                                size="small"
                                danger
                                loading={resetTrafficLoading}
                                onClick={handleResetTrafficData}
                            >
                                重置统计
                            </Button>
                        }
                        className="my-inline-card"
                        style={{ height: 220 }}
                    >
                        <div
                            style={{
                                width: '100%',
                                height: 156,
                                display: 'flex',
                                alignItems: 'stretch',
                                justifyContent: 'center',
                                padding: '6px 6px',
                                boxSizing: 'border-box',
                            }}
                        >
                            <div style={{
                                display: 'flex',
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'stretch',
                                width: '100%',
                                gap: 16,
                                height: '100%',
                            }}>
                                {/* 上传流量分区 */}
                                <div style={{
                                    flex: 1,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'center',
                                    background: 'var(--ant-color-fill-tertiary)',
                                    borderRadius: 8,
                                    height: '100%',
                                    padding: '16px 16px',
                                    boxSizing: 'border-box',
                                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <span style={{ fontSize: 18, fontWeight: 600, color: token.colorText }}>上传流量</span>
                                        <img src="/icons/up.svg" alt="上传流量" style={{ width: 36, height: 36, marginLeft: 12 }} />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-start', marginTop: 2 }}>
                                        <span style={{ fontSize: 32, fontWeight: 700, color: token.colorSuccess, lineHeight: 1 }}>
                                            {formatBytes(trafficData?.up || 0).split(' ')[0]}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-start', marginTop: 2 }}>
                                        <span style={{ fontSize: 16, fontWeight: 400, color: token.colorText, marginLeft: 0 }}>
                                            {formatBytes(trafficData?.up || 0).split(' ')[1] || 'B'}
                                        </span>
                                    </div>
                                </div>
                                {/* 下载流量分区 */}
                                <div style={{
                                    flex: 1,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'center',
                                    background: 'var(--ant-color-fill-tertiary)',
                                    borderRadius: 8,
                                    height: '100%',
                                    padding: '16px 16px',
                                    boxSizing: 'border-box',
                                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <span style={{ fontSize: 18, fontWeight: 600, color: token.colorText }}>下载流量</span>
                                        <img src="/icons/down.svg" alt="下载流量" style={{ width: 36, height: 36, marginLeft: 12 }} />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-start', marginTop: 2 }}>
                                        <span style={{ fontSize: 32, fontWeight: 700, color: token.colorPrimary, lineHeight: 1 }}>
                                            {formatBytes(trafficData?.down || 0).split(' ')[0]}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-start', marginTop: 2 }}>
                                        <span style={{ fontSize: 16, fontWeight: 400, color: token.colorText, marginLeft: 0 }}>
                                            {formatBytes(trafficData?.down || 0).split(' ')[1] || 'B'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>
                </Col>
            </Row>

            {/* 信号参数详情 */}
            <Row gutter={[16, 16]} style={{ marginBottom: 16, alignItems: 'stretch' }}>
                <Col xs={24} sm={12} md={6}
                    style={{
                        display: 'flex',
                        // display: signalData?.rsrp ? 'flex' : 'none'
                    }}
                >
                    <Card className="my-inline-card" style={{ width: '100%', height: '100%' }}>
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            height: '100%',
                            padding: '4px 8px',
                            //minHeight: '140px'
                        }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                flex: 1,
                                marginBottom: 4
                            }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        fontSize: 18,
                                        fontWeight: 500,
                                        color: token.colorText,
                                        marginBottom: 4,
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                    }}>
                                        RSRP
                                    </div>
                                    <div style={{
                                        fontSize: 12,
                                        color: token.colorTextSecondary,
                                        lineHeight: 1.4,
                                        wordBreak: 'break-word'
                                    }}>
                                        参考信号接收功率
                                    </div>
                                </div>
                                <div style={{
                                    textAlign: 'right',
                                    flex: '0 0 auto',
                                    marginLeft: 8
                                }}>
                                    <div style={{
                                        fontSize: 32,
                                        fontWeight: 'bold',
                                        color: getSignalColor(signalData?.rsrp, 'rsrp'),
                                        lineHeight: 1.2
                                    }}>
                                        {signalData?.rsrp || '-'}
                                    </div>
                                    <div style={{
                                        fontSize: 12,
                                        color: token.colorTextSecondary
                                    }}>
                                        dBm
                                    </div>
                                </div>
                            </div>
                            <Progress
                                percent={signalData?.rsrp ? Math.max(0, Math.min(100, Math.round((signalData.rsrp + 157) * 100 / 125))) : 0}
                                strokeColor={getSignalColor(signalData?.rsrp, 'rsrp')}
                                showInfo={false}
                                size="small"
                                style={{ marginBottom: 0 }}
                                className="full-width-progress"
                            />
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={6}
                    style={{
                        display: 'flex',
                        // display: signalData?.sinr ? 'flex' : 'none'
                    }}
                >
                    <Card className="my-inline-card" style={{ width: '100%', height: '100%' }}>
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            height: '100%',
                            padding: '4px 8px',
                            //minHeight: '140px'
                        }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                flex: 1,
                                marginBottom: 4
                            }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        fontSize: 18,
                                        fontWeight: 500,
                                        color: token.colorText,
                                        marginBottom: 4,
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                    }}>
                                        SINR
                                    </div>
                                    <div style={{
                                        fontSize: 12,
                                        color: token.colorTextSecondary,
                                        lineHeight: 1.4,
                                        wordBreak: 'break-word'
                                    }}>
                                        信噪比
                                    </div>
                                </div>
                                <div style={{
                                    textAlign: 'right',
                                    flex: '0 0 auto',
                                    marginLeft: 8
                                }}>
                                    <div style={{
                                        fontSize: 32,
                                        fontWeight: 'bold',
                                        color: getSignalColor(signalData?.sinr, 'sinr'),
                                        lineHeight: 1.2
                                    }}>
                                        {signalData?.sinr || '-'}
                                    </div>
                                    <div style={{
                                        fontSize: 12,
                                        color: token.colorTextSecondary
                                    }}>
                                        dB
                                    </div>
                                </div>
                            </div>
                            <Progress
                                percent={signalData?.sinr ? Math.max(0, Math.min(100, Math.round((signalData.sinr + 24) * 100 / 64))) : 0}
                                strokeColor={getSignalColor(signalData?.sinr, 'sinr')}
                                showInfo={false}
                                size="small"
                                style={{ marginBottom: 0 }}
                                className="full-width-progress"
                            />
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={6}
                    style={{
                        display: 'flex',
                        // display: signalData?.rsrq ? 'flex' : 'none'
                    }}
                >
                    <Card className="my-inline-card" style={{ width: '100%', height: '100%' }}>
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            height: '100%',
                            padding: '4px 8px',
                            //minHeight: '140px'
                        }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                flex: 1,
                                marginBottom: 4
                            }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        fontSize: 18,
                                        fontWeight: 500,
                                        color: token.colorText,
                                        marginBottom: 4,
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                    }}>
                                        RSRQ
                                    </div>
                                    <div style={{
                                        fontSize: 12,
                                        color: token.colorTextSecondary,
                                        lineHeight: 1.4,
                                        wordBreak: 'break-word'
                                    }}>
                                        参考信号接收质量
                                    </div>
                                </div>
                                <div style={{
                                    textAlign: 'right',
                                    flex: '0 0 auto',
                                    marginLeft: 8
                                }}>
                                    <div style={{
                                        fontSize: 32,
                                        fontWeight: 'bold',
                                        color: getSignalColor(signalData?.rsrq, 'rsrq'),
                                        lineHeight: 1.2
                                    }}>
                                        {signalData?.rsrq || '-'}
                                    </div>
                                    <div style={{
                                        fontSize: 12,
                                        color: token.colorTextSecondary
                                    }}>
                                        dB
                                    </div>
                                </div>
                            </div>
                            <Progress
                                percent={signalData?.rsrq ? Math.max(0, Math.min(100, Math.round((signalData.rsrq + 44) * 100 / 64))) : 0}
                                strokeColor={getSignalColor(signalData?.rsrq, 'rsrq')}
                                showInfo={false}
                                size="small"
                                style={{ marginBottom: 0 }}
                                className="full-width-progress"
                            />
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={6}
                    style={{
                        display: 'flex',
                        // display: signalData?.rsrp ? 'flex' : 'none'
                    }}
                >
                    <Card className="my-inline-card" style={{ width: '100%', height: '100%' }}>
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            height: '100%',
                            padding: '4px 8px',
                            //minHeight: '140px'
                        }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                flex: 1,
                                marginBottom: 4
                            }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        fontSize: 18,
                                        fontWeight: 500,
                                        color: token.colorText,
                                        marginBottom: 4,
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                    }}>
                                        信号等级
                                    </div>
                                    <div style={{
                                        fontSize: 12,
                                        color: token.colorTextSecondary,
                                        lineHeight: 1.4,
                                        wordBreak: 'break-word'
                                    }}>
                                        信号强度等级
                                    </div>
                                </div>
                                <div style={{
                                    textAlign: 'right',
                                    flex: '0 0 auto',
                                    marginLeft: 8
                                }}>
                                    <div style={{
                                        fontSize: 32,
                                        fontWeight: 'bold',
                                        color: getSignalColor(signalData?.rsrp, 'rsrp'),
                                        lineHeight: 1.2
                                    }}>
                                        {getSignalLevel(signalData?.rsrp, 'rsrp')}/4
                                    </div>
                                    <div style={{
                                        fontSize: 12,
                                        color: token.colorTextSecondary
                                    }}>
                                        等级
                                    </div>
                                </div>
                            </div>
                            <Progress
                                percent={getSignalLevel(signalData?.rsrp, 'rsrp') * 25}
                                strokeColor={getSignalColor(signalData?.rsrp, 'rsrp')}
                                showInfo={false}
                                size="small"
                                style={{ marginBottom: 0 }}
                                className="full-width-progress"
                            />
                        </div>
                    </Card>
                </Col>
            </Row>

            {/* 载波聚合信息 */}
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                <Col xs={24}>
                    <CarrierAggCard />
                </Col>
            </Row>

            {/* 网络和 IP 信息 */}
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                <Col xs={24} lg={12}>
                    <Card
                        title={
                            <span>
                                <ApartmentOutlined style={{ marginRight: 8, color: token.colorPrimary }} />
                                网络信息
                            </span>
                        }
                        className="my-inline-card"
                        style={{ height: '100%' }}
                    >
                        <Descriptions
                            bordered
                            column={1}
                            size="small"
                            styles={{
                                label: { width: '34%' },
                                content: { background: 'var(--ant-color-bg-container)' },
                            }}
                        >
                            <Descriptions.Item label="网络类型">
                                {networkDetails.type || networkType ? (
                                    <Tag color={networkTypeColor}>{networkDetails.type || networkType}</Tag>
                                ) : '-'}
                            </Descriptions.Item>
                            <Descriptions.Item label="绑定频段">
                                {networkDetails.band ? <Tag color="processing">{networkDetails.band}</Tag> : '-'}
                            </Descriptions.Item>
                            <Descriptions.Item label="频点 / 信道">
                                {networkDetails.channel || '-'}
                            </Descriptions.Item>
                            <Descriptions.Item label="运营商代码">
                                {networkDetails.operatorCode ? `${getOperatorName(networkDetails.operatorCode)} (${networkDetails.operatorCode})` : '-'}
                            </Descriptions.Item>
                        </Descriptions>
                    </Card>
                </Col>
                <Col xs={24} lg={12}>
                    <Card
                        title={
                            <span>
                                <GlobalOutlined style={{ marginRight: 8, color: token.colorSuccess }} />
                                IP 信息
                            </span>
                        }
                        className="my-inline-card"
                        style={{ height: '100%' }}
                    >
                        <Descriptions
                            bordered
                            column={1}
                            size="small"
                            styles={{
                                label: { width: '24%' },
                                content: { background: 'var(--ant-color-bg-container)' },
                            }}
                        >
                            <Descriptions.Item label="IPv4">
                                <div style={{ wordBreak: 'break-all' }}>{displayIp.ipv4 || '未知'}</div>
                            </Descriptions.Item>
                            <Descriptions.Item label="IPv6">
                                <div style={{ wordBreak: 'break-all' }}>{displayIp.ipv6 || '未知'}</div>
                            </Descriptions.Item>
                        </Descriptions>
                    </Card>
                </Col>
            </Row>

            {/* 模组与网络扩展信息 */}
            <Row gutter={[16, 16]} style={{ marginBottom: 16, alignItems: 'stretch' }}>
                <Col xs={24}>
                    <BasicInfoCard />
                </Col>
                <Col xs={24}>
                    <NetworkSpeedCard />
                </Col>
                <Col xs={24}>
                    <TempMonitorCard />
                </Col>
            </Row>

        </Card>
    );
}
