// Fibocom_AT 命令族实现
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
  formatMNC
} from '@/utils/formatUtils';

// --- 电压 ---
export const voltage = {
  get: () => 'AT+CBC',
  parse: (raw: string) => {
      // +CBC: 0,3982
      const m = raw.match(/\+CBC:\s*(\d+),(\d+)/);
      return m ? Number(m[2]) / 1000 : undefined;
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
      // +CNUM: ,"+8613800138000","17"
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
  get: () => 'AT+GTDUALSIM?',
  set: (slot: 'outer' | 'inner') => `AT+GTDUALSIM=${slot === 'outer' ? 0 : 1}`,
  parse: (raw: string) => {
    const m = raw.match(/\+GTDUALSIM\s*:\s*(\d)/);
    if (m) return m[1] === '0' ? 'outer' : 'inner';
    return undefined;
  },
};

// 热插拔
export const hotSwap = {
  get: () => 'AT+MSMPD?',
  set: (enable: boolean) => `AT+MSMPD=${enable ? 1 : 0}`,
  parse: (raw: string) => {
    const m = raw.match(/\+MSMPD:\s*(\d)/);
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
  get: () => ['ATI', 'AT+GTPKGVER'],
  parse: (raws: string[]) => {
    const info = { manufacturer: '', model: '', firmware: '', imei: '', fullVersion: '' };
    
    // 解析 ATI 命令结果
    const atiLines = (raws[0] || '').split(/\r?\n/);
    const fieldMappings = {
      'Manufacturer:': 'manufacturer',
      'Model:': 'model', 
      'Revision:': 'firmware',
      'IMEI:': 'imei'
    } as const;
    
    atiLines.forEach(line => {
      for (const [prefix, field] of Object.entries(fieldMappings)) {
        if (line.startsWith(prefix)) {
          info[field as keyof typeof info] = line.replace(prefix, '').trim();
          break; // 找到匹配后跳出循环
        }
      }
    });
    
    // 解析 AT+GTPKGVER 命令结果，提取版本后缀
    const pkgVerLines = (raws[1] || '').split(/\r?\n/);
    const longLine = pkgVerLines.find(line => line.length > 20);
    
    if (longLine) {
      const lastUnderscoreIndex = longLine.lastIndexOf('_');
      if (lastUnderscoreIndex !== -1) {
        const versionSuffix = longLine.substring(lastUnderscoreIndex + 1);
        // 将版本后缀拼接到原有firmware后面
        info.firmware = info.firmware 
          ? `${info.firmware}-${versionSuffix}` 
          : versionSuffix;
      }
    }
    info.fullVersion = [info.model, info.firmware, longLine].filter(Boolean).join(' / ');
    
    return info;
  },
};

// 以太网驱动
export const ethDriver = {
  get: () => '',
  set: (drv: string) => ``,
  parse: (raw: string): { label: string; value: string; enabled: boolean }[] => []
};

// 性能模式
export const perfMode = {
  get: () => 'AT+GTTHERMAL?',
  set: (on: boolean) => `AT+GTTHERMAL=${on ? 0 : 1}`,
  parse: (raw: string) => { const m = raw.match(/\+GTTHERMAL: (\d)/); return m ? m[1] === '0' : false; }
};

// 简单命令
export const simpleCmd = {
  reset: () => 'AT&F',
  reboot: () => 'AT+CFUN=1,1',
};

// 内网穿透
export const dmz = {
  get: () => '',
  setIpv4: () => '',
  setIpv6: () => '',
  disableIpv4: () => '',
  disableIpv6: () => '',
  parse: () => ({})
};

// 网络制式
export const netSys = {
  getRatOrder: () => 'AT+GTACT?',
  setRatOrder: (arr: string[]) => {
    // 前端传入如["NR5G","LTE","WCDMA"]，需反查对应数字
    const map: Record<string, number> = {
      'WCDMA': 1,
      'LTE': 2,
      'LTE,WCDMA': 4,
      'NR5G': 14,
      'NR5G,WCDMA': 16,
      'NR5G,LTE': 17,
      'NR5G,LTE,WCDMA': 20,
    };
    const order = ['NR5G', 'LTE', 'WCDMA'];
    const key = arr.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b)).join(',');
    const val = map[key] || 1;
    return `AT+GTACT=${val},6,3`;
  },
  parseRatOrder: (raw: string) => {
    const m = raw.match(/\+GTACT: (\d+)/);
    if (!m) return [];
    const val = Number(m[1]);
    const map: Record<number, string[]> = {
      1: ['WCDMA'],
      2: ['LTE'],
      4: ['LTE', 'WCDMA'],
      10: ['NR5G', 'LTE', 'WCDMA'],
      14: ['NR5G'],
      16: ['NR5G', 'WCDMA'],
      17: ['NR5G', 'LTE'],
      20: ['NR5G', 'LTE', 'WCDMA'],
    };
    return map[val] || [];
  },
  getRoamPref: () => '',
  setRoamPref: (on: boolean) => '',
  parseRoamPref: (raw: string) => {
    const m = raw.match(/\+QNWPREFCFG: ?"roam_pref",(\d+)/);
    return m ? m[1] === '255' : false;
  },
  getSrvDomain: () => 'AT+CEMODE?',
  setSrvDomain: (val: number) => `AT+CEMODE=${val}`,
  parseSrvDomain: (raw: string) => {
    const m = raw.match(/\+CEMODE: (\d+)/);
    return m ? parseInt(m[1], 10) : 2;
  }
};

