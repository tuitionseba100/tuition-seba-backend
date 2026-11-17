const fs = require('fs');
const path = require('path');

const routesDir = 'e:/WORK/TSF/TSF-CHAT/tuition-seba-backend/routes';
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

files.forEach(file => {
  const content = fs.readFileSync(path.join(routesDir, file), 'utf8');
  const lines = content.split('\n');
  const hasRouterUseAuth = /router\.use\([^)]*authMiddleware[^)]*\)/.test(content);
  
  const unprotected = [];
  lines.forEach((line, idx) => {
    const match = line.match(/router\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/);
    if (match) {
      const method = match[1].toUpperCase();
      const endpoint = match[2];
      const hasAuthInLine = line.includes('authMiddleware') || line.includes('superadminOnly') || hasRouterUseAuth;
      if (!hasAuthInLine) {
        unprotected.push({ line: idx + 1, method, endpoint, text: line.trim() });
      }
    }
  });

  if (unprotected.length > 0) {
    console.log(`=== ${file} ${hasRouterUseAuth ? '(router.use protected)' : '(NO router.use)'} ===`);
    unprotected.forEach(u => console.log(`  L${u.line}: ${u.method} ${u.endpoint}`));
  }
});

