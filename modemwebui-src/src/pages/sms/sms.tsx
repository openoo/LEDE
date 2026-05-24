import { Row, Col, Form } from 'antd';
import { Card, Button, Input, Select, App, message, Row as AntdRow, Col as AntdCol, Radio, Tooltip, Tag, Divider, Descriptions, Modal } from 'antd';
import { useEffect, useState } from 'react';
import wsService from '@/services/websocket';
import { safeSendAT, resetGroupReady, getCurrentGroupAsync, ensureGroupReady } from '@/utils/atQueue';
import { useWebSocketConfig } from '@/contexts/WebSocketConfigContext';
import { getRememberedCommandGroup, setRememberedCommandGroup, parseATISystemInfo, getSmsListCmd, parseSmsList, getDeleteSmsCmd } from '@/utils/atModule';
import { getSmsCenterCmd, parseSmsCenter, getSendSmsCmd, parseSendSmsResult } from '@/utils/atModule';
import { getSmsStoreCmd, parseSmsStore } from '@/utils/atModule';
import { UserOutlined, SendOutlined, MenuFoldOutlined, MenuUnfoldOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useModel } from '@umijs/max';
import { formatTimeStr } from '@/utils/formatUtils';
import { useScrollReset } from '@/hooks/useScrollReset';

export default function Sms() {
  const { ip, port } = useWebSocketConfig();
  const { setInitialState } = useModel('@@initialState');

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
        <SmsCard />
      </Col>
    </Row>
  );
}

