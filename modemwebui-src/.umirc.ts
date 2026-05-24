import { defineConfig } from '@umijs/max';
import routes from './config/routes';

export default defineConfig({
  antd: {},
  access: {},
  model: {},
  initialState: {},
  request: {},
  layout: {
    locale: false,
  },
  locale: {
    default: 'zh-CN',
    antd: true,
    baseNavigator: false,
  },
  routes,
  history: {
    type: 'browser',
  },
  publicPath: '/',
  hash: true,
  npmClient: 'npm',
});
