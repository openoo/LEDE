// 不同命令族的AT命令和解析函数配置
export type SystemInfo = {
  manufacturer: string;
  model: string;
  firmware: string;
  imei: string;
  fullVersion?: string;
};

export type ModuleConfig = {
  command: string;
  parse: (raw: string) => SystemInfo;
};

// 型号到命令族的映射
export const modelToCommandGroup: Record<string, string> = {
  'FM350-GL': 'FM350_AT',
  'RW350R-GL': 'FM350_AT',
  'FM160': 'Fibocom_AT',
  'RM520N-CN': 'RM520NCN_AT',
  'RM520N-GL': 'RM520NGL_AT',
  'RM500Q-CN': 'RM500QCN_AT',
  'RM500Q-GL': 'RM500QGL_AT',
  // 可继续扩展其他型号
};

import { Quectel_AT } from './vendors/Quectel/quectel';
import { RM520NCN_AT } from './vendors/Quectel/rm520n_cn';
import { RM520NGL_AT } from './vendors/Quectel/rm520n_gl';
import { RM500QCN_AT } from './vendors/Quectel/rm500q_cn';
import { RM500QGL_AT } from './vendors/Quectel/rm500q_gl';
import { Fibocom_AT } from './vendors/Fibocom/fibocom';
import { FM350_AT } from './vendors/Fibocom/fm350';

const groupMap: Record<string, any> = {
  Quectel_AT,
  Fibocom_AT,
  RM520NCN_AT,
  RM520NGL_AT,
  RM500QCN_AT,
  RM500QGL_AT,
  FM350_AT,
};

// 命令族记忆功能
export function getRememberedCommandGroup(ip: string, port: string): string | null {
  try {
    return localStorage.getItem('modem_cmd_group_' + ip + '_' + port);
  } catch {
    return null;
  }
}
export function setRememberedCommandGroup(ip: string, port: string, group: string) {
  try {
    localStorage.setItem('modem_cmd_group_' + ip + '_' + port, group);
  } catch { }
}

// 通用ATI命令解析，兼容Fibocom和Quectel（移远），自动判断命令族
export const parseATISystemInfo = (raw: string): SystemInfo & { detectedGroup?: string } => {
  const info: SystemInfo & { detectedGroup?: string } = {
    manufacturer: '',
    model: '',
    firmware: '',
    imei: '',
    fullVersion: '',
  };
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // 1. 先找Model:字段（全量遍历）
  let model = '';
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('Model:')) {
      model = lines[i].replace('Model:', '').trim();
      break;
    }
  }

  // 2. 没找到Model:，再找Quectel格式（全量遍历）
  if (!model) {
    const quectelIdx = lines.findIndex(line => line.toLowerCase().includes('quectel'));
    if (quectelIdx !== -1 && lines[quectelIdx + 1]) {
      model = lines[quectelIdx + 1].trim();
    }
  }

  // 3. 解析其他基本信息（全量遍历）
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('Manufacturer:')) info.manufacturer = lines[i].replace('Manufacturer:', '').trim();
    if (lines[i].startsWith('Revision:')) info.firmware = lines[i].replace('Revision:', '').trim();
    if (lines[i].startsWith('IMEI:')) info.imei = lines[i].replace('IMEI:', '').trim();
  }

  // 4. Quectel格式下补充manufacturer
  if (!info.manufacturer) {
    const quectelIdx = lines.findIndex(line => line.toLowerCase().includes('quectel'));
    if (quectelIdx !== -1) {
      info.manufacturer = lines[quectelIdx];
    }
  }

  // 5. 统一赋值model
  info.model = model;
  info.fullVersion = [info.model, info.firmware].filter(Boolean).join(' ');
  // 6. 通过modelToCommandGroup判断命令族
  let detectedGroup = modelToCommandGroup[info.model] || 'Quectel_AT';
  info.detectedGroup = detectedGroup;
  return info;
};

// --- 电压 ---
export function getVoltageCmd(group: string) {
  return (groupMap[group]?.voltage?.get || groupMap['Quectel_AT'].voltage.get)();
}
export function parseVoltage(raw: string, group: string) {
  return (groupMap[group]?.voltage?.parse || groupMap['Quectel_AT'].voltage.parse)(raw);
}