function SmsCard() {
  const { ip, port } = useWebSocketConfig();
  const [loading, setLoading] = useState(false);
  const [smsList, setSmsList] = useState<any[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [activePhone, setActivePhone] = useState<string>('');
  const [sendContent, setSendContent] = useState('');
  const [sending, setSending] = useState(false);
  // 移动端收起/展开联系人
  const [isMobile, setIsMobile] = useState(false);
  const [showContacts, setShowContacts] = useState(true);
  const [newMsgModal, setNewMsgModal] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newSending, setNewSending] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [storeUsed, setStoreUsed] = useState(0);
  const [storeTotal, setStoreTotal] = useState(50);
  const [contactMap, setContactMap] = useState<Record<string, any[]>>({});
  const [contacts, setContacts] = useState<any[]>([]);
  const [readPhones, setReadPhones] = useState<Record<string, boolean>>({});
  const [sentSmsList, setSentSmsList] = useState<any[]>([]);
  const { message } = App.useApp();

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 600);
      if (window.innerWidth < 600) setShowContacts(false);
      else setShowContacts(true);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 加载已发送短信
  const loadSentSms = () => {
    try {
      const saved = localStorage.getItem(`sent_sms_${ip}_${port}`);
      if (saved) {
        const sentList = JSON.parse(saved);
        setSentSmsList(sentList);
      }
    } catch (e) {
      console.error('加载已发送短信失败:', e);
      setSentSmsList([]);
    }
  };

  // 保存已发送短信
  const saveSentSms = (sentList: any[]) => {
    try {
      localStorage.setItem(`sent_sms_${ip}_${port}`, JSON.stringify(sentList));
      setSentSmsList(sentList);
    } catch (e) {
      console.error('保存已发送短信失败:', e);
    }
  };

  // 初始化时加载已发送短信
  useEffect(() => {
    loadSentSms();
  }, [ip, port]);

  // 获取短信列表
  const fetchSms = async () => {
    setLoading(true);
    await ensureGroupReady(ip, port);
    const realGroup = await getCurrentGroupAsync(ip, port);
    const cmds = getSmsListCmd(realGroup);
    let raws = '';
    for (const cmd of cmds) {
      raws += await safeSendAT(cmd);
    }
    const list = parseSmsList(raws, realGroup);
    
    // 合并已发送短信
    const allMessages = [...list, ...sentSmsList];
    
     // 按联系人分组
    const contactMap: Record<string, any[]> = {};
    allMessages.forEach(sms => {
      if (!contactMap[sms.phone]) contactMap[sms.phone] = [];
      contactMap[sms.phone].push(sms);
    });
    const contacts = Object.keys(contactMap).map(phone => {
      const msgs = contactMap[phone];
      // 按时间降序排序，最新的在前
      msgs.sort((a, b) => dayjs(b.time).valueOf() - dayjs(a.time).valueOf());
      return {
        phone,
        latest: msgs[0],
        all: msgs,
        latestTime: msgs[0]?.time || '', // 新增，方便排序
      };
    }).sort((a, b) => {
      // 按最新一条短信的时间降序排序
      const t1 = dayjs(formatTimeStr(a.latestTime), 'YYYY年MM月DD日 HH:mm:ss');
      const t2 = dayjs(formatTimeStr(b.latestTime), 'YYYY年MM月DD日 HH:mm:ss');
      return t2.valueOf() - t1.valueOf();
    });
    
    setContactMap(contactMap);
    setContacts(contacts);
    setSmsList(list);
    // 只设置默认选中联系人，不设置已读
    if (contacts.length) {
      setActivePhone(contacts[0].phone);
    }
    setSelected([]);
    setLoading(false);
  };

  // 刷新所有数据（短信列表和存储空间）
  const handleRefresh = async () => {
    await fetchSms();
    await fetchStore();
  };

  // 查询短信存储空间
  const fetchStore = async () => {
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const cmds = getSmsStoreCmd(realGroup);
      let raws = '';
      for (const cmd of cmds) {
        raws += await safeSendAT(cmd);
      }
      const parsed = parseSmsStore(raws, realGroup);
      setStoreUsed(parsed.read.used);
      setStoreTotal(parsed.read.total);
    } catch {
      setStoreUsed(0);
      setStoreTotal(50);
    }
  };

  // 初始化时先刷新短信列表，再刷新存储空间
  useEffect(() => {
    let cancel = false;
    const doQuery = async () => { 
      if (!cancel) {
        await fetchSms();
        await fetchStore();
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
  }, [ip, port, sentSmsList]);

  // 删除短信
  const handleDelete = async (indices: number[]) => {
    setLoading(true);
    
    // 分离已发送短信和接收短信
    const sentIndices: number[] = [];
    const receivedIndices: number[] = [];
    
    indices.forEach(idx => {
      const isSentSms = sentSmsList.find(sms => sms.index === idx);
      if (isSentSms) {
        sentIndices.push(idx);
      } else {
        receivedIndices.push(idx);
      }
    });
    
    // 删除接收的短信（通过AT命令）
    for (const idx of receivedIndices) {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const cmds = getDeleteSmsCmd(realGroup, idx);
      for (const cmd of cmds) {
        await safeSendAT(cmd);
      }
    }
    
    // 删除已发送的短信（从本地存储）
    if (sentIndices.length > 0) {
      const newSentList = sentSmsList.filter(sms => !sentIndices.includes(sms.index));
      saveSentSms(newSentList);
    }
    
    await fetchSms();
    await fetchStore();
    setBatchMode(false); // 退出批量模式
    setSelected([]); // 清空选中
  };

  // 发送短信
  const handleSend = async () => {
    if (!activePhone || !sendContent.trim()) return;
    setSending(true);
    try {
      // 1. 获取短信中心号码
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const cscaRaw = await safeSendAT(getSmsCenterCmd(realGroup));
      const smsc = parseSmsCenter(cscaRaw, realGroup);
      if (!smsc) throw new Error('未获取到短信中心号码');
      // 2. 发送短信
      const sendCmd = getSendSmsCmd(realGroup, smsc, activePhone, sendContent.trim());
      const sendRaw = await safeSendAT(sendCmd);
      if (parseSendSmsResult(sendRaw, realGroup)) {
        message.success('短信发送成功');
        
        // 保存已发送短信
        const sentSms = {
          phone: activePhone,
          content: sendContent.trim(),
          time: new Date().toISOString(),
          isSent: true,
          index: Date.now(), // 使用时间戳作为唯一ID
        };
        const newSentList = [...sentSmsList, sentSms];
        saveSentSms(newSentList);
        
        setSendContent('');
        await fetchSms();
        await fetchStore();
      } else {
        message.error('短信发送失败');
      }
    } catch (e) {
      message.error('短信发送异常: ' + e);
    }
    setSending(false);
  };

  // 新短信发送逻辑
  const handleSendNew = async () => {
    if (!newPhone.trim() || !newContent.trim()) return;
    setNewSending(true);
    try {
      await ensureGroupReady(ip, port);
      const realGroup = await getCurrentGroupAsync(ip, port);
      const cscaRaw = await safeSendAT(getSmsCenterCmd(realGroup));
      const smsc = parseSmsCenter(cscaRaw, realGroup);
      if (!smsc) throw new Error('未获取到短信中心号码');
      const sendCmd = getSendSmsCmd(realGroup, smsc, newPhone.trim(), newContent.trim());
      const sendRaw = await safeSendAT(sendCmd);
      if (parseSendSmsResult(sendRaw, realGroup)) {
        message.success('短信发送成功');
        
        // 保存已发送短信
        const sentSms = {
          phone: newPhone.trim(),
          content: newContent.trim(),
          time: new Date().toISOString(),
          isSent: true,
          index: Date.now(), // 使用时间戳作为唯一ID
        };
        const newSentList = [...sentSmsList, sentSms];
        saveSentSms(newSentList);
        
        setNewMsgModal(false);
        setNewPhone('');
        setNewContent('');
        await fetchSms();
        await fetchStore();
      } else {
        message.error('短信发送失败');
      }
    } catch (e) {
      message.error('短信发送异常: ' + e);
    }
    setNewSending(false);
  };

  // UI
  return (
    <Card
      title={
        <span>
          短信管理
          <span style={{ marginLeft: 8, fontWeight: 'normal', color: 'var(--ant-color-text-secondary)', fontSize: 14 }}>
            存储空间: {storeUsed}/{storeTotal}
          </span>
          <span style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: 12, width: 120, height: 6, background: 'var(--ant-color-fill-tertiary)', borderRadius: 6, position: 'relative' }}>
            <span style={{ display: 'block', height: 6, borderRadius: 6, background: 'var(--ant-color-primary)', width: `${storeTotal ? Math.min(100, (storeUsed / storeTotal) * 100) : 0}%`, transition: 'width 0.3s' }} />
          </span>
        </span>
      }
      extra={
        <>
          <Button className="my-btn" type="primary" icon={<SendOutlined />} style={{ marginRight: 8 }} onClick={() => setNewMsgModal(true)}>
            发送新短信
          </Button>
          {batchMode && (
            <>
              <Button className="my-btn" style={{ marginRight: 8, color: 'var(--ant-color-error)', borderColor: 'var(--ant-color-error)', background: 'var(--ant-color-bg-container)' }} onClick={() => { setBatchMode(false); setSelected([]); }}>取消批量删除</Button>
              {(() => {
                const all = contactMap[activePhone]?.map(sms => sms.index) || [];
                const isAll = all.length > 0 && selected.length === all.length;
                return (
                  <Button className="my-btn" style={{ marginRight: 8 }} onClick={() => {
                    if (isAll) setSelected([]);
                    else setSelected(all);
                  }}>{isAll ? '取消全选' : '全选'}</Button>
                );
              })()}
            </>
          )}
          {/* 只在有选中时显示批量删除按钮 */}
          {!batchMode && contacts.length > 0 && activePhone && (
            <Button className="my-btn" danger style={{ marginRight: 8 }} onClick={() => setBatchMode(true)}>批量删除</Button>
          )}
          <Button className="my-btn" size="small" loading={loading} onClick={handleRefresh} icon={<ReloadOutlined />}>刷新</Button>
        </>
      }
      style={{ minHeight: 500 }}
    >
      {/* 新短信弹窗 */}
      <Modal
        open={newMsgModal}
        title={<b>发送新短信</b>}
        onCancel={() => setNewMsgModal(false)}
        footer={null}
        centered
        styles={{ body: { borderRadius: 12, padding: 8, paddingBottom: 12 } }}
        style={{ borderRadius: 16 }}
        destroyOnHidden
      >
        <Input
          placeholder="请输入新联系人号码"
          value={newPhone}
          onChange={e => setNewPhone(e.target.value)}
          style={{ fontSize: 14, marginBottom: 16, borderRadius: 6, borderWidth: 1.5, borderColor: 'var(--ant-color-primary)' }}
          size="large"
          autoFocus
        />
        <Input.TextArea
          placeholder="请输入短信内容"
          value={newContent}
          onChange={e => setNewContent(e.target.value)}
          style={{ fontSize: 14, marginBottom: 16, borderRadius: 6, borderWidth: 1.5, borderColor: 'var(--ant-color-primary)', minHeight: 100, resize: 'vertical' }}
          size="large"
          autoSize={{ minRows: 4, maxRows: 8 }}
        />
        <Button
          className="my-btn"
          type="primary"
          icon={<SendOutlined />}
          block
          size="large"
          style={{ borderRadius: 4, fontSize: 14 }}
          loading={newSending}
          disabled={!newPhone.trim() || !newContent.trim()}
          onClick={handleSendNew}
        >
          发送
        </Button>
      </Modal>
      <div style={{ display: 'flex', height: 780 }}>
        {/* 左侧联系人列表 */}
        {(!isMobile || showContacts) && (
          <div className="custom-scrollbar" style={{ width: 260, borderRight: '1px solid var(--ant-color-fill-tertiary)', paddingLeft: 0, paddingRight: 24, position: 'relative', background: 'var(--ant-color-bg-container)', zIndex: 2, overflowY: 'auto', height: '100%' }}>
            {isMobile && (
              <MenuFoldOutlined
                style={{ position: 'absolute', right: 8, top: 8, fontSize: 20, color: 'var(--ant-color-text-secondary)', zIndex: 10, cursor: 'pointer' }}
                onClick={() => setShowContacts(false)}
              />
            )}
            {contacts.length ? contacts.map(c => {
              // 判断是否有未读短信
              const hasUnread = c.all.some((msg: any) => msg.status === '0');
              const showBadge = hasUnread && !readPhones[c.phone]; // 不再判断activePhone
              const unreadCount = c.all.filter((msg: any) => msg.status === '0').length;
              
              return (
                <div
                  key={c.phone}
                  onClick={() => {
                    setReadPhones(prev => ({ ...prev, [c.phone]: true }));
                    setActivePhone(c.phone);
                    if (isMobile) setShowContacts(false);
                  }}
                  style={{
                    background: activePhone === c.phone ? 'var(--ant-color-primary-bg)' : 'var(--ant-color-fill-tertiary)',
                    borderRadius: 8,
                    padding: '12px 16px',
                    marginBottom: 16,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    boxShadow: activePhone === c.phone ? '0 2px 8px rgba(0, 0, 0, 0.15)' : undefined,
                    position: 'relative',
                    border: activePhone === c.phone ? '1px solid var(--ant-color-primary)' : '1px solid transparent',
                  }}
                >
                  {showBadge && (
                    <span style={{ 
                      position: 'absolute', 
                      right: 6, 
                      top: 6, 
                      minWidth: 20, 
                      height: 20, 
                      background: 'var(--ant-color-error)', 
                      borderRadius: '10px', 
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      color: '#fff',
                      padding: '0 4px',
                      boxSizing: 'border-box'
                    }}>
                      {c.all.filter((msg: any) => msg.status === '0').length}
                    </span>
                  )}
                  <UserOutlined style={{ fontSize: 24, color: 'var(--ant-color-text-secondary)', marginRight: 12 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', fontSize: 14 }}>{c.phone}</div>
                    <div style={{ color: 'var(--ant-color-text-secondary)', fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>
                      {c.latest.content}
                    </div>
                  </div>
                </div>
              );
            }) : <div style={{ color: 'var(--ant-color-text-secondary)', textAlign: 'center', marginTop: 64 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <img src="/icons/wuxinxi.svg" alt="暂无信息" style={{ width: 128, height: 128, marginBottom: 8, marginLeft: 0, opacity: 0.6 }} />
                <div style={{ fontSize: 14, color: 'var(--ant-color-text-secondary)' }}>暂无短信</div>
              </div>
            </div>}
          </div>
        )}
        {isMobile && !showContacts && (
          <div style={{ width: 32, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'transparent', zIndex: 2 }}>
            <MenuUnfoldOutlined
              style={{ fontSize: 22, color: 'var(--ant-color-text-secondary)', marginTop: 12, cursor: 'pointer' }}
              onClick={() => setShowContacts(true)}
            />
          </div>
        )}
        {/* 右侧短信内容列表 */}
        <div style={{ flex: 1, padding: '0px 0px 0px 24px', display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
          <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', paddingBottom: batchMode && selected.length > 0 ? '80px' : '0px', transition: 'padding-bottom 0.3s' }}>
            {contacts.length && activePhone ?
              // 按时间升序排列
              [...contactMap[activePhone]].sort((a, b) => {
                // 尝试用 dayjs 解析时间
                const t1 = dayjs(formatTimeStr(a.time), 'YYYY年MM月DD日 HH:mm:ss');
                const t2 = dayjs(formatTimeStr(b.time), 'YYYY年MM月DD日 HH:mm:ss');
                if (t1.isValid() && t2.isValid()) return t1.valueOf() - t2.valueOf();
                // 兜底按字符串比较
                return String(a.time).localeCompare(String(b.time));
              }).map(sms => {
                const checkboxWidth = batchMode ? 24 : 0; // 复选框宽度
                const checkboxMargin = batchMode ? 8 : 0;
                const timeMarginLeft = checkboxWidth + checkboxMargin;
                const isSent = sms.isSent; // 判断是否为已发送短信
                return (
                  <div key={sms.index} style={{ marginBottom: 16 }}>
                    {/* 时间显示在气泡上方 */}
                    <div style={{ 
                      color: 'var(--ant-color-text-secondary)', 
                      fontSize: 14, 
                      marginBottom: 2, 
                      textAlign: isSent ? 'right' : 'left',
                      marginLeft: isSent ? 0 : timeMarginLeft,
                      marginRight: 0
                    }}>
                      {formatTimeStr(sms.time)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: isSent ? 'flex-end' : 'flex-start' }}>
                      {batchMode && (
                        <input type="checkbox" checked={selected.includes(sms.index)} onChange={e => {
                          setSelected(sel => e.target.checked ? [...sel, sms.index] : sel.filter(i => i !== sms.index));
                        }} style={{ 
                          marginRight: 12, 
                          marginLeft: isSent ? 12 : 0,
                          marginBottom: 4, 
                          width: 16, 
                          height: 16, 
                          alignSelf: 'flex-start' 
                        }} />
                      )}
                      <div style={{ 
                        background: isSent ? 'var(--ant-color-primary)' : 'var(--ant-color-fill-tertiary)', 
                        borderRadius: isSent ? '12px 12px 0 12px' : '12px 12px 12px 0', 
                        padding: '8px 16px', 
                        minWidth: 120, 
                        display: 'inline-block',
                        maxWidth: '70%'
                      }}>
                        <div style={{ 
                          fontSize: 14, 
                          padding: '6px 0',
                          color: isSent ? '#fff' : 'var(--ant-color-text)'
                        }}>
                          {sms.content}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }) : <div style={{ color: 'var(--ant-color-text-secondary)', textAlign: 'center', marginTop: 320, fontSize: 14 }}>
                选择联系人或点击"发送新短信"按钮开始新对话
              </div>}
          </div>
          {/* 发送短信输入框，仅非批量模式下显示 */}
          {!batchMode && contacts.length > 0 && activePhone && (
            <div style={{ marginTop: 16, border: '1px solid var(--ant-color-fill-tertiary)', background: 'var(--ant-color-fill-tertiary)', borderRadius: 8, boxShadow: '0px 3px 8px var(--ant-color-fill-tertiary)', padding: 12 }}>
              <textarea
                style={{
                  width: '100%',
                  minHeight: 40,
                  maxHeight: 160,
                  outline: 'none',
                  border: '1.5px solid var(--ant-color-fill-tertiary)',
                  fontSize: 14,
                  background: 'var(--ant-color-bg-container)',
                  borderRadius: 6,
                  resize: 'vertical',
                  padding: '8px 12px',
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box',
                }}
                placeholder="请输入短信内容"
                value={sendContent}
                onChange={e => setSendContent(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={sending}
                onFocus={e => e.currentTarget.style.border = '1.5px solid var(--ant-color-primary)'}
                onBlur={e => e.currentTarget.style.border = '1.5px solid var(--ant-color-fill-tertiary)'}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                <Button
                  className="my-btn"
                  type="primary"
                  icon={<SendOutlined />}
                  style={{ minWidth: 120 }}
                  loading={sending}
                  onClick={handleSend}
                  disabled={!sendContent.trim() || !activePhone}
                >
                  发送
                </Button>
              </div>
            </div>
          )}
          {/* 批量删除底部提示按钮 */}
          {batchMode && selected.length > 0 && (
            <div style={{ 
              position: 'absolute', 
              left: 0, 
              right: 0, 
              bottom: 0, 
              display: 'flex', 
              justifyContent: 'center', 
              zIndex: 10,
              padding: '16px 0 24px',
              background: 'linear-gradient(to top, var(--ant-color-bg-container) 60%, transparent)',
              pointerEvents: 'none'
            }}>
              <Button
                danger
                className='my-btn'
                style={{ 
                  background: 'var(--ant-color-error)', 
                  color: '#fff', 
                  borderRadius: 8, 
                  fontSize: 14, 
                  padding: '10px 32px',
                  height: 'auto',
                  boxShadow: '0 4px 12px rgba(255, 77, 79, 0.4)',
                  pointerEvents: 'auto'
                }}
                onClick={() => handleDelete(selected)}
              >
                删除选中的 {selected.length} 条短信
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
