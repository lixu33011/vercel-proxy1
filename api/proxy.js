const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();

// 全局跨域配置（适配 HTTPS 域名）
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['*']
}));

// 动态代理核心中间件
app.use((req, res, next) => {
  // 1. 解析请求路径，提取目标网站域名和路径
  const fullPath = req.path.slice(1);
  const firstSlashIndex = fullPath.indexOf('/');
  
  let targetDomain, proxyPath;
  if (firstSlashIndex === -1) {
    targetDomain = fullPath;
    proxyPath = '/';
  } else {
    targetDomain = fullPath.substring(0, firstSlashIndex);
    proxyPath = fullPath.substring(firstSlashIndex);
  }

  // 校验域名格式
  if (!targetDomain || !targetDomain.includes('.')) {
    return res.status(400).json({
      success: false,
      message: '请输入正确的网站域名，示例：/github.com 或 /bilibili.com/video/BV1xx411c7mG'
    });
  }

  // 2. 获取代理服务器的基础信息（强制 HTTPS）
  const proxyHost = req.headers.host; // 代理域名：dl.330115558.xyz
  const proxyProtocol = 'https'; // 强制使用 HTTPS 协议
  const proxyBasePath = `/${targetDomain}`; // 代理路径前缀：/github.com

  // 3. 构建动态代理配置（重点修复跳转问题）
  const proxyOptions = {
    target: `https://${targetDomain}`,
    changeOrigin: true,
    secure: false,
    pathRewrite: {
      [`^/${targetDomain}`]: ''
    },
    // 重写请求头：传递正确的协议和主机
    onProxyReq: (proxyReq) => {
      proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      proxyReq.setHeader('Referer', `${proxyProtocol}://${proxyHost}${proxyBasePath}`);
      proxyReq.setHeader('Origin', `${proxyProtocol}://${proxyHost}${proxyBasePath}`);
      proxyReq.setHeader('X-Forwarded-Proto', proxyProtocol); // 告诉目标服务器代理使用 HTTPS
      proxyReq.removeHeader('X-Forwarded-For');
    },
    // 核心修复：重写响应中的跳转和链接
    onProxyRes: (proxyRes, req, res) => {
      // ① 修复 Location 跳转头（解决登录跳转错误）
      if (proxyRes.headers['location']) {
        let location = proxyRes.headers['location'];
        // 替换目标域名的绝对链接为代理链接
        location = location.replace(
          new RegExp(`^https?://${targetDomain}(.*)`),
          `${proxyProtocol}://${proxyHost}${proxyBasePath}$1`
        );
        // 替换相对链接（如 /login → /github.com/login）
        if (location.startsWith('/') && !location.startsWith(`/${targetDomain}`)) {
          location = `${proxyBasePath}${location}`;
        }
        // 强制 HTTPS 协议
        location = location.replace(/^http:/, 'https:');
        proxyRes.headers['location'] = location;
      }

      // ② 删除严格的 CSP 头，避免资源拦截
      delete proxyRes.headers['content-security-policy'];
      delete proxyRes.headers['content-security-policy-report-only'];

      // ③ 重写响应内容中的链接（修复页面内的跳转链接）
      const originalWrite = proxyRes.write;
      let responseBody = '';
      proxyRes.write = function (chunk) {
        responseBody += chunk.toString();
        return true;
      };
      proxyRes.on('end', function () {
        // 替换页面内的所有目标域名链接为代理链接
        let modifiedBody = responseBody.replace(
          new RegExp(`https?://${targetDomain}(/[^"']*)?`, 'g'),
          `${proxyProtocol}://${proxyHost}${proxyBasePath}$1`
        );
        // 强制所有链接使用 HTTPS
        modifiedBody = modifiedBody.replace(/src="http:/g, 'src="https:');
        modifiedBody = modifiedBody.replace(/href="http:/g, 'href="https:');
        // 输出修改后的响应内容
        originalWrite.call(proxyRes, modifiedBody);
        proxyRes.end();
      });

      // ④ 跨域头配置
      proxyRes.headers['Access-Control-Allow-Origin'] = `${proxyProtocol}://${proxyHost}`;
      proxyRes.headers['Access-Control-Allow-Credentials'] = 'true';
    },
    logLevel: 'warn'
  };

  // 动态挂载代理中间件
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

module.exports = app;