// --- ICCID ---
export function getIccidCmd(group: string) {
  return (groupMap[group]?.iccid?.get || groupMap['Quectel_AT'].iccid.get)();
}
export function parseIccid(raw: string, group: string) {
  return (groupMap[group]?.iccid?.parse || groupMap['Quectel_AT'].iccid.parse)(raw);
}

// --- IMSI ---
export function getImsiCmd(group: string) {
  return (groupMap[group]?.imsi?.get || groupMap['Quectel_AT'].imsi.get)();
}
export function parseImsi(raw: string, group: string) {
  return (groupMap[group]?.imsi?.parse || groupMap['Quectel_AT'].imsi.parse)(raw);
}

// --- SIM 卡号 ---
export function getSimNumCmd(group: string) {
  return (groupMap[group]?.simNum?.get || groupMap['Quectel_AT'].simNum.get)();
}
export function parseSimNum(raw: string, group: string) {
  return (groupMap[group]?.simNum?.parse || groupMap['Quectel_AT'].simNum.parse)(raw);
}

// SIM卡槽
export function getSimSlotCmd(group: string) {
  return (groupMap[group]?.simSlot?.get || groupMap['Quectel_AT'].simSlot.get)();
}
export function setSimSlotCmd(group: string, slot: 'outer' | 'inner') {
  return (groupMap[group]?.simSlot?.set || groupMap['Quectel_AT'].simSlot.set)(slot);
}
export function parseSimSlot(raw: string, group: string) {
  return (groupMap[group]?.simSlot?.parse || groupMap['Quectel_AT'].simSlot.parse)(raw);
}
// 热插拔
export function getHotSwapCmd(group: string) {
  return (groupMap[group]?.hotSwap?.get || groupMap['Quectel_AT'].hotSwap.get)();
}
export function setHotSwapCmd(group: string, enable: boolean) {
  return (groupMap[group]?.hotSwap?.set || groupMap['Quectel_AT'].hotSwap.set)(enable);
}
export function parseHotSwap(raw: string, group: string) {
  return (groupMap[group]?.hotSwap?.parse || groupMap['Quectel_AT'].hotSwap.parse)(raw);
}
// 飞行模式
export function getAirplaneCmd(group: string) {
  return (groupMap[group]?.airplane?.get || groupMap['Quectel_AT'].airplane.get)();
}
export function setAirplaneCmd(group: string, enable: boolean) {
  return (groupMap[group]?.airplane?.set || groupMap['Quectel_AT'].airplane.set)(enable);
}
export function parseAirplane(raw: string, group: string) {
  return (groupMap[group]?.airplane?.parse || groupMap['Quectel_AT'].airplane.parse)(raw);
}
// PIN码
export function getPinStatusCmd(group: string) {
  return (groupMap[group]?.pin?.get || groupMap['Quectel_AT'].pin.get)();
}
export function setPinEnableCmd(group: string, pin: string) {
  return (groupMap[group]?.pin?.enable || groupMap['Quectel_AT'].pin.enable)(pin);
}
export function setPinDisableCmd(group: string, pin: string) {
  return (groupMap[group]?.pin?.disable || groupMap['Quectel_AT'].pin.disable)(pin);
}
export function parsePinStatus(raw: string, group: string) {
  return (groupMap[group]?.pin?.parse || groupMap['Quectel_AT'].pin.parse)(raw);
}
// 系统信息
export function getSystemInfoCmds(group: string): string[] {
  return (groupMap[group]?.systemInfo?.get || groupMap['Quectel_AT'].systemInfo.get)();
}
export function parseSystemInfoMulti(raws: string[], group: string): SystemInfo {
  return (groupMap[group]?.systemInfo?.parse || groupMap['Quectel_AT'].systemInfo.parse)(raws);
}

