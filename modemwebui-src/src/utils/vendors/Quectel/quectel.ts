// Quectel_AT 命令族实现
import {
    parseLockCellBand,
    convertKbpsToMbps,
    getOperatorName,
    decodePdu,
    decodeSmsDeliverPdu,
    mergeConcatSmsList,
    ipv6DotToHex,
    getLteBandByEarfcn,
    getNrBandByArfcn,
    parseResponseByPrefix,
    formatMNC
} from '@/utils/formatUtils';

// --- 电压 ---
export const voltage = {
    get: () => 'AT+CBC',
    parse: (raw: string) => {
        // +CBC: 0,84,3982
        const parse = parseResponseByPrefix(raw, '+CBC');
        return parse[0][2] ? Number(parse[0][2]) / 1000 : undefined;
    },
};

// --- ICCID ---
export const iccid = {
    get: () => 'AT+ICCID',
    parse: (raw: string) => {
        // +ICCID: 89860012345678901234
        const m = raw.match(/\+ICCID:\s*(\d+)/);
        return m ? m[1] : undefined;
    },
};

// --- IMSI ---
export const imsi = {
    get: () => 'AT+CIMI',
    parse: (raw: string) => {
        //AT+CIMI
        // 460013300036615
        // OK
        const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        // 查找包含纯数字的行（IMSI号码）
        for (const line of lines) {
            if (/^\d{14,15}$/.test(line)) {
                return line;
            }
        }
        return undefined;
    },
};

// --- SIM 卡号 ---
export const simNum = {
    get: () => 'AT+CNUM',
    parse: (raw: string) => {
        // +CNUM: "0","+8613800138000","17"
        // 去除引号，有+86或86开头去除+86
        const m = raw.match(/\+CNUM:\s*[^,]*,"([^"]+)"/);
        if (m) {
            const number = m[1].replace(/^(\+86|86)/, '').replace(/"/g, '');
            return number || undefined;
        }
        return undefined;
    },
};

// SIM卡槽
export const simSlot = {
    get: () => 'AT+QUIMSLOT?',
    set: (slot: 'outer' | 'inner') => `AT+QUIMSLOT=${slot === 'outer' ? 1 : 2}`,
    parse: (raw: string) => {
        const m = raw.match(/\+QUIMSLOT\s*:\s*(\d)/);
        if (m) return m[1] === '1' ? 'outer' : 'inner';
        return undefined;
    },
};

// 热插拔
export const hotSwap = {
    get: () => 'AT+QSIMDET?',
    set: (enable: boolean) => `AT+QSIMDET=${enable ? 1 : 0},1`,
    parse: (raw: string) => {
        const m = raw.match(/\+QSIMDET:\s*(\d),(\d+)/);
        if (m) return m[1] == '1';
        return undefined;
    },
};

// 飞行模式
export const airplane = {
    get: () => 'AT+CFUN?',
    set: (enable: boolean) => `AT+CFUN=${enable ? 0 : 1}`,
    parse: (raw: string) => {
        const m = raw.match(/\+CFUN:\s*(\d)/);
        if (m) return m[1] === '0' || m[1] === '4';
        return undefined;
    },
};

// PIN码
export const pin = {
    get: () => 'AT+CLCK="SC",2',
    enable: (pin: string) => `AT+CLCK="SC",1,"${pin}"`,
    disable: (pin: string) => `AT+CLCK="SC",0,"${pin}"`,
    parse: (raw: string) => {
        const m = raw.match(/\+CLCK:\s*(\d)/);
        if (m) return m[1] === '1';
        return undefined;
    },
};

// 系统信息
export const systemInfo = {
    get: () => ['ATI', 'AT+CGSN', 'AT+QGMR'],
    parse: (raws: string[]) => {
        const info = { manufacturer: '', model: '', firmware: '', imei: '', fullVersion: '' };
        const lines = (raws[0] || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        let foundQuectelIdx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes('quectel')) {
                foundQuectelIdx = i;
                break;
            }
        }
        if (foundQuectelIdx !== -1) {
            info.manufacturer = lines[foundQuectelIdx];
            info.model = lines[foundQuectelIdx + 1] || '';
            for (const line of lines) {
                if (line.startsWith('Revision:')) {
                    info.firmware = line.replace('Revision:', '').trim();
                }
            }
        }
        const m = (raws[1] || '').match(/(\d{14,17})/);
        if (m) info.imei = m[1];
        const qgmrLine = (raws[2] || '')
            .split(/\r?\n/)
            .map(l => l.trim())
            .find(l => l && !/^AT\+QGMR$/i.test(l) && l !== 'OK');
        info.fullVersion = qgmrLine || [info.model, info.firmware].filter(Boolean).join(' ');
        return info;
    },
};

// 以太网驱动
export const ethDriver = {
    get: () => 'AT+QETH="eth_driver"',
    set: (drv: string) => `AT+QETH="eth_driver","${drv}",1`,
    parse: (raw: string) => {
        const list: { label: string; value: string; enabled: boolean }[] = [];
        raw.split(/\r?\n/).forEach(line => {
            const m = line.match(/\+QETH: ?"eth_driver", ?"([^"]+)", ?(\d)/);
            if (m) {
                const label = m[1].toLowerCase() === 'r8125' ? 'RTL8125 (2.5G)' : m[1].toLowerCase() === 'r8168' ? 'RTL8168 (1G)' : m[1];
                list.push({ label, value: m[1], enabled: m[2] === '1' });
            }
        });
        return list;
    }
};

// 性能模式
export const perfMode = {
    get: () => 'AT+QSCLK?',
    set: (on: boolean) => `AT+QSCLK=${on ? 0 : 1},1`,
    parse: (raw: string): boolean => {
        const m = raw.match(/\+QSCLK: (\d),/);
        return m ? m[1] === '0' : false;
    }
};

// 重启命令
export const simpleCmd = {
    reset: () => 'AT+QCFG="ResetFactory"',
    reboot: () => 'AT+CFUN=1,1',
};

