const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const mini = path.join(root, 'miniprogram');
const errors = [];

function walk(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => !['node_modules', '.git'].includes(entry.name))
    .flatMap((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(target) : [target];
    });
}

function requireFile(relative) {
  if (!fs.existsSync(path.join(root, relative))) errors.push(`缺少文件：${relative}`);
}

[
  'project.config.json',
  'miniprogram/app.js',
  'miniprogram/app.json',
  'miniprogram/app.wxss',
  'miniprogram/sitemap.json',
  'h5/index.html',
  'h5/styles.css',
  'h5/app.js',
  'scripts/serve-h5.js'
].forEach(requireFile);

for (const file of walk(root).filter((name) => name.endsWith('.json'))) {
  try {
    JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`${path.relative(root, file)} JSON 无效：${error.message}`);
  }
}

const app = JSON.parse(fs.readFileSync(path.join(mini, 'app.json'), 'utf8'));
for (const page of app.pages || []) {
  for (const extension of ['js', 'json', 'wxml', 'wxss']) requireFile(`miniprogram/${page}.${extension}`);
  const config = JSON.parse(fs.readFileSync(path.join(mini, `${page}.json`), 'utf8'));
  for (const component of Object.values(config.usingComponents || {})) {
    const base = path.resolve(path.dirname(path.join(mini, page)), component);
    for (const extension of ['js', 'json', 'wxml', 'wxss'])
      if (!fs.existsSync(`${base}.${extension}`)) errors.push(`缺少组件文件：${path.relative(root, base)}.${extension}`);
  }
}
if ((app.pages || []).some((page) => /pages\/(?:record|recipient)\/create$/.test(page)))
  errors.push('旧 create 页面不应注册');
for (const group of app.subpackages || []) {
  for (const page of group.pages || []) {
    for (const extension of ['js', 'json', 'wxml', 'wxss'])
      requireFile(`miniprogram/${group.root}/${page}.${extension}`);
  }
}

for (const file of walk(mini).filter((name) => name.endsWith('.wxml'))) {
  const source = fs.readFileSync(file, 'utf8');
  if (/\{\{[^}]*\.(slice|join|includes)\(/.test(source))
    errors.push(`${path.relative(root, file)} 在模板中调用了不兼容的方法`);
  if (/\\n/.test(source)) errors.push(`${path.relative(root, file)} 含有不会自动换行的 \\n 文本`);
}

for (const file of walk(root).filter((name) => /\.(js|cjs)$/.test(name))) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) errors.push(`${path.relative(root, file)} JS 语法错误：${result.stderr}`);
}
if (app.tabBar?.list?.length) errors.push('V0.1.1 只有礼物簿一个主空间，不应出现底部导航');
if ((app.subpackages || []).length) errors.push('V0.1 不应注册未来功能分包');
for (const file of [...walk(mini).filter((name) => name.endsWith('.wxml')), path.join(root, 'h5/app.js')]) {
  if (/推荐|收藏|分享|回访|成就|敬请期待/.test(fs.readFileSync(file, 'utf8')))
    errors.push(`${path.relative(root, file)} 存在范围外产品入口或文案`);
}
for (const file of [...walk(mini).filter((name) => /\.wxss$/.test(name)), path.join(root, 'h5/styles.css')]) {
  if (/\.(?:book-art|welcome-visual|quiet-mark|person-card|history-item|fixed-action|card|group|chips|chip)(?![\w-])/.test(fs.readFileSync(file, 'utf8')))
    errors.push(`${path.relative(root, file)} 包含已废弃样式`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(
  `小程序结构校验通过：${(app.pages || []).length} 个主包页面，${(app.subpackages || []).reduce((sum, group) => sum + group.pages.length, 0)} 个分包页面。`
);
