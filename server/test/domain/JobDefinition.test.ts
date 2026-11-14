import { describe, expect, it } from 'vitest';
import { DuplicateJobName, InvalidJobDefinition } from '../../src/domain/health/errors.js';
import { JobCatalog } from '../../src/domain/health/JobCatalog.js';
import { JobDefinition, JOB_NAME_MAX_LENGTH } from '../../src/domain/health/JobDefinition.js';

describe('JobDefinition', () => {
  it('JobDefinition recorta el nombre y conserva el intervalo', () => {
    const def = new JobDefinition({ name: '  facturacion ', intervalMs: 60_000 });

    expect(def.name).toBe('facturacion');
    expect(def.intervalMs).toBe(60_000);
  });

  // AC-08: intervalo menor o igual a cero (y no entero) se rechaza
  it('test_intervalo_invalido_rechazado', () => {
    expect(() => new JobDefinition({ name: 'facturacion', intervalMs: 0 })).toThrow(InvalidJobDefinition);
    expect(() => new JobDefinition({ name: 'facturacion', intervalMs: -1 })).toThrow(InvalidJobDefinition);
    expect(() => new JobDefinition({ name: 'facturacion', intervalMs: 1.5 })).toThrow(InvalidJobDefinition);
    expect(() => new JobDefinition({ name: 'facturacion', intervalMs: Number.NaN })).toThrow(InvalidJobDefinition);
    expect(() => new JobDefinition({ name: 'facturacion', intervalMs: Number.POSITIVE_INFINITY })).toThrow(
      InvalidJobDefinition,
    );
    expect(new JobDefinition({ name: 'facturacion', intervalMs: 1 }).intervalMs).toBe(1);
  });

  it('JobDefinition rechaza un nombre vacío o de más de 64 caracteres', () => {
    expect(() => new JobDefinition({ name: '', intervalMs: 1000 })).toThrow(InvalidJobDefinition);
    expect(() => new JobDefinition({ name: '   ', intervalMs: 1000 })).toThrow(InvalidJobDefinition);
    expect(() => new JobDefinition({ name: 'x'.repeat(JOB_NAME_MAX_LENGTH + 1), intervalMs: 1000 })).toThrow(
      InvalidJobDefinition,
    );
    expect(new JobDefinition({ name: 'x'.repeat(JOB_NAME_MAX_LENGTH), intervalMs: 1000 }).name).toHaveLength(64);
  });
});

describe('JobCatalog', () => {
  // AC-07: un nombre ya registrado se rechaza y el catálogo queda igual
  it('test_nombre_duplicado_rechazado', () => {
    const catalog = new JobCatalog();
    const original = new JobDefinition({ name: 'facturacion', intervalMs: 60_000 });
    catalog.register(original);

    expect(() => {
      catalog.register(new JobDefinition({ name: ' facturacion ', intervalMs: 5_000 }));
    }).toThrow(DuplicateJobName);

    expect(catalog.list()).toEqual([original]);
    expect(catalog.find('facturacion')?.intervalMs).toBe(60_000);
  });

  it('JobCatalog lista en orden de registro y find devuelve null para un nombre desconocido', () => {
    const catalog = new JobCatalog();
    const a = new JobDefinition({ name: 'a', intervalMs: 1 });
    const b = new JobDefinition({ name: 'b', intervalMs: 2 });
    catalog.register(a);
    catalog.register(b);

    expect(catalog.list().map((d) => d.name)).toEqual(['a', 'b']);
    expect(catalog.find('b')).toBe(b);
    expect(catalog.find('c')).toBeNull();
    // list devuelve una copia: mutarla no cambia el catálogo
    catalog.list().pop();
    expect(catalog.list()).toHaveLength(2);
  });
});
