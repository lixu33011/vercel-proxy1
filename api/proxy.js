const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();

// 全局跨域配置（允许所有来源和凭证）
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['*']
}));

// 动态代理核心中间件
app.use((req, res, next) => {
  // 1. 解析请求路径，提取目标网站域名和路径
  // 示例：/github.com/vercel → 域名：github.com，路径：/vercel
  // 示例：/bilibili.com/video/BV1xx411c7mG → 域名：bilibili.com，路径：/video/BV1xx411c7mG
  const fullPath = req.path.slice(1); // 去掉开头的 /
  const firstSlashIndex = fullPath.indexOf('/');
  
  let targetDomain, proxyPath;
  if (firstSlashIndex === -1) {
    // 无后续路径（如 /github.com）
    targetDomain = fullPath;
    proxyPath = '/';
  } else {
    // 有后续路径
    targetDomain = fullPath.substring(0, firstSlashIndex);
    proxyPath = fullPath.substring(firstSlashIndex);
  }

  // 2. 校验域名格式（简单校验，避免非法请求）
  if (!targetDomain || !targetDomain.includes('.')) {
    return res.status(400).json({
      success: false,
      message: '请输入正确的网站域名，示例：/github.com 或 /bilibili.com/video/BV1xx411c7mG'
    });
  }

  // 3. 构建动态代理配置
  const proxyOptions = {
    target: `https://${targetDomain}`, // 统一使用 HTTPS 代理（适配绝大多数网站）
    changeOrigin: true, // 必开：模拟目标域名请求
    secure: false, // 忽略 SSL 证书验证（本地调试）
    pathRewrite: {
      // 重写路径：去掉开头的 /域名 部分，只保留后续路径
      [`^/${targetDomain}`]: ''
    },
    // 通用请求头：模拟浏览器，避免被反爬
    onProxyReq: (proxyReq) => {
      proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      proxyReq.setHeader('Referer', `https://${targetDomain}`);
      proxyReq.removeHeader('X-Forwarded-For'); // 隐藏代理标识
    },
    // 弱化 CSP 和跨域限制，让页面更易加载
    onProxyRes: (proxyRes) => {
      delete proxyRes.headers['content-security-policy'];
      delete proxyRes.headers['content-security-policy-report-only'];
      proxyRes.headers['Access-Control-Allow-Origin'] = '*';
      proxyRes.headers['Access-Control-Allow-Credentials'] = 'true';
    },
    logLevel: 'warn' // 仅打印警告日志，减少干扰
  };

  // 4. 动态挂载代理中间件并执行
  createProxyMiddleware(proxyOptions)(req, res, next);
});

// 错误处理
app.use((err, req, res) => {
  console.error('代理错误:', err);
  res.status(500).json({
    success: false,
    message: '代理访问失败',
    error: err.message,
    tip: '请检查域名是否正确，示例：/github.com 或 /baidu.com'
  });
});

// Vercel 导出
module.exports = app;