// --- 设备控制命令族配置 ---
export function getEthDriverCmd(group: string) {
  return (groupMap[group]?.ethDriver?.get || groupMap['Quectel_AT'].ethDriver.get)();
}
export function setEthDriverCmd(group: string, drv: string) {
  return (groupMap[group]?.ethDriver?.set || groupMap['Quectel_AT'].ethDriver.set)(drv);
}
export function parseEthDriverList(raw: string, group: string): { label: string; value: string; enabled: boolean }[] {
  return (groupMap[group]?.ethDriver?.parse || groupMap['Quectel_AT'].ethDriver.parse)(raw);
}

// --- 性能模式 ---
export function getPerfModeCmd(group: string) {
  return (groupMap[group]?.perfMode?.get || groupMap['Quectel_AT'].perfMode.get)();
}
export function setPerfModeCmd(group: string, on: boolean) {
  return (groupMap[group]?.perfMode?.set || groupMap['Quectel_AT'].perfMode.set)(on);
}
export function parsePerfMode(raw: string, group: string) {
  return (groupMap[group]?.perfMode?.parse || groupMap['Quectel_AT'].perfMode.parse)(raw);
}

// --- 恢复出厂/重启 ---
export function getResetFactoryCmd(group: string) {
  return (groupMap[group]?.simpleCmd?.reset || groupMap['Quectel_AT'].simpleCmd.reset)();
}
export function getRebootCmd(group: string) {
  return (groupMap[group]?.simpleCmd?.reboot || groupMap['Quectel_AT'].simpleCmd.reboot)();
}

// --- DMZ ---
export function getDmzStatusCmd(group: string) {
  return (groupMap[group]?.dmz?.get || groupMap['Quectel_AT'].dmz.get)();
}
export function setDmzIpv4Cmd(group: string, ip: string) {
  return (groupMap[group]?.dmz?.setIpv4 || groupMap['Quectel_AT'].dmz.setIpv4)(ip);
}
export function setDmzIpv6Cmd(group: string, ip: string) {
  return (groupMap[group]?.dmz?.setIpv6 || groupMap['Quectel_AT'].dmz.setIpv6)(ip);
}
export function disableDmzIpv4Cmd(group: string) {
  return (groupMap[group]?.dmz?.disableIpv4 || groupMap['Quectel_AT'].dmz.disableIpv4)();
}
export function disableDmzIpv6Cmd(group: string) {
  return (groupMap[group]?.dmz?.disableIpv6 || groupMap['Quectel_AT'].dmz.disableIpv6)();
}
export function parseDmzStatus(raw: string, group: string) {
  return (groupMap[group]?.dmz?.parse || groupMap['Quectel_AT'].dmz.parse)(raw);
}

// --- 网络系统 ---
export function getRatOrderCmd(group: string) {
  return (groupMap[group]?.netSys?.getRatOrder || groupMap['Quectel_AT'].netSys.getRatOrder)();
}
export function setRatOrderCmd(group: string, arr: string[]) {
  return (groupMap[group]?.netSys?.setRatOrder || groupMap['Quectel_AT'].netSys.setRatOrder)(arr);
}
export function parseRatOrder(raw: string, group: string) {
  return (groupMap[group]?.netSys?.parseRatOrder || groupMap['Quectel_AT'].netSys.parseRatOrder)(raw);
}
export function getRoamPrefCmd(group: string) {
  return (groupMap[group]?.netSys?.getRoamPref || groupMap['Quectel_AT'].netSys.getRoamPref)();
}
export function setRoamPrefCmd(group: string, on: boolean) {
  return (groupMap[group]?.netSys?.setRoamPref || groupMap['Quectel_AT'].netSys.setRoamPref)(on);
}
export function parseRoamPref(raw: string, group: string) {
  return (groupMap[group]?.netSys?.parseRoamPref || groupMap['Quectel_AT'].netSys.parseRoamPref)(raw);
}
export function getSrvDomainCmd(group: string) {
  return (groupMap[group]?.netSys?.getSrvDomain || groupMap['Quectel_AT'].netSys.getSrvDomain)();
}
export function setSrvDomainCmd(group: string, val: number) {
  return (groupMap[group]?.netSys?.setSrvDomain || groupMap['Quectel_AT'].netSys.setSrvDomain)(val);
}
export function parseSrvDomain(raw: string, group: string) {
  return (groupMap[group]?.netSys?.parseSrvDomain || groupMap['Quectel_AT'].netSys.parseSrvDomain)(raw);
}

