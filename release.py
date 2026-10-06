# -*- coding: utf-8 -*-
"""发布脚本：改完题库、界面或代码之后，用它发布给所有用户。详细说明见 MAINTAINING.md。

    python release.py check                    只做发布前检查（测试、私人卷子、证书……），不发布
    python release.py content "改了什么"         发布题库和界面（热更新：用户点「检查更新」几秒就好）
    python release.py app "改了什么"             发布新版程序（电脑 exe + 安卓 apk，同时也发布一份内容）
        --version 1.5.0                        指定程序版本号（默认最后一位加 1）
        --needs-new-app                        这次的界面用到了新程序才有的接口：
                                               旧程序的用户收不到这份内容，会被提示先更新程序

什么时候发哪种：
  - 只改了 static/、data/（题库、图片、技能卷素材）、mobile/local.js → content
  - 改了任何 .py 文件、安卓的 Java 代码 → app
脚本会检查：改了程序代码却想发 content，会拦下来。

发布做的事：改 version.py 的版本号 → 生成内容清单 content.json → 跑测试 → 提交 → 打 Git 标签
（content-N，app 还有 vX.Y.Z）→ 推到 GitHub；app 还会打包 exe 和 apk、在 GitHub 建 Release 上传。
需要：git、gh（已登录）、Python；发 app 还要 _build/venv（PyInstaller）和 D:\\tool 下的安卓打包工具。"""
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
import content          # noqa: E402

VERSION_PY = os.path.join(ROOT, 'version.py')
# 发 content 时允许有改动的路径（其余已跟踪文件有改动就说明改了程序，要发 app）
CONTENT_PATHS = tuple(content.INCLUDE) + ('version.py', 'content.json')
# 这些改动不影响用户（文档、测试、发布脚本自己），两种发布都允许
FREE_PATHS = ('MAINTAINING.md', 'README.md', 'tests/', 'release.py', '.gitignore', 'config.example.json')


def sh(*cmd, check=True, capture=False):
    print('  $', ' '.join(cmd))
    r = subprocess.run(cmd, cwd=ROOT, check=check, text=True, encoding='utf-8',
                       stdout=subprocess.PIPE if capture else None)
    return (r.stdout or '') if capture else r.returncode


def die(msg):
    print('\n✗ ' + msg)
    sys.exit(1)


def read_versions():
    ns = {}
    exec(open(VERSION_PY, encoding='utf-8').read(), ns)
    return ns


def set_version(name, value):
    s = open(VERSION_PY, encoding='utf-8').read()
    lit = repr(value) if isinstance(value, str) else str(value)
    s, n = re.subn(r'^%s = .*$' % name, '%s = %s' % (name, lit), s, count=1, flags=re.M)
    if not n:
        die('version.py 里找不到 %s' % name)
    open(VERSION_PY, 'w', encoding='utf-8').write(s)


def changed_paths():
    out = sh('git', 'status', '--porcelain', '-uall', capture=True)
    paths = []
    for line in out.splitlines():
        p = line[3:].strip().strip('"')
        if ' -> ' in p:
            p = p.split(' -> ')[1]
        paths.append(p)
    return paths


