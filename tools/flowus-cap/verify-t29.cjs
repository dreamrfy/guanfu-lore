const fs = require('fs');
const REPO = 'E:/VBcoding/bijiapp';
const r2 = JSON.parse(fs.readFileSync(REPO + '/docs/基准/证据/M0-T29/relation2.json', 'utf8'));
const schema = r2['4 schema'] || [];
const cl = schema.filter((f) => f.name === '分类');
console.log('分类字段:', JSON.stringify(cl));
const isRelation = cl.length && cl[0].type === 'relation';
console.log('分类 已变为 relation:', isRelation);
console.log('relation 字段键:', cl.length ? cl[0].keys : '(无)');

const pickedOk = r2['2 选集合'] === true;
console.log('成功点选了关联目标表:', pickedOk);

const lp = JSON.parse(fs.readFileSync(REPO + '/docs/基准/证据/M0-T29/learning-progress-per-block.json', 'utf8'));
console.log('学习进度 schema 块数:', lp.schemaBlocks, '| 字段数:', lp.perBlock[0] ? lp.perBlock[0].fieldCount : 0);
const names = lp.perBlock[0] ? lp.perBlock[0].fields.map((f) => f.name).join(' / ') : '';
console.log('字段:', names);
const hasRelationField = lp.perBlock[0] && lp.perBlock[0].fields.some((f) => f.type === 'relation');
console.log('含 relation 字段:', hasRelationField);

const doc = fs.readFileSync(REPO + '/docs/基准/基准-关联字段.md', 'utf8');
const claims = ['relation', 'pairProperty', 'collectionId', '8 个', '没有被改动'];
const miss = claims.filter((c) => !doc.includes(c));
console.log('文档缺失声明:', miss.length ? miss.join(',') : '无');

const ok = isRelation && pickedOk && lp.schemaBlocks === 1 && lp.perBlock[0].fieldCount === 8 && miss.length === 0;
console.log(ok ? 'relation 实测/8字段/文档声明 全部一致 OK' : '不一致 X');
process.exit(ok ? 0 : 1);