// --- IMEI ---
export function setImeiCmd(group: string, imei: string) {
  return (groupMap[group]?.imei?.set || groupMap['Quectel_AT'].imei.set)(imei);
}

// --- 自动拨号/APN ---
export function getAutoDialStatusCmd(group: string) {
  return (groupMap[group]?.autoDial?.getStatus || groupMap['Quectel_AT'].autoDial.getStatus)();
}
export function setAutoDialCmd(group: string, enable: boolean): string[] {
  return (groupMap[group]?.autoDial?.set || groupMap['Quectel_AT'].autoDial.set)(enable);
}
export function parseAutoDialStatus(raw: string, group: string) {
  return (groupMap[group]?.autoDial?.parse || groupMap['Quectel_AT'].autoDial.parse)(raw);
}
export function getApnCmd(group: string) {
  return (groupMap[group]?.autoDial?.getApn || groupMap['Quectel_AT'].autoDial.getApn)();
}
export function setApnCmd(group: string, apn: string) {
  return (groupMap[group]?.autoDial?.setApn || groupMap['Quectel_AT'].autoDial.setApn)(apn);
}
export function parseApn(raw: string, group: string) {
  return (groupMap[group]?.autoDial?.parseApn || groupMap['Quectel_AT'].autoDial.parseApn)(raw);
}

// --- 拨号方式 ---
export function getDialModeCmd(group: string): string[] {
  return (groupMap[group]?.dialMode?.get || groupMap['Quectel_AT'].dialMode.get)();
}
export function setDialModeCmd(group: string, mode: number): string[] {
  return (groupMap[group]?.dialMode?.set || groupMap['Quectel_AT'].dialMode.set)(mode);
}
export function parseDialMode(raw: string, group: string): number | undefined {
  return (groupMap[group]?.dialMode?.parse || groupMap['Quectel_AT'].dialMode.parse)(raw);
}
export function getDialModeOptions(group: string) {
  return (groupMap[group]?.dialMode?.options || groupMap['Quectel_AT'].dialMode.options);
}

// --- USB端口模式 ---
export function getUsbModeCmd(group: string) {
  return (groupMap[group]?.usbMode?.get || groupMap['Quectel_AT'].usbMode.get)();
}
export function setUsbModeCmd(group: string, mode: number) {
  return (groupMap[group]?.usbMode?.set || groupMap['Quectel_AT'].usbMode.set)(mode);
}
export function parseUsbMode(raw: string, group: string) {
  return (groupMap[group]?.usbMode?.parse || groupMap['Quectel_AT'].usbMode.parse)(raw);
}
export function getUsbModeOptions(group: string) {
  return (groupMap[group]?.usbMode?.options || groupMap['Quectel_AT'].usbMode.options);
}

// --- PDP 上下文管理 ---
export function getPdpListCmd(group: string) {
  return (groupMap[group]?.pdp?.getList || groupMap['Quectel_AT'].pdp.getList)();
}
export function getPdpActiveCmd(group: string) {
  return (groupMap[group]?.pdp?.getActive || groupMap['Quectel_AT'].pdp.getActive)();
}
export function setPdpCmd(group: string, pdp: { cid: number; type: string; apn: string; addr?: string; dataComp?: number; headComp?: number; }) {
  return (groupMap[group]?.pdp?.set || groupMap['Quectel_AT'].pdp.set)(pdp);
}
export function deletePdpCmd(group: string, cid: number) {
  return (groupMap[group]?.pdp?.delete || groupMap['Quectel_AT'].pdp.delete)(cid);
}
export function activatePdpCmd(group: string, cid: number) {
  return (groupMap[group]?.pdp?.activate || groupMap['Quectel_AT'].pdp.activate)(cid);
}
export function deactivatePdpCmd(group: string, cid: number) {
  return (groupMap[group]?.pdp?.deactivate || groupMap['Quectel_AT'].pdp.deactivate)(cid);
}
export function parsePdpList(raw: string, group: string) {
  return (groupMap[group]?.pdp?.parseList || groupMap['Quectel_AT'].pdp.parseList)(raw);
}
export function parsePdpActive(raw: string, group: string) {
  return (groupMap[group]?.pdp?.parseActive || groupMap['Quectel_AT'].pdp.parseActive)(raw);
}

