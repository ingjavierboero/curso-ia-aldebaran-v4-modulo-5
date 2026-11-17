import { parseBoundedText } from '../shared/boundedText.js';
import { InvalidIibb, InvalidIssuerText } from './errors.js';

export const ISSUER_TEXT_MAX_LENGTH = 200;
export const IIBB_MAX_LENGTH = 50;

/** Razón social de la empresa emisora: trim, de 1 a 200 caracteres (S-01); si no, `InvalidIssuerText`. */
export function parseIssuerLegalName(raw: string): string {
  return parseBoundedText(
    raw,
    ISSUER_TEXT_MAX_LENGTH,
    () => new InvalidIssuerText('La razón social de la empresa emisora debe tener entre 1 y 200 caracteres'),
  );
}

/** Domicilio comercial: trim, de 1 a 200 caracteres (S-01); si no, `InvalidIssuerText`. */
export function parseIssuerAddress(raw: string): string {
  return parseBoundedText(
    raw,
    ISSUER_TEXT_MAX_LENGTH,
    () => new InvalidIssuerText('El domicilio comercial debe tener entre 1 y 200 caracteres'),
  );
}

/** Nombre de fantasía: trim, de 1 a 200 caracteres (S-01); si no, `InvalidIssuerText`. */
export function parseIssuerTradeName(raw: string): string {
  return parseBoundedText(
    raw,
    ISSUER_TEXT_MAX_LENGTH,
    () => new InvalidIssuerText('El nombre de fantasía debe tener entre 1 y 200 caracteres'),
  );
}

/** Número de ingresos brutos: texto libre, trim, de 1 a 50 caracteres (D-03, D-07); si no, `InvalidIibb`. */
export function parseIibb(raw: string): string {
  return parseBoundedText(raw, IIBB_MAX_LENGTH, () => new InvalidIibb());
}
