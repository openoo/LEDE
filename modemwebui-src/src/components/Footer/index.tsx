import { DefaultFooter } from '@ant-design/pro-components';
import React from 'react';
import { useModel } from '@umijs/max';
import { getResponsiveTitle } from '@/utils/titleUtils';
import { useResponsive } from '@/hooks/useResponsive';

const Footer: React.FC = () => {
  const { initialState } = useModel('@@initialState');
  const { isMobile } = useResponsive();
  
  const dynamicTitle = initialState?.dynamicTitle || 'RG500Q-EA';
  const responsiveTitle = getResponsiveTitle(dynamicTitle, isMobile);
  const standaloneHref = typeof window !== 'undefined' ? `${window.location.origin}/` : '/';

  return (
    <DefaultFooter
      style={{
        background: 'none',
      }}
      copyright={false}
      links={[
        {
          key: 'RG500Q-EA',
          title: responsiveTitle,
          href: standaloneHref,
          blankTarget: true,
        },
      ]}
    />
  );
};

export default Footer;
