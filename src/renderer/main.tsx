import React from 'react';
import ReactDOM from 'react-dom/client';
import { initBrowserAPI } from './api/browserApi';
import App from './App';
import './styles/index.css';

// 初始化：检测环境，浏览器模式下先初始化 API 再渲染
async function bootstrap() {
  await initBrowserAPI();
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

bootstrap();