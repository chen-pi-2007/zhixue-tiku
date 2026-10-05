# -*- coding: utf-8 -*-
"""网络组建（Cisco Packet Tracer）配置检查。

考生把每台设备的 show running-config（建议再加 show vlan brief）粘贴进来，
按评分表逐项判分。评分项文字很规律，直接从评分表生成检查规则：
  命名为SW1 / SW1上创建vlan10 / SW1上vlan改名为zja / SW1端口f0/3划入vlan
  SW1端口F0/2：192.168.10.2/24 / SW1 Vlan10：192.168.5.1/24 / PC1：…（PC 无法从配置看出，自查）
  SW1两条静态路由 / SW1路由配置（OSPF/RIP）/ SW1互联接口开启trunk
  RT1开启telnet、设置telnet密码467 / RT1设置特权密码467
"""
import ipaddress
import re

CN_NUM = {'一': 1, '两': 2, '二': 2, '三': 3, '四': 4}
# 全局配置命令（出现时结束 interface/router/line/vlan 块）
TOP_LEVEL = re.compile(r'^(hostname|interface|router|line|vlan\s+\d|ip\s+route|ip\s+routing|enable\s+(password|secret)'
                       r'|service|version|banner|spanning-tree|access-list|username|end$|\d{1,4}\s+\S+\s+(active|act/))')


def norm_if(name):
    """FastEthernet0/1、Fa0/1、f0/1 -> fa0/1；Vlan 10 -> vlan10；GigabitEthernet0/0 -> gi0/0"""
    n = name.strip().lower().replace(' ', '')
    m = re.match(r'^(fastethernet|fa|f|gigabitethernet|gi|g|ethernet|eth|e|vlan|serial|se|s|loopback|lo)([\d/.]+)$', n)
    if not m:
        return n
    pre = m.group(1)
    pre = {'fastethernet': 'fa', 'f': 'fa', 'gigabitethernet': 'gi', 'g': 'gi', 'ethernet': 'e', 'eth': 'e',
           'serial': 'se', 's': 'se', 'loopback': 'lo'}.get(pre, pre)
    return pre + m.group(2)


