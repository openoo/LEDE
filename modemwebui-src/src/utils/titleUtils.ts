/**
 * 响应式标题工具函数
 */

/**
 * 根据屏幕宽度获取适合的标题
 * @param title 原始标题
 * @param isMobile 是否为移动端
 * @returns 处理后的标题
 */
export const getResponsiveTitle = (title: string, isMobile: boolean): string => {
  if (!isMobile) {
    return title;
  }
  
  // 移动端标题处理逻辑
  if (title.includes('RG500Q-EA')) {
    return 'Modem';
  }
  
  // 如果标题太长，截取前8个字符
  if (title.length > 10) {
    return title.substring(0, 10) + '...';
  }
  
  return title;
};

/**
 * 检测当前设备是否为移动端
 * @returns 是否为移动端
 */
export const isMobileDevice = (): boolean => {
  return window.innerWidth <= 768;
};

/**
 * 获取标题样式
 * @param isMobile 是否为移动端
 * @returns 样式对象
 */
export const getTitleStyle = (isMobile: boolean) => ({
  marginLeft: 8,
  fontWeight: 700,
  fontSize: isMobile ? 14 : 18,
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden' as const,
  textOverflow: 'ellipsis' as const,
  maxWidth: isMobile ? '100px' : '200px',
  lineHeight: '1.2',
});