// --- 频段支持 ---
export function getBandSupportCmd(group: string): string[] {
  return (groupMap[group]?.bandSupport?.get || groupMap['Quectel_AT'].bandSupport.get)();
}
export function setBandSupportCmd(group: string, bands: number[]) {
  return (groupMap[group]?.bandSupport?.set || groupMap['Quectel_AT'].bandSupport.set)(bands);
}
export function parseBandSupport(raw: string, group: string): number[] {
  return (groupMap[group]?.bandSupport?.parse || groupMap['Quectel_AT'].bandSupport.parse)(raw);
}
export function restoreBandCmd(group: string) {
  return (groupMap[group]?.bandSupport?.restore || groupMap['Quectel_AT'].bandSupport.restore)();
}

// --- 邻区扫描 ---
export function getNeighbourCellCmd(group: string): string[] {
  return (groupMap[group]?.neighbourCell?.get || groupMap['Quectel_AT'].neighbourCell.get)();
}
export function parseNeighbourCell(raw: string, group: string): any[] {
  return (groupMap[group]?.neighbourCell?.parse || groupMap['Quectel_AT'].neighbourCell.parse)(raw);
}

// --- QRSRP ---
export function getQRSRPCmd(group: string): string {
  return (groupMap[group]?.qrsrp?.get || groupMap['Quectel_AT'].qrsrp.get)();
}
export function parseQRSRP(raw: string, group: string): { value?: number } {
  return (groupMap[group]?.qrsrp?.parse || groupMap['Quectel_AT'].qrsrp.parse)(raw);
}

// --- QSINR ---
export function getQSINRCmd(group: string): string {
  return (groupMap[group]?.qsinr?.get || groupMap['Quectel_AT'].qsinr.get)();
}
export function parseQSINR(raw: string, group: string): { value?: number } {
  return (groupMap[group]?.qsinr?.parse || groupMap['Quectel_AT'].qsinr.parse)(raw);
}

// --- QRSRQ ---
export function getQRSRQCmd(group: string): string {
  return (groupMap[group]?.qrsrq?.get || groupMap['Quectel_AT'].qrsrq.get)();
}
export function parseQRSRQ(raw: string, group: string): { value?: number } {
  return (groupMap[group]?.qrsrq?.parse || groupMap['Quectel_AT'].qrsrq.parse)(raw);
}

// --- CSQ ---
export function getRSSICmd(group: string): string {
  return (groupMap[group]?.csq?.get || groupMap['Quectel_AT'].csq.get)();
}
export function parseRSSI(raw: string, group: string): { rssi?: number, ber?: number } {
  return (groupMap[group]?.csq?.parse || groupMap['Quectel_AT'].csq.parse)(raw);
}

// --- QCAINFO ---
export function getQCAINFOCmd(group: string): string[] {
  return (groupMap[group]?.qcainfo?.get || groupMap['Quectel_AT'].qcainfo.get)();
}
export function parseQCAINFO(raws: string[], group: string): { pcc?: any, scc?: any[] } {
  return (groupMap[group]?.qcainfo?.parse || groupMap['Quectel_AT'].qcainfo.parse)(raws);
}

// --- QENG ServingCell ---
export function getQENGServingCellCmd(group: string): string {
  return (groupMap[group]?.qengServingCell?.get || groupMap['Quectel_AT'].qengServingCell.get)();
}
export function parseQENGServingCell(raw: string, group: string): any {
  return (groupMap[group]?.qengServingCell?.parse || groupMap['Quectel_AT'].qengServingCell.parse)(raw);
}

