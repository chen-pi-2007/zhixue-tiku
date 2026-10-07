# 维护和接手说明

写给以后维护这个项目的人。先读完“怎么发布”和“千万别做的事”，其余用到时再看。

## 这个项目是什么

江苏中职学业水平考试（学测）的刷题软件：今日复习（间隔重复）、错题本、模拟考试、技能实操、英语题的中文翻译。

- **电脑版**：`智学题库.exe`，单文件。双击后在后台起一个本地网页服务（http://127.0.0.1:8788），在自己的窗口里显示界面（WebView2，和 Edge 同一个内核，Win10/11 一般自带），托盘有图标。关窗口缩到托盘，托盘右键「退出」才真正退出。没有 WebView2 的电脑自动改用浏览器打开。
- **安卓版**：`zhixue-tiku.apk`，离线做题。没有技能实操和导入试卷。
- 用户的做题记录只存在他自己的电脑或手机上，不上传任何地方。

代码在 https://github.com/chen-pi-2007/zhixue-tiku ，新版本发在这个仓库的 Releases。

## 程序和内容是分开的

| | 是什么 | 改了以后怎么发 | 用户那边 |
|---|---|---|---|
| **内容** | 界面 `static/`、题库 `data/bank.json`、图片 `data/media/`、技能卷素材 `data/skills/`、手机端逻辑 `mobile/local.js` | `python release.py content "改了什么"` | 点「检查更新」只下载改了的文件，几秒钟，不用重启（热更新） |
| **程序** | 所有 `.py` 文件、安卓的 Java 代码（`mobile/android/`） | `python release.py app "改了什么"` | 下载新 exe 自动替换并重启；手机下载新 apk 覆盖安装 |

改题、改答案、改翻译、改界面，大多只是内容，发 content 就行。发布脚本会检查：改了 `.py` 却想发 content，它会拦下来。

### 什么时候要加 `--needs-new-app`

界面（`static/app.js`）调用了一个新加的接口时，旧程序没有这个接口，用旧程序的人拿到新界面会出错（发生过一次，见下文“教训”）。这时用：

    python release.py app "加了某某功能" --needs-new-app

清单里会写明这份内容至少要哪个版本的程序。旧程序的用户收不到这份内容，会先被提示更新程序。

## 怎么发布

在仓库目录里运行：

    python release.py check                     只检查，不发布
    python release.py content "改正英语阅读第 3 题的答案"
    python release.py app "修复模拟考计时" [--version 1.5.0] [--needs-new-app]

发布脚本会依次做：
1. 检查：在不在 main 分支、和 GitHub 是否同步、有没有自己导入的私人试卷、测试是否通过。
2. 改 `version.py` 里的版本号。
3. 生成 `content.json`，里面记下每个内容文件的 SHA-256 和大小。
4. 提交、打 Git 标签（`content-N`，发 app 时还有 `vX.Y.Z`），推到 GitHub。
5. 发 app 时还会打包 exe 和 apk，在 GitHub 建 Release 并上传。

新文件（比如新加的 `.py`）要先自己 `git add`，脚本只会自动加内容目录里的文件。

### 热更新是怎么工作的

1. 程序读 GitHub 上 main 分支的 `content.json`，和自己正在用的那份比对。
2. 指纹变了的文件，从清单里写的标签（`content-N`）下载。标签发布后不会再变，所以下载到的一定和清单一致。
3. 下载线路：先连 GitHub 原站，不行就换 jsDelivr 镜像（`cdn.jsdelivr.net/gh/...`，国内一般能连上）；每条线路还会在系统代理和直连之间切换。
4. 每个文件都核对 SHA-256，全部齐了才把新内容换上。中途失败，正在用的内容不受影响。
5. 电脑版的新内容放在数据目录旁边的 `content/current/`，手机放在 App 私有目录 `files/content/current/`。程序启动时用版本更高、并且和当前程序兼容的那份（看 `appdir.active()`、`MainActivity.chooseContent()`）。

代码在 `content.py`（清单）、`hotupdate.py`（电脑下载）、`mobile/local.js` 末尾（手机下载）、`MainActivity.java` 里的 `content*` 方法（手机写文件、切换）。

## 改题库

题库在 `data/bank.json`。每道题用 `卷子key#序号` 关联用户的做题记录，所以：

- **可以**：改题干、选项、答案、解析、翻译，加新卷子。
- **不要**：调换已有题目的顺序，或者删掉中间的题。用户的做题记录会对到别的题上去。要删就把那道题改成一道正确的题，或者整卷换一个新的 key。

题库原始资料和生成脚本在另一个文件夹（作者电脑上的 `学测/`，不在这个仓库里）：`_脚本/build_packs.py` 从 Word 卷子生成题库包 → `python import_packs.py <题库包目录>` 导入 `data/bank.json`。导入前先退出正在运行的题库程序。英语的中文翻译和知识点在 `学测/_脚本/english_cn/`。

只改几道题的话，直接改 `data/bank.json` 也行（JSON 文件，用编辑器搜题干），改完 `python release.py content "..."`。

## 第一次准备（新电脑）