// 内网穿透
export const dmz = {
    get: () => 'AT+QMAP="DMZ"',
    setIpv4: (ip: string) => `AT+QMAP="DMZ",1,4,"${ip}"`,
    setIpv6: (ip: string) => `AT+QMAP="DMZ",1,6,"${ip}"`,
    disableIpv4: () => 'AT+QMAP="DMZ",0,4,"0.0.0.0"',
    disableIpv6: () => 'AT+QMAP="DMZ",0,6,":"::"',
    parse: (raw: string) => {
        const lines = raw.split(/\r?\n/);
        let ipv4 = { enabled: false, ip: '' };
        let ipv6 = { enabled: false, ip: '' };
        lines.forEach(line => {
            let m4 = line.match(/\+QMAP: ?"DMZ",(\d),4(?:,"([^"]+)")?/);
            let m6 = line.match(/\+QMAP: ?"DMZ",(\d),6(?:,"([^"]+)")?/);
            if (m4) {
                ipv4.enabled = m4[1] === '1';
                ipv4.ip = m4[2] || '';
            }
            if (m6) {
                ipv6.enabled = m6[1] === '1';
                ipv6.ip = m6[2] || '';
            }
        });
        return { ipv4, ipv6 };
    }
};

// 网络制式
export const netSys = {
    // 网络制式优先级
    getRatOrder: () => 'AT+QNWPREFCFG="rat_acq_order"',
    setRatOrder: (arr: string[]) => `AT+QNWPREFCFG="mode_pref",${arr.join(':')}`,
    parseRatOrder: (raw: string) => {
        const m = raw.match(/\+QNWPREFCFG: ?"(?:rat_acq_order|rat_order_pref|mode_pref)",([A-Z0-9:]+)/);
        return m ? m[1].split(':') : [];
    },
    // 漫游偏好
    getRoamPref: () => 'AT+QNWPREFCFG="roam_pref"',
    setRoamPref: (on: boolean) => `AT+QNWPREFCFG="roam_pref",${on ? 255 : 1}`,
    parseRoamPref: (raw: string) => {
        const m = raw.match(/\+QNWPREFCFG: ?"roam_pref",(\d+)/);
        return m ? m[1] === '255' : false;
    },
    // 服务域
    getSrvDomain: () => 'AT+QNWPREFCFG="srv_domain"',
    setSrvDomain: (val: number) => `AT+QNWPREFCFG="srv_domain",${val}`,
    parseSrvDomain: (raw: string) => {
        const m = raw.match(/\+QNWPREFCFG: ?"srv_domain",(\d+)/);
        return m ? parseInt(m[1], 10) : 2;
    }
};

// IMEI
export const imei = {
    set: (imei: string) => `AT+EGMR=1,7,"${imei}"`
};

// 自动拨号
export const autoDial = {
    getStatus: () => 'AT+QMAP="auto_connect"',
    set: (enable: boolean) => [`AT+QMAP="auto_connect",0,${enable ? 1 : 0}`],
    parse: (raw: string) => {
        const m = raw.match(/\+QMAP: ?"auto_connect",0,(\d)/);
        return m ? m[1] === '1' : false;
    },
    getApn: () => 'AT+CGDCONT?',
    setApn: (apn: string) => `AT+CGDCONT=1,"IPV4V6","${apn}"`,
    parseApn: (raw: string) => {
        const m = raw.match(/\+CGDCONT: 1,"([^"]+)","([^"]+)"/);
        return m ? { pdpType: m[1], apn: m[2] } : { pdpType: '', apn: '' };
    }
};

// 拨号模式
export const dialMode = {
    get: (): string[] => ['AT+QCFG="pcie/mode"'],
    set: (mode: number): string[] => mode === 1 ? ['AT+QCFG="pcie/mode",1', 'AT+QCFG="data_interface",1,0', 'AT+QMAPWAC=1'] : ['AT+QCFG="pcie/mode",0', 'AT+QCFG="data_interface",0,0', 'AT+QMAPWAC=0'],
    parse: (raw: string): number | undefined => {
        const m = raw.match(/\+QCFG: ?"pcie\/mode",(\d)/);
        if (m) return Number(m[1]);
        return undefined;
    },
    options: [
        { label: 'USB模式', value: 0 },
        { label: '转网口模式', value: 1 }
    ]
};

// USB模式
export const usbMode = {
    get: (): string => 'AT+QCFG="usbnet"',
    set: (mode: number): string => `AT+QCFG="usbnet",${mode}`,
    parse: (raw: string): number | undefined => {
        const m = raw.match(/\+QCFG: ?"usbnet",(\d+)/);
        if (m) return Number(m[1]);
        return undefined;
    },
    options: [
        { label: 'QMI拨号模式', value: 0 },
        { label: 'ECM拨号模式', value: 1 },
        { label: 'MBIM拨号模式', value: 2 },
        { label: 'RNDIS拨号模式', value: 3 },
        { label: 'NCM拨号模式', value: 5 },
    ]
};

// PDP参数
export interface PdpSetParams {
    cid: number;
    type: string;
    apn: string;
    addr?: string;
    dataComp?: number;
    headComp?: number;
}

// PDP
export const pdp = {
    getList: (): string => 'AT+CGDCONT?',
    getActive: (): string => 'AT+CGACT?',
    set: ({ cid, type, apn, addr, dataComp, headComp }: PdpSetParams): string => {
        let cmd = `AT+CGDCONT=${cid},"${type}","${apn}"`;
        if (addr !== undefined && addr !== '') cmd += `,"${addr}"`;
        if (dataComp !== undefined) cmd += `,${dataComp}`;
        if (headComp !== undefined) cmd += `,${headComp}`;
        return cmd;
    },
    delete: (cid: number): string => `AT+CGDCONT=${cid}`,
    activate: (cid: number): string => `AT+CGACT=1,${cid}`,
    deactivate: (cid: number): string => `AT+CGACT=0,${cid}`,
    parseList: (raw: string): Array<{ cid: number; type: string; apn: string; addr?: string; dataComp?: number; headComp?: number }> => {
        const result: Array<{ cid: number; type: string; apn: string; addr?: string; dataComp?: number; headComp?: number }> = [];
        raw.split(/\r?\n/).forEach(line => {
            const m = line.match(/\+CGDCONT: (\d+),"([^"]+)","([^"]*)","([^"]*)"(?:,(\d+))?(?:,(\d+))?/);
            if (m) {
                result.push({
                    cid: Number(m[1]),
                    type: m[2],
                    apn: m[3],
                    addr: m[4],
                    dataComp: m[5] !== undefined ? Number(m[5]) : undefined,
                    headComp: m[6] !== undefined ? Number(m[6]) : undefined,
                });
            }
        });
        return result;
    },
    parseActive: (raw: string): Record<number, boolean> => {
        const map: Record<number, boolean> = {};
        raw.split(/\r?\n/).forEach(line => {
            const m = line.match(/\+CGACT: (\d+),(\d)/);
            if (m) map[Number(m[1])] = m[2] === '1';
        });
        return map;
    }
};

