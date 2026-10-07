import type { FSAdapter } from './fs'
import type { FileInfo } from '../types'

/**
 * 内存文件系统：File System Access API 不可用时的兜底实现（演示模式）。
 * 接口与 WebFSAdapter 完全一致，业务层零改动；数据只存在于当前会话。
 */
export class MemoryFSAdapter implements FSAdapter {
  private files: Map<string, string>
  private binFiles: Map<string, Uint8Array>

  constructor(seed?: Record<string, string>) {
    this.files = new Map(Object.entries(seed ?? {}))
    this.binFiles = new Map()
  }

  async readFile(path: string): Promise<string> {
    const text = this.files.get(path)
    if (text === undefined) throw new Error(`文件不存在：${path}`)
    return text
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.assertName(path)
    this.files.set(path, content)
  }

  async listDir(path: string): Promise<FileInfo[]> {
    const prefix = path ? `${path}/` : ''
    const seen = new Set<string>()
    const out: FileInfo[] = []
    for (const key of this.files.keys()) {
      if (prefix && !key.startsWith(prefix)) continue
      const rest = key.slice(prefix.length)
      const seg = rest.split('/')[0]
      if (!seg || seen.has(seg)) continue
      seen.add(seg)
      out.push({
        name: seg,
        path: prefix + seg,
        kind: rest.includes('/') ? 'dir' : 'file',
      })
    }
    out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'zh-CN') : a.kind === 'dir' ? -1 : 1))
    return out
  }

  async exists(path: string): Promise<boolean> {
    if (this.files.has(path)) return true
    const prefix = `${path}/`
    for (const key of this.files.keys()) if (key.startsWith(prefix)) return true
    return false
  }

  async createFile(path: string, content = ''): Promise<void> {
    await this.writeFile(path, content)
  }

  async createDir(_path: string): Promise<void> {
    /* 内存实现无需真实目录 */
  }

  async delete(path: string): Promise<void> {
    this.files.delete(path)
    const prefix = `${path}/`
    for (const key of [...this.files.keys()]) if (key.startsWith(prefix)) this.files.delete(key)
  }

  async rename(path: string, newName: string): Promise<void> {
    const content = this.files.get(path)
    if (content === undefined) throw new Error(`文件不存在：${path}`)
    const target = path.split('/').slice(0, -1).concat(newName).join('/')
    this.files.delete(path)
    this.files.set(target, content)
  }

  /** 拦截非法文件名，提前给出可读错误 */
  private assertName(path: string): void {
    const seg = path.split('/').filter(Boolean).pop() ?? ''
    if (/[\\:*?"<>|]/.test(seg) || seg === '.' || seg === '..') {
      throw new Error(`名称包含非法字符：${seg}`)
    }
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const bin = this.binFiles.get(path)
    if (bin) return bin
    const text = this.files.get(path)
    if (text === undefined) throw new Error(`文件不存在：${path}`)
    return new TextEncoder().encode(text)
  }

  async writeBinary(path: string, data: Uint8Array): Promise<void> {
    this.assertName(path)
    this.binFiles.set(path, data)
    this.files.delete(path)
  }
}