1. 装 Python 3（作者用的是 Anaconda）、git、GitHub CLI（`gh auth login`）。
2. `git clone https://github.com/chen-pi-2007/zhixue-tiku`
3. 跑起来看看：`python server.py`，浏览器打开 http://127.0.0.1:8788 （或者用装了 pywebview 的 Python 运行 `tray.py`，就是独立窗口）。源码运行时直接用仓库里的 `static/` 和 `data/`，不做热更新。
4. 要发 app：
   - 电脑版打包环境：`build_exe.bat` 第一次会在 `_build/venv` 建好（装 PyInstaller、pystray、Pillow、pywebview）。
   - 安卓打包工具：JDK 17 和 Android SDK（build-tools 34.0.0、platforms;android-34），放在 `D:\tool\jdk17`、`D:\tool\android-sdk`（或用环境变量 `JAVA_HOME_17`、`ANDROID_HOME` 指定）。不用 Android Studio 和 Gradle。
   - 安卓签名证书：`gh repo clone chen-pi-2007/zhixue-android-key D:\tool\android-keys`。这是私有仓库，要原作者给你权限。

## 千万别做的事

- **别丢安卓签名用的三样东西**，都在 `D:\tool\android-keys`，备份在私有仓库 `chen-pi-2007/zhixue-android-key`（永远不要公开）：
  - `zhixue.jks`：现在的证书，持有人 `CN=chen_pi`。
  - `old/zhixue-2026-10-06-CN-zhixue-tiku.jks`：第一批安装包（2026-10-06）用的旧证书。
  - `lineage.bin`：旧证书签字"把身份交给新证书"的证明。

  安卓只允许同一个证书签名的新版覆盖安装。现在每个安装包都同时用新旧两个证书签名，再附上这份证明（证书轮换，APK Signature Scheme v3，`build_apk.py` 的 `sign_args`）。这样装着旧证书版本的人也能直接覆盖升级，记录不丢。三样东西少了任何一样，`build_apk.py` 都会停下不打包。**不要再换证书**。万一非换不可，要用 `apksigner rotate --in lineage.bin` 在这份证明后面接着加，不能另起一份。
- **别把私人数据提交到仓库**：`data/progress.json`（做题记录）、`config.json`（可能有大模型 API Key）已经在 `.gitignore` 里。
- **别把自己导入的试卷发出去**：在这台电脑上用「导入试卷」导入的卷子会进 `data/bank.json`（key 以 `upload-` 开头），发布脚本会拦下来，需要先在网站里删掉它们。
- **别调换题目顺序**（见“改题库”）。
- 提交说明和 Release 说明里不写 AI 工具的署名（作者的要求）。

## 测试

    python -m unittest discover -s tests

- `test_core.py`：复习算法、组卷、题库合并、清除记录。
- `test_hotupdate.py`：热更新只下载变了的文件、失败不影响原内容、不兼容的内容不用。
- `test_server.py`：每个接口都用各种请求轰一遍，确认同一条连接上的下一个请求不受影响（见“教训”）。
- `test_skills.py`：技能实操评分。

手机版的逻辑在 `mobile/local.js`，是 `db.py`、`srs.py`、`exam.py` 的 JavaScript 版。**改了这几个 Python 文件的逻辑，要同步改 local.js。**

## 文件导览

| 文件 | 作用 |
|---|---|
| `tray.py` | exe 入口：启动网页服务、独立窗口（pywebview）、托盘图标、开机自启（`--tray` 只进托盘） |
| `server.py` | 网页服务和所有 `/api/...` 接口 |
| `db.py` | 题库和做题记录（JSON 文件）、今日复习、错题本、模拟考 |
| `srs.py` | 间隔复习算法（莱特纳盒子） |
| `exam.py` | 模拟考组卷和判分 |
| `appdir.py` | 各个目录在哪、启动时用哪份内容 |
| `content.py` / `hotupdate.py` | 内容清单 / 电脑版热更新 |
| `updater.py` | 电脑版程序更新（下载新 exe、替换、重启） |
| `version.py` | 版本号（用 release.py 改） |
| `skills/` | 技能实操：Office 文件、网页、网络配置的评分 |
| `docparse.py`、`llm.py`、`import_packs.py` | 导入试卷（解析 Word / 文本，可选大模型）、导入题库包 |
| `static/` | 界面（原生 JS，没有框架） |
| `mobile/` | 安卓版：`local.js`（本地后端）、`android/`（Java 壳）、`build_apk.py` |
| `release.py` | 发布脚本 |

## 教训

- **界面比后台新会出错**：曾经界面先更新了，调用了新的下载接口，旧后台没有这个接口。所以内容清单要写最低程序版本（`--needs-new-app`），程序太旧时不装新内容。
- **请求正文没读完会污染下一个请求**：浏览器会在同一条连接上连续发请求。曾经有接口没读请求正文，剩下的 `{}` 粘到了下一个请求开头，把 `POST` 读成了 `{}POST`，返回 501。现在服务端每个请求处理完都会把正文读掉，`test_server.py` 专门测这个。
- **代理和网络不稳定**：国内连 GitHub 时好时坏，用户常开代理。所有联网都要重试，并在代理、直连、镜像之间切换。
- **jsDelivr 镜像不提供 Word、Excel、PPT 文件**（返回 403）。这些都是电脑版技能实操的素材（`data/skills/` 里约 30 个），只能从 GitHub 原站下载；改了它们的内容更新，在连不上 GitHub 的网络里会失败。
- **aapt2 不认中文路径**：安卓打包的中间文件放在 `%TEMP%\zhixue-apk`。
- **Git Bash 会改写 `/sdcard/...` 这类路径**：用 adb 推文件前设 `MSYS_NO_PATHCONV=1`。
