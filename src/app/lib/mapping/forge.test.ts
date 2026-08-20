import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { adapterForVisualRoute, buildMappingDataPack, fallbackPlaceCandidates, gazetteerPlaceCandidates, normalizeModelCandidates, resolveVisualRoute, routePdfPage, stableMappingPackId, type ForgeBookMeta, type ForgePageEvidence, type ForgePlaceCandidate } from './forge';
import { validateDataPackDocument } from '../dataPack';

const meta: ForgeBookMeta = { title: '西湖游记', author: '测试作者', city: '杭州', era: '现代', purpose: '内容落地球', preferences: '水系' };
const page: ForgePageEvidence = { page: 3, route: 'structure', text: '午后沿着西湖缓步，随后经过断桥。' };

describe('Book-to-Earth Mapping forge', () => {
  it('keeps reliable PDF text layers and routes tiny layers to OCR', () => {
    expect(routePdfPage('这是一个包含足够正文字符并且可以可靠抽取的现代书籍页面。', 8)).toBe('structure');
    expect(routePdfPage('3', 1)).toBe('ocr');
  });

  it('only accepts model candidates that are verbatim in the cited page', () => {
    const candidates = normalizeModelCandidates([
      { nameAsWritten: '西湖', page: 3, context: '沿着西湖缓步', relation: 'scene' },
      { nameAsWritten: '灵隐寺', page: 3, context: '不存在的文本', relation: 'scene' },
    ], [page]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].name).toBe('西湖');
  });

  it('keeps ancient-book semantics while routing modern horizontal editions through the general OCR adapter', () => {
    expect(resolveVisualRoute({ material: 'general', textDomain: 'ancient-book' })).toBe('guji-modern');
    expect(adapterForVisualRoute('guji-modern')).toBe('general-ocr-vision');
    expect(resolveVisualRoute({ material: 'rubbing', textDomain: 'ancient-book' })).toBe('rubbing');
    expect(resolveVisualRoute({ material: 'general', textDomain: 'modern-document' })).toBe('general');
  });

  it('cleans model phrases into exact place names and rejects generic literary phrases', () => {
    const evidence: ForgePageEvidence = {
      page: 1,
      route: 'structure',
      text: '徜徉湖山。至宋名三贤堂。杜谦等增建仰高亭。绍兴十六年建四圣延祥观。林逋墓，在孤山之阴。',
    };
    const names = normalizeModelCandidates([
      { nameAsWritten: '徜徉湖山', page: 1 },
      { nameAsWritten: '名三贤堂', page: 1 },
      { nameAsWritten: '杜谦等增建仰高亭', page: 1 },
      { nameAsWritten: '绍兴十六年建四圣延祥观', page: 1 },
      { nameAsWritten: '孤山之阴', page: 1 },
    ], [evidence]).map((item) => item.name);
    expect(names).toEqual(['三贤堂', '仰高亭', '四圣延祥观', '孤山']);
  });

  it('recalls exact ancient place names and coordinates from the local gazetteer', () => {
    const evidence: ForgePageEvidence = {
      page: 20,
      route: 'structure',
      text: '即山之广化寺以祀公，建四圣延祥观而尽徙之，京尹袁韶复建于苏堤中。林逋墓，在孤山之阴。',
    };
    const names = gazetteerPlaceCandidates([evidence], [
      { city: '杭州', names: ['广化寺'], lat: 30.251, lng: 120.14, sourceTitle: '杭州城市古籍总地图' },
      { city: '杭州', names: ['四圣延祥观'], lat: 30.252, lng: 120.141, sourceTitle: '杭州城市古籍总地图' },
      { city: '杭州', names: ['苏堤'], lat: 30.241, lng: 120.139, sourceTitle: '杭州城市古籍总地图' },
      { city: '杭州', names: ['林逋墓'], lat: 30.254, lng: 120.138, sourceTitle: '杭州城市古籍总地图' },
      { city: '北京', names: ['广化寺'], lat: 39.9, lng: 116.4, sourceTitle: '北京古籍地图' },
    ], '杭州').map((item) => item.name);
    expect(names).toEqual(['广化寺', '四圣延祥观', '苏堤', '林逋墓']);
  });

  it('recalls the real West Lake Gazetteer names without sentence fragments', () => {
    const document = JSON.parse(readFileSync(new URL('../../../../public/assets/skills/guji/place-gazetteer.compact.json', import.meta.url), 'utf8'));
    const evidence: ForgePageEvidence = {
      page: 20,
      route: 'structure',
      text: '即山之广化寺以祀公。至宋，益以苏公、林公，名三贤堂。绍兴间，建四圣延祥观而尽徙之。京尹袁韶复建于苏堤中。林逋墓，在孤山之阴。',
    };
    const names = gazetteerPlaceCandidates([evidence], document.places, '杭州').map((item) => item.name);
    expect(names).toEqual(expect.arrayContaining(['三贤堂', '四圣延祥观', '苏堤', '林逋墓', '孤山']));
    expect(names).not.toEqual(expect.arrayContaining(['名三贤堂', '绍兴间建四圣延祥观', '孤山之阴']));
  });

  it('recovers OCR-corrupted ancient place names only when a same-book reference excerpt supports the correction', () => {
    const evidence: ForgePageEvidence = {
      page: 20,
      route: 'ocr',
      text: '即广山西之化寺以祀公。宋末，益以苏公、林公，名三贤堂。绍兴间，建四时祥观而尽徙之。京尹袁韶复建于苏城之中。杜谦等增建仰 高亭，居，寂然居。林逋墓，在凤山之阴。',
    };
    const reference = '即山之广化寺以祀公。至宋，益以苏公、林公，名三贤堂。绍兴间，建四圣延祥观而尽徙之。京尹袁韶复建于苏堤中。杜谦等增建仰高亭、巢居阁。林逋墓，在孤山之阴。';
    const places = ['广化寺', '三贤堂', '四圣延祥观', '苏堤', '仰高亭', '巢居阁', '林逋墓', '孤山'].map((name) => ({ city: '杭州', names: [name], sourceTitle: '西湖游览志', evidenceText: reference }));
    const names = gazetteerPlaceCandidates([evidence], places, '杭州', '《西湖游览志》现代横排扫描页').map((item) => item.name);
    expect(names).toHaveLength(8);
    expect(names).toEqual(expect.arrayContaining(['广化寺', '三贤堂', '四圣延祥观', '苏堤', '仰高亭', '巢居阁', '林逋墓', '孤山']));
    expect(gazetteerPlaceCandidates([evidence], places, '杭州', '无关书名').map((item) => item.name)).toEqual(['三贤堂', '仰高亭', '林逋墓']);
  });

  it('recovers route places from verb phrases and explicit lists without treating prose as a place', () => {
    const evidence: ForgePageEvidence = {
      page: 1,
      route: 'structure',
      text: '清晨从杭州断桥出发，沿白堤缓行至平湖秋月。路线顺序为：断桥、白堤、平湖秋月、西泠印社。',
    };
    const names = fallbackPlaceCandidates([evidence]).map((item) => item.name);
    expect(names).toEqual(expect.arrayContaining(['杭州断桥', '白堤', '平湖秋月', '断桥', '西泠印社']));
    expect(names).not.toContain('清晨从杭州断桥');
  });

  it('builds a deterministic, independently installable pocket.mapping/v1 pack', () => {
    const candidate: ForgePlaceCandidate = { id: 'claim-1', name: '西湖', page: 3, context: '午后沿着西湖缓步', relation: 'scene', confirmed: true, status: 'extant', lng: 120.148, lat: 30.245, resolutionSource: 'manual' };
    const source = { name: 'x.txt', sha256: 'a'.repeat(64) };
    const first = buildMappingDataPack(meta, [candidate], source, '2026-08-10T00:00:00.000Z');
    const second = buildMappingDataPack(meta, [candidate], source, '2026-08-10T00:00:00.000Z');
    expect(stableMappingPackId(meta, source.sha256)).toBe(second.identity.id);
    expect(first).toEqual(second);
    expect(validateDataPackDocument(first, 'mapping').inlineRecords).toHaveLength(1);
  });
});
