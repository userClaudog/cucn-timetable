#!/usr/bin/env node
// ============================================================
// cucn-timetable 一键更新脚本
//
// 用法（在本目录下运行）：
//   node update.mjs            校验 courses.json → 生成 data.js → 打印摘要
//   node update.mjs --push     同上，并 git add/commit/push（仓库已配远程时用）
//
// 依赖：仅 Node.js 18+，无第三方包
// ============================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = join(root, 'courses.json');
const DATA_PATH = join(root, 'data.js');
const ICS_PATH = join(root, 'kechengbiao.ics');
const PUSH = process.argv.includes('--push');

const warn = m => console.log('⚠️  ' + m);
const ok = m => console.log('✅ ' + m);
const info = m => console.log('ℹ️  ' + m);
const err = m => { console.error('❌ ' + m); process.exitCode = 1; };

/* ---------- 与油猴脚本/前端一致的解析函数 ---------- */
function clean(s) {
  return String(s == null ? '' : s).replace(/[\s\u00a0\u00ad\u180e\u2000-\u200f\u2028\u2029\u202f\u205f\u2060-\u206f\u3000\ufe00-\ufe0f\ufeff\ufff9-\ufffb]/g, '');
}
function weeksFromZcd(zcd) {
  let s = clean(zcd).replace(/[第周]/g, '');
  const isOdd = /单/.test(s), isEven = /双/.test(s);
  s = s.replace(/[（(]?[单双][)）]?/g, '');
  const weeks = new Set();
  for (const part of s.split(/[,，、]/)) {
    const m = part.match(/^(\d+)\s*(?:[-~－–—至]\s*(\d+))?$/);
    if (!m) continue;
    const a = +m[1], b = m[2] ? +m[2] : a;
    for (let w = a; w <= b; w++) weeks.add(w);
  }
  let arr = [...weeks].sort((x, y) => x - y);
  if (isOdd) arr = arr.filter(w => w % 2 === 1);
  if (isEven) arr = arr.filter(w => w % 2 === 0);
  return arr;
}

/* ---------- 读入与基础校验 ---------- */
if (!existsSync(JSON_PATH)) {
  err('找不到 courses.json —— 请先在教务课表页用油猴脚本点「下载 JSON」，把文件放进本目录');
  process.exit(1);
}
let json;
try {
  json = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
} catch (e) {
  err('courses.json 不是合法 JSON：' + e.message);
  process.exit(1);
}
if (!json || typeof json !== 'object' || !Array.isArray(json.courses)) {
  err('courses.json 结构不对：顶层应为 { name, semesterStart, reminder, periods, updatedAt, courses: [...] }');
  process.exit(1);
}

const meta = json.meta || json;
const out = {
  name: String(meta.name || '南京传媒学院课表'),
  semesterStart: String(meta.semesterStart || ''),
  reminder: Number.isFinite(+meta.reminder) ? +meta.reminder : 10,
  updatedAt: String(meta.updatedAt || new Date().toISOString()),
  periods: String(meta.periods || ''),
  courses: []
};

if (!/^\d{4}-\d{2}-\d{2}$/.test(out.semesterStart)) {
  err('开学日期 semesterStart 格式不对（应为 YYYY-MM-DD）：' + out.semesterStart);
}
if (!/^[1-9]\d*\s+\d{1,2}:\d{2}\s+\d{1,2}:\d{2}/m.test(out.periods)) {
  err('作息时间 periods 格式不对（每行应为：节次 开始 结束，如 "1  08:00 08:45"）');
}

/* ---------- 逐门课程校验 ---------- */
let bad = 0, totalPeriods = 0;
const allWeeks = [];
json.courses.forEach((c, i) => {
  const name = (c && c.kcmc) ? String(c.kcmc) : '(第 ' + (i + 1) + ' 条：无名课程)';
  const problems = [];
  if (!c || typeof c !== 'object') { bad++; warn('第 ' + (i + 1) + ' 条不是对象，已跳过'); return; }
  if (!c.kcmc) problems.push('缺课程名 kcmc');
  if (!(c.xqj >= 1 && c.xqj <= 7)) problems.push('星期 xqj 应为 1-7（现在：' + c.xqj + '）');
  if (!c.jcs) problems.push('缺节次 jcs');
  if (problems.length) { bad++; warn(name + '：' + problems.join('；') + ' —— 已跳过'); return; }

  const weeks = (Array.isArray(c.weeks) && c.weeks.length)
    ? c.weeks.map(Number).filter(w => w >= 1).sort((a, b) => a - b)
    : weeksFromZcd(c.zcd);
  if (!weeks.length) {
    bad++;
    warn(name + '：周次解析不出来（zcd="' + (c.zcd || '') + '"）—— 已跳过，请检查教务页面解析');
    return;
  }
  out.courses.push({
    kcmc: String(c.kcmc), xqj: +c.xqj, jcs: String(c.jcs),
    zcd: c.zcd ? String(c.zcd) : '',
    cdmc: c.cdmc ? String(c.cdmc) : '',
    xm: c.xm ? String(c.xm) : '',
    weeks
  });
  totalPeriods += weeks.length;
  weeks.forEach(w => allWeeks.push(w));
});