// --- 网络类型 ---
export function getNetworkTypeCmd(group: string): string {
  return (groupMap[group]?.networkType?.get || groupMap['Quectel_AT'].networkType.get)();
}
export function parseNetworkType(raw: string, group: string): string | undefined {
  return (groupMap[group]?.networkType?.parse || groupMap['Quectel_AT'].networkType.parse)(raw);
}

// --- 注册状态 ---
export function getRegStatusCmd(group: string): string[] {
  return (groupMap[group]?.regStatus?.get || groupMap['Quectel_AT'].regStatus.get)();
}
export function parseRegStatus(raw: string, group: string): number | undefined {
  return (groupMap[group]?.regStatus?.parse || groupMap['Quectel_AT'].regStatus.parse)(raw);
}

// --- 短信 ---
export function getSmsListCmd(group: string): string[] {
  return (groupMap[group]?.sms?.getListCmd || groupMap['Quectel_AT'].sms.getListCmd)();
}
export function parseSmsList(raw: string, group: string): any[] {
  return (groupMap[group]?.sms?.parseList || groupMap['Quectel_AT'].sms.parseList)(raw);
}
export function getDeleteSmsCmd(group: string, index: number): string {
  return (groupMap[group]?.sms?.getDeleteCmd || groupMap['Quectel_AT'].sms.getDeleteCmd)(index);
}

// --- 短信中心 ---
export function getSmsCenterCmd(group: string): string {
  return (groupMap[group]?.smsCenter?.get || groupMap['Quectel_AT'].smsCenter.get)();
}
export function setSmsCenterCmd(group: string, num: string): string {
  return (groupMap[group]?.smsCenter?.set || groupMap['Quectel_AT'].smsCenter.set)(num);
}
export function parseSmsCenter(raw: string, group: string): string | undefined {
  return (groupMap[group]?.smsCenter?.parse || groupMap['Quectel_AT'].smsCenter.parse)(raw);
}

// --- 发送短信 ---
export function getSendSmsCmd(group: string, smsc: string, phone: string, content: string): string {
  return (groupMap[group]?.sendSms?.get || groupMap['Quectel_AT'].sendSms.get)(smsc, phone, content);
}
export function parseSendSmsResult(raw: string, group: string): boolean {
  return (groupMap[group]?.sendSms?.parse || groupMap['Quectel_AT'].sendSms.parse)(raw);
}

// --- 短信功能开关 ---
export function getSmsEnableCmd(group: string): string {
  return (groupMap[group]?.smsEnable?.get || groupMap['Quectel_AT'].smsEnable.get)();
}
export function setSmsEnableCmd(group: string, enable: boolean): string {
  return (groupMap[group]?.smsEnable?.set || groupMap['Quectel_AT'].smsEnable.set)(enable);
}
export function parseSmsEnable(raw: string, group: string): boolean | undefined {
  return (groupMap[group]?.smsEnable?.parse || groupMap['Quectel_AT'].smsEnable.parse)(raw);
}

// --- 短信存储 ---
export function getSmsStoreCmd(group: string): string[] {
  return (groupMap[group]?.smsStore?.get || groupMap['Quectel_AT'].smsStore.get)();
}
export function setSmsStoreCmd(group: string, pos: 'SM' | 'ME'): string {
  return (groupMap[group]?.smsStore?.set || groupMap['Quectel_AT'].smsStore.set)(pos);
}
export function parseSmsStore(raw: string, group: string) {
  return (groupMap[group]?.smsStore?.parse || groupMap['Quectel_AT'].smsStore.parse)(raw);
}

// --- 网络速率 ---
export function getSignedRateCmds(group: string): string[] {
  return (groupMap[group]?.netSpeed?.getSigned || groupMap['Quectel_AT'].netSpeed.getSigned)();
}
export function parseSignedRate(raws: string[], group: string): any {
  return (groupMap[group]?.netSpeed?.parseSigned || groupMap['Quectel_AT'].netSpeed.parseSigned)(raws);
}
export function getRealtimeRateCmd(group: string): string {
  return (groupMap[group]?.netSpeed?.getRealtime || groupMap['Quectel_AT'].netSpeed.getRealtime)();
}
export function parseRealtimeRate(raw: string, group: string): any {
  return (groupMap[group]?.netSpeed?.parseRealtime || groupMap['Quectel_AT'].netSpeed.parseRealtime)(raw);
}
export function getOperatorCmd(group: string): string[] {
  return (groupMap[group]?.netSpeed?.getOperator || groupMap['Quectel_AT'].netSpeed.getOperator)();
}
export function parseOperator(raws: string[], group: string): string | undefined {
  return (groupMap[group]?.netSpeed?.parseOperator || groupMap['Quectel_AT'].netSpeed.parseOperator)(raws);
}

