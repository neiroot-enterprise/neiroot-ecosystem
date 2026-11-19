const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');process.chdir(root);
const renderOnly = process.argv.includes('--render-only');
let inventory;
if (renderOnly) {
  inventory = JSON.parse(fs.readFileSync('docs/dependency-licenses.json', 'utf8'));
} else {
  const npm=[];
  for(const workspace of ['apps/web','tools/contracts','tools/diagrams']){
   const lock=JSON.parse(fs.readFileSync(`${workspace}/package-lock.json`));
   for(const [location,p] of Object.entries(lock.packages))if(location){npm.push({workspace,name:p.name||location.split('node_modules/').pop(),version:p.version,license:p.license||'SEE PACKAGE LICENSE',dev:!!p.dev,integrity:p.integrity})}
  }
  const goBinary=process.env.NEIROOT_GO||'go';
  const modules=[...new Set(cp.execFileSync(goBinary,['list','-deps','-test','-f','{{if .Module}}{{.Module.Path}}|{{.Module.Version}}|{{.Module.Dir}}{{end}}','./...'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(x=>x&&!x.startsWith('neiroot|')))];
  function identify(text){if(/Apache License|Apache Software License/.test(text))return 'Apache-2.0';if(/Permission is hereby granted, free of charge/.test(text))return 'MIT';if(/Neither the name|may be used to endorse/.test(text))return 'BSD-3-Clause';if(/Redistribution and use in source and binary forms/.test(text))return 'BSD-2-Clause';return 'SEE LICENSE'}
  const go=modules.map(line=>{const [name,version,dir]=line.split('|');const file=fs.readdirSync(dir).find(x=>/^LICENSE(\.txt|\.md)?$/i.test(x));const text=file?fs.readFileSync(path.join(dir,file),'utf8'):'';return {name,version,license:identify(text),licenseFile:file||null,source:`https://${name.replace(/\/v\d+$/,'')}`}});
  const runtime=[
   ['Go','1.27.1','BSD-3-Clause','https://go.dev/LICENSE'],['Node.js','24.14.1','MIT AND bundled third-party notices','https://github.com/nodejs/node/blob/v24.14.1/LICENSE'],['Keycloak','26.8.0','Apache-2.0','https://github.com/keycloak/keycloak/blob/26.8.0/LICENSE.txt'],['PostgreSQL','18.6','PostgreSQL','https://www.postgresql.org/about/licence/'],['Traefik','3.7.13','MIT','https://github.com/traefik/traefik/blob/v3.7.13/LICENSE.md'],['nginx','1.30.5','BSD-2-Clause','https://nginx.org/LICENSE'],['mkcert','1.4.4','BSD-3-Clause','https://github.com/FiloSottile/mkcert/blob/v1.4.4/LICENSE'],['Docker Desktop','4.93.0','Docker Subscription Service Agreement','https://www.docker.com/legal/docker-subscription-service-agreement/'],['oapi-codegen','2.8.0','Apache-2.0','https://github.com/oapi-codegen/oapi-codegen/blob/v2.8.0/LICENSE'],['Temurin test JDK','25.0.4.1+1','GPL-2.0-only WITH Classpath-exception-2.0','https://adoptium.net/about/']
  ].map(([name,version,license,source])=>({name,version,license,source}));
  inventory={schemaVersion:1,generatedAt:new Date().toISOString().slice(0,10),npm,go,runtime};
  fs.writeFileSync('docs/dependency-licenses.json',JSON.stringify(inventory,null,2)+'\n');
}
const {npm, go, runtime} = inventory;
// Direct dependencies are identified by their exact root location in each lockfile.
// Matching every installed package by name also selects nested transitive versions.
const directNpm = ['apps/web', 'tools/contracts', 'tools/diagrams'].flatMap(workspace => {
 const manifest = JSON.parse(fs.readFileSync(`${workspace}/package.json`, 'utf8'));
 const lock = JSON.parse(fs.readFileSync(`${workspace}/package-lock.json`, 'utf8'));
 return ['dependencies', 'devDependencies'].flatMap(kind =>
  Object.keys(manifest[kind] || {}).map(name => {
   const installed = lock.packages[`node_modules/${name}`];
   if (!installed) {
    throw new Error(`Missing direct dependency ${workspace}: ${name}`);
   }
   return {workspace, kind, name, version: installed.version, license: installed.license || 'SEE PACKAGE LICENSE'};
  })
 );
});
const directRows = directNpm.map(p => `| ${p.workspace} | ${p.kind} | ${p.name} | ${p.version} | ${p.license} |`).join('\n');
const rows=items=>items.map(p=>`| ${p.name} | ${p.version} | ${p.license} |`).join('\n');
fs.writeFileSync('docs/dependency-licenses.md',`# Версии и лицензии\n\nРеестр получен из package-lock.json и установленного Go module cache; полный граф с npm integrity — [dependency-licenses.json](dependency-licenses.json). Полное обновление: node scripts/update-license-inventory.cjs; NEIROOT_GO задаёт абсолютный путь к Go при необходимости. Пересборка этого Markdown по сохранённому JSON и прямым зависимостям lock-файлов: node scripts/update-license-inventory.cjs --render-only. Этот режим сохраняет JSON и дату сбора реестра (${inventory.generatedAt}).\n\n## Runtime и инструменты\n\n| Компонент | Версия | Лицензия |\n|---|---|---|\n${rows(runtime)}\n\nСсылки на первичные лицензии сохранены в JSON. Контейнерные ОС сохраняют собственные bundled notices: Debian bookworm, Alpine 3.23.4, UBI в Keycloak. Исходный логотип и референсы предоставлены пользователем, их лицензия не переносится на третьих лиц. Docker Desktop имеет собственные условия подписки; это отдельный продукт от open-source Engine.\n\n## Go-модули\n\n| Модуль | Версия | Лицензия |\n|---|---|---|\n${rows(go)}\n\n## Прямые npm-зависимости\n\nСтрока соответствует записи dependencies или devDependencies конкретного package.json и корневой записи установленного пакета в его lock-файле. Вложенные транзитивные версии остаются в JSON. dependencies — зависимости приложения или инструмента, devDependencies — зависимости его разработки.\n\n| Каталог | Раздел package.json | Пакет | Версия | Лицензия |\n|---|---|---|---|---|\n${directRows}\n\nВсе npm-транзитивные пакеты включены в JSON. Лицензии BSD/MIT/Apache допускают использование при сохранении соответствующих уведомлений. При распространении артефактов сохранять LICENSE/NOTICE зависимостей и runtime; локальный реестр не заменяет их текстов.\n`);
console.log(`License inventory: ${npm.length} npm entries, ${go.length} Go modules, ${runtime.length} runtimes/tools.`);