if (!out.courses.length) {
  err('没有一门课通过校验，data.js 未生成');
  process.exit(1);
}
if (bad) warn('共 ' + bad + ' 条记录被跳过（见上方），建议回教务页面重新导出并对照诊断信息');

/* ---------- 摘要 ---------- */
const minW = Math.min(...allWeeks), maxW = Math.max(...allWeeks);
const sd = new Date(out.semesterStart + 'T00:00:00');
const sdDow = ['日', '一', '二', '三', '四', '五', '六'][sd.getDay()];
console.log('📊 摘要');
console.log('   课程数：' + out.courses.length + ' 门（共 ' + totalPeriods + ' 节课时）');
console.log('   周次覆盖：第 ' + minW + ' – ' + maxW + ' 周');
console.log('   开学日期：' + out.semesterStart + '（星期' + sdDow + (sdDow === '一' ? ' ✓' : ' ⚠️ 不是周一，请确认！') + '）');
console.log('   数据更新时间：' + out.updatedAt);
const ageDays = Math.floor((Date.now() - new Date(out.updatedAt)) / 86400000);
if (ageDays > 30) warn('数据已 ' + ageDays + ' 天未更新，注意教务是否有课表变动');

/* ---------- 生成 data.js ---------- */
const stamp = new Date().toLocaleString('zh-CN', { hour12: false });
writeFileSync(DATA_PATH,
  '// ============================================================\n' +
  '// 课表数据文件（自动生成，请勿手改 —— 改 courses.json 后跑 node update.mjs）\n' +
  '// 生成时间：' + stamp + '（' + out.courses.length + ' 门课，覆盖第 ' + minW + '-' + maxW + ' 周）\n' +
  '// 来源：油猴脚本「南传课表导出」下载的 courses.json\n' +
  '// ============================================================\n' +
  'window.TIMETABLE = ' + JSON.stringify(out, null, 2) + ';\n', 'utf8');
ok('已生成 data.js（' + out.courses.length + ' 门课）');
info('双击 index.html 即可本地预览（可加 ?week=3 直达第 3 周）');

/* ---------- ICS 检查 ---------- */
if (existsSync(ICS_PATH)) {
  const ics = readFileSync(ICS_PATH, 'utf8');
  const n = (ics.match(/BEGIN:VEVENT/g) || []).length;
  if (!n) warn('kechengbiao.ics 里是 0 节课时 —— 别部署这个文件！请在教务页面重新「抓取课表」再下载 .ics');
  else ok('kechengbiao.ics：' + n + ' 节课时（手机日历订阅源）');
} else {
  warn('本目录没有 kechengbiao.ics —— 手机订阅会 404。请把油猴脚本下载的 .ics 放进本目录');
}

/* ---------- 可选推送 ---------- */
if (PUSH) {
  try {
    execSync('git add -A', { cwd: root, stdio: 'pipe' });
    try {
      execSync('git commit -m "更新课表 ' + new Date().toLocaleDateString('zh-CN') + '（' + out.courses.length + ' 门课）"', { cwd: root, stdio: 'pipe' });
    } catch (e) {
      const s = String(e.stderr || e.stdout || '');
      if (!/nothing to commit/i.test(s)) throw e;
      info('没有文件变化，跳过 commit');
    }
    execSync('git push', { cwd: root, stdio: 'inherit' });
    console.log('🚀 已推送。Cloudflare Pages 会自动重新部署前端；手机日历会在 12 小时内自动同步');
  } catch (e) {
    err('git 操作失败：' + (e.stderr ? String(e.stderr).trim() : e.message));
    err('请确认本目录是 git 仓库且已配置远程（git remote -v）');
  }
}
