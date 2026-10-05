# -*- coding: utf-8 -*-
"""可选的 LLM 智能解析(规则解析不出来时的兜底)。
在 config.json 里配置:
{
  "llm": {
    "api_key": "你的Key",
    "base_url": "https://open.bigmodel.cn/api/paas/v4",
    "model": "glm-4-flash"
  }
}
接口兼容 OpenAI /chat/completions 格式即可。
"""
import json
import re
import urllib.request

from appdir import CONFIG_PATH


def load_config():
    import os
    path = CONFIG_PATH
    if os.path.exists(path):
        try:
            with open(path, encoding='utf-8') as f:
                return json.load(f).get('llm') or {}
        except (ValueError, OSError):
            return {}
    return {}


def available():
    return bool(load_config().get('api_key'))


PROMPT = '''你是一个试卷解析助手。请把下面的试卷文本解析为 JSON 数组,每个元素是一道题:
{"qno": 题号int, "type": "single|multi|judge|qa"(单选/多选/判断/问答),
 "stem": "题干", "options": [["A","选项内容"],...](判断题和问答题为空数组),
 "answer": "答案(选择题为字母串如BD,判断题为对或错,问答题为参考答案全文)", "analysis": "解析,没有则为空字符串"}
要求:
- 保留题干原文,材料题的多段材料用\\n连接
- 只输出 JSON 数组本身,不要输出任何其他文字
试卷文本:
'''


def llm_parse(text):
    cfg = load_config()
    if not cfg.get('api_key'):
        raise ValueError('未配置 LLM:请在 quiz-app/config.json 中填写 llm.api_key')
    url = cfg.get('base_url', 'https://open.bigmodel.cn/api/paas/v4').rstrip('/') + '/chat/completions'
    body = json.dumps({
        'model': cfg.get('model', 'glm-4-flash'),
        'temperature': 0.1,
        'messages': [
            {'role': 'system', 'content': '你是严谨的试卷结构化助手,只输出JSON。'},
            {'role': 'user', 'content': PROMPT + text[:60000]},
        ],
    }).encode('utf-8')
    req = urllib.request.Request(url, data=body, headers={
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg['api_key'],
    })
    with urllib.request.urlopen(req, timeout=180) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    content = data['choices'][0]['message']['content']
    # 从回复中抠出 JSON 数组
    start = content.find('[')
    end = content.rfind(']')
    if start < 0 or end <= start:
        raise ValueError('LLM 返回内容中未找到 JSON 数组')
    raw = content[start:end + 1]
    raw = re.sub(r',\s*([\]}])', r'\1', raw)  # 去掉尾逗号
    items = json.loads(raw)
    questions = []
    for i, it in enumerate(items):
        stem = str(it.get('stem') or '').strip()
        if not stem:
            continue
        qtype = it.get('type')
        if qtype not in ('single', 'multi', 'judge', 'qa'):
            qtype = 'qa'
        opts = it.get('options') or []
        opts = [[str(k), str(v)] for k, v in opts] if opts else []
        questions.append({
            'qno': it.get('qno') or (i + 1),
            'type': qtype,
            'stem': stem,
            'options': opts,
            'answer': str(it.get('answer') or '').strip(),
            'analysis': str(it.get('analysis') or '').strip(),
        })
    if not questions:
        raise ValueError('LLM 未解析出任何题目')
    by_type = {}
    for q in questions:
        by_type[q['type']] = by_type.get(q['type'], 0) + 1
    return {'questions': questions, 'by_type': by_type, 'title': '', 'engine': 'llm'}