// PDP认证
export const pdpAuth = {
    get: (cid: number = 1) => ``,
    set: (cid: number, authType: number, username: string, password: string) =>
        // `AT+CGAUTH=${cid},${authType},"${username}","${password}"`,
        ``,
    parse: (raw: string) => {
        // +CGAUTH: 1,1,"username","password"
        const m = raw.match(/\+CGAUTH:\s*(\d+),(\d+),"(.*?)","(.*?)"/);
        if (m) {
            return {
                cid: Number(m[1]),
                authType: Number(m[2]),
                username: m[3],
                password: m[4],
            };
        }
        return { cid: 1, authType: 0, username: '', password: '' };
    }
};

// 类型声明
export interface SmsItem {
    index: number;
    status: string;
    phone: string;
    time: string;
    content: string;
    pdu: string;
}

export interface TempResult {
    name: string;
    description: string;
    value: number;
}

// 锁小区
export const lockCell = {
    get: (params: any): string[] => {
        if (params.lteOrNr === 'lte') {
            if (params.mode == 0) {
                return ['AT+QNWLOCK="common/4g",0'];
            } else {
                return [`AT+QNWLOCK="common/4g",1,${params.earfcn},${params.pci}`];
            }
        } else {
            if (params.mode == 0) {
                return ['AT+QNWLOCK="common/5g",0'];
            } else {
                return [`AT+QNWLOCK="common/5g",${params.pci},${params.arfcn},${params.subcarrierSpacing},${params.band}`];
            }
        }
    },
    getStatus: (): string[] => ['AT+QNWLOCK="common/5g"', 'AT+QNWLOCK="common/4g"'],
    parseStatus: (raw: string) => {
        // 例: +QNWLOCK: "common/4g",1,1650,386
        //     +QNWLOCK: "common/5g",815,627264,30,78
        const match4g = raw.match(/\+QNWLOCK: ?"common\/4g",(\d+)(?:,(\d+),(\d+))?/);
        const match5g = raw.match(/\+QNWLOCK: ?"common\/5g",(\d+),(\d+),(\d+),(\d+)/);
        if (match5g) {
            return {
                mode: '1',
                rat: 'nr',
                pci: match5g[1] || '',
                freq: match5g[2] || '',
                subcarrierSpacing: Number(match5g[3]) === 15 ? 0 : 1,
                band: match5g[4] ? Number(match5g[4]) : undefined,
            };
        } else if (match4g) {
            return {
                mode: match4g[1],
                rat: 'lte',
                freq: match4g[2] || '',
                pci: match4g[3] || '',
                subcarrierSpacing: 0,
                band: match4g[2] ? parseLockCellBand(Number(match4g[2])).band : undefined,
            };
        }
        return null;
    },
};