class Device:
    def __init__(self, text):
        self.text = text or ''
        self.hostname = None
        self.interfaces = {}       # 'fa0/1' -> {'ips': [(ip, mask)], 'lines': [...]}
        self.routes = []           # [(net, mask, nexthop)]
        self.routers = {}          # 'ospf'/'rip' -> [network 行]
        self.vty = []              # [{'password':..., 'login': bool}]
        self.enable = []           # [('password'|'secret', 值, 是否明文)]
        self.vlans = {}            # 'vlan 10' 配置或 show vlan brief：id -> name
        self._parse()

    def _parse(self):
        block, cur = None, None
        for raw in self.text.splitlines():
            line = raw.rstrip()
            s = line.strip()
            if not s:
                continue
            # 去掉命令提示符，如 SW1(config)# / SW1#
            s = re.sub(r'^\S+?[>#]\s*', '', s) if re.match(r'^\S+?(\(config[^)]*\))?[>#]', s) else s
            low = s.lower()
            indented = line[:1] in (' ', '\t')
            # 分隔符和模式切换命令：结束当前块
            if low == '!' or low in ('exit', 'end', 'enable', 'conf t', 'write', 'wr') or low.startswith(('configure ', 'copy ')):
                block = None
                continue
            # 顶格的全局命令结束当前块（兼容 show run 输出和手敲的命令记录，不依赖缩进）
            if not indented and TOP_LEVEL.match(low):
                block = None
            m = re.match(r'^hostname\s+(\S+)', s, re.I)
            if m:
                self.hostname = m.group(1)
                block = None
                continue
            m = re.match(r'^interface\s+(.+)$', s, re.I)
            if m:
                cur = self.interfaces.setdefault(norm_if(m.group(1)), {'ips': [], 'lines': []})
                block = 'if'
                continue
            m = re.match(r'^router\s+(ospf|rip|eigrp)\b', s, re.I)
            if m:
                cur = self.routers.setdefault(m.group(1).lower(), [])
                block = 'router'
                continue
            m = re.match(r'^line\s+vty\b', s, re.I)
            if m:
                cur = {'password': None, 'login': False}
                self.vty.append(cur)
                block = 'vty'
                continue
            m = re.match(r'^line\s+', s, re.I)
            if m:
                block = 'line'
                continue
            m = re.match(r'^vlan\s+(\d+)$', s, re.I)
            if m:
                cur = m.group(1)
                self.vlans.setdefault(cur, None)
                block = 'vlan'
                continue
            m = re.match(r'^ip\s+route\s+(\S+)\s+(\S+)\s+(\S+)', s, re.I)
            if m and not indented:
                self.routes.append((m.group(1), m.group(2), m.group(3)))
                continue
            m = re.match(r'^enable\s+(password|secret)\s+(?:(\d)\s+)?(\S+)', s, re.I)
            if m and not indented:
                self.enable.append((m.group(1).lower(), m.group(3), m.group(2) in (None, '0')))
                continue
            # show vlan brief：“10   zja   active   Fa0/3”
            m = re.match(r'^(\d{1,4})\s+(\S+)\s+(active|act/unsup|suspended)\b(.*)$', s, re.I)
            if m:
                self.vlans[m.group(1)] = m.group(2)
                for port in re.findall(r'(Fa\d+/\d+|Gi\d+/\d+)', m.group(4), re.I):
                    self.interfaces.setdefault(norm_if(port), {'ips': [], 'lines': []})['lines'].append(
                        'switchport access vlan %s' % m.group(1))
                continue
            if block == 'if':
                cur['lines'].append(s.lower())
                m = re.match(r'^ip\s+address\s+(\S+)\s+(\S+)', s, re.I)
                if m:
                    cur['ips'].append((m.group(1), m.group(2)))
            elif block == 'router':
                if s.lower().startswith('network'):
                    cur.append(s.lower())
            elif block == 'vty':
                m = re.match(r'^password\s+(?:(\d)\s+)?(\S+)', s, re.I)
                if m:
                    cur['password'] = m.group(2)
                if re.match(r'^login\b', s, re.I):
                    cur['login'] = True
            elif block == 'vlan':
                m = re.match(r'^name\s+(\S+)', s, re.I)
                if m:
                    self.vlans[cur] = m.group(1)

    # ---- 查询
    def ip_of(self, ifname):
        i = self.interfaces.get(norm_if(ifname))
        return i['ips'] if i else []

    def connected(self):
        out = []
        for name, i in self.interfaces.items():
            for ip, mask in i['ips']:
                try:
                    out.append(ipaddress.ip_interface('%s/%s' % (ip, mask)).network)
                except ValueError:
                    pass
        return out

    def access_vlan(self, ifname):
        i = self.interfaces.get(norm_if(ifname))
        if not i:
            return None
        for l in i['lines']:
            m = re.match(r'switchport access vlan (\d+)', l)
            if m:
                return m.group(1)
        return None

    def has_vlan(self, vid):
        if vid in self.vlans:
            return True
        if 'vlan' + vid in self.interfaces:
            return True
        return any(self.access_vlan(n) == vid for n in self.interfaces)


def _mask(prefix):
    return str(ipaddress.ip_network('0.0.0.0/%s' % prefix).netmask)


def _net(ip, mask):
    return ipaddress.ip_interface('%s/%s' % (ip, mask)).network


def plan_networks(plan):
    """IP 规划表 -> 全部网段"""
    nets = set()
    for dev, ifn, ip, prefix in plan:
        nets.add(ipaddress.ip_interface('%s/%s' % (ip, prefix)).network)
    return nets


def parse_plan(intro):
    """从卷子的“接口IP地址规划表”取出 [(设备, 接口, ip, 前缀)]"""
    out = []
    for m in re.finditer(r'\|\s*\d+\s*\|\s*(\w+)\s*\|\s*([^|]+?)\s*\|\s*(\d+\.\d+\.\d+\.\d+)\s*/\s*(\d+)\s*\|', intro):
        out.append((m.group(1).upper(), m.group(2).strip(), m.group(3), m.group(4)))
    return out


def protocol_of(intro):
    t = intro.upper()
    if 'OSPF' in t:
        return 'ospf'
    if 'RIP' in t:
        return 'rip'
    if '静态路由' in intro:
        return 'static'
    return None


def devices_of(rubric):
    devs = []
    for r in rubric:
        for d in re.findall(r'(?<![A-Za-z])((?:SW|RT)\d)(?!\d)', r['item'], re.I):
            d = d.upper()
            if d not in devs:
                devs.append(d)
    return sorted(devs, key=lambda d: (d[:2] != 'SW', d))


# ====================================================================== 生成检查项