// IMEI
export const imei = {
  set: (imei: string) => `AT+EGMREXT=1,7,"${imei}"`
};

// 自动拨号
export const autoDial = {
  getStatus: () => 'AT+CGACT?',
  set: (enable: boolean) => {
    if (enable) {
      return ['AT+CGDCONT=3,"IPV4V6","cbnet"', 'AT+CGACT=1,3'];
    } else {
      return ['AT+CGACT=0,3'];
    }
  },
  parse: (raw: string) => {
    const m = raw.match(/\+CGACT: (\d+),(\d+)/);
    if (m) return m[2] === '1';
    return false;
  },
  getApn: () => 'AT+CGDCONT?',
  setApn: (apn: string) => `AT+CGDCONT=3,"IPV4V6","${apn}"`,
  parseApn: (raw: string) => {
    const lines = raw.split(/\r?\n/);
    let apnList: { pdpType: string; apn: string }[] = [];
    let cbnet: { pdpType: string; apn: string } | null = null;
    for (const line of lines) {
      const m = line.match(/\+CGDCONT: \d+,"([^"]+)","([^"]+)"/);
      if (m) {
        const pdpType = m[1];
        const apn = m[2];
        if (/^ctnet$/i.test(apn)) return { pdpType, apn };
        if (/^cmnet$/i.test(apn)) return { pdpType, apn };
        if (/^cunet$/i.test(apn)) return { pdpType, apn };
        if (/^cbnet$/i.test(apn)) cbnet = { pdpType, apn };
        apnList.push({ pdpType, apn });
      }
    }
    if (apnList.length > 0) return apnList[0];
    if (cbnet) return cbnet;
    return { pdpType: '', apn: '' };
  }
};

// 拨号模式
export const dialMode = {
  get: () => ['AT+GTDIPCMODE?'],
  set: (mode: number) => {
    if (mode === 0) {
      return [`AT+GTDIPCMODE=3,1,1,1,3,15`];
    } else {
      return [`AT+GTDIPCMODE=1,2,2,2,7,13`];
    }
  },
  parse: (raw: string) => {
    // +GTDIPCMODE: 3,1,1,1,3,15
    const m = raw.match(/\+GTDIPCMODE: ?(\d),(\d),(\d),(\d),(\d),(\d)/);
    if (m) {
      if (m[1] === '3') {
        return 0;
      } else {
        return 1;
      }
    }
    return undefined;
  },
  options: [
    { label: 'USB和PCIE模式', value: 0 },
    { label: 'USB模式', value: 1 }
  ]
};

// USB模式
export const usbMode = {
  get: () => 'AT+GTUSBMODE?',
  set: (mode: number) => `AT+GTUSBMODE=${mode}`,
  parse: (raw: string) => {
    const m = raw.match(/\+GTUSBMODE: (\d+)/);
    return m ? Number(m[1]) : undefined;
  },
  options: [
    { label: 'RNDIS拨号模式-40', value: 40 },
    { label: 'RNDIS拨号模式-41', value: 41 }
  ]
};