// --- 流量统计 ---
export function getTrafficStatCmds(group: string): string[] {
  return [
    ...(groupMap[group]?.trafficStat?.getTraffic || groupMap['Quectel_AT'].trafficStat.getTraffic)(),
    ...(groupMap[group]?.trafficStat?.getTime || groupMap['Quectel_AT'].trafficStat.getTime)()
  ];
}
export function parseTrafficStat(raws: string[], group: string, swapTraffic: boolean = false): any {
  const traffic = (groupMap[group]?.trafficStat?.parseTraffic || groupMap['Quectel_AT'].trafficStat.parseTraffic)(raws);
  const time = (groupMap[group]?.trafficStat?.parseTime || groupMap['Quectel_AT'].trafficStat.parseTime)(raws.slice(1));
  
  // 如果需要反转上下行，交换up和down的值
  if (swapTraffic && traffic) {
    return { 
      up: traffic.down, 
      down: traffic.up, 
      ...time 
    };
  }
  
  return { ...traffic, ...time };
}
export function resetTrafficStatCmds(group: string): string[] {
  return (groupMap[group]?.trafficStat?.reset || groupMap['Quectel_AT'].trafficStat.reset)?.() || [];
}

// --- 温度监控 ---
export function getTempCmds(group: string): string[] {
  return (groupMap[group]?.temp?.get || groupMap['Quectel_AT'].temp.get)();
}
export function parseTemp(raws: string[], group: string): any[] {
  return (groupMap[group]?.temp?.parse || groupMap['Quectel_AT'].temp.parse)(raws);
}

// --- 频段查询 ---
export function getBandQueryCmd(group: string): string {
  return (groupMap[group]?.bandQuery?.get || groupMap['Quectel_AT'].bandQuery.get)();
}
export function parseBandQuery(raw: string, group: string): number[] {
  return (groupMap[group]?.bandQuery?.parse || groupMap['Quectel_AT'].bandQuery.parse)(raw);
}

// --- IP地址 ---
export function getIpAddrCmd(group: string) {
  return (groupMap[group]?.ipAddr?.get || groupMap['Quectel_AT'].ipAddr.get)();
}
export function parseIpAddr(raw: string, group: string) {
  return (groupMap[group]?.ipAddr?.parse || groupMap['Quectel_AT'].ipAddr.parse)(raw);
}

// --- 锁小区 ---
export function getLockCellCmd(group: string, params: any) {
  return (groupMap[group]?.lockCell?.get || groupMap['Quectel_AT'].lockCell.get)(params);
}
export function getLockCellStatusCmd(group: string) {
  return (groupMap[group]?.lockCell?.getStatus || groupMap['Quectel_AT'].lockCell.getStatus)();
}
export function parseLockCellStatus(raw: string, group: string) {
  return (groupMap[group]?.lockCell?.parseStatus || groupMap['Quectel_AT'].lockCell.parseStatus)(raw);
}

// --- PDP认证 ---
export function getPdpAuthCmd(group: string, cid: number = 1) {
  return (groupMap[group]?.pdpAuth?.get || groupMap['Quectel_AT'].pdpAuth.get)(cid);
}
export function setPdpAuthCmd(group: string, cid: number, authType: number, username: string, password: string) {
  return (groupMap[group]?.pdpAuth?.set || groupMap['Quectel_AT'].pdpAuth.set)(cid, authType, username, password);
}
export function parsePdpAuth(raw: string, group: string) {
  return (groupMap[group]?.pdpAuth?.parse || groupMap['Quectel_AT'].pdpAuth.parse)(raw);
}
