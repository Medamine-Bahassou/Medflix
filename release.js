// npm run apk / npm run release, on Windows too: npm runs scripts in cmd.exe there (no rm, cp, ./gradlew or $(...))
const { execFileSync } = require('child_process'), fs = require('fs'), path = require('path');
const win = process.platform === 'win32', android = path.join(__dirname, 'android');
// windows: gradlew.bat (and gh) only start through a shell; the arguments here need no quoting
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: win });

fs.rmSync(path.join(android, 'app/src/main/assets/public'), { recursive: true, force: true }); // the old web app's copy, no longer shipped
// by full path: cmd may not look in the current folder (NoDefaultCurrentDirectoryInExePath); quoted for spaces in it
const gradlew = path.join(android, win ? 'gradlew.bat' : 'gradlew');
run(win ? `"${gradlew}"` : gradlew, ['assembleDebug'], android);
fs.copyFileSync(path.join(android, 'app/build/outputs/apk/debug/app-debug.apk'), path.join(__dirname, 'MEDFLIX.apk'));
console.log('MEDFLIX.apk');

if (process.argv[2] === 'release') { // tagged with the build's stamp (BuildConfig.BUILD), which the update check compares
  const tag = 'b' + fs.readFileSync(path.join(android, 'app/build/build-stamp.txt'), 'utf8').trim();
  run('gh', ['release', 'create', tag, 'MEDFLIX.apk', '--title', tag, '--generate-notes'], __dirname);
}
