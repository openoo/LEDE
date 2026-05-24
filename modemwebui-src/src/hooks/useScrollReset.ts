import { useEffect } from 'react';
import { history } from '@umijs/max';

/**
 * 页面切换时自动重置滚动位置的Hook
 * 解决SPA应用中页面间滚动位置共享的问题
 */
export const useScrollReset = () => {
  useEffect(() => {
    // 页面加载时滚动到顶部
    window.scrollTo(0, 0);
    
    // 监听路由变化，在页面切换时重置滚动位置
    const unlisten = history.listen((location) => {
      // 使用setTimeout确保在DOM更新后执行滚动重置
      setTimeout(() => {
        window.scrollTo(0, 0);
      }, 0);
    });

    // 清理监听器
    return () => {
      unlisten();
    };
  }, []);
};

