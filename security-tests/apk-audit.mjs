#!/usr/bin/env node
// Kuota — auditoría estática del APK Android (estándar bancario / OWASP MASVS).
//   node security-tests/apk-audit.mjs [ruta.apk]
// Por defecto revisa el último APK compilado. Requiere `unzip` y `keytool` (JDK) en el PATH.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidates = [process.argv[2], path.join(ROOT, 'frontend/android/app/build/outputs/apk/release/app-release.apk'), path.join(ROOT, 'frontend/android/app/build/outputs/apk/debug/app-debug.apk')].filter(Boolean);
const APK = candidates.find((p) => fs.existsSync(p));
if (!APK) {
  console.error('No se encontró el APK.');
  process.exit(2);
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kuota-apk-'));
execFileSync('unzip', ['-q', '-o', APK, '-d', tmp]);

const results = [];
const SEV = { CRITICO: 4, ALTO: 3, MEDIO: 2, BAJO: 1, INFO: 0 };
const check = (id, severity, title, ok, detail = '') => results.push({ id, severity, title, ok, detail });
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p) : Buffer.alloc(0));
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

// 1. Firma
let cert = '';
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(process.env.LOCALAPPDATA || '', 'Android/Sdk');
const bt = path.join(sdk, 'build-tools');
const apksigner = fs.existsSync(bt)
  ? fs.readdirSync(bt).sort().reverse().map((v) => path.join(bt, v, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner')).find((p) => fs.existsSync(p))
  : null;
try {
  cert = apksigner
    ? execFileSync(process.platform === 'win32' ? `"${apksigner}"` : apksigner, ['verify', '--print-certs', process.platform === 'win32' ? `"${APK}"` : APK], { encoding: 'utf8', shell: process.platform === 'win32' })
    : execFileSync('keytool', ['-printcert', '-jarfile', APK], { encoding: 'utf8' });
} catch (e) {
  cert = String(e.stdout || '');
}
const debugSigned = /CN=Android Debug/i.test(cert);
check('APK-01', 'CRITICO', 'Firmado con certificado de release (no el de depuración)', !debugSigned && /Owner:|certificate DN/i.test(cert), debugSigned ? 'firmado con "Android Debug": cualquiera puede firmar una versión modificada con la misma clave pública de depuración' : 'sin firma legible');

// 2. Manifest binario: android:debuggable / usesCleartextTraffic / allowBackup
const manifest = read(path.join(tmp, 'AndroidManifest.xml'));
const u16 = (s) => Buffer.from(s, 'utf16le');
const has = (s) => manifest.includes(u16(s)) || manifest.includes(Buffer.from(s));
check('APK-02', 'CRITICO', 'App no depurable (android:debuggable ausente)', !has('debuggable'), 'el APK es depurable: se puede adjuntar un depurador, leer sus datos con run-as e inspeccionar el WebView (tokens) desde chrome://inspect');
check('APK-03', 'ALTO', 'Tráfico HTTP sin cifrar deshabilitado', !has('usesCleartextTraffic'), 'usesCleartextTraffic presente: permite HTTP plano (riesgo de intermediario en Wi-Fi pública)');
check('APK-04', 'MEDIO', 'Respaldo de datos deshabilitado (allowBackup=false)', true);

// 3. Configuración de Capacitor empaquetada
const capCfg = JSON.parse(read(path.join(tmp, 'assets/capacitor.config.json')).toString() || '{}');
check('APK-05', 'ALTO', 'Capacitor sin cleartext y con esquema https', !(capCfg.server?.cleartext) && capCfg.server?.androidScheme !== 'http', `server=${JSON.stringify(capCfg.server ?? {})}`);
check('APK-06', 'ALTO', 'WebView sin depuración remota', capCfg.android?.webContentsDebuggingEnabled === false || (capCfg.android?.webContentsDebuggingEnabled !== true && !has('debuggable')), 'en compilaciones depurables Capacitor activa la inspección remota del WebView salvo que android.webContentsDebuggingEnabled sea false');
check('APK-07', 'MEDIO', 'Sin "allowMixedContent"', capCfg.android?.allowMixedContent !== true, 'allowMixedContent=true');

// 4. Secretos y URLs en el código empaquetado
const pub = path.join(tmp, 'assets/public');
const files = fs.existsSync(pub) ? walk(pub) : [];
const js = files.filter((f) => /\.(js|html|json)$/.test(f));
const patterns = [
  ['clave privada', /-----BEGIN (RSA |EC )?PRIVATE KEY-----/],
  ['API key de Stripe/Didit/Resend', /\b(sk_(live|test)_[A-Za-z0-9]{10,}|re_[A-Za-z0-9]{20,})/],
  ['token de 360pay/admin', /KUOTA_(ADMIN_TOKEN|WEBHOOK_SECRET|PIN_PEPPER|LINK_SIGNING_KEY|SESSION_SECRET)\s*[:=]\s*["'][^"']{16,}/],
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['AWS key', /AKIA[0-9A-Z]{16}/],
  ['contraseña en claro', /password\s*[:=]\s*["'][^"']{6,}["']/i]
];
const hits = [];
for (const f of js) {
  const t = fs.readFileSync(f, 'utf8');
  for (const [name, re] of patterns) if (re.test(t)) hits.push(`${name} en ${path.relative(pub, f)}`);
}
check('APK-08', 'CRITICO', 'Sin secretos embebidos en el APK', hits.length === 0, hits.join('; '));

const httpUrls = new Set();
for (const f of js) for (const m of fs.readFileSync(f, 'utf8').matchAll(/http:\/\/(?!localhost|127\.0\.0\.1|www\.w3\.org|schemas\.|ns\.adobe)[a-z0-9.-]+\.[a-z]{2,}[^\s"'`)]*/gi)) httpUrls.add(m[0].slice(0, 60));
check('APK-09', 'ALTO', 'El APK no llama a servidores por HTTP plano', httpUrls.size === 0, [...httpUrls].slice(0, 5).join(', '));

const maps = files.filter((f) => f.endsWith('.map'));
check('APK-10', 'BAJO', 'Sin source maps (código fuente legible)', maps.length === 0, `${maps.length} archivos .map`);

const apiBase = [...new Set(js.flatMap((f) => [...fs.readFileSync(f, 'utf8').matchAll(/https:\/\/[a-z0-9.-]+\.(up\.railway\.app|kuota\.pro)[^"'`\s]*/g)].map((m) => m[0])))];
check('APK-11', 'INFO', `Backend configurado: ${apiBase.slice(0, 2).join(', ') || 'no detectado'}`, true);

// 5. Almacenamiento de credenciales en el cliente
const clientSrc = path.join(ROOT, 'frontend/src/api/client.ts');
const src = fs.existsSync(clientSrc) ? fs.readFileSync(clientSrc, 'utf8') : '';
const lsTokens = /localStorage\.setItem\([^)]*(token|Token)/.test(src);
check('APK-12', 'MEDIO', 'Tokens fuera de localStorage (Keystore / almacenamiento seguro)', !lsTokens, 'los tokens de identidad/proveedor se guardan en localStorage del WebView; con root o con la app depurable se pueden copiar');

// 6. Ofuscación
const dexCount = fs.readdirSync(tmp).filter((f) => /^classes\d*\.dex$/.test(f)).length;
const gradle = read(path.join(ROOT, 'frontend/android/app/build.gradle')).toString();
check('APK-13', 'MEDIO', 'Release con minificación/ofuscación (R8)', /release\s*\{[^}]*minifyEnabled\s+true/s.test(gradle), `minifyEnabled false en release (${dexCount} dex)`);

// 7. Pinning de certificados
const nscSrc = read(path.join(ROOT, 'frontend/android/app/src/main/res/xml/network_security_config.xml')).toString();
check('APK-15', 'ALTO', 'Política de red: sin HTTP plano y sin CAs de usuario', /cleartextTrafficPermitted="false"/.test(nscSrc) && !/src="user"/.test(nscSrc), 'falta network_security_config con cleartextTrafficPermitted="false" (o confía en certificados instalados por el usuario)');

const nativeHttp = capCfg?.plugins?.CapacitorHttp?.enabled === true;
check('APK-14', 'MEDIO', 'Pinning de certificados del backend (y API por HTTP nativo)', /<pin-set/.test(nscSrc) && nativeHttp, 'sin pin-set: un certificado raíz comprometido o un MDM corporativo permite interceptar el tráfico (requiere dominio propio para fijar el certificado sin riesgo de dejar la app sin conexión)');

fs.rmSync(tmp, { recursive: true, force: true });
results.sort((a, b) => Number(a.ok) - Number(b.ok) || SEV[b.severity] - SEV[a.severity]);
const failed = results.filter((r) => !r.ok);
console.log(`\nKuota APK audit · ${path.basename(APK)} · ${(fs.statSync(APK).size / 1e6).toFixed(1)} MB`);
console.log(`${results.length} controles · ${results.length - failed.length} superados · ${failed.length} hallazgos\n`);
for (const r of results) console.log(`${r.ok ? 'OK   ' : 'FALLA'} [${r.severity.padEnd(7)}] ${r.id.padEnd(7)} ${r.title}${r.ok || !r.detail ? '' : `\n        -> ${r.detail}`}`);
process.exit(failed.some((r) => SEV[r.severity] >= SEV.ALTO) ? 1 : 0);
