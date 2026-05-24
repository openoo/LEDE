import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import type { Settings as LayoutSettings } from '@ant-design/pro-components';
import type { RequestConfig, RunTimeLayoutConfig } from '@umijs/max';
import { WebSocketConfigProvider } from '@/contexts/WebSocketConfigContext';
import React, { useEffect } from 'react';
import { getResponsiveTitle, getTitleStyle } from '@/utils/titleUtils';
import { useResponsive } from '@/hooks/useResponsive';
import { Footer } from '@/components';
import defaultSettings from '../config/defaultSettings';
import { errorConfig } from './requestErrorConfig';
import '@ant-design/v5-patch-for-react-19';
import { App as AntdApp, Button, ConfigProvider, Tooltip, theme as antdTheme } from 'antd';
import routes from '../config/routes';

/**
 * @see https://umijs.org/docs/api/runtime-config#getinitialstate
 * */

export async function getInitialState(): Promise<{
  settings?: Partial<LayoutSettings>;
  currentUser?: API.CurrentUser;
  loading?: boolean;
  // fetchUserInfo?: () => Promise<API.CurrentUser | undefined>;
  dynamicTitle?: string;
  group?: string;
}> {
  // 直接返回settings、dynamicTitle和group，不做登录校验
  return {
    settings: defaultSettings as Partial<LayoutSettings>,
    dynamicTitle: 'RG500Q-EA',
    group: '',
    currentUser: {
      name: 'Admin',
      avatar: '/local-assets/avatar.png',
      userid: '00000001',
      email: 'admin@example.com',
      signature: '海纳百川，有容乃大',
      title: '交互专家',
      group: '',
      tags: [
        {
          key: '0',
          label: '很有想法的',
        },
        {
          key: '1',
          label: '专注设计',
        },
        {
          key: '5',
          label: '海纳百川',
        },
      ],
      notifyCount: 12,
      unreadCount: 11,
      country: 'China',
      access: 'admin',
      geographic: {
        province: {
          label: '江苏省',
          key: '210000',
        },
        city: {
          label: '苏州市',
          key: '210500',
        },
      },
      address: '苏州市吴江区',
      phone: '13800138000',
    },
  };
}

// ProLayout 支持的api https://procomponents.ant.design/components/layout
export const layout: RunTimeLayoutConfig = ({
  initialState,
  setInitialState,
}) => {
  // 监听系统主题变化，实现深浅模式自适应
  useEffect(() => {
    const storageKey = 'aw1000_modemwebui_theme';
    const matchMedia = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = (navTheme: 'light' | 'realDark') => {
      setInitialState((pre) => ({
        ...pre,
        settings: {
          ...pre?.settings,
          navTheme,
        },
      }));
    };
    const handler = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem(storageKey)) {
        applyTheme(e.matches ? 'realDark' : 'light');
      }
    };
    matchMedia.addEventListener('change', handler);
    const savedTheme = localStorage.getItem(storageKey);
    applyTheme(savedTheme === 'realDark' || savedTheme === 'light' ? savedTheme : matchMedia.matches ? 'realDark' : 'light');
    return () => matchMedia.removeEventListener('change', handler);
  }, [setInitialState]);

  // 同步 document.title
  useEffect(() => {
    document.title = initialState?.dynamicTitle || 'RG500Q-EA';
  }, [initialState?.dynamicTitle]);

  // 使用响应式Hook
  const { isMobile } = useResponsive();
  const isDark = initialState?.settings?.navTheme === 'realDark';
  const toggleTheme = () => {
    const nextTheme = isDark ? 'light' : 'realDark';
    localStorage.setItem('aw1000_modemwebui_theme', nextTheme);
    setInitialState((pre) => ({
      ...pre,
      settings: {
        ...pre?.settings,
        navTheme: nextTheme,
      },
    }));
  };

  // 获取所有一级菜单key（以path为key）
  const allMenuKeys = routes
    .filter(item => item.path && item.path !== '/')
    .map(item => item.path);

  return {
    actionsRender: () => [],
    rightContentRender: false,
    waterMarkProps: {
      content: initialState?.currentUser?.name,
    },
    footerRender: () => <Footer />,
    onPageChange: undefined,
    bgLayoutImgList: [
      {
        src: '/local-assets/layout-bg-1.webp',
        left: 85,
        bottom: 100,
        height: '303px',
      },
      {
        src: '/local-assets/layout-bg-2.webp',
        bottom: -68,
        right: -45,
        height: '303px',
      },
      {
        src: '/local-assets/layout-bg-3.webp',
        bottom: 0,
        left: 0,
        width: '331px',
      },
    ],
    // key: initialState?.dynamicTitle, // 移除key，避免警告
    menuHeaderRender: (logo, title, props) => {
      // 当侧边栏收起时，只显示logo，不显示文字
      if (props?.collapsed) {
        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {logo}
          </div>
        );
      }
      
      const baseTitle = initialState?.dynamicTitle || 'RG500Q-EA';
      const responsiveTitle = getResponsiveTitle(baseTitle, isMobile);
      const titleStyle = getTitleStyle(isMobile);
      
      return (
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {logo}
          <span style={titleStyle}>
            {responsiveTitle}
          </span>
        </div>
      );
    },
    title: initialState?.dynamicTitle || 'RG500Q-EA',
    openKeys: allMenuKeys,
    onOpenChange: () => {}, // 禁止自动收起，始终展开
    menu: {
      locale: false,
    },
    menuFooterRender: (props) => (
      <div style={{ display: 'flex', justifyContent: props?.collapsed ? 'center' : 'flex-end', padding: props?.collapsed ? '8px 0' : '8px 16px' }}>
        <Tooltip title={isDark ? '切换浅色主题' : '切换深色主题'} placement="right">
          <Button
            type="text"
            shape="circle"
            icon={isDark ? <SunOutlined /> : <MoonOutlined />}
            onClick={toggleTheme}
            aria-label={isDark ? '切换浅色主题' : '切换深色主题'}
          />
        </Tooltip>
      </div>
    ),
    ...initialState?.settings,
    childrenRender: (children) => {
      return (
        <WebSocketConfigProvider>
          <ConfigProvider
            theme={{
              algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
              cssVar: true,
              hashed: true,
              token: {
                colorPrimary: '#1890ff',
              },
            }}
          >
            <AntdApp>
              <>{children}</>
            </AntdApp>
          </ConfigProvider>
        </WebSocketConfigProvider>
      );
    },
  };
};

/**
 * @name request 配置，可以配置错误处理
 * 它基于 axios 和 ahooks 的 useRequest 提供了一套统一的网络请求和错误处理方案。
 * @doc https://umijs.org/docs/max/request#配置
 */
export const request: RequestConfig = {
  baseURL: '',
  ...errorConfig,
};
