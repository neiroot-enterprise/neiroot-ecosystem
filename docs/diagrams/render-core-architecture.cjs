const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const req = createRequire(path.join(path.resolve(process.argv[2]), 'package.json'));
const { instance } = req('@viz-js/viz');
const sharp = req('sharp');
const model = JSON.parse(fs.readFileSync(path.join(__dirname, 'core-architecture.json'), 'utf8'));
const esc = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const q = JSON.stringify;
const nodes = [];
const edges = [];
function node(id, stereotype, name, stack, purpose) {
  const groups = [[`«${stereotype}»`, name], stack, purpose].filter(Boolean);
  const heights = groups.map((g, i) => i === 0 ? 78 : 30 + 24 * g.length);
  const rows = groups.map((lines, i) => `<TR><TD WIDTH="328" FIXEDSIZE="TRUE" CELLPADDING="12" HEIGHT="${heights[i]}" ALIGN="${i ? 'LEFT' : 'CENTER'}"${i === 1 ? ' BORDER="1" SIDES="TB"' : ''}>${lines.map((s, j) => i === 0 && j === 1 ? `<B>${esc(s)}</B>` : esc(s)).join(i ? '<BR ALIGN="LEFT"/>' : '<BR/>')}${i ? '<BR ALIGN="LEFT"/>' : ''}</TD></TR>`).join('');
  nodes.push({ id, stereotype, name, stack, purpose });
  return `${id} [label=<<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="0" WIDTH="330" HEIGHT="${heights.reduce((a,b) => a+b, 2)}" FIXEDSIZE="TRUE" COLOR="#28568c" BGCOLOR="#1b2a3e">${rows}</TABLE>>];`;
}
function edge(a, b, label, type = 'dependency') {
  edges.push({ a, b, label, type });
  const style = type === 'composition' ? ', dir=both, arrowtail=diamond, arrowhead=none' : type === 'dependency' ? ', style=dashed' : '';
  return `${a} -> ${b} [xlabel=${q(label)}${style}];`;
}
const external = node('Gateway', 'component', 'API Gateway / Web BFF', ['Go / chi', 'Traefik', 'REST / SSE'], ['Вход из веб-интерфейса', 'Запросы к ядру']);
const data = [
  node('Database', 'database', 'База ядра', ['PostgreSQL core', 'money / company / sales / settings'], ['Схемы принадлежат модулям', 'Изоляция по tenant_id']),
  node('Events', 'component', 'Брокер событий', ['NATS JetStream'], ['События через Outbox', 'Интеграция микросервисов']),
  node('Files', 'component', 'Файловое хранилище', ['S3 API'], ['Документы и файлы', 'Изоляция по tenant_id'])
].join('\n');
const modules = model.modules.map(m => node(m.id, 'module', m.name, m.stack, m.purpose)).join('\n');
const sections = model.modules.map(m => node(m.id+'Sections', 'sections', 'Разделы: '+m.name, m.sections)).join('\n');
const moduleIds = model.modules.map(m => m.id);
const sectionsIds = moduleIds.map(id => id+'Sections');
const dot = `digraph Core {
graph [rankdir=TB, bgcolor="#171717", pad=0.4, nodesep=1.1, ranksep=0.9, splines=ortho, outputorder=edgesfirst, fontname="Arial", fontsize=18, fontcolor="#f2f4f6", compound=true];
node [shape=plain, fontname="Arial", fontsize=16, fontcolor="#f2f4f6"];
edge [color="#bac3d0", fontname="Arial", fontsize=12, fontcolor="#bac3d0", arrowsize=0.65];
${external}
subgraph cluster_core {
label="«microservice» Ядро приложения\nGo · модульный монолит · tenant_id"; labeljust=l;
color="#28568c"; bgcolor="#111c2b"; margin=30;
${node('HTTP', 'adapter', 'HTTP API ядра', ['Go / chi / net/http'], ['Проверка токена и tenant', 'Вызов сценариев модулей'])}
${modules}
${sections}
{rank=same; ${moduleIds.join('; ')};}
{rank=same; ${sectionsIds.join('; ')};}
${moduleIds.join(' -> ')} [style=invis, weight=100];
${sectionsIds.join(' -> ')} [style=invis, weight=100];
subgraph cluster_pattern {
label="«package» Шаблон каждого модуля\nClean Architecture · порты и адаптеры"; labeljust=l;
color="#60758d"; bgcolor="#142033"; margin=25;
${node('Incoming', 'adapter', 'Входные адаптеры', ['Go / chi', 'HTTP или внутренний API'], ['Принимают запросы', 'Вызывают входные порты'])}
${node('Application', 'application', 'Сценарии и порты', ['Go / интерфейсы'], ['Выполнение операций', 'Входные и выходные порты'])}
${node('Outgoing', 'adapter', 'Выходные адаптеры', ['Go', 'PostgreSQL / S3 / NATS'], ['Реализуют выходные порты', 'Работают с инфраструктурой'])}
${node('Domain', 'domain', 'Домен модуля', ['Go / без инфраструктуры'], ['Сущности и правила бизнеса', 'Проверка инвариантов'])}
{rank=same; Incoming; Application; Outgoing;}
${edge('Incoming', 'Application', 'Вызов порта')}
${edge('Outgoing', 'Application', 'Реализация')}
${edge('Application', 'Domain', 'Зависимость кода')}
}
}
${data}
{rank=same; Database; Events; Files;}
${edge('Gateway','HTTP','','flow')}
${model.modules.map(m => edge('HTTP',m.id,'Внутренний API','flow')).join('\n')}
${model.modules.map(m => edge(m.id,m.id+'Sections','Состав разделов','composition')).join('\n')}
${sectionsIds.map(id => `${id} -> Incoming [style=invis];`).join('\n')}
${edge('Outgoing','Database','Чтение / запись','flow')}
${edge('Outgoing','Events','Outbox / события','flow')}
${edge('Outgoing','Files','Файлы по потребности','flow')}
Domain -> Database [style=invis, minlen=1];
}`;
const puml = `@startuml core_architecture
skinparam shadowing false
skinparam classAttributeIconSize 0
skinparam linetype ortho
hide circle
top to bottom direction
title Ядро приложения — архитектура v${model.version}
` + nodes.filter(n => ['Gateway','Database','Events','Files'].includes(n.id)).map(n => uml(n)).join('\n') + '\npackage "Ядро приложения / модульный монолит / Go" <<microservice>> {\n' + nodes.filter(n => !['Gateway','Database','Events','Files'].includes(n.id)).map(n => uml(n)).join('\n') + '\n}\n' + edges.map(e => `${e.a} ${e.type === 'composition' ? '*--' : e.type === 'dependency' ? '..>' : '-->'} ${e.b} : ${e.label}`).join('\n') + '\nnote "Шаблон Clean Architecture и портов/адаптеров применяется отдельно внутри каждого модуля.\nРазделы — части модулей, не отдельные сервисы.\nTenant = клиент платформы; предприятие = бизнес; организация = юрлицо." as ArchitectureNote\n@enduml\n';
function uml(n) { return `class "${n.name}" as ${n.id} <<${n.stereotype}>> {\n${n.stack.map(s=>'  '+s).join('\n')}\n${n.purpose ? '  --\n'+n.purpose.map(s=>'  '+s).join('\n')+'\n' : ''}}`; }
(async () => {
  const viz = await instance();
  const result = viz.render(dot, { format:'svg', engine:'dot' });
  if (result.status !== 'success') throw new Error(JSON.stringify(result.errors));
  const warnings = result.errors.filter(e => e.level === 'warning' && !e.message.includes('no value for width of non-ASCII character'));
  if (warnings.length) throw new Error(JSON.stringify(warnings));
  for (const [extension, content] of [['json', null], ['dot', dot], ['puml', puml], ['svg', result.output]]) {
    if (content) fs.writeFileSync(path.join(__dirname, 'core-architecture.'+extension), content, 'utf8');
  }
  const png = await sharp(Buffer.from(result.output), { density:96, limitInputPixels:false }).png().toBuffer();
  fs.writeFileSync(path.join(__dirname, 'core-architecture.png'), png);
  console.log(JSON.stringify({version:model.version,modules:model.modules.length,nodes:nodes.length,edges:edges.length,warnings}));
})().catch(e => {console.error(e);process.exitCode=1;});