/** 演示项目种子（「星海纪元」示例，含大纲 / 章节 / 人物 / 随笔） */
export function demoProjectFiles(projectName = '星海纪元'): Record<string, string> {
  return {
    'project.json': JSON.stringify({ name: projectName, createdAt: Date.now(), schema: 1 }, null, 2),
    'outline.md': [
      `# ${projectName} · 剧情大纲`,
      '',
      '## 卷一 · 起源',
      '',
      '### 序章 · 坠落',
      '- 逃生舱坠入废港，林霁失去记忆',
      '- 捡到旧时代铜币（伏笔：信标钥匙）',
      '',
      '### 第一章 · 陌生的星空',
      '- 结识拾荒者老周，学会拆解废船',
      '- 义肢的来历第一次被提及',
      '',
      '### 第二章 · 雨夜追踪',
      '- 雨夜被追踪，被迫进入七号船坞',
      '- 发现船坞里沉睡着完整星舰',
      '',
      '## 卷二 · 深空',
      '',
      '- （待展开…）',
      '',
    ].join('\n'),
    'chapters/序章 · 坠落.md': [
      '# 序章 · 坠落',
      '',
      '雨是从傍晚开始下的，到夜里已经织成了一张密不透风的网。林霁把外套的领子竖起来，沿着废港的栈桥往深处走，皮鞋踩在锈铁板上，几乎没有声音。',
      '',
      '身后三百米，那盏灰色的灯又出现了。',
      '',
      '她数过，这是今晚第四次。第一次她以为是错觉，第二次她换了条路，第三次她在转角等了整整五分钟——灯没有出现，可当她重新上路，它又像影子一样缀了上来。',
      '',
      '「监察官的狗鼻子，比我想的灵。」她在心里冷笑，右手义肢的指节一根根收紧。',
      '',
      '栈桥尽头是七号船坞，吊机的轮廓在雨幕里像一头蹲伏的巨兽。林霁闪身躲进集装箱的阴影，从口袋里摸出那枚旧时代的铜币——那是她唯一记得的、属于「从前」的东西。',
      '',
      '脚步声近了。雨声，更近了。',
      '',
      '她忽然意识到，对方根本不是想抓住她。对方是想把她赶进船坞。',
      '',
    ].join('\n'),
    'chapters/第一章 · 陌生的星空.md': [
      '# 第一章 · 陌生的星空',
      '',
      '七号船坞的铁门比想象中轻。',
      '',
      '林霁侧身挤进去的时候，铜币在掌心烫了一下。船坞中央沉着一艘星舰，龙骨完好，舷窗被海盐糊成毛玻璃——废港的人叫它「鲸落」，没人相信它还能飞。',
      '',
      '「第一次见？」黑暗里有人开口，「三个月了，只有你会站在它正对面看。」',
      '',
    ].join('\n'),
    'notes/灵感碎片.md': '# 灵感碎片\n\n- 铜币：旧时代的钥匙，信标的另一半\n- 雨夜 = 追踪的天然幕布\n- 「鲸落」星舰：卷二的主要舞台\n',
    'notes/追逐戏写法笔记.md': [
      '# 追逐戏的三层紧张感',
      '',
      '① 听觉遮蔽——让环境音盖过脚步，制造感知盲区。雨夜、集市、机房都适用。',
      '',
      '② 感官碎片——每 3-4 句插入一次嗅觉/触觉：铁锈味、后颈的冷、掌心的汗。',
      '',
      '③ 句式切割——长句全部切成 10 字以内短句；段落结尾用单句独立成段收束。',
      '',
      '—— 由 2 段 AI 会话总结生成（2026-10-07），可继续编辑；归档后转为只读资料。',
      '',
    ].join('\n'),
    'notes/卷二伏笔清单.md': '# 卷二伏笔清单\n\n- 铜币与信标的对应关系要在卷二前三分之一揭示\n- 沈聿"认识失忆前的林霁"：先给闪回，不给答案\n- 鲸落号的唤醒条件：铜币 + 旧时代船坞权限\n',
    'notes/林霁语气样本.md': '# 林霁语气样本\n\n- 短句，冷幽默，自我保护式的轻描淡写\n- 对"从前"的话题一律用物件转移（铜币、义肢）\n',
    'characters/林霁.md': [
      '# 林霁',
      '',
      '姓名: 林霁',
      '角色: 主角',
      '身份: 前星港工程师 · 拾荒者',
      '标签: 冷静、右手义肢、怀旧音乐',
      '',
      '失忆后以打捞废弃飞船为生。铜币是她与「从前」唯一的联系，也是信标的钥匙。',
      '',
    ].join('\n'),
    'characters/沈聿.md': [
      '# 沈聿',
      '',
      '姓名: 沈聿',
      '角色: 反派',
      '身份: 信标管理局 · 监察官',
      '标签: 优雅、危险',
      '',
      '追捕信标多年，似乎认识失忆前的林霁。追捕更像一场漫长的试探。',
      '',
    ].join('\n'),
    'characters/老周.md': '# 老周\n\n姓名: 老周\n角色: 配角\n身份: 废港拾荒者头目\n标签: 世故、护短\n\n教林霁拆船的人，收留过很多「从海上来的人」。\n',
  }
}
