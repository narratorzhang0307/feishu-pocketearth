import { describe, it, expect } from 'vitest';
import { matchDynasty, matchMuseum, eraOf, isValidDynastyKey, dynastyLabelOf } from './catalog';

// 锁住 R5 对抗式审查修的两个护栏（此前是 AI 审 AI，无运行时 ground truth；这里用测试证伪/证实）。

describe('matchDynasty · 单字键「新」护栏（R5）', () => {
  it('「新石器」不误吃成新朝', () => expect(matchDynasty('新石器时代彩陶')).toBeNull());
  it('「新莽/新朝/王莽」正确命中新朝', () => {
    expect(matchDynasty('新莽货泉')?.key).toBe('xin');
    expect(matchDynasty('新朝铜镜')?.key).toBe('xin');
    expect(matchDynasty('王莽改制时期')?.key).toBe('xin');
  });
});

describe('matchDynasty · 单字键「金」护栏（R5）', () => {
  it('鎏金/金缕玉衣/金银器/描金 都不误吃成金朝', () => {
    expect(matchDynasty('鎏金铜佛像')).toBeNull();
    expect(matchDynasty('金缕玉衣')).toBeNull();
    expect(matchDynasty('金银器一组')).toBeNull();
    expect(matchDynasty('描金漆奁')).toBeNull();
  });
  it('「金朝/金代/大金」正确命中金朝', () => {
    expect(matchDynasty('金朝铜镜')?.key).toBe('jin-jurchen');
    expect(matchDynasty('金代钧窑')?.key).toBe('jin-jurchen');
    expect(matchDynasty('大金货布')?.key).toBe('jin-jurchen');
  });
});

describe('matchDynasty · 长名先匹配 + 通用', () => {
  it('「东汉」不被「汉」误吃', () => expect(matchDynasty('东汉陶楼')?.key).toBe('eastern-han'));
  it('「南北朝」整体命中', () => expect(matchDynasty('南北朝造像碑')?.key).toBe('northern-southern'));
  it('「唐」命中', () => expect(matchDynasty('唐三彩骆驼')?.key).toBe('tang'));
  it('「明代」明确朝代语境命中', () => expect(matchDynasty('明代青花瓷')?.key).toBe('ming'));
  it('无朝代返回 null', () => expect(matchDynasty('一件青铜器')).toBeNull());
  it('空串返回 null', () => expect(matchDynasty('')).toBeNull());
});

describe('matchDynasty · 泛称汉宋护栏', () => {
  it('汉代 / 两汉 / 宋代 / 两宋 这些常见展签泛称可离线命中', () => {
    expect(matchDynasty('汉代陶俑')?.key).toBe('han');
    expect(matchDynasty('两汉画像砖')?.key).toBe('han');
    expect(matchDynasty('宋代建盏')?.key).toBe('song');
    expect(matchDynasty('两宋瓷器')?.key).toBe('song');
  });

  it('细分朝代仍优先于泛称', () => {
    expect(matchDynasty('西汉长信宫灯')?.key).toBe('western-han');
    expect(matchDynasty('东汉陶楼')?.key).toBe('eastern-han');
    expect(matchDynasty('北宋汝窑')?.key).toBe('northern-song');
    expect(matchDynasty('南宋官窑')?.key).toBe('southern-song');
  });

  it('汉白玉 / 武汉 / 仿宋 不误命中朝代', () => {
    expect(matchDynasty('汉白玉佛像')).toBeNull();
    expect(matchDynasty('武汉博物馆展品')).toBeNull();
    expect(matchDynasty('仿宋体说明牌')).toBeNull();
    expect(matchDynasty('古埃及文明展签')).toBeNull();
  });
});

describe('matchDynasty · 英文展签时代别名', () => {
  it('英文 dynasty / period 名称可离线命中年代轴', () => {
    expect(matchDynasty('Western Han dynasty jade burial suit')?.key).toBe('western-han');
    expect(matchDynasty('Tang dynasty sancai camel')?.key).toBe('tang');
    expect(matchDynasty('Hellenistic period marble sculpture')?.key).toBe('greece-hellenistic');
    expect(matchDynasty('Roman Empire glass vessel')?.key).toBe('rome-empire');
  });

  it('英文长别名优先于短别名', () => {
    expect(matchDynasty('Classical Greek period bronze head')?.key).toBe('greece-classical');
    expect(matchDynasty('Egyptian New Kingdom funerary mask')?.key).toBe('egypt-new');
  });
});

describe('matchMuseum · Met 词边界（R5）', () => {
  it('「Met」作为独立词命中大都会', () => expect(matchMuseum('去 Met 看展')?.city).toBe('纽约'));
  it('「Metropolitan Museum」命中大都会', () => expect(matchMuseum('Metropolitan Museum')?.city).toBe('纽约'));
  it('「Metal vessel」不误命中大都会', () => expect(matchMuseum('Metal vessel from Iran')).toBeNull());
  it('「Metro station」不误命中', () => expect(matchMuseum('Metro station nearby')).toBeNull());
});

describe('matchMuseum · CJK 别名 / 英文全称 / 边界', () => {
  it('中文别名命中', () => {
    expect(matchMuseum('国博')?.name).toBe('中国国家博物馆');
    expect(matchMuseum('陕历博')?.city).toBe('西安');
    expect(matchMuseum('大英博物馆')?.city).toBe('伦敦');
  });
  it('英文别名词边界命中', () => {
    expect(matchMuseum('Louvre')?.city).toBe('巴黎');
    expect(matchMuseum('British Museum')?.city).toBe('伦敦');
    expect(matchMuseum('National Museum of China')?.name).toBe('中国国家博物馆');
    expect(matchMuseum('Palace Museum')?.name).toBe('故宫博物院');
    expect(matchMuseum('National Palace Museum')?.name).toBe('国立故宫博物院');
    expect(matchMuseum('Shanghai Museum')?.name).toBe('上海博物馆');
    expect(matchMuseum('Tokyo National Museum')?.name).toBe('东京国立博物馆');
    expect(matchMuseum('Egyptian Museum')?.name).toBe('埃及博物馆');
  });
  it('无匹配 / 空串返回 null', () => {
    expect(matchMuseum('某个不存在的地方')).toBeNull();
    expect(matchMuseum('')).toBeNull();
  });
  it('通用短词不误命中第一个博物馆种子', () => {
    expect(matchMuseum('馆')).toBeNull();
    expect(matchMuseum('博物馆')).toBeNull();
    expect(matchMuseum('美术馆')).toBeNull();
  });
});

describe('朝代年表唯一事实源一致性', () => {
  it('eraOf 返回正确公元年', () => {
    expect(eraOf('tang')).toMatchObject({ start: 618, end: 907 });
    expect(eraOf('xin')).toMatchObject({ start: 9, end: 23 });
    expect(eraOf('han')).toMatchObject({ start: -202, end: 220 });
    expect(eraOf('song')).toMatchObject({ start: 960, end: 1279 });
  });
  it('isValidDynastyKey 校验合法/非法键', () => {
    expect(isValidDynastyKey('jin-jurchen')).toBe(true);
    expect(isValidDynastyKey('not-a-key')).toBe(false);
  });
  it('dynastyLabelOf 返回中文名', () => expect(dynastyLabelOf('jin-jurchen')).toBe('金'));
});