def preflight(kind):
    print('== 发布前检查')
    if sh('git', 'rev-parse', '--abbrev-ref', 'HEAD', capture=True).strip() != 'main':
        die('请在 main 分支上发布')
    sh('git', 'fetch', '-q', 'origin')
    behind = sh('git', 'rev-list', '--count', 'HEAD..origin/main', capture=True).strip()
    if behind != '0':
        die('GitHub 上有 %s 个新提交还没拉下来，先 git pull' % behind)
    # 程序代码有改动却发 content：用户拿不到新代码，界面可能调用不存在的接口
    if kind == 'content':
        code = [p for p in changed_paths()
                if not p.startswith(CONTENT_PATHS + FREE_PATHS) and not p.startswith(('_build/', 'content/'))
                and not p.endswith(('.exe', '.zip', '.log'))]
        tracked = set(sh('git', 'ls-files', capture=True).split('\n'))
        code = [p for p in code if p in tracked]
        if code:
            die('这些程序文件有改动，要用 python release.py app 发布新版程序：\n    ' + '\n    '.join(code))
    # 自己导入的试卷（key 以 upload- 开头）只在本机，不能发给所有人
    import json
    bank = json.load(open(os.path.join(ROOT, 'data', 'bank.json'), encoding='utf-8'))
    private = [p['name'] for p in bank['papers'] if str(p.get('key', '')).startswith('upload-')]
    if private:
        die('data/bank.json 里有自己导入的试卷，发布会公开给所有人：%s\n'
            '  在题库网站里删掉它们再发布（导入试卷时会进这个文件，因为这台电脑的数据就放在仓库里）' % '、'.join(private))
    print('  跑测试…')
    if subprocess.run([sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-q'], cwd=ROOT,
                      stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, encoding='utf-8').returncode:
        die('测试没通过，先修好（python -m unittest discover -s tests 看详情）')
    if kind == 'app':
        if not os.path.exists(r'D:\tool\android-keys\zhixue.jks'):
            die('找不到安卓签名证书，先恢复：gh repo clone chen-pi-2007/zhixue-android-key D:\\tool\\android-keys')
        if not os.path.exists(os.path.join(ROOT, '_build', 'venv', 'Scripts', 'python.exe')):
            die('缺少 _build/venv（打包 exe 用），见 MAINTAINING.md 的“第一次准备”')
    print('  通过')


def write_manifest(v, notes):
    ns = read_versions()
    m = content.build_manifest(ROOT, v, ns['CONTENT_MIN_APP'], ns['CONTENT_MIN_ANDROID'], notes=notes)
    content.write_manifest(os.path.join(ROOT, content.CONTENT_FILE), m)
    print('  内容第 %d 版：%d 个文件' % (v, len(m['files'])))


def push(tags, message):
    sh('git', 'add', '-A', '--', 'version.py', 'content.json', 'static', 'mobile/local.js', 'data/bank.json',
       'data/media', 'data/skills')
    sh('git', 'add', '-u')                          # 其余已跟踪文件的改动（发 app 时的代码）
    sh('git', 'commit', '-q', '-m', message)
    for t in tags:
        sh('git', 'tag', t)
    sh('git', 'push', '-q', 'origin', 'main', *tags)


def release_content(notes):
    preflight('content')
    v = read_versions()['CONTENT_VERSION'] + 1
    set_version('CONTENT_VERSION', v)
    write_manifest(v, notes)
    push(['content-%d' % v], '内容第 %d 版：%s' % (v, notes))
    print('\n✓ 已发布内容第 %d 版。用户点「检查更新」（或第二天打开时自动提示）就能更新。' % v)
    print('  GitHub 原站几分钟内生效；jsDelivr 镜像可能要晚几个小时。')


def bump(ver):
    a, b, c = (list(map(int, ver.split('.'))) + [0, 0])[:3]
    return '%d.%d.%d' % (a, b, c + 1)


def release_app(notes, version=None, needs_new_app=False):
    preflight('app')
    ns = read_versions()
    new = version or bump(ns['APP_VERSION'])
    if content.ver_tuple(new) <= content.ver_tuple(ns['APP_VERSION']):
        die('新版本号 %s 要比现在的 %s 大' % (new, ns['APP_VERSION']))
    if sh('git', 'tag', '-l', 'v' + new, capture=True).strip():
        die('标签 v%s 已经存在' % new)
    cv = ns['CONTENT_VERSION'] + 1
    set_version('APP_VERSION', new)
    set_version('CONTENT_VERSION', cv)
    if needs_new_app:
        set_version('CONTENT_MIN_APP', new)
        set_version('CONTENT_MIN_ANDROID', new)
    write_manifest(cv, notes)
    print('== 打包电脑版')
    sh(os.path.join(ROOT, '_build', 'venv', 'Scripts', 'python.exe'), 'build_exe.py')
    print('== 打包安卓版')
    sh(sys.executable, os.path.join('mobile', 'build_apk.py'))
    exe = os.path.join(ROOT, '_build', 'release', 'zhixue-tiku.exe')       # Release 里的文件名用英文
    os.makedirs(os.path.dirname(exe), exist_ok=True)
    shutil.copy(os.path.join(ROOT, '_build', 'dist', '智学题库.exe'), exe)
    apk = os.path.join(ROOT, '_build', 'mobile', 'zhixue-tiku.apk')
    push(['v' + new, 'content-%d' % cv], 'v%s：%s' % (new, notes))
    sh('gh', 'release', 'create', 'v' + new, exe, apk, '--title', 'v%s %s' % (new, notes.splitlines()[0][:40]),
       '--notes', notes)
    print('\n✓ 已发布 v%s（内容第 %d 版）。用户点「检查更新」会提示下载新程序。' % (new, cv))


def main():
    args = sys.argv[1:]
    if not args or args[0] not in ('check', 'content', 'app'):
        print(__doc__)
        sys.exit(1)
    os.chdir(ROOT)
    if args[0] == 'check':
        preflight('content' if '--app' not in args else 'app')
        return
    notes = next((a for a in args[1:] if not a.startswith('--')), '').strip()
    if args[0] == 'app' and '--version' in args:
        version = args[args.index('--version') + 1]
        notes = next((a for a in args[1:] if not a.startswith('--') and a != version), '').strip()
    else:
        version = None
    if not notes:
        die('写一句这次改了什么，比如：python release.py content "改正英语阅读第 3 题的答案"')
    if args[0] == 'content':
        release_content(notes)
    else:
        release_app(notes, version, '--needs-new-app' in args)


if __name__ == '__main__':
    main()