def build_checks(rubric, intro):
    """评分表条目 -> [(说明, 分值, 类型, 参数)]；类型 'manual' 表示需要自查"""
    plan = parse_plan(intro)
    proto = protocol_of(intro)
    checks = []
    last_vlan = {}
    for r in rubric:
        item = r['item'].replace('\n', ' ').strip()
        pts = r['points']
        if '合计' in item or not item:
            continue
        it = item.replace('：', ':').replace(' ', '')
        m = re.search(r'命名为((?:SW|RT)\d)', it, re.I)
        if m:
            checks.append((item, pts, 'hostname', {'dev': m.group(1).upper()}))
            continue
        m = re.search(r'((?:SW|RT)\d)上创建vlan(\d+)', it, re.I)
        if m:
            last_vlan[m.group(1).upper()] = m.group(2)
            checks.append((item, pts, 'vlan', {'dev': m.group(1).upper(), 'vid': m.group(2)}))
            continue
        m = re.search(r'((?:SW|RT)\d)上vlan改名为(\w+)', it, re.I)
        if m:
            checks.append((item, pts, 'vlan_name', {'dev': m.group(1).upper(), 'vid': last_vlan.get(m.group(1).upper()),
                                                    'name': m.group(2)}))
            continue
        m = re.search(r'((?:SW|RT)\d)端口(f\d+/\d+)划入vlan(\d*)', it, re.I)
        if m:
            dev = m.group(1).upper()
            checks.append((item, pts, 'access', {'dev': dev, 'if': m.group(2), 'vid': m.group(3) or last_vlan.get(dev)}))
            continue
        m = re.search(r'^((?:SW|RT)\d)(?:端口)?((?:f|fa|g|gi)\d+/\d+|vlan\d+):(\d+\.\d+\.\d+\.\d+)/(\d+)', it, re.I)
        if m:
            checks.append((item, pts, 'ip', {'dev': m.group(1).upper(), 'if': m.group(2), 'ip': m.group(3), 'prefix': m.group(4)}))
            continue
        if re.match(r'^PC\d', it, re.I):
            checks.append((item, pts, 'manual', {}))
            continue
        m = re.search(r'((?:SW|RT)\d)(?:互联接口)?开启trunk', it, re.I)
        if m:
            checks.append((item, pts, 'trunk', {'dev': m.group(1).upper()}))
            continue
        m = re.search(r'((?:SW|RT)\d)开启telnet.*?密码(\w+)', it, re.I)
        if m:
            checks.append((item, pts, 'telnet', {'dev': m.group(1).upper(), 'pw': m.group(2)}))
            continue
        m = re.search(r'((?:SW|RT)\d)设置特权密码(\w+)', it, re.I)
        if m:
            checks.append((item, pts, 'enable', {'dev': m.group(1).upper(), 'pw': m.group(2)}))
            continue
        m = re.search(r'((?:SW|RT)\d)(一|两|二|三|\d)?条?(?:静态)?路由', it, re.I)
        if m:
            n = m.group(2)
            n = CN_NUM.get(n, int(n) if n and n.isdigit() else None)
            checks.append((item, pts, 'route', {'dev': m.group(1).upper(), 'count': n, 'proto': proto}))
            continue
        checks.append((item, pts, 'manual', {}))
    return checks, plan, proto


# ====================================================================== 判分

def _dev(devs, name):
    d = devs.get(name)
    if d is None or not d.text.strip():
        return None
    return d


def run_check(kind, arg, devs, plan, manual_ok=False):
    if kind == 'manual':
        return manual_ok, '需要自查（配置里看不到 PC 的设置）' if manual_ok is False else '已自查确认'
    d = _dev(devs, arg.get('dev'))
    if d is None:
        return False, '没有粘贴 %s 的配置' % arg.get('dev')
    if kind == 'hostname':
        return (d.hostname or '').upper() == arg['dev'], '主机名：%s' % (d.hostname or '未设置')
    if kind == 'vlan':
        return d.has_vlan(arg['vid']), 'VLAN %s：%s' % (arg['vid'], '已创建' if d.has_vlan(arg['vid']) else '没找到（请同时粘贴 show vlan brief）')
    if kind == 'vlan_name':
        got = d.vlans.get(arg['vid'] or '')
        return (got or '').lower() == arg['name'].lower(), 'VLAN %s 名称：%s' % (arg['vid'], got or '未改名或未粘贴 show vlan brief')
    if kind == 'access':
        v = d.access_vlan(arg['if'])
        return v == arg['vid'], '%s 所属 VLAN：%s' % (arg['if'].upper(), v or '未划分')
    if kind == 'ip':
        want = (arg['ip'], _mask(arg['prefix']))
        got = d.ip_of(arg['if'])
        return want in got, '%s 地址：%s' % (arg['if'].upper(), '、'.join('%s %s' % x for x in got) or '未配置')
    if kind == 'trunk':
        tr = [n for n, i in d.interfaces.items() if any('switchport mode trunk' in l for l in i['lines'])]
        return bool(tr), 'Trunk 接口：%s' % ('、'.join(tr) or '无')
    if kind == 'telnet':
        ok = any(v['login'] and v['password'] == arg['pw'] for v in d.vty)
        desc = '、'.join('密码%s%s' % (v['password'] or '未设', '' if v['login'] else '（缺 login）') for v in d.vty) or '没有配置 line vty'
        return ok, 'telnet：%s' % desc
    if kind == 'enable':
        plain = [v for t, v, clear in d.enable if clear]
        secret = [t for t, v, clear in d.enable if not clear]
        if arg['pw'] in plain:
            return True, '特权密码：%s' % arg['pw']
        if secret:
            return True, '特权密码已设置（enable secret 已加密，无法核对内容）'
        return False, '特权密码：%s' % ('、'.join(plain) or '未设置')
    if kind == 'route':
        return check_route(d, arg, plan)
    return False, '未知检查'


