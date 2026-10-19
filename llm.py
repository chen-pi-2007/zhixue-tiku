# -*- coding: utf-8 -*-
# 智学题库 · 作者：十三（xiabanghao13）、chen_pi（chen-pi-2007）
"""AI 助手（可选，设置里一键打开 / 关掉）：用户填自己的 API Key，接口兼容 OpenAI /chat/completions 的都能用
（DeepSeek、智谱、通义千问、Kimi、硅基流动、豆包……）。

用在两个地方：
  - 导入整理台「用 AI 整理」：把随便什么样的卷子整理成标准格式（提示词和「复制 AI 整理提示词」是同一份，docparse.AI_PROMPT）
  - 做题、背题、错题本、搜索时「问 AI」：带着这道题（题干、选项、官方答案、你选的）对话，第一句可以直接让它讲解
没打开时界面上不出现任何 AI 的东西，后台也不发任何请求。

配置存在 config.json 的 "llm" 里（只在这台电脑上，不跟账号同步，不进仓库）：
  {"llm": {"enabled": true, "provider": "deepseek", "base_url": "...", "model": "...", "api_key": "..."}}
"""
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

from appdir import CONFIG_PATH

# 常见服务商：选了就自动填地址和默认模型（模型可以改）
PROVIDERS = [
    {'id': 'deepseek', 'name': 'DeepSeek', 'base_url': 'https://api.deepseek.com/v1', 'model': 'deepseek-chat',
     'site': 'https://platform.deepseek.com/api_keys'},
    {'id': 'zhipu', 'name': '智谱 GLM（有免费模型）', 'base_url': 'https://open.bigmodel.cn/api/paas/v4', 'model': 'glm-4-flash',
     'site': 'https://open.bigmodel.cn/usercenter/apikeys'},
    {'id': 'qwen', 'name': '通义千问（阿里云百炼）', 'base_url': 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'model': 'qwen-plus',
     'site': 'https://bailian.console.aliyun.com/'},
    {'id': 'kimi', 'name': 'Kimi（月之暗面）', 'base_url': 'https://api.moonshot.cn/v1', 'model': 'moonshot-v1-8k',
     'site': 'https://platform.moonshot.cn/console/api-keys'},
    {'id': 'silicon', 'name': '硅基流动（有免费模型）', 'base_url': 'https://api.siliconflow.cn/v1', 'model': 'Qwen/Qwen2.5-7B-Instruct',
     'site': 'https://cloud.siliconflow.cn/account/ak'},
    {'id': 'doubao', 'name': '豆包（火山方舟）', 'base_url': 'https://ark.cn-beijing.volces.com/api/v3', 'model': '',
     'site': 'https://console.volcengine.com/ark'},
    # 本机跑的 Ollama：不用 Key；模型填自己 ollama list 里有的（小模型能讲题，整理卷子格式要大模型）
    {'id': 'ollama', 'name': 'Ollama（本机，不用 Key）', 'base_url': 'http://127.0.0.1:11434/v1', 'model': '', 'site': '', 'local': True},
    {'id': 'custom', 'name': '其他（自己填地址）', 'base_url': '', 'model': '', 'site': ''},
]


def _read_all():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, encoding='utf-8') as f:
                return json.load(f) or {}
        except (ValueError, OSError):
            return {}
    return {}


def load_config():
    return _read_all().get('llm') or {}


def is_local(base_url):
    """本机地址（Ollama 之类）：不用 Key，也不走系统代理（走代理的话本机请求会被拖慢甚至连不上）"""
    host = urllib.parse.urlparse(base_url or '').hostname or ''
    return host in ('127.0.0.1', 'localhost', '::1')


def _has_key(c):
    return bool(c.get('api_key')) or is_local(c.get('base_url'))


def available():
    """打开了而且填了 Key。老配置（只写了 api_key、没有 enabled）当作打开"""
    c = load_config()
    return _has_key(c) and c.get('enabled', True) is not False


def public_config():
    """给界面看的配置：Key 只说有没有、露最后 4 位，不把整个 Key 发回网页"""
    c = load_config()
    key = c.get('api_key') or ''
    return {'enabled': available(), 'provider': c.get('provider') or ('custom' if c.get('base_url') else 'deepseek'),
            'base_url': c.get('base_url') or '', 'model': c.get('model') or '',
            'has_key': bool(key), 'key_tail': key[-4:] if len(key) >= 8 else '', 'providers': PROVIDERS}


