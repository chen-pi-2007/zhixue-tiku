# -*- coding: utf-8 -*-
# 智学题库 · 作者：十三（xiabanghao13）、chen_pi（chen-pi-2007）
# https://github.com/chen-pi-2007/zhixue-tiku  © 2026 十三、chen_pi，保留所有权利。
"""打包安卓 App（不用 Gradle，直接调 Android SDK 的 aapt2 / d8 / apksigner）。

    python mobile/build_apk.py        生成 _build/mobile/zhixue-tiku.apk（中间文件在 %TEMP%\zhixue-apk）

需要：JDK 17、Android SDK（build-tools 34.0.0、platforms;android-34），默认在 D:\\tool 下，
可用环境变量 JAVA_HOME、ANDROID_HOME 改。
签名证书在 D:\\tool\\android-keys\\zhixue.jks（密码在同目录 pass.txt），备份在私有仓库
chen-pi-2007/zhixue-android-key。**证书不能丢、不能换**：安卓只允许同一个证书签名的新版覆盖安装，
换了证书用户只能卸载重装，做题记录就没了。所以找不到证书时脚本会停下，不会自己生成新的
（真要换证书，加 --new-key）。

App 里打包的内容（assets/www）：static/ 的界面 + mobile/local.js（本地后端）+ 题库 bank.json、media/，
再加一份内容清单 content.json（热更新时比对用）。技能实操和导入试卷需要电脑，手机版不放。
static/index.html 发现有 ZXStore（在 App 里）时会自己加载 local.js、隐藏电脑才有的入口，所以不用改它。"""
import glob
import os
import tempfile
import secrets
import shutil
import subprocess
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DIST = os.path.join(ROOT, '_build', 'mobile')
# aapt2 不认中文路径（项目在“桌面”下），中间文件放到纯英文的临时目录
OUT = os.path.join(tempfile.gettempdir(), 'zhixue-apk')
sys.path.insert(0, ROOT)
import content                                     # noqa: E402
from version import APP_VERSION, CONTENT_VERSION, CONTENT_MIN_APP, CONTENT_MIN_ANDROID     # noqa: E402

JAVA_HOME = os.environ.get('JAVA_HOME_17') or next(iter(sorted(glob.glob(r'D:\tool\jdk17\jdk-17*'))), '')
SDK = os.environ.get('ANDROID_HOME') or r'D:\tool\android-sdk'
BT = os.path.join(SDK, 'build-tools', '34.0.0')
ANDROID_JAR = os.path.join(SDK, 'platforms', 'android-34', 'android.jar')
KEY_DIR = r'D:\tool\android-keys'
KEYSTORE = os.path.join(KEY_DIR, 'zhixue.jks')
ALIAS = 'zhixue'


def run(*cmd, **kw):
    shown = ['***' if (i and (cmd[i - 1] in ('-storepass', '-keypass') or c.startswith('pass:'))) else c
             for i, c in enumerate(cmd)]                    # 日志里不打印证书密码
    print('  $', ' '.join(os.path.basename(c) if i == 0 else c for i, c in enumerate(shown))[:200])
    env = dict(os.environ, JAVA_HOME=JAVA_HOME, PATH=os.path.join(JAVA_HOME, 'bin') + os.pathsep + os.environ['PATH'])
    subprocess.run(list(cmd), check=True, env=env, **kw)


def version_code(v):
    a, b, c = (int(x) for x in (v.split('.') + ['0', '0'])[:3])
    return a * 10000 + b * 100 + c


def stage_assets():
    """assets/www：界面 + 本地后端 + 题库 + 内容清单（路径换算和 local.js 的 wwwPath 一致）"""
    www = os.path.join(OUT, 'assets', 'www')
    shutil.rmtree(os.path.join(OUT, 'assets'), ignore_errors=True)
    shutil.copytree(os.path.join(ROOT, 'static'), www)
    shutil.copy(os.path.join(HERE, 'local.js'), www)
    shutil.copy(os.path.join(ROOT, 'data', 'bank.json'), www)
    shutil.copytree(os.path.join(ROOT, 'data', 'media'), os.path.join(www, 'media'))
    # 清单和电脑版、仓库里发布的是同一种（按仓库路径记录，含技能卷文件；手机只用得到其中一部分）
    m = content.build_manifest(ROOT, CONTENT_VERSION, CONTENT_MIN_APP, CONTENT_MIN_ANDROID)
    content.write_manifest(os.path.join(www, content.CONTENT_FILE), m)
    return os.path.join(OUT, 'assets')


def ensure_key():
    os.makedirs(KEY_DIR, exist_ok=True)
    pw_file = os.path.join(KEY_DIR, 'pass.txt')
    if not os.path.exists(KEYSTORE):
        if '--new-key' not in sys.argv:
            sys.exit('找不到签名证书 %s。\n先从私有仓库恢复：gh repo clone chen-pi-2007/zhixue-android-key %s\n'
                     '（真的要换新证书才加 --new-key：已经装了 App 的人得卸载重装，记录会丢）' % (KEYSTORE, KEY_DIR))
        pw = secrets.token_urlsafe(18)
        open(pw_file, 'w').write(pw)
        run(os.path.join(JAVA_HOME, 'bin', 'keytool.exe'), '-genkeypair', '-keystore', KEYSTORE, '-alias', ALIAS,
            '-keyalg', 'RSA', '-keysize', '2048', '-validity', '36500', '-storepass', pw, '-keypass', pw,
            '-dname', 'CN=zhixue-tiku')
    return open(pw_file).read().strip()


