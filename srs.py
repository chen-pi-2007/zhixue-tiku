# -*- coding: utf-8 -*-
# 智学题库 · 作者：十三（xiabanghao13）、chen_pi（chen-pi-2007）
# https://github.com/chen-pi-2007/zhixue-tiku  © 2026 十三、chen_pi，保留所有权利。
"""间隔复习（莱特纳盒子）。纯函数，不碰存储。

- 每道做过的题有一张卡片 card，box 0..6，box 越高掌握越牢、下次复习间隔越长。
- 答对：同一天内只记一次进步（box+1、streak+1），避免当天反复刷同一题刷“掌握”。
  第一次做就答对，直接进 box 3（4 天后再见）。
- 答错：box 归 0、明天复习，进入错题本。
- 错题本里的题要在不同的日子里连续答对 MASTER_STREAK 次才算消灭。
"""
import datetime

INTERVALS = [1, 1, 2, 4, 7, 15, 30]     # box -> 下次复习间隔（天）
MAX_BOX = len(INTERVALS) - 1
FIRST_RIGHT_BOX = 3
MASTER_STREAK = 3


def today_str(now=None):
    return (now or datetime.datetime.now()).strftime('%Y-%m-%d')


def add_days(day, n):
    d = datetime.datetime.strptime(day, '%Y-%m-%d').date() + datetime.timedelta(days=n)
    return d.strftime('%Y-%m-%d')


def new_card():
    return {'box': 0, 'due': '', 'right': 0, 'wrong': 0, 'streak': 0,
            'last': '', 'last_ok': None, 'credit_day': '', 'in_wrong': False}


def apply(card, ok, now_str):
    """返回 (新卡片, 事件)。事件：'released' 错题被消灭 / 'entered' 新进错题本 / None"""
    c = dict(card or new_card())
    today = now_str[:10]
    fresh = c['right'] + c['wrong'] == 0
    event = None
    if ok:
        c['right'] += 1
        if c['credit_day'] != today:
            c['credit_day'] = today
            c['streak'] += 1
            c['box'] = FIRST_RIGHT_BOX if fresh else min(c['box'] + 1, MAX_BOX)
        c['due'] = add_days(today, INTERVALS[c['box']])
        if c['in_wrong'] and c['streak'] >= MASTER_STREAK:
            c['in_wrong'] = False
            event = 'released'
    else:
        c['wrong'] += 1
        c['streak'] = 0
        c['box'] = 0
        c['credit_day'] = ''
        c['due'] = add_days(today, INTERVALS[0])
        if not c['in_wrong']:
            event = 'entered'
        c['in_wrong'] = True
    c['last'] = now_str
    c['last_ok'] = bool(ok)
    return c, event


def mark(card, mastered, today):
    """手动标记：已掌握 → 出错题本、至少 box 4；重新加入 → 进错题本、明天复习。"""
    c = dict(card or new_card())
    if mastered:
        c['in_wrong'] = False
        c['box'] = max(c['box'], 4)
        c['due'] = add_days(today, INTERVALS[c['box']])
    else:
        c['in_wrong'] = True
        c['streak'] = 0
        c['box'] = 0
        c['due'] = today
    return c


def is_due(card, today):
    return bool(card) and bool(card['due']) and card['due'] <= today


def mastery(card):
    """0~1，用于掌握度统计。没做过的题算 0。"""
    if not card:
        return 0.0
    return card['box'] / float(MAX_BOX)


def from_legacy(rec):
    """旧版 records {wrong_count,right_count,last_time,mastered} → 卡片。"""
    c = new_card()
    c['right'] = rec.get('right_count', 0)
    c['wrong'] = rec.get('wrong_count', 0)
    c['last'] = rec.get('last_time', '')
    c['last_ok'] = rec.get('last_result') == 'right' if rec.get('last_result') else None
    day = c['last'][:10] or today_str()
    if c['wrong'] and not rec.get('mastered'):
        c['in_wrong'] = True
        c['due'] = day
    else:
        c['box'] = FIRST_RIGHT_BOX if c['right'] else 0
        c['streak'] = 1 if c['right'] else 0
        c['credit_day'] = day if c['right'] else ''
        c['due'] = add_days(day, INTERVALS[c['box']])
    return c
