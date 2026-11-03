// npm run apk / npm run release, on Windows too: npm runs scripts in cmd.exe there (no rm, cp, ./gradlew or $(...))
const { execFileSync } = require('child_process'), fs = require('fs'), path = require('path');
const win = process.platform === 'win32', android = path.join(__dirname, 'android');
// windows: gradlew.bat (and gh) only start through a shell; the arguments here need no quoting
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: win });

// a fresh checkout: gradle's settings name capacitor's projects, which aren't in git
if (!fs.existsSync(path.join(__dirname, 'node_modules'))) run('npm', ['ci'], __dirname);
if (!fs.existsSync(path.join(android, 'capacitor-cordova-android-plugins/cordova.variables.gradle'))) { // the file, not its folder: a failed sync leaves that half made
  // it wants both folders, and git keeps neither (all that's in them is ignored). www/ only needs an index.html: its copy is deleted below
  for (const dir of [path.join(__dirname, 'www'), path.join(android, 'app/src/main/assets')]) fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'index.html'), path.join(__dirname, 'www/index.html'));
  run('npx', ['cap', 'sync', 'android'], __dirname);
}
// nor is where the SDK is: its default place, unless told
const props = path.join(android, 'local.properties'), home = require('os').homedir();
const sdk = [path.join(home, 'Android/Sdk'), path.join(home, 'Library/Android/sdk'), path.join(process.env.LOCALAPPDATA || home, 'Android/Sdk')].find(fs.existsSync);
if (sdk && !process.env.ANDROID_HOME && !process.env.ANDROID_SDK_ROOT && !fs.existsSync(props)) fs.writeFileSync(props, `sdk.dir=${sdk.replace(/\\/g, '/')}\n`); // forward slashes: backslashes are escapes in a .properties file

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