// 频段支持
export const bandSupport = {
    get: (): string[] => ['AT+QNWPREFCFG="lte_band"', 'AT+QNWPREFCFG="nr5g_band"'],
    set: (bands: number[]): string[] => {
        // 4G: 101~199, 5G: 501, 5041, 5078 ...
        const lteBands = bands.filter(b => b >= 101 && b < 200).map(b => b - 100).sort((a, b) => a - b);
        // 5G: 以50开头的数字，去掉前缀50后为N后数字
        const nrBands = bands.filter(b => String(b).startsWith('50')).map(b => Number(String(b).slice(2))).sort((a, b) => a - b);
        let cmds: string[] = [];
        if (lteBands.length > 0) cmds.push(`AT+QNWPREFCFG="lte_band",${lteBands.join(':')}`);
        if (nrBands.length > 0) cmds.push(`AT+QNWPREFCFG="nr5g_band",${nrBands.map(b => `${b}`).join(':')}`);
        return cmds;
    },
    parse: (raw: string): number[] => {
        const bands: number[] = [];
        const lines = raw.split(/\r?\n/);
        for (const line of lines) {
            if (line.includes('lte_band')) {
                const m = line.match(/lte_band",([\d:]+)/);
                if (m) bands.push(...m[1].split(':').map(v => Number(v) + 100));
            } else if (line.includes('nr5g_band')) {
                const m = line.match(/nr5g_band",([\d:]+)/);
                if (m) m[1].split(':').forEach(v => bands.push(Number('50' + Number(v))));
            }
        }
        return bands;
    },
    restore: (): string => 'AT+QNWPREFCFG="restore_band"',
};

// 邻区
export const neighbourCell = {
    get: (): string[] => ['AT+QENG="servingcell"', 'AT+QENG="neighbourcell";+QNWCFG="nr5g_meas_info",1;+QNWCFG="nr5g_meas_info"'],
    parse: (raw: string) => {
        const lines = raw.split(/\r?\n/);

        // 先查找主服务小区的制式
        let primaryRat: string | null = null;
        const modePriority = ['"NR5G-SA"', '"NR5G-NSA"', '"LTE"', '"WCDMA"'];
        
        for (const modeStr of modePriority) {
            const servingLine = lines.find(l => l.includes('+QENG:') && l.includes('"servingcell"') && l.includes(modeStr));
            if (servingLine) {
                if (modeStr === '"NR5G-SA"' || modeStr === '"NR5G-NSA"') {
                    primaryRat = 'NR5G';
                } else if (modeStr === '"LTE"') {
                    primaryRat = 'LTE';
                } else if (modeStr === '"WCDMA"') {
                    primaryRat = 'WCDMA';
                }
                break;
            }
        }

        // LTE intra: +QENG: "neighbourcell intra","LTE",<earfcn>,<PCID>,<RSRQ>,<RSRP>,<RSSI>,<SINR>,...
        // LTE inter: +QENG: "neighbourcell inter","LTE",<earfcn>,<PCID>,<RSRQ>,<RSRP>,<RSSI>,<SINR>,...
        // 暂时弃用 --> NR5G intra: +QENG: "neighbourcell intra","NR5G",<arfcn>,<pci>,<rsrq>,<rsrp>,<rssi>,<sinr>,...
        // 改为: +QNWCFG: "nr5g_meas_info",1,<arfcn>,<pci>,<rsrp>,<rsrq>
        const cells: any[] = [];
        
        for (const line of lines) {
            // LTE intra/inter - 只在主服务小区是LTE时添加
            const m = line.match(/\+QENG: "neighbourcell (intra|inter)","(LTE)",(\d+),(\d+|\-),(\-?\d+|\-),(\-?\d+|\-),(\-?\d+|\-),(\-?\d+|\-),/);
            if (m && primaryRat === 'LTE') {
                const [_, type, rat, earfcn, pci, rsrq, rsrp, rssi, sinr] = m;
                let band: number | undefined = undefined;
                if (rat === 'LTE') {
                    band = getLteBandByEarfcn(Number(earfcn));
                }
                cells.push({
                    type: type as 'intra' | 'inter',
                    rat,
                    earfcn: Number(earfcn),
                    pci: pci === '-' ? -1 : Number(pci),
                    rsrp: rsrp === '-' ? undefined : Number(rsrp),
                    rsrq: rsrq === '-' ? undefined : Number(rsrq),
                    rssi: rssi === '-' ? undefined : Number(rssi),
                    sinr: sinr === '-' ? undefined : Number(sinr),
                    band,
                });
                continue;
            }
            // NR5G intra/inter - 只在主服务小区是NR5G时添加
            const m5g = line.match(/\+QNWCFG: "nr5g_meas_info",(\d+),(\d+),(\d+|\-),(\-?\d+|\-),(\-?\d+|\-)/);
            if (m5g && primaryRat === 'NR5G') {
                const [_, type, arfcn, pci, rsrp, rsrq] = m5g;
                let band: number | undefined = undefined;
                band = getNrBandByArfcn(Number(arfcn));
                cells.push({
                    type: type as 'intra' | 'inter',
                    rat :'NR5G',
                    earfcn: Number(arfcn),
                    pci: pci === '-' ? -1 : Number(pci),
                    rsrp: rsrp === '-' ? undefined : Number(rsrp),
                    rsrq: rsrq === '-' ? undefined : Number(rsrq),
                    band,
                });
            }

            // NR5G intra/inter
            // const m5g = line.match(/\+QENG: "neighbourcell (intra|inter)","(NR5G)",(\d+),(\d+|\-),(\-?\d+|\-),(\-?\d+|\-),(\-?\d+|\-),(\-?\d+|\-),/);
            // if (m5g) {
            //     const [_, type, rat, arfcn, pci, rsrq, rsrp, rssi, sinr] = m5g;
            //     let band: number | undefined = undefined;
            //     band = getNrBandByArfcn(Number(arfcn));
            //     cells.push({
            //         type: type as 'intra' | 'inter',
            //         rat,
            //         earfcn: Number(arfcn),
            //         pci: pci === '-' ? -1 : Number(pci),
            //         rsrp: rsrp === '-' ? undefined : Number(rsrp),
            //         rsrq: rsrq === '-' ? undefined : Number(rsrq),
            //         rssi: rssi === '-' ? undefined : Number(rssi),
            //         sinr: sinr === '-' ? undefined : Number(sinr),
            //         band,
            //     });
            // }
        }
        return cells;
    },
};

// 信号质量
export const qrsrp = {
    get: (): string => 'AT+QRSRP',
    parse: (raw: string): { value?: number } => {
        const m = raw.match(/\+QRSRP: ([^,]+)/);
        return m ? { value: Number(m[1]) } : {};
    }
};

// 信号质量
export const qsinr = {
    get: (): string => 'AT+QSINR',
    parse: (raw: string): { value?: number } => {
        const m = raw.match(/\+QSINR: ([^,]+)/);
        return m ? { value: Number(m[1]) } : {};
    }
};

// 信号质量
export const qrsrq = {
    get: (): string => 'AT+QRSRQ',
    parse: (raw: string): { value?: number } => {
        const m = raw.match(/\+QRSRQ: ([^,]+)/);
        return m ? { value: Number(m[1]) } : {};
    }
};

// 信号强度
export const csq = {
    get: (): string => 'AT+CSQ',
    parse: (raw: string): { rssi?: number; dBm?: number | string } => {
        const m = raw.match(/\+CSQ: (\d+),/);
        if (!m) return {};
        const rssi = Number(m[1]);
        let dBm: number | string = '';
        if (rssi === 0) dBm = -113;
        else if (rssi === 1) dBm = -111;
        else if (rssi >= 2 && rssi <= 30) dBm = -113 + 2 * rssi;
        else if (rssi === 31) dBm = -51;
        else dBm = '未知';
        return { rssi, dBm };
    }
};

// 载波信息
export const qcainfo = {
    get: (): string[] => ['AT+QENG="servingcell"', 'AT+QCAINFO'],
    parse: (raws: string[]) => {
        const servingRaw = Array.isArray(raws) ? (raws[0] || '') : '';
        const qcaRaw = Array.isArray(raws) ? raws.slice(1).join('\n') : (raws as unknown as string);
        const { byEarfcn: servingMap } = parseServingCellRaw(servingRaw);
        const result: { pcc?: any, scc?: any[] } = { scc: [] };
        const qLines = qcaRaw.split(/\r?\n/);
        const nrBwMap: Record<string, string> = {
            '0': '5MHz',
            '1': '10MHz',
            '2': '15MHz',
            '3': '20MHz',
            '4': '25MHz',
            '5': '30MHz',
            '6': '40MHz',
            '7': '50MHz',
            '8': '60MHz',
            '9': '70MHz',
            '10': '80MHz',
            '11': '90MHz',
            '12': '100MHz',
            '13': '200MHz',
            '14': '400MHz',
            '15': '35MHz',
            '16': '45MHz' };
        const cellStateMap: Record<string, string> = {
            '0': '配置解除',
            '1': '配置已去激活',
            '2': '配置已激活'
        };
        for (const line of qLines) {
            if (line.includes('PCC')) {
                //+QCAINFO:"PCC",627264,10"NR5G BAND 78",737
                const m = line.match(/PCC",(\d+),(\d+),"([^"]+)",(\d+)(?:,(\d+))?(?:,(-?\d+))?(?:,(-?\d+))?(?:,(-?\d+))?(?:,(-?\d+))?/);
                if (m) {
                    const earfcn = Number(m[1]);
                    const base: any = {
                        earfcn,
                        bw: nrBwMap[Number(m[2])] || Number(m[2]),
                        band: m[3],
                        cellId: Number(m[4]),
                        pci: m[5] !== undefined ? Number(m[5]) : undefined,
                        rsrp: m[6] !== undefined ? Number(m[6]) : undefined,
                        rsrq: m[7] !== undefined ? Number(m[7]) : undefined,
                        rssi: m[8] !== undefined ? Number(m[8]) : undefined,
                        sinr: m[9] !== undefined ? Number(m[9]) : undefined,
                    };
                    const ext = servingMap[earfcn];
                    if (ext) Object.assign(base, Object.fromEntries(Object.entries(ext).filter(([k,v]) => v !== '-' && v !== undefined && v !== '')));
                    result.pcc = base;
                }
            } else if (line.includes('SCC')) {
                // 兼容4~8字段的SCC
                // "SCC",504990,12,"NR5G BAND 41",263
                // "SCC",504990,12,"NR5G BAND 41",263,-79,-11,1984
                // "SCC",504990,12,"NR5G BAND 41",1,263,0,-,-
                
                // 先尝试第三种格式: "SCC",earfcn,bw,"band",field,pci,rsrp,rsrq,sinr,rssi
                // 通过检查第4个字段是否为小数字(通常是1)来识别
                let m = line.match(/SCC",(\d+),(\d+),"([^"]+)",(\d+)(?:,(-?\d+))?(?:,(-?\d+))?(?:,(-?\d+))?(?:,(-?\d+))?/);
                if (m && Number(m[4]) <= 10) { // 第4个字段通常是小数字，用于区分格式
                    const earfcn = Number(m[1]);
                    const base: any = {
                        earfcn,
                        bw: nrBwMap[Number(m[2])] || Number(m[2]),
                        band: m[3],
                        scell_state: cellStateMap[Number(m[4])] || Number(m[4]),
                        pci: Number(m[5]),
                        rsrp: m[6] !== undefined ? Number(m[6]) : undefined,
                        rsrq: m[7] !== undefined ? Number(m[7]) : undefined,
                        sinr: m[8] !== undefined ? Number(m[8]) : undefined,
                        rssi: m[9] !== undefined ? Number(m[9]) : undefined,
                    };
                    const ext = servingMap[earfcn];
                    if (ext) Object.assign(base, Object.fromEntries(Object.entries(ext).filter(([k,v]) => v !== '-' && v !== undefined && v !== '')));
                    result.scc!.push(base);
                } else {
                    // 尝试前两种格式: "SCC",earfcn,bw,"band",pci[,rsrp,rsrq,sinr,rssi]
                    m = line.match(/SCC",(\d+),(\d+),"([^"]+)",(\d+)(?:,(-?\d+))?(?:,(-?\d+))?(?:,(-?\d+))?(?:,(-?\d+))?/);
                    if (m) {
                        const earfcn = Number(m[1]);
                        const base: any = {
                            earfcn,
                            bw: nrBwMap[Number(m[2])] || Number(m[2]),
                            band: m[3],
                            pci: Number(m[4]),
                            rsrp: m[5] !== undefined ? Number(m[5]) : undefined,
                            rsrq: m[6] !== undefined ? Number(m[6]) : undefined,
                            sinr: m[7] !== undefined ? Number(m[7]) : undefined,
                            rssi: m[8] !== undefined ? Number(m[8]) : undefined,
                        };
                        const ext = servingMap[earfcn];
                        if (ext) Object.assign(base, Object.fromEntries(Object.entries(ext).filter(([k,v]) => v !== '-' && v !== undefined && v !== '')));
                        result.scc!.push(base);
                    }
                }
            }
        }
        return result;
    }
};

// 服务小区
export const qengServingCell = {
    get: (): string => 'AT+QENG="servingcell"',
    parse: (raw: string) => {
        const parsed = parseServingCellRaw(raw);
        return { ...parsed.primary, infoArr: parsed.infoArr, byEarfcn: parsed.byEarfcn };
    }
};

// 网络类型
export const networkType = {
    get: (): string => 'AT+QNWINFO',
    parse: (raw: string) => {
        // +QNWINFO: "FDD LTE","46000","LTE BAND 3",1302
        const m = raw.match(/\+QNWINFO: ?"([^"]+)"/);
        return m ? m[1] : undefined;
    },
};

// 注册状态
export const regStatus = {
    get: (): string[] => ['AT+C5GREG?', 'AT+CEREG?', 'AT+CREG?', 'AT+CGREG?'],
    parse: (raw: string) => {
        const m5g = raw.match(/\+C5GREG: (\d),(\d)/);
        if (m5g) return Number(m5g[2]);
        const m4g = raw.match(/\+CEREG: (\d),(\d)/);
        if (m4g) return Number(m4g[2]);
        const m3g = raw.match(/\+CREG: (\d),(\d)/);
        if (m3g) return Number(m3g[2]);
        const m2g = raw.match(/\+CGREG: (\d),(\d)/);
        if (m2g) return Number(m2g[2]);
        return undefined;
    },
};

// 短信
export const sms = {
    getListCmd: () => ['AT+CMGF=0', 'AT+CSCS="GSM"', 'AT+CMGL=4'],
    parseList: (raw: string) => {
        const result: SmsItem[] = [];
        const lines = raw.split(/\r?\n/).map(l => l.trim());
        let cur: Partial<SmsItem> = {};
        for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(/\+CMGL: (\d+),(\d+),,(\d+)/);
            if (m) {
                if (cur.index !== undefined && cur.pdu) {
                    result.push(cur as SmsItem);
                }
                cur = {
                    index: Number(m[1]),
                    status: m[2],
                    pdu: '',
                    phone: '',
                    time: '',
                    content: '',
                };
            } else if (cur && lines[i] && !lines[i].startsWith('+') && !lines[i].startsWith('OK') && !lines[i].startsWith('AT')) {
                cur.pdu = lines[i];
            }
        }
        if (cur.index !== undefined && cur.pdu) {
            result.push(cur as SmsItem);
        }

        // 解析所有短信
        const parsedList = result.map(item => {
            const info = decodeSmsDeliverPdu(item.pdu || '');
            return {
                ...item,
                phone: info.phone,
                time: info.time,
                content: info.content,
            };
        });

        // 合并分片短信
        return mergeConcatSmsList(parsedList);
    },
    getDeleteCmd: (index: number | number[]) => {
        if (Array.isArray(index)) {
            return index.map(i => `AT+CMGD=${i}`);
        }
        return [`AT+CMGD=${index}`];
    },
};

// 短信中心
export const smsCenter = {
    get: (): string => 'AT+CSCA?',
    set: (num: string) => {
        // 带+86为145，不带为161
        const isPlus = /^\+?86/.test(num);
        const n = num.startsWith('+') ? num : (isPlus ? '+' + num : num);
        return `AT+CSCA="${n}",${isPlus ? 145 : 161}`;
    },
    parse: (raw: string) => {
        // +CSCA: "+8613010331500",145
        const m = raw.match(/\+CSCA: "([^"]+)",\s*\d+/);
        return m ? m[1] : undefined;
    },
};

// 发送短信
export const sendSms = {
    get: (smsc: string, phone: string, content: string): string => {
        const ensure86 = (num: string): string => {
            if (!num) return '';
            return num.startsWith('86') ? num : (num.startsWith('+86') ? num.slice(1) : '86' + num.replace(/^\+/, ''));
        };
        const smsc86 = ensure86(smsc);
        const phone86 = ensure86(phone);
        return `SEND_SMS,${smsc86},${phone86},"${content}"`;
    },
    parse: (raw: string): boolean => /OK/.test(raw),
};

// 短信启用
export const smsEnable = {
    get: (): string => 'AT+CSMS?',
    set: (enable: boolean): string => `AT+CSMS=${enable ? 1 : 0}`,
    parse: (raw: string): boolean | undefined => {
        // +CSMS: 1,1,1,1
        const m = raw.match(/\+CSMS: (\d)/);
        if (m) return m[1] === '1';
        return undefined;
    },
};

// 短信存储
export const smsStore = {
    get: (): string[] => ['AT+CPMS?'],
    set: (pos: 'SM' | 'ME'): string => `AT+CPMS="${pos}","${pos}","${pos}"`,
    parse: (raw: string): any => {
        // +CPMS: "SM",2,50,"SM",2,50,"SM",2,50
        const m = raw.match(/\+CPMS:.*?("SM"|"ME"),\s*(\d+),\s*(\d+),\s*("SM"|"ME"),\s*(\d+),\s*(\d+),\s*("SM"|"ME"),\s*(\d+),\s*(\d+)/);
        if (m) {
            return {
                read: { used: Number(m[2]), total: Number(m[3]) },
                write: { used: Number(m[5]), total: Number(m[6]) },
                status: { used: Number(m[8]), total: Number(m[9]) },
                rawArr: m
            };
        }
        const nums = raw.match(/\d+/g);
        if (nums && nums.length >= 6) {
            return {
                read: { used: Number(nums[0]), total: Number(nums[1]) },
                write: { used: Number(nums[2]), total: Number(nums[3]) },
                status: { used: Number(nums[4]), total: Number(nums[5]) },
                rawArr: nums
            };
        }
        return { read: { used: 0, total: 0 }, write: { used: 0, total: 0 }, status: { used: 0, total: 0 }, rawArr: [] };
    },
};

// 温度
export const temp = {
    get: (): string[] => ['AT+QTEMP'],
    parse: (raws: string[]): TempResult[] => {
        const result: TempResult[] = [];
        const tempNameMap: Record<string, { name: string; description: string }> = {
            'modem-lte-sub6-pa1': { name: '4G PA1温度', description: '4G功放1' },
            'modem-lte-sub6-pa2': { name: '4G PA2温度', description: '4G功放2' },
            'modem-mmw0': { name: 'MIMO PA温度', description: '多入多出功放' },
            'modem-tcxo': { name: 'TCXO温度', description: '晶体振荡器' },
            'aoss-0-usr': { name: 'Always-On 温度', description: '应用处理器1' },
            'cpuss-0-usr': { name: 'CPU 温度', description: '应用处理器2' },
            'mdmss-0-usr': { name: 'Modem1温度', description: '调制解调器1' },
            'mdmss-1-usr': { name: 'Modem2温度', description: '调制解调器2' },
            'mdmss-2-usr': { name: 'Modem3温度', description: '调制解调器3' },
            'mdmss-3-usr': { name: 'Modem4温度', description: '调制解调器4' },
            'mdmq6-0-usr': { name: 'ModemQ6温度', description: '调制解调器Q6' },
            'modem-ambient-usr': { name: '环境温度', description: '模块环境' },
        };
        raws.forEach(raw => {
            const reg = /\+QTEMP:"([^"]+)","?(-?\d+)"?/g;
            let m: RegExpExecArray | null;
            while ((m = reg.exec(raw)) !== null) {
                const enName = m[1];
                const value = Number(m[2]);
                if (value > 0) {
                    const tempInfo = tempNameMap[enName] || { name: enName, description: '' };
                    result.push({ name: tempInfo.name, description: tempInfo.description, value });
                }
            }
        });
        return result;
    }
};

// 网速
export const netSpeed = {
    getSigned: () => [
        'AT+QNWCFG="nr5g_ambr"',
        'AT+QNWCFG="lte_ambr"'
    ],
    parseSigned: (raws: string[]) => {
        // 先找5G
        for (const raw of raws) {
            const parse = parseResponseByPrefix(raw, '+QNWCFG: "nr5g_ambr",');
            for (const line of parse) {
                if (line[0].toUpperCase() != 'IMS') {
                    return {
                        apn: line[0],
                        downQci: Number(line[1]),
                        down: Number(line[2]),
                        upQci: Number(line[3]),
                        up: Number(line[4]),
                        type: '5G'
                    }
                }
            }
        }
        // 再找4G
        for (const raw of raws) {
            let m = raw.match(/\+QNWCFG: "lte_ambr","([^"]+)",(\d+),(\d+)/);
            if (m) {
                return {
                    apn: m[1],
                    down: convertKbpsToMbps(Number(m[2])),
                    up: convertKbpsToMbps(Number(m[3])),
                    type: '4G'
                };
            }
        }
        return undefined;
    },
    getRealtime: () => 'AT+QNWCFG="up/down"',
    parseRealtime: (raw: string) => {
        const m = raw.match(/\+QNWCFG: "up\/down",(\d+),(\d+),/);
        if (m) {
            return { up: Number(m[1]), down: Number(m[2]) };
        }
        return undefined;
    },
    getOperator: () => ['AT+COPS?', 'AT+QNWINFO'],
    parseOperator: (raws: string[]): string | undefined => {
        // +COPS: 0,0,"CHN-CT",0
        const raw = raws.join('\n');
        const lines = raw.split(/\r?\n/);
        for (const line of lines) {
            if (line.startsWith('+COPS:')) {
                const arr = line.split(',');
                if (arr.length >= 3) {
                    // arr[2] 可能为 "CHN-CT"，去除引号
                    const name = arr[2].replace(/"/g, '').trim();
                    const parsed = getOperatorName(name);
                    if (parsed && parsed !== name && !/\?{2,}/.test(parsed)) return parsed;
                }
            }
        }
        const qnwInfo = raw.match(/\+QNWINFO:\s*"[^"]*","([^"]+)"/);
        if (qnwInfo) {
            const parsed = getOperatorName(qnwInfo[1]);
            if (parsed && parsed !== qnwInfo[1]) return parsed;
        }
        return undefined;
    },
};

// 流量统计
export const trafficStat = {
    getTraffic: () => ['AT+QGDNRCNT?', 'AT+QGDCNT?'],
    parseTraffic: (raws: string[]) => {
        // +QGDNRCNT: 1045858,280306954
        let up5g = 0;
        let down5g = 0;
        const m5g = raws.join('\n').match(/\+QGDNRCNT: (\d+),(\d+)/);
        if (m5g)
        {
            down5g = m5g[1] ? Number(m5g[1]) : 0;
            up5g = m5g[2] ? Number(m5g[2]) : 0;
        }
        // +QGDCNT: 3554772,46092526
        let up2 = 0;
        let down2 = 0;
        const m2 = raws.join('\n').match(/\+QGDCNT: (\d+),(\d+)/);
        if (m2)
        {
            up2 = m2[1] ? Number(m2[1]) : 0;
            down2 = m2[2] ? Number(m2[2]) : 0;
        }
        return { up: up5g + up2, down: down5g + down2 };
    },
    getTime: () => ['AT+QLTS=0', 'AT+CCLK?'],
    parseTime: (raws: string[]) => {
        // +QLTS: "2025/08/06,10:30:51+32",0
        // +CCLK: "25/08/06,14:37:32"
        let lastConnectTime = '', nowTime = '';
        const m1 = raws[0]?.match(/\+QLTS: "([^"]+)/);
        if (m1) lastConnectTime = m1[1];
        const m2 = raws[1]?.match(/\+CCLK: "([^"]+)/);
        if (m2) nowTime = m2[1];
        return { lastConnectTime, nowTime };
    },
    reset: () => ['AT+QGDNRCNT=0', 'AT+QGDCNT=0'],
};

