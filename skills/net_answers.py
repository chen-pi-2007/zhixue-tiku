# -*- coding: utf-8 -*-
"""网络技术方向技能卷（一）～（五）“网络组建”参考配置（Cisco Packet Tracer 命令）。
答案模式里展示；也是检查器的测试用例（按这里配置应得满分）。
三层交换机为 3560，路由器为 2811；在特权模式下 configure terminal 后依次输入。"""

ANSWERS = {}

ANSWERS['net-1'] = {
    'note': '全网静态路由。PC 地址按拓扑图自行配置。',
    'SW1': """hostname SW1
ip routing
vlan 10
 name zja
exit
interface FastEthernet0/3
 switchport mode access
 switchport access vlan 10
exit
interface FastEthernet0/2
 no switchport
 ip address 192.168.10.2 255.255.255.0
exit
interface Vlan10
 ip address 192.168.5.1 255.255.255.0
exit
ip route 192.168.11.0 255.255.255.0 192.168.10.1
ip route 192.168.12.0 255.255.255.0 192.168.10.1
ip route 192.168.6.0 255.255.255.0 192.168.10.1""",
    'SW2': """hostname SW2
ip routing
vlan 20
 name zjb
exit
interface FastEthernet0/3
 switchport mode access
 switchport access vlan 20
exit
interface FastEthernet0/1
 no switchport
 ip address 192.168.12.2 255.255.255.0
exit
interface Vlan20
 ip address 192.168.6.1 255.255.255.0
exit
ip route 192.168.10.0 255.255.255.0 192.168.12.1
ip route 192.168.11.0 255.255.255.0 192.168.12.1
ip route 192.168.5.0 255.255.255.0 192.168.12.1""",
    'RT1': """hostname RT1
enable password 467
interface FastEthernet0/0
 ip address 192.168.10.1 255.255.255.0
 no shutdown
exit
interface FastEthernet0/1
 ip address 192.168.11.1 255.255.255.0
 no shutdown
exit
ip route 192.168.5.0 255.255.255.0 192.168.10.2
ip route 192.168.12.0 255.255.255.0 192.168.11.2
ip route 192.168.6.0 255.255.255.0 192.168.11.2
line vty 0 4
 password 467
 login
exit""",
    'RT2': """hostname RT2
enable password 467
interface FastEthernet0/0
 ip address 192.168.11.2 255.255.255.0
 no shutdown
exit
interface FastEthernet0/1
 ip address 192.168.12.1 255.255.255.0
 no shutdown
exit
ip route 192.168.6.0 255.255.255.0 192.168.12.2
ip route 192.168.10.0 255.255.255.0 192.168.11.1
ip route 192.168.5.0 255.255.255.0 192.168.11.1
line vty 0 4
 password 467
 login
exit""",
}

ANSWERS['net-2'] = {
    'note': 'OSPF 路由（区域 0）。PC1：IP 192.168.1.10/24，网关 192.168.1.1；PC1 接 SW1 的 F0/2。',
    'SW1': """hostname SW1
enable password zjj
ip routing
vlan 10
exit
interface FastEthernet0/2
 switchport mode access
 switchport access vlan 10
exit
interface Vlan10
 ip address 192.168.1.1 255.255.255.0
exit
interface FastEthernet0/1
 no switchport
 ip address 192.168.10.2 255.255.255.0
exit
router ospf 1
 network 192.168.1.0 0.0.0.255 area 0
 network 192.168.10.0 0.0.0.255 area 0
exit
line vty 0 4
 password 123
 login
exit""",
    'RT1': """hostname RT1
enable password zjj
interface FastEthernet0/0
 ip address 192.168.10.1 255.255.255.0
 no shutdown
exit
interface FastEthernet0/1
 ip address 192.168.20.1 255.255.255.0
 no shutdown
exit
router ospf 1
 network 192.168.10.0 0.0.0.255 area 0
 network 192.168.20.0 0.0.0.255 area 0
exit""",
    'RT2': """hostname RT2
enable password zjj
interface FastEthernet0/0
 ip address 192.168.20.2 255.255.255.0
 no shutdown
exit
router ospf 1
 network 192.168.20.0 0.0.0.255 area 0
exit""",
}