# 证书轮换：2026-10-06 第一批安装包用的是旧证书（CN=zhixue-tiku），10-07 换成了 CN=chen_pi。
# 为了让装着旧证书版本的人也能直接覆盖升级（不卸载、不丢记录），签名时同时用两个证书，
# 再附上 lineage.bin（旧证书签字“把身份交给新证书”的证明，APK Signature Scheme v3）：
#   - 安卓 9 及以上认 v3：看到的是新证书 + 证明，旧证书、新证书装的版本都能覆盖升级
#   - 安卓 7、8 只认 v1/v2：看到的是旧证书，旧证书装的版本照常覆盖升级
# 以后每次打包都要这样签，旧证书和 lineage.bin 跟新证书一样不能丢（都在私有仓库里）。
OLD_KEYSTORE = os.path.join(KEY_DIR, 'old', 'zhixue-2026-10-06-CN-zhixue-tiku.jks')
OLD_PASS = os.path.join(KEY_DIR, 'old', 'pass-2026-10-06.txt')
LINEAGE = os.path.join(KEY_DIR, 'lineage.bin')


def sign_args(pw):
    new = ['--ks', KEYSTORE, '--ks-key-alias', ALIAS, '--ks-pass', 'pass:' + pw, '--key-pass', 'pass:' + pw]
    if '--old-key-only' in sys.argv:          # 只给测试用：模拟第一批旧证书安装包
        op = open(OLD_PASS).read().strip()
        return ['--ks', OLD_KEYSTORE, '--ks-key-alias', ALIAS, '--ks-pass', 'pass:' + op, '--key-pass', 'pass:' + op]
    if not (os.path.exists(OLD_KEYSTORE) and os.path.exists(LINEAGE)):
        sys.exit('找不到旧证书或 lineage.bin（%s）。它们也在私有仓库 chen-pi-2007/zhixue-android-key 里，'
                 '先恢复再打包，否则装着旧证书版本的人没法覆盖升级' % KEY_DIR)
    op = open(OLD_PASS).read().strip()
    return ['--ks', OLD_KEYSTORE, '--ks-key-alias', ALIAS, '--ks-pass', 'pass:' + op, '--key-pass', 'pass:' + op,
            '--next-signer'] + new + ['--lineage', LINEAGE, '--rotation-min-sdk-version', '28']


def main():
    for p in (JAVA_HOME, BT, ANDROID_JAR):
        if not p or not os.path.exists(p):
            sys.exit('缺少打包工具：%s（见本文件开头的说明）' % p)
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT)
    assets = stage_assets()
    android = os.path.join(OUT, 'android')
    shutil.copytree(os.path.join(HERE, 'android'), android)
    # 1. 资源（图标、主题）
    res_zip = os.path.join(OUT, 'res.zip')
    run(os.path.join(BT, 'aapt2.exe'), 'compile', '--dir', os.path.join(android, 'res'), '-o', res_zip)
    unsigned = os.path.join(OUT, 'unsigned.apk')
    run(os.path.join(BT, 'aapt2.exe'), 'link', '-o', unsigned, '-I', ANDROID_JAR,
        '--manifest', os.path.join(android, 'AndroidManifest.xml'), '-A', assets,
        '--min-sdk-version', '24', '--target-sdk-version', '34',
        '--version-code', str(version_code(APP_VERSION)), '--version-name', APP_VERSION,
        '--java', os.path.join(OUT, 'gen'), res_zip)
    # 2. 代码
    classes = os.path.join(OUT, 'classes')
    os.makedirs(classes)
    srcs = glob.glob(os.path.join(android, 'src', '**', '*.java'), recursive=True) + \
        glob.glob(os.path.join(OUT, 'gen', '**', '*.java'), recursive=True)
    run(os.path.join(JAVA_HOME, 'bin', 'javac.exe'), '-encoding', 'utf-8', '--release', '8',
        '-classpath', ANDROID_JAR, '-d', classes, *srcs)
    dex_dir = os.path.join(OUT, 'dex')
    os.makedirs(dex_dir)
    class_files = glob.glob(os.path.join(classes, '**', '*.class'), recursive=True)
    run(os.path.join(BT, 'd8.bat'), '--release', '--min-api', '24', '--lib', ANDROID_JAR, '--output', dex_dir, *class_files)
    # 重写整个压缩包加入 classes.dex（直接追加会让本地头和目录对不上）；
    # 保留 aapt2 定的压缩方式，resources.arsc 必须不压缩（Android 11+ 要求）
    with_dex = os.path.join(OUT, 'with-dex.apk')
    with zipfile.ZipFile(unsigned) as zin, zipfile.ZipFile(with_dex, 'w') as zout:
        for info in zin.infolist():
            zout.writestr(info, zin.read(info.filename), compress_type=info.compress_type)
        zout.write(os.path.join(dex_dir, 'classes.dex'), 'classes.dex', compress_type=zipfile.ZIP_DEFLATED)
    unsigned = with_dex
    # 3. 对齐 + 签名
    aligned = os.path.join(OUT, 'aligned.apk')
    run(os.path.join(BT, 'zipalign.exe'), '-f', '-p', '4', unsigned, aligned)
    pw = ensure_key()
    apk = os.path.join(OUT, 'zhixue-tiku.apk')
    run(os.path.join(BT, 'apksigner.bat'), 'sign', *sign_args(pw), '--out', apk, aligned)
    run(os.path.join(BT, 'apksigner.bat'), 'verify', apk)
    os.makedirs(DIST, exist_ok=True)
    final = os.path.join(DIST, 'zhixue-tiku.apk')
    shutil.copy(apk, final)
    print('完成：%s（%.1f MB，v%s）' % (final, os.path.getsize(final) / 1048576.0, APP_VERSION))


if __name__ == '__main__':
    main()