// 频段查询
export const bandQuery = {
    get: () => '',
    parse: (raw: string) => {
        // 匹配所有括号
        // 101:103:105:108:134:138:139:140:141:501:503:505:508:5028:5041:5078:5079
        let bands: number[] = [
            101, 103, 105, 107, 108, 117, 118, 119, 120, 126, 128, 132, 134, 138, 139, 140, 141, 142, 143,
            501, 503, 505, 507, 508, 5020, 5028, 5038, 5040, 5041, 5077, 5078, 5079];
        return bands;
    }
};

// IP地址
export const ipAddr = {
    get: () => ['AT+CGPIAF=1,1,1,1', 'AT+CGPADDR=1'],
    parse: (raw: string) => {
        const m = raw.match(/\+CGPADDR:\s*\d+,"([^"]*)"(?:,"([^"]*)")?/);
        let ipv4 = m?.[1] || undefined;
        let ipv6 = m?.[2] || undefined;
        let ipv6Hex = undefined;
        if (ipv6) {
            ipv6Hex = ipv6DotToHex(ipv6);
        }
        return { ipv4, ipv6, ipv6Hex };
    }
};

// 统一的服务小区解析函数，返回主显示信息与按频点索引
function parseServingCellRaw(raw: string) {
    const lteBwMap: Record<string, string> = { 
        '0': '1.4MHz', 
        '1': '3MHz', 
        '2': '5MHz', 
        '3': '10MHz', 
        '4': '15MHz', 
        '5': '20MHz' };
    const nrBwMap: Record<string, string> = {
        '0': '5MHz',
        '1': '10MHz',
        '2': '15MHz',
        '3': '20MHz',
        '4': '25MHz',
        '5': '30MHz',
        '6': '40MHz',
        '7': '50MHz',
        '8': '60MHz',
        '9': '70MHz',
        '10': '80MHz',
        '11': '90MHz',
        '12': '100MHz',
        '13': '200MHz',
        '14': '400MHz',
        '15': '35MHz',
        '16': '45MHz' };
    const scsMap: Record<string, string> = { 
        '0': '15kHz',
        '1': '30kHz',
        '2': '60kHz',
        '3': '120kHz',
        '4': '240kHz' };

    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let primary: any = {};
    let infoArr: string[] = [];
    const servingMap: Record<number, any> = {};

    const modePriority = ['"NR5G-SA"', '"LTE"', '"WCDMA"'];

    for (const line of lines) {
        if (!line.includes('+QENG:')) continue;
        // LTE
        if (line.includes('"LTE"')) {
            const arr = line.split(',');
            const idx = arr.findIndex(s => s.includes('"LTE"'));
            const earfcn = Number(arr[idx + 6]);
            const info = {
                rat: 'LTE',
                duplex: arr[idx + 1]?.replace(/"/g, ''),
                mcc: arr[idx + 2], 
                mnc: formatMNC(arr[idx + 3]),
                cellId: arr[idx + 4], 
                pci: arr[idx + 5],
                earfcn,
                band: arr[idx + 7],
                ul_bandwidth: lteBwMap[arr[idx + 8] || ''],
                dl_bandwidth: lteBwMap[arr[idx + 9] || ''],
                tac: arr[idx + 10], lac: arr[idx + 10],
                rsrp: arr[idx + 11], 
                rsrq: arr[idx + 12], 
                rssi: arr[idx + 13], 
                sinr: arr[idx + 14],
                cqi: arr[idx + 15], 
                tx_power: arr[idx + 16], 
                srxlev: arr[idx + 17], 
                scs: undefined,
            };
            servingMap[earfcn] = info;
        }
        // NR5G-NSA
        if (line.includes('"NR5G-NSA"')) {
            const arr = line.split(',');
            const idx = arr.findIndex(s => s.includes('"NR5G-NSA"'));
            const earfcn = Number(arr[idx + 7]);
            const info = {
                rat: 'NR5G-NSA',
                mcc: arr[idx + 1], 
                mnc: formatMNC(arr[idx + 2]),
                pci: arr[idx + 3], 
                rsrp: arr[idx + 4], 
                sinr: arr[idx + 5], 
                rsrq: arr[idx + 6],
                earfcn, 
                band: arr[idx + 8],
                nr_dl_bandwidth: nrBwMap[arr[idx + 9] || ''], 
                scs: scsMap[arr[idx + 10] || '']
            };
            servingMap[earfcn] = info;
        }
        // NR5G-SA
        if (line.includes('"NR5G-SA"')) {
            const arr = line.split(',');
            const idx = arr.findIndex(s => s.includes('"NR5G-SA"'));
            const earfcn = Number(arr[idx + 7]);
            const info = {
                rat: 'NR5G-SA',
                duplex: arr[idx + 1]?.replace(/"/g, ''),
                mcc: arr[idx + 2], 
                mnc: formatMNC(arr[idx + 3]),
                cellId: arr[idx + 4], 
                pci: arr[idx + 5], tac: arr[idx + 6],
                earfcn, 
                band: arr[idx + 8],
                nr_dl_bandwidth: nrBwMap[arr[idx + 9] || ''],
                rsrp: arr[idx + 10], 
                rsrq: arr[idx + 11], 
                sinr: arr[idx + 12], 
                scs: scsMap[arr[idx + 13] || ''], 
                srxlev: arr[idx + 14]
            };
            servingMap[earfcn] = info;
        }
    }

    // primary 选择
    for (const modeStr of modePriority) {
        const line = lines.find(l => l.includes('+QENG:') && l.includes(modeStr));
        if (!line) continue;
        const arr = line.split(',');
        const idx = arr.findIndex(s => s.includes(modeStr));
        infoArr = arr;
        if (modeStr === '"NR5G-SA"') {
            primary = { 
                rat: 'NR5G-SA',
                duplex: arr[idx + 1]?.replace(/"/g, ''),
                mcc: arr[idx + 2], 
                mnc: formatMNC(arr[idx + 3]), 
                cellId: arr[idx + 4], 
                pci: arr[idx + 5], 
                tac: arr[idx + 6],
                earfcn: arr[idx + 7], 
                band: arr[idx + 8], 
                nr_dl_bandwidth: nrBwMap[arr[idx + 9] || ''], 
                rsrp: arr[idx + 10], 
                rsrq: arr[idx + 11], 
                sinr: arr[idx + 12], 
                scs: scsMap[arr[idx + 13] || ''], 
                srxlev: arr[idx + 14],
                rssi: undefined, 
                cqi: undefined, 
                tx_power: undefined, 
                lac: arr[idx + 6],
            };
        } else if (modeStr === '"LTE"') {
            primary = { 
                rat: 'LTE',
                duplex: arr[idx + 1]?.replace(/"/g, ''), 
                mcc: arr[idx + 2], 
                mnc: formatMNC(arr[idx + 3]), 
                cellId: arr[idx + 4], 
                pci: arr[idx + 5],
                earfcn: arr[idx + 6], 
                band: arr[idx + 7], 
                ul_bandwidth: lteBwMap[arr[idx + 8] || ''], 
                dl_bandwidth: lteBwMap[arr[idx + 9] || ''], 
                tac: arr[idx + 10], 
                lac: arr[idx + 10],
                rsrp: arr[idx + 11], 
                rsrq: arr[idx + 12], 
                rssi: arr[idx + 13], 
                sinr: arr[idx + 14], 
                cqi: arr[idx + 15], 
                tx_power: arr[idx + 16], 
                srxlev: arr[idx + 17], 
                scs: undefined,
            };
        } else if (modeStr === '"WCDMA"') {
            primary = {
                rat: 'WCDMA', 
                duplex: undefined,
                mcc: arr[idx + 1], 
                mnc: formatMNC(arr[idx + 2]), 
                lac: arr[idx + 3], 
                cellId: arr[idx + 4], 
                earfcn: arr[idx + 5], 
                pci: arr[idx + 6], 
                band: arr[idx + 7],
                rscp: arr[idx + 8], 
                ecio: arr[idx + 9], 
                phych: arr[idx + 10], 
                sf: arr[idx + 11], 
                slot: arr[idx + 12], 
                speech_code: arr[idx + 13], 
                com_mod: arr[idx + 14],
                ul_bandwidth: undefined, 
                dl_bandwidth: undefined, 
                tac: undefined, 
                rsrp: undefined, 
                rsrq: undefined, 
                rssi: undefined, 
                sinr: undefined, 
                cqi: undefined, 
                tx_power: undefined, 
                srxlev: undefined, 
                scs: undefined,
            };
        }
        break;
    }

    // 追加 NR5G-NSA 概览（不覆盖主）
    const nsaLine = lines.find(l => l.includes('+QENG:') && l.includes('"NR5G-NSA"'));
    if (nsaLine) {
        const arr = nsaLine.split(',');
        const idx = arr.findIndex(s => s.includes('"NR5G-NSA"'));
        primary.nsa = {
            rat: 'NR5G-NSA', 
            mcc: arr[idx + 1], 
            mnc: formatMNC(arr[idx + 2]), 
            pci: arr[idx + 3], 
            physicalCellId: arr[idx + 3], 
            rsrp: arr[idx + 4], 
            sinr: arr[idx + 5], 
            rsrq: arr[idx + 6], 
            earfcn: arr[idx + 7], 
            band: arr[idx + 8], 
            dl_bandwidth: nrBwMap[arr[idx + 9] || ''],
        };
    }
    return { primary, infoArr, byEarfcn: servingMap };
}

// 导出 Quectel_AT 命令族对象
export const Quectel_AT = {
    voltage,
    iccid,
    imsi,
    simNum,
    simSlot,
    hotSwap,
    airplane,
    pin,
    systemInfo,
    ethDriver,
    perfMode,
    simpleCmd,
    dmz,
    netSys,
    imei,
    autoDial,
    dialMode,
    usbMode,
    pdp,
    pdpAuth,
    lockCell,
    bandSupport,
    neighbourCell,
    qrsrp,
    qsinr,
    qrsrq,
    csq,
    qcainfo,
    qengServingCell,
    networkType,
    regStatus,
    sms,
    smsCenter,
    sendSms,
    smsEnable,
    smsStore,
    temp,
    netSpeed,
    trafficStat,
    bandQuery,
    ipAddr,
    // perfMode, simpleCmd, dmz, netSys, imei, autoDial, dialMode, usbMode, pdp ... 依次补全
};