def save_config(data):
    """data 里没有 api_key（或是空的）就保留原来的 Key；clear_key 为真才删掉"""
    allc = _read_all()
    c = dict(allc.get('llm') or {})
    for k in ('enabled', 'provider', 'base_url', 'model'):
        if k in data:
            c[k] = data[k].strip() if isinstance(data[k], str) else data[k]
    if data.get('api_key'):
        c['api_key'] = str(data['api_key']).strip()
    if data.get('clear_key'):
        c.pop('api_key', None)
        c['enabled'] = False
    c['enabled'] = bool(c.get('enabled')) and _has_key(c)
    allc['llm'] = c
    d = os.path.dirname(CONFIG_PATH)
    if d:
        os.makedirs(d, exist_ok=True)
    tmp = CONFIG_PATH + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(allc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, CONFIG_PATH)
    return public_config()


def chat(messages, temperature=0.3, timeout=120, cfg=None):
    """发一轮对话，返回回复文字。出错抛 ValueError（中文说明，界面直接显示）"""
    cfg = cfg or load_config()
    if not _has_key(cfg):
        raise ValueError('还没有填 API Key')
    base = (cfg.get('base_url') or '').rstrip('/')
    if not base:
        raise ValueError('还没有填接口地址')
    if not cfg.get('model'):
        raise ValueError('还没有填模型名称')
    body = json.dumps({'model': cfg['model'], 'temperature': temperature, 'messages': messages}).encode('utf-8')
    req = urllib.request.Request(base + '/chat/completions', data=body, headers={
        'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (cfg.get('api_key') or 'local')})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({})) if is_local(base) else urllib.request.build_opener()
    try:
        with opener.open(req, timeout=timeout) as resp:
            raw = resp.read().decode('utf-8')
    except urllib.error.HTTPError as e:
        try:
            detail = json.loads(e.read().decode('utf-8', 'replace'))
            detail = (detail.get('error') or {}).get('message') or detail.get('message') or ''
        except Exception:
            detail = ''
        hint = {401: 'API Key 不对或者过期了', 403: '没有权限用这个模型', 404: '接口地址或模型名称不对',
                402: '账户余额不足', 429: '请求太频繁或者额度用完了，等一会儿再试'}.get(e.code, '')
        raise ValueError('AI 服务返回错误 %d%s%s' % (e.code, '：' + hint if hint else '',
                                                  '（' + str(detail)[:120] + '）' if detail else ''))
    except urllib.error.URLError as e:
        raise ValueError('连不上 AI 服务：%s（检查网络和接口地址）' % getattr(e, 'reason', e))
    except (TimeoutError, OSError):
        raise ValueError('AI 太久没回复，稍后再试')
    try:
        text = json.loads(raw)['choices'][0]['message']['content'] or ''
    except (ValueError, KeyError, IndexError, TypeError):
        raise ValueError('AI 服务返回的内容看不懂（接口地址可能不对）')
    # deepseek-r1 这类推理模型会把思考过程放在 <think>…</think> 里，只留最后的回答
    return re.sub(r'<think>.*?</think>\s*', '', text, flags=re.S)


def test(data):
    """测试连接：用界面上正在填的配置（Key 没重新填就用存着的）"""
    cfg = dict(load_config())
    for k in ('base_url', 'model', 'api_key'):
        if data.get(k):
            cfg[k] = str(data[k]).strip()
    # 本机模型第一次要先加载进内存，实测 1.5B 的模型第一句要 30 多秒
    return chat([{'role': 'user', 'content': '只回复“连接成功”四个字。'}], temperature=0,
                timeout=180 if is_local(cfg.get('base_url')) else 40, cfg=cfg).strip()[:40]


def list_models(base_url):
    """本机 Ollama 有哪些模型（设置里选模型用）；连不上就返回空，不报错"""
    if not is_local(base_url):
        return []
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(base_url.rstrip('/') + '/models', timeout=5) as resp:
            return [m['id'] for m in json.loads(resp.read().decode('utf-8')).get('data') or [] if m.get('id')]
    except Exception:
        return []


# ---------------------------------------------------------------- 整理卷子

def organize(text):
    """导入整理台「用 AI 整理」：提示词和复制给免费 AI 的是同一份。返回整理好的标准格式文字"""
    import docparse
    out = chat([{'role': 'system', 'content': '你是严谨的试卷整理助手，只输出整理好的试卷内容。'},
                {'role': 'user', 'content': docparse.AI_PROMPT + text}], temperature=0.1, timeout=300)
    out = re.sub(r'^\s*```[a-zA-Z]*\s*\n|\n\s*```\s*$', '', out.strip())      # 有的模型会包一层代码块
    return out.strip() + '\n'


# ---------------------------------------------------------------- 问 AI

TUTOR_PROMPT = '''你是江苏省中等职业学校学业水平考试（学测）的辅导老师，正在帮一名中职学生弄懂一道练习题。

规矩：
1. 这道题的“官方答案”以下面给出的为准，考试也按它判分。就算你觉得官方答案有问题，也先按官方答案讲清楚为什么选它；
   确实认为有争议时，最后单独用一句话说明“我的理解和官方答案不同，考试以官方答案为准”，不要说官方答案错了。
2. 学生还没作答时（题目信息里会写），先给思路和提示，不要直接说出答案；学生明确要答案时再说。
3. 讲选项时只讲关键的：“选出错误 / 不正确的一项”这类题，只说错的那一项错在哪，不要逐项说“正确”。
4. 用简短、口语化的中文，像当面讲题；一般不超过 200 字，学生追问再展开。不要用 LaTeX 和 Markdown 表格，分数写成 1/2，根号写成 √2。
5. 只围绕这道题和相关知识点回答；不知道的就说不确定，不要编造法条、数据、出处。
'''

TYPE_NAME = {'single': '单选题', 'multi': '多选题', 'judge': '判断题', 'reading': '阅读单选', 'poem': '古诗文单选',
             'dictation': '默写', 'essay': '作文', 'blank': '填空题', 'solution': '解答题', 'qa': '问答题'}


def _plain(s):
    """题目里的标记换成 AI 看得懂的写法"""
    s = str(s or '')
    s = re.sub(r'\[\[img:[^\]]+\]\]', '[图片]', s)
    for _ in range(3):                                   # 分数套分数、根号套分数：由里到外换几遍
        s = re.sub(r'\\frac\{([^{}]*)\}\{([^{}]*)\}', r'(\1)/(\2)', s)
        s = re.sub(r'\\sqrt\{([^{}]*)\}', r'√(\1)', s)
    s = re.sub(r'\\\(|\\\)', '', s)
    s = s.replace('「', '【下划线：').replace('」', '】').replace('〔', '【加点字：').replace('〕', '】')
    return s


def question_context(q):
    """把题目整理成一段给 AI 看的文字"""
    lines = ['【题目信息】', '题型：' + TYPE_NAME.get(q.get('type'), '题目')]
    if q.get('subject'):
        lines.append('科目：' + str(q['subject']))
    if q.get('material'):
        lines += ['材料：', _plain(q['material'])[:6000]]
    lines.append('题干：' + _plain(q.get('stem')))
    for o in q.get('options') or []:
        if isinstance(o, (list, tuple)) and len(o) >= 2:
            lines.append('%s. %s' % (o[0], _plain(o[1])))
    if q.get('answer'):
        lines.append('官方答案：' + _plain(q['answer']))
    if q.get('analysis'):
        lines.append('题库里的解析：' + _plain(q['analysis'])[:2000])
    sel = q.get('selected')
    if sel:
        lines.append('学生选的是：' + str(sel) + {True: '（答对了）', False: '（答错了）'}.get(q.get('correct'), ''))
    elif q.get('answered') is False:
        lines.append('学生还没作答。')
    return '\n'.join(lines)


def ask(q, messages):
    """问 AI：messages 是界面上这道题的对话记录 [{role: user/assistant, content}]，最多带最近 12 条"""
    msgs = [{'role': 'system', 'content': TUTOR_PROMPT + '\n' + question_context(q or {})}]
    for m in (messages or [])[-12:]:
        if isinstance(m, dict) and m.get('role') in ('user', 'assistant') and m.get('content'):
            msgs.append({'role': m['role'], 'content': str(m['content'])[:4000]})
    if len(msgs) == 1:
        raise ValueError('没有问题')
    return chat(msgs).strip()


# ---------------------------------------------------------------- 老接口（/api/upload 规则解析失败时兜底），保留兼容

def llm_parse(text):
    """把卷子文字交给 AI 整理成标准格式，再用规则解析（和整理台走同一条路）"""
    import docparse
    r = docparse.parse_lines(organize(text[:60000]).split('\n'))
    if not r['questions']:
        raise ValueError('AI 没整理出题目')
    r['engine'] = 'llm'
    return r
