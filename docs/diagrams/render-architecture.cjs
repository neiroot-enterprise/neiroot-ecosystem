const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const dependencyDir = process.argv[2];
const depRequire = dependencyDir ? createRequire(path.join(path.resolve(dependencyDir), 'package.json')) : require;
const {instance} = depRequire('@viz-js/viz');
const sharp = depRequire('sharp');
const model = JSON.parse(fs.readFileSync(path.join(__dirname, 'architecture.json'), 'utf8'));
const escape = s => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const q = s => JSON.stringify(s);
const br = lines => lines.map(escape).join('<BR ALIGN="LEFT"/>');
const colors = {background:'#171717',surface:'#1b2a3e',border:'#28568c',text:'#f2f4f6',edge:'#bac3d0'};
const rows = node => {
  const headerHeight=78, stackHeight=30+node.stack.length*24, purposeHeight=30+node.purpose.length*24;
  const h=headerHeight+stackHeight+purposeHeight+2;
  const common=' WIDTH="'+(model.width-2)+'" FIXEDSIZE="TRUE" CELLPADDING="12"';
  return '<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="0" WIDTH="'+model.width+'" HEIGHT="'+h+'" FIXEDSIZE="TRUE" COLOR="'+colors.border+'" BGCOLOR="'+colors.surface+'">'
    +'<TR><TD'+common+' HEIGHT="'+headerHeight+'" ALIGN="CENTER"><FONT POINT-SIZE="13">«'+escape(node.st)+'»</FONT><BR/><B>'+escape(node.name)+'</B></TD></TR>'
    +'<TR><TD'+common+' HEIGHT="'+stackHeight+'" BORDER="1" SIDES="TB" ALIGN="LEFT">'+br(node.stack)+'</TD></TR>'
    +'<TR><TD'+common+' HEIGHT="'+purposeHeight+'" ALIGN="LEFT">'+br(node.purpose)+'</TD></TR>'
    +'</TABLE>';
};
const dot = 'digraph SaaS {\n'
  +'graph [rankdir=TB, bgcolor="'+colors.background+'", pad=0.4, nodesep=0.65, ranksep=1.1, splines=ortho, outputorder=edgesfirst, fontname="Arial", fontsize=16, fontcolor="'+colors.text+'"];\n'
  +'node [shape=plain, margin=0, fontname="Arial", fontsize=16, fontcolor="'+colors.text+'"];\n'
  +'edge [color="'+colors.edge+'", fontname="Arial", fontsize=12, fontcolor="'+colors.edge+'", arrowsize=0.65];\n'
  +model.nodes.map(n=>n.id+' [label=<'+rows(n)+'>];').join('\n')+'\n'
  +'{rank=min; Web; Monitoring;}\n'
  +'{rank=same; Auth; Core; Sales; Marketer; Secretary; Analyst;}\n'
  +'{rank=same; Cache; Files; Logistics; CRM; Investments; Rental; LLM;}\n'
  +'Auth -> Core -> Sales -> Marketer -> Secretary -> Analyst [style=invis, weight=100];\n'
  +'Cache -> Files -> Logistics -> CRM -> Investments -> Rental -> LLM [style=invis, weight=100];\n'
  +'{rank=same; Analytics; Backup;}\n'
  +model.edges.map(([a,b,label,dashed])=>a+' -> '+b+' [xlabel='+q(label)+(dashed?', style=dashed':'')+(a==='Monitoring'?', constraint=false':'')+'];').join('\n')+'\n'
  +'}\n';
const puml = '@startuml saas_architecture\n'
  +'skinparam shadowing false\nskinparam classAttributeIconSize 0\nskinparam linetype ortho\nhide circle\n'
  +'top to bottom direction\ntitle Neiroot Enterprise v1 — архитектура SaaS v'+model.version+'\n\n'
  +model.nodes.map(n=>'class "'+n.name+'" as '+n.id+' <<'+n.st+'>> {\n'
    +n.stack.map(s=>'  '+s).join('\n')+'\n  --\n'
    +n.purpose.map(s=>'  '+s).join('\n')+'\n}').join('\n\n')+'\n\n'
  +model.edges.map(([a,b,label,dashed])=>a+' '+(dashed?'..>':'-->')+' '+b+' : '+label).join('\n')
  +'\n\nlegend bottom\nТехнологии предложены. Ширина блоков в SVG: '+model.width+' pt.\n'
  +'Микросервис → модульный монолит → модули с Clean Architecture и портами/адаптерами.\n'
  +'Мониторинг и резервные копии охватывают всю платформу.\nendlegend\n@enduml\n';
(async()=>{
  const viz=await instance();
  const result=viz.render(dot,{format:'svg',engine:'dot'});
  if(result.status!=='success') throw new Error(JSON.stringify(result.errors));
  const warnings=result.errors.filter(e=>e.level==='warning' && !e.message.includes('no value for width of non-ASCII character'));
  if(warnings.length) throw new Error('Layout warnings: '+JSON.stringify(warnings));
  fs.writeFileSync(path.join(__dirname,'architecture.dot'),dot,'utf8');
  fs.writeFileSync(path.join(__dirname,'architecture.puml'),puml,'utf8');
  fs.writeFileSync(path.join(__dirname,'architecture.svg'),result.output,'utf8');
  await sharp(Buffer.from(result.output),{density:96,limitInputPixels:false}).png().toFile(path.join(__dirname,'architecture.png'));
  const metadata=await sharp(path.join(__dirname,'architecture.png')).metadata();
  console.log(JSON.stringify({version:model.version,nodes:model.nodes.length,edges:model.edges.length,nodeWidth:model.width,png:{width:metadata.width,height:metadata.height},warnings}));
})().catch(e=>{console.error(e.message);process.exit(1);});
