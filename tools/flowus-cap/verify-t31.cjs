const fs = require('fs');
const REPO = 'E:/VBcoding/bijiapp';
const chain = JSON.parse(fs.readFileSync(REPO + '/docs/基准/证据/M0-T31/line-height-chain.json', 'utf8')).chain;
console.log('元素链条数:', chain.length);
chain.slice(0, 4).forEach((x) => console.log('  L' + x.level + ' ' + x.tag.padEnd(7) + ' ' + x.fs + '/' + x.lh + ' h=' + x.h + ' x=' + x.x));

const span = chain[0];
const blockDiv = chain[1];
const section = chain[2];
const okLH = span.lh === '26px' && section.lh === '24px';
console.log('行内 26 / 块级 24:', okLH);
const okH = blockDiv.h === 34;
console.log('块内容高 34:', okH);

const t = JSON.parse(fs.readFileSync(REPO + '/docs/基准/证据/M0-T31/t31.json', 'utf8'));
const seq = t['4 块序列'];
console.log('块序列:', seq.map((b) => b.type).join(','));
const codeBlk = seq.find((b) => b.type === 25);
const codeHasText = !!(codeBlk && /code_line/.test(codeBlk.text));
console.log('type=25 含 code_line 文本:', codeHasText);

const anchors = t['5 锚点测量'];
const para = anchors.find((a) => a.anchor.indexOf('AAA') === 0);
const quote = anchors.find((a) => a.anchor.indexOf('BBB') === 0);
const code = anchors.find((a) => a.anchor === 'code_line_1');
const paraH = para && para.block ? para.block.h : null;
const quoteH = quote && quote.block ? quote.block.h : null;
const codeH = code && code.block ? code.block.h : null;
console.log('段落 block 高:', paraH, '| 引述 block 高:', quoteH, '| 代码块 block 高:', codeH);
console.log('代码字号:', code ? code.fs + '/' + code.lh : '(无)');
console.log('引述缩进 x:', quote ? quote.x : '(无)');

const ok = okLH && okH && codeHasText && code && code.fs === '14px' && code.lh === '21px' && paraH === 34 && quoteH === 26;
console.log(ok ? '层级/代码块/锚点测量 全部与文档一致 OK' : '不一致 X');
process.exit(ok ? 0 : 1);
