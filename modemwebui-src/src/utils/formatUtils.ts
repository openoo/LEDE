/**
 * 格式化工具函数
 */

import dayjs from "dayjs";

/**
 * 格式化速率（支持 bps 和 B/s 两种模式）
 * @param val 数值
 * @param isBytes 是否为字节速率（B/s），否则为比特速率（bps）
 */
export const formatSpeed = (
    val: number | undefined | null,
    isBytes: boolean = false
): string => {
    if (val == null || isNaN(val)) return '-';
    if (isBytes) {
        if (val >= 1024 * 1024 * 1024) {
            const num = (val / 1024 / 1024 / 1024).toFixed(2);
            return `${num} GB/s`;
        } else if (val >= 1024 * 1024) {
            const num = (val / 1024 / 1024).toFixed(2);
            return `${num} MB/s`;
        } else if (val >= 1024) {
            const num = (val / 1024).toFixed(2);
            return `${num} KB/s`;
        } else {
            return `${val} B/s`;
        }
    } else {
        if (val >= 1000 * 1000 * 1000) {
            const num = (val / 1000 / 1000 / 1000).toFixed(2);
            return `${num} Gbps`;
        } else if (val >= 1000 * 1000) {
            const num = (val / 1000 / 1000).toFixed(2);
            return `${num} Mbps`;
        } else if (val >= 1000) {
            const num = (val / 1000).toFixed(2);
            return `${num} Kbps`;
        } else {
            return `${val} bps`;
        }
    }
};

/**
 * 格式化流量值
 * @param bytes 字节数
 * @param short 是否使用短格式
 * @returns 格式化后的字符串
 */
export const formatBytes = (bytes: number | undefined | null, short: boolean = false): string => {
    if (bytes == null || isNaN(bytes)) return '-';

    if (bytes >= 1024 * 1024 * 1024) {
        const num = (bytes / 1024 / 1024 / 1024).toFixed(2);
        return short ? `${num}G` : `${num} GB`;
    } else if (bytes >= 1024 * 1024) {
        const num = (bytes / 1024 / 1024).toFixed(2);
        return short ? `${num}M` : `${num} MB`;
    } else if (bytes >= 1024) {
        const num = (bytes / 1024).toFixed(2);
        return short ? `${num}K` : `${num} KB`;
    } else {
        return short ? `${bytes}` : `${bytes} B`;
    }
};

// 通用解析函数
function parseTime(raw: string) {
    // 支持 2025/07/26 20:58:02+32
    let m = raw.match(/(\d{2,4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
    if (m) {
        return {
            year: m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]),
            month: Number(m[2]) - 1,
            day: Number(m[3]),
            hour: Number(m[4]),
            min: Number(m[5]),
            sec: Number(m[6])
        };
    }
    // 支持 2025/07/26,20:58:02+32
    m = raw.match(/(\d{2,4})\/(\d{2})\/(\d{2}),(\d{2}):(\d{2}):(\d{2})/);
    if (m) {
        return {
            year: m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]),
            month: Number(m[2]) - 1,
            day: Number(m[3]),
            hour: Number(m[4]),
            min: Number(m[5]),
            sec: Number(m[6])
        };
    }
    // 支持 2025年07月26日 20:58:02
    m = raw.match(/(\d{4})年(\d{2})月(\d{2})日 (\d{2}):(\d{2}):(\d{2})/);
    if (m) {
        return {
            year: Number(m[1]),
            month: Number(m[2]) - 1,
            day: Number(m[3]),
            hour: Number(m[4]),
            min: Number(m[5]),
            sec: Number(m[6])
        };
    }
    return null;
}