// PDP
export const pdp = {
  getList: () => 'AT+CGDCONT?',
  getActive: () => 'AT+CGACT?',
  set: ({ cid, type, apn, addr, dataComp, headComp }: any) => {
    let cmd = `AT+CGDCONT=${cid},"${type}","${apn}"`;
    if (addr !== undefined && addr !== '') cmd += `,"${addr}"`;
    if (dataComp !== undefined) cmd += `,${dataComp}`;
    if (headComp !== undefined) cmd += `,${headComp}`;
    return cmd;
  },
  delete: (cid: number) => `AT+CGDCONT=${cid}`,
  activate: (cid: number) => `AT+CGACT=1,${cid}`,
  deactivate: (cid: number) => `AT+CGACT=0,${cid}`,
  parseList: (raw: string) => {
    const result: Array<any> = [];
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
  parseActive: (raw: string) => {
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

// 锁小区
export const lockCell = {
  get: (params: any): string[] => {
    const cmds: string[] = [];
    if (params.mode == 0) {
      cmds.push('AT+EMMCHLCK=0');
    } else {
      cmds.push('AT+CFUN=0');
      if (params.lteOrNr === 'lte') {
        cmds.push(`AT+EMMCHLCK=1,7,0,${params.earfcn},${params.pci},3`);
      } else {
        cmds.push(`AT+EMMCHLCK=1,11,0,${params.arfcn},${params.pci},3`);
      }
      cmds.push('AT+CFUN=1');
    }
    return cmds;
  },
  getStatus: (): string[] => ['AT+EMMCHLCK?'],
  parseStatus: (raw: string): any => {
    const m = raw.match(/\+EMMCHLCK: ([^\r\n]+)/);
    if (!m) return undefined;
    const arr = m[1].split(',').map(s => s.trim());
    if (arr.length === 1 && arr[0] === '0') {
      return { mode: '0' };
    }
    const mode = arr[0];
    const rat = arr[1] === '11' ? 'nr' : arr[1] === '7' ? 'lte' : arr[1];
    const freq = arr[3];
    const pci = arr[4];
    let band;
    if (freq) {
      band = parseLockCellBand(Number(freq)).band;
    }
    return { mode, rat, freq, pci, band };
  }
};

// 频段支持
export const bandSupport = {
  get: (): string[] => ['AT+GTACT?'],
  set: (bands: number[]): string[] => {
    return [`AT+GTACT=20,6,3,${bands.sort((a, b) => a - b).join(',')}`];
  },
  parse: (raw: string): number[] => {
    // +GTACT: 20,6,3,5,8,101,102,103,104,105,107,108,112,113,114,117,118,119,120,125,126,128,129,130,132,134,138,139,140,141,142,143,146,148,166,171,501,502,503,505,507,508,5020,5025,5028,5030,5038,5040,5041,5048,5066,5071,5077,5078,5079
    // 取第4个数字开始到最后
    const m = raw.match(/\+GTACT: ([^\r\n]+)/);
    if (!m) return [];
    const arr = m[1].split(',').map(s => Number(s.trim())).filter(v => !isNaN(v));
    if (arr.length < 4) return [];
    return arr.slice(3);
  },
  restore: (): string => 'AT+GTACT=10,6,3',
};

// 邻区
export const neighbourCell = {
  get: (): string[] => ['AT+GTCCINFO?'],
  parse: (raw: string) => {
    // 只要2开头的邻区，忽略1开头的服务小区
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('+GTCCINFO:') && !l.startsWith('OK'));
    const result: any[] = [];
    for (const line of lines) {
      const arr = line.split(',').map(s => s.trim());
      if (arr[0] !== '2') continue; // 只要邻区
      const rat = arr[1];
      // NR邻区: 2,9,,,FFFFFFF,00FFFFFFF,627264,577,,126,126,52
      if (rat === '9') {
        // 字段: isServiceCell, rat, mcc, mnc, tac, cellid, narfcn, pci, ss_sinr, rxlev, ss_rsrp, ss_rsrq
        const narfcn = arr[6];
        const pci = arr[7];
        const ss_sinr = arr[8] !== undefined && arr[8] !== '' ? Number(arr[8]) : undefined;
        const rxlev = arr[9] !== undefined && arr[9] !== '' ? Number(arr[9]) : undefined;
        const ss_rsrp = arr[10] !== undefined && arr[10] !== '' ? Number(arr[10]) : undefined;
        const ss_rsrq = arr[11] !== undefined && arr[11] !== '' ? Number(arr[11]) : undefined;
        // NR信号值转换
        const rsrp = ss_rsrp !== undefined && ss_rsrp <= 127 ? ss_rsrp - 157 : undefined;
        const rsrq = ss_rsrq !== undefined && ss_rsrq <= 127 ? ss_rsrq / 2 - 43.5 : undefined;
        const sinr = ss_sinr !== undefined && ss_sinr <= 127 ? ss_sinr / 2 - 23.5 : undefined;
        result.push({
          type: 'inter',
          rat: 'NR5G',
          earfcn: narfcn ? Number(narfcn) : -1,
          pci: pci ? Number(pci) : -1,
          rsrp,
          rsrq,
          sinr,
          rssi: undefined,
          band: narfcn ? getNrBandByArfcn(Number(narfcn)) : undefined,
        });
      } else if (rat === '4') {
        // 2,4,,,FFFFFFF,00FFFFFFF,165064,247,,325,325,14
        // LTE邻区: 2,4,mcc,mnc,tac,cellid,earfcn,physicalcellId,bandwidth,rxlev,rsrp,rsrq
        const earfcn = arr[6];
        const pci = arr[7];
        const bandwidth = arr[8];
        const rxlev = arr[9] !== undefined && arr[9] !== '' ? Number(arr[9]) : undefined;
        const rsrp = arr[10] !== undefined && arr[10] !== '' ? Number(arr[10]) : undefined;
        const rsrq = arr[11] !== undefined && arr[11] !== '' ? Number(arr[11]) : undefined;
        // LTE信号值转换
        const rsrpVal = rsrp !== undefined && rsrp <= 98 ? rsrp - 141 : undefined;
        const rsrqVal = rsrq !== undefined && rsrq <= 35 ? rsrq / 2 - 20 : undefined;
        result.push({
          type: 'inter',
          rat: 'LTE',
          earfcn: earfcn ? Number(earfcn) : -1,
          pci: pci ? Number(pci) : -1,
          rsrp: rsrpVal,
          rsrq: rsrqVal,
          rssi: undefined,
          band: earfcn ? getLteBandByEarfcn(Number(earfcn)) : undefined,
        });
      }
      // 其它制式可扩展
    }
    return result;
  },
};

// 信号质量
export const qrsrp = {
  get: () => 'AT+CESQ',
  parse: (raw: string) => {
    const m = raw.match(/\+CESQ: ([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^\r\n]+)/);
    if (!m) return undefined;
    const rsrp = Number(m[6]);
    const ss_rsrp = Number(m[8]);
    if (ss_rsrp !== 255 && ss_rsrp !== 0) {
      return { value: ss_rsrp - 157 };
    }
    if (rsrp !== 255 && rsrp !== 0) {
      return { value: rsrp - 141 };
    }
    return { value: undefined };
  }
};

// 信号质量
export const qsinr = {
  get: () => 'AT+CESQ',
  parse: (raw: string) => {
    const m = raw.match(/\+CESQ: ([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^\r\n]+)/);
    if (!m) return undefined;
    const ss_sinr = Number(m[9]);
    return { value: ss_sinr !== 255 ? (ss_sinr / 2 - 23.5) : undefined };
  }
};

// 信号质量
export const qrsrq = {
  get: () => 'AT+CESQ',
  parse: (raw: string) => {
    const m = raw.match(/\+CESQ: ([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^\r\n]+)/);
    if (!m) return undefined;
    const rsrq = Number(m[6]);
    const ss_rsrq = Number(m[7]);
    if (ss_rsrq !== 255 && ss_rsrq !== 0) {
      return { value: ss_rsrq / 2 - 43 };
    }
    if (rsrq !== 255 && rsrq !== 0) {
      return { value: rsrq / 2 - 20 };
    }
    return { value: undefined };
  }
};

// 信号强度
export const csq = {
  get: () => 'AT+CSQ',
  parse: (raw: string) => {
    const m = raw.match(/\+CSQ: (\d+),/);
    if (!m) return undefined;
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
  get: () => ['AT+GTCAINFO?'],
  parse: (raws: string[]) => {
    const raw = Array.isArray(raws) ? raws.join('\n') : String(raws ?? '');
    const lines = raw
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('OK') && !l.startsWith('+GTCAINFO:'));
    let pcc: any = null;
    const scc: any[] = [];
    const CELL_STATE_MAP: Record<string, string> = {
      '0': '配置解除',
      '1': '配置未释放',
      '2': '配置并激活',
    };
    const LTE_BANDWIDTH_MAP: Record<string, string> = {
      '6': '1.4 MHz', '15': '3 MHz', '25': '5 MHz', '50': '10 MHz', '75': '15 MHz', '100': '20 MHz',
    };
    const NR_BANDWIDTH_MAP: Record<string, string> = {
      '25': '5 MHz', '50': '10 MHz', '75': '15 MHz', '100': '20 MHz', '125': '25 MHz', '150': '30 MHz',
      '200': '40 MHz', '250': '50 MHz', '300': '60 MHz', '400': '80 MHz', '450': '90 MHz', '500': '100 MHz',
      '1000': '200 MHz', '2000': '400 MHz',
    };
    const MODULATION_MAP: Record<string, string> = {
      '0': 'BPSK', '1': 'QPSK', '2': '16QAM', '3': '64QAM', '4': '256QAM', '5': '1024QAM', '6': 'UNKNOWN',
    };
    const MIMO_MAP: Record<string, string> = {
      '1': '1层', '2': '2层', '3': '3层', '4': '4层',
    };
    const UL_CONFIGURED_MAP: Record<string, string> = {
      '0': '未使能', '1': '已使能',
    };
    // PCC:5041,552,504990,500,500,2,1,2,2,-97
    // SCC 1:2,1,5028,553,156490,100,100,1,1,1,1,-97
    // SCC 1:2,0,5041,977,524910,300,4095,0,255,0,255,-90
    for (const line of lines) {
      if (line.startsWith('PCC:')) {
        const arr = line.replace('PCC:', '').split(',').map(s => s.trim());
        pcc = {
          band: arr[0],
          pci: arr[1],
          earfcn: arr[2],
          dl_bw: LTE_BANDWIDTH_MAP[arr[3]] || NR_BANDWIDTH_MAP[arr[3]] || '-',
          ul_bw: LTE_BANDWIDTH_MAP[arr[4]] || NR_BANDWIDTH_MAP[arr[4]] || '-',
          dl_mimo: MIMO_MAP[arr[5]] || '-',
          ul_mimo: MIMO_MAP[arr[6]] || '-',
          dl_modulation: MODULATION_MAP[arr[7]] || '-',
          ul_modulation: MODULATION_MAP[arr[8]] || '-',
          rsrp: arr[9],
        };
      } else if (line.startsWith('SCC')) {
        const idx = (line.match(/^SCC\s*(\d+):/) || [])[1];
        const arr = line.replace(/^SCC\s*\d+:/, '').split(',').map(s => s.trim());
        scc.push({
          // index: idx ? Number(idx) : scc.length + 1,
          scell_state: CELL_STATE_MAP[arr[1]] || '-',
          band: arr[2],
          pci: arr[3],
          earfcn: arr[4],
          dl_bw: LTE_BANDWIDTH_MAP[arr[5]] || NR_BANDWIDTH_MAP[arr[5]] || '-',
          ul_bw: LTE_BANDWIDTH_MAP[arr[6]] || NR_BANDWIDTH_MAP[arr[6]] || '-',
          dl_mimo: MIMO_MAP[arr[7]] || '-',
          ul_mimo: MIMO_MAP[arr[8]] || '-',
          dl_modulation: MODULATION_MAP[arr[9]] || '-',
          ul_modulation: MODULATION_MAP[arr[10]] || '-',
          rsrp: arr[11],
        });
      } else if (line.startsWith('ULconfigured:')) {
        // ULconfigured:1
        const v = line.replace('ULconfigured:', '').trim();
        (pcc || (pcc = {})).ul_configured = UL_CONFIGURED_MAP[v] || v;
      }
    }
    return { pcc, scc };
  }
};

// 服务小区
export const qengServingCell = {
  get: () => 'AT+GTCCINFO?',
  parse: (raw: string) => {
    const lines = raw.split('\n').map(l => l.trim()).filter(l =>
      l && !l.startsWith('OK') && !l.startsWith('+GTCCINFO:') && !l.startsWith('<<EOF')
    );
    let info: any = {};
    for (const line of lines) {
      const arr = line.split(',').map(s => s.trim());
      // 只处理服务小区 isServiceCell==1
      if (arr[0] !== '1') continue;
      // NR服务小区: 14字段
      if (arr.length === 14 && arr[1] === '9') {
        info = {
          isServiceCell: arr[0],
          rat: arr[1],
          mcc: arr[2],
          mnc: formatMNC(arr[3]),
          tac: arr[4],
          lac: arr[4],
          cellId: arr[5],
          earfcn: arr[6],
          pci: arr[7],
          band: arr[8],
          bandwidth: arr[9],
          sinr: arr[10],
          rxlev: arr[11],
          rsrp: arr[12],
          rsrq: arr[13],
        };
      }
      // LTE服务小区: 14字段
      if (arr.length === 14 && arr[1] === '4') {
        info = {
          isServiceCell: arr[0],
          rat: arr[1],
          mcc: arr[2],
          mnc: formatMNC(arr[3]),
          tac: arr[4],
          lac: arr[4],
          cellId: arr[5],
          earfcn: arr[6],
          pci: arr[7],
          band: arr[8],
          bandwidth: arr[9],
          sinr: arr[10],
          rxlev: arr[11],
          rsrp: arr[12],
          rsrq: arr[13],
        };
      }
    }
    return info;
  }
};

// 网络类型
export const networkType = {
  get: () => 'AT+COPS?',
  parse: (raw: string) => {
    // +COPS:0,0,"4E2D56FD75354FE1",11
    const copsLine = raw.match(/\+COPS:[^\n]+/);
    if (copsLine) {
      // 再找最后一个数字
      const m = copsLine[0].match(/,(\d+)\s*$/);
      if (m) {
        const val = Number(m[1]);
        if (val === 11) return 'NR5G';
        if (val === 7) return 'LTE';
        if (val === 2) return 'WCDMA';
        return undefined;
      }
    }
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

// 类型声明
export interface SmsItem {
  index: number;
  status: string;
  phone: string;
  time: string;
  content: string;
  pdu: string;
}

// 短信
export const sms = {
  getListCmd: () => ['AT+CMGF=0', 'AT+CSCS="GSM"', 'AT+CPMS="SM","SM","SM"', 'AT+CMGL=4', 'AT+CPMS="ME","ME","ME"', 'AT+CMGL=4'],
  parseList: (raw: string) => {
    const result: SmsItem[] = [];
    const lines = raw.split(/\r?\n/).map(l => l.trim());
    let cur: Partial<SmsItem> = {};
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/\+CMGL: (\d+), (\d+),, (\d+)/);
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
  get: () => 'AT+CSCA?',
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
  get: (smsc: string, phone: string, content: string) => {
    const ensure86 = (num: string) => {
      if (!num) return '';
      return num.startsWith('86') ? num : (num.startsWith('+86') ? num.slice(1) : '86' + num.replace(/^\+/, ''));
    };
    const smsc86 = ensure86(smsc);
    const phone86 = ensure86(phone);
    return `SEND_SMS,${smsc86},${phone86},"${content}"`;
  },
  parse: (raw: string) => /OK/.test(raw),
};

// 短信启用
export const smsEnable = {
  get: () => 'AT+CSMS?',
  set: (enable: boolean) => `AT+CSMS=${enable ? 1 : 0}`,
  parse: (raw: string) => {
    // +CSMS: 1,1,1,1
    const m = raw.match(/\+CSMS: (\d)/);
    if (m) return m[1] === '1';
    return undefined;
  }
};

// 短信存储
export const smsStore = {
  get: () => ['AT+CPMS="MT","MT","MT"', 'AT+CPMS?'],
  set: (pos: 'SM' | 'ME') => `AT+CPMS="${pos}","${pos}","${pos}"`,
  parse: (raw: string) => {
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
  }
};

// 温度
export const temp = {
  get: () => ['AT+GTSENRDTEMP=0'],
  parse: (raws: string[]) => {
    const idNameMap: Record<string, { name: string, description: string }> = {
      '1': { name: 'SoC最高温度', description: '系统级芯片' },
      '2': { name: '小核CPU0温度', description: '低功耗核心0' },
      '3': { name: '小核CPU1温度', description: '低功耗核心1' },
      '4': { name: '小核CPU2温度', description: '低功耗核心2' },
      '5': { name: '小核CPU3温度', description: '低功耗核心3' },
      '6': { name: 'GPU0温度', description: '图形处理器0' },
      '7': { name: 'GPU1温度', description: '图形处理器1' },
      '8': { name: '内存控制器温度', description: '内存管理单元' },
      '9': { name: '多媒体系统温度', description: '音视频处理单元' },
      '10': { name: '5G基带温度', description: '5G调制解调器' },
      '11': { name: '4G基带温度', description: '4G调制解调器' },
      '12': { name: '3G基带温度', description: '3G调制解调器' },
      '13': { name: 'SoC/DRAM NTC温度', description: '芯片内存热敏电阻' },
      '14': { name: 'LTE PA温度', description: '4G功放' },
      '15': { name: 'NR PA温度', description: '5G功放' },
      '16': { name: '射频NTC温度', description: '射频热敏电阻' },
      '17': { name: '基带射频温度', description: '基带射频模块' },
      '18': { name: 'GPS/连接温度', description: 'GPS定位模块' },
      '19': { name: '电源管理IC温度', description: '电源管理芯片' },
      '20': { name: 'PMIC核心温度', description: '电源管理核心' },
      '21': { name: 'PMIC处理器供电温度', description: '处理器电源管理' },
      '22': { name: 'PMIC GPU温度', description: 'GPU电源管理' },
      '23': { name: '晶振温度', description: '晶体振荡器' },
    };
    const result: { name: string, description: string, value: number }[] = [];
    raws.forEach(raw => {
      const reg = /\+GTSENRDTEMP: (\d+),(\-?\d+)/g;
      let m;
      while ((m = reg.exec(raw)) !== null) {
        const id = m[1];
        const value = Number(m[2]) / 1000;
        const tempInfo = idNameMap[id] || { name: `传感器${id}`, description: '' };
        result.push({ name: tempInfo.name, description: tempInfo.description, value });
      }
    });
    return result;
  }
};

// 网速
export const netSpeed = {
  getSigned: () => [
    'AT+CGDCONT?',
    'AT+C5GQOSRDP=3',
    'AT+CGEQOSRDP=3'
  ],
  parseSigned: (raws: string[]) => {
    // 适配AT+C5GQOSRDP=3返回格式: +C5GQOSRDP: 3,<qci>,,,,,,<down>,<up>
    // 2. 解析APN
    let apn = '';
    let apnList: string[] = [];
    for (const raw of raws) {
      const lines = raw.split(/\r?\n/);
      if (apn) break;
      for (const line of lines) {
        if (line.startsWith('+CGDCONT:')) {
          const apnTmp = line.split(',')[2].replace(/"/g, '');
          apnList.push(apnTmp);
        }
      }
    }
    if (apnList.length > 0) {
      let apn_cbnet = '';
      for (const apnOne of apnList) {
        if (/^ctnet$/i.test(apnOne)) {
          apn = apnOne;
          break;
        }
        if (/^cmnet$/i.test(apnOne)) {
          apn = apnOne;
          break;
        }
        if (/^cunet$/i.test(apnOne)) {
          apn = apnOne;
          break;
        }
        if (/^cbnet$/i.test(apnOne)) {
          apn_cbnet = apnOne;
        }
      }
      if (!apn && apn_cbnet) {
        apn = apn_cbnet;
      } else if (!apn) {
        apn = apnList[0];
      }
    }
    let info: any;
    for (const raw of raws) {
      const lines = raw.split(/\r?\n/);
      for (const line of lines) {
        if (line.startsWith('+C5GQOSRDP:')) {
          const arr = line.split(',');
          if (arr.length >= 8) {
            info = {
              apn: apn,
              downQci: Number(arr[1]),
              upQci: Number(arr[1]),
              down: convertKbpsToMbps(Number(arr[6])),
              up: convertKbpsToMbps(Number(arr[7])),
              type: '5G'
            };
          }
        }
      }
    }
    if (info) return info;
    for (const raw of raws) {
      const lines = raw.split(/\r?\n/);
      for (const line of lines) {
        if (line.startsWith('+CGEQOSRDP:')) {
          const arr = line.split(',');
          if (arr.length >= 8) {
            info = {
              apn: apn,
              downQci: Number(arr[1]),
              upQci: Number(arr[1]),
              down: convertKbpsToMbps(Number(arr[6])),
              up: convertKbpsToMbps(Number(arr[7])),
              type: '4G'
            };
          }
        }
      }
    }
    return info;
  },
  getRealtime: () => 'CMD(I=$(grep -A10 \"^config modem-device\" /etc/config/qmodem | grep -B10 \"\'fm350-gl\'\" | grep data_interface | head -1 | awk \'{print $3}\' | tr -d \"\'\" | tr \'a-z\' \'A-Z\');D=$(uci get network.$I.device 2>/dev/null);R1=$(cat /proc/net/dev | grep \"$D:\" | awk \'{print $2}\');T1=$(cat /proc/net/dev | grep \"$D:\" | awk \'{print $10}\');sleep 1;R2=$(cat /proc/net/dev | grep \"$D:\" | awk \'{print $2}\');T2=$(cat /proc/net/dev | grep \"$D:\" | awk \'{print $10}\');U=$(( (T2-T1)*8 ));B=$(( (R2-R1)*8 ));echo \"+QNWCFG: up/down,$U,$B\")',
  parseRealtime: (raw: string) => {
    const m = raw.match(/\+QNWCFG: up\/down,(\d+),(\d+)/);
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
  getTraffic: () => ['CMD(IFM=$(grep -A10 \"^config modem-device\" /etc/config/qmodem | grep -B10 \"\'fm350-gl\'\" | grep data_interface | head -1 | awk \'{print $3}\' | tr -d \"\'\" | tr \'a-z\' \'A-Z\');DEV=$(uci get network.${IFM}.device 2>/dev/null); cat /proc/net/dev | grep "$DEV" | awk \'{print\"+QGDCNT: \"$10\",\"$2}\')'],
  parseTraffic: (raws: string[]) => {
    // +QGDCNT: 3554772,46092526
    const m = raws.join('\n').match(/\+QGDCNT: (\d+),(\d+)/);
    if (m) {
      return { up: Number(m[1]), down: Number(m[2]) };
    }
    return { up: 0, down: 0 };
  },
  getTime: () => ['AT+CCLK?'],
  parseTime: (raws: string[]) => {
    // +QLTS: "2025/08/06,10:30:51+32",0
    // +CCLK: "25/08/06,14:37:32"
    let lastConnectTime = '', nowTime = '';
    const m2 = raws[0]?.match(/\+CCLK: "([^"]+)/);
    if (m2) nowTime = m2[1];
    lastConnectTime = nowTime;
    return { lastConnectTime, nowTime };
  },
  reset: () => [''],
};

// 频段查询
export const bandQuery = {
  get: () => 'AT+GTACT=?',
  parse: (raw: string) => {
    // 解析方式同Quectel_AT
    const matches = raw.match(/\(([^)]*)\)/g);
    if (!matches || matches.length < 7) return [];
    const lteStr = matches[5].replace(/[()]/g, '');
    const nrStr = matches[8].replace(/[()]/g, '');
    const lteBands = lteStr ? lteStr.split(',').map(s => Number(s.trim())).filter(Boolean) : [];
    const nrBands = nrStr ? nrStr.split(',').map(s => Number(s.trim())).filter(Boolean) : [];
    return [...lteBands, ...nrBands];
  }
};

// IP地址
export const ipAddr = {
  get: () => ['AT+CGPIAF=1,1,1,1', 'AT+CGPADDR=3'],
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

// 导出 Fibocom_AT 命令族对象
export const Fibocom_AT = {
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
