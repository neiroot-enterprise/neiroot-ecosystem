'use strict';

// Portable document initializer. OS-specific launchers are private, not generated here.
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

const legacyLaunchers = [
  'start-local', 'setup-local', 'configure-keycloak', 'install-prerequisites',
  'install-wsl-admin', 'install-test-runtime', 'start-test-runtime',
  'stop-test-runtime', 'stop-test-keycloak',
].map(name => `scripts/${name}.ps1`);

function prepareLocal(root, platform = process.platform, arch = process.arch) {
  if (!/^[a-z0-9_-]+$/.test(platform)) throw new Error('Invalid operating system identifier.');
  root = fs.realpathSync(root);
  const git = args => execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const gitRoot = fs.realpathSync(git(['rev-parse', '--show-toplevel']).trim());
  if (gitRoot !== root) throw new Error('Run preparation in the project repository root.');
  const tracked = git(['ls-files', '-z', '--', '.local', '.env', ...legacyLaunchers]);
  if (tracked) throw new Error('Personal environment files are tracked by Git. Remove them from the index without deleting disk files before preparation.');

  const docs = {
    '.local/README.md': '# Персональная рабочая область\n\nЭтот каталог игнорируется Git. Документы: Agent.md, docs/development.md и docs/test-report.md. Новые OS-specific помощники создаются в .local/scripts/<os>/. Не публиковать секреты и не применять git add -f.\n',
    '.local/Agent.md': `# Состояние машины\n\nОС: ${platform}; архитектура: ${arch}.\nСреда ещё не проверена. Записывать здесь только факты этой машины; общие требования хранятся в публичных docs. Не копировать секреты.\n`,
    '.local/docs/development.md': '# Подготовка и команды машины\n\nГотовый запуск для этой ОС ещё не подтверждён. Агент должен изучить общий Compose/Dockerfile, .env.example и шаблоны Keycloak, затем создать OS-specific помощники в .local/scripts/<os>/.\n\nСохранить существующие .env и данные. Не сбрасывать БД/volumes и не перезагружать компьютер автоматически. Для отсутствующей среды подготовить случайные секреты, доверенный HTTPS-сертификат, SQL ролей/баз и realm, применить миграции, проверить readiness и профиль Keycloak. Проверку TLS не отключать.\n\nФактические команды запуска, остановки и диагностики дописывать только сюда после проверки.\n',
    '.local/docs/test-report.md': '# Проверки машины\n\nПроверки этой среды пока не выполнены. Записывать команды, результаты и ограничения без секретов. Build/health не равны полной бизнес-приёмке; нативная проверка не равна контейнерной.\n',
  };
  const paths = Object.keys(docs);
  const ignored = new Set(git(['check-ignore', '--no-index', '--', ...paths, ...legacyLaunchers]).split(/\r?\n/).filter(Boolean));
  if ([...paths, ...legacyLaunchers].some(file => !ignored.has(file))) {
    throw new Error('Missing .gitignore coverage for personal environment files. No documents were written.');
  }

  function ensurePrivateDirectory(directory) {
    fs.mkdirSync(directory, {recursive: true});
    const relative = path.relative(root, fs.realpathSync(directory));
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error('Personal workspace resolves outside the repository.');
    }
  }
  // Check each existing ancestor before creating children beneath it.
  for (const relative of ['.local', '.local/docs', `.local/scripts`, `.local/scripts/${platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : platform}`]) {
    ensurePrivateDirectory(path.join(root, relative));
  }
  const created = [];
  for (const [relative, content] of Object.entries(docs)) {
    try {
      fs.writeFileSync(path.join(root, relative), content, {encoding: 'utf8', flag: 'wx'});
      created.push(relative);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  return created;
}

if (require.main === module) {
  try {
    const created = prepareLocal(path.resolve(__dirname, '..'));
    console.log(`Personal documents ready; ${created.length} created, existing files preserved.`);
  } catch (error) {
    console.error(`Personal workspace preparation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
module.exports = {prepareLocal, legacyLaunchers};