export function formatTime(raw: string) {
    const t = parseTime(raw);
    if (t) return new Date(t.year, t.month, t.day, t.hour, t.min, t.sec);
    // 兜底
    const d = dayjs(raw.replace(/\//g, '-').replace(',', ' '));
    if (d.isValid()) return d.toDate();
    return null;
}

export function formatTimeStr(raw: string) {
    const t = parseTime(raw);
    if (t) return `${t.year}年${String(t.month + 1).padStart(2, '0')}月${String(t.day).padStart(2, '0')}日 ${String(t.hour).padStart(2, '0')}:${String(t.min).padStart(2, '0')}:${String(t.sec).padStart(2, '0')}`;
    // 兜底
    const d = dayjs(raw.replace(/\//g, '-').replace(',', ' '));
    if (d.isValid()) return d.format('YYYY年MM月DD日 HH:mm:ss');
    return raw;
}

export function getSignalColor(val: number | undefined, type: 'rsrp' | 'rsrq' | 'sinr') {
    if (val === undefined) return 'var(--ant-color-text-secondary)';
    // -157 ~ -32
    if (type === 'rsrp') {
        if (val >= -80) return 'var(--ant-color-success)'; // 亮绿
        if (val >= -95) return 'var(--ant-color-warning)'; // 亮橙
        if (val >= -110) return 'var(--ant-color-error)'; // 亮红
        return 'var(--ant-color-error)'; // 深红
    }
    // -24 ~ 40
    if (type === 'sinr') {
        if (val >= 10) return 'var(--ant-color-success)';
        if (val >= 5) return 'var(--ant-color-warning)';
        if (val >= 0) return 'var(--ant-color-error)';
        return 'var(--ant-color-error)';
    }
    // -44 ~ 20
    if (type === 'rsrq') {
        if (val >= -10) return 'var(--ant-color-success)';
        if (val >= -15) return 'var(--ant-color-warning)';
        if (val >= -20) return 'var(--ant-color-error)';
        return 'var(--ant-color-error)';
    }
    return 'var(--ant-color-text-secondary)';
}

export function getSignalLevel(val: number | undefined, type: 'rsrp' | 'sinr') {
    if (val === undefined) return 0;
    if (type === 'rsrp') {
        if (val >= -80) return 4;
        if (val >= -95) return 3;
        if (val >= -110) return 2;
        if (val >= -120) return 1;
        return 0;
    }
    if (type === 'sinr') {
        if (val >= 20) return 4;
        if (val >= 13) return 3;
        if (val >= 0) return 2;
        if (val >= -10) return 1;
        return 0;
    }
    return 0;
}

// --- 4G/5G 频点-频段表及查找 ---
export const LTE_BANDS = [
    { band: 1, earfcnStart: 0, earfcnEnd: 599 },
    { band: 2, earfcnStart: 600, earfcnEnd: 1199 },
    { band: 3, earfcnStart: 1200, earfcnEnd: 1949 },
    { band: 4, earfcnStart: 1950, earfcnEnd: 2399 },
    { band: 5, earfcnStart: 2400, earfcnEnd: 2649 },
    { band: 6, earfcnStart: 2650, earfcnEnd: 2749 },
    { band: 7, earfcnStart: 2750, earfcnEnd: 3449 },
    { band: 8, earfcnStart: 3450, earfcnEnd: 3799 },
    { band: 12, earfcnStart: 5010, earfcnEnd: 5179 },
    { band: 13, earfcnStart: 5180, earfcnEnd: 5279 },
    { band: 14, earfcnStart: 5280, earfcnEnd: 5379 },
    { band: 17, earfcnStart: 5730, earfcnEnd: 5849 },
    { band: 18, earfcnStart: 5850, earfcnEnd: 5999 },
    { band: 19, earfcnStart: 6000, earfcnEnd: 6149 },
    { band: 20, earfcnStart: 6150, earfcnEnd: 6449 },
    { band: 25, earfcnStart: 8640, earfcnEnd: 8689 },
    { band: 26, earfcnStart: 8690, earfcnEnd: 9039 },
    { band: 28, earfcnStart: 9210, earfcnEnd: 9659 },
    { band: 29, earfcnStart: 9660, earfcnEnd: 9769 },
    { band: 30, earfcnStart: 9770, earfcnEnd: 9869 },
    { band: 32, earfcnStart: 9920, earfcnEnd: 10359 },
    { band: 34, earfcnStart: 36200, earfcnEnd: 36349 },
    { band: 38, earfcnStart: 37750, earfcnEnd: 38249 },
    { band: 39, earfcnStart: 38250, earfcnEnd: 38649 },
    { band: 40, earfcnStart: 38650, earfcnEnd: 39649 },
    { band: 41, earfcnStart: 39650, earfcnEnd: 41589 },
    { band: 42, earfcnStart: 41590, earfcnEnd: 43589 },
    { band: 43, earfcnStart: 43590, earfcnEnd: 45589 },
    { band: 46, earfcnStart: 46790, earfcnEnd: 54539 },
    { band: 48, earfcnStart: 55240, earfcnEnd: 56739 },
    { band: 66, earfcnStart: 66436, earfcnEnd: 67335 },
    { band: 71, earfcnStart: 68586, earfcnEnd: 68935 },
];
export const NR_BANDS = [
    { band: 1, arfcnStart: 422000, arfcnEnd: 434000 },
    { band: 3, arfcnStart: 361000, arfcnEnd: 376000 },
    { band: 5, arfcnStart: 173800, arfcnEnd: 178800 },
    { band: 8, arfcnStart: 185000, arfcnEnd: 192000 },
    { band: 12, arfcnStart: 145800, arfcnEnd: 149199 },
    { band: 13, arfcnStart: 149200, arfcnEnd: 151200 },
    { band: 28, arfcnStart: 151600, arfcnEnd: 160600 },
    { band: 29, arfcnStart: 143400, arfcnEnd: 145600 },
    { band: 30, arfcnStart: 470000, arfcnEnd: 472000 },
    { band: 41, arfcnStart: 499200, arfcnEnd: 537999 },
    { band: 78, arfcnStart: 620000, arfcnEnd: 653333 },
    { band: 79, arfcnStart: 693334, arfcnEnd: 733333 },
    { band: 257, arfcnStart: 2054166, arfcnEnd: 2104165 },
    { band: 258, arfcnStart: 2016667, arfcnEnd: 2070832 },
];
export function getLteBandByEarfcn(earfcn: number) {
    return LTE_BANDS.find(b => earfcn >= b.earfcnStart && earfcn <= b.earfcnEnd)?.band;
}
export function getNrBandByArfcn(arfcn: number) {
    return NR_BANDS.find(b => arfcn >= b.arfcnStart && arfcn <= b.arfcnEnd)?.band;
}

// 频点判断4G/5G
export function parseLockCellBand(value: number): { lteOrNr: 'lte' | 'nr', band: number | undefined } {
    if (getLteBandByEarfcn(value)) {
        return { lteOrNr: 'lte', band: getLteBandByEarfcn(value) };
    }
    if (getNrBandByArfcn(value)) {
        return { lteOrNr: 'nr', band: getNrBandByArfcn(value) };
    }
    return { lteOrNr: 'lte', band: undefined };
}

// 格式化MNC，确保保持前导零
export function formatMNC(mnc: string): string {
    if (!mnc) return mnc;
    return String(mnc).padStart(2, '0');
}

// 运营商英文转中文
export function getOperatorName(code: string): string {
    const codeUpper = code.toUpperCase();
    if (
        codeUpper.includes('CHN-CM') ||
        codeUpper.includes('MOBILE') ||
        codeUpper.includes('CMCC') ||
        codeUpper.includes('4E2D56FD79FB52A8') ||
        codeUpper.includes('CM') ||
        codeUpper.includes('46000') ||
        codeUpper.includes('46002') ||
        codeUpper.includes('46004')
    ) return '中国移动';
    if (
        codeUpper.includes('CHN-CU') ||
        codeUpper.includes('UNICOM') ||
        codeUpper.includes('CUCC') ||
        codeUpper.includes('4E2D56FD8054901A') ||
        codeUpper.includes('CU') ||
        codeUpper.includes('46001') ||
        codeUpper.includes('46009')
    ) return '中国联通';
    if (
        codeUpper.includes('CHN-CT') ||
        codeUpper.includes('TELECOM') ||
        codeUpper.includes('CTCC') ||
        codeUpper.includes('4E2D56FD75354FE1') ||
        codeUpper.includes('CT') ||
        codeUpper.includes('46003') ||
        codeUpper.includes('46011')
    ) return '中国电信';
    if (
        codeUpper.includes('CHN-CBN') ||
        codeUpper.includes('BROADNET') ||
        codeUpper.includes('CBN') ||
        codeUpper.includes('N-V') ||
        codeUpper.includes('CBN') ||
        codeUpper.includes('46015')
    ) return '中国广电';
    return code;
}

export function convertKbpsToMbps(kbps: number): number {
    if (!kbps || isNaN(kbps)) return 0;
    if (kbps % 1024 === 0) return kbps / 1024;
    if (kbps % 1000 === 0) return kbps / 1000;
    return Math.floor(kbps / 1024);
}

export function decodePdu(pdu: string): string {
    // 简单支持UCS2（常见中文短信）
    if (/^[0-9A-F]+$/i.test(pdu) && pdu.length % 4 === 0) {
        try {
            return pdu.match(/.{4}/g)!.map(hex => String.fromCharCode(parseInt(hex, 16))).join('');
        } catch { return pdu; }
    }
    // 其他编码可扩展
    return pdu;
}

// 工具：半字节反转
export function swapSemiOctet(str: string) {
    let res = '';
    for (let i = 0; i < str.length; i += 2) {
        res += (str[i + 1] || '') + str[i];
    }
    return res.replace(/F$/i, '');
}

// 工具：BCD时间戳转字符串
export function decodeTimestamp(ts: string) {
    const year = '20' + swapSemiOctet(ts.slice(0, 2));
    const month = swapSemiOctet(ts.slice(2, 4));
    const day = swapSemiOctet(ts.slice(4, 6));
    const hour = swapSemiOctet(ts.slice(6, 8));
    const min = swapSemiOctet(ts.slice(8, 10));
    const sec = swapSemiOctet(ts.slice(10, 12));
    return `${year}-${month}-${day} ${hour}:${min}:${sec}`;
}

// 工具：7bit解码
export function decode7bit(data: string, len: number) {
    const bytes = [];
    for (let i = 0; i < data.length; i += 2) {
        bytes.push(parseInt(data.substr(i, 2), 16));
    }
    let out = '';
    for (let i = 0; i < len; i++) {
        const bitOffset = (i * 7) % 8;
        const byteOffset = Math.floor((i * 7) / 8);
        let val = (bytes[byteOffset] >> bitOffset) & 0x7F;
        if (bitOffset > 1 && byteOffset + 1 < bytes.length) {
            val |= (bytes[byteOffset + 1] << (8 - bitOffset)) & 0x7F;
        }
        out += String.fromCharCode(val);
    }
    return out;
}

// 工具：UCS2解码
export function decodeUcs2(data: string) {
    let out = '';
    for (let i = 0; i < data.length; i += 4) {
        out += String.fromCharCode(parseInt(data.substr(i, 4), 16));
    }
    return out;
}

// 主PDU解码函数，返回 { phone, time, content }
export function decodeSmsDeliverPdu(pdu: string) {
    // 1. 取SMSC长度
    const smscLen = parseInt(pdu.slice(0, 2), 16);
    const smscEnd = (1 + smscLen) * 2;
    // 2. 取PDU类型
    let idx = smscEnd;
    const pduType = pdu.slice(idx, idx + 2);
    idx += 2;
    // 3. 取OA（发信号码）
    const oaLen = parseInt(pdu.slice(idx, idx + 2), 16);
    idx += 2;
    const oaType = pdu.slice(idx, idx + 2);
    idx += 2;
    const oaLenOctet = Math.ceil(oaLen / 2) * 2;
    const oaRaw = pdu.slice(idx, idx + oaLenOctet);
    const phone = swapSemiOctet(oaRaw).replace(/^86/, '').replace(/^0+/, '');
    idx += oaLenOctet;
    // 4. PID
    idx += 2;
    // 5. DCS
    const dcs = pdu.slice(idx, idx + 2);
    idx += 2;
    // 6. SCTS（时间戳）
    const scts = pdu.slice(idx, idx + 14);
    const time = decodeTimestamp(scts);
    idx += 14;
    // 7. UDL
    const udl = parseInt(pdu.slice(idx, idx + 2), 16);
    idx += 2;
    // 8. UD
    let ud = pdu.slice(idx);
    let content = '';
    let dcsType = dcs.toUpperCase();
    // 检查是否有UDH
    let hasUdh = false;
    let udhLen = 0;
    if (pduType.length === 2 && (parseInt(pduType, 16) & 0x40)) { // TP-UDHI=1
        hasUdh = true;
        udhLen = parseInt(ud.slice(0, 2), 16) * 2; // UDH长度（字节数*2=HEX长度）
        ud = ud.slice(2 + udhLen); // 跳过UDH头
    }
    if (dcsType === '08') {
        // UCS2
        content = decodeUcs2(ud.slice(0, udl * 2 - (hasUdh ? (udhLen + 2) : 0)));
    } else if (dcsType === '00') {
        // 7bit
        content = decode7bit(ud, udl - (hasUdh ? (udhLen + 2) / 2 : 0));
    } else {
        content = ud;
    }
    return { phone, time, content };
}

// 合并分片短信（长短信）为一条
// smsList: { pdu, phone, time, content, ... }[]
// 返回合并后的短信数组
export function mergeConcatSmsList(smsList: any[]) {
    // 提取分片信息
    function parseConcatInfoFromPdu(pdu: string) {
        const smscLen = parseInt(pdu.slice(0, 2), 16);
        const smscEnd = (1 + smscLen) * 2;
        let idx = smscEnd;
        const pduType = pdu.slice(idx, idx + 2);
        idx += 2;
        const oaLen = parseInt(pdu.slice(idx, idx + 2), 16);
        idx += 2;
        idx += 2; // oaType
        const oaLenOctet = Math.ceil(oaLen / 2) * 2;
        idx += oaLenOctet;
        idx += 2; // PID
        idx += 2; // DCS
        idx += 14; // SCTS
        idx += 2; // UDL
        const ud = pdu.slice(idx);
        if (pduType.length === 2 && (parseInt(pduType, 16) & 0x40)) {
            // 有UDH
            const udhLen = parseInt(ud.slice(0, 2), 16) * 2;
            const udh = ud.slice(2, 2 + udhLen);
            // UDH格式: 0003XXYYZZ
            const m = udh.match(/0003([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})/);
            if (m) {
                return {
                    ref: m[1],
                    total: parseInt(m[2], 16),
                    seq: parseInt(m[3], 16),
                };
            }
        }
        return null;
    }
    // 标记分片信息
    const parsedList = smsList.map(item => {
        const concat = parseConcatInfoFromPdu(item.pdu || '');
        return {
            ...item,
            _ref: concat ? concat.ref : undefined,
            _seq: concat ? concat.seq : 1,
            _total: concat ? concat.total : 1,
        };
    });
    // 分组合并
    const mergeMap: Record<string, any[]> = {};
    parsedList.forEach(item => {
        const key = item._ref
            ? `${item.phone}_${item._ref}`
            : `${item.phone}_${item.time}`;
        if (!mergeMap[key]) mergeMap[key] = [];
        mergeMap[key].push(item);
    });
    const merged: any[] = [];
    Object.values(mergeMap).forEach(arr => {
        arr.sort((a, b) => a._seq - b._seq);
        let content = '';
        const index = arr.map(x => x.index); // 直接用index数组
        arr.forEach(x => {
            content += x.content;
        });
        const base = arr[0];
        // 如果任意一条分片短信状态为 '0'（未读），则合并后的短信也标记为未读
        const hasUnread = arr.some(x => x.status === '0');
        merged.push({
            ...base,
            content,
            index, // index字段为数组
            status: hasUnread ? '0' : base.status, // 保持未读状态
        });
    });
    return merged;
}

/**
 * 点分十进制IPv6转冒号十六进制格式
 * @param ipv6 点分十进制字符串
 * @returns 标准IPv6字符串
 */
export function ipv6DotToHex(ipv6: string): string {
    if (!ipv6) return '';
    const parts = ipv6.split('.').map(x => parseInt(x, 10));
    if (parts.length === 16 && parts.every(x => !isNaN(x))) {
        let hex = '';
        for (let i = 0; i < 16; i += 2) {
            hex += ((parts[i] << 8) | parts[i + 1]).toString(16).padStart(4, '0');
            if (i < 14) hex += ':';
        }
        hex = hex.split(':').map(seg => seg.replace(/^0+/, '') || '0').join(':');
        hex = hex.replace(/(:0)+:0(:|$)/, match => '::' + (match.endsWith(':') ? '' : ':'));
        hex = hex.replace(/::+/, '::');
        return hex.toUpperCase();
    }
    return ipv6.toUpperCase();
}

/**
 * 拆分返回值，找到特定开头的行，用逗号分割，数据添加到数组
 * @param response 原始返回值字符串
 * @param prefix 要匹配的开头字符串
 * @returns 解析后的数据数组，每行一个数组
 */
export function parseResponseByPrefix(response: string, prefix: string): string[][] {
    if (!response || !prefix) return [];
    
    const lines = response.split('\n').map(line => line.trim()).filter(line => line);
    const result: string[][] = [];
    
    for (const line of lines) {
        if (line.startsWith(prefix)) {
            // 去掉匹配的开头字符串
            const dataPart = line.substring(prefix.length).trim();
            if (dataPart) {
                // 用逗号分割数据，并去掉引号
                const dataArray = dataPart.split(',').map(item => {
                    const trimmed = item.trim();
                    // 去掉首尾的引号（单引号或双引号）
                    return trimmed.replace(/^["']|["']$/g, '');
                }).filter(item => item);
                result.push(dataArray);
            }
        }
    }
    
    return result;
}

/**
 * 根据网速值返回相应的颜色
 * @param speed 网速值（B/s）
 * @returns 颜色值
 */
export function getSpeedColor(speed: number | undefined | null): string {
    if (speed == null || isNaN(speed)) return 'var(--ant-color-warning)'; // 默认橙色
    
    // 转换为MB/s进行比较
    const mbps = speed / (1024 * 1024);
    
    if (mbps >= 500) return 'var(--ant-color-success)'; // 绿色：>=500MB/s
    if (mbps >= 100) return 'var(--ant-color-primary)'; // 蓝色：>=100MB/s
    return 'var(--ant-color-warning)'; // 橙色：<100MB/s
}