import { test, expect } from '@playwright/test';
import { tamanoPaginaImpresion, type FormatoImpresion } from '../src/utils/formatoImpresion';

// CSS parser and PDF engine real; no physical printer or Safari acceptance.
for (const [formato, width] of [['A4', 595.28], ['ROLLO_80MM', 226.77], ['ROLLO_58MM', 164.41]] as const) {
  test(`impresión ${formato}: navegador acepta tamaño CSS y genera ancho correcto`, async ({ page }) => {
    const size = tamanoPaginaImpresion(formato as FormatoImpresion, 3);
    await page.setContent(`<style>@page { size: ${size}; margin: 0; }</style><p>Documento de prueba</p>`);
    expect(await page.evaluate(() => (document.styleSheets[0].cssRules[0] as CSSPageRule).style.getPropertyValue('size'))).not.toBe('');
    const pdf = await page.pdf({ preferCSSPageSize: true });
    const box = pdf.toString('latin1').match(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/);
    expect(box).not.toBeNull();
    expect(Math.abs(Number(box![1]) - width)).toBeLessThan(1);
    expect(Number(box![2])).toBeGreaterThan(0);
  });
}
