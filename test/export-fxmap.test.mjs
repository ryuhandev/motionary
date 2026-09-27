// Regresi audit efek: id AM harus memetakan ke implementasi yang BENAR
// (bukan fallback exposure / alias kategori salah), dan param penting
// tidak boleh hilang.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { __testHooks } from '../public/js/preset.js';

const { mapFxId, mapParamKey, normalizeBlend, fontStackFor, shapeKindOf } = __testHooks;

describe('mapFxId — tidak ada lagi alias kategori salah', () => {
  const cases = [
    ['com.alightcreative.effects.fade', 'fade'],
    ['com.alightcreative.effects.spinblur', 'spinblur'],
    ['com.alightcreative.effects.spinblur2', 'spinblur2'],
    ['com.alightcreative.effects.stretchsegment', 'stretchsegment'],
    ['com.alightcreative.effects.pulsate', 'pulsate'],
    ['com.alightcreative.effects.pulsate2', 'pulsate2'],
    ['com.alightcreative.effects.transform', 'transform'],
    ['com.alightcreative.effects.offset', 'offset'],
    ['com.alightcreative.effects.oscillate', 'oscillate'],
    ['com.alightcreative.effects.oscillate2', 'oscillate2'],
    ['com.alightcreative.effects.oscillate3', 'oscillate3'],
    ['com.alightcreative.effect.shakeparts', 'shake-parts'],
    ['com.alightcreative.effects.move-along-path', 'move-along-path'],
    ['com.alightcreative.effect.movealongpath2', 'move-along-path2'],
    ['com.alightcreative.effects.transform', 'transform'],
    // yang sudah benar harus tetap benar:
    ['com.alightcreative.effects.swing', 'swing'],
    ['com.alightcreative.effects.swing2', 'swing2'],
    ['com.alightcreative.effects.shake2', 'shake2'],
    ['com.alightcreative.effects.spin', 'spin'],
    ['com.alightcreative.effects.tile', 'tile'],
    ['com.alightcreative.effects.exposure', 'exposure'],
    ['com.alightcreative.effects.blink2', 'blink2'],
  ];
  for (const [raw, want] of cases) {
    it(`${raw} -> ${want}`, () => assert.equal(mapFxId(raw), want));
  }
  it('pulse-opacity varian hyphen', () => {
    assert.equal(mapFxId('com.alightcreative.effects.pulse-opacity'), 'pulse-opacity');
    assert.equal(mapFxId('com.alightcreative.effects.pulseopacity2'), 'pulse-opacity2');
  });
  it('tak dikenal tetap fallback exposure', () => {
    assert.equal(mapFxId('com.alightcreative.effects.zxcunknown'), 'exposure');
  });
});

describe('mapParamKey — param penting tidak hilang/tertabrakan', () => {
  it('fade memakai inTime/outTime (bukan inms)', () => {
    assert.equal(mapParamKey('fade', 'inTime'), 'inMs');
    assert.equal(mapParamKey('fade', 'outTime'), 'outMs');
  });
  it('swirl3 centerPoint tidak menimpa strength', () => {
    assert.equal(mapParamKey('swirl3', 'centerPoint'), 'center');
    assert.equal(mapParamKey('swirl3', 'strength'), 'strength');
  });
  it('pulsate & spinblur & stretchsegment lengkap', () => {
    assert.equal(mapParamKey('pulsate', 'minsize'), 'minsize');
    assert.equal(mapParamKey('spinblur', 'cx'), 'cx');
    assert.equal(mapParamKey('stretchsegment', 'smooth'), 'smooth');
    assert.equal(mapParamKey('offset', 'feather'), 'feather');
    assert.equal(mapParamKey('transform', 'alpha'), 'alpha');
    assert.equal(mapParamKey('shake-parts', 'magnitude'), 'mag');
  });
});

describe('mapFxId — colorize/colorhot id sendiri', () => {
  it('bukan exposure', () => {
    assert.equal(mapFxId('com.alightcreative.effects.colorize'), 'colorize');
    assert.equal(mapFxId('com.alightcreative.effects.colorhot'), 'colorhot');
  });
});

describe('normalizeBlend — blending preset tidak hilang', () => {
  it('linear-dodge preset -> add', () => {
    assert.equal(normalizeBlend('linear-dodge'), 'add');
    assert.equal(normalizeBlend('normal'), 'normal');
    assert.equal(normalizeBlend(null), 'normal');
    assert.equal(normalizeBlend('multiply'), 'multiply');
    assert.equal(normalizeBlend('overlay'), 'overlay');
    assert.equal(normalizeBlend('sesuatu-aneh'), 'normal');
  });
});

describe('fontStackFor — attr font AM', () => {
  it('googlefonts name+weight', () => {
    const f = fontStackFor('googlefonts?name=Roboto&weight=400');
    assert.equal(f.family, 'Roboto');
    assert.equal(f.weight, 400);
    assert.ok(f.stack.includes('Roboto'));
  });
  it('kosong -> sans-serif aman', () => {
    const f = fontStackFor('');
    assert.ok(f.stack.includes('sans-serif'));
  });
});

describe('shapeKindOf — varian shape AM', () => {
  it('dikenal lolos, asing -> rect', () => {
    assert.equal(shapeKindOf('.rect'), 'rect');
    assert.equal(shapeKindOf('.roundrect'), 'roundrect');
    assert.equal(shapeKindOf('.moon'), 'moon');
    assert.equal(shapeKindOf('.teardrop'), 'teardrop');
    assert.equal(shapeKindOf('.stamp'), 'stamp');
    assert.equal(shapeKindOf('.sesuatu'), 'rect');
    assert.equal(shapeKindOf(null), 'rect');
  });
});
