// 中英同行展签标题（国内馆常见排版，OCR 常按版面合行）：取 CJK 前缀作中文标题。
// 真实案例来自中国丝绸博物馆丝路特展批量整理现场失败（2026-07-05）。
import { describe, it, expect } from 'vitest';
import { pickLabelTitle } from './sense';

describe('pickLabelTitle · 中英同行标题取 CJK 前缀', () => {
  it('「康业相墓志 Epitaph of Kang Yexiang」同行 → 康业相墓志（而非错捡年代行）', () => {
    expect(pickLabelTitle('康业相墓志 Epitaph of Kang Yexiang\n唐贞观十四年（640年）\n吐鲁番交河沟西墓地出土\n吐鲁番博物馆藏')).toBe('康业相墓志');
  });
  it('长标题带（仿制件）后缀同样取全 CJK 段', () => {
    expect(pickLabelTitle('龟兹苏幕遮乐舞图木质舍利盒（仿制件） Wooden Reliquary with the Kucha Sumozhe Music-and-Dance Scene (Facsimile)\n原件苏巴什佛寺遗址出土')).toBe('龟兹苏幕遮乐舞图木质舍利盒（仿制件）');
  });
  it('三字短标题「毗陀山 Wood-carved Mountain」也命中', () => {
    expect(pickLabelTitle('毗陀山 Wood-carved Mountain\n魏晋（220-420年）\n库车市苏巴什佛寺遗址出土')).toBe('毗陀山');
  });
  it('中英分行的展签行为不变（青铜爵）', () => {
    expect(pickLabelTitle('青铜爵\nBronze Jue (Wine Vessel)\n商代晚期（公元前13世纪—前11世纪）')).toBe('青铜爵');
  });
  it('标题行后的朝代混排行不抢标题（真实展签排版：标题在前）', () => {
    expect(pickLabelTitle('绿釉人面贴塑三耳陶罐 Green-glazed Three-lugged Pottery Jar\n唐 Tang dynasty\n新和县博物馆藏')).toBe('绿釉人面贴塑三耳陶罐');
  });
});