def check_route(d, arg, plan):
    """返回 (得分比例, 说明)。静态路由：有效条数/要求条数；OSPF/RIP：宣告覆盖的直连网段比例。"""
    proto = arg.get('proto')
    nets = plan_networks(plan)
    conn = d.connected()
    if proto == 'static':
        need = [n for n in nets if n not in conn]
        good = []
        for net, mask, nh in d.routes:
            try:
                dst = _net(net, mask)
                hop = ipaddress.ip_address(nh)
            except ValueError:
                continue
            reachable = any(hop in c for c in conn)
            # 默认路由（0.0.0.0/0）也算一条有效静态路由
            if reachable and (dst in need or dst.prefixlen == 0) and dst not in good:
                good.append(dst)
        want = arg.get('count') or len(need)
        ratio = min(1.0, len(good) / float(want)) if want else 0
        return ratio, '有效静态路由 %d 条（要求 %d 条）：%s' % (len(good), want, '、'.join(str(x) for x in good) or '无')
    if proto in ('ospf', 'rip'):
        stmts = d.routers.get(proto)
        if stmts is None:
            return 0, '没有配置 router %s' % proto
        if not conn:
            return 0, '接口没有配置 IP，无法判断宣告'
        covered = [c for c in conn if any(_covers(s, c, proto) for s in stmts)]
        ratio = len(covered) / float(len(conn))
        return ratio, '%s 宣告了 %d/%d 个直连网段' % (proto.upper(), len(covered), len(conn))
    return (1.0 if d.routes or d.routers else 0), '路由：%s' % ('已配置' if d.routes or d.routers else '未配置')


def _covers(stmt, net, proto):
    parts = stmt.split()
    try:
        if proto == 'ospf':
            # network 192.168.1.0 0.0.0.255 area 0
            base = ipaddress.ip_address(parts[1])
            wild = int(ipaddress.ip_address(parts[2]))
            ip = int(net.network_address)
            return (ip & ~wild & 0xFFFFFFFF) == (int(base) & ~wild & 0xFFFFFFFF)
        # rip：network 192.168.1.0（有类）
        base = ipaddress.ip_address(parts[1])
        first = int(str(base).split('.')[0])
        prefix = 8 if first < 128 else (16 if first < 192 else 24)
        return net.subnet_of(ipaddress.ip_network('%s/%d' % (base, prefix), strict=False))
    except (ValueError, IndexError):
        return False


def grade(rubric, intro, configs, manual=None):
    """configs: {'SW1': 文本, ...}；manual: {条目序号: True}"""
    checks, plan, proto = build_checks(rubric, intro)
    devs = {k.upper(): Device(v) for k, v in (configs or {}).items()}
    out = []
    for i, (desc, pts, kind, arg) in enumerate(checks):
        ok, detail = run_check(kind, arg, devs, plan, manual_ok=bool((manual or {}).get(str(i)) or (manual or {}).get(i)))
        ratio = ok if isinstance(ok, float) else (1.0 if ok else 0.0)
        out.append({'desc': desc, 'points': pts, 'kind': kind, 'ok': ratio >= 0.999, 'score': round(pts * ratio, 2),
                    'detail': detail, 'manual': kind == 'manual'})
    return {'score': round(sum(c['score'] for c in out), 2), 'points': round(sum(c['points'] for c in out), 2),
            'protocol': proto, 'checks': out}