ANSWERS['net-3'] = {
    'note': 'RIP 路由（version 2）。PC1：IP 192.168.2.10/24，网关 192.168.2.1；PC1 接 SW1 的 F0/2。',
    'SW1': """hostname SW1
enable password zjk
ip routing
vlan 20
exit
interface FastEthernet0/2
 switchport mode access
 switchport access vlan 20
exit
interface Vlan20
 ip address 192.168.2.1 255.255.255.0
exit
interface FastEthernet0/1
 no switchport
 ip address 192.168.10.2 255.255.255.0
exit
router rip
 version 2
 network 192.168.2.0
 network 192.168.10.0
exit""",
    'RT1': """hostname RT1
enable password zjk
interface FastEthernet0/0
 ip address 192.168.10.1 255.255.255.0
 no shutdown
exit
interface FastEthernet0/1
 ip address 192.168.30.1 255.255.255.0
 no shutdown
exit
router rip
 version 2
 network 192.168.10.0
 network 192.168.30.0
exit
line vty 0 4
 password 123
 login
exit""",
    'RT2': """hostname RT2
enable password zjk
interface FastEthernet0/0
 ip address 192.168.30.2 255.255.255.0
 no shutdown
exit
router rip
 version 2
 network 192.168.30.0
exit""",
}

ANSWERS['net-4'] = {
    'note': 'PC1 192.168.1.2/24、PC3 192.168.1.3/24（VLAN 100）；PC2 192.168.2.2/24、PC4 192.168.2.3/24（VLAN 200）。两台交换机 F0/1 互联做 Trunk。',
    'SW1': """hostname SW1
enable password zjjz
vlan 100
exit
vlan 200
exit
interface FastEthernet0/2
 switchport mode access
 switchport access vlan 100
exit
interface FastEthernet0/3
 switchport mode access
 switchport access vlan 200
exit
interface FastEthernet0/1
 switchport trunk encapsulation dot1q
 switchport mode trunk
exit""",
    'SW2': """hostname SW2
enable password zjjz
vlan 100
exit
vlan 200
exit
interface FastEthernet0/2
 switchport mode access
 switchport access vlan 100
exit
interface FastEthernet0/3
 switchport mode access
 switchport access vlan 200
exit
interface FastEthernet0/1
 switchport trunk encapsulation dot1q
 switchport mode trunk
exit
interface FastEthernet0/4
 no switchport
 ip address 192.168.3.2 255.255.255.0
exit""",
    'RT1': """hostname RT1
enable password zjjz
interface FastEthernet0/0
 ip address 192.168.3.1 255.255.255.0
 no shutdown
exit
line vty 0 4
 password 123
 login
exit""",
}

ANSWERS['net-5'] = {
    'note': 'OSPF 路由（区域 0）。PC1：192.168.1.2/24，网关 192.168.1.1（接 SW1 F0/1）；PC2：192.168.5.2/24，网关 192.168.5.1（接 SW2 F0/1）。',
    'SW1': """hostname SW1
enable password zjjz
ip routing
vlan 10
exit
interface FastEthernet0/1
 switchport mode access
 switchport access vlan 10
exit
interface Vlan10
 ip address 192.168.1.1 255.255.255.0
exit
interface FastEthernet0/2
 no switchport
 ip address 192.168.2.2 255.255.255.0
exit
router ospf 1
 network 192.168.1.0 0.0.0.255 area 0
 network 192.168.2.0 0.0.0.255 area 0
exit
line vty 0 4
 password 123
 login
exit""",
    'SW2': """hostname SW2
ip routing
vlan 20
exit
interface FastEthernet0/1
 switchport mode access
 switchport access vlan 20
exit
interface Vlan20
 ip address 192.168.5.1 255.255.255.0
exit
interface FastEthernet0/2
 no switchport
 ip address 192.168.4.2 255.255.255.0
exit
router ospf 1
 network 192.168.4.0 0.0.0.255 area 0
 network 192.168.5.0 0.0.0.255 area 0
exit""",
    'RT1': """hostname RT1
enable password zjjz
interface FastEthernet0/0
 ip address 192.168.2.1 255.255.255.0
 no shutdown
exit
interface FastEthernet0/1
 ip address 192.168.3.1 255.255.255.0
 no shutdown
exit
router ospf 1
 network 192.168.2.0 0.0.0.255 area 0
 network 192.168.3.0 0.0.0.255 area 0
exit""",
    'RT2': """hostname RT2
enable password zjjz
interface FastEthernet0/1
 ip address 192.168.3.2 255.255.255.0
 no shutdown
exit
interface FastEthernet0/0
 ip address 192.168.4.1 255.255.255.0
 no shutdown
exit
router ospf 1
 network 192.168.3.0 0.0.0.255 area 0
 network 192.168.4.0 0.0.0.255 area 0
exit""",
}
